"""Which Bedrock model this deployment calls, decided at runtime.

The model id used to be configuration: `deploy.sh` asked the account once,
wrote the answer into `BEDROCK_MODEL_ID`, and every call used it forever.
That is one deploy-time question too few, and it cost us the whole model
layer on the day the stack went up.

What happened is worth writing down, because it will happen again to whatever
id replaces this one. Bedrock's end of life for Claude 3 Haiku was
10 September 2026. We deployed on the 20th. `deploy.sh` asked the account for
an on-demand Anthropic model and took the last one it listed, with no filter
on lifecycle — and a model past its end of life is still in that list. It was
still allowed by IAM, and the health check still printed it as the configured
model. It had simply stopped answering. The stack came up green with a model
layer that had never worked once.

What made it expensive was not the wrong id, it was the reporting. The
explanation panel fell back to the deterministic template, which is correct
and is why nothing returned a 500, and "Ask the ledger" reported itself
unavailable. The product degraded exactly as designed and told nobody why,
because the only thing either surface reported was the *class* of the
exception.

Two changes come out of that, and they are the whole of this module.

**The id is resolved per process, not per deploy, and more than one is
allowed.** `candidates()` returns the configured id first — an operator who
names a model still gets it — then whatever the account actually offers,
cheapest adequate first. A caller that gets a permanent model error on one
candidate calls `retire()` and takes the next. A retirement date then costs
one failed call rather than an outage.

**A permanent model error is distinguishable from a bad day.** `is_dead()`
separates "this id will never work from this account in this region"
(retired, not enabled, needs an inference profile, does not exist) from
throttling and timeouts, which deserve a retry rather than a different model.

Discovery needs `bedrock:ListInferenceProfiles` and
`bedrock:ListFoundationModels`, which the instance role grants. Both are
read-only listings of a catalogue; neither reads a model, a prompt, or a byte
of anyone's books. If they are denied, the module degrades to "the configured
id, and nothing else" — which is exactly the behaviour it replaced.
"""

from __future__ import annotations

import threading

from diligence_engine.config import settings

# Bedrock error codes that mean "this id will never work here" rather than
# "try again in a moment". Retired models, and models whose access has not
# been granted, arrive as ValidationException; an id that needs a
# cross-region inference profile arrives the same way with a different
# message. Throttling and timeouts are deliberately absent: switching model
# on a throttle would hide a capacity problem behind a quality change.
PERMANENT = frozenset(
    {
        "ValidationException",
        "AccessDeniedException",
        "ResourceNotFoundException",
        "ModelNotReadyException",
    }
)

# Cheapest adequate family first. Every call this product makes is three
# sentences of prose over figures that are already computed, or a short
# answer over tool results the engine produced. The work is formatting, not
# reasoning, and paying Opus rates for it is a line nobody would defend on a
# bill.
FAMILY_ORDER = ("haiku", "sonnet", "opus")

_lock = threading.Lock()
_retired: set[str] = set()
_catalogue: list[str] | None = None


def _rank(identifier: str) -> tuple[int, int, str]:
    """Sort key: inference profiles first, then cheapest family, then newest.

    Inference profiles come first because in several regions — ap-south-1
    among them — the current Anthropic models are reachable *only* through
    one, and a profile fails over to another region under load instead of
    throttling. A profile id carries a routing prefix before the provider
    (`global.anthropic....`, `apac.anthropic....`); a plain foundation model
    id starts with the provider.

    The trailing sort inverts the id so a plain ascending sort puts later
    versions first: `claude-haiku-4-5-…` ahead of `claude-haiku-3-…`. It is a
    crude proxy for "newer" and nothing depends on it being right — being
    wrong costs one position in a list that is tried in order.
    """
    profile = 1 if identifier.startswith("anthropic.") else 0
    family = next(
        (index for index, name in enumerate(FAMILY_ORDER) if name in identifier),
        len(FAMILY_ORDER),
    )
    inverted = "".join(chr(0x10FFFE - ord(character)) for character in identifier)
    return (profile, family, inverted)


def _discover() -> list[str]:
    """Ask the account what it can call today. Best effort, cached per process."""
    region = settings().bedrock_region or settings().aws_region
    if not region:
        return []

    try:
        import boto3
    except ImportError:  # pragma: no cover - boto3 is a hard dependency in deployment
        return []

    try:
        client = boto3.client("bedrock", region_name=region)
    except Exception:  # noqa: BLE001 - no credentials is a smaller catalogue, not an error
        return []

    found: list[str] = []

    try:
        for profile in client.list_inference_profiles().get("inferenceProfileSummaries", []):
            identifier = profile.get("inferenceProfileId", "")
            if "anthropic" in identifier and profile.get("status", "ACTIVE") == "ACTIVE":
                found.append(identifier)
    except Exception:  # noqa: BLE001 - a denied listing is a smaller catalogue, not an error
        pass

    try:
        for model in client.list_foundation_models().get("modelSummaries", []):
            identifier = model.get("modelId", "")
            if not identifier.startswith("anthropic."):
                continue
            if "ON_DEMAND" not in (model.get("inferenceTypesSupported") or []):
                continue
            # LEGACY is Bedrock's word for "announced for retirement",
            # and the listing keeps returning an id after it has stopped
            # answering. That trapdoor is how a dead model was chosen at
            # deploy time in the first place, so it is closed here rather
            # than hoped about.
            if (model.get("modelLifecycle") or {}).get("status") != "ACTIVE":
                continue
            found.append(identifier)
    except Exception:  # noqa: BLE001 - see above
        pass

    return sorted(dict.fromkeys(found), key=_rank)


def candidates() -> list[str]:
    """Model ids to try, in order. Empty means no model is configured or reachable."""
    global _catalogue

    ordered: list[str] = []
    configured = settings().bedrock_model_id
    if configured:
        ordered.append(configured)

    with _lock:
        if _catalogue is None:
            _catalogue = _discover()
        ordered.extend(_catalogue)
        retired = set(_retired)

    return [name for name in dict.fromkeys(ordered) if name not in retired]


def retire(model_id: str) -> None:
    """Stop offering this id for the life of the process.

    Not persisted, on purpose. A restart re-asks the account, so an id that
    was retired here because model access had not been granted yet comes back
    the moment somebody grants it.
    """
    with _lock:
        _retired.add(model_id)


def forget() -> None:
    """Drop the cached catalogue and every retirement. For tests."""
    global _catalogue
    with _lock:
        _catalogue = None
        _retired.clear()


def error_code(error: BaseException) -> str:
    """The Bedrock error code, or the exception's class name if it carries none."""
    response = getattr(error, "response", None)
    if isinstance(response, dict):
        code = (response.get("Error") or {}).get("Code")
        if code:
            return str(code)
    return type(error).__name__


def is_dead(error: BaseException) -> bool:
    """True when this model id will not work, whatever we do to the request.

    The string search is for the agent path: Strands wraps the botocore error
    in its own exception, so the structured code is not always reachable, and
    a retirement that reads as a transient failure is a retirement nobody
    ever diagnoses.
    """
    if error_code(error) in PERMANENT:
        return True
    text = str(error)
    return any(code in text for code in PERMANENT)


def describe(error: BaseException, limit: int = 300) -> str:
    """One line an operator can act on: the code, and what Bedrock actually said.

    Worth the characters it costs. `ValidationException` on its own is
    equally true of a retired model, an unapproved model, a model that needs
    an inference profile, and a malformed request — four problems with four
    different fixes. The message names which one it is.

    It is configuration, not client data: no figure, no party and no document
    reaches this string, so it is safe to show the signed-in user, who is the
    person most likely to be the one reporting it.
    """
    code = error_code(error)
    message = ""
    response = getattr(error, "response", None)
    if isinstance(response, dict):
        message = str((response.get("Error") or {}).get("Message") or "")
    if not message:
        message = str(error)
    message = " ".join(message.split())
    if message.startswith(f"An error occurred ({code})"):
        # botocore's own rendering already carries the code. Do not print it twice.
        message = message.split(":", 1)[-1].strip()
    if len(message) > limit:
        message = message[: limit - 1].rstrip() + "…"
    return f"{code}: {message}" if message else code
