"""Untrusted-document isolation and OWASP ASI01 / BEC heuristics.

Document content is data. Nothing here executes, routes, or mutates state;
it only produces structural wrappers and findings for the deterministic
PolicyGuard to act on.
"""

from __future__ import annotations

import html
import re

from backend.app.schemas.contracts import SecurityFinding

OPEN_TAG = "<untrusted_document_data>"
CLOSE_TAG = "</untrusted_document_data>"

_MAX_EXCERPT = 200

# (pattern, owasp_id, policy_rule_id, action_taken)
_RULES: tuple[tuple[re.Pattern[str], str, str, str], ...] = (
    (
        re.compile(
            r"ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|rules|limits|polic)",
            re.IGNORECASE,
        ),
        "ASI01_GOAL_HIJACK",
        "POLICY_PROMPT_INJECTION_DEFENSE_V1",
        "Quarantined document memo. Prevented execution pipeline escalation.",
    ),
    (
        re.compile(r"system\s+override|developer\s+mode|jailbreak", re.IGNORECASE),
        "ASI01_GOAL_HIJACK",
        "POLICY_PROMPT_INJECTION_DEFENSE_V1",
        "Quarantined document memo. Prevented execution pipeline escalation.",
    ),
    (
        re.compile(
            r"(?:iban|bank\s+account|beneficiary)[\s\S]{0,40}?"
            r"(?:updated|changed|replaced|rerouted)"
            r"|(?:update|updated|change|changed|replace|replaced|reroute|rerouted)"
            r"[\s\S]{0,40}?(?:iban|bank\s+account|beneficiary)",
            re.IGNORECASE,
        ),
        "BEC_IBAN_SWAP",
        "POLICY_VENDOR_MASTER_IBAN_LOCK",
        "Blocked by PolicyGuard. Vendor Master edits strictly forbidden in document pipeline (Tier 4).",
    ),
    (
        re.compile(r"pre-?approved\s+by\s+(treasury|finance|management)", re.IGNORECASE),
        "ASI01_GOAL_HIJACK",
        "POLICY_AUTHORITY_CLAIM_V1",
        "Rejected fabricated authority claim. Approval must come from a verified HITL signature.",
    ),
    (
        re.compile(r"split\s+(the\s+)?payment|below\s+the\s+tier\s*2\s+limit", re.IGNORECASE),
        "ASI02_TOOL_MISUSE",
        "POLICY_STRUCTURING_DEFENSE_V1",
        "Blocked payment structuring attempt. Per-invoice and daily caps enforced independently.",
    ),
    (
        re.compile(r"execute\s+(tier\s*2|auto-?payment)|pay\s+immediately", re.IGNORECASE),
        "ASI02_TOOL_MISUSE",
        "POLICY_TOOL_USE_BOUNDARY_V1",
        "Ignored embedded execution command. Documents cannot invoke tools.",
    ),
)


def wrap_untrusted(text: str) -> str:
    """Delimit untrusted content so extraction prompts can never blend it with policy."""
    return f"{OPEN_TAG}\n{text}\n{CLOSE_TAG}"


def _excerpt(text: str, match: re.Match[str]) -> str:
    start = max(0, match.start() - 40)
    end = min(len(text), match.end() + 60)
    return html.escape(text[start:end][:_MAX_EXCERPT], quote=True)


def scan_untrusted(text: str) -> list[SecurityFinding]:
    """Return CRITICAL findings for embedded instruction-override patterns."""
    if not text:
        return []
    findings: list[SecurityFinding] = []
    seen: set[tuple[str, str]] = set()
    for pattern, owasp_id, policy_rule_id, action in _RULES:
        match = pattern.search(text)
        if match is None:
            continue
        key = (owasp_id, policy_rule_id)
        if key in seen:
            continue
        seen.add(key)
        findings.append(
            SecurityFinding(
                owasp_id=owasp_id,
                trigger_excerpt_escaped=_excerpt(text, match),
                policy_rule_id=policy_rule_id,
                action_taken=action,
            )
        )
    return findings
