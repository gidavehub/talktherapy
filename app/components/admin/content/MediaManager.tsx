"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import Drawer from "@/components/ui/Drawer";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DescriptionList from "@/components/ui/DescriptionList";
import FileDropzone, { formatBytes } from "@/components/ui/FileDropzone";
import SearchField from "@/components/ui/SearchField";
import Tooltip from "@/components/ui/Tooltip";
import { Textarea } from "@/components/ui/Input";
import { Alert, EmptyState, Pill, Skeleton, SkeletonList } from "@/components/ui/Feedback";
import { IconImage, IconTrash } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { PageBar } from "@/components/ui/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { SPRING_SNAP } from "@/components/motion/primitives";
import { deleteMedia, updateMediaAlt, watchMedia } from "@/lib/content/client";
import { watchResourceIndex } from "@/lib/content/resources-client";
import {
  BUILT_IN_IMAGES,
  MEDIA_MAX_BYTES,
  MEDIA_TYPES,
  SECTIONS,
  isSectionId,
  usageResourceId,
  type MediaUsage,
  type SiteMedia,
} from "@/lib/content/schema";
import UploadDialog, { altProblem, choosePicture, type Chosen } from "./UploadDialog";
import { editorHref } from "./ContentIndex";
import { when } from "./format";
import { GlyphCopy } from "./icons";
import { nameFor, useStaffNames } from "./useStaffNames";

/**
 * The pictures the public site can use: upload, describe, see where each is
 * used, copy its address, delete what nothing uses.
 *
 * A picture on a published page cannot be deleted — the page would show a
 * hole — so the delete button says where it is instead, and the editor for
 * that page is a tap away. (Drafts are not checked: a draft that used a
 * deleted picture is asked for another before it can be published.)
 */

type Filter = "all" | "used" | "unused";

const ACCEPT = Object.keys(MEDIA_TYPES);

const TYPE_NAMES: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/avif": "AVIF",
};

/** Articles' titles by id, to say which article a picture is on. */
type Titles = Record<string, string>;

function usageLabel(usage: MediaUsage, titles: Titles): string {
  if (isSectionId(usage)) return SECTIONS[usage].label;
  const article = usageResourceId(usage) ?? "";
  return titles[article] ? `“${titles[article]}”` : "an article";
}

function usageHref(usage: MediaUsage): string {
  return isSectionId(usage) ? editorHref(usage) : `/admin/content/resources/${usageResourceId(usage) ?? ""}`;
}

function usedOn(media: SiteMedia, titles: Titles): string {
  return media.usage.map((usage) => usageLabel(usage, titles)).join(", ");
}

/** The resource centre's article titles, for naming where a cover picture is used. */
function useResourceTitles(): Titles {
  const [titles, setTitles] = useState<Titles>({});
  useEffect(
    () =>
      // Only for naming: if the articles cannot be read, "an article" says enough.
      watchResourceIndex(
        (rows) => setTitles(Object.fromEntries(rows.map((row) => [row.id, row.title]))),
        () => setTitles({}),
      ),
    [],
  );
  return titles;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function MediaManager() {
  const toast = useToast();
  const [media, setMedia] = useState<SiteMedia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState<{ file: Chosen | null } | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const titles = useResourceTitles();

  useEffect(
    () =>
      watchMedia(setMedia, () =>
        setError("The media library could not be loaded. Your staff access may need a moment — reload the page."),
      ),
    [],
  );

  const all = media ?? [];
  const counts: Record<Filter, number> = {
    all: all.length,
    used: all.filter((m) => m.usage.length > 0).length,
    unused: all.filter((m) => m.usage.length === 0).length,
  };
  const term = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      (media ?? []).filter((m) => {
        if (filter === "used" && m.usage.length === 0) return false;
        if (filter === "unused" && m.usage.length > 0) return false;
        return !term || m.alt.toLowerCase().includes(term) || usedOn(m, titles).toLowerCase().includes(term);
      }),
    [media, filter, term, titles],
  );
  const opened = all.find((m) => m.id === openId) ?? null;

  function dropped(files: File[]) {
    const picked = choosePicture(files[0]);
    if (typeof picked === "string") {
      setRejected([picked]);
      return;
    }
    setRejected([]);
    setUploading({ file: picked });
  }

  return (
    <div className="space-y-8">
      <PageBar>
        <span className="font-display hidden shrink-0 text-[20px] font-medium sm:block">Media</span>
        <SearchField value={search} onChange={setSearch} placeholder="Search by description or page" label="Search pictures" />
      </PageBar>

      <PageHeader
        className="!mb-0"
        breadcrumbs={[{ label: "Site content", href: "/admin/content" }, { label: "Media" }]}
        eyebrow="Site content"
        lines={["Pictures,", "for the public site."]}
        lede="Every picture uploaded for the site, where each is used, and what it shows for people who cannot see it."
        actions={
          <Button onClick={() => setUploading({ file: null })}>
            Upload a picture
          </Button>
        }
      />

      <section aria-label="Upload" className="rounded-[24px] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] md:p-6">
        <FileDropzone
          accept={ACCEPT}
          maxBytes={MEDIA_MAX_BYTES}
          onFiles={dropped}
          onReject={setRejected}
          label="Add a picture"
          hint="Drop it here or choose it — JPG, PNG, WebP or AVIF, up to 8 MB. You describe it next."
        />
        {rejected.length ? (
          <div role="alert" className="mt-3 space-y-1">
            {rejected.map((message, i) => (
              <p key={`${i}-${message}`} className="text-[13px] leading-snug text-[var(--danger)]">
                {message}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Show pictures that are">
        {(
          [
            { id: "all", label: "All" },
            { id: "used", label: "On the site" },
            { id: "unused", label: "Not used" },
          ] as const
        ).map((f) => (
          <Pill key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)} className="shrink-0">
            {f.label}
            <span className={`tabular-nums ${filter === f.id ? "text-white/80" : "text-[var(--muted)]"}`}>
              {media ? counts[f.id] : "–"}
            </span>
          </Pill>
        ))}
      </div>

      {error ? (
        <Alert tone="warning" title="Not loaded">
          {error}
        </Alert>
      ) : !media ? (
        <SkeletonList count={8} label="Loading the pictures" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Skeleton className="aspect-square w-full" rounded="rounded-[22px]" />
        </SkeletonList>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<IconImage size={18} />}
          title={term ? `Nothing described as “${search.trim()}”` : media.length ? "None here" : "No pictures uploaded yet"}
          description={
            term
              ? "Only descriptions and page names are searched. Try another word."
              : media.length
                ? "No picture is in this state."
                : "Upload the first one above. Until then, pages use the pictures that came with the site, below."
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-label="Uploaded pictures">
          {shown.map((m) => (
            <li key={m.id}>
              <motion.button
                type="button"
                onClick={() => setOpenId(m.id)}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                transition={SPRING_SNAP}
                className="block w-full overflow-hidden rounded-[22px] bg-[var(--surface)] text-left shadow-[var(--shadow-card)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent)]/30"
              >
                <span className="relative block aspect-square bg-[var(--sand)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a thumbnail; the button carries the description */}
                  <img src={m.url} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                </span>
                <span className="block p-3">
                  <span className="line-clamp-2 text-[13px] leading-snug">{m.alt || "No description"}</span>
                  <span className="mt-1.5 block truncate text-[11.5px] text-[var(--muted)]">
                    {m.usage.length ? `On ${usedOn(m, titles)}` : "Not on any page"}
                  </span>
                </span>
              </motion.button>
            </li>
          ))}
        </ul>
      )}

      <details className="group rounded-[24px] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] md:p-6">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block font-display text-[19px] font-medium">Pictures that came with the site</span>
            <span className="mt-0.5 block text-[12.5px] text-[var(--muted)]">
              Always there to choose from. They are part of the site, so they cannot be deleted.
            </span>
          </span>
          <span className="text-[12.5px] text-[var(--accent-deep)] group-open:hidden">Show</span>
          <span className="hidden text-[12.5px] text-[var(--accent-deep)] group-open:inline">Hide</span>
        </summary>
        <ul className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {BUILT_IN_IMAGES.map((src) => (
            <li key={src} className="min-w-0">
              <span className="arch relative block aspect-[4/5] overflow-hidden rounded-b-2xl bg-[var(--sage-soft)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- a thumbnail, named beneath */}
                <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-top" />
              </span>
              <span className="mt-1.5 block truncate text-[11px] text-[var(--muted)]">{src.replace("/people/", "")}</span>
            </li>
          ))}
        </ul>
      </details>

      <UploadDialog
        open={uploading !== null}
        file={uploading?.file ?? null}
        onClose={() => setUploading(null)}
        onUploaded={(added) => {
          toast.success("Uploaded", "It is in the library, ready to choose on any page.");
          setOpenId(added.id);
        }}
      />

      <MediaDetails media={opened} titles={titles} onClose={() => setOpenId(null)} />
    </div>
  );
}

function MediaDetails({ media, titles, onClose }: { media: SiteMedia | null; titles: Titles; onClose: () => void }) {
  return (
    <Drawer open={media !== null} onClose={onClose} eyebrow="Picture" title={media?.alt || "No description"} width="520px">
      {/* Keyed, so the description box starts from each picture's own words. */}
      {media ? <DetailsBody key={media.id} media={media} titles={titles} onClose={onClose} /> : null}
    </Drawer>
  );
}

function DetailsBody({ media, titles, onClose }: { media: SiteMedia; titles: Titles; onClose: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const names = useStaffNames([media.uploadedBy]);
  const [alt, setAlt] = useState(media.alt);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const problem = altProblem(alt);
  const inUse = media.usage.length > 0;
  const edited = alt.replace(/\s+/g, " ").trim() !== media.alt;

  async function saveAlt() {
    if (problem) return;
    setSaving(true);
    const result = await updateMediaAlt(media.id, alt.replace(/\s+/g, " ").trim());
    setSaving(false);
    if (result.ok) toast.success("Description saved", "Pages that already show it keep their own words.");
    else toast.error("Not saved", result.error);
  }

  return (
    <div className="space-y-6">
      <span className="relative block aspect-[4/3] overflow-hidden rounded-[22px] bg-[var(--sand)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- the picture itself, described in the box below */}
        <img src={media.url} alt={media.alt} className="absolute inset-0 h-full w-full object-contain" />
      </span>

      <div className="space-y-3">
        <Textarea
          label="Description"
          hint="Suggested whenever the picture is chosen for a page. Each page keeps the words it was given."
          rows={3}
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          error={edited ? problem : null}
        />
        <Button size="sm" variant="secondary" onClick={() => void saveAlt()} disabled={!edited || Boolean(problem)} loading={saving}>
          Save the description
        </Button>
      </div>

      <section aria-labelledby={`used-${media.id}`} className="rounded-[20px] bg-[var(--surface-2)] px-4 py-3">
        <h3 id={`used-${media.id}`} className="text-[12px] font-medium uppercase tracking-[0.18em]">
          Where it is used
        </h3>
        {inUse ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {media.usage.map((usage) => (
              <li key={usage}>
                <Link
                  href={usageHref(usage)}
                  className="inline-flex h-9 items-center rounded-full bg-[var(--surface)] px-3.5 text-[12.5px] text-[var(--accent-deep)] outline-none hover:bg-[var(--sand)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20"
                >
                  {usageLabel(usage, titles)}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[13px] text-[var(--muted)]">Not on any published page.</p>
        )}
      </section>

      <DescriptionList
        columns={2}
        items={[
          { label: "Size", value: `${media.width} × ${media.height} · ${formatBytes(media.bytes)}` },
          { label: "Type", value: TYPE_NAMES[media.type] ?? media.type },
          { label: "Uploaded", value: `${when(media.createdAt)} UTC` },
          { label: "By", value: nameFor(media.uploadedBy, names, user?.uid) },
          {
            label: "Address",
            wide: true,
            value: (
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--muted)]">{media.url}</span>
                <Tooltip content="Copy the address">
                  <button
                    type="button"
                    aria-label="Copy the picture's address"
                    onClick={() =>
                      void copy(media.url).then((ok) =>
                        ok ? toast.success("Address copied") : toast.error("Not copied", "Select the address and copy it."),
                      )
                    }
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none hover:bg-[var(--sand)] focus-visible:ring-4 focus-visible:ring-[var(--accent)]/20"
                  >
                    <GlyphCopy size={16} />
                  </button>
                </Tooltip>
              </span>
            ),
          },
        ]}
      />

      <div className="border-t border-[var(--border)] pt-5">
        {inUse ? (
          <p className="mb-3 text-[13px] leading-relaxed text-[var(--muted)]">
            It cannot be deleted while it is on {usedOn(media, titles)}. Choose another picture there and publish, then delete
            this one.
          </p>
        ) : null}
        <Button variant="danger" size="sm" disabled={inUse} onClick={() => setDeleting(true)}>
          <span className="flex items-center gap-2">
            <IconTrash size={15} />
            Delete the picture
          </span>
        </Button>
      </div>

      <ConfirmDialog
        open={deleting}
        title="Delete this picture?"
        danger
        confirmLabel="Delete"
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          const result = await deleteMedia(media.id);
          setDeleting(false);
          if (result.ok) {
            toast.success("Deleted");
            onClose();
          } else {
            toast.error("Not deleted", result.error);
          }
        }}
        body={
          <p>
            It leaves the library and the site for good. No published page shows it; a draft that does will ask for
            another picture before it can be published.
          </p>
        }
      />
    </div>
  );
}
