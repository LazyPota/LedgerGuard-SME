"""Seed a local demo database for LedgerGuard SME.

Usage:
    uv run python -m backend.scripts.seed_demo_data [--db PATH] [--cash 77200.00]
"""

from __future__ import annotations

import argparse
import os
from decimal import Decimal

from backend.app.execution.ledger_sandbox import LedgerSandbox
from backend.app.fixtures.benchmark import INVOICE_DOCUMENTS, STARTING_CASH, VENDORS
from backend.app.security.audit_chain import AuditChain


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="evidence/demo_ledger.db")
    parser.add_argument("--cash", default=STARTING_CASH)
    args = parser.parse_args()

    os.makedirs(os.path.dirname(args.db) or ".", exist_ok=True)
    ledger = LedgerSandbox(args.db)
    ledger.initialize(cash=Decimal(args.cash))
    for document in INVOICE_DOCUMENTS:
        ledger.seed_invoice(tenant_id="sme_01", invoice_id=document.document_id)
    audit = AuditChain(args.db)

    print(f"seeded db={args.db}")
    print(f"cash={ledger.get_cash('sme_01')}")
    print(f"vendors={len(VENDORS)} invoices={len(INVOICE_DOCUMENTS)}")
    print(f"audit_head={audit.head_hash('sme_01')}")
    ledger.close()
    audit.close()


if __name__ == "__main__":
    main()
