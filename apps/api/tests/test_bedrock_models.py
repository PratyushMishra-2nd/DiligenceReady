"""Choosing a model id, and noticing when one has died.

These tests exist because of a specific failure. Bedrock's end of life for
Claude 3 Haiku was 10 September 2026; the stack was deployed on the 20th and
the deploy script chose that id anyway, because a model past its end of life
is still in `list-foundation-models` and the query had no lifecycle filter.
Every Converse call returned `ValidationException`, and both surfaces that
use a model reported the failure as the string "ValidationException" and
nothing else — which is equally consistent with a retired model, a model
this account had never been granted, a model needing an inference profile,
and a malformed request.

Nothing here touches the network. The catalogue lookup is stubbed, because
what is being tested is the ordering, the fall-through and the diagnosis —
not boto3.
"""

from __future__ import annotations

from dataclasses import replace

import pytest

from diligence_api import bedrock
from diligence_engine.config import settings

RETIRED = "anthropic.claude-3-haiku-20240307-v1:0"
LIVE_PROFILE = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
LIVE_SONNET = "global.anthropic.claude-sonnet-4-5-20250929-v1:0"


class FakeClientError(Exception):
    """The shape botocore raises: a message, and a structured error code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(
            f"An error occurred ({code}) when calling the Converse operation: {message}"
        )
        self.response = {"Error": {"Code": code, "Message": message}}


@pytest.fixture(autouse=True)
def clean_catalogue():
    bedrock.forget()
    yield
    bedrock.forget()


@pytest.fixture
def catalogue(monkeypatch):
    """Replace account discovery with a fixed list."""

    def install(ids: list[str]) -> None:
        monkeypatch.setattr(bedrock, "_discover", lambda: ids)

    return install


@pytest.fixture
def configured(monkeypatch):
    """Set BEDROCK_MODEL_ID without touching the process environment."""

    def install(model_id: str) -> None:
        monkeypatch.setattr(
            bedrock, "settings", lambda: replace(settings(), bedrock_model_id=model_id)
        )

    return install


# ── ordering ────────────────────────────────────────────────────────────────


def test_inference_profiles_come_before_bare_model_ids() -> None:
    """In ap-south-1 the current models are reachable only through a profile.

    A bare foundation-model id that happens to sort first must not push the
    only id that actually works to the back of the queue.
    """
    ordered = sorted([RETIRED, LIVE_PROFILE], key=bedrock._rank)
    assert ordered[0] == LIVE_PROFILE


def test_the_cheapest_adequate_family_is_tried_first() -> None:
    """Three sentences over pre-computed figures is not Opus work."""
    ordered = sorted(
        [
            "global.anthropic.claude-opus-4-5-20251101-v1:0",
            LIVE_SONNET,
            LIVE_PROFILE,
        ],
        key=bedrock._rank,
    )
    assert [name.split("claude-")[1].split("-")[0] for name in ordered] == [
        "haiku",
        "sonnet",
        "opus",
    ]


def test_a_newer_version_outranks_an_older_one_of_the_same_family() -> None:
    ordered = sorted(["global.anthropic.claude-haiku-3-5-v1:0", LIVE_PROFILE], key=bedrock._rank)
    assert ordered[0] == LIVE_PROFILE


# ── the candidate list ──────────────────────────────────────────────────────


def test_the_configured_id_is_tried_first(catalogue, configured) -> None:
    """An operator who names a model gets that model, ranking notwithstanding."""
    configured(RETIRED)
    catalogue([LIVE_PROFILE])
    assert bedrock.candidates()[0] == RETIRED


def test_the_configured_id_is_not_listed_twice(catalogue, configured) -> None:
    configured(LIVE_PROFILE)
    catalogue([LIVE_PROFILE, LIVE_SONNET])
    assert bedrock.candidates() == [LIVE_PROFILE, LIVE_SONNET]


def test_a_retired_model_falls_through_to_the_next_one(catalogue, configured) -> None:
    """The outage, in one test.

    Before this, the configured id was the only id, so a retirement took the
    explanation panel and the agent with it. Now it costs one failed call.
    """
    configured(RETIRED)
    catalogue([LIVE_PROFILE, LIVE_SONNET])
    assert bedrock.candidates() == [RETIRED, LIVE_PROFILE, LIVE_SONNET]

    bedrock.retire(RETIRED)
    assert bedrock.candidates() == [LIVE_PROFILE, LIVE_SONNET]


def test_no_model_configured_and_none_discoverable_is_an_empty_list(catalogue, configured) -> None:
    """Which is the local-development case, and must not be an exception.

    Cloning this repository without an AWS account has to work: the
    deterministic explanation is correct, just plainer.
    """
    configured("")
    catalogue([])
    assert bedrock.candidates() == []


# ── telling a dead model from a bad day ─────────────────────────────────────


def test_a_retirement_is_permanent() -> None:
    error = FakeClientError(
        "ValidationException",
        "The model anthropic.claude-3-haiku-20240307-v1:0 has reached end of life.",
    )
    assert bedrock.is_dead(error) is True


def test_a_missing_inference_profile_is_permanent() -> None:
    error = FakeClientError(
        "ValidationException",
        "Invocation of model ID with on-demand throughput isn't supported. "
        "Retry your request with the ID or ARN of an inference profile.",
    )
    assert bedrock.is_dead(error) is True


def test_throttling_is_not_permanent() -> None:
    """Switching model on a throttle hides a capacity problem behind a
    quality change, and the next model is throttled too."""
    assert bedrock.is_dead(FakeClientError("ThrottlingException", "Too many requests")) is False


def test_a_timeout_is_not_permanent() -> None:
    assert bedrock.is_dead(TimeoutError("read timeout")) is False


def test_an_error_wrapped_by_the_agent_sdk_is_still_recognised() -> None:
    """Strands wraps the botocore error, so the structured code is gone.

    A retirement that reads as a transient failure is a retirement nobody
    ever diagnoses, so the message is searched as well.
    """

    class Wrapped(Exception):
        pass

    wrapped = Wrapped("model invocation failed: ValidationException: end of life")
    assert bedrock.is_dead(wrapped) is True


# ── the diagnosis ───────────────────────────────────────────────────────────


def test_the_description_names_the_code_and_what_bedrock_said() -> None:
    """The whole point. "ValidationException" alone is equally true of four
    different problems with four different fixes."""
    described = bedrock.describe(
        FakeClientError("ValidationException", "The provided model identifier is invalid.")
    )
    assert "ValidationException" in described
    assert "provided model identifier is invalid" in described


def test_the_description_does_not_print_the_code_twice() -> None:
    described = bedrock.describe(FakeClientError("AccessDeniedException", "No access."))
    assert described.count("AccessDeniedException") == 1


def test_a_long_message_is_truncated() -> None:
    described = bedrock.describe(FakeClientError("ValidationException", "x" * 5000))
    assert len(described) < 400


def test_an_exception_with_no_bedrock_shape_still_describes() -> None:
    assert bedrock.describe(RuntimeError("socket closed")) == "RuntimeError: socket closed"
