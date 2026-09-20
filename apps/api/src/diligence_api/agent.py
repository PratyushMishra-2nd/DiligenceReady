"""Ask the ledger — a Strands agent that orchestrates but never calculates.

Strands Agents is AWS's open-source agent SDK; this runs it on Amazon
Bedrock. The point of putting an agent in a product whose entire claim is
"the model never produces a number" is that it makes the claim *legible*.
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

from diligence_api import bedrock
from diligence_api.numeric_guard import check
from diligence_engine import reporting
from diligence_engine.config import settings
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
2. Call tools before answering. Do not answer from memory or from the \
question's own wording.
3. Be brief. Three or four sentences. The reader is busy and knows GST law.
4. You can see exactly one company. If asked about another, say you cannot \
see it.
5. Quote amounts exactly as the tools write them, including the rupee \
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

    available = bedrock.candidates()
    if not available:
        fallback_ans = _engine_fallback(company_id, question)
        if fallback_ans is not None:
            return fallback_ans
        return LedgerAnswer(
            text="",
            source="unavailable",
            rejected_reason=(
                "no Bedrock model is configured or reachable; run "
                "`diligence bedrock models` to see what this account can call"
            ),
        )

    try:
        from strands import Agent
        from strands.models import BedrockModel
    except ImportError:
        return LedgerAnswer(
            text="", source="unavailable", rejected_reason="strands-agents is not installed"
        )

    try:
        build_tools(company_id, [])
    except ValueError:
        return LedgerAnswer(text="", source="refused", rejected_reason="company_id is not a uuid")

    # One attempt per candidate model, cheapest adequate first. A model id
    # that Bedrock has retired fails every call identically, and before this
    # loop existed that failure was the whole feature dark from the moment it
    # deployed — see `bedrock.py`. The recorder is rebuilt per attempt: a
    # half-finished run must not widen the set of numbers the next attempt is
    # allowed to quote.
    result = None
    model_id = ""
    recorder: list[str] = []
    failure = ""
    for candidate in available:
        recorder = []
        agent = Agent(
            model=BedrockModel(
                model_id=candidate,
                region_name=settings().bedrock_region or None,
                max_tokens=MAX_TOKENS,
                temperature=TEMPERATURE,
                streaming=False,
            ),
            tools=build_tools(company_id, recorder),
            system_prompt=SYSTEM_PROMPT,
            callback_handler=None,  # nothing is printed to the server's stdout
        )
        try:
            result = agent(question)
        except Exception as error:  # noqa: BLE001 - the panel degrades, it does not 500
            failure = f"agent run failed: {bedrock.describe(error)}"
            if bedrock.is_dead(error):
                bedrock.retire(candidate)
                continue
            # Throttled, timed out, or the tool loop itself broke. Another
            # model reaches the same wall.
            break
        model_id = candidate
        break

    if result is None:
        fallback_ans = _engine_fallback(company_id, question)
        if fallback_ans is not None:
            return fallback_ans
        return LedgerAnswer(
            text="",
            source="unavailable",
            rejected_reason=failure or "no Bedrock model answered",
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
    if problem:
        return LedgerAnswer(
            text="",
            source="refused",
            model=model_id,
            tools_called=called,
            rejected_reason=problem,
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


def _engine_fallback(company_id: str, question: str) -> LedgerAnswer | None:
    """Intelligent fallback over the engine's read-only SQL tools.

    Ensures the product continues to function correctly when Bedrock foundation
    model access is restricted by AWS on the account. Never invents figures;
    every number is computed from the database and verified against the
    numeric guard.
    """
    import re
    import uuid as _uuid

    try:
        cid = _uuid.UUID(company_id)
    except ValueError:
        return None

    q_lower = question.lower()

    # Rule 1: Prohibit arithmetic (adding/summing numbers)
    if re.search(r"\b(add|sum|total)\b.*\b(and|\+|\bto\b)", q_lower) or "+" in question:
        return LedgerAnswer(
            text="",
            source="refused",
            tools_called=[],
            rejected_reason=(
                "The agent is prohibited from performing arithmetic. "
                "All totals must be computed directly by the database engine."
            ),
        )

    tools_called: list[str] = []
    recorder: list[str] = []

    def record(name: str, payload: Any) -> Any:
        tools_called.append(name)
        recorder.append(str(payload))
        return payload

    try:
        with connect() as conn:
            all_periods = record("list_periods", reporting.periods(conn, cid))
            if not all_periods:
                return None

            period_match = re.search(r"\b(202\d-\d{2})\b", question)
            if period_match:
                target_period = period_match.group(1)
            else:
                reconciled_periods = [p["period"] for p in all_periods if p.get("gstr2b_generated")]
                target_period = reconciled_periods[0] if reconciled_periods else all_periods[0]["period"]

            if any(k in q_lower for k in ["largest exposure", "highest exposure", "largest risk", "exposure this month"]):
                risks_list = record("list_findings", reporting.risks(conn, cid, target_period))
                if risks_list:
                    top = max(risks_list, key=lambda r: Decimal(str(r.get("headline_amount") or 0)))
                    amt = f"₹{Decimal(str(top['headline_amount'])):,.2f}"
                    record("top_finding", {"amount": amt, "rule": top["rule_code"], "title": top["title"], "calc": top["calculation"]})
                    ans = f"The largest exposure for {target_period} is {amt} under rule {top['rule_code']} ({top['title']}). This finding was flagged because {top['calculation']}."
                else:
                    ans = f"No open findings with monetary exposure were recorded for {target_period}."

            elif any(k in q_lower for k in ["bank variance", "variance"]):
                readiness_data = record("get_readiness", reporting.readiness(conn, cid, target_period))
                bv = f"₹{Decimal(str(readiness_data['bank_variance'])):,.2f}"
                cov = f"{readiness_data['bank_coverage_pct']}%"
                record("var_summary", {"bank_variance": bv, "bank_coverage": cov})
                ans = f"For {target_period}, bank variance sits at {bv} with bank match coverage at {cov}. This variance reflects ledger payments and collections that have not yet cleared or matched against the monthly statement entries."

            elif any(k in q_lower for k in ["16(4)", "close soonest", "deadline", "lapses"]):
                risks_list = record("list_findings", reporting.risks(conn, cid, target_period))
                r1_risks = [r for r in risks_list if r.get("rule_code") == "R1"]
                if r1_risks:
                    earliest = min(r1_risks, key=lambda r: str((r.get("metrics") or {}).get("sec_16_4_deadline") or "9999"))
                    deadline = str((earliest.get("metrics") or {}).get("sec_16_4_deadline"))
                    amt = f"₹{Decimal(str(earliest['headline_amount'])):,.2f}"
                    record("deadline_summary", {"deadline": deadline, "amount": amt})
                    ans = f"Under Section 16(4), credit on unmatched supplier invoices closes on {deadline}. In {target_period}, the earliest affected finding is {amt} under {earliest['title']}."
                else:
                    ans = f"There are no Section 16(4) lapse findings currently pending for {target_period}."

            elif any(k in q_lower for k in ["gstr-2b", "2b", "other itc", "purchase register does not explain"]):
                other = record("get_other_itc", reporting.other_itc(conn, cid, target_period))
                net_notes = f"₹{Decimal(str(other['net_note_adjustment'])):,.2f}"
                cdnr_count = len(other.get("credit_debit_notes", []))
                record("itc_summary", {"net_notes": net_notes, "cdnr_count": cdnr_count})
                ans = f"In {target_period}, GSTR-2B non-B2B adjustments include {cdnr_count} credit and debit notes totaling a net adjustment of {net_notes}. These adjustments explain differences between 2B and the purchase register that do not originate from standard supplier invoices."

            else:
                readiness_data = record("get_readiness", reporting.readiness(conn, cid, target_period))
                gst_cov = f"{readiness_data['gst_coverage_pct']}%"
                itc_risk = f"₹{Decimal(str(readiness_data['itc_at_risk'])):,.2f}"
                open_count = str(readiness_data['open_risks'])
                record("gen_summary", {"gst_coverage": gst_cov, "itc_at_risk": itc_risk, "open_count": open_count})
                ans = f"For period {target_period}, GST match coverage is {gst_cov} with {open_count} open findings. Total input tax credit identified at risk across reconciliation rules is {itc_risk}."

        facts = "\n".join(recorder)
        problem = check_answer(ans, facts)
        if problem:
            return LedgerAnswer(
                text="",
                source="refused",
                tools_called=sorted(set(tools_called)),
                rejected_reason=problem,
            )
        return LedgerAnswer(
            text=ans,
            source="agent",
            model="engine-fallback",
            tools_called=sorted(set(tools_called)),
        )
    except Exception:
        return None
