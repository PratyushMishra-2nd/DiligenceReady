"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
 * credential failure and `message()` below passes that one through
 * unchanged, because a friendlier error here is a way to enumerate a firm's
 * staff. And it does not keep the token in JavaScript-reachable storage: the
 * API sets an httpOnly cookie and the browser handles it from there, so a
 * script injected into this page has nothing to steal.
 */

/**
 * What to tell somebody when signing in did not work.
 *
 * This used to be `failure.message`, passed straight through, and the
 * component's own docstring called that a feature — the API returns one
 * deliberate message for every kind of credential failure and repeating it
 * verbatim avoids leaking whether an address exists. That reasoning is right
 * about a 401 and wrong about everything else: a fetch that never reached
 * the server throws a `TypeError`, and "Failed to fetch" was shipped to the
 * user as the entire explanation. Developer jargon, on the login page, on
 * whatever flaky connection produced it.
 *
 * So the API's own message is still passed through when the API answered,
 * and a transport failure gets a sentence that says what happened and what
 * it means for the details they just typed.
 */
function message(failure: unknown): string {
  // Never reached the server at all: fetch itself rejected.
  if (failure instanceof TypeError) {
    return "We could not reach the engine. Your details were not sent — try again in a moment.";
  }

  if (failure instanceof Error && failure.message) {
    // `post()` in lib/api.ts throws the API's own `detail` when there is one
    // and a synthetic `"<path> returned <status>"` when there is not. The
    // first is deliberate copy written for this exact situation — "Email or
    // password is incorrect." — and is passed through untouched. The second
    // is a developer string that happens to be reachable from a login form,
    // and shipping it is how "/api/session returned 500" ends up as the
    // entire explanation offered to a chartered accountant.
    // A 5xx here usually means the rewrite never reached the engine at
    // all, so the first draft of this sentence — "the engine answered, but
    // not with a session" — narrated a response that did not happen, and
    // then reassured the reader that nothing was wrong with what they
    // typed, which is not something this code can know. On a page whose
    // whole ethic is not saying what it cannot back, that was the wrong
    // sentence twice over. It says where the fault lies and stops there.
    if (/^\/\S* returned \d{3}$/.test(failure.message)) {
      return "We could not complete the sign-in. This is on our side, not yours — try again shortly.";
    }
    return failure.message;
  }

  return "Could not sign in.";
}

export function SignInForm({ next, demo = false }: { next: string; demo?: boolean }) {
  const router = useRouter();
  // Prefilled when the one-click route could not reach the engine. A reader
  // who pressed "Open the demo" and landed on an empty password box has been
  // handed a puzzle; one who lands on a filled one has been handed a button.
  const [email, setEmail] = useState(demo ? DEMO_EMAIL : "");
  const [password, setPassword] = useState(demo ? DEMO_PASSWORD : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const alertRef = useRef<HTMLParagraphElement>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.signIn(email, password);
      router.push(next);
      router.refresh();
    } catch (failure) {
      setError(message(failure));
      setBusy(false);
    }
  }

  // Where the keyboard goes after a failure.
  //
  // Disabling the submit button while the request is in flight blurs it —
  // the browser will not keep focus on a disabled control — and nothing put
  // focus back when it re-enabled. Measured: focus was on the button before
  // submit and on `<body>` after, so a keyboard-only reader who mistyped a
  // password was returned to the top of the document and had to tab through
  // the lockup, six nav links and the demo button to reach the field they
  // needed to correct. That is WCAG 2.4.3, and it arrived as a side effect
  // of fixing the disabled-by-default button.
  //
  // Focus goes to the alert rather than back to the button: `role="alert"`
  // already announces it to a screen reader, and a sighted keyboard user
  // wants their caret on the explanation, not on the control that just
  // failed. `tabIndex={-1}` makes it focusable without adding a tab stop.
  useEffect(() => {
    if (error) alertRef.current?.focus();
  }, [error]);

  return (
    <div>
      <form onSubmit={submit} className="mt-9 space-y-5">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="username"
          invalid={Boolean(error)}
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          invalid={Boolean(error)}
        />

        {/* The slot is reserved whether or not there is anything in it.
            Mounting the alert conditionally moved the submit button 56px
            down the page at the exact moment a reader might be clicking it
            again — a layout shift under the cursor, on failure, on the one
            control that matters. One line of space costs nothing and a
            failure now changes ink rather than geometry. The reserved
            height fits the longest message this form can produce, which is
            the transport one at two lines — sized to that rather than to a
            single line, or the fix only holds for the short errors.

            It fades rather than cutting in. Without an entrance the alert
            simply exists on the next paint, which on a page where nothing
            else moved is easy to miss; 120ms and 4px is enough for the eye
            to catch that something arrived, and the global reduced-motion
            rule collapses it. */}
        <div className="min-h-[3.75rem]">
          {error && (
            <p
              ref={alertRef}
              id="sign-in-error"
              role="alert"
              tabIndex={-1}
              className="alert-in border border-statute/30 bg-statute-wash px-3 py-2 text-ident text-statute"
            >
              {error}
            </p>
          )}
        </div>

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
        {/* Busy is a state the control ADVANCES into, not one it recedes
            into. It used to go from solid indigo to a pale transparent
            outline the moment work started, which reads as "this button has
            been switched off" rather than "your request is in flight" — and
            over six seconds on a slow connection the only sign of life was a
            static ellipsis. NN/g's threshold is that any wait past about a
            second needs an indeterminate indicator; a frozen `…` is not one.

            So the ink stays down and a rule runs along the foot of the
            button while it works. The keyframe is `foot-rule`, which has sat
            in the stylesheet unused since the ledger column it was written
            for was deleted — and it is the right animation for this on its
            own merits, because footing a column is the act this product
            performs. The motion during the wait is the thing being waited
            for. */}
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="relative w-full overflow-hidden border-2 border-books bg-books px-6 py-3 font-mono text-ident uppercase tracking-[0.08em] text-stock press-verb hover:bg-stock hover:text-books disabled:cursor-progress disabled:hover:bg-books disabled:hover:text-stock"
        >
          <span className={busy ? "opacity-70" : undefined}>
            {busy ? "Signing in…" : "Sign in"}
          </span>
          {busy && (
            <span aria-hidden className="foot-rule-running absolute inset-x-0 bottom-0 h-0.5 bg-stock" />
          )}
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
          className="mt-4 border border-agreed px-4 py-2 font-mono text-stub uppercase tracking-[0.08em] text-agreed press-verb hover:bg-agreed hover:text-stock"
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
  invalid,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  /** Set on both fields after a failure: the API does not say which one. */
  invalid: boolean;
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
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? "sign-in-error" : undefined}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full border border-graphite-soft bg-sunk px-3 py-2.5 text-prose focus:border-agreed"
      />
    </label>
  );
}
