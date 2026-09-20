import Link from "next/link";

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
    <header className="sticky top-0 z-50 border-b border-hairline bg-stock px-6 sm:px-10">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-baseline justify-between gap-x-10 gap-y-2 py-4">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          {/* The lockup, not the word. The mark beside it is the same two
              plates the dividers down the page are drawn from, so the first
              thing a reader sees is the argument the document then makes.
              Its own tagline stays off: the positioning line is already set
              beside it, in Newsreader, and printing it twice in two faces
              four pixels apart is a lockup used as wallpaper. */}
          <Link href="/" className="text-[1.25rem]" aria-label="DiligenceReady, home">
            <Logo />
          </Link>
          <p className="font-news text-ident text-graphite opsz-prose">
            Reconciliation for CA firms
          </p>
        </div>

        <nav className="flex items-center gap-6">
          {/* Above `lg`, the row. Below it, the same six behind a disclosure
              — because they used to be `hidden lg:inline` and nothing took
              their place, which left a page eighteen thousand pixels long
              with no wayfinding at all on the width most of it is read at.
              `<details>` and not a menu: no JavaScript, no state, no focus
              trap, and it works on the first paint. */}
          {/* The marker is already off globally — `summary { list-style:
              none }` in globals.css, with the `-webkit` pseudo beside it. */}
          <details className="no-print relative lg:hidden">
            <summary className="cursor-pointer font-mono text-stub uppercase text-graphite underline decoration-hairline underline-offset-4 hover:decoration-agreed">
              Contents
            </summary>
            {/* `left-0`, not `right-0`. The positioning context is the
                summary, which is about seventy pixels of the word CONTENTS
                at the left of the nav — so a right-aligned panel hung its
                two hundred pixels off the left edge of a 390px screen and
                half the list was unreachable. It opens rightwards from the
                word instead. */}
            <ul className="absolute left-0 top-full z-50 mt-3 min-w-[13rem] border border-hairline bg-stock py-1">
              {NAV.map(({ href, label }) => (
                <li key={href}>
                  <a
                    href={href}
                    className="block px-4 py-2.5 font-mono text-stub uppercase text-graphite hover:bg-sunk hover:text-agreed"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </details>

          {NAV.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="no-print hidden font-mono text-stub uppercase text-graphite underline decoration-hairline underline-offset-4 hover:decoration-agreed lg:inline"
            >
              {label}
            </a>
          ))}
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
