/**
 * The way in, as a button that actually opens the thing.
 *
 * It posts to `/demo`, which signs in as the seeded firm on the server and
 * lands the reader on the dashboard. Every call to action on this page used to
 * be a link to `/sign-in` — an empty password box for an account a first-time
 * visitor had no reason to think they had — and the credentials that would
 * have rescued that click were printed further down the page they had just
 * left.
 *
 * A form rather than a link, because signing in creates a session and a GET
 * that changes state is one a prefetch or a crawler will fire unasked.
 * `display: contents` keeps the form out of the layout, so the button sits in
 * its parent's flex row exactly as the link it replaces did.
 *
 * The form still degrades without JavaScript, which matters more here than it
 * usually does: this is the one control on the page that has to work.
 */
const STYLES = {
  // The hero, and anywhere else the button is the point of the block.
  primary:
    "border-2 border-books bg-books px-6 py-3 font-mono text-ident uppercase tracking-[0.08em] text-stock press-verb hover:bg-stock hover:text-books",
  // The masthead. Bigger than the `compact` it replaced: this is the only
  // call to action present across the whole page, and it was also the
  // smallest one on it.
  masthead:
    "border-2 border-books bg-books px-5 py-2.5 font-mono text-ident uppercase tracking-[0.06em] text-stock press-verb hover:bg-stock hover:text-books",
  compact:
    "border-2 border-books bg-books px-4 py-2 font-mono text-stub uppercase text-stock press-verb hover:bg-stock hover:text-books",
  // Beside a primary, where a second filled button would fork the eye.
  outline:
    "border-2 border-hairline px-6 py-3 font-mono text-ident uppercase tracking-[0.08em] text-graphite press-verb hover:border-agreed hover:text-agreed",
  // On the inverted plate the inks swap: bone on black.
  plate:
    "border-2 border-stock bg-stock px-6 py-3 font-mono text-ident uppercase tracking-[0.08em] text-plate press-verb hover:bg-transparent hover:text-stock",
  // Inside a sentence, where the surrounding type is prose and a button would
  // be a box in the middle of a paragraph.
  link:
    "text-agreed underline decoration-graphite-soft underline-offset-4 press-verb hover:decoration-agreed",
} as const;

export function DemoButton({
  variant = "primary",
  label = "Open the demo",
}: {
  variant?: keyof typeof STYLES;
  label?: string;
}) {
  return (
    <form action="/demo" method="post" className="contents">
      <button type="submit" className={STYLES[variant]}>
        {label}
      </button>
    </form>
  );
}
