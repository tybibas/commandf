import { Children } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

type CiteProps = {
  /** Opt-in: when provided, inline `[n]` markers that map to a source become
   *  clickable citation chips. Omit it and the markdown renders untouched. */
  onCiteClick?: (n: number) => void;
  /** The set of citation numbers that actually map to a source card. Only these
   *  become chips; any other bracketed number stays literal text. */
  citable?: Set<number>;
};

/** Split a text node on `[n]` markers, turning citable numbers into chips and
 *  leaving every other bracket (and all non-citable numbers) as plain text. */
function withCitations(node: ReactNode, cite: CiteProps): ReactNode {
  const { onCiteClick, citable } = cite;
  if (!onCiteClick) return node;

  if (typeof node === 'string') {
    const parts = node.split(/(\[\d+\])/g);
    if (parts.length === 1) return node;
    return parts.map((part, i) => {
      const m = part.match(/^\[(\d+)\]$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!citable || citable.has(n)) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => onCiteClick(n)}
              aria-label={`Jump to source ${n}`}
              className="align-super mx-px inline-flex items-baseline font-num text-micro font-medium leading-none text-brand-ink rounded-sm px-0.5 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand transition-colors"
              style={{ transitionDuration: 'var(--motion-duration-fast)' }}
            >
              {n}
            </button>
          );
        }
      }
      return part;
    });
  }

  if (Array.isArray(node)) return node.map((c, i) => <span key={i}>{withCitations(c, cite)}</span>);
  return node;
}

function makeComponents(cite: CiteProps): Components {
  return {
    ...components,
    p: ({ children }) => (
      <p className="text-body leading-relaxed text-text-primary mb-3.5 last:mb-0">
        {Children.map(children, (c) => withCitations(c, cite))}
      </p>
    ),
    li: ({ children }) => (
      <li className="text-body leading-relaxed text-text-primary pl-0.5">
        {Children.map(children, (c) => withCitations(c, cite))}
      </li>
    ),
  };
}

const components: Components = {
  h1: ({ children }) => (
    <h1
      className="font-serif text-2xl font-normal tracking-tight text-text-primary mt-6 mb-2.5 first:mt-0 leading-tight"
    >
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      style={{ fontFamily: "'Outfit', sans-serif" }}
      className="text-base font-semibold tracking-tight text-text-primary mt-5 mb-1.5 first:mt-0 leading-snug"
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="eyebrow text-text-muted mt-5 mb-1.5 first:mt-0">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-body leading-relaxed text-text-primary mb-3.5 last:mb-0">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-text-primary">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-text-secondary">{children}</em>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-5 mb-3.5 space-y-1.5 text-body text-text-primary marker:text-text-muted">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 mb-3.5 space-y-1.5 text-body text-text-primary marker:text-text-muted marker:font-num">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-body leading-relaxed text-text-primary pl-0.5">{children}</li>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-brand-ink hover:text-brand underline underline-offset-2 decoration-brand/40 hover:decoration-brand transition-colors"
      style={{ transitionDuration: 'var(--motion-duration-fast)' }}
    >
      {children}
    </a>
  ),
  hr: () => (
    <hr
      className="my-4"
      style={{ border: 'none', borderTop: '1px solid var(--color-hairline)' }}
    />
  ),
  code: ({ children, className }) => {
    // Block when it has a language class OR is multi-line (covers languageless
    // fences and indented blocks, which carry no className in react-markdown v10).
    const isBlock = Boolean(className) || String(children).includes('\n');
    if (isBlock) {
      // Inside <pre>: style-neutral (the <pre> paints the surface).
      return <code className="block font-mono text-caption leading-relaxed text-text-secondary">{children}</code>;
    }
    return (
      <code
        className="font-mono text-caption rounded-control px-1 py-0.5 bg-bg-tertiary text-text-secondary"
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre
      className="overflow-x-auto mb-3 p-3 text-caption leading-relaxed scrollbar-thin"
      style={{
        background: 'var(--color-bg-tertiary)',
        borderRadius: 'var(--radius-surface)',
        border: '1px solid var(--color-hairline)',
      }}
    >
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote
      className="pl-4 my-4 font-serif text-base italic text-text-secondary leading-relaxed"
      style={{ borderLeft: '2px solid var(--color-border)' }}
    >
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-3">
      <table
        className="w-full text-xs"
        style={{ borderCollapse: 'collapse' }}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr style={{ borderBottom: '1px solid var(--color-hairline)' }}>{children}</tr>
  ),
  th: ({ children }) => (
    <th
      className="text-left font-medium text-text-secondary px-2 py-1.5"
      style={{ borderBottom: '1px solid var(--color-border-light)' }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="text-text-primary px-2 py-1.5">
      {children}
    </td>
  ),
};

export default function CommandFMarkdown({
  content,
  onCiteClick,
  citable,
}: { content: string } & CiteProps) {
  // Citation interactivity is opt-in: without onCiteClick the base renderers are
  // used and every `[n]` stays literal, so other callers are unaffected.
  const activeComponents = onCiteClick ? makeComponents({ onCiteClick, citable }) : components;
  return (
    <div className="min-w-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={activeComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
