"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Everything on this screen, reachable from the keyboard.
 *
 * A firm carries thirty to eighty companies and a period can hold sixty
 * findings. Reaching any of them by pointing costs a scroll, a read and a
 * click; reaching them by typing three characters costs neither. This is the
 * one control in the product that is faster than knowing where things are.
 *
 * Hand-rolled rather than installed. It is a filtered list over data the page
 * already holds, and a command-menu dependency would bring its own styling
 * vocabulary — rounded panels, shadows, a dimmed backdrop — into a product
 * whose entire visual argument is hairlines on paper.
 */

export type Command = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  keywords?: string;
  run: () => void;
};

export function CommandPalette({ commands }: { commands: Command[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      // Escape is handled here rather than only on the input, because focus
      // can leave the input — a click on a row, a scroll, a browser quirk —
      // and a dialog you cannot dismiss from the keyboard is a trap.
      if (event.key === "Escape") {
        setOpen((value) => {
          if (value) event.preventDefault();
          return false;
        });
        return;
      }
      // A bare slash is the other half of the same habit, and it must not
      // fire while someone is typing a question into the ledger box.
      if (event.key === "/" && !typingInAField(event.target)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    input.current?.focus();
  }, [open]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const scored = commands
      .map((command) => ({
        command,
        score: score(needle, `${command.label} ${command.hint ?? ""} ${command.keywords ?? ""}`),
      }))
      .filter((entry) => entry.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 40).map((entry) => entry.command);
  }, [commands, query]);

  useEffect(() => {
    if (cursor >= matches.length) setCursor(0);
  }, [matches.length, cursor]);

  useEffect(() => {
    list.current?.children[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  function choose(command: Command | undefined) {
    if (!command) return;
    setOpen(false);
    command.run();
  }

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-start justify-center bg-agreed/20 px-4 pt-[12vh]"
      onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-[34rem] border border-agreed bg-sunk"
      >
        <input
          ref={input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Go to a finding, a period or another company"
          aria-label="Search commands"
          className="w-full border-b border-hairline bg-sunk px-4 py-3 text-prose text-agreed placeholder:text-graphite-soft"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || (event.ctrlKey && event.key === "n")) {
              event.preventDefault();
              setCursor((value) => Math.min(value + 1, matches.length - 1));
            } else if (event.key === "ArrowUp" || (event.ctrlKey && event.key === "p")) {
              event.preventDefault();
              setCursor((value) => Math.max(value - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              choose(matches[cursor]);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
        />

        {matches.length === 0 ? (
          <p className="px-4 py-6 text-ident text-graphite">Nothing matches that.</p>
        ) : (
          <ul ref={list} className="max-h-[52vh] overflow-y-auto">
            {matches.map((command, index) => {
              const previous = matches[index - 1];
              return (
                <li key={command.id}>
                  {previous?.group !== command.group && (
                    <p className="border-b border-hairline bg-stock px-4 py-1 text-ident text-graphite">
                      {command.group}
                    </p>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => choose(command)}
                    className={`flex w-full items-baseline gap-4 px-4 py-2 text-left ${
                      index === cursor ? "bg-agreed-wash" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-ident">{command.label}</span>
                    {command.hint && (
                      <span className="tabular shrink-0 font-mono text-ident text-graphite">
                        {command.hint}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* The footer legend documented the only two ways out — a key and a
            click on the dimmed ground behind — and both of them are things you
            have to already know. The palette is opened by a keystroke but also
            by the "⌘K · keys" button beside the filter row, so a reader can
            arrive here having touched nothing but a screen, where `esc` does
            not exist and the ground behind is a place you close things by
            accident rather than on purpose. One button, in the idiom the
            evidence panel already uses for the same job. */}
        <div className="flex items-center justify-between gap-4 border-t border-hairline px-4 py-2">
          <p className="text-ident text-graphite-soft">
            <Key>↑</Key> <Key>↓</Key> to move · <Key>↵</Key> to go · <Key>esc</Key> to close
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close the command palette"
            className="shrink-0 border border-hairline px-2 py-0.5 text-ident text-graphite hover:border-agreed hover:text-agreed"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="border border-hairline bg-stock px-1 font-mono text-ident text-graphite">
      {children}
    </kbd>
  );
}

/**
 * Subsequence matching, the way every command menu worth using behaves: "gtx"
 * finds "Ganga Textiles". A contiguous run scores higher than a scattered one,
 * so the exact word wins over the coincidence.
 */
function score(needle: string, haystack: string): number {
  if (needle === "") return 1;
  const target = haystack.toLowerCase();
  let index = 0;
  let total = 0;
  let streak = 0;
  for (const character of needle) {
    const found = target.indexOf(character, index);
    if (found === -1) return 0;
    streak = found === index ? streak + 1 : 0;
    total += 1 + streak;
    index = found + 1;
  }
  return total;
}

function typingInAField(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable;
}
