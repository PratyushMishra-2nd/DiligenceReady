"""Which model answers, and what happens when AWS will not let one answer at all.

`bedrock.py` solves "the configured model id has been retired". This module
solves the larger problem underneath it, which we hit on a deployed stack and
could not fix with code, IAM, or a support ticket answered in time.

**A brand-new AWS account cannot invoke any Bedrock foundation model.** Not a
subset. Every id in the catalogue — Anthropic, Amazon Nova, Titan, Meta,
Mistral — returns the same thing from `Converse`:

    ValidationException: Operation not allowed

The discovery calls still work: `ListInferenceProfiles` cheerfully returns
thirty-two profiles this account may not call. Model access in the console is
no help either; the Model access page is retired, and submitting the
Anthropic use-case form answers "Your account is not authorized to perform
this action. Please create a support case." It is an account-level risk hold
that lifts when a billing cycle closes, and promotional credits do not close
one. Nothing about the error says so, which is why it reads as an IAM problem
for several hours before it reads as a waiting problem.

So the model layer needs a second provider, and choosing that provider was an
architectural decision rather than a shopping trip. A free hosted API (Groq,
AI Studio) would have been faster to wire and would have moved the only
inference in an AWS submission off AWS. Instead the fallback is **open
weights on our own EC2 instance, served by Ollama on localhost** — the same
VPC, the same instance, the same IAM boundary, billed as EC2 instance hours
that the account's credits already cover. The constraint moved the product
from managed inference to self-hosted inference without moving it off AWS.

What did not change is the part that matters. The numeric guard, the closure
that binds the agent to one company, the tool set, and the deterministic
template underneath all of it are provider-agnostic, because none of them
ever trusted the model. A 3B model on a CPU is a worse writer than Claude;
it is exactly as incapable of putting an unverified rupee on screen.

The order is Bedrock first, local second, for two reasons: Bedrock writes
better prose, and the day the account hold lifts the deployment should start
using it again without a redeploy. A permanent refusal retires that id for
the life of the process, so the cost of asking is one failed call per model
id per process, not one per request.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass

from diligence_api import bedrock
from diligence_engine.config import settings

BEDROCK = "bedrock"
OLLAMA = "ollama"

# What a local server is asked to load when nothing names a model. Small on
# purpose: every call this product makes is three sentences over figures that
# are already computed, or a short answer over tool results, and a 3B model
# quantised to 4 bits answers that on four vCPUs without a GPU in the
# account. Tool calling is why it is Qwen rather than a Llama of the same
# size — "Ask the ledger" is useless if the model cannot call a tool.
DEFAULT_LOCAL_MODEL = "qwen2.5:3b"

# How long one call to the local server may take. The agent's ceiling is the
# larger of the two because a question is several tool-calling turns, each
# one a generation of its own.
LOCAL_AGENT_TIMEOUT_SECONDS = 300

# Ollama's own errors. A model the server has not pulled is permanent for
# this process; a refused connection is not, because the unit may still be
# starting.
_MISSING_MODEL = ("not found", "no such model", "pull the model")

_lock = threading.Lock()
_retired_local: set[str] = set()
_local_catalogue: list[str] | None = None


@dataclass(frozen=True)
class Candidate:
    """One attempt: which provider, and which model id on it."""

    provider: str
    model_id: str

    def __str__(self) -> str:  # what /api/health prints
        return f"{self.provider}:{self.model_id}"


# ── what to try ─────────────────────────────────────────────────────────────


def _local_discovered() -> list[str]:
    """Ask the local server what it has pulled. Best effort, cached per process."""
    host = settings().ollama_host
    if not host:
        return []
    try:
        import ollama
    except ImportError:  # pragma: no cover - a deployment without the client
        return []
    try:
        listed = ollama.Client(host=host).list()
    except Exception:  # noqa: BLE001 - a server that is not up yet is not an error
        return []

    found: list[str] = []
    for model in getattr(listed, "models", None) or listed.get("models", []):  # type: ignore[union-attr]
        name = getattr(model, "model", None) or (
            model.get("model") if isinstance(model, dict) else None
        )
        if name:
            found.append(str(name))
    return found


def local_candidates() -> list[str]:
    """Local model ids to try, in order. Empty when no local server is configured."""
    global _local_catalogue

    if not settings().ollama_host:
        return []

    ordered: list[str] = []
    configured = settings().ollama_model or DEFAULT_LOCAL_MODEL
    ordered.append(configured)

    with _lock:
        if _local_catalogue is None:
            _local_catalogue = _local_discovered()
        ordered.extend(_local_catalogue)
        retired = set(_retired_local)

    return [name for name in dict.fromkeys(ordered) if name not in retired]


def plan() -> list[Candidate]:
    """Every model this process will try for one request, best first.

    `LLM_PROVIDER` pins the list when an operator wants one provider
    exercised: `bedrock` and `ollama` each drop the other, and `none` drops
    both, which is how CI runs the API without a model of any kind and still
    asserts that the deterministic path is what the interface reports.
    """
    provider = settings().llm_provider or "auto"
    if provider == "none":
        return []

    attempts: list[Candidate] = []
    if provider in ("auto", BEDROCK):
        try:
            attempts.extend(Candidate(BEDROCK, name) for name in bedrock.candidates())
        except Exception:  # noqa: BLE001 - a catalogue lookup must not take the layer down
            pass
    if provider in ("auto", OLLAMA):
        attempts.extend(Candidate(OLLAMA, name) for name in local_candidates())
    return attempts


def retire(candidate: Candidate) -> None:
    """Stop offering this model for the life of the process."""
    if candidate.provider == BEDROCK:
        bedrock.retire(candidate.model_id)
        return
    with _lock:
        _retired_local.add(candidate.model_id)


def forget() -> None:
    """Drop every cached catalogue and retirement. For tests."""
    global _local_catalogue
    bedrock.forget()
    with _lock:
        _local_catalogue = None
        _retired_local.clear()


# ── reading a failure ───────────────────────────────────────────────────────


def is_dead(candidate: Candidate, error: BaseException) -> bool:
    """True when this model will not work however the request is rewritten.

    For Bedrock that is a retirement, a denied model, or the account hold
    this module exists for. For a local server it is a model that has not
    been pulled. A refused connection is deliberately *not* permanent: the
    Ollama unit may still be loading a model into memory on a cold instance,
    and retiring the whole local provider over a slow start would take the
    feature down until the next deploy.
    """
    if candidate.provider == BEDROCK:
        return bedrock.is_dead(error)
    text = str(error).lower()
    return any(fragment in text for fragment in _MISSING_MODEL)


def describe(error: BaseException, limit: int = 300) -> str:
    """One line an operator can act on: the code, and what the provider said."""
    return bedrock.describe(error, limit=limit)


# ── calling one ─────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Completion:
    text: str
    stop_reason: str


def complete(
    candidate: Candidate,
    *,
    system: str,
    user: str,
    max_tokens: int,
    temperature: float,
    timeout_seconds: int,
    max_attempts: int,
) -> Completion:
    """One non-streaming completion. Raises whatever the provider raised."""
    if candidate.provider == BEDROCK:
        return _complete_bedrock(
            candidate.model_id,
            system=system,
            user=user,
            max_tokens=max_tokens,
            temperature=temperature,
            timeout_seconds=timeout_seconds,
            max_attempts=max_attempts,
        )
    return _complete_local(
        candidate.model_id,
        system=system,
        user=user,
        max_tokens=max_tokens,
        temperature=temperature,
        timeout_seconds=timeout_seconds,
    )


def _complete_bedrock(
    model_id: str,
    *,
    system: str,
    user: str,
    max_tokens: int,
    temperature: float,
    timeout_seconds: int,
    max_attempts: int,
) -> Completion:
    import boto3
    from botocore.config import Config

    client = boto3.client(
        "bedrock-runtime",
        region_name=settings().bedrock_region or None,
        config=Config(
            read_timeout=timeout_seconds,
            connect_timeout=5,
            retries={"max_attempts": max_attempts, "mode": "standard"},
        ),
    )
    response = client.converse(
        modelId=model_id,
        system=[{"text": system}],
        messages=[{"role": "user", "content": [{"text": user}]}],
        inferenceConfig={"maxTokens": max_tokens, "temperature": temperature},
    )
    message = response.get("output", {}).get("message", {})
    # A reasoning-capable model returns `reasoningContent` blocks alongside
    # the answer. Those are the model's working, not its output, and
    # concatenating them would put unchecked numbers on a CA's screen.
    parts = [block["text"] for block in message.get("content", []) if "text" in block]
    return Completion(
        text="".join(parts).strip(),
        stop_reason=str(response.get("stopReason") or ""),
    )


def _complete_local(
    model_id: str,
    *,
    system: str,
    user: str,
    max_tokens: int,
    temperature: float,
    timeout_seconds: int,
) -> Completion:
    """Ollama's chat endpoint, on the loopback address of this instance.

    The timeout is generous next to Bedrock's because the arithmetic is
    different: four vCPUs and no GPU generate single-digit tokens a second,
    so three sentences is tens of seconds rather than one. That is a cost the
    explanation panel can pay — it renders the deterministic sentence first
    and the model only improves on it.
    """
    import ollama

    client = ollama.Client(host=settings().ollama_host, timeout=timeout_seconds)
    response = client.chat(
        model=model_id,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        options={"temperature": temperature, "num_predict": max_tokens},
        stream=False,
    )
    message = getattr(response, "message", None) or response.get("message", {})  # type: ignore[union-attr]
    text = getattr(message, "content", None) or (
        message.get("content", "") if isinstance(message, dict) else ""
    )
    reason = getattr(response, "done_reason", None) or (
        response.get("done_reason") if isinstance(response, dict) else ""
    )
    # Ollama says "length" where Bedrock says "max_tokens". Callers check one
    # word, so the translation belongs here rather than in every caller.
    stop = "max_tokens" if reason == "length" else str(reason or "end_turn")
    return Completion(text=(text or "").strip(), stop_reason=stop)


def strands_model(candidate: Candidate, *, max_tokens: int, temperature: float):
    """The Strands model object for this candidate.

    Strands ships a provider per backend and they take different arguments,
    which is the whole of the difference between running the agent on Bedrock
    and running it on the instance's own GPU-less CPU. The agent above this
    call does not know which it got.
    """
    if candidate.provider == BEDROCK:
        from strands.models import BedrockModel

        return BedrockModel(
            model_id=candidate.model_id,
            region_name=settings().bedrock_region or None,
            max_tokens=max_tokens,
            temperature=temperature,
            streaming=False,
        )

    from strands.models.ollama import OllamaModel

    return OllamaModel(
        host=settings().ollama_host,
        # Without this the client waits forever. On two vCPUs a long answer
        # is a minute, so the ceiling is generous, but a model server that
        # has wedged must not hold an agent run open for the life of the
        # process.
        ollama_client_args={"timeout": LOCAL_AGENT_TIMEOUT_SECONDS},
        model_id=candidate.model_id,
        max_tokens=max_tokens,
        temperature=temperature,
        # The model has to stay resident. Reloading three gigabytes from disk
        # between tool calls turns one question into minutes, and the agent
        # loop makes several calls per question by design.
        keep_alive="30m",
    )
