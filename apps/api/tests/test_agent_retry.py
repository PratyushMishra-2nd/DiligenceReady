"""The one correction the agent is allowed, and the line it does not cross.

When the model layer moved from Claude on Bedrock to a 3B model served on
the API instance — because a new AWS account cannot invoke a Bedrock
foundation model at all — the guard started refusing more answers. Not
because the books got harder, but because the writer got smaller: a small
model totals two figures it was handed, or rounds one, far more readily than
a large one.

So the agent gets told which token was rejected and asked once more. What is
tested here is that the retry is a retry and not an exemption: the second
answer goes through exactly the same check, and a second failure is still a
refusal.

No network and no model. Strands' Agent is replaced with a scripted one, and
the tools are replaced by a recorder, because what is under test is the
control flow around the guard.
"""

from __future__ import annotations

import pytest

from diligence_api import agent as agent_module
from diligence_api import llm

COMPANY = "00000000-0000-0000-0000-000000000001"

# What a tool returned. The only numbers an answer may contain.
TOOL_OUTPUT = '{"period": "2026-08", "itc_at_risk": "687883.17", "open_risks": 52}'


class ScriptedAgent:
    """A Strands Agent that says what the test tells it to, in order."""

    def __init__(self, replies: list[str]) -> None:
        self.replies = list(replies)
        self.prompts: list[str] = []

    def __call__(self, prompt: str):
        self.prompts.append(prompt)
        text = self.replies.pop(0) if self.replies else ""
        return type(
            "Result",
            (),
            {
                "message": {"content": [{"text": text}]},
                "stop_reason": "end_turn",
                "metrics": type("M", (), {"tool_metrics": {"get_readiness": object()}})(),
            },
        )()


@pytest.fixture
def scripted(monkeypatch):
    """Install a scripted agent, a recording tool set, and one local model."""

    def install(replies: list[str]) -> ScriptedAgent:
        built = ScriptedAgent(replies)

        def build_tools(company_id: str, recorder: list[str]) -> list:
            # The real tools record what they returned; that record is what
            # the answer is checked against. Nothing here touches Postgres.
            recorder.append(TOOL_OUTPUT)
            return []

        monkeypatch.setattr(agent_module, "build_tools", build_tools)
        monkeypatch.setattr(
            agent_module.llm, "plan", lambda: [llm.Candidate(llm.OLLAMA, "qwen2.5:3b")]
        )
        monkeypatch.setattr(agent_module.llm, "strands_model", lambda *a, **k: object())

        import strands

        monkeypatch.setattr(strands, "Agent", lambda **kwargs: built)
        return built

    return install


def test_a_clean_answer_is_returned_without_a_second_call(scripted) -> None:
    built = scripted(["Input tax credit at risk is ₹687883.17 for 2026-08."])

    answer = agent_module.ask(COMPANY, "What is at risk this month?")

    assert answer.source == "agent"
    assert answer.model == "ollama:qwen2.5:3b"
    assert len(built.prompts) == 1


def test_an_invented_figure_is_corrected_once_and_accepted(scripted) -> None:
    """The case this exists for: the model totals, is told, and quotes instead."""
    built = scripted(
        [
            "Across the two exposures the total is ₹9,00,000.",
            "Input tax credit at risk is ₹687883.17 across 52 open findings.",
        ]
    )

    answer = agent_module.ask(COMPANY, "What is at risk this month?")

    assert answer.source == "agent"
    assert answer.rejected_reason is None
    assert len(built.prompts) == 2
    # The correction has to name the rejected token, or the model has no
    # more information than it had the first time.
    assert "rejected" in built.prompts[1]


def test_a_second_invented_figure_is_still_refused(scripted) -> None:
    """The retry is a retry, not a waiver."""
    built = scripted(
        [
            "The total is ₹9,00,000.",
            "On reflection the total is ₹9,10,000.",
        ]
    )

    answer = agent_module.ask(COMPANY, "What is at risk this month?")

    assert answer.source == "refused"
    assert answer.text == ""
    assert answer.rejected_reason is not None
    assert len(built.prompts) == 2


def test_the_agent_is_not_asked_a_third_time(scripted) -> None:
    """One correction, bounded. Two model calls on a CPU is already slow."""
    built = scripted(["₹9,00,000.", "₹9,10,000.", "₹687883.17."])

    agent_module.ask(COMPANY, "What is at risk this month?")

    assert len(built.prompts) == 2


# ── which month the agent is told it is looking at ──────────────────────────


def _periods(monkeypatch, rows: list[dict]) -> None:
    """Stub the engine's period listing and the connection it needs."""
    import contextlib

    @contextlib.contextmanager
    def connect():
        yield None

    monkeypatch.setattr(agent_module, "connect", connect)
    monkeypatch.setattr(agent_module.reporting, "periods", lambda conn, cid: rows)


def test_the_latest_period_is_the_latest_reconciled_one(monkeypatch) -> None:
    """A period row is not evidence that the month has been reconciled.

    One bank value-date spilling into September creates a September row with
    no GSTR-2B behind it. Handing that month to the agent is how it came to
    report Rs 0.00 and complete coverage: every figure real, every figure
    from the wrong month. The company page already picks the newest period
    that has a 2B, and this has to agree with it.
    """
    _periods(
        monkeypatch,
        [
            {"period": "2026-09", "gstr2b_generated": False},
            {"period": "2026-08", "gstr2b_generated": True},
            {"period": "2026-07", "gstr2b_generated": True},
        ],
    )

    assert agent_module.latest_period(COMPANY) == "2026-08"


def test_with_no_reconciled_period_the_newest_row_is_used(monkeypatch) -> None:
    """A company mid-onboarding has rows and no 2B yet. Something is better
    than telling the model nothing at all."""
    _periods(monkeypatch, [{"period": "2026-09", "gstr2b_generated": False}])

    assert agent_module.latest_period(COMPANY) == "2026-09"


def test_no_periods_at_all_is_no_hint(monkeypatch) -> None:
    _periods(monkeypatch, [])

    assert agent_module.latest_period(COMPANY) is None
