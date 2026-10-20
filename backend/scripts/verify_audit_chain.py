"""Independent audit-chain verifier.

Usage:
    uv run python -m backend.scripts.verify_audit_chain [--db PATH] [--tenant sme_01]

Prints VERIFY_CHAIN_OK and exits 0 when intact; TAMPER_DETECTED and exits 1 otherwise.
"""

from __future__ import annotations

import argparse
import sys

from backend.app.security.audit_chain import AuditChain


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="evidence/demo_ledger.db")
    parser.add_argument("--tenant", default="sme_01")
    args = parser.parse_args()

    chain = AuditChain(args.db)
    result = chain.verify(args.tenant)
    chain.close()

    print(result.message)
    print(f"envelopes_verified={result.envelopes_verified}")
    print(f"head_hash={result.head_hash}")
    if result.tamper_detected_at_trace_id:
        print(f"broken_at={result.tamper_detected_at_trace_id}")
    return 0 if result.valid else 1


if __name__ == "__main__":
    sys.exit(main())
