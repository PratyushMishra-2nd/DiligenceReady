"""The explanation layer. The only place a model is called, and it cannot count.

Blueprint §06 draws the line: code owns arithmetic, aggregation, matching,
thresholds, ageing, percentages and risk creation; the model owns document
extraction, party-name normalisation and natural-language explanation. The
sentence that wins the Q&A is:

    You don't have to trust the model for the number. The number is a SQL
    aggregate over a match table. The model only writes the sentence
    explaining it.

That claim is worth only as much as its enforcement, so it is enforced three
ways rather than asserted:

1.  **Structural.** This module lives in the API package. `diligence_engine`
    imports no model client at all, so no rule, matcher or aggregate can
    reach one even by accident.
2.  **By input.** The model is handed a finished risk object — the figures
    the engine already computed — and never a document, a file or a table.
    It has nothing to count.
3.  **By output.** Every numeric token in the generated prose is checked
    against the numbers that went in. A figure the model invented, or
    rounded differently, fails the check and the explanation is rejected
    rather than shown.

The model is reached through **Amazon Bedrock**, using the Converse API. There
is no second provider. When Bedrock is not configured or the call fails, the
deterministic fallback is used and the result is labelled `template` — never
passed off as model prose. That fallback is what makes the repository runnable
by someone who clones it without an AWS account: the product works, the
sentences are plainer, and the interface says which it is showing.
"""

from __future__ import annotations

from dataclasses import dataclass

from diligence_api import bedrock
from diligence_api.numeric_guard import check
from diligence_engine.config import settings

# Generous enough for three sentences with room to spare, small enough that a
# runaway generation is cheap. The guard below rejects long prose anyway.
MAX_TOKENS = 1024

# Deterministic-ish. This is a formatting task over supplied facts, not a
# creative one, and a lower temperature means fewer rejected generations —
# every rejection costs a call and shows the reader the plainer text.
TEMPERATURE = 0.2

# The Bedrock SDK's default socket timeout is 60s and it retries. An
# explanation nobody is waiting for any more is worth less than a free
# connection back to the pool.
TIMEOUT_SECONDS = 30
MAX_ATTEMPTS = 2

SYSTEM_PROMPT = """You explain financial reconciliation findings to a chartered \
accountant in practice in India.

You are given a finding that has already been computed. Every figure in it was \
produced by SQL over reconciled records before you were called.

Rules, in order of importance:

1. Never state a number that is not already present in the finding you were \
given. Do not compute, sum, convert, re-round or restate a figure in different \
units. If a number would help and it is not in the finding, write around it.
2. Write two or three sentences. No preamble, no bullet points, no headings.
3. Say what happened, why it matters commercially or statutorily, and what the \
CA should do next. The reader knows GST law; do not explain what input tax \
credit is.
4. Use plain professional English. No marketing tone, no hedging, no "it \
appears that". If the finding is uncertain, the finding says so and you can \
repeat that.
5. Refer to amounts the way the finding writes them."""


@dataclass(frozen=True)
class Explanation:
    text: str
    source: str  # model | template
    model: str | None = None
    rejected_reason: str | None = None


# The numeric guard lives in `numeric_guard`, shared with the Strands agent.
#
# There is no waiver.
#
# There used to be one — any value at or below 31 was skipped as "ordinary
# prose" — and it waved through exactly the case this module's docstring
# advertises catching: 4,82,000 rounded to "about 4.8 lakh" passed, because
# 4.8 was under the limit. So did every concentration percentage and day
# count a CA acts on; the model could write 28% where the finding said 60.99%
# and it was shown as verified prose.
#
# Any number in the sentence must appear in the finding. The cost is that a
# rejection falls back to the deterministic text, which is correct but
# plainer. A wrong number shown as checked is not recoverable.


def check_no_invented_numbers(generated: str, source_facts: str) -> str | None:
    """Return a reason string when the prose contains a number the facts do not."""
    return check(generated, source_facts)


def render_facts(risk: dict) -> str:
    """The finding, flattened to the only thing the model is allowed to see."""
    lines = [
        f"Rule: {risk['rule_code']} ({risk.get('title', '')})",
        f"Severity: {risk['severity']}",
        f"Period: {risk['period']}",
        f"Threshold crossed: {risk['rule_text']}",
        f"Calculation: {risk['calculation']}",
    ]
    metrics = risk.get("metrics") or {}
    for key, value in metrics.items():
        lines.append(f"{key}: {value}")
    return "\n".join(lines)


def deterministic_explanation(risk: dict) -> str:
    """The fallback, and the shape the model is asked to improve on."""
    return (
        f"{risk['rule_text']} {risk['calculation']}. "
        f"Recorded as {risk['severity']} severity for {risk['period']}."
    )


# ── Bedrock ─────────────────────────────────────────────────────────────────


def bedrock_client():
    """A Bedrock runtime client with this module's timeouts.

    Not cached: the client is cheap next to a model call, and caching it
    across a config change during a deploy is a debugging session nobody
    needs. Credentials come from the instance role.
    """
    import boto3
    from botocore.config import Config

    return boto3.client(
        "bedrock-runtime",
        region_name=settings().bedrock_region or None,
        config=Config(
            read_timeout=TIMEOUT_SECONDS,
            connect_timeout=5,
            retries={"max_attempts": MAX_ATTEMPTS, "mode": "standard"},
        ),
    )


def _text_of(message: dict) -> str:
    """Join the text blocks of a Converse reply, ignoring everything else.

    A reasoning-capable model returns `reasoningContent` blocks alongside the
    answer. Those are the model's working, not its output, and concatenating
    them into the shown prose would put unchecked numbers on a CA's screen.
    """
    parts = [block["text"] for block in message.get("content", []) if "text" in block]
    return "".join(parts).strip()


def explain(risk: dict) -> Explanation:
    """Write the explanation for one finished risk."""
    facts = render_facts(risk)

    available = bedrock.candidates()
    if not available:
        return Explanation(
            text=deterministic_explanation(risk),
            source="template",
            rejected_reason=(
                "no Bedrock model is configured or reachable; run "
                "`diligence bedrock models` to see what this account can call"
            ),
        )

    # Try each candidate once. A model that is retired, unapproved, or only
    # reachable through an inference profile is dropped for the life of the
    # process rather than retried on every finding — see `bedrock.py` for the
    # retired model id that is the reason this is a loop.
    client = bedrock_client()
    response = None
    model_id = ""
    failure = ""
    for candidate in available:
        try:
            response = client.converse(
                modelId=candidate,
                system=[{"text": SYSTEM_PROMPT}],
                messages=[{"role": "user", "content": [{"text": facts}]}],
                inferenceConfig={"maxTokens": MAX_TOKENS, "temperature": TEMPERATURE},
            )
        except Exception as error:  # noqa: BLE001 - the UI must degrade, not 500
            failure = f"Bedrock call failed: {bedrock.describe(error)}"
            if bedrock.is_dead(error):
                bedrock.retire(candidate)
                continue
            # Throttled, timed out, or a network fault. Another model would
            # hit the same wall, and the plain sentence is already correct.
            break
        model_id = candidate
        break

    if response is None:
        return Explanation(
            text=deterministic_explanation(risk),
            source="template",
            rejected_reason=failure or "no Bedrock model answered",
        )

    stop_reason = response.get("stopReason")

    if stop_reason == "max_tokens":
        # Truncated mid-sentence. Shipping half a paragraph under a model
        # attribution is worse than shipping the plain version.
        return Explanation(
            text=deterministic_explanation(risk),
            source="template",
            rejected_reason="model response hit the token limit and was cut off",
        )

    if stop_reason in ("content_filtered", "guardrail_intervened"):
        return Explanation(
            text=deterministic_explanation(risk),
            source="template",
            rejected_reason=f"Bedrock stopped the response ({stop_reason})",
        )

    generated = _text_of(response.get("output", {}).get("message", {}))

    if not generated:
        return Explanation(
            text=deterministic_explanation(risk),
            source="template",
            rejected_reason="model returned no text",
        )

    problem = check_no_invented_numbers(generated, facts)
    if problem:
        return Explanation(
            text=deterministic_explanation(risk),
            source="template",
            rejected_reason=problem,
        )

    return Explanation(text=generated, source="model", model=model_id)
