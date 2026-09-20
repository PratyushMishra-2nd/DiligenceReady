/**
 * A region that is context rather than work: still on the page, closed by
 * default, and costing one line when it is.
 *
 * The closed state has to keep informing, which is why the summary carries the
 * section's headline figure. A disclosure that collapses to a title alone
 * hides the one thing a CA would have scanned for, and they would open all
 * three every visit to find out whether they needed to.
 *
 * `<details>` and not React state: it is keyboard-operable, it is findable by
 * the browser's own in-page search, and it is what the print handler can force
 * open for a filed copy.
 */
export function Disclosure({
  title,
  headline,
  children,
  defaultOpen = false,
}: {
  title: string;
  headline?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group border-b border-graphite-soft">
      <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-8 gap-y-1 py-4">
        <h2 className="flex items-baseline gap-2 text-ident font-semibold">
          <svg
            viewBox="0 0 8 10"
            aria-hidden
            className="h-2.5 w-2 shrink-0 text-graphite-soft transition-transform group-open:rotate-90"
          >
            <path d="M1 1l5 4-5 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          {title}
        </h2>
        {headline}
      </summary>
      <div className="pb-8">{children}</div>
    </details>
  );
}
