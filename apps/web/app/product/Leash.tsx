/**
 * The model's leash, shown rather than asserted.
 *
 * The page claims the model cannot produce a number. That is the safety story
 * of the whole product and it was one clause inside a paragraph, which is the
 * weakest possible form for the strongest available claim. So here is the
 * guard doing it.
 *
 * Everything below is real. The tool output and the two sentences are the
 * fixtures in apps/api/tests/test_agent_guard.py; the refusal strings are what
 * `check_answer` returns when it is handed them, copied from a run rather than
 * written to sound plausible. A page that invented a refusal in order to
 * illustrate a guarantee about invented figures would be a strange thing to
 * ship.
 *
 * The struck-through sentence is struck through in the markup as well as in
 * the styling: `<del>` says "removed" to a screen reader, where a line-through
 * class says nothing at all.
 */

const TOOL_OUTPUT = `{"period": "2026-08", "itc_at_risk": "259012.40",
 "bank_variance": "2412000.00", "open_risks": 7,
 "gst_coverage_pct": "96.05"}`;

const ATTEMPTS: {
  sentence: string;
  verdict: "kept" | "refused";
  reason: string;
}[] = [
  {
    sentence:
      "Input tax credit of 2,59,012.40 has no counterpart in GSTR-2B for 2026-08, across 7 open findings.",
    verdict: "kept",
    reason: "every figure appears in what the tool returned",
  },
  {
    sentence: "The combined exposure is 2671012.40.",
    verdict: "refused",
    reason: "the agent's answer contains 2671012.40, which is not in the finding",
  },
  {
    sentence: "Roughly 2.59 lakh is at risk.",
    verdict: "refused",
    reason: "the agent's answer contains 2.59, which is not in the finding",
  },
];

export function Leash() {
  return (
    <div className="mt-6 max-w-[64ch]">
      <p className="font-mono text-stub uppercase tracking-[0.08em] text-graphite">
        What the tools returned
      </p>
      <pre className="mt-2 whitespace-pre-wrap break-words border border-hairline bg-sunk p-3 font-mono text-ident leading-relaxed text-graphite">
        {TOOL_OUTPUT}
      </pre>

      <p className="mt-6 font-mono text-stub uppercase tracking-[0.08em] text-graphite">
        What the model wrote
      </p>
      <dl className="mt-2 border-t border-hairline">
        {ATTEMPTS.map((attempt) => {
          const refused = attempt.verdict === "refused";
          return (
            <div
              key={attempt.sentence}
              className="grid gap-x-4 gap-y-1 border-b border-hairline py-3 sm:grid-cols-[minmax(0,1fr)_5rem]"
            >
              <dt className="text-ident leading-relaxed">
                {refused ? (
                  <del className="text-graphite-soft decoration-statute decoration-1">
                    {attempt.sentence}
                  </del>
                ) : (
                  <span className="text-agreed">{attempt.sentence}</span>
                )}
                <span
                  className={`mt-1 block text-ident leading-relaxed ${
                    refused ? "text-statute-deep" : "text-graphite-soft"
                  }`}
                >
                  {attempt.reason}
                </span>
              </dt>
              {/* The verdict is a word, not a colour. Vermillion is doing the
                  same job twice here and neither time is it doing it alone. */}
              <dd
                className={`font-mono text-ident sm:text-right ${
                  refused ? "text-statute-deep" : "text-agreed"
                }`}
              >
                {refused ? "refused" : "kept"}
              </dd>
            </div>
          );
        })}
      </dl>

      <p className="rag-pretty opsz-prose mt-5 font-news text-prose leading-relaxed text-graphite">
        A refused sentence is not a failure the reader has to handle. The finding was
        already computed; the model was only asked to phrase it, and when it will not
        phrase it safely the deterministic sentence is shown instead. The cost of the
        guard is plainer prose. The cost of not having it is a figure that reads as
        verified and traces to nothing.
      </p>
    </div>
  );
}
