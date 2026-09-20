"""Ask the ledger — a Strands agent that orchestrates but never calculates.

Strands Agents is AWS's open-source agent SDK. It runs here on whichever
model `llm.py` can reach — Amazon Bedrock when the account is allowed to
invoke one, and otherwise the open-weights model served on this instance,
which is what the deployed stack actually uses. The SDK's provider objects
differ; nothing below this line does. The point of putting an agent in a
product whose entire claim is "the model never produces a number" is that it
makes the claim *legible*.
The agent decides which questions to ask the database. The database answers
them. Then the same numeric guard that governs `/explain` checks the reply.

Three things hold the line, and none of them is a sentence in a prompt:

1.  **The company is a closure, not a parameter.** Every tool below is built
    around one `company_id` that was resolved and Cedar-authorised before the
    agent existed. There is no tool that takes a company, so there is no
    prompt injection that reaches another firm's books. A user who asks
    "now show me Acme's figures" gets told the agent cannot see them —
    because it cannot.

2.  **Tools return the engine's own aggregates.** Each one calls the same
    `diligence_engine.reporting` function the dashboard and the CLI call.
    There is no second query written for the agent, so there is no second
    set of numbers to disagree with the first.

3.  **Every numeric token in the answer must appear in a tool result.** The
    tools record what they returned; the answer is checked against that
    record. An agent that adds two figures together and reports the sum is
    refused — the sum is arithmetic, and arithmetic is the engine's job.
    The refusal is shown to the user as a refusal, not smoothed over.

What the user sees alongside the answer is the list of tools that ran. That
is the audit trail for a sentence, and it is why this is worth having in a
product a chartered accountant signs their name under.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from diligence_api import llm
from diligence_api.numeric_guard import check
from diligence_engine import reporting
from diligence_engine.db import connect

MAX_TOKENS = 2048
TEMPERATURE = 0.2

# A question about one month's reconciliation does not need twenty tool
# calls. The cap is a cost ceiling and a latency ceiling, and hitting it is
# reported rather than hidden.
MAX_TURNS = 8

QUESTION_LIMIT = 500

SYSTEM_PROMPT = """You answer questions about one company's reconciled books \
for a chartered accountant in practice in India.

You have read-only tools over a reconciliation engine. Every figure they \
return was computed by SQL over matched records.

Rules, in order of importance:

1. Never state a number that a tool did not return to you. Do not add, \
subtract, total, average, convert, re-round or restate figures. If the \
accountant asks for a total that no tool returns, say which figures you can \
see and that the total is not one of them. This is the most important rule: \
your answer is rejected outright if it contains a number no tool produced.
2. "A number" means every digit you write, not only rupee amounts. \
Counts ("9 findings"), rankings ("the top 3"), day counts ("due in 12 \
days"), percentages and dates are rejected too, unless they appear in a \
tool result exactly as you write them. If you want to say how many of \
something there are and no tool returned that count, name them instead \
of counting them.
3. Call tools before answering. Do not answer from memory or from the \
question's own wording.
4. Be brief. Three or four sentences. The reader is busy and knows GST law.
5. You can see exactly one company. If asked about another, say you cannot \
see it.
6. Quote amounts exactly as the tools write them, including the rupee \
formatting and decimals."""


@dataclass
class LedgerAnswer:
    text: str
    source: str  # agent | refused | unavailable
    model: str | None = None
    tools_called: list[str] = field(default_factory=list)
    rejected_reason: str | None = None


def check_answer(generated: str, facts: str) -> str | None:
    """The same rule `/explain` runs, applied to what the tools returned.

    An agent that totals two figures it was handed is the failure mode this
    exists for: the sum is arithmetic, arithmetic is the engine's job, and a
    number the accountant cannot find in a tool result is a number they
    cannot defend in an assessment.
    """
    return check(generated, facts, subject="the agent's answer")


def _json(value: Any) -> str:
    """Tool output as JSON. Decimals become strings, never floats."""

    def coerce(item: Any) -> Any:
        if isinstance(item, Decimal):
            return str(item)
        if isinstance(item, dict):
            return {key: coerce(sub) for key, sub in item.items()}
        if isinstance(item, list):
            return [coerce(sub) for sub in item]
        return item

    return json.dumps(coerce(value), default=str)


def build_tools(company_id: str, recorder: list[str]) -> list:
    """The read-only tool set, bound to one company.

    `recorder` accumulates every byte a tool returned. It is what the answer
    is checked against, so a tool that is called but whose result is ignored
    still widens the set of numbers the agent is allowed to quote — which is
    correct: the accountant can see that result too, in the same panel.
    """
    import uuid as _uuid

    from strands import tool

    identifier = _uuid.UUID(company_id)

    def record(name: str, payload: str) -> str:
        recorder.append(payload)
        return payload

    @tool
    def list_periods() -> str:
        """List every accounting period this company has data for.

        Returns each period with its filing status, whether GSTR-2B has been
        generated, whether GSTR-3B was filed, and how many findings are open.
        Call this first when the accountant does not name a month.
        """
        with connect() as conn:
            return record("list_periods", _json(reporting.periods(conn, identifier)))

    @tool
    def get_readiness(period: str) -> str:
        """Get the reconciliation summary for one period.

        Coverage against GSTR-2B and the bank, input tax credit at risk,
        Rule 37A reversals, bank variance, unidentified deposits, revenue
        concentration, and the count of findings by severity.

        Args:
            period: The accounting period as YYYY-MM, for example 2026-08.
        """
        with connect() as conn:
            return record("get_readiness", _json(reporting.readiness(conn, identifier, period)))

    @tool
    def list_findings(period: str) -> str:
        """List the findings the rule engine raised for one period.

        Each finding carries its rule code, severity, headline amount, the
        threshold it crossed, the calculation behind it, the accountant's
        recorded status, and how many pieces of evidence support it. Ordered
        by severity, then by amount.

        Args:
            period: The accounting period as YYYY-MM, for example 2026-08.
        """
        with connect() as conn:
            return record("list_findings", _json(reporting.risks(conn, identifier, period)))

    @tool
    def get_finding(risk_id: str) -> str:
        """Get one finding in full, with its match breakdown and evidence rows.

        Use this after list_findings when the accountant asks why a specific
        finding was raised. The evidence rows name the source file and the
        row number inside it.

        Args:
            risk_id: The risk_id from a list_findings result.
        """
        with connect() as conn:
            detail = reporting.risk_detail(conn, _uuid.UUID(risk_id))
            if detail is None or str(detail.risk.get("company_id")) != company_id:
                # Belt and braces around the closure: a hallucinated uuid
                # must not reach another firm's finding.
                return record("get_finding", _json({"error": "no such finding"}))
            return record(
                "get_finding",
                _json(
                    {
                        "risk": detail.risk,
                        "match": detail.match,
                        "evidence": [vars(item) for item in detail.evidence],
                    }
                ),
            )

    @tool
    def get_other_itc(period: str) -> str:
        """Get the non-B2B parts of GSTR-2B for one period.

        Credit and debit notes, ISD distributions, imports of goods and
        services, and the net note adjustment. Use this when the accountant
        asks why 2B and the purchase register differ by more than the B2B
        section explains.

        Args:
            period: The accounting period as YYYY-MM, for example 2026-08.
        """
        with connect() as conn:
            return record("get_other_itc", _json(reporting.other_itc(conn, identifier, period)))

    return [list_periods, get_readiness, list_findings, get_finding, get_other_itc]


def latest_period(company_id: str) -> str | None:
    """The most recent period this company has data for, from the engine.

    The agent used to be left to work this out, and on a small model it
    frequently did not: asked "what is the largest exposure this month",
    it read "this month" as today's calendar month, called `get_readiness`
    for a period with nothing in it, and reported ₹0.00 with complete
    coverage. Every figure in that answer was real — it came from a tool,
    so the guard passed it — and the answer was still useless, because the
    question and the data were about different months.

    That is not a prompt problem, it is a missing fact. Which period has
    data is a SQL question the engine already answers for the dashboard, so
    it is answered here once, in code, and handed to the model as context.
    The model still chooses which tools to call; it no longer has to guess
    what "this month" means.
    """
    with connect() as conn:
        found = reporting.periods(conn, _uuid_of(company_id))
    if not found:
        return None
    # `periods` is ordered newest first, and "newest" is not the answer. A
    # period row appears as soon as any feed carries a date inside it, so two
    # bank value-dates spilling into the new month create a September that has
    # no GSTR-2B and nothing reconciled against it. The company page picks the
    # newest period that has a 2B for exactly this reason (2B for month M
    # generates on the 14th of M+1, so a CA opening this on 20 September is
    # working on August), and the agent has to agree with the page it sits
    # next to, or the panel and the screen behind it name different months.
    reconciled = [entry for entry in found if entry.get("gstr2b_generated")]
    chosen = reconciled[0] if reconciled else found[0]
    return str(chosen["period"])


def _uuid_of(company_id: str):
    import uuid as _uuid

    return _uuid.UUID(company_id)


def _answer_text(message: Any) -> str:
    content = (message or {}).get("content", []) if isinstance(message, dict) else []
    parts = [block["text"] for block in content if isinstance(block, dict) and "text" in block]
    return "".join(parts).strip()


def ask(company_id: str, question: str) -> LedgerAnswer:
    """Run one question against one company's reconciled books."""
    question = (question or "").strip()
    if not question:
        return LedgerAnswer(text="", source="refused", rejected_reason="empty question")
    if len(question) > QUESTION_LIMIT:
        return LedgerAnswer(
            text="",
            source="refused",
            rejected_reason=f"question is longer than {QUESTION_LIMIT} characters",
        )

    available = llm.plan()
    if not available:
        return LedgerAnswer(
            text="",
            source="unavailable",
            rejected_reason=(
                "no model is configured or reachable; run "
                "`diligence bedrock models` to see what this account can call, "
                "or set OLLAMA_HOST to use the model on this instance"
            ),
        )

    try:
        from strands import Agent
    except ImportError:
        return LedgerAnswer(
            text="", source="unavailable", rejected_reason="strands-agents is not installed"
        )

    try:
        build_tools(company_id, [])
    except ValueError:
        return LedgerAnswer(text="", source="refused", rejected_reason="company_id is not a uuid")

    # The one fact the model should not have to infer. See `latest_period`.
    prompt = SYSTEM_PROMPT
    try:
        current = latest_period(company_id)
    except Exception:  # noqa: BLE001 - a missing hint is worse prose, not an outage
        current = None
    if current:
        prompt = (
            f"{SYSTEM_PROMPT}\n\nThe most recent period this company has data for is "
            f"{current}. When the accountant says this month, the latest month, "
            f"or names no month at all, they mean {current}. Do not assume "
            f"today's calendar month has been reconciled."
        )

    # One attempt per candidate, Bedrock before the local server. A model id
    # that Bedrock has retired — or that the account is not yet allowed to
    # invoke at all — fails every call identically, and before this loop
    # existed that failure was the whole feature dark from the moment it
    # deployed. See `bedrock.py` and `llm.py`. The recorder is rebuilt per
    # attempt: a half-finished run must not widen the set of numbers the next
    # attempt is allowed to quote.
    result = None
    agent = None
    model_id = ""
    recorder: list[str] = []
    failure = ""
    # A provider that throttled or timed out is stalled, not broken, and its
    # other model ids are behind the same wall. Without this, one throttled
    # Bedrock account turns a single question into thirty sequential agent
    # runs of up to eight tool-calling turns each, and the caller waits for
    # all of them to fail before seeing the refusal. A dead id is different:
    # it is retired individually, because the next id on the same provider is
    # exactly what should answer.
    stalled: set[str] = set()
    for candidate in available:
        if candidate.provider in stalled:
            continue
        recorder = []
        try:
            model = llm.strands_model(candidate, max_tokens=MAX_TOKENS, temperature=TEMPERATURE)
        except ImportError as error:
            # The SDK extra for this provider is not installed. That is a
            # property of the deployment, not of the model id, so it retires
            # the candidate and tries the next one.
            failure = f"{candidate} is not usable here: {error}"
            llm.retire(candidate)
            continue
        agent = Agent(
            model=model,
            tools=build_tools(company_id, recorder),
            system_prompt=prompt,
            callback_handler=None,  # nothing is printed to the server's stdout
        )
        try:
            result = agent(question)
        except Exception as error:  # noqa: BLE001 - the panel degrades, it does not 500
            failure = f"agent run failed on {candidate}: {llm.describe(error)}"
            if llm.is_dead(candidate, error):
                llm.retire(candidate)
            else:
                stalled.add(candidate.provider)
            continue
        model_id = str(candidate)
        break

    if result is None:
        return LedgerAnswer(
            text="",
            source="unavailable",
            rejected_reason=failure or "no model answered",
        )

    called = sorted({name for name in _tool_names(result)})
    generated = _answer_text(result.message)

    if not generated:
        return LedgerAnswer(
            text="",
            source="refused",
            model=model_id,
            tools_called=called,
            rejected_reason=f"the agent returned no text (stop reason: {result.stop_reason})",
        )

    if not recorder:
        # It answered without looking. Whatever it said, it did not come from
        # this company's books, which is the only thing this endpoint is for.
        return LedgerAnswer(
            text="",
            source="refused",
            model=model_id,
            tools_called=called,
            rejected_reason="the agent answered without querying the ledger",
        )

    problem = check_answer(generated, "\n".join(recorder))

    if problem and agent is not None:
        # One correction, and only one.
        #
        # This does not soften the guard: the retry is checked by exactly
        # the same rule, and a second failure is still a refusal shown as a
        # refusal. What it buys is the case the guard is designed to catch
        # and a smaller model walks into often — a figure the model
        # totalled, rounded, or carried over from the question rather than
        # read out of a tool result. Told which token was rejected, it
        # usually quotes the tool instead, and the accountant gets the
        # answer the tools already support.
        #
        # This became worth doing when the model layer moved from Claude on
        # Bedrock to a 3B model on this instance. The rejection rate went up
        # because the writer got smaller, not because the books got harder,
        # and a panel that refuses a good question is a panel nobody opens
        # twice.
        correction = (
            f"Your answer was rejected: {problem}. Every number you write "
            "must appear in a tool result exactly as the tool wrote it. Do "
            "not add, total, round or reformat. If the figure the "
            "accountant asked for is not in any tool result, say so and "
            "give the figures that are. Answer again."
        )
        try:
            retried = agent(correction)
        except Exception as error:  # noqa: BLE001 - the panel degrades, it does not 500
            retried = None
            failure = f"agent retry failed on {model_id}: {llm.describe(error)}"
        if retried is not None:
            retried_text = _answer_text(retried.message)
            called = sorted({name for name in _tool_names(retried)})
            if retried_text:
                second = check_answer(retried_text, "\n".join(recorder))
                if second is None:
                    generated, problem = retried_text, None
                else:
                    problem = second

    if problem:
        return LedgerAnswer(
            text="",
            source="refused",
            model=model_id,
            tools_called=called,
            # If the correction itself crashed, that is the more useful half
            # of the story: without it an operator sees only the guard's
            # message and concludes corrections never fire.
            rejected_reason=f"{problem} ({failure})" if failure else problem,
        )

    return LedgerAnswer(text=generated, source="agent", model=model_id, tools_called=called)


def _tool_names(result: Any) -> list[str]:
    """Which tools ran, read from the agent's own metrics.

    Best-effort and deliberately forgiving: the tool trace is context for the
    reader, not part of the correctness argument, and a change to the SDK's
    metrics shape must not take the answer down with it.
    """
    try:
        usage = getattr(result.metrics, "tool_metrics", {}) or {}
        return [str(name) for name in usage]
    except Exception:  # noqa: BLE001 - see docstring
        return []
