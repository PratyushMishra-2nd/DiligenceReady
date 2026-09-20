import Link from "next/link";

import { ContentsNav } from "./ContentsNav";
import { DemoButton } from "./DemoButton";

import { Logo } from "./Logo";

/**
 * The masthead, which now stays.
 *
 * A visitor has to learn what this is before they are shown anything else, so
 * the name and the one-line positioning sit at the top of the page in that
 * order, and the way in sits opposite them.
 *
 * It is sticky, and that is a correction rather than a fashion. This page runs
 * to about eleven thousand pixels; measured, the reader met a call to action
 * at y=826 and then did not meet another until y=9855. Nine thousand pixels —
 * ten screens — of the most persuasive material on the site with nothing to
 * press at the moment it persuaded them. A document does not need a way out on
 * every screen. A front door does.
 *
 * It is a rule and a ground, not a floating bar: opaque bone, one hairline
 * under it, no shadow and no blur. The page is printed on paper and a shadow
 * is the one thing paper cannot cast. `position: static` is forced back on it
 * for print by globals.css, because a sticky header repeats itself on every
 * sheet.
 */
export function Masthead() {
  return (
    <header className="vt-masthead sticky top-0 z-50 border-b border-hairline bg-stock px-6 sm:px-10">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-baseline justify-between gap-x-10 gap-y-2 py-4">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          {/* The lockup, not the word. The mark beside it is the same two
              plates the dividers down the page are drawn from, so the first
              thing a reader sees is the argument the document then makes.
              Its own tagline stays off: the positioning line is already set
              beside it, in Newsreader, and printing it twice in two faces
              four pixels apart is a lockup used as wallpaper. */}
          <Link href="/" className="logo-lockup text-[1.25rem]" aria-label="DiligenceReady, home">
            <Logo />
          </Link>
          <p className="font-news text-ident text-graphite opsz-prose">
            Reconciliation for CA firms
          </p>
        </div>

        <nav className="flex items-center gap-6">
          {/* Above `lg`, the row. Below it, the same six behind a
              disclosure — they used to be `hidden lg:inline` with nothing in
              their place, which left a page eighteen thousand pixels long
              with no wayfinding at all on the width most of it is read at.
              The disclosure is a client component only because Escape and
              outside-tap need two listeners; the element itself is native
              `<details>` and opens with no JavaScript at all. */}
          <ContentsNav items={NAV} />

          {NAV.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="no-print hidden font-mono text-stub uppercase text-graphite mark-verb underline decoration-graphite-soft underline-offset-4 hover:decoration-agreed lg:inline"
            >
              {label}
            </a>
          ))}
          {/* The way back in, for somebody who already has an account.
              There was no link to `/sign-in` anywhere on this page. The
              argument was that a form is what an existing user wants and
              "this page is not read by those people" — but `/` is the domain
              root, so it is the first thing every returning customer hits.
              Stripe, Linear, Ramp, Razorpay and Zoho all put it here for the
              same reason. It sits before the demo button and is set as a
              link rather than a second filled button, because a firm that
              has an account and a stranger who does not are not being asked
              the same question. */}
          <Link
            href="/sign-in"
            className="mark-verb no-print hidden font-mono text-stub uppercase text-graphite underline decoration-graphite-soft underline-offset-4 hover:text-agreed hover:decoration-agreed sm:inline"
          >
            Sign in
          </Link>
          <div className="no-print contents">
            <DemoButton variant="masthead" />
          </div>
        </nav>
      </div>
    </header>
  );
}

/**
 * Six anchors: what it does, what it looks like, what it costs, where the
 * client's books go, who it is for, and the questions. In the order a partner
 * asks them.
 *
 * Three of these sections carried an id and appeared in no nav — `#screens`,
 * `#who` and `#pilot` — which is an anchor written for nobody. `#pilot` is
 * still not here, because the button to its right is the same ask and a
 * masthead that offers two routes to one section is a masthead arguing with
 * itself.
 *
 * Root-relative, not bare fragments. `href="#how"` resolves against whatever
 * route is being read, so on `/sign-in` — which now carries this masthead —
 * every one of these was a link to the current page's top. `/#how` is the
 * section, from anywhere.
 */
const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/#screens", label: "Screens" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#data", label: "Your data" },
  { href: "/#who", label: "Who it's for" },
  { href: "/#faq", label: "FAQ" },
];
