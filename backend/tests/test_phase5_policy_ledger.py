from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
import hashlib

import pytest

from backend.app.execution.ledger_sandbox import (
    InsufficientFunds,
    InvoiceNotPayable,
    LedgerSandbox,
    PaymentRequest,
)
from backend.app.security.policy_guard import (
    approval_payload_digest,
    check_forbidden_operation,
    evaluate_payment_policy,
    issue_approval_token,
    make_idempotency_key,
    verify_approval_token,
)

SECRET = "test-secret"


def _policy(**overrides):
    base = dict(
        amount=Decimal("1800.00"),
        match_status="VERIFIED_ELIGIBLE",
        risk_flags=(),
        daily_auto_spent=Decimal("0.00"),
        post_action_min_cash=Decimal("71375.84"),
        payroll_floor=Decimal("50000.00"),
        credit_draw=Decimal("0.00"),
    )
    return evaluate_payment_policy(**{**base, **overrides})


def test_tier2_allows_small_verified_payment():
    decision = _policy()
    assert decision.tier == "TIER_2_BOUNDED_AUTO"
    assert decision.verdict == "ALLOW"
    assert decision.requires_hitl is False


def test_amount_above_single_cap_requires_hitl():
    decision = _policy(amount=Decimal("39200.00"))
    assert decision.tier == "TIER_3_HITL_REQUIRED"
    assert decision.requires_hitl is True


def test_daily_cap_requires_hitl():
    decision = _policy(daily_auto_spent=Decimal("4000.00"))
    assert decision.tier == "TIER_3_HITL_REQUIRED"
    assert "TIER2_DAILY_CAP_EXCEEDED" in decision.reasons


def test_credit_draw_always_requires_hitl():
    decision = _policy(amount=Decimal("12000.00"), credit_draw=Decimal("12000.00"))
    assert decision.tier == "TIER_3_HITL_REQUIRED"


def test_security_flags_deny_execution():
    decision = _policy(risk_flags=("PROMPT_INJECTION_DETECTED",))
    assert decision.tier == "TIER_4_FORBIDDEN"
    assert decision.verdict == "DENY_SECURITY_POLICY"


def test_quarantined_invoice_is_staging_only():
    decision = _policy(match_status="QUARANTINED_DISCREPANCY")
    assert decision.tier == "TIER_1_STAGING"
    assert decision.verdict == "DENY_DISCREPANCY"


def test_payroll_floor_breach_requires_hitl():
    decision = _policy(post_action_min_cash=Decimal("40000.00"))
    assert decision.tier == "TIER_3_HITL_REQUIRED"
    assert "PAYROLL_RESERVE_FLOOR_BREACH" in decision.reasons


def test_tier4_forbidden_operations_are_denied():
    decision = check_forbidden_operation("UPDATE_VENDOR_MASTER_IBAN")
    assert decision.tier == "TIER_4_FORBIDDEN"
    assert decision.verdict == "DENY_SECURITY_POLICY"
    assert check_forbidden_operation("DELETE_AUDIT_LOG").tier == "TIER_4_FORBIDDEN"


def test_approval_token_roundtrip_and_tamper_detection():
    token = issue_approval_token(
        secret=SECRET,
        action_id="act_1",
        payload_sha256="a" * 64,
        amount=Decimal("39200.00"),
        iban_last4="4829",
        approver_id="mgr_01",
    )
    assert verify_approval_token(
        token=token,
        secret=SECRET,
        action_id="act_1",
        payload_sha256="a" * 64,
        amount=Decimal("39200.00"),
        iban_last4="4829",
        approver_id="mgr_01",
    )
    assert not verify_approval_token(
        token=token,
        secret=SECRET,
        action_id="act_1",
        payload_sha256="a" * 64,
        amount=Decimal("1.00"),
        iban_last4="4829",
        approver_id="mgr_01",
    )


def test_payload_digest_is_canonical_and_order_independent():
    assert approval_payload_digest({"b": 1, "a": "x"}) == approval_payload_digest({"a": "x", "b": 1})


def test_idempotency_key_is_deterministic():
    kwargs = dict(
        tenant_id="sme_01",
        invoice_id="INV-2026-101",
        action_type="PAYMENT",
        amount=Decimal("39200.00"),
        scheduled_date="2026-11-10",
    )
    first = make_idempotency_key(**kwargs)
    assert first == make_idempotency_key(**kwargs)
    assert len(first) == 64
    assert first == hashlib.sha256(
        b"sme_01|INV-2026-101|PAYMENT|39200.00|2026-11-10"
    ).hexdigest()


@pytest.fixture()
def ledger(tmp_path):
    sandbox = LedgerSandbox(str(tmp_path / "ledger.db"))
    sandbox.initialize(cash=Decimal("77200.00"))
    sandbox.seed_invoice(tenant_id="sme_01", invoice_id="INV-2026-101")
    return sandbox


def _request(key="idem-1", amount="39200.00", credit="12000.00"):
    return PaymentRequest(
        tenant_id="sme_01",
        invoice_id="INV-2026-101",
        action_id="act_1",
        idempotency_key=key,
        amount=Decimal(amount),
        credit_draw=Decimal(credit),
        trace_id="trc_1",
    )


def test_commit_is_verified_and_balances_reconcile(ledger):
    receipt = ledger.pay(_request())
    assert receipt.status == "SIMULATED_EXECUTED"
    assert receipt.pre_execution_cash_balance == Decimal("77200.00")
    assert receipt.post_execution_cash_balance == Decimal("50000.00")
    assert receipt.post_state_invariant_verified is True
    assert receipt.credit_draw_execution_id is not None
    assert ledger.get_cash("sme_01") == Decimal("50000.00")


def test_idempotent_replay_debits_once(ledger):
    first = ledger.pay(_request())
    second = ledger.pay(_request())
    assert second.status == "IDEMPOTENT_REPLAY_NOOP"
    assert second.execution_id == first.execution_id
    assert ledger.get_cash("sme_01") == Decimal("50000.00")
    assert ledger.count_executions() == 1


def test_second_payment_for_paid_invoice_is_rejected(ledger):
    ledger.pay(_request())
    with pytest.raises(InvoiceNotPayable):
        ledger.pay(_request(key="idem-2", credit="0.00"))
    assert ledger.get_cash("sme_01") == Decimal("50000.00")
    assert ledger.count_executions() == 1


def test_insufficient_funds_rolls_back(ledger):
    with pytest.raises(InsufficientFunds):
        ledger.pay(_request(key="idem-3", amount="90000.00", credit="0.00"))
    assert ledger.get_cash("sme_01") == Decimal("77200.00")
    assert ledger.count_executions() == 0


def test_concurrent_replay_storm_debits_once(tmp_path):
    path = str(tmp_path / "storm.db")
    sandbox = LedgerSandbox(path)
    sandbox.initialize(cash=Decimal("77200.00"))
    sandbox.seed_invoice(tenant_id="sme_01", invoice_id="INV-2026-101")

    def attempt(_):
        client = LedgerSandbox(path)
        return client.pay(_request(key="storm-key", amount="2500.00", credit="0.00")).status

    with ThreadPoolExecutor(max_workers=8) as pool:
        statuses = list(pool.map(attempt, range(8)))

    assert statuses.count("SIMULATED_EXECUTED") == 1
    assert statuses.count("IDEMPOTENT_REPLAY_NOOP") == 7
    final = LedgerSandbox(path)
    assert final.get_cash("sme_01") == Decimal("74700.00")
    assert final.count_executions() == 1
