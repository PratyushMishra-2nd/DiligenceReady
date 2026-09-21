"use client";

/**
 * The last resort, for a failure in the root layout itself.
 *
 * `error.tsx` is rendered INSIDE the layout, so it cannot catch the layout
 * throwing — and the root layout does have a way to throw: `metadataBase: new
 * URL(SITE_URL)` runs at module scope, and a `NEXT_PUBLIC_SITE_URL` set
 * without a scheme takes down every route in the application at once,
 * including the not-found page.
 *
 * This replaces the whole document, so it has to carry its own `<html>` and
 * `<body>` and cannot rely on the layout's fonts or stylesheet being present.
 * Everything here is inline and system-font for that reason: a fallback that
 * depends on the thing that failed is not a fallback.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-IN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#fbfaf9",
          color: "#17181a",
          font: "400 17px/1.6 system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <main style={{ maxWidth: "70ch", margin: "0 auto", padding: "96px 24px" }}>
          <p
            style={{
              margin: 0,
              font: "500 12px/1 ui-monospace, SFMono-Regular, Consolas, monospace",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#9e2a1c",
            }}
          >
            Something failed
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: "19px", fontWeight: 600 }}>
            The application did not start
          </h1>
          <p style={{ margin: "12px 0 0", color: "rgba(23,24,26,0.72)" }}>
            This is a failure in the shell every page is built inside, rather than in one
            page. Nothing has been written or changed.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "32px",
              padding: "12px 24px",
              border: "2px solid #1f3d7a",
              borderRadius: "4px",
              background: "#1f3d7a",
              color: "#fbfaf9",
              font: "500 13px/1 ui-monospace, SFMono-Regular, Consolas, monospace",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p
              style={{
                marginTop: "40px",
                paddingTop: "12px",
                borderTop: "1px solid #e6e4df",
                font: "500 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace",
                textTransform: "uppercase",
                color: "rgba(23,24,26,0.64)",
              }}
            >
              Reference <span style={{ color: "#17181a" }}>{error.digest}</span>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
