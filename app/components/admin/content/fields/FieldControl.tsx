"use client";

import { Dropdown } from "@/components/ui/Dropdown";
import Switch from "@/components/ui/Switch";
import ColorPicker from "@/components/ui/ColorPicker";
import { ICON_OPTIONS, type Field, type Fields, type ImageValue, type LinkValue } from "@/lib/content/schema";
import { pathKey, type Path } from "@/lib/content/validate";
import { IconCalendar, IconChat, IconHeart, IconJournal, IconLock, IconMood, IconOrb, IconPeople, IconResources, IconShield } from "@/components/ui/icons";
import TextControl from "./TextControl";
import RichTextControl from "./RichTextControl";
import ImageControl from "./ImageControl";
import LinkControl from "./LinkControl";
import ListControl, { type RenderItem } from "./ListControl";
import { useForm } from "./context";

/**
 * The content form, drawn from the schema: each kind of field has its
 * control, and a group or list draws the controls of what is inside it. A
 * field added to a page in app/lib/content/schema.ts appears here with no
 * change to the editor.
 */

/** The icons the "ways in" cards can show, drawn in the menu as on the page. */
const ICONS: Record<string, React.ReactNode> = {
  orb: <IconOrb size={16} />,
  people: <IconPeople size={16} />,
  resources: <IconResources size={16} />,
  mood: <IconMood size={16} />,
  journal: <IconJournal size={16} />,
  chat: <IconChat size={16} />,
  calendar: <IconCalendar size={16} />,
  shield: <IconShield size={16} />,
  heart: <IconHeart size={16} />,
  lock: <IconLock size={16} />,
};

const ICON_VALUES = new Set<string>(ICON_OPTIONS.map((o) => o.value));

const str = (v: unknown) => (typeof v === "string" ? v : "");
const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function FieldControl({
  field,
  value,
  onChange,
  path,
  label,
  hideLabel = false,
}: {
  field: Field;
  value: unknown;
  onChange: (next: unknown) => void;
  path: Path;
  /** Overrides the field's own label — inside a list, "Line 2". */
  label?: string;
  hideLabel?: boolean;
}) {
  const { problem, touch } = useForm();
  const key = pathKey(path);

  switch (field.kind) {
    case "text":
    case "longText":
      return (
        <TextControl
          field={field}
          value={str(value)}
          onChange={onChange}
          fieldKey={key}
          label={label}
          hideLabel={hideLabel}
        />
      );
    case "richText":
      return <RichTextControl field={field} value={str(value)} onChange={onChange} fieldKey={key} />;
    case "image": {
      const image = rec(value);
      return (
        <ImageControl
          field={field}
          value={{ src: str(image.src), alt: str(image.alt) } satisfies ImageValue}
          onChange={onChange}
          fieldKey={key}
        />
      );
    }
    case "link": {
      const link = rec(value);
      return (
        <LinkControl
          field={field}
          value={{ label: str(link.label), href: str(link.href) } satisfies LinkValue}
          onChange={onChange}
          fieldKey={key}
        />
      );
    }
    case "select":
      return (
        <Dropdown
          label={label ?? field.label}
          hint={field.help}
          options={field.options.map((o) => ({
            value: o.value,
            label: o.label,
            icon: ICON_VALUES.has(o.value) ? ICONS[o.value] : undefined,
          }))}
          value={str(value) || null}
          error={problem(key)}
          onChange={(next) => {
            onChange(next);
            touch(key);
          }}
        />
      );
    case "boolean":
      return (
        <Switch
          label={label ?? field.label}
          description={field.help}
          checked={value === true}
          onChange={(next) => onChange(next)}
        />
      );
    case "color":
      return (
        <ColorPicker
          label={label ?? field.label}
          hint={problem(key) ?? field.help}
          value={str(value)}
          onChange={(next) => {
            onChange(next);
            touch(key);
          }}
        />
      );
    case "group":
      return <GroupFields fields={field.fields} value={value} onChange={onChange} path={path} title={label ?? field.label} hideTitle={hideLabel} help={field.help} />;
    case "list":
      return (
        <ListControl
          field={field}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          path={path}
          renderItem={renderItem}
        />
      );
  }
}

const renderItem: RenderItem = ({ field, value, onChange, path, label, hideLabel }) => (
  <FieldControl field={field} value={value} onChange={onChange} path={path} label={label} hideLabel={hideLabel} />
);

/**
 * The fields of a group, top to bottom. Short one-line fields that sit
 * side by side in the schema — the three choices of provider, say — share a
 * row on a wide screen.
 */
export function GroupFields({
  fields,
  value,
  onChange,
  path,
  title,
  hideTitle = true,
  help,
}: {
  fields: Fields;
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  path: Path;
  title?: string;
  /** A top-level group's card already carries its title. */
  hideTitle?: boolean;
  help?: string;
}) {
  const current = rec(value);
  const entries = Object.entries(fields);
  const body = (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      {entries.map(([name, child]) => {
        // Short words share a row; anything bigger takes the whole width.
        const half = child.kind === "text" && child.max <= 40;
        return (
          <div key={name} className={half ? "min-w-0" : "min-w-0 md:col-span-2"}>
            <FieldControl
              field={child}
              value={current[name]}
              onChange={(next) => onChange({ ...current, [name]: next })}
              path={[...path, name]}
            />
          </div>
        );
      })}
    </div>
  );

  if (hideTitle || !title) return body;
  return (
    <fieldset className="min-w-0 rounded-[22px] border border-[var(--dark)]/10 p-4 md:p-5">
      <legend className="px-2 font-display text-[16px] font-medium">{title}</legend>
      {help ? <p className="-mt-1 mb-4 text-[12px] leading-snug text-[var(--muted)]">{help}</p> : null}
      {body}
    </fieldset>
  );
}
