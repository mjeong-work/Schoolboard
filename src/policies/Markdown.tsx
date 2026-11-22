import { Fragment, type ReactNode } from 'react';

// A tiny renderer for the policy documents: headings, paragraphs, lists,
// tables, **bold** and [links](url). Builds React elements (no innerHTML),
// so nothing in the source text can inject markup.

const INLINE_RE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\)|`[^`]+`)/g;

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE_RE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i} className="font-semibold text-[#111]">{renderInline(part.slice(2, -2))}</strong>;
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      const external = /^https?:\/\//.test(href);
      return (
        <a
          key={i}
          href={href}
          className="text-[#0b5fff] hover:underline"
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {label}
        </a>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={i} className="rounded bg-[#f3f3f5] px-1 text-[0.9em]">{part.slice(1, -1)}</code>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = blocks.length;

    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const content = renderInline(heading[2]);
      if (level === 1) {
        blocks.push(<h1 key={key} className="text-2xl sm:text-3xl font-semibold text-[#111] mb-4">{content}</h1>);
      } else if (level === 2) {
        blocks.push(<h2 key={key} className="text-xl font-semibold text-[#111] mt-10 mb-3">{content}</h2>);
      } else {
        blocks.push(<h3 key={key} className="text-base font-semibold text-[#111] mt-6 mb-2">{content}</h3>);
      }
      i++;
      continue;
    }

    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        if (!/^\|?[\s:|-]+\|?$/.test(lines[i].trim())) rows.push(splitRow(lines[i]));
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={key} className="my-4 overflow-x-auto rounded-lg border border-[#e5e5e5]">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#f7f7f8]">
              <tr>
                {head.map((cell, c) => (
                  <th key={c} className="px-3 py-2 font-semibold text-[#111] align-top">{renderInline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r} className="border-t border-[#e5e5e5]">
                  {row.map((cell, c) => (
                    <td key={c} className="px-3 py-2 text-[#333] align-top">{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const listMatch = /^(-|\d+\.)\s+/.exec(line);
    if (listMatch) {
      const ordered = listMatch[1] !== '-';
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\d+\.\s+/ : /^-\s+/).test(lines[i])) {
        items.push(lines[i].replace(/^(-|\d+\.)\s+/, ''));
        i++;
      }
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag
          key={key}
          className={`my-3 space-y-2 pl-6 text-[#333] leading-relaxed ${ordered ? 'list-decimal' : 'list-disc'}`}
        >
          {items.map((item, n) => <li key={n}>{renderInline(item)}</li>)}
        </ListTag>
      );
      continue;
    }

    // Paragraph: consecutive non-block lines, keeping their line breaks.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3})\s|^\s*\||^(-|\d+\.)\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key} className="my-3 text-[#333] leading-relaxed">
        {para.map((l, n) => (
          <Fragment key={n}>
            {n > 0 && <br />}
            {renderInline(l)}
          </Fragment>
        ))}
      </p>
    );
  }

  return <>{blocks}</>;
}
