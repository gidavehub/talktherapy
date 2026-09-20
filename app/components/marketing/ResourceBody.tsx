/**
 * Minimal renderer for resource copy.
 *
 * The seed content uses a deliberately tiny subset of Markdown — `## ` headings
 * and `**bold**` runs — so a fifteen-line parser beats adding a Markdown
 * dependency and a sanitiser to the bundle. If the admin CMS later accepts
 * richer input from untrusted authors, replace this with a real parser plus
 * sanitisation; do not extend it by pattern-matching more syntax.
 *
 * Note this never sets `dangerouslySetInnerHTML`, so nothing in the content
 * can inject markup.
 */

function InlineText({ text }: { text: string }) {
  // Split on **bold** runs, keeping the delimiters via a capturing group.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-medium text-[var(--foreground)]">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export default function ResourceBody({ body }: { body: string }) {
  const blocks = body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  return (
    <div className="max-w-[680px]">
      {blocks.map((block, i) => {
        if (block.startsWith("## ")) {
          return (
            <h2
              key={i}
              className="mt-12 first:mt-0 text-[22px] md:text-[26px] leading-tight tracking-tight font-medium"
            >
              {block.slice(3)}
            </h2>
          );
        }

        return (
          <p
            key={i}
            className="mt-5 first:mt-0 text-[15px] md:text-[16px] leading-relaxed text-[var(--muted)]"
          >
            <InlineText text={block} />
          </p>
        );
      })}
    </div>
  );
}
