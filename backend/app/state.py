"""Application state: ingestion pipeline, actions, treasury views.

Deliberately a single small orchestrator. The deterministic engine stays in
``engine/``; this module only sequences it and records evidence.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from backend.app.config import get_settings
from backend.app.engine.reconciliation import reconcile_invoice
from backend.app.engine.risk_detector import InvoiceFingerprint, detect_duplicate
from backend.app.engine.working_capital import (
    CashEvent,
    SimulationResult,
    evaluate_liquidity,
    simulate_cash,
)
from backend.app.execution.ledger_sandbox import LedgerSandbox, PaymentRequest
from backend.app.extraction.extractor import extract_invoice
from backend.app.fixtures.benchmark import (
    CASH_INFLOWS,
    CASH_OUTFLOWS,
    CREDIT_FACILITIES,
    GRNS,
    INVOICE_DOCUMENTS,
    PAYROLL_AMOUNT,
    PAYROLL_DATE,
    PAYROLL_FLOOR,
    POS,
    STARTING_CASH,
    START_DATE,
    VENDORS,
)
from backend.app.schemas.contracts import (
    ApprovalDecisionResponse,
    CreditFacilityRecord,
    DailyCashPoint,
    ExecutionReceipt,
    InvoiceRecord,
    LiquidityDecisionRecord,
    RawInvoiceDocument,
    StagedPaymentPlan,
    SubmitApprovalDecisionRequest,
    TreasurySummaryResponse,
    VerifyChainResponse,
)
from backend.app.schemas.domain import RiskFlag, VendorMaster, to_money
from backend.app.security.audit_chain import AuditChain
from backend.app.security.policy_guard import (
    approval_payload_digest,
    evaluate_payment_policy,
    issue_approval_token,
    verify_approval_token,
)


class PolicyDenied(RuntimeError):
    pass


class UnknownInvoice(RuntimeError):
    pass


class ApprovalInvalid(RuntimeError):
    pass


@dataclass
class ActionState:
    action_id: str
    invoice_id: str
    payload_digest: str
    amount: Decimal
    iban_last4: str
    approved_by: str | None = None
    rejected: bool = False


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _document_hash(document: RawInvoiceDocument) -> str:
    canonical = json.dumps(
        {"file": document.file_name, "text": document.raw_text, "payload": document.structured_payload},
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return _sha256(canonical)


class AppState:
    def __init__(self) -> None:
        settings = get_settings()
        self.settings = settings
        self.tenant_id = settings.tenant_id
        db_path = os.environ.get("LEDGERGUARD_DB_PATH", settings.database_path)
        self.starting_cash = Decimal(os.environ.get("LEDGERGUARD_STARTING_CASH", STARTING_CASH))
        self.ledger = LedgerSandbox(db_path)
        self.ledger.initialize(cash=self.starting_cash, tenant_id=self.tenant_id)
        self.audit = AuditChain(db_path)
        self.invoices: dict[str, InvoiceRecord] = {}
        self.actions: dict[str, ActionState] = {}
        self._fingerprints: list[InvoiceFingerprint] = []
        for document in INVOICE_DOCUMENTS:
            self.ledger.seed_invoice(tenant_id=self.tenant_id, invoice_id=document.document_id)

    def close(self) -> None:
        self.ledger.close()
        self.audit.close()

    # -- ingestion ---------------------------------------------------------
    def ingest_documents(self, documents: list[RawInvoiceDocument]) -> list[InvoiceRecord]:
        records = [self._process(document) for document in documents]
        return records

    def _process(self, document: RawInvoiceDocument) -> InvoiceRecord:
        outcome = extract_invoice(document, offline_deterministic=True)
        invoice = outcome.invoice
        document_hash = _document_hash(document)

        vendor = VENDORS.get(invoice.vendor_id_claimed)
        security_findings = list(outcome.security_findings)
        if vendor is None:
            vendor = VendorMaster(
                vendor_id=invoice.vendor_id_claimed,
                legal_name=invoice.vendor_name_claimed,
                iban=invoice.iban_claimed,
                is_allowlisted=False,
            )
            from backend.app.schemas.contracts import SecurityFinding

            security_findings.append(
                SecurityFinding(
                    owasp_id="BEC_IBAN_SWAP",
                    trigger_excerpt_escaped="Unknown vendor presented an unverified beneficiary account.",
                    policy_rule_id="POLICY_VENDOR_MASTER_ALLOWLIST",
                    action_taken="Quarantined. Only Vendor Master allowlisted beneficiaries may be paid.",
                )
            )
            outcome = outcome.model_copy(update={"security_findings": security_findings})

        po = POS.get(invoice.referenced_po_id)
        grn = GRNS.get(invoice.referenced_po_id) if po is not None else None
        match = reconcile_invoice(outcome, po, grn, vendor)

        risk_flags = [flag.value for flag in outcome.risk_flags]
        fingerprint = InvoiceFingerprint(
            invoice_id=document.document_id,
            document_sha256=document_hash,
            vendor_id=invoice.vendor_id_claimed,
            vendor_name=invoice.vendor_name_claimed,
            invoice_number=outcome.invoice_number or document.document_id,
            issue_date=date.fromisoformat(invoice.issue_date),
            total=invoice.total_claimed,
        )
        duplicate = detect_duplicate(fingerprint, self._fingerprints)
        if duplicate.blocked:
            risk_flags.append("DUPLICATE_ARTIFACT_HASH")
        elif duplicate.code == "SUSPECTED_SEMANTIC_DUPLICATE":
            risk_flags.append("SUSPECTED_SEMANTIC_DUPLICATE")
        self._fingerprints.append(fingerprint)

        status = match.reconciliation_findings.overall_match_status
        if duplicate.blocked:
            risk_flags.append("DUPLICATE_CANONICAL_ID")
            status = "BLOCKED_DUPLICATE"

        liquidity = evaluate_liquidity(
            invoice=invoice,
            match_status=status,
            start_date=START_DATE,
            starting_cash=self.ledger.get_cash(self.tenant_id),
            payroll_floor=Decimal(PAYROLL_FLOOR),
            inflows=CASH_INFLOWS,
            outflows=CASH_OUTFLOWS,
            facility=CREDIT_FACILITIES[0],
        )

        policy = evaluate_payment_policy(
            amount=(
                liquidity.discounted_payment_amount
                if liquidity.recommended_strategy.startswith("CAPTURE")
                else liquidity.nominal_invoice_amount
            ),
            match_status=status,
            risk_flags=risk_flags,
            daily_auto_spent=Decimal("0.00"),
            post_action_min_cash=liquidity.post_action_min_30d_cash,
            payroll_floor=Decimal(PAYROLL_FLOOR),
            credit_draw=liquidity.bridge_draw_amount,
        )

        if policy.tier == "TIER_2_BOUNDED_AUTO":
            operational_state = "STAGED_TIER_2_ELIGIBLE"
        elif policy.tier == "TIER_3_HITL_REQUIRED":
            operational_state = "PENDING_HITL_TIER_3"
        elif policy.tier == "TIER_4_FORBIDDEN":
            operational_state = "BLOCKED_SECURITY_VIOLATION"
        elif status == "QUARANTINED_DISCREPANCY":
            operational_state = "BLOCKED_DISCREPANCY"
        else:
            operational_state = "PROPOSED"

        record = InvoiceRecord(
            invoice_id=document.document_id,
            invoice_number=outcome.invoice_number or document.document_id,
            document_sha256=document_hash,
            operational_state=operational_state,
            permission_tier=policy.tier,
            extraction=invoice,
            three_way_match=match,
            liquidity_decision=liquidity,
        )
        self.invoices[record.invoice_id] = record
        if policy.tier in ("TIER_2_BOUNDED_AUTO", "TIER_3_HITL_REQUIRED"):
            self._stage_action(record)

        envelope = self.audit.append(
            tenant_id=self.tenant_id,
            input_document_sha256=document_hash,
            actor_identity="agent:deterministic-pipeline-v1",
            permission_tier=policy.tier,
            opa_policy_verdict=policy.verdict,
            three_way_match_summary={
                "invoice_id": record.invoice_id,
                "match_status": status,
                "delta": str(match.reconciliation_findings.computed_total),
                "risk_flags": risk_flags,
            },
            working_capital_optimization_summary={
                "strategy": liquidity.recommended_strategy,
                "net_benefit": str(liquidity.net_economic_benefit),
            },
            sandbox_execution_verification={"status": "AWAITING_EXECUTION"},
        )
        return record

    def _stage_action(self, record: InvoiceRecord) -> None:
        decision = record.liquidity_decision
        amount = (
            decision.discounted_payment_amount
            if decision.recommended_strategy.startswith("CAPTURE")
            else decision.nominal_invoice_amount
        )
        action_id = f"ACT-{record.invoice_id}"
        digest = approval_payload_digest(
            {
                "action_id": action_id,
                "invoice_id": record.invoice_id,
                "amount": str(amount),
                "iban_last4": record.extraction.iban_claimed[-4:],
            }
        )
        self.actions[action_id] = ActionState(
            action_id=action_id,
            invoice_id=record.invoice_id,
            payload_digest=digest,
            amount=amount,
            iban_last4=record.extraction.iban_claimed[-4:],
        )

    # -- approvals ---------------------------------------------------------
    def decide(self, action_id: str, request: SubmitApprovalDecisionRequest) -> ApprovalDecisionResponse:
        action = self.actions.get(action_id)
        if action is None:
            raise KeyError(action_id)
        if to_money(request.confirmed_total_amount) != action.amount:
            raise ApprovalInvalid("confirmed amount does not match staged payload")
        if request.confirmed_iban_tail != action.iban_last4:
            raise ApprovalInvalid("confirmed IBAN tail does not match approved beneficiary")
        if request.invoice_id != action.invoice_id:
            raise ApprovalInvalid("invoice does not match staged action")

        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).isoformat()
        if request.decision == "REJECT_AND_QUARANTINE":
            action.rejected = True
            return ApprovalDecisionResponse(
                action_id=action_id, approval_status="REJECTED", timestamp_utc=now
            )
        if request.decision == "ESCALATE_VENDOR_DISPUTE":
            return ApprovalDecisionResponse(
                action_id=action_id, approval_status="ESCALATED", timestamp_utc=now
            )

        action.approved_by = request.approver_id
        token = issue_approval_token(
            secret=self.settings.approval_signing_secret,
            action_id=action_id,
            payload_sha256=action.payload_digest,
            amount=action.amount,
            iban_last4=action.iban_last4,
            approver_id=request.approver_id,
        )
        self.audit.append(
            tenant_id=self.tenant_id,
            input_document_sha256=next(
                (r.document_sha256 for r in self.invoices.values() if r.invoice_id == action.invoice_id), ""
            ),
            actor_identity=f"human:{request.approver_id}",
            permission_tier="TIER_3_HITL_REQUIRED",
            opa_policy_verdict="ALLOW_WITH_VALID_HUMAN_SIGNATURE",
            three_way_match_summary={"invoice_id": action.invoice_id, "decision": request.decision},
            working_capital_optimization_summary={"amount": str(action.amount)},
            sandbox_execution_verification={"status": "HITL_APPROVED"},
        )
        return ApprovalDecisionResponse(
            action_id=action_id, approval_status="APPROVED", approval_token=token, timestamp_utc=now
        )

    # -- execution ---------------------------------------------------------
    def execute(
        self, *, invoice_id: str, idempotency_key: str, approval_token: str | None
    ) -> ExecutionReceipt:
        replay = self.ledger.execution_by_key(idempotency_key)
        if replay is not None:
            return replay

        record = self.invoices.get(invoice_id)
        if record is None:
            raise UnknownInvoice(invoice_id)
        tier = record.permission_tier
        if tier in ("TIER_0_READ", "TIER_1_STAGING", "TIER_4_FORBIDDEN"):
            raise PolicyDenied(f"{tier} cannot execute payments")

        action = self.actions[f"ACT-{invoice_id}"]
        if tier == "TIER_3_HITL_REQUIRED":
            if not approval_token or not action.approved_by:
                raise PolicyDenied("Tier 3 execution requires a valid human approval token")
            valid = verify_approval_token(
                token=approval_token,
                secret=self.settings.approval_signing_secret,
                action_id=action.action_id,
                payload_sha256=action.payload_digest,
                amount=action.amount,
                iban_last4=action.iban_last4,
                approver_id=action.approved_by,
            )
            if not valid:
                raise PolicyDenied("approval token does not bind to this payload")

        decision = record.liquidity_decision
        credit = (
            decision.bridge_draw_amount
            if decision.recommended_strategy == "CAPTURE_EARLY_DISCOUNT_WITH_CREDIT_BRIDGE"
            else Decimal("0.00")
        )
        receipt = self.ledger.pay(
            PaymentRequest(
                tenant_id=self.tenant_id,
                invoice_id=invoice_id,
                action_id=action.action_id,
                idempotency_key=idempotency_key,
                amount=decision.discounted_payment_amount,
                credit_draw=credit,
                trace_id=f"trc-exec-{invoice_id}",
            )
        )
        self.audit.append(
            tenant_id=self.tenant_id,
            input_document_sha256=record.document_sha256,
            actor_identity="agent:ledger-sandbox-v1",
            permission_tier=tier,
            opa_policy_verdict=(
                "ALLOW" if tier == "TIER_2_BOUNDED_AUTO" else "ALLOW_WITH_VALID_HUMAN_SIGNATURE"
            ),
            three_way_match_summary={"invoice_id": invoice_id, "match_status": "VERIFIED_ELIGIBLE"},
            working_capital_optimization_summary={
                "strategy": decision.recommended_strategy,
                "amount": str(receipt.disbursed_amount),
                "credit_draw": str(receipt.credit_drawn_amount),
            },
            sandbox_execution_verification={
                "execution_id": receipt.execution_id,
                "status": receipt.status,
                "pre_balance": str(receipt.pre_execution_cash_balance),
                "post_balance": str(receipt.post_execution_cash_balance),
                "verified": receipt.post_state_invariant_verified,
            },
        )
        return receipt

    # -- treasury ----------------------------------------------------------
    def _trajectory(self, payments: list[CashEvent], bridge: Decimal) -> SimulationResult:
        return simulate_cash(
            start_date=START_DATE,
            starting_cash=self.starting_cash,
            payroll_floor=Decimal(PAYROLL_FLOOR),
            inflows=CASH_INFLOWS,
            outflows=CASH_OUTFLOWS,
            payments=tuple(payments),
            bridge_amount=bridge,
            bridge_day=10 if bridge > 0 else None,
            bridge_rate=Decimal(CREDIT_FACILITIES[0]["annual_rate"]),
            horizon_days=30,
        )

    def _facility_records(self, recommended: str | None) -> list[CreditFacilityRecord]:
        records = []
        for facility in CREDIT_FACILITIES:
            limit = Decimal(facility["facility_limit"])
            drawn = Decimal(facility["current_drawn"])
            records.append(
                CreditFacilityRecord(
                    facility_id=facility["facility_id"],
                    name=facility["name"],
                    facility_type=facility["facility_type"],
                    credit_limit=limit,
                    available_capacity=limit - drawn,
                    apr_pct=Decimal(facility["annual_rate"]) * Decimal("100"),
                    drawdown_fee_pct=Decimal(facility["origination_fee_pct"]) * Decimal("100"),
                    covenant_current_ratio_min=Decimal(facility["min_current_ratio"]),
                    current_ratio_actual=Decimal(facility["current_ratio"]),
                    covenant_compliant=(
                        Decimal(facility["current_ratio"]) >= Decimal(facility["min_current_ratio"])
                    ),
                    recommended_by_optimizer=facility["facility_id"] == recommended,
                )
            )
        return records

    def treasury_summary(self) -> TreasurySummaryResponse:
        verified = [
            r
            for r in self.invoices.values()
            if r.permission_tier in ("TIER_2_BOUNDED_AUTO", "TIER_3_HITL_REQUIRED")
        ]
        payments = [
            CashEvent(
                day=10 if r.liquidity_decision.recommended_strategy.startswith("CAPTURE") else 30,
                amount=r.liquidity_decision.discounted_payment_amount,
                label=f"{r.invoice_id} payment",
            )
            for r in verified
            if r.liquidity_decision.recommended_strategy.startswith("CAPTURE")
        ]
        bridge = sum(
            (
                r.liquidity_decision.bridge_draw_amount
                for r in verified
                if r.liquidity_decision.recommended_strategy.endswith("CREDIT_BRIDGE")
            ),
            Decimal("0.00"),
        )
        optimized = self._trajectory(payments, bridge)
        baseline = self._trajectory([], Decimal("0.00"))
        facility = next(
            (
                r.liquidity_decision.matched_credit_facility_id
                for r in verified
                if r.liquidity_decision.matched_credit_facility_id
            ),
            None,
        )
        quarantined = [r for r in self.invoices.values() if r.permission_tier == "TIER_1_STAGING"]
        savings = sum(
            (r.liquidity_decision.net_economic_benefit for r in verified),
            Decimal("0.00"),
        )
        return TreasurySummaryResponse(
            currency="USD",
            current_cash_balance=self.ledger.get_cash(self.tenant_id),
            payroll_reserve_floor=Decimal(PAYROLL_FLOOR),
            next_payroll_date=PAYROLL_DATE,
            next_payroll_amount=Decimal(PAYROLL_AMOUNT),
            min_projected_30d_cash_baseline=baseline.min_cash,
            min_projected_30d_cash_optimized=optimized.min_cash,
            total_verified_payables_30d=sum(
                (r.liquidity_decision.nominal_invoice_amount for r in verified), Decimal("0.00")
            ),
            total_quarantined_payables=sum(
                (r.liquidity_decision.nominal_invoice_amount for r in quarantined), Decimal("0.00")
            ),
            net_30d_discount_savings_available=savings,
            daily_cash_trajectory=optimized.points,
            credit_facilities=self._facility_records(facility),
        )

    def optimize(self, invoice_ids: list[str], horizon_days: int = 30, floor: Decimal | None = None) -> dict[str, Any]:
        payments: list[CashEvent] = []
        schedule: list[StagedPaymentPlan] = []
        net = Decimal("0.00")
        bridge = Decimal("0.00")
        for invoice_id in invoice_ids or list(self.invoices):
            record = self.invoices.get(invoice_id)
            if record is None or record.permission_tier not in (
                "TIER_2_BOUNDED_AUTO",
                "TIER_3_HITL_REQUIRED",
            ):
                continue
            decision = record.liquidity_decision
            if decision.recommended_strategy.startswith("CAPTURE"):
                payments.append(
                    CashEvent(day=10, amount=decision.discounted_payment_amount, label=invoice_id)
                )
                bridge += decision.bridge_draw_amount
                net += decision.net_economic_benefit
                schedule.append(
                    StagedPaymentPlan(
                        invoice_id=invoice_id,
                        payment_date=decision.selected_payment_date,
                        amount=decision.discounted_payment_amount,
                        strategy=decision.recommended_strategy,
                        matched_credit_facility_id=decision.matched_credit_facility_id,
                        requires_human_approval=record.permission_tier == "TIER_3_HITL_REQUIRED",
                    )
                )
        trajectory = simulate_cash(
            start_date=START_DATE,
            starting_cash=self.starting_cash,
            payroll_floor=floor or Decimal(PAYROLL_FLOOR),
            inflows=CASH_INFLOWS,
            outflows=CASH_OUTFLOWS,
            payments=tuple(payments),
            bridge_amount=bridge,
            bridge_day=10 if bridge > 0 else None,
            bridge_rate=Decimal(CREDIT_FACILITIES[0]["annual_rate"]),
            horizon_days=horizon_days,
        )
        return {
            "schedule": schedule,
            "daily_cash_trajectory": trajectory.points,
            "selected_financing": None,
            "net_savings": net,
        }

    def verify_chain(self) -> VerifyChainResponse:
        return self.audit.verify(self.tenant_id)


_STATE: AppState | None = None


def get_state() -> AppState:
    global _STATE
    if _STATE is None:
        _STATE = AppState()
    return _STATE


def reset_state() -> None:
    global _STATE
    if _STATE is not None:
        _STATE.close()
    _STATE = None
