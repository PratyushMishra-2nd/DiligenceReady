"use client";

import { useState } from "react";

import { api } from "../lib/api";

/**
 * Ask the ledger.
 *
 * A Strands agent, on Bedrock, over read-only engine tools. The interesting
 * part of this panel is not the answer — it is everything shown beside the
 * answer.
 *
 * A chartered accountant signs their name under the figures they file. An
 * assistant that produces a confident paragraph they cannot check is worse
 * than no assistant, because it moves the work from "compute this" to
 * "verify a plausible paragraph", which is slower and easier to get wrong.
 *
 * So the panel always shows which tools ran. Every figure in the answer came
 * out of one of them, and the API rejected the answer outright if it did
 * not. A refusal is displayed as a refusal, in the same weight as an answer,
 * because "the agent tried to do arithmetic and was stopped" is information
 * the reader is entitled to.
 */

const SUGGESTIONS = [
  "What is the largest exposure this month and why?",
  "Why is the bank variance so high?",
  "Which findings close soonest under Section 16(4)?",
  "What is in GSTR-2B that the purchase register does not explain?",
];

type Answer = {
  answer: string;
  source: "agent" | "refused" | "unavailable";
  model: string | null;
  tools_called: string[];
  rejected_reason: string | null;
};

export function AskLedger({ companyId }: { companyId: string }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string) {
    const asked = text.trim();
    if (!asked || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.ask(companyId, asked));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The agent could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border border-rule bg-sheet">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-5 py-3">
        <h2 className="text-data font-semibold text-ink">Ask the ledger</h2>
        <p className="text-micro text-ink-faint">
          The agent chooses the queries. The engine computes every figure.
        </p>
      </header>

      <div className="px-5 py-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(question);
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={500}
            placeholder="Ask about this company's reconciled books"
            aria-label="Ask about this company's reconciled books"
            className="min-w-[16rem] flex-1 border border-rule bg-paper px-3 py-2 text-data text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || question.trim().length === 0}
            className="border border-ink bg-ink px-4 py-2 text-micro text-paper transition-opacity disabled:opacity-40"
          >
            {busy ? "Querying…" : "Ask"}
          </button>
        </form>

        {!result && !busy && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  setQuestion(suggestion);
                  void send(suggestion);
                }}
                className="border border-rule px-2.5 py-1 text-micro text-ink-soft hover:border-ink hover:text-ink"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {busy && (
          <p className="mt-4 text-data text-ink-soft">
            Reading this company&rsquo;s reconciled records…
          </p>
        )}

        {error && <p className="mt-4 text-data text-exposure">{error}</p>}

        {result?.source === "agent" && (
          <div className="mt-4">
            <p className="max-w-[68ch] text-body leading-relaxed text-ink">{result.answer}</p>
            <ToolTrace tools={result.tools_called} />
            <p className="mt-2 text-micro text-ink-faint">
              Every figure above was returned by one of those queries. The API checked
              each one and would have refused the answer otherwise.
              {result.model && <span className="ml-1 font-mono">{result.model}</span>}
            </p>
          </div>
        )}

        {result?.source === "refused" && (
          <div className="mt-4 border-l-2 border-exposure bg-exposure-wash px-4 py-3">
            <p className="text-data font-medium text-ink">
              The answer was refused, and here is why.
            </p>
            <p className="mt-1 max-w-[68ch] text-data text-ink-soft">
              {result.rejected_reason}
            </p>
            <ToolTrace tools={result.tools_called} />
            <p className="mt-2 text-micro text-ink-soft">
              This is the product working. A figure that is not in a query result is a
              figure nobody can trace to a document, so it is not shown at all.
            </p>
          </div>
        )}

        {result?.source === "unavailable" && (
          <div className="mt-4 border-l-2 border-rule-strong bg-paper px-4 py-3">
            <p className="text-data text-ink-soft">{result.rejected_reason}</p>
            <p className="mt-1 text-micro text-ink-faint">
              Nothing else on this page depends on a model. Every figure you can see was
              computed before the agent was asked anything.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function ToolTrace({ tools }: { tools: string[] }) {
  if (tools.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-micro text-ink-faint">Queries run:</span>
      {tools.map((tool) => (
        <code key={tool} className="border border-rule bg-paper px-1.5 py-0.5 font-mono text-micro text-ink-soft">
          {tool}
        </code>
      ))}
    </div>
  );
}
