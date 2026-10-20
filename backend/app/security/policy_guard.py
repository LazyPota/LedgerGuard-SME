"""Deterministic permission tiers (0-4) outside the LLM.

Policy is data-free arithmetic plus an HMAC binding. Documents can never
change it: the only path to Tier 3 is a token signed with the treasury key
over (action, payload hash, amount, IBAN tail, approver).
"""

from __future__ import annotations

import hashlib
import hmac
import json
from decimal import Decimal
from typing import Iterable, Mapping

from backend.app.config import get_settings
from backend.app.schemas.contracts import PolicyDecision
from backend.app.schemas.domain import to_money

SECURITY_FLAGS = {
    "PROMPT_INJECTION_DETECTED",
    "BENEFICIARY_MISMATCH",
    "DUPLICATE_ARTIFACT_HASH",
    "DUPLICATE_CANONICAL_ID",
}

FORBIDDEN_OPERATIONS = {
    "UPDATE_VENDOR_MASTER_IBAN",
    "UPDATE_VENDOR_MASTER",
    "INCREASE_PO_LIMIT",
    "DELETE_AUDIT_LOG",
    "CALL_ARBITRARY_URL",
}


def check_forbidden_operation(operation: str) -> PolicyDecision:
    if operation in FORBIDDEN_OPERATIONS:
        return PolicyDecision(
            tier="TIER_4_FORBIDDEN",
            verdict="DENY_SECURITY_POLICY",
            requires_hitl=False,
            reasons=[f"TIER4_FORBIDDEN_OPERATION:{operation}"],
        )
    return PolicyDecision(
        tier="TIER_0_READ",
        verdict="ALLOW",
        requires_hitl=False,
        reasons=[],
    )


def evaluate_payment_policy(
    *,
    amount: Decimal,
    match_status: str,
    risk_flags: Iterable[str],
    daily_auto_spent: Decimal,
    post_action_min_cash: Decimal,
    payroll_floor: Decimal,
    credit_draw: Decimal = Decimal("0.00"),
) -> PolicyDecision:
    settings = get_settings()
    amount = to_money(amount)
    flags = set(risk_flags)

    if match_status == "BLOCKED_SECURITY_VIOLATION" or flags & SECURITY_FLAGS:
        return PolicyDecision(
            tier="TIER_4_FORBIDDEN",
            verdict="DENY_SECURITY_POLICY",
            requires_hitl=False,
            reasons=sorted(["SECURITY_FLAG_PRESENT", *(flags & SECURITY_FLAGS)]),
        )

    if match_status != "VERIFIED_ELIGIBLE":
        return PolicyDecision(
            tier="TIER_1_STAGING",
            verdict="DENY_DISCREPANCY",
            requires_hitl=False,
            reasons=[f"MATCH_STATUS:{match_status}"],
        )

    reasons: list[str] = []
    if amount > settings.tier2_single_payment_cap:
        reasons.append("TIER2_SINGLE_PAYMENT_CAP_EXCEEDED")
    if to_money(daily_auto_spent) + amount > settings.tier2_daily_payment_cap:
        reasons.append("TIER2_DAILY_CAP_EXCEEDED")
    if to_money(credit_draw) > 0:
        reasons.append("CREDIT_DRAW_REQUIRES_HITL")
    if to_money(post_action_min_cash) < to_money(payroll_floor):
        reasons.append("PAYROLL_RESERVE_FLOOR_BREACH")

    if reasons:
        return PolicyDecision(
            tier="TIER_3_HITL_REQUIRED",
            verdict="ALLOW_WITH_VALID_HUMAN_SIGNATURE",
            requires_hitl=True,
            reasons=reasons,
        )

    return PolicyDecision(
        tier="TIER_2_BOUNDED_AUTO",
        verdict="ALLOW",
        requires_hitl=False,
        reasons=["WITHIN_BOUNDED_AUTO_LIMITS"],
    )


def approval_payload_digest(payload: Mapping[str, object]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _approval_message(
    action_id: str,
    payload_sha256: str,
    amount: Decimal,
    iban_last4: str,
    approver_id: str,
) -> bytes:
    amount_text = str(to_money(amount))
    return (
        f"{action_id}|{payload_sha256}|{amount_text}|{iban_last4}|{approver_id}"
    ).encode("utf-8")


def issue_approval_token(
    *,
    secret: str,
    action_id: str,
    payload_sha256: str,
    amount: Decimal,
    iban_last4: str,
    approver_id: str,
) -> str:
    return hmac.new(
        secret.encode("utf-8"),
        _approval_message(action_id, payload_sha256, amount, iban_last4, approver_id),
        hashlib.sha256,
    ).hexdigest()


def verify_approval_token(
    *,
    token: str,
    secret: str,
    action_id: str,
    payload_sha256: str,
    amount: Decimal,
    iban_last4: str,
    approver_id: str,
) -> bool:
    expected = issue_approval_token(
        secret=secret,
        action_id=action_id,
        payload_sha256=payload_sha256,
        amount=amount,
        iban_last4=iban_last4,
        approver_id=approver_id,
    )
    return hmac.compare_digest(expected, token)


def make_idempotency_key(
    *,
    tenant_id: str,
    invoice_id: str,
    action_type: str,
    amount: Decimal,
    scheduled_date: str,
) -> str:
    canonical = f"{tenant_id}|{invoice_id}|{action_type}|{to_money(amount)}|{scheduled_date}"
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
