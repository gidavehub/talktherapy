"use client";

import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import MediaLibrary from "@/components/ui/MediaLibrary";
import { pickerItems } from "@/lib/content/client";
import { type ImageField, type ImageValue } from "@/lib/content/schema";
import FieldShell, { CONTROL, CONTROL_INVALID, Counter, LABEL } from "./FieldShell";
import UploadDialog from "../UploadDialog";
import { useForm } from "./context";

/**
 * A picture: one of those that came with the site or one from the media
 * library, and what it shows, for people who cannot see it. A decorative
 * picture has no description — a screen reader passes over it.
 *
 * `optional`: the picture may be left out (an article's cover). There is
 * then no "original" to go back to, only "Remove the picture", and no
 * description to write until a picture is chosen.
 */
export default function ImageControl({
  field,
  value,
  onChange,
  fieldKey,
  optional = false,
}: {
  field: ImageField;
  value: ImageValue;
  onChange: (next: ImageValue) => void;
  fieldKey: string;
  optional?: boolean;
}) {
  const { problem, touch, media, addMedia } = useForm();
  const id = useId();
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const issue = problem(fieldKey);
  const original = value.src === field.default.src && value.alt === field.default.alt;
  const none = optional && !value.src;

  return (
    <div role="group" aria-labelledby={`${id}-label`} className="rounded-[22px] border border-[var(--dark)]/10 bg-[var(--background)]/60 p-4">
      <p id={`${id}-label`} className={LABEL}>
        {field.label}
      </p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row">
        <span className="arch relative block aspect-[4/5] w-28 shrink-0 overflow-hidden rounded-b-2xl bg-[var(--sage-soft)]">
          {value.src ? (
            // eslint-disable-next-line @next/next/no-img-element -- a thumbnail of whatever is chosen, from either home of pictures
            <img src={value.src} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
          ) : none ? (
            <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[11.5px] leading-snug text-[var(--muted)]">
              No picture
            </span>
          ) : null}
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>
              Choose a picture
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setUploading(true)}>
              Upload a new one
            </Button>
            {optional ? (
              none ? null : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onChange({ src: "", alt: "" });
                    touch(fieldKey);
                  }}
                >
                  Remove the picture
                </Button>
              )
            ) : original ? null : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onChange({ ...field.default });
                  touch(fieldKey);
                }}
              >
                Back to the original
              </Button>
            )}
          </div>
          {none ? (
            <p className="text-[12.5px] leading-snug text-[var(--muted)]">
              None chosen, and none is needed. Choose one and you will be asked what it shows.
            </p>
          ) : field.decorative ? (
            <p className="text-[12.5px] leading-snug text-[var(--muted)]">
              A decorative picture: it needs no description, and screen readers pass over it.
              {field.help ? ` ${field.help}` : ""}
            </p>
          ) : (
            <FieldShell
              label="What it shows"
              htmlFor={id}
              help={field.help ?? "For people who cannot see it: who is in it and what they are doing."}
              helpId={`${id}-help`}
              problem={issue}
              problemId={`${id}-problem`}
              aside={<Counter value={value.alt} max={200} />}
            >
              <textarea
                id={id}
                rows={2}
                value={value.alt}
                aria-invalid={issue ? true : undefined}
                aria-describedby={issue ? `${id}-problem` : `${id}-help`}
                onChange={(e) => onChange({ ...value, alt: e.target.value })}
                onBlur={() => touch(fieldKey)}
                className={`${CONTROL} min-h-[72px] resize-y py-2.5 leading-relaxed [field-sizing:content] ${issue ? CONTROL_INVALID : ""}`}
              />
            </FieldShell>
          )}
          {field.decorative && issue ? (
            <p className="text-[12.5px] leading-snug text-[var(--danger)]">{issue}</p>
          ) : null}
        </div>
      </div>

      <MediaLibrary
        open={picking}
        onClose={() => setPicking(false)}
        title={`Choose: ${field.label}`}
        loading={media === null}
        items={pickerItems(media ?? [])}
        onPick={(item) => {
          // The library's description comes too, when it has one and this
          // picture needs one; the pictures that came with the site have none
          // of their own, so the words already here stay.
          onChange({ src: item.src, alt: !field.decorative && item.alt ? item.alt : value.alt });
          touch(fieldKey);
          setPicking(false);
        }}
      />
      <UploadDialog
        open={uploading}
        onClose={() => setUploading(false)}
        onUploaded={(added) => {
          addMedia(added);
          onChange({ src: added.url, alt: field.decorative ? value.alt : added.alt });
          touch(fieldKey);
        }}
      />
    </div>
  );
}
