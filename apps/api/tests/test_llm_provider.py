"""Which provider answers, and what happens when AWS will not let one.

These tests exist because of the second model-layer failure this project
hit, and it was larger than the first. The account could not invoke *any*
Bedrock foundation model: every id in the catalogue — Anthropic, Amazon
Nova, Meta, Mistral — answered `ValidationException: Operation not allowed`,
in two regions, because a new AWS account is held back from foundation
models until a billing cycle closes. Credits do not close one.

The fix was a second provider: open weights served by Ollama on the API
instance itself, which keeps the inference on AWS compute inside the same
VPC. What is tested here is the fall-through, not the models. Nothing below
touches the network, and nothing below asserts anything about the quality of
a sentence — the numeric guard already owns that, and it does not care which
provider wrote the words.
"""

from __future__ import annotations

from dataclasses import replace

import pytest

from diligence_api import llm
from diligence_engine.config import settings


class FakeClientError(Exception):
    """The shape botocore raises for the account hold."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(
            f"An error occurred ({code}) when calling the Converse operation: {message}"
        )
        self.response = {"Error": {"Code": code, "Message": message}}


BEDROCK_ID = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
LOCAL_ID = "qwen2.5:3b"


@pytest.fixture(autouse=True)
def clean():
    llm.forget()
    yield
    llm.forget()


@pytest.fixture
def configure(monkeypatch):
    """Set the model-layer settings without touching the process environment."""

    def install(**overrides):
        value = replace(settings(), **overrides)
        monkeypatch.setattr(llm, "settings", lambda: value)
        return value

    return install


@pytest.fixture
def catalogues(monkeypatch):
    """Fixed answers from both providers' discovery calls."""

    def install(bedrock_ids: list[str], local_ids: list[str]) -> None:
        monkeypatch.setattr(llm.bedrock, "candidates", lambda: list(bedrock_ids))
        monkeypatch.setattr(llm, "_local_discovered", lambda: list(local_ids))

    return install


# ── the order the providers are tried in ────────────────────────────────────


def test_bedrock_is_tried_before_the_local_model(configure, catalogues) -> None:
    """Managed inference writes better prose, so it keeps first refusal.

    It also means the day the account hold lifts, the deployment starts
    using Bedrock again without a redeploy.
    """
    configure(llm_provider="auto", ollama_host="http://127.0.0.1:11434", ollama_model=LOCAL_ID)
    catalogues([BEDROCK_ID], [])

    assert [item.provider for item in llm.plan()] == [llm.BEDROCK, llm.OLLAMA]


def test_local_model_is_offered_when_bedrock_has_nothing(configure, catalogues) -> None:
    configure(llm_provider="auto", ollama_host="http://127.0.0.1:11434", ollama_model=LOCAL_ID)
    catalogues([], [])

    assert llm.plan() == [llm.Candidate(llm.OLLAMA, LOCAL_ID)]


def test_no_local_host_means_no_local_candidates(configure, catalogues) -> None:
    """A laptop and CI have no model server, and must not pretend to."""
    configure(llm_provider="auto", ollama_host="", ollama_model="")
    catalogues([], [])

    assert llm.plan() == []


def test_pulled_models_widen_the_list_but_the_configured_one_leads(configure, catalogues) -> None:
    configure(llm_provider="ollama", ollama_host="http://127.0.0.1:11434", ollama_model=LOCAL_ID)
    catalogues([], ["llama3.2:3b", LOCAL_ID])

    assert [item.model_id for item in llm.plan()] == [LOCAL_ID, "llama3.2:3b"]


def test_provider_can_be_pinned_to_one_of_them(configure, catalogues) -> None:
    configure(llm_provider="bedrock", ollama_host="http://127.0.0.1:11434", ollama_model=LOCAL_ID)
    catalogues([BEDROCK_ID], [])
    assert [item.provider for item in llm.plan()] == [llm.BEDROCK]

    configure(llm_provider="ollama", ollama_host="http://127.0.0.1:11434", ollama_model=LOCAL_ID)
    assert [item.provider for item in llm.plan()] == [llm.OLLAMA]


def test_provider_none_disables_the_model_layer_entirely(configure, catalogues) -> None:
    """What CI runs. The deterministic template is the whole answer."""
    configure(llm_provider="none", ollama_host="http://127.0.0.1:11434", ollama_model=LOCAL_ID)
    catalogues([BEDROCK_ID], [LOCAL_ID])

    assert llm.plan() == []


def test_a_broken_bedrock_catalogue_does_not_hide_the_local_model(configure, monkeypatch) -> None:
    """Discovery is a listing call, and listing calls can be denied.

    Losing Bedrock's catalogue must cost Bedrock's candidates and nothing
    else — on this deployment the local model is the one that answers.
    """
    configure(llm_provider="auto", ollama_host="http://127.0.0.1:11434", ollama_model=LOCAL_ID)

    def explode() -> list[str]:
        raise RuntimeError("AccessDenied: bedrock:ListFoundationModels")

    monkeypatch.setattr(llm.bedrock, "candidates", explode)
    monkeypatch.setattr(llm, "_local_discovered", list)

    assert llm.plan() == [llm.Candidate(llm.OLLAMA, LOCAL_ID)]


# ── reading a failure ───────────────────────────────────────────────────────


def test_the_account_hold_is_permanent_for_the_process(configure, monkeypatch) -> None:
    """`Operation not allowed` is the hold. Retrying it every request is waste.

    Bedrock's own discovery is stubbed here rather than its candidate list,
    because what is being tested is that a retirement actually removes the
    id — the fall-through to the local model is only real if it does.
    """
    configure(llm_provider="auto", ollama_host="http://127.0.0.1:11434", ollama_model=LOCAL_ID)
    monkeypatch.setattr(llm.bedrock, "_discover", lambda: [BEDROCK_ID])
    monkeypatch.setattr(llm, "_local_discovered", list)

    hold = FakeClientError("ValidationException", "Operation not allowed")
    candidate = llm.Candidate(llm.BEDROCK, BEDROCK_ID)

    assert llm.is_dead(candidate, hold) is True
    llm.retire(candidate)
    assert llm.plan() == [llm.Candidate(llm.OLLAMA, LOCAL_ID)]


def test_a_model_the_server_has_not_pulled_is_permanent(configure, catalogues) -> None:
    configure(llm_provider="ollama", ollama_host="http://127.0.0.1:11434", ollama_model=LOCAL_ID)
    catalogues([], [])

    candidate = llm.Candidate(llm.OLLAMA, LOCAL_ID)
    missing = RuntimeError('model "qwen2.5:3b" not found, try pulling it first')

    assert llm.is_dead(candidate, missing) is True
    llm.retire(candidate)
    assert llm.plan() == []


def test_a_refused_connection_is_not_permanent(configure) -> None:
    """The unit may still be loading three gigabytes off disk.

    Retiring the local provider over a cold start would take the feature
    down until the next deploy, on the one deployment where it is the only
    provider that can answer.
    """
    configure(llm_provider="ollama", ollama_host="http://127.0.0.1:11434", ollama_model=LOCAL_ID)
    candidate = llm.Candidate(llm.OLLAMA, LOCAL_ID)

    assert llm.is_dead(candidate, ConnectionError("[Errno 111] Connection refused")) is False


def test_a_candidate_prints_as_provider_and_model(configure) -> None:
    """This string is what /api/health shows and what a rejection names."""
    assert str(llm.Candidate(llm.OLLAMA, LOCAL_ID)) == "ollama:qwen2.5:3b"


def test_describe_names_what_the_provider_actually_said() -> None:
    """The whole point of the module it delegates to.

    `ValidationException` alone is equally true of a retired model, an
    unapproved model, a malformed request, and an account that AWS will not
    let invoke anything at all. Only the message tells them apart, and only
    one of the four is fixed by waiting.
    """
    described = llm.describe(FakeClientError("ValidationException", "Operation not allowed"))

    assert described == "ValidationException: Operation not allowed"
