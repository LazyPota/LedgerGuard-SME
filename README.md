# LedgerGuard SME — backend

Deterministic, fail-closed finance copilot for SME cash-flow and invoice fraud.
Built for the 2026 Shenzhen FinTech competition, Topic E.

The rule is simple: **the model never touches money.** LLM output is confined to
extraction, everything financial is `Decimal` arithmetic in code you can test.

## What it does

1. Ingests invoice documents as untrusted data (never as instructions).
2. Extracts strict-schema fields deterministically from structured payloads.
   The shipped build makes no LLM calls; extraction is the only AI-shaped
   boundary, so there is no model anywhere near payment decisions.
3. Reconciles invoice ↔ purchase order ↔ goods receipt, checks the vendor
   allowlist and the claimed IBAN, and runs three layers of duplicate detection.
4. Prices early-payment discounts as APR/EAR and simulates 30 days of cash
   against a payroll floor.
5. Routes the result through five permission tiers. Tier 2 bounded auto-pay,
   Tier 3 human approval with an HMAC-bound token, Tier 4 hard block.
6. Executes against a local simulated ledger with idempotency keys and ACID
   post-state verification.
7. Writes every decision to an append-only, SHA-256 hash-chained audit log.

## Layout

```
backend/app/
  api/          FastAPI routers (invoices, treasury, approvals, audit)
  engine/       reconciliation, risk detection, working capital
  extraction/   untrusted-document sanitizer + deterministic extractor
  execution/    SQLite sandbox ledger
  security/     policy guard (tiers), audit chain
  fixtures/     five benchmark scenarios
  state.py      ingestion orchestration and treasury views
backend/scripts/ seed_demo_data, generate_evidence, verify_audit_chain
backend/tests/  62 deterministic tests
src/contracts/  frontend TypeScript contract (source of truth)
```

## Quickstart (offline, no keys)

```bash
uv sync
uv run pytest -q
uv run uvicorn backend.app.main:app --reload --port 8000
```

Open http://localhost:8000/docs. No network and no API key are required; the
offline extractor refuses to guess when structured fields are missing
(`OFFLINE_STRUCTURED_PAYLOAD_REQUIRED`).

Reproduce the submission evidence:

```bash
uv run python -m backend.scripts.generate_evidence
uv run python -m backend.scripts.verify_audit_chain --db evidence/sandbox_ledger.db
```

This writes `evidence/sandbox_execution_log.jsonl`,
`evidence/forensic_audit_log.jsonl`, `evidence/benchmark_metrics.json`, and
`evidence/test_results.txt` from real runs.

## API (prefix `/api/v1`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | mode, policy version, DB + chain status |
| POST | `/invoices/ingest` | ingest benchmark batch or one uploaded JSON invoice |
| POST | `/invoices/audit-batch` | alias accepting explicit invoice payloads |
| GET | `/invoices` | all invoice records |
| GET | `/invoices/{invoice_id}` | one record |
| GET | `/treasury/summary` | 30-day trajectory, floor, facilities |
| GET | `/cash-forecast` | trajectory only |
| POST | `/working-capital/optimize` | schedule + trajectory + net savings |
| POST | `/approvals/{action_id}/decide` | Tier 3 human decision |
| POST | `/executions/trigger-tier2-auto` | bounded Tier 2 execution |
| POST | `/execution/run` | token-bound Tier 3 execution |
| GET | `/executions` | execution receipts |
| GET | `/audit/envelopes` | forensic envelopes |
| GET | `/audit/verify` | verify chain |
| POST | `/audit/verify-chain` | verify chain |

## Invariants enforced in code and tests

- Money and rates are `Decimal`; JSON carries them as strings. No floats.
- `2/10 Net-30` → APR `37.24%`, EAR `44.59%` (ACT/365 simple discount).
- Liquidity is simulated day by day; a credit bridge is drawn only when the
  payroll floor would otherwise be breached, and must keep `B_t >= B_min`.
- Tier 2 requires: match verified, no risk flags, amount ≤ `2500.00`, daily
  total ≤ `5000.00`, and post-payment 30-day minimum cash ≥ floor.
- Tier 3 requires a human token bound to action id, payload digest, amount,
  IBAN tail, and approver. Any mismatch is rejected.
- Duplicate, injection, or IBAN-swap evidence is Tier 4: no execution path.
- Execution is idempotent; replay returns `IDEMPOTENT_REPLAY_NOOP` with the
  original receipt and does not move cash.
- Audit envelopes chain by SHA-256; the SQLite table rejects `UPDATE`/`DELETE`
  via triggers. Tampering is detected at verification time.

## Measured performance

Actual numbers from the latest evidence run on the build machine (see
`evidence/benchmark_metrics.json` for the full record and environment):

| Operation | p50 | p95 |
|---|---|---|
| 3-way reconciliation | ~0.09 ms | ~0.09 ms |
| 30-day cash projection | ~1.5 ms | ~2.1 ms |
| Liquidity evaluation (4 strategies) | ~5.1 ms | ~7.3 ms |

These are local wall-clock measurements, not vendor benchmarks. Rerun
`generate_evidence` to reproduce on your hardware.

## Honest limitations

- The ledger is a local SQLite simulation. It does not move real money and does
  not prove bank account ownership; it proves the decision and post-state math.
- PO/GRN/vendor masters are in-process fixtures, not a live ERP integration.
- The default HMAC secret is a development placeholder. Override
  `APPROVAL_SIGNING_SECRET` before any shared deployment.
- Tier 2 is demonstrated with a feasible-cash seed: under the contractual
  scenario the baseline itself dips below the `50,000` floor, so the same
  invoice correctly fails closed to Tier 3.

## Configuration

Copy `.env.example` to `.env`. Everything has a safe default; nothing is
required for offline mode.
