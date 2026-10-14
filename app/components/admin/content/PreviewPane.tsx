"use client";

import { useEffect, useRef, useState } from "react";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { Spinner } from "@/components/ui/Feedback";
import { endPreview, startPreview } from "@/lib/content/client";
import { GlyphExternal } from "./icons";

/**
 * The real public page, with the drafts in it.
 *
 * The page is loaded in a frame from this same site, with the preview turned
 * on for this browser (app/api/preview): the server then draws it from the
 * drafts, through the same components and the same reader as the live site —
 * so what is shown here is exactly what publishing will show.
 *
 * A frame, not a shrunken copy: the site's layouts change with the width of
 * the window, and a frame is a window. It is drawn at the width chosen (a
 * phone, a tablet, a computer) and scaled down to fit the space here.
 *
 * Each time the draft is saved the page is loaded again, into a second frame
 * behind the first, which is swapped to the front once it has drawn and has
 * been scrolled to the same place — so the preview changes without flashing
 * white or jumping back to the top.
 */

export type DeviceWidth = 375 | 768 | 1200;

const DEVICES: { value: `${DeviceWidth}`; label: string }[] = [
  { value: "375", label: "Phone" },
  { value: "768", label: "Tablet" },
  { value: "1200", label: "Computer" },
];

/** The sign-in behind the preview lasts an hour; it is renewed before the last few minutes. */
const RENEW_BEFORE_MS = 5 * 60_000;

type Frame = { src: string; n: number } | null;

export default function PreviewPane({
  route,
  version,
  label,
  scrollTo = "top",
  className = "",
}: {
  /** The public page to show: "/", "/about". */
  route: string;
  /** Goes up when the draft is saved: the page is loaded again. */
  version: number;
  /** What is being previewed, for the frame's name: "the About page". */
  label: string;
  /** The footer is at the foot of the page: start there. */
  scrollTo?: "top" | "bottom";
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRefs = useRef<(HTMLIFrameElement | null)[]>([null, null]);
  const expiresAt = useRef(0);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [chosen, setChosen] = useState<DeviceWidth | null>(null);
  // Two frames: the one in front, and the one loading behind it.
  const [view, setView] = useState<{ frames: [Frame, Frame]; front: number }>({ frames: [null, null], front: 0 });
  /** The version the front frame shows, once it has drawn. */
  const [drawn, setDrawn] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  /** Goes up when the preview should be switched on again and the page reloaded. */
  const [renewal, setRenewal] = useState(0);
  const { frames, front } = view;
  const loading = drawn !== version;

  // The space the frame has to fit into.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ width: Math.floor(width), height: Math.floor(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Preview off when this closes, so the public pages in this browser go
  // back to showing what visitors see. Coming back to this tab switches it
  // on again: an editor closed in another tab will have switched it off.
  useEffect(() => {
    const until = expiresAt;
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      until.current = 0;
      setRenewal((n) => n + 1);
    }
    // Closing the tab unmounts nothing, so it is said here too.
    function onLeave() {
      until.current = 0;
      void endPreview(true);
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onLeave);
      until.current = 0;
      void endPreview();
    };
  }, []);

  // Load the page again whenever the draft changes, into the frame behind.
  // A load still on its way when a newer one starts is replaced by it.
  useEffect(() => {
    let current = true;
    const until = expiresAt;
    async function ensurePreview(): Promise<boolean> {
      if (until.current - Date.now() >= RENEW_BEFORE_MS) return true;
      const next = await startPreview();
      until.current = next ?? 0;
      return next !== null;
    }
    void ensurePreview().then((on) => {
      if (!current) return;
      setFailed(!on);
      setView((prev) => {
        const frames: [Frame, Frame] = [prev.frames[0], prev.frames[1]];
        frames[1 - prev.front] = {
          src: `${route}${route.includes("?") ? "&" : "?"}preview=${version}.${renewal}`,
          n: version,
        };
        return { ...prev, frames };
      });
    });
    return () => {
      current = false;
    };
  }, [route, version, renewal]);

  /** A frame has drawn its page: bring it to the front, scrolled to where the other one was. */
  function loaded(index: number) {
    const frame = frameRefs.current[index];
    const other = frameRefs.current[1 - index];
    const shown = frames[index];
    if (!shown) return;
    try {
      const doc = frame?.contentDocument;
      const win = frame?.contentWindow;
      if (doc && win) {
        // The preview is for looking: links and forms inside it go nowhere.
        doc.addEventListener(
          "click",
          (e) => {
            if ((e.target as Element | null)?.closest?.("a, button[type=submit]")) e.preventDefault();
          },
          true,
        );
        doc.addEventListener("submit", (e) => e.preventDefault(), true);
        const y = frames[1 - index] ? (other?.contentWindow?.scrollY ?? 0) : 0;
        if (y > 0) win.scrollTo(0, y);
        else if (scrollTo === "bottom") win.scrollTo(0, doc.documentElement.scrollHeight);
      }
    } catch {
      // A page that failed to load may be one this site cannot reach into; it is shown as it is.
    }
    setView((prev) => ({ ...prev, front: index }));
    setDrawn(shown.n);
  }

  const auto: DeviceWidth = box && box.width < 700 ? 375 : 1200;
  const device = chosen ?? auto;
  const scale = box ? Math.min(1, box.width / device) : 1;
  const height = box ? Math.ceil(box.height / scale) : 800;

  return (
    <section aria-label={`Preview of ${label}`} className={`flex min-h-0 flex-col ${className}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SegmentedControl
          size="sm"
          ariaLabel="Preview width"
          options={DEVICES}
          value={`${device}` as `${DeviceWidth}`}
          onChange={(next) => setChosen(Number(next) as DeviceWidth)}
        />
        <span className="flex min-w-0 flex-1 items-center gap-2 text-[12px] text-[var(--muted)]">
          {loading ? (
            <>
              <Spinner size={14} />
              Updating…
            </>
          ) : scale < 1 ? (
            `${device}px wide, shown at ${Math.round(scale * 100)}%`
          ) : (
            `${device}px wide`
          )}
        </span>
        <a
          href={route}
          target="_blank"
          rel="noopener"
          className="flex h-11 items-center gap-1.5 rounded-full px-3 text-[12.5px] text-[var(--accent-deep)] outline-none hover:bg-[var(--sand)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20"
        >
          <GlyphExternal size={14} />
          Open in a new tab
        </a>
      </div>

      {failed ? (
        <p className="mb-3 rounded-2xl bg-[var(--warning-soft)] px-4 py-3 text-[12.5px] leading-snug text-[var(--foreground)]">
          The preview could not be switched on, so this shows the page as it is live. Sign out and in again if it
          keeps happening.
        </p>
      ) : null}

      <div
        ref={boxRef}
        className="relative min-h-[420px] flex-1 overflow-hidden rounded-[22px] border border-[var(--dark)]/10 bg-[var(--sand)] shadow-[var(--shadow-card)]"
      >
        {frames.map((frame, index) =>
          frame ? (
            <iframe
              key={index}
              ref={(el) => {
                frameRefs.current[index] = el;
              }}
              src={frame.src}
              title={`Preview of ${label}`}
              tabIndex={index === front ? 0 : -1}
              aria-hidden={index === front ? undefined : true}
              onLoad={() => loaded(index)}
              style={{
                width: device,
                height,
                transform: `scale(${scale})`,
                // Centred when it is narrower than the space, as a phone would be.
                left: box && device * scale < box.width ? (box.width - device * scale) / 2 : 0,
              }}
              className={`absolute top-0 origin-top-left border-0 bg-[var(--background)] transition-opacity duration-200 ${
                index === front ? "z-10 opacity-100" : "z-0 opacity-0"
              }`}
            />
          ) : null,
        )}
        {!frames[0] && !frames[1] ? (
          <div className="absolute inset-0 grid place-items-center">
            <Spinner size={22} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
