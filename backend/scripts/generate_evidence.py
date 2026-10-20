"""Generate reproducible submission evidence.

Runs the real pipeline, writes JSONL logs, verifies the audit chain, measures
actual latency (no invented numbers), and captures real pytest output.

Usage:
    uv run python -m backend.scripts.generate_evidence
"""

from __future__ import annotations

import json
import os
import platform
import statistics
import subprocess
import sys
import time
import tracemalloc
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from backend.app.engine.reconciliation import reconcile_invoice
from backend.app.fixtures.benchmark import (
    CASH_INFLOWS,
    CASH_OUTFLOWS,
    CREDIT_FACILITIES,
    GRNS,
    INVOICE_DOCUMENTS,
    POS,
    START_DATE,
    VENDORS,
    extract_fixture,
)
from backend.app.schemas.contracts import SubmitApprovalDecisionRequest
from backend.app.state import AppState, reset_state

EVIDENCE = Path("evidence")


def _fresh_env(db: str, cash: str | None = None) -> None:
    path = Path(db)
    for suffix in ("", "-wal", "-shm"):
        candidate = Path(str(path) + suffix)
        if candidate.exists():
            candidate.unlink()
    os.environ["LEDGERGUARD_DB_PATH"] = db
    if cash is None:
        os.environ.pop("LEDGERGUARD_STARTING_CASH", None)
    else:
        os.environ["LEDGERGUARD_STARTING_CASH"] = cash
    reset_state()


def _measure(fn, iterations: int) -> dict:
    samples: list[float] = []
    tracemalloc.start()
    for _ in range(iterations):
        start = time.perf_counter()
        fn()
        samples.append((time.perf_counter() - start) * 1000)
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    samples.sort()
    return {
        "iterations": iterations,
        "mean_ms": round(statistics.fmean(samples), 4),
        "p50_ms": round(statistics.median(samples), 4),
        "p95_ms": round(samples[max(0, int(len(samples) * 0.95) - 1)], 4),
        "peak_memory_kb": round(peak / 1024, 2),
    }


def _append(log, entry: dict) -> None:
    log.write(json.dumps(entry, default=str) + "\n")


def main() -> int:
    EVIDENCE.mkdir(exist_ok=True)
    records: list = []
    by_id: dict = {}
    sandbox_log_path = EVIDENCE / "sandbox_execution_log.jsonl"
    audit_log_path = EVIDENCE / "forensic_audit_log.jsonl"

    with sandbox_log_path.open("w", encoding="utf-8") as sandbox_log:
        # --- Main scenario (contract cash: 77,200 / 50,000 floor) ----------
        _fresh_env("evidence/sandbox_ledger.db")
        state = AppState()
        duplicate = INVOICE_DOCUMENTS[0].model_copy(
            update={"document_id": "INV-2026-101-DUP", "file_name": "dup-inv-101.json"}
        )
        records = state.ingest_documents([*INVOICE_DOCUMENTS, duplicate])
        by_id = {record.invoice_id: record for record in records}

        for record in records:
            _append(
                sandbox_log,
                {
                    "event": "INVOICE_INGESTED",
                    "scenario": {
                        "INV-2026-101": "NORMAL_DISCOUNT_WITH_CREDIT_BRIDGE",
                        "INV-2026-102": "QUARANTINED_OVERBILL",
                        "INV-2026-103": "MISSING_GRN_ATTESTATION",
                        "INV-2026-104": "BLOCKED_ASI01_PROMPT_INJECTION_IBAN_SWAP",
                        "INV-2026-105": "LOW_VALUE_CANDIDATE",
                        "INV-2026-101-DUP": "DUPLICATE_REPLAY_INVOICE",
                    }.get(record.invoice_id, "CUSTOM"),
                    "invoice_id": record.invoice_id,
                    "operational_state": record.operational_state,
                    "permission_tier": record.permission_tier,
                    "match_status": record.three_way_match.reconciliation_findings.overall_match_status,
                    "strategy": record.liquidity_decision.recommended_strategy,
                    "gross_discount": str(record.liquidity_decision.gross_discount_amount),
                    "net_benefit": str(record.liquidity_decision.net_economic_benefit),
                    "bridge_draw": str(record.liquidity_decision.bridge_draw_amount),
                    "security_flags": sorted(
                        {
                            flag.owasp_id
                            for flag in record.three_way_match.reconciliation_findings.security_flags
                        }
                    ),
                },
            )

        approval = state.decide(
            "ACT-INV-2026-101",
            SubmitApprovalDecisionRequest(
                approval_id="ACT-INV-2026-101",
                invoice_id="INV-2026-101",
                decision="APPROVE_EXECUTION",
                approver_id="mgr_01",
                approver_role="FINANCE_MANAGER",
                confirmed_total_amount=Decimal("39200.00"),
                confirmed_iban_tail="4829",
                reviewer_notes="Evidence run: verified against PO-2026-881 and GRN-2026-402.",
                idempotency_key="evidence-approval-101",
            ),
        )
        _append(
            sandbox_log,
            {
                "event": "HITL_APPROVED",
                "invoice_id": "INV-2026-101",
                "approval_status": approval.approval_status,
                "approver": "mgr_01",
            },
        )
        receipt = state.execute(
            invoice_id="INV-2026-101",
            idempotency_key="evidence-exec-101",
            approval_token=approval.approval_token,
        )
        _append(
            sandbox_log,
            {
                "event": "EXECUTION",
                "invoice_id": "INV-2026-101",
                "execution_mode": "LOCAL_SIMULATED_LEDGER",
                **receipt.model_dump(mode="json"),
            },
        )
        replay = state.execute(
            invoice_id="INV-2026-101",
            idempotency_key="evidence-exec-101",
            approval_token=approval.approval_token,
        )
        _append(
            sandbox_log,
            {
                "event": "IDEMPOTENT_REPLAY",
                "invoice_id": "INV-2026-101",
                "status": replay.status,
                "execution_id": replay.execution_id,
            },
        )

        for blocked_id in ("INV-2026-102", "INV-2026-104", "INV-2026-101-DUP"):
            try:
                state.execute(
                    invoice_id=blocked_id,
                    idempotency_key=f"evidence-denied-{blocked_id}",
                    approval_token=None,
                )
                outcome = "UNEXPECTEDLY_EXECUTED"
            except Exception as exc:  # noqa: BLE001 - evidence records the denial reason
                outcome = f"DENIED:{type(exc).__name__}"
            _append(
                sandbox_log,
                {"event": "EXECUTION_BLOCKED", "invoice_id": blocked_id, "outcome": outcome},
            )

        chain = state.verify_chain()
        _append(
            sandbox_log,
            {
                "event": "AUDIT_CHAIN_VERIFIED",
                "message": chain.message,
                "envelopes_verified": chain.envelopes_verified,
                "head_hash": chain.head_hash,
            },
        )

        with audit_log_path.open("w", encoding="utf-8") as audit_log:
            for envelope in state.audit.envelopes(state.tenant_id):
                audit_log.write(envelope.model_dump_json() + "\n")

        chain_summary = {
            "message": chain.message,
            "envelopes_verified": chain.envelopes_verified,
            "head_hash": chain.head_hash,
            "chain_valid": chain.valid,
        }
        state.close()

        # --- Tier 2 autonomous execution on feasible cash ------------------
        _fresh_env("evidence/tier2_ledger.db", cash="150000.00")
        tier2_state = AppState()
        tier2_state.ingest_documents(list(INVOICE_DOCUMENTS))
        tier2_record = tier2_state.invoices["INV-2026-105"]
        tier2_receipt = tier2_state.execute(
            invoice_id="INV-2026-105",
            idempotency_key="evidence-tier2-105",
            approval_token=None,
        )
        _append(
            sandbox_log,
            {
                "event": "TIER2_AUTONOMOUS_EXECUTION",
                "scenario": "FEASIBLE_CASH_150000",
                "invoice_id": "INV-2026-105",
                "permission_tier": tier2_record.permission_tier,
                "execution_mode": "LOCAL_SIMULATED_LEDGER",
                **tier2_receipt.model_dump(mode="json"),
            },
        )
        tier2_state.close()

    # --- Benchmarks (measured, not estimated) ------------------------------
    outcome = extract_fixture(INVOICE_DOCUMENTS[0])
    po = POS[outcome.invoice.referenced_po_id]
    grn = GRNS[po.po_id]
    vendor = VENDORS[outcome.invoice.vendor_id_claimed]
    from backend.app.engine.working_capital import evaluate_liquidity, simulate_cash

    metrics = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "environment": {
            "python": platform.python_version(),
            "platform": platform.platform(),
        },
        "three_way_reconciliation": _measure(
            lambda: reconcile_invoice(outcome, po, grn, vendor), 50
        ),
        "cash_flow_projection_30d": _measure(
            lambda: simulate_cash(
                start_date=START_DATE,
                starting_cash=Decimal("77200.00"),
                payroll_floor=Decimal("50000.00"),
                inflows=CASH_INFLOWS,
                outflows=CASH_OUTFLOWS,
                payments=(),
                horizon_days=30,
            ),
            100,
        ),
        "liquidity_evaluation": _measure(
            lambda: evaluate_liquidity(
                invoice=outcome.invoice,
                match_status="VERIFIED_ELIGIBLE",
                start_date=START_DATE,
                starting_cash=Decimal("77200.00"),
                payroll_floor=Decimal("50000.00"),
                inflows=CASH_INFLOWS,
                outflows=CASH_OUTFLOWS,
                facility=CREDIT_FACILITIES[0],
            ),
            50,
        ),
    }
    (EVIDENCE / "benchmark_metrics.json").write_text(
        json.dumps(metrics, indent=2), encoding="utf-8"
    )

    # --- Real test runner output ------------------------------------------
    os.environ.pop("LEDGERGUARD_DB_PATH", None)
    os.environ.pop("LEDGERGUARD_STARTING_CASH", None)
    reset_state()
    completed = subprocess.run(
        [sys.executable, "-m", "pytest", "--color=no"],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    (EVIDENCE / "test_results.txt").write_text(
        completed.stdout + completed.stderr, encoding="utf-8"
    )

    print("=== LedgerGuard evidence ===")
    for record in records:
        print(
            f"{record.invoice_id}: state={record.operational_state} "
            f"tier={record.permission_tier} strategy={record.liquidity_decision.recommended_strategy}"
        )
    print(f"audit: {chain_summary['message']} envelopes={chain_summary['envelopes_verified']}")
    print(f"benchmark reconciliation p95: {metrics['three_way_reconciliation']['p95_ms']} ms")
    print(f"benchmark cash-flow p95: {metrics['cash_flow_projection_30d']['p95_ms']} ms")
    print(f"benchmark liquidity p95: {metrics['liquidity_evaluation']['p95_ms']} ms")
    print(f"tests: {'PASS' if completed.returncode == 0 else 'FAIL'}")
    return 0 if completed.returncode == 0 and chain_summary["chain_valid"] else 1


if __name__ == "__main__":
    sys.exit(main())
