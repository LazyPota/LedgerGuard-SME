# LedgerGuard-SME — AI-Assisted SME Finance & Liquidity Execution Copilot
**2026 Shenzhen International FinTech Competition — International Track, Topic E: SME Finance Copilot**

Deterministic, fail-closed, security-first AP reconciliation, working-capital optimization, and short-term liquidity execution copilot for Small and Medium Enterprises (SMEs).

> **Core Operating Principle:** *The AI model never touches money.*  
> LLM output is strictly confined to unstructured document field extraction within an escaped sandbox container. All financial arithmetic, yield optimizations, reconciliation matching, and ledger mutations are deterministic, strictly typed `Decimal` operations with mathematical proofs.

---

## Architecture Overview

```
LedgerGuard-SME/
├── src/                               # WORKSTREAM A: FRONTEND & CONTRACTS
│   ├── contracts/                     # Dual-Language Shared Contract & Zod Schemas
│   │   ├── ledgerGuardContract.ts     # TypeScript Source of Truth (9 operational states, 5 tiers)
│   │   └── ledgerGuardSchemas.ts      # Runtime Zod validation schemas
│   ├── components/
│   │   ├── layout/                    # Persistent AppHeader, 9-View AppSidebar, NotificationBanner
│   │   ├── common/                    # CurrencyDisplay, OperationalStateBadge, UntrustedDocumentField, Card, Modal, Drawer
│   │   └── views/                     # 9 Complete Production Views
│   │       ├── OverviewDashboardView.tsx      # View 1: 30-Day Cash Trajectory & Facility Matcher
│   │       ├── InvoiceIntakeListView.tsx      # View 2: Intake Queue & SKU Confidence Filters
│   │       ├── ThreeWayMatchMatrixView.tsx    # View 3: Side-by-Side PO vs GRN vs INV Matrix
│   │       ├── DiscrepancyReviewView.tsx      # View 4: Debit Note Generator & GRN Attestation
│   │       ├── LiquidityExplanationView.tsx   # View 5: 2/10 Net-30 Yield vs LOC Optimization
│   │       ├── ApprovalQueueView.tsx          # View 6: Tiers 0-4 Anti-Rubber-Stamp Gate
│   │       ├── ExecutionHistoryView.tsx       # View 7: ACID Sandbox Journal & Replay Logs
│   │       ├── ForensicAuditTrailView.tsx     # View 8: SHA-256 Decision Envelopes ($G_t$) Chain
│   │       └── SecurityDiagnosticsView.tsx    # View 9: TC-05 Injected Rollback & OWASP Threat Matrix
│   ├── services/
│   │   ├── apiClient.ts               # Dual-Mode Client (Offline Mock <-> Live Backend)
│   │   ├── mockSandboxAdapter.ts      # Deterministic Mock State Machine
│   │   └── benchmarkData.ts           # Competition Scenarios TC-01 to TC-05 Seed Data
│   └── utils/formatters.ts            # Zero-Arithmetic Display Formatters
├── backend/app/                       # WORKSTREAM B: FASTAPI & ENGINE
│   ├── api/                           # FastAPI REST endpoints (/api/v1)
│   ├── engine/                        # Reconciliation, Risk Detection, Working Capital LP Optimizer
│   ├── extraction/                    # Untrusted Document Sanitizer + Deterministic Extractor
│   ├── execution/                     # SQLite Sandbox Ledger with ACID Post-State Verification
│   ├── security/                      # PolicyGuard (5 Tiers), Cryptographic SHA-256 Audit Chain
│   └── fixtures/                      # Seed Scenarios TC-01 through TC-05
├── evidence/                          # Generated Submission Artifacts
│   ├── sandbox_execution_log.jsonl    # ACID Execution receipts
│   └── forensic_audit_log.jsonl       # Immutable SHA-256 hash-chained decision envelopes
└── tests/                             # Comprehensive Dual-Stack Test Suites (117 Total Tests)
    ├── Frontend: 55 Vitest unit & integration tests
    └── Backend: 62 Pytest unit & property-based tests
```

---

## 9 Production User-Facing Views

| # | View Name | Competition Focus | Key Features |
|---|---|---|---|
| **1** | **Executive Overview Dashboard** | 30-Day Liquidity & Cash Trajectory | Visualizes baseline cash dipping to $38,000 on Day 15 (breaching $50k payroll reserve floor) vs optimized trajectory keeping cash at exactly $50,000 via a $12k credit bridge draw. |
| **2** | **Invoice Intake & Extraction** | Document Ingestion & Status Queue | Interactive intake filter by operational state, SKU extraction confidence, and real-time custom JSON invoice submission with immediate schema validation. |
| **3** | **Deterministic 3-Way Match** | PO ↔ GRN ↔ Invoice Reconciliation | Side-by-side 4-column reconciliation matrix (Contracted PO vs Warehouse GRN vs Billed INV vs Exact Delta), unit conversion (ctn to pcs), and vendor master IBAN matching. |
| **4** | **Discrepancy Review & Quarantine** | Overbilling & Missing GRN Handling | One-click Formal Vendor Debit Note generator ($4,000 overbill on INV-102), warehouse receiving attestation (INV-103), and prompt injection quarantine (INV-104). |
| **5** | **Liquidity & Yield Explanation** | 2/10 Net-30 Dynamic Trade-Offs | Deterministic annualized yields (37.24% APR / 44.59% EAR on INV-101), credit bridge borrowing cost ($24.16), and net economic savings calculation (+$775.84). |
| **6** | **Approval & Delegation Controls** | 5-Tier Permission Hierarchy (Tiers 0–4) | Bounded Tier-2 auto-execution (< $5,000), idempotency replay testing, and Tier-3 Anti-Rubber-Stamp Human-in-the-Loop confirmation gate with typed string match friction. |
| **7** | **Executions & Receipts** | ACID SQLite Sandbox Journal | Non-repudiation ledger receipts with pre-cash, disbursed amount, post-cash, and invariant verification proof. Operational warning banner guarantees simulation honesty. |
| **8** | **Forensic Audit Trail** | Cryptographic Decision Envelopes ($G_t$) | Chronological SHA-256 hash-chained envelopes from Genesis block, one-click hash chain verifier, and instant JSONL log export (`forensic_audit_log.jsonl`). |
| **9** | **Security Diagnostics & Failure Injection** | OWASP Agentic AI & Fault Resilience | Interactive TC-05 mid-transaction failure injection demonstrating zero-loss atomic rollback, live ASI01 prompt injection sandbox, and Tier-4 IBAN swap lockout. |

---

## The 5 Benchmark Competition Scenarios

1. **TC-01 (Happy Path + Liquidity Optimization — INV-101):**  
   Shenzhen Precision Servo Ltd ($40,000.00 billed). 100% 3-way match. 2/10 Net-30 discount yields $800.00 gross savings. Baseline cash dips below $50,000 payroll floor on Day 15; copilot automatically schedules early payment on Day 10 paired with a $12,000 LOC bridge draw on Day 15, yielding **+$775.84 net economic benefit**.
2. **TC-02 (Quantity Billed Exceeds GRN — INV-102):**  
   Global Tech Components ($24,000 billed vs $20,000 received). 3-way match detects 10 excess units ($4,000 overbill). Automatically quarantined into `BLOCKED_DISCREPANCY`. One-click generates formal debit memorandum draft.
3. **TC-03 (Missing Goods Receipt Note — INV-103):**  
   Pacific Logistics Freight ($3,500.00 billed). Missing warehouse GRN. Quarantined until dock supervisor attests receiving in sandbox, immediately transitioning to `STAGED_TIER_2_ELIGIBLE`.
4. **TC-04 (Adversarial Prompt Injection & IBAN Swap — INV-104):**  
   Apex Hardware Ltd ($12,400.00). Invoice memo contains prompt injection attacking LLM instructions and an unverified German IBAN (`DE89...`). Frontend neutralizes input inside `<UntrustedDocumentField />`, and PolicyGuard applies a hard `BLOCKED_SECURITY_VIOLATION` lockout under Tier 4.
5. **TC-05 (Mid-Transaction Failure & Atomic Rollback — INV-105):**  
   CloudHost Infrastructure ($1,800.00). Simulates a mid-flight database lock conflict and covenant breach during execution. System triggers an immediate ACID rollback, emits structured `ApiErrorEnvelope`, records a `FAILED_ROLLED_BACK` receipt, and verifies **$0.00 cash lost**.

---

## Security-By-Design & OWASP Agentic AI Mitigations

- **OWASP ASI01 (Prompt Injection Containment):** All vendor remarks, memos, and extracted strings are passed through `<UntrustedDocumentField />`. Rendered strictly as escaped text with zero script evaluation, neutralizing adversarial prompt injections.
- **OWASP ASI02 (Tool Misuse & Excessive Agency):** Enforced 5-Tier Permission model. Autonomous agents cannot disburse funds. Tier 2 is strictly bounded (< $5,000, clean match). Tier 3 requires cryptographic human token signatures. Tier 4 is hard-blocked.
- **OWASP ASI09 (Anti-Rubber-Stamp Gate):** Tier-3 approvals impose intentional friction. Reviewers must inspect itemized deltas, attest verification checkboxes, and type the exact invoice number before execution unlocks.
- **OWASP LLM02 (Sensitive Information Disclosure):** Zero client-side API keys, banking credentials, or private keys exist in the frontend bundle. All API calls route through the backend gateway.
- **Deterministic State Machine:** Financial vouchers strictly use a 9-state discriminated union: `PROPOSED`, `STAGED_TIER_2_ELIGIBLE`, `PENDING_HITL_TIER_3`, `BLOCKED_DISCREPANCY`, `BLOCKED_SECURITY_VIOLATION`, `APPROVED_AWAITING_EXECUTION`, `SIMULATED_EXECUTED`, `EXTERNALLY_EXECUTED`, `FAILED_OR_ROLLED_BACK`.

---

## Dual-Mode Operation

LedgerGuard-SME features a persistent **Dual-Mode Switcher** in the global header:

1. **`OFFLINE_DETERMINISTIC_MOCK` (Default):**  
   Runs 100% in-browser using `mockSandboxAdapter.ts`. Fully offline, requires zero external services, databases, or API keys. Fully interactive and reproducible on any device.
2. **`LIVE_BACKEND_SANDBOX`:**  
   Connects to the FastAPI orchestrator at `http://localhost:8000/api/v1`. Persists to ACID SQLite with database triggers enforcing SHA-256 hash-chain immutability.

---

## Quickstart & Verification Instructions

### 1. Frontend Quickstart (React 18 + Vite + Tailwind + TypeScript)

```bash
# Install dependencies
npm install

# Run type check (strict TypeScript, noUnusedLocals: true)
npm run typecheck

# Run test suite (55 tests across 10 suites)
npm run test

# Build production bundle
npm run build

# Start local development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 2. Backend Quickstart (Python 3.11+ / FastAPI / SQLite)

```bash
# Sync dependencies
uv sync

# Run backend unit & property tests (62 tests)
uv run pytest -q

# Start FastAPI backend server
uv run uvicorn backend.app.main:app --reload --port 8000

# Generate competition evidence artifacts
uv run python -m backend.scripts.generate_evidence

# Verify SHA-256 audit chain in SQLite
uv run python -m backend.scripts.verify_audit_chain --db evidence/sandbox_ledger.db
```

Open [http://localhost:8000/docs](http://localhost:8000/docs) for the interactive Swagger OpenAPI documentation.

---

## Test Verification Summary

- **Frontend Unit & Integration Tests:** 55 passed (10 test suites)
- **TypeScript Static Verification:** Zero errors under `strict: true` and `noUnusedLocals: true`
- **Production Bundle:** Successfully generated in `dist/` with gzip optimization
- **Backend Tests:** 62 passed (deterministic matching, LP optimizer, policy guard, audit chaining)
- **Total Combined Tests:** **117 passing tests**

---

## Deliverables & Evidence Export

- **Sandbox Execution Log:** Available for instant download via UI (View 8) or in `evidence/sandbox_execution_log.jsonl`.
- **Forensic Audit Log:** Available for instant download via UI (View 8) or in `evidence/forensic_audit_log.jsonl`.
- **Interactive Verification:** Live SHA-256 hash chain verification button on both global header and View 8.
