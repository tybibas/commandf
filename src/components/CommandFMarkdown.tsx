import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const components: Components = {
  h1: ({ children }) => (
    <h1
      style={{ fontFamily: "'Outfit', sans-serif" }}
      className="text-xl font-bold tracking-tight text-text-primary mt-5 mb-2 leading-tight"
    >
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      style={{ fontFamily: "'Outfit', sans-serif" }}
      className="text-base font-semibold tracking-tight text-text-primary mt-4 mb-1.5 leading-snug"
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="eyebrow text-text-muted mt-4 mb-1.5">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-body leading-relaxed text-text-primary mb-3 last:mb-0">
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
    <ul className="list-disc pl-5 mb-3 space-y-1 text-body text-text-primary">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 mb-3 space-y-1 text-body text-text-primary">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-body leading-relaxed text-text-primary">{children}</li>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-text-primary underline underline-offset-2 decoration-text-muted hover:decoration-text-primary transition-colors"
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
      className="pl-3 my-3 italic text-body text-text-secondary"
      style={{ borderLeft: '2px solid var(--color-hairline)' }}
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

export default function CommandFMarkdown({ content }: { content: string }) {
  return (
    <div className="min-w-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
