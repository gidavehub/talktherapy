"use client";

/**
 * Last-resort boundary for a crash in the root layout itself.
 *
 * Replaces the whole document, so it must render its own <html> and <body>,
 * and it cannot rely on the app's fonts or providers having mounted. Styles are
 * inline for that reason — globals.css may not have loaded either.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#E7E4DE",
          color: "#0A0A0A",
          fontFamily: "system-ui, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          <p
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.22em",
              color: "#6B6B6B",
              margin: 0,
            }}
          >
            Something went wrong
          </p>
          <h1
            style={{
              marginTop: 16,
              fontSize: 40,
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
              fontWeight: 500,
            }}
          >
            Talk could not start.
          </h1>
          <p style={{ marginTop: 20, fontSize: 15, lineHeight: 1.6, color: "#6B6B6B" }}>
            Something failed while loading the application. Reloading usually
            fixes it.
          </p>

          <button
            type="button"
            onClick={unstable_retry}
            style={{
              marginTop: 32,
              height: 48,
              padding: "0 28px",
              borderRadius: 999,
              border: "none",
              background: "#FF5A1F",
              color: "#fff",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>

          <p style={{ marginTop: 32, fontSize: 13, color: "#6B6B6B" }}>
            If you need urgent help, call 117 for police or 116 for an ambulance.
          </p>

          {error.digest ? (
            <p style={{ marginTop: 16, fontSize: 12, color: "#6B6B6B" }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
