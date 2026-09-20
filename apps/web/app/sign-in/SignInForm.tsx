"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "../lib/api";
import { DEMO_EMAIL, DEMO_FIRM, DEMO_PASSWORD } from "../lib/demo";

/**
 * The form, which is the only part of signing in that needs a browser.
 *
 * It was the whole page until the page had to decide, on the server, whether
 * to show itself at all. That decision reads the session cookie, so it cannot
 * live in a client component — hence the split.
 *
 * The split has since taken the rest of the furniture with it. The masthead,
 * the sheet grid, the tick mark, the heading and the index block are all in
 * `page.tsx`, because none of them changes after the first paint and pulling
 * the lockup and the demo button over the client boundary to render markup
 * that never moves is a bundle spent on nothing. What is left here is the
 * part that genuinely needs a browser: two fields, a request, and what to
 * say when it fails.
 *
 * Two things this form deliberately does not do. It does not tell you
 * whether an address exists — the API returns one message for every kind of
 * failure and this repeats it verbatim, because a friendlier error here is
 * a way to enumerate a firm's staff. And it does not keep the token in
 * JavaScript-reachable storage: the API sets an httpOnly cookie and the
 * browser handles it from there, so a script injected into this page has
 * nothing to steal.
 */
export function SignInForm({ next, demo = false }: { next: string; demo?: boolean }) {
  const router = useRouter();
  // Prefilled when the one-click route could not reach the engine. A reader
  // who pressed "Open the demo" and landed on an empty password box has been
  // handed a puzzle; one who lands on a filled one has been handed a button.
  const [email, setEmail] = useState(demo ? DEMO_EMAIL : "");
  const [password, setPassword] = useState(demo ? DEMO_PASSWORD : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.signIn(email, password);
      router.push(next);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={submit} className="mt-9 space-y-5">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="username"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        {error && (
          <p role="alert" className="border border-statute/30 bg-statute-wash px-3 py-2 text-ident text-statute">
            {error}
          </p>
        )}

        {/* Live from the first paint, and set as the page's primary control.
            It used to ship `disabled` whenever either field was empty, which
            on a cold load is always — so the first thing anyone saw on this
            page was the action greyed out at `opacity-40`. Measured, that
            composites to 2.65:1 against the bone ground and fails AA, and it
            reads as broken rather than as not-yet-valid.

            Nothing is lost by letting it be pressed: both fields are
            `required`, so an empty submit is caught by the browser and
            focuses the field it is complaining about, which is more than the
            dead button ever said. */}
        <button
          type="submit"
          disabled={busy}
          className="w-full border-2 border-books bg-books px-6 py-3 font-mono text-ident uppercase tracking-[0.08em] text-stock transition-colors hover:bg-stock hover:text-books disabled:border-graphite-soft disabled:bg-transparent disabled:text-graphite"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {/* The demo, on the page a reader actually landed on.
          This block used to read "A firm owner creates one with `diligence
          user create`" — a command-line instruction, on the page the largest
          button on the marketing site pointed at. A visitor who has never seen
          this product before was being told to run a CLI. The demo account is
          the answer to "no account yet" for almost everyone who reads this
          line, so it is the thing the line says. */}
      <div className="mt-8 border-t border-hairline pt-5">
        <p className="font-mono text-stub uppercase text-graphite">No account? Use the demo</p>
        <p className="mt-2 max-w-[40ch] text-ident leading-relaxed text-graphite">
          {DEMO_FIRM}, a generated firm carrying two client companies and twelve months of
          books. Nothing in it is real and nothing you do to it matters.
        </p>
        <dl className="mt-3 grid grid-cols-[5rem_minmax(0,1fr)] gap-y-1 text-ident">
          <dt className="font-mono text-stub uppercase text-graphite-soft">Email</dt>
          <dd className="select-all break-all font-mono text-agreed">{DEMO_EMAIL}</dd>
          <dt className="font-mono text-stub uppercase text-graphite-soft">Password</dt>
          <dd className="select-all break-all font-mono text-agreed">{DEMO_PASSWORD}</dd>
        </dl>
        <button
          type="button"
          onClick={() => {
            setEmail(DEMO_EMAIL);
            setPassword(DEMO_PASSWORD);
            setError(null);
          }}
          className="mt-4 border border-agreed px-4 py-2 font-mono text-stub uppercase tracking-[0.08em] text-agreed transition-colors hover:bg-agreed hover:text-stock"
        >
          Fill the demo account
        </button>
      </div>

      <p className="rag-pretty opsz-prose mt-6 max-w-[42ch] font-news text-ident leading-relaxed text-graphite-soft">
        Real accounts are created by a firm owner. There is no self-service signup,
        because there is no self-service client data.
      </p>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-stub uppercase tracking-[0.06em] text-graphite">
        {label}
      </span>
      {/* `focus:outline-none` used to sit at the end of this list. Tailwind
          compiles it to `outline: 2px solid transparent`, which beat the
          global `:focus-visible` rule on specificity and left the login form
          — the one page on the site where a keyboard user has to know where
          they are — with a focus ring measuring rgba(0,0,0,0). The border
          colour change that remained is 3.39:1 against the unfocused state,
          which is a hint, not an indicator. The global ring is better than
          anything worth replacing it with. */}
      <input
        type={type}
        value={value}
        required
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full border border-graphite-soft bg-sunk px-3 py-2.5 text-prose focus:border-agreed"
      />
    </label>
  );
}
