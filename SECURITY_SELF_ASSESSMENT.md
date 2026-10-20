# Security self-assessment — LedgerGuard SME

Scope: the backend in this repository. Date: 2026-10-20. Policy version 2026.1.

This is a self-assessment, not a third-party audit. It states what is enforced,
how it is tested, and what remains out of scope.

## 1. Assets and trust boundaries

| Asset | Protection |
|---|---|
| Payment authority | No code path pays without passing `evaluate_payment_policy` and a tier check |
| Approver identity | HMAC-SHA256 token bound to action, payload digest, amount, IBAN tail, approver |
| Cash post-state | ACID transaction plus independent post-state reconciliation |
| Decision evidence | Append-only SHA-256 hash chain with DB-level UPDATE/DELETE triggers |
| Vendor bank details | Vendor Master allowlist; claimed IBAN compared to master; mismatch is BEC |
| Document content | Treated as untrusted data; never concatenated into an instruction context |

Trust boundaries: HTTP request → Pydantic strict validation; document payload →
sanitizer/extractor; engine → policy guard; policy guard → ledger; ledger →
audit chain. Each boundary fails closed.

## 2. OWASP ASI coverage (what this build addresses)

| Threat | Control | Evidence |
|---|---|---|
| ASI01 goal hijack / prompt injection | Document text wrapped in `<untrusted_document_data>`; regex scanner for instruction patterns; findings force Tier 4; no tool-calling model exists in the payment path | `extraction/sanitizer.py`, INV-2026-104 fixture, E2E test asserts `BLOCKED_SECURITY_VIOLATION` |
| ASI02 tool misuse | No payment tool is exposed to a model. Execution is a typed internal call gated by tier; Tier 3 requires a human token; Tier 4 has no execution branch | `security/policy_guard.py`, `state.execute`, tests assert 403 |
| ASI03 identity and privilege abuse | Five explicit tiers (read, staging, bounded auto, HITL, forbidden); approver role is schema-constrained to finance/treasury roles and the approver identity is bound into the token; token verification fails on any field mismatch | `policy_guard.py`, `test_phase5_policy_ledger.py` |
| ASI06 memory poisoning | No persistent agent memory. State is per-process; durable records are typed invoices and audit envelopes | `state.py` |
| ASI09 human-agent trust | Tier 3 approval is explicit, payload-bound, and replayable in the audit log; UI shows exact amount and IBAN tail for confirmation | approval endpoints + tests for wrong amount / wrong tail |
| BEC / IBAN swap | Allowlist + exact IBAN comparison; mismatch is a blocking finding, not a warning | `risk_detector.verify_beneficiary`, INV-2026-104 |

Not applicable or not claimed: ASI04 supply chain beyond pinned `uv.lock` and
standard dependencies; ASI05 code execution (no generated code is run); ASI07
inter-agent comms (single agent, no inter-agent protocol); ASI08 cascading
failures limited to per-request failure (no retry storm); ASI10 rogue agents
(no autonomous goal loop).

## 3. Permission tiers

| Tier | Capability | Gate |
|---|---|---|
| 0 | Read-only summaries | none |
| 1 | Staging / proposal only | no execution |
| 2 | Bounded auto-pay | match verified, no flags, ≤ 2,500.00 single, ≤ 5,000.00 daily, post-payment 30-day min ≥ payroll floor |
| 3 | Human-in-the-loop | valid HMAC token bound to action id, payload digest, amount, IBAN tail, approver |
| 4 | Forbidden | injection, duplicate, IBAN mismatch, failed reconciliation |

The engine denies by default; every tier decision is recorded with reasons.

## 4. Audit chain properties

- Each envelope commits to the prior envelope hash; genesis is 64 zeros.
- Hash is SHA-256 over canonical JSON (sorted keys, no whitespace) excluding
  `current_envelope_hash`.
- SQLite triggers `audit_no_update` and `audit_no_delete` abort mutation.
- Verification recomputes every envelope, checks stored hashes and links, and
  names the first broken trace.
- Tests prove: intact chain verifies; edited envelope is detected; `DELETE` is
  rejected by the database.

What this does **not** prove: that the process was not compromised before
writing, that the host clock is honest, or that a bank account belongs to the
vendor. It proves internal consistency of the decision record.

## 5. Financial correctness controls

- `Decimal` only for money, rates, and quantities; strict JSON string
  serialization at the API boundary.
- Discount math: `2/10 Net-30` → APR 37.24%, EAR 44.59%.
- Cash bridge is drawn only on the first day the payroll floor would break,
  sized to the maximum deficit, and simulated day by day.
- Ledger writes use `BEGIN IMMEDIATE`, a unique idempotency key, and a
  post-state invariant check. Replays return `IDEMPOTENT_REPLAY_NOOP`.
- Concurrency storm test asserts no double-spend.

## 6. Residual risks (accepted for a competition prototype)

1. `APPROVAL_SIGNING_SECRET` defaults to a dev placeholder. Any shared
   deployment must override it; no secret rotation is implemented.
2. The ledger is a local SQLite simulation. It does not contact a bank, and the
   evidence log must not be read as proof of real settlement.
3. PO/GRN/vendor masters are in-process fixtures, not ERP-sourced. A production
   build needs signed master-data sync.
4. App state (invoices, staged actions) is in memory; a restart requires
   re-ingestion. The ledger and audit chain persist.
5. Idempotency keys are client-supplied. A malicious client can only cause its
   own replay, not a duplicate payment, because the key is unique and writes
   are transactional.
6. No authentication layer in front of the HTTP API. It is intended to run
   behind an authenticated gateway; this is the largest gap for real use.
7. Rate limiting and structured security logging/alerting are not implemented.
8. The offline extractor requires a structured payload; it refuses to guess.
   That is intentional, but it means PDF parsing is out of scope here.

## 7. Verification commands

```bash
uv run pytest -q --color=no
uv run python -m backend.scripts.generate_evidence
uv run python -m backend.scripts.verify_audit_chain --db evidence/sandbox_ledger.db
```

Latest recorded result: 62 tests pass, chain verifies with 8 envelopes, and all
five benchmark invoices plus a duplicate replay classify as documented in
`evidence/sandbox_execution_log.jsonl`.

## 8. Disclosure

This repository is a competition prototype. Do not use it to move real money
without an independent security review, authentication, secrets management,
and a real banking integration.
