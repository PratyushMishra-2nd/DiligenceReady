"""Authorisation, decided by Cedar.

Cedar is AWS's open-source authorisation language. `policies.cedar` next to
this file is not a description of the rules — it *is* the rules. Every
firm-scoping decision in the product goes through `decide()`, which loads
that text, builds the three entities the request touches, and asks Cedar.

Three properties this buys that the previous inline SQL check did not:

*   **Deny by default.** Cedar returns Deny when no `permit` matches. A new
    action added to the API with no policy written for it is refused, rather
    than allowed because nobody remembered to add a check.
*   **One place to read.** "Which firm can see what" is answerable by reading
    twenty lines of policy, by someone who does not read Python. For a
    product whose pitch is that a CA can audit it, that matters.
*   **Testable without a database.** The policy suite in
    `tests/test_authz_cedar.py` enumerates the whole role × tenant matrix
    against the real evaluator, with no Postgres and no HTTP.

The database still answers *facts* — which firm owns this company — because
that is what a database is for. Cedar answers the *decision*. The split is
deliberate: entity loading is a query, authorisation is a policy.

Fail-closed: if Cedar cannot be loaded or the policy cannot be parsed, this
module raises. It does not fall back to a permissive path, and there is no
second implementation of the rule in Python to fall back to.
"""

from __future__ import annotations

import functools
import uuid
from pathlib import Path

from cedarpy import Decision, is_authorized

POLICY_PATH = Path(__file__).with_name("policies.cedar")

NAMESPACE = "DR"

# Every action the API can take on client data. Adding a route means adding
# an action here and a policy for it; forgetting the policy denies the route,
# which is the failure direction we want.
VIEW_COMPANY = "ViewCompany"
VIEW_EVIDENCE = "ViewEvidence"
EXPLAIN = "Explain"
ASK_LEDGER = "AskLedger"
UPLOAD_DOCUMENT = "UploadDocument"
DECIDE_RISK = "DecideRisk"
MANAGE_USERS = "ManageUsers"

ACTIONS = frozenset(
    {
        VIEW_COMPANY,
        VIEW_EVIDENCE,
        EXPLAIN,
        ASK_LEDGER,
        UPLOAD_DOCUMENT,
        DECIDE_RISK,
        MANAGE_USERS,
    }
)


class PolicyError(RuntimeError):
    """The policy could not be loaded or evaluated. Never an allow."""


@functools.lru_cache(maxsize=1)
def policy_text() -> str:
    try:
        return POLICY_PATH.read_text(encoding="utf-8")
    except OSError as error:  # pragma: no cover - a broken install, not a branch
        raise PolicyError(f"cannot read {POLICY_PATH}: {error}") from error


def _entity(kind: str, identifier: str | uuid.UUID) -> dict:
    return {"__entity": {"type": f"{NAMESPACE}::{kind}", "id": str(identifier)}}


def _euid(kind: str, identifier: str | uuid.UUID) -> str:
    return f'{NAMESPACE}::{kind}::"{identifier}"'


def decide(
    *,
    action: str,
    user_id: str | uuid.UUID,
    user_firm_id: str | uuid.UUID,
    role: str,
    resource_kind: str,
    resource_id: str | uuid.UUID,
    resource_firm_id: str | uuid.UUID | None,
) -> bool:
    """Ask Cedar. True means permitted; anything else is a refusal.

    `resource_firm_id` is the firm that owns the resource, read from the
    database by the caller. Passing None models a resource that exists but
    whose owner could not be established, and Cedar denies it — the `has
    firm` guard in the policy is what makes that a clean Deny rather than an
    evaluation error.
    """
    if action not in ACTIONS:
        raise PolicyError(
            f"unknown action {action!r}. Add it to authz.ACTIONS and write a "
            "policy for it; an action with no policy is denied."
        )

    entities: list[dict] = [
        {
            "uid": _entity("User", user_id),
            "attrs": {"firm": _entity("Firm", user_firm_id), "role": role},
            "parents": [],
        },
        {"uid": _entity("Firm", user_firm_id), "attrs": {}, "parents": []},
    ]

    resource_attrs: dict = {}
    if resource_kind == "Firm":
        # ManageUsers compares identity, not an attribute, so the firm needs
        # no `firm` of its own.
        pass
    elif resource_firm_id is not None:
        resource_attrs["firm"] = _entity("Firm", resource_firm_id)
        if str(resource_firm_id) != str(user_firm_id):
            entities.append(
                {
                    "uid": _entity("Firm", resource_firm_id),
                    "attrs": {},
                    "parents": [],
                }
            )

    if resource_kind != "Firm" or str(resource_id) != str(user_firm_id):
        entities.append(
            {
                "uid": _entity(resource_kind, resource_id),
                "attrs": resource_attrs,
                "parents": [],
            }
        )

    request = {
        "principal": _euid("User", user_id),
        "action": f'{NAMESPACE}::Action::"{action}"',
        "resource": _euid(resource_kind, resource_id),
        "context": {},
    }

    try:
        result = is_authorized(request, policy_text(), entities)
    except Exception as error:  # noqa: BLE001 - an evaluation failure is a denial
        raise PolicyError(f"Cedar could not evaluate the request: {error}") from error

    return result.decision == Decision.Allow


def self_test() -> None:
    """Prove the policy evaluates before the process serves traffic.

    Called at API startup. A deployment where Cedar failed to load is a
    deployment with no tenant boundary, and it should refuse to start rather
    than discover that on the first request.
    """
    firm = "11111111-1111-1111-1111-111111111111"
    other = "22222222-2222-2222-2222-222222222222"
    company = "33333333-3333-3333-3333-333333333333"

    checks = [
        (True, VIEW_COMPANY, "owner", firm),
        (False, VIEW_COMPANY, "owner", other),
        (True, UPLOAD_DOCUMENT, "member", firm),
        (False, UPLOAD_DOCUMENT, "readonly", firm),
        (False, UPLOAD_DOCUMENT, "owner", other),
    ]
    for expected, action, role, owning_firm in checks:
        actual = decide(
            action=action,
            user_id="00000000-0000-0000-0000-000000000001",
            user_firm_id=firm,
            role=role,
            resource_kind="Company",
            resource_id=company,
            resource_firm_id=owning_firm,
        )
        if actual is not expected:
            raise PolicyError(
                f"policy self-test failed: {role} / {action} / "
                f"{'own' if owning_firm == firm else 'other'} firm "
                f"returned {actual}, expected {expected}"
            )
