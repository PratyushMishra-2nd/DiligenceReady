import { ContentsNav } from "./ContentsNav";
import { DemoButton } from "./DemoButton";
import { Logo } from "./Logo";
import { MastheadTheme } from "./MastheadTheme";

/**
 * The running head.
 *
 * Seven nav items became four. "Screens", "Your data" and "Who it's for" were
 * anchors into a document that no longer runs at that length, and a row of
 * seven uppercase mono links is a menu, not wayfinding.
 *
 * The one addition is the Section 16(4) tool, promoted from a 14px link in
 * the colophon to a nav item. It answers a real statutory question in about
 * ten seconds, it does not depend on the demo engine being reachable, and it
 * is the only thing on this site a CA would forward to another CA. Nobody
 * forwards a landing page; people forward a tool.
 *
 * `Index W-1` is gone. It was foliation from a metaphor this page no longer
 * runs, and it sat in the running head of every route announcing a sheet
 * number to readers who had not been told there were sheets.
 *
 * The header is transparent over the hero and gains a blurred ground and a
 * hairline once the reader leaves it — driven by a scroll timeline in
 * globals.css rather than by a scroll listener, so it costs no main thread.
 */
export function Masthead({ current }: { current?: string } = {}) {
  return (
    <header className="vt-masthead masthead sticky top-0 z-50 px-6 sm:px-10">
      <MastheadTheme />
      <div className="mx-auto flex max-w-sheet flex-wrap items-center justify-between gap-x-10 gap-y-2 py-3.5">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <a href="/" className="logo-lockup text-head-4" aria-label="DiligenceReady, home">
            <Logo />
          </a>
          <p className="hidden text-caption-13 text-ink-subtle sm:block">
            Reconciliation for CA firms
          </p>
        </div>

        <nav aria-label="Primary" className="flex items-center gap-6">
          <ContentsNav items={NAV} />
          {NAV.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="mark-verb no-print hidden text-ui-15 text-ink-muted hover:text-ink lg:inline"
            >
              {label}
            </a>
          ))}

          {current === "/sign-in" ? (
            <span
              aria-current="page"
              className="no-print hidden text-ui-15 text-ink-subtle sm:inline"
            >
              Sign in
            </span>
          ) : (
            <a
              href="/sign-in"
              className="mark-verb no-print hidden text-ui-15 text-ink-muted hover:text-ink sm:inline"
            >
              Sign in
            </a>
          )}

          <div className="no-print contents">
            <DemoButton variant="masthead" />
          </div>
        </nav>
      </div>
    </header>
  );
}

const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/tools/section-16-4", label: "16(4) tool" },
  { href: "/#faq", label: "FAQ" },
];
