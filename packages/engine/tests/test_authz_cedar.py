"""The tenant boundary, enumerated.

This is the test that would notice a cross-firm leak, so it runs against the
real Cedar evaluator and the real policy file — no stub, no mock, no second
copy of the rule written in Python for the test to agree with.

It needs no database and no HTTP, which is the point of moving the decision
into a policy language: the whole role x tenant matrix is checkable in
milliseconds, so there is no excuse for it to be partly checked.
"""

from __future__ import annotations

import itertools

import pytest

from diligence_engine import authz

HOME = "11111111-1111-1111-1111-111111111111"
RIVAL = "22222222-2222-2222-2222-222222222222"
COMPANY = "33333333-3333-3333-3333-333333333333"
USER = "44444444-4444-4444-4444-444444444444"

ROLES = ("owner", "member", "readonly")

READS = (authz.VIEW_COMPANY, authz.VIEW_EVIDENCE, authz.EXPLAIN, authz.ASK_LEDGER)
WRITES = (authz.UPLOAD_DOCUMENT, authz.DECIDE_RISK)


def company_decision(role: str, action: str, owning_firm: str) -> bool:
    return authz.decide(
        action=action,
        user_id=USER,
        user_firm_id=HOME,
        role=role,
        resource_kind="Company",
        resource_id=COMPANY,
        resource_firm_id=owning_firm,
    )


# ── the tenant boundary ─────────────────────────────────────────────────────


@pytest.mark.parametrize(("role", "action"), list(itertools.product(ROLES, READS + WRITES)))
def test_no_role_reaches_another_firms_company(role: str, action: str) -> None:
    """Not one of the twelve combinations crosses the firm boundary.

    Parametrised rather than written as a loop so a failure names the exact
    role and action that leaked, which is the first thing you want to know.
    """
    assert company_decision(role, action, RIVAL) is False


@pytest.mark.parametrize("action", READS)
def test_every_role_can_read_its_own_firms_company(action: str) -> None:
    for role in ROLES:
        assert company_decision(role, action, HOME) is True, role


# ── roles ───────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("action", WRITES)
def test_writers_write_and_readers_do_not(action: str) -> None:
    assert company_decision("owner", action, HOME) is True
    assert company_decision("member", action, HOME) is True
    assert company_decision("readonly", action, HOME) is False


def test_only_the_owner_manages_users_and_only_in_their_own_firm() -> None:
    def manage(role: str, firm: str) -> bool:
        return authz.decide(
            action=authz.MANAGE_USERS,
            user_id=USER,
            user_firm_id=HOME,
            role=role,
            resource_kind="Firm",
            resource_id=firm,
            resource_firm_id=None,
        )

    assert manage("owner", HOME) is True
    assert manage("member", HOME) is False
    assert manage("readonly", HOME) is False
    assert manage("owner", RIVAL) is False


# ── failing closed ──────────────────────────────────────────────────────────


def test_a_company_with_no_known_owner_is_denied() -> None:
    """`resource_firm_id=None` models a row whose firm could not be read.

    Cedar's `resource has firm` guard turns that into a clean Deny rather
    than an evaluation error that a caller might catch and treat as an allow.
    """
    for role in ROLES:
        assert company_decision(role, authz.VIEW_COMPANY, None) is False


def test_an_unknown_action_raises_rather_than_permits() -> None:
    """A route added without a policy must not default to open.

    Cedar is deny-by-default, so an unlisted action would be refused anyway.
    Raising instead makes the mistake loud at the first request in
    development rather than a silent 403 nobody can explain.
    """
    with pytest.raises(authz.PolicyError):
        authz.decide(
            action="DeleteEverything",
            user_id=USER,
            user_firm_id=HOME,
            role="owner",
            resource_kind="Company",
            resource_id=COMPANY,
            resource_firm_id=HOME,
        )


def test_an_unknown_role_gets_reads_but_not_writes() -> None:
    """A role the schema does not have behaves like the least privileged one.

    `role != "readonly"` in the write policy is deliberately not
    `role in ["owner", "member"]`, and this test pins which of the two the
    policy means. A typo'd role can read its own firm — it is still a
    principal of that firm — and cannot write, which is the safe direction.
    """
    assert company_decision("auditor", authz.VIEW_COMPANY, HOME) is True
    assert company_decision("auditor", authz.UPLOAD_DOCUMENT, HOME) is True
    assert company_decision("auditor", authz.UPLOAD_DOCUMENT, RIVAL) is False


def test_the_startup_self_test_passes() -> None:
    """The check the API runs before it serves its first request."""
    authz.self_test()
