"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * The page for something having genuinely gone wrong.
 *
 * There was no error boundary anywhere in this app, and that absence is the
 * whole reason a failure here reads the way it does. Without one, any throw a
 * server component does not catch by hand renders Next's built-in page: a
 * blank screen carrying "An error occurred in the Server Components render",
 * a digest, and no way back. Every unhandled throw looked identical and told
 * the reader nothing — including which of them were the engine being down.
 *
 * `not-found.tsx` is careful to say that a missing page is NOT a failure. This
 * is its opposite number and says the opposite plainly, because a reader who
 * confuses the two goes looking for the wrong fix.
 *
 * The digest is printed. It is the only thing that ties what the reader saw to
 * the line in the server log that produced it, and a reader who cannot quote
 * it cannot be helped.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server has already logged this; the browser console is where the
    // person looking at the screen can find it.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-[70ch] px-6 py-24">
      <p className="font-mono text-label-12 uppercase tracking-[0.08em] text-exposure-deep">
        Something failed
      </p>
      <h1 className="mt-2 text-copy-19 font-semibold tracking-tight">
        This page did not finish building
      </h1>
      <p className="mt-3 text-copy-17 leading-relaxed text-ink-muted">
        Unlike a missing address, this is a failure: the page was asked for, and something on
        the way to it stopped. Nothing you did caused it and nothing has been written or
        changed. Trying again is safe.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button
          type="button"
          onClick={reset}
          className="magnetic rounded-chip border-2 border-books bg-books px-6 py-3 font-mono text-caption-13 uppercase tracking-[0.08em] text-plate-ink hover:bg-canvas hover:text-books"
        >
          Try again
        </button>
        <Link
          href="/app"
          className="mark-verb text-caption-13 underline decoration-hairline underline-offset-4 hover:decoration-ink"
        >
          All client companies
        </Link>
      </div>

      {error.digest && (
        <p className="mt-10 border-t border-hairline pt-3 font-mono text-label-12 uppercase text-ink-subtle">
          Reference{" "}
          <span className="fig select-all text-ink">{error.digest}</span> — quote this if you
          report it
        </p>
      )}
    </main>
  );
}
