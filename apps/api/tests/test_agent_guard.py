"""The agent may orchestrate. It may not calculate.

`check_answer` is the whole difference between an agent that is safe to put
in front of a chartered accountant and one that is not, so it is tested
directly rather than through a model call. No network, no Bedrock, no cost.
"""

from __future__ import annotations

from diligence_api.agent import LedgerAnswer, ask, check_answer

# What a tool actually returns: the engine's own aggregate, Decimals as
# strings.
TOOL_OUTPUT = (
    '{"period": "2026-08", "itc_at_risk": "259012.40", '
    '"bank_variance": "2412000.00", "open_risks": 7, "gst_coverage_pct": "96.05"}'
)


def test_quoting_a_returned_figure_is_allowed() -> None:
    answer = (
        "Input tax credit of 259012.40 has no counterpart in GSTR-2B for 2026-08, "
        "across 7 open findings."
    )
    assert check_answer(answer, TOOL_OUTPUT) is None


def test_adding_two_figures_together_is_refused() -> None:
    """The headline case. 259012.40 + 2412000.00 is arithmetic, and arithmetic
    is the engine's job — a total no tool returned is a number the accountant
    cannot trace, however correct it happens to be."""
    reason = check_answer("The combined exposure is 2671012.40.", TOOL_OUTPUT)
    assert reason is not None
    assert "2671012.40" in reason


def test_rounding_a_returned_figure_is_refused() -> None:
    """ "About 2.59 lakh" is the friendly phrasing that loses the audit trail."""
    assert check_answer("Roughly 2.59 lakh is at risk.", TOOL_OUTPUT) is not None


def test_indian_digit_grouping_is_understood() -> None:
    """2,59,012.40 is the same number as 259012.40, and a CA writes it that way."""
    assert check_answer("Credit of 2,59,012.40 is exposed.", TOOL_OUTPUT) is None


def test_prose_with_no_numbers_passes() -> None:
    assert check_answer("The purchase register and the portal disagree.", TOOL_OUTPUT) is None


def test_a_percentage_the_tools_did_not_return_is_refused() -> None:
    assert check_answer("Coverage is 96%.", TOOL_OUTPUT) is not None
    assert check_answer("Coverage is 96.05%.", TOOL_OUTPUT) is None


# ── the endpoint's own refusals, which need no model ────────────────────────


def test_an_empty_question_is_refused_without_calling_bedrock() -> None:
    answer = ask("00000000-0000-0000-0000-000000000000", "   ")
    assert isinstance(answer, LedgerAnswer)
    assert answer.source == "refused"
    assert answer.text == ""


def test_an_overlong_question_is_refused_before_it_costs_anything() -> None:
    answer = ask("00000000-0000-0000-0000-000000000000", "why? " * 400)
    assert answer.source == "refused"
    assert "longer than" in (answer.rejected_reason or "")


# ── GST vocabulary is full of digits that are not quantities ───────────────
#
# This class of false positive is what makes a strict guard unusable: almost
# every correct sentence about Indian indirect tax names a form or a section,
# and a guard that rejects them all gets switched off. Each case below was a
# real rejection of a correct sentence before the terminology was enumerated.


def test_form_names_are_not_figures() -> None:
    for sentence in (
        "The invoice is absent from GSTR-2B for the period.",
        "GSTR-3B has not been filed.",
        "It appears in 2B but not in the register.",
        "The supplier has filed GSTR-1 but not GSTR-3B.",
    ):
        assert check_answer(sentence, TOOL_OUTPUT) is None, sentence


def test_statutory_references_are_not_figures() -> None:
    """Note the absence of "after 30 November" here.

    The deadline date IS a figure, and the guard is right to reject it when
    no tool returned it. In the running product it is returned — the
    readiness aggregate carries `next_sec_16_4_deadline` — so the sentence a
    CA actually sees is allowed. The strictness is the feature.
    """
    for sentence in (
        "Credit lapses under Section 16(4).",
        "Rule 37A reversal has been reported by the portal.",
        "The supply is blocked by Sec 17(5).",
        "It belongs in Table 8A, not Table 4(B).",
    ):
        assert check_answer(sentence, TOOL_OUTPUT) is None, sentence


def test_section_names_are_not_figures() -> None:
    assert check_answer("The entry sits in the CDNR section, not B2B.", TOOL_OUTPUT) is None


def test_terminology_does_not_smuggle_a_real_figure_through() -> None:
    """The stripper removes vocabulary, not the numbers beside it.

    If it were sloppy enough to swallow an adjacent amount, the guard would
    have a hole shaped exactly like "per GSTR-2B, 9999999.99 is at risk".
    """
    reason = check_answer("Per GSTR-2B, 9999999.99 is at risk.", TOOL_OUTPUT)
    assert reason is not None
    assert "9999999.99" in reason
