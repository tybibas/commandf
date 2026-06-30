// Command F — pure presentation helpers (no I/O, easy to unit-test).

export function clientLabel(slug: string): string {
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso).getTime();
  if (isNaN(d)) return '—';
  const mins = Math.floor((Date.now() - d) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export type ParsedDoc = {
  title: string;        // human deliverable name (always present)
  client?: string;      // parsed engagement / client, when derivable
  type?: string;        // deliverable type (CDD, POV, Proposal…), when derivable
  date?: string;        // ISO-ish "YYYY-MM-DD", when derivable
  version?: string;     // "v3", when derivable
  ext?: string;         // file extension, upper-cased (PPTX / PDF / DOCX)
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Parse a corpus filename into a legible deliverable object.
 *
 * Primary convention: `YYYY MM DD <Client> <Type> v<Version>.<ext>`
 *   e.g. "2024 04 17 Meridian Commercial-Due-Diligence v3.pptx"
 * Also tolerates underscores/hyphens and date-less names; always degrades to a
 * cleaned title rather than inventing fields. Nothing here is fabricated — every
 * returned field is read directly from the filename.
 */
export function parseDeliverableName(fileName: string): ParsedDoc {
  if (!fileName) return { title: 'Untitled' };

  const extMatch = fileName.match(/\.([a-z0-9]{2,5})$/i);
  const ext = extMatch ? extMatch[1].toUpperCase() : undefined;
  let stem = extMatch ? fileName.slice(0, -extMatch[0].length) : fileName;

  // Normalise separators to spaces for tokenising (keep original for title fallback).
  const normalised = stem.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Leading date: "YYYY MM DD" or "YYYY-MM-DD".
  const dateRe = /^(\d{4})[\s-](\d{1,2})[\s-](\d{1,2})\s+(.*)$/;
  const m = normalised.match(dateRe);

  let date: string | undefined;
  let rest = normalised;
  if (m) {
    const [, y, mo, d, tail] = m;
    const mi = Math.max(1, Math.min(12, parseInt(mo, 10))) - 1;
    date = `${MONTHS[mi]} ${parseInt(d, 10)}, ${y}`;
    rest = tail;
  }

  // Trailing version: "v3" / "V12".
  let version: string | undefined;
  const vMatch = rest.match(/\s[vV](\d+)\s*$/);
  if (vMatch) {
    version = `v${vMatch[1]}`;
    rest = rest.slice(0, vMatch.index).trim();
  }

  // Known deliverable types (the trailing descriptor in the convention).
  const TYPE_RE = /\b(commercial[\s-]?due[\s-]?diligence|due[\s-]?diligence|cdd|engagement[\s-]?recap|recap|proposal|pov[\s-]?memo|pov|point[\s-]?of[\s-]?view|operating[\s-]?model|board[\s-]?deck|memo|sow|qbr)\b/i;
  let type: string | undefined;
  let client: string | undefined;
  if (m && rest) {
    const tMatch = rest.match(TYPE_RE);
    if (tMatch && tMatch.index !== undefined) {
      type = prettyType(tMatch[0]);
      client = rest.slice(0, tMatch.index).trim() || undefined;
    } else {
      // No recognised type token — treat the whole tail as the client/subject.
      client = rest.trim() || undefined;
    }
  }

  // Title: prefer the original cleaned stem (underscores/dashes → spaces).
  const title = stem
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled';

  return { title, client, type, date, version, ext };
}

function prettyType(raw: string): string {
  const t = raw.toLowerCase().replace(/[\s-]+/g, ' ').trim();
  const map: Record<string, string> = {
    'cdd': 'Commercial DD',
    'commercial due diligence': 'Commercial DD',
    'due diligence': 'Due Diligence',
    'engagement recap': 'Engagement Recap',
    'recap': 'Recap',
    'proposal': 'Proposal',
    'pov memo': 'POV Memo',
    'pov': 'POV',
    'point of view': 'POV',
    'operating model': 'Operating Model',
    'board deck': 'Board Deck',
    'memo': 'Memo',
    'sow': 'SOW',
    'qbr': 'QBR',
  };
  return map[t] ?? t.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A confidence band label for a similarity score (0–1), or null if absent. */
export function confidenceBand(similarity?: number): 'High' | 'Medium' | 'Low' | null {
  if (typeof similarity !== 'number' || isNaN(similarity)) return null;
  if (similarity >= 0.7) return 'High';
  if (similarity >= 0.45) return 'Medium';
  return 'Low';
}
