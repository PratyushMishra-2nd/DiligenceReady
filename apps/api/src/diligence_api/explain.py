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

When no API key is configured the deterministic fallback is used and the
result is labelled `template`, never passed off as model prose.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-opus-5")

# Thinking is on by default on this model and its tokens count against
# max_tokens, so a budget sized for the prose alone gets spent before any
# text is produced. Three sentences need very little; the headroom is for
# the reasoning in front of them.
MAX_TOKENS = 8000

# The SDK default is ten minutes, and timeouts are retried. An explanation
# nobody is waiting for any more is worth less than a free connection.
TIMEOUT_SECONDS = 30.0

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


# Any run of digits with optional separators and decimals.
_NUMERIC = re.compile(r"\d[\d,]*(?:\.\d+)?")

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
# model writing "one supplier" in digits gets rejected when 1 is not in the
# metrics — and that cost is paid in the right direction: a rejection falls
# back to the deterministic text, which is correct but plainer. A wrong
# number shown as checked is not recoverable.


def _numbers_in(text: str) -> set[Decimal]:
    found = set()
    for raw in _NUMERIC.findall(text):
        try:
            found.add(Decimal(raw.replace(",", "")))
        except InvalidOperation:
            continue
    return found


def check_no_invented_numbers(generated: str, source_facts: str) -> str | None:
    """Return a reason string when the prose contains a number the facts do not.

    A model that rounds 4,82,000 to "4.8 lakh" fails this check. That is the
    intended strictness: a figure a reader cannot find in the evidence is
    exactly the thing this product exists not to produce.
    """
    allowed = _numbers_in(source_facts)
    for value in _numbers_in(generated):
        if value not in allowed:
            return f"generated prose contains {value}, which is not in the finding"
    return None


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


def explain(risk: dict) -> Explanation:
    """Write the explanation for one finished risk."""
    facts = render_facts(risk)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return Explanation(
            text=deterministic_explanation(risk),
            source="template",
            rejected_reason="no ANTHROPIC_API_KEY configured",
        )

    try:
        import anthropic
    except ImportError:
        return Explanation(
            text=deterministic_explanation(risk),
            source="template",
            rejected_reason="anthropic SDK is not installed",
        )

    client = anthropic.Anthropic(timeout=TIMEOUT_SECONDS, max_retries=1)
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            # Simple, high-volume, latency-sensitive prose. Thinking stays on
            # by default; effort is dropped because depth buys nothing here.
            output_config={"effort": "low"},
            messages=[{"role": "user", "content": facts}],
        )
    except Exception as error:  # noqa: BLE001 - the UI must degrade, not 500
        return Explanation(
            text=deterministic_explanation(risk),
            source="template",
            rejected_reason=f"model call failed: {type(error).__name__}",
        )

    if response.stop_reason == "max_tokens":
        # Truncated mid-sentence. Shipping half a paragraph under a model
        # attribution is worse than shipping the plain version.
        return Explanation(
            text=deterministic_explanation(risk),
            source="template",
            rejected_reason="model response hit the token limit and was cut off",
        )

    if response.stop_reason == "refusal":
        return Explanation(
            text=deterministic_explanation(risk),
            source="template",
            rejected_reason="model declined the request",
        )

    generated = "".join(block.text for block in response.content if block.type == "text").strip()

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

    return Explanation(text=generated, source="model", model=MODEL)
