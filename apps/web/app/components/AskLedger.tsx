"use client";

import { useState } from "react";

import { api } from "../lib/api";

/**
 * Ask the ledger.
 *
 * A Strands agent over read-only engine tools, on Bedrock when the account
 * is allowed to call one and on the model this deployment serves itself
 * when it is not. The interesting part of this panel is not the answer — it
 * is everything shown beside the answer.
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
  const [waited, setWaited] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string) {
    const asked = text.trim();
    if (!asked || busy) return;
    setBusy(true);
    setWaited(0);
    setError(null);
    setResult(null);
    try {
      // The answer arrives by polling, not by holding the request open: the
      // model runs on the API instance and a question is several tool
      // calls, which is longer than the proxy in front of the API will hold
      // a connection. The elapsed count is here because a minute of nothing
      // reads as a hang, and this is the one control on the page that is
      // allowed to take a minute.
      setResult(await api.ask(companyId, asked, setWaited));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The agent could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border border-hairline bg-sunk">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline px-5 py-3">
        <h2 className="text-ident font-semibold text-agreed">Ask the ledger</h2>
        <p className="text-ident text-graphite-soft">
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
            className="min-w-[16rem] flex-1 border border-hairline bg-stock px-3 py-2 text-ident text-agreed placeholder:text-graphite-soft focus:border-agreed"
          />
          <button
            type="submit"
            disabled={busy || question.trim().length === 0}
            className="border border-agreed bg-agreed px-4 py-2 text-ident text-stock transition-opacity disabled:opacity-40"
          >
            {busy ? (waited > 4 ? `Querying… ${waited}s` : "Querying…") : "Ask"}
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
                className="border border-hairline px-2.5 py-1 text-ident text-graphite hover:border-agreed hover:text-agreed"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {busy && (
          <p className="mt-4 text-ident text-graphite">
            Reading this company&rsquo;s reconciled records…
          </p>
        )}

        {error && <p className="mt-4 text-ident text-statute">{error}</p>}

        {result?.source === "agent" && (
          <div className="mt-4">
            <p className="max-w-[68ch] text-prose leading-relaxed text-agreed">{result.answer}</p>
            <ToolTrace tools={result.tools_called} />
            <p className="mt-2 text-ident text-graphite-soft">
              Every figure above was returned by one of those queries. The API checked
              each one and would have refused the answer otherwise.
              {result.model && <span className="ml-1 font-mono">{result.model}</span>}
            </p>
          </div>
        )}

        {result?.source === "refused" && (
          <div className="mt-4 border-l-2 border-statute bg-statute-wash px-4 py-3">
            <p className="text-ident font-medium text-agreed">
              The answer was refused, and here is why.
            </p>
            <p className="mt-1 max-w-[68ch] text-ident text-graphite">
              {result.rejected_reason}
            </p>
            <ToolTrace tools={result.tools_called} />
            <p className="mt-2 text-ident text-graphite">
              This is the product working. A figure that is not in a query result is a
              figure nobody can trace to a document, so it is not shown at all.
            </p>
          </div>
        )}

        {result?.source === "unavailable" && (
          <div className="mt-4 border-l-2 border-graphite-soft bg-stock px-4 py-3">
            <p className="text-ident text-graphite">{result.rejected_reason}</p>
            <p className="mt-1 text-ident text-graphite-soft">
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
      <span className="text-ident text-graphite-soft">Queries run:</span>
      {tools.map((tool) => (
        <code key={tool} className="border border-hairline bg-stock px-1.5 py-0.5 font-mono text-ident text-graphite">
          {tool}
        </code>
      ))}
    </div>
  );
}
