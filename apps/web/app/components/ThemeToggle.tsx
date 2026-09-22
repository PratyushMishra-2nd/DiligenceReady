"use client";

import { useEffect, useState } from "react";

/**
 * Light, dark, or whatever the machine says.
 *
 * The palette has had a dark half since the day `globals.css` grew one — two
 * complete sets of variables, one under `prefers-color-scheme: dark` and one
 * under `:root[data-theme="dark"]`. Nothing ever wrote that attribute. So the
 * second set was unreachable and the first was the only theme anyone could
 * have: the operating system's, with no way to disagree with it.
 *
 * Three states rather than two, and the third is the default. A two-state
 * toggle has to pick a side the moment it is built, and whichever it picks is
 * wrong for the reader whose machine already said the other — a CA who runs
 * Windows in dark mode should not have to press a button on every device to
 * get back what their OS already promised. `Auto` is therefore not a setting
 * so much as the absence of one: nothing is stored, no attribute is written,
 * and the media query decides. Light and dark are the reader overriding it,
 * and an override is the kind of thing that is worth persisting.
 *
 * Why `localStorage` and not a cookie: the choice is a property of the screen
 * in front of someone, not of their account. A partner on a bright office
 * monitor and the same partner on a laptop at 11pm want different answers,
 * and a server-side preference would give them one answer twice. The cost is
 * that the server cannot know the choice at render time, which is what the
 * boot script in `layout.tsx` exists to cover — it writes the attribute
 * before the first paint, so there is no flash of the wrong theme.
 */

export const THEME_KEY = "dr-theme";

/**
 * The script that runs before anything is painted.
 *
 * Inlined into the document head rather than imported, because a module has
 * to be fetched and by then the page is on screen in the wrong colours. It is
 * deliberately tiny and deliberately wrapped: `localStorage` throws outright
 * in a browser with site data blocked, and a theme preference is not worth
 * taking the page down for.
 */
export const THEME_BOOT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}`;

type Choice = "system" | "light" | "dark";

const NEXT: Record<Choice, Choice> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const LABEL: Record<Choice, string> = {
  system: "Auto",
  light: "Light",
  dark: "Dark",
};

function stored(): Choice {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/** What the machine would choose if we did not. */
function systemTheme(): "light" | "dark" {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function apply(choice: Choice) {
  const root = document.documentElement;
  if (choice === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = choice;
  }
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // A reader with site data blocked still gets the theme they pressed for,
    // for as long as the tab is open. Losing it on reload is a smaller
    // failure than refusing to change the colours at all.
  }
}

export function ThemeToggle() {
  // Nothing is rendered until the component is running in the browser. The
  // server cannot know what is in `localStorage`, so anything it rendered
  // here would be a guess that React then has to reconcile against the truth
  // — and the mismatch it reports is on the one element whose whole job is to
  // say what the current theme is.
  const [choice, setChoice] = useState<Choice | null>(null);
  const [system, setSystem] = useState<"light" | "dark">("light");

  useEffect(() => {
    setChoice(stored());
    setSystem(systemTheme());

    // The OS can change under a page that is already open — most desktops
    // switch at sunset — and on `Auto` that has to be reflected in the label,
    // which is otherwise a stale claim about which colours are on screen.
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) =>
      setSystem(event.matches ? "dark" : "light");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  if (choice === null) return null;

  const resolved = choice === "system" ? system : choice;
  const next = NEXT[choice];

  return (
    <button
      type="button"
      onClick={() => {
        apply(next);
        setChoice(next);
      }}
      // The control cycles rather than opens, so the label alone does not say
      // what pressing it does. Both are spelled out for a screen reader, and
      // the title carries the same sentence for a mouse.
      aria-label={`Theme: ${LABEL[choice].toLowerCase()}${
        choice === "system" ? ` (${resolved})` : ""
      }. Switch to ${LABEL[next].toLowerCase()}.`}
      title={`Theme: ${LABEL[choice]}. Click for ${LABEL[next]}.`}
      className="no-print fixed bottom-4 left-4 z-40 flex items-center gap-2 border border-hairline bg-canvas px-2.5 py-1.5 font-mono text-label-12 uppercase tracking-[0.06em] text-ink-muted press-verb hover:border-ink hover:text-ink"
    >
      {/* Sun and moon as one glyph each, drawn rather than fetched: an icon
          font for two shapes is a network call and a flash of nothing. */}
      <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5">
        {resolved === "dark" ? (
          <path
            d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        ) : (
          <g fill="none" stroke="currentColor" strokeWidth="1.3">
            <circle cx="8" cy="8" r="3.1" />
            <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3.1 3.1l1.1 1.1M11.8 11.8l1.1 1.1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1" />
          </g>
        )}
      </svg>
      {LABEL[choice]}
    </button>
  );
}
