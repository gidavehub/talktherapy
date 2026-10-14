"use client";

/**
 * Last-resort boundary for a crash in the root layout itself.
 *
 * Replaces the whole document, so it must render its own <html> and <body>,
 * and it cannot rely on the app's fonts or providers having mounted. Styles are
 * inline for that reason — globals.css may not have loaded either. The colours
 * are the brand tokens written out by hand (background, foreground, muted,
 * accent), so this still looks like TALK when nothing else has loaded.
 */
const BACKGROUND = "#FBF7F1";
const FOREGROUND = "#3B2C26";
const MUTED = "#7A6A61";
const ACCENT = "#C8754E";
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: BACKGROUND,
          color: FOREGROUND,
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
              color: ACCENT,
              margin: 0,
            }}
          >
            Something went wrong
          </p>
          <h1
            style={{
              marginTop: 16,
              // Fraunces has not loaded here; the nearest serif stands in.
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: 40,
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
              fontWeight: 500,
            }}
          >
            TALK could not start.
          </h1>
          <p style={{ marginTop: 20, fontSize: 15, lineHeight: 1.6, color: MUTED }}>
            Something failed while loading the application. Reloading usually
            fixes it.
          </p>

          <button
            type="button"
            onClick={retry}
            style={{
              marginTop: 32,
              height: 48,
              padding: "0 28px",
              borderRadius: 999,
              border: "none",
              background: ACCENT,
              color: "#fff",
              fontSize: 14.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>

          <p style={{ marginTop: 32, fontSize: 13, color: MUTED }}>
            If you are in danger right now, call 117 for police or 116 for an ambulance — both are free.
          </p>

          {error.digest ? (
            <p style={{ marginTop: 16, fontSize: 12, color: MUTED }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
