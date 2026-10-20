"""Local ACID simulation ledger.

Every write is inside BEGIN IMMEDIATE. Idempotency is a UNIQUE constraint,
not an application-level check. Post-state balance is re-read and asserted
before an execution is marked verified.

This is a simulated ledger. It never claims to be an external bank transfer.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from backend.app.schemas.contracts import ExecutionReceipt
from backend.app.schemas.domain import to_money


class LedgerError(RuntimeError):
    pass


class InsufficientFunds(LedgerError):
    pass


class InvoiceNotPayable(LedgerError):
    pass


class PostStateInvariantViolated(LedgerError):
    pass


@dataclass(frozen=True)
class PaymentRequest:
    tenant_id: str
    invoice_id: str
    action_id: str
    idempotency_key: str
    amount: Decimal
    credit_draw: Decimal = Decimal("0.00")
    trace_id: str = ""

    def __post_init__(self) -> None:
        amount = to_money(self.amount)
        credit = to_money(self.credit_draw)
        if amount <= 0:
            raise ValueError("payment amount must be > 0")
        if credit < 0:
            raise ValueError("credit draw must be >= 0")
        object.__setattr__(self, "amount", amount)
        object.__setattr__(self, "credit_draw", credit)


_SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    tenant_id TEXT PRIMARY KEY,
    cash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invoice_states (
    invoice_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS executions (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id TEXT NOT NULL UNIQUE,
    tenant_id TEXT NOT NULL,
    invoice_id TEXT NOT NULL,
    action_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    pre_balance TEXT NOT NULL,
    disbursed TEXT NOT NULL,
    credit_drawn TEXT NOT NULL,
    post_balance TEXT NOT NULL,
    verified INTEGER NOT NULL,
    trace_id TEXT NOT NULL,
    executed_at_utc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exec_tenant_invoice ON executions(tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoice_states(tenant_id, status);
"""


class LedgerSandbox:
    def __init__(self, path: str | Path) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(path), timeout=20.0, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._conn.executescript(_SCHEMA)

    def close(self) -> None:
        self._conn.close()

    # -- reads -------------------------------------------------------------
    def get_cash(self, tenant_id: str) -> Decimal:
        row = self._conn.execute(
            "SELECT cash FROM accounts WHERE tenant_id = ?", (tenant_id,)
        ).fetchone()
        if row is None:
            raise LedgerError(f"unknown tenant: {tenant_id}")
        return Decimal(row["cash"])

    def count_executions(self) -> int:
        return int(self._conn.execute("SELECT COUNT(*) AS n FROM executions").fetchone()["n"])

    def invoice_status(self, invoice_id: str) -> str | None:
        row = self._conn.execute(
            "SELECT status FROM invoice_states WHERE invoice_id = ?", (invoice_id,)
        ).fetchone()
        return None if row is None else str(row["status"])

    def execution_by_key(self, idempotency_key: str) -> ExecutionReceipt | None:
        row = self._conn.execute(
            "SELECT * FROM executions WHERE idempotency_key = ?", (idempotency_key,)
        ).fetchone()
        return None if row is None else self._to_receipt(row, replay=True)

    # -- seeds -------------------------------------------------------------
    def initialize(self, cash: Decimal, tenant_id: str = "sme_01") -> None:
        self._conn.execute(
            "INSERT OR IGNORE INTO accounts(tenant_id, cash) VALUES (?, ?)",
            (tenant_id, str(to_money(cash))),
        )

    def seed_invoice(
        self, *, tenant_id: str, invoice_id: str, status: str = "UNPAID"
    ) -> None:
        self._conn.execute(
            "INSERT OR IGNORE INTO invoice_states(invoice_id, tenant_id, status) VALUES (?, ?, ?)",
            (invoice_id, tenant_id, status),
        )

    # -- writes ------------------------------------------------------------
    def pay(self, request: PaymentRequest) -> ExecutionReceipt:
        try:
            self._conn.execute("BEGIN IMMEDIATE")
            existing = self._conn.execute(
                "SELECT * FROM executions WHERE idempotency_key = ?",
                (request.idempotency_key,),
            ).fetchone()
            if existing is not None:
                self._conn.execute("COMMIT")
                return self._to_receipt(existing, replay=True)

            invoice = self._conn.execute(
                "SELECT status FROM invoice_states WHERE invoice_id = ? AND tenant_id = ?",
                (request.invoice_id, request.tenant_id),
            ).fetchone()
            if invoice is None:
                raise InvoiceNotPayable(f"unknown invoice: {request.invoice_id}")
            if invoice["status"] != "UNPAID":
                raise InvoiceNotPayable(
                    f"invoice {request.invoice_id} is {invoice['status']}, not UNPAID"
                )

            account = self._conn.execute(
                "SELECT cash FROM accounts WHERE tenant_id = ?", (request.tenant_id,)
            ).fetchone()
            if account is None:
                raise LedgerError(f"unknown tenant: {request.tenant_id}")

            pre = Decimal(account["cash"])
            expected_post = to_money(pre - request.amount + request.credit_draw)
            if expected_post < 0:
                raise InsufficientFunds(
                    f"payment {request.amount} exceeds available cash {pre} "
                    f"with credit draw {request.credit_draw}"
                )

            seq = self.count_executions() + 1
            execution_id = f"SBX-PAY-{99200 + seq}"
            credit_id = f"SBX-LOC-{44100 + seq}" if request.credit_draw > 0 else None
            now = datetime.now(timezone.utc).isoformat()

            self._conn.execute(
                "UPDATE accounts SET cash = ? WHERE tenant_id = ?",
                (str(expected_post), request.tenant_id),
            )
            self._conn.execute(
                "UPDATE invoice_states SET status = 'PAID' WHERE invoice_id = ?",
                (request.invoice_id,),
            )
            self._conn.execute(
                """
                INSERT INTO executions(execution_id, tenant_id, invoice_id, action_id,
                    idempotency_key, status, pre_balance, disbursed, credit_drawn,
                    post_balance, verified, trace_id, executed_at_utc)
                VALUES (?, ?, ?, ?, ?, 'SIMULATED_EXECUTED', ?, ?, ?, ?, 0, ?, ?)
                """,
                (
                    execution_id,
                    request.tenant_id,
                    request.invoice_id,
                    request.action_id,
                    request.idempotency_key,
                    str(pre),
                    str(request.amount),
                    str(request.credit_draw),
                    str(expected_post),
                    request.trace_id or execution_id,
                    now,
                ),
            )

            # Read-before-write was done above; verify inside the transaction
            # before COMMIT so a mismatch rolls back atomically.
            persisted = Decimal(
                self._conn.execute(
                    "SELECT cash FROM accounts WHERE tenant_id = ?", (request.tenant_id,)
                ).fetchone()["cash"]
            )
            if persisted != expected_post:
                raise PostStateInvariantViolated(
                    f"post-state mismatch: expected {expected_post}, persisted {persisted}"
                )
            self._conn.execute(
                "UPDATE executions SET verified = 1 WHERE execution_id = ?", (execution_id,)
            )
            self._conn.execute("COMMIT")
        except sqlite3.Error:
            self._rollback()
            raise
        except BaseException:
            self._rollback()
            raise

        row = self._conn.execute(
            "SELECT * FROM executions WHERE idempotency_key = ?", (request.idempotency_key,)
        ).fetchone()
        receipt = self._to_receipt(row, replay=False)
        if not receipt.post_state_invariant_verified:
            raise PostStateInvariantViolated("post-commit verification failed")
        return receipt

    def _rollback(self) -> None:
        if self._conn.in_transaction:
            self._conn.execute("ROLLBACK")

    # -- mapping -----------------------------------------------------------
    @staticmethod
    def _to_receipt(row: Any, *, replay: bool) -> ExecutionReceipt:
        credit = Decimal(row["credit_drawn"])
        return ExecutionReceipt(
            execution_id=row["execution_id"],
            credit_draw_execution_id=(
                f"SBX-LOC-{44100 + int(row['seq'])}" if credit > 0 else None
            ),
            invoice_id=row["invoice_id"],
            status="IDEMPOTENT_REPLAY_NOOP" if replay else row["status"],
            idempotency_key=row["idempotency_key"],
            pre_execution_cash_balance=Decimal(row["pre_balance"]),
            disbursed_amount=Decimal(row["disbursed"]),
            credit_drawn_amount=credit,
            post_execution_cash_balance=Decimal(row["post_balance"]),
            post_state_invariant_verified=bool(row["verified"]),
            executed_at_utc=row["executed_at_utc"],
            decision_envelope_trace_id=row["trace_id"],
        )
