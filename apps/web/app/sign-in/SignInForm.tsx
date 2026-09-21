"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ApiError, api } from "../lib/api";
import { DEMO_EMAIL, DEMO_FIRM, DEMO_PASSWORD } from "../lib/demo";

/**
 * The form, which is the only part of signing in that needs a browser — and
 * which now works when it does not have one.
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
 * Except that it no longer *needs* one. The element is a real `<form>` with
 * an `action` and a `method`, and both fields carry a `name`, so a submit
 * that happens with scripting off, or before hydration, or after the bundle
 * failed to arrive, posts to `submit/route.ts` and signs the reader in. The
 * handler below still runs first everywhere else, and `preventDefault` keeps
 * the enhanced path exactly as it was. `press/DemoButton.tsx` has degraded
 * like this since it was written, with a comment arguing that the demo button
 * "is the one control on the page that has to work"; authentication had the
 * stronger claim to that sentence and none of the behaviour.
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
 * Whose fault the failure was.
 *
 * This is not cosmetic. It decides whether `aria-invalid` goes on the two
 * fields, and a transport failure that sets it tells a screen reader the
 * reader's email address is invalid when the address was never sent
 * anywhere. Only a rejected credential is a reason to mark the input.
 */
type Fault = "credentials" | "engine";

type Failure = { text: string; fault: Fault };

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
 * So the API's own message is still passed through when the API answered with
 * a 401, and everything else gets a sentence that says what happened and what
 * it means for the details they just typed.
 *
 * The status comes from `ApiError` now rather than from matching the shape of
 * the message. The old test only recognised the failures that came back with
 * no `detail` body, so a 500 that had one was read as a credential error and
 * marked both fields invalid.
 */
function message(failure: unknown): Failure {
  // Never reached the server at all: fetch itself rejected.
  if (failure instanceof TypeError) {
    return {
      fault: "engine",
      text: "We could not reach the engine. Your details were not sent — try again in a moment.",
    };
  }

  if (failure instanceof ApiError) {
    // 401 is the account. The API returns one deliberate sentence — "Email or
    // password is incorrect." — for every kind of credential failure, and it
    // is passed through untouched so that this form cannot be used to find
    // out which addresses exist.
    if (failure.status === 401) return { fault: "credentials", text: failure.message };
    // Anything else is a developer string that happens to be reachable from a
    // login form, and shipping it is how "/api/session returned 500" ends up
    // as the entire explanation offered to a chartered accountant.
    // A 5xx here usually means the rewrite never reached the engine at all,
    // so the first draft of this sentence — "the engine answered, but not
    // with a session" — narrated a response that did not happen, and then
    // reassured the reader that nothing was wrong with what they typed, which
    // is not something this code can know. On a page whose whole ethic is not
    // saying what it cannot back, that was the wrong sentence twice over. It
    // says where the fault lies and stops there.
    return {
      fault: "engine",
      text: "We could not complete the sign-in. This is on our side, not yours — try again shortly.",
    };
  }

  if (failure instanceof Error && failure.message) {
    return { fault: "credentials", text: failure.message };
  }

  return { fault: "credentials", text: "Could not sign in." };
}

/** The same two sentences, for the path that had no JavaScript to throw with. */
function fromRoute(failed: Fault): Failure {
  return failed === "credentials"
    ? { fault: "credentials", text: "Email or password is incorrect." }
    : {
        fault: "engine",
        text: "We could not complete the sign-in. This is on our side, not yours — try again shortly.",
      };
}

export function SignInForm({
  next,
  demo = false,
  failed = null,
}: {
  next: string;
  demo?: boolean;
  /** Set when `submit/route.ts` sent the reader back — the no-JavaScript path. */
  failed?: Fault | null;
}) {
  const router = useRouter();
  // Prefilled when the one-click route could not reach the engine. A reader
  // who pressed "Open the demo" and landed on an empty password box has been
  // handed a puzzle; one who lands on a filled one has been handed a button.
  const [email, setEmail] = useState(demo ? DEMO_EMAIL : "");
  const [password, setPassword] = useState(demo ? DEMO_PASSWORD : "");
  const [error, setError] = useState<Failure | null>(failed ? fromRoute(failed) : null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);

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
  // Focus goes to the alert rather than back to the button: a sighted
  // keyboard user wants their caret on the explanation, not on the control
  // that just failed. `tabIndex={-1}` makes it focusable without adding a tab
  // stop.
  //
  // The paragraph used to carry `role="alert"` as well, and the two
  // mechanisms fought: the role announces on insertion and the focus move
  // announces again, so NVDA and JAWS read the sentence twice. Moving focus
  // is the stronger of the two — it announces *and* puts the caret where the
  // reader has to act — so the role came off rather than the effect.
  useEffect(() => {
    if (error) alertRef.current?.focus();
  }, [error]);

  return (
    // The sheet, not a column. The form used to sit in a 34rem measure inside
    // a 1280px page with the demo block stacked underneath it, which left
    // something like five hundred and seventy pixels of unclaimed paper down
    // the right of the one page on the site with the least on it — the same
    // hole `page.tsx` records having already moved once. Nothing new was
    // invented to fill it: the demo account and the note about who issues
    // real accounts were always here, and they read better beside the form
    // than below it, because they answer the question somebody asks *instead*
    // of signing in rather than after.
    <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
      <form
        onSubmit={submit}
        action="/sign-in/submit"
        method="post"
        className="mt-9 space-y-5"
      >
        {/* Where the reader was going, carried across the submit that has no
            JavaScript to close over it. The guard that reads it back is the
            same one the page uses. */}
        <input type="hidden" name="next" value={next} />

        <Field
          label="Email"
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="username"
          invalid={error?.fault === "credentials"}
          described={Boolean(error)}
        />
        <Field
          label="Password"
          name="password"
          type={reveal ? "text" : "password"}
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          invalid={error?.fault === "credentials"}
          described={Boolean(error)}
          // The demo password is twenty-four random characters and it is
          // printed a column away. Somebody copying it across by eye has no
          // way to see where they lost their place, and the field they are
          // typing into is the one control on the site that gives no
          // feedback until it fails. WCAG 2.2's SC 3.3.8 is already satisfied
          // here by `autocomplete` and by not blocking paste, so this is not
          // a compliance fix; it is the affordance every benchmark login has
          // and the demo path specifically needs.
          reveal={{ on: reveal, toggle: () => setReveal((shown) => !shown) }}
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
            rule collapses it.

            The ink is `statute-deep` rather than `statute`: on the wash the
            brighter vermillion measures 4.74:1, which clears AA for this
            size by four hundredths, and the deeper one measures 6.29:1. The
            sentence that tells somebody their sign-in failed is not the
            place to be spending the last of a contrast budget. */}
        <div className="min-h-[3.75rem]">
          {error && (
            <p
              ref={alertRef}
              id="sign-in-error"
              tabIndex={-1}
              className="alert-in border border-exposure/30 bg-exposure-wash px-3 py-2 text-caption-13 text-exposure-deep"
            >
              {error.text}
            </p>
          )}
        </div>

        {/* Live from the first paint, and set as the page's primary control.
            It used to ship `disabled` whenever either field was empty, which
            on a cold load is always — so the first thing anyone saw on this
            page was the action greyed out at `opacity-40`. Measured, that
            composites to 2.19:1 against the bone ground and fails AA, and it
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
            second needs an indeterminate indicator; a frozen ellipsis is not
            one.

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
          className="relative w-full overflow-hidden border-2 border-books bg-books px-6 py-3 font-mono text-caption-13 uppercase tracking-[0.08em] text-plate-ink press-verb hover:bg-canvas hover:text-books disabled:cursor-progress disabled:hover:bg-books disabled:hover:text-plate-ink"
        >
          <span className={busy ? "opacity-70" : undefined}>
            {busy ? "Signing in…" : "Sign in"}
          </span>
          {busy && (
            <span aria-hidden className="foot-rule-running absolute inset-x-0 bottom-0 h-0.5 bg-canvas" />
          )}
        </button>
      </form>

      <aside className="lg:mt-9">
        {/* The demo, on the page a reader actually landed on.
            This block used to read "A firm owner creates one with `diligence
            user create`" — a command-line instruction, on the page the largest
            button on the marketing site pointed at. A visitor who has never seen
            this product before was being told to run a CLI. The demo account is
            the answer to "no account yet" for almost everyone who reads this
            line, so it is the thing the line says. */}
        <div className="border-t border-hairline pt-5">
          <p className="font-mono text-label-12 uppercase text-ink-muted">No account? Use the demo</p>
          <p className="mt-2 max-w-[40ch] text-caption-13 leading-relaxed text-ink-muted">
            {DEMO_FIRM}, a generated firm carrying two client companies and twelve months of
            books. Nothing in it is real and nothing you do to it matters.
          </p>
          <dl className="mt-3 grid grid-cols-[5rem_minmax(0,1fr)] gap-y-1 text-caption-13">
            <dt className="font-mono text-label-12 uppercase text-ink-subtle">Email</dt>
            <dd className="select-all break-all font-mono text-ink">{DEMO_EMAIL}</dd>
            <dt className="font-mono text-label-12 uppercase text-ink-subtle">Password</dt>
            <dd className="select-all break-all font-mono text-ink">{DEMO_PASSWORD}</dd>
          </dl>
          <button
            type="button"
            onClick={() => {
              setEmail(DEMO_EMAIL);
              setPassword(DEMO_PASSWORD);
              setError(null);
            }}
            className="mt-4 border border-ink px-4 py-2.5 font-mono text-label-12 uppercase tracking-[0.08em] text-ink press-verb hover:bg-ink hover:text-plate-ink"
          >
            Fill the demo account
          </button>
        </div>

        {/* Locked out, which the page had no answer for at all.
            "There is no self-service signup" is the right policy and it was
            being made to carry a question it does not answer: somebody who
            has an account and has lost the password was given no route, no
            address and nobody to ask. A login page that cannot be recovered
            from is the dead end this whole pass exists to remove, and the
            honest version of the answer is short — the firm owner holds it,
            because the firm owns the data. */}
        <div className="mt-8 border-t border-hairline pt-5">
          <p className="font-mono text-label-12 uppercase text-ink-muted">Locked out</p>
          <p className="rag-pretty mt-2 max-w-[42ch] font-sans text-caption-13 leading-relaxed text-ink-subtle">
            Your firm owner resets passwords, because the firm holds the account and the
            client data under it. Real accounts are created the same way — there is no
            self-service signup, because there is no self-service client data.
          </p>
        </div>
      </aside>
    </div>
  );
}

function Field({
  label,
  name,
  type,
  value,
  onChange,
  autoComplete,
  invalid,
  described,
  reveal,
}: {
  label: string;
  /** Also the `id`. Without either, this field posts nothing and fills badly. */
  name: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  /** Set on both fields after a rejected credential: the API does not say which. */
  invalid: boolean;
  /** Point at the explanation whenever there is one, whosever fault it was. */
  described: boolean;
  reveal?: { on: boolean; toggle: () => void };
}) {
  return (
    <div>
      <label htmlFor={name} className="block">
        <span className="font-mono text-label-12 uppercase tracking-[0.06em] text-ink-muted">
          {label}
        </span>
      </label>
      {/* `focus:outline-none` used to sit at the end of this list. Tailwind
          compiles it to `outline: 2px solid transparent`, which beat the
          global `:focus-visible` rule on specificity and left the login form
          — the one page on the site where a keyboard user has to know where
          they are — with a focus ring measuring rgba(0,0,0,0). The border
          colour change that remained is 3.39:1 against the unfocused state,
          which is a hint, not an indicator. The global ring is better than
          anything worth replacing it with. */}
      {/* A rule, not a box. Every other field of every other kind on this
          site is a line on paper — the dividers, the schedules, the sign-off
          — and the two inputs were the only boxed controls in the document,
          sitting on a `sunk` fill that measures 1.07:1 against the sheet and
          therefore draws nothing at all. The border was already doing the
          entire job; this is the border doing it in the document's own idiom,
          two pixels of graphite that take the indigo when the caret lands.

          And it is set in the mono. The type system's rule is that anything
          which points at a row rather than measuring one is an identifier and
          stays in Plex Mono — the demo email is printed that way a column
          from here — while the field you type that same address into fell
          back to Plex Sans. One string, two faces, decided by whether it was
          printed or typed. */}
      <div className="relative">
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          required
          aria-invalid={invalid || undefined}
          aria-describedby={described ? "sign-in-error" : undefined}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          className={
            "field-rule mt-1.5 w-full border-0 border-b-2 border-ink-subtle bg-transparent px-0 py-2 font-mono text-copy-17 text-ink focus:border-ink" +
            (reveal ? " pr-16" : "")
          }
        />
        {reveal && (
          <button
            type="button"
            onClick={reveal.toggle}
            // Not `aria-pressed`: the control renames itself, and a toggle
            // that reports both its state and a changing name is read twice
            // over. The name is the state.
            className="press-verb absolute bottom-2 right-0 font-mono text-label-12 uppercase tracking-[0.06em] text-ink-muted hover:text-ink"
          >
            {reveal.on ? "Hide" : "Show"}
          </button>
        )}
      </div>
    </div>
  );
}
