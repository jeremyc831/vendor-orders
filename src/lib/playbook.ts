/**
 * Pure helpers for the Playbook module — no KV access here so everything is
 * trivially unit-testable and safe to import from client components.
 */
import type { Sop } from '@/types/playbook';

export const STALE_AFTER_DAYS = 90;

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sop';
}

/** Make `base` unique against `taken` by suffixing -2, -3, … */
export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Stale = not reviewed in the last 90 days. SOPs that have never been marked
 * reviewed fall back to their creation date.
 */
export function isStale(sop: Pick<Sop, 'lastReviewedAt' | 'createdAt'>, now = new Date()): boolean {
  const anchor = sop.lastReviewedAt ?? sop.createdAt;
  if (!anchor) return true;
  const ageMs = now.getTime() - new Date(anchor).getTime();
  return ageMs > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Turn a pasted Loom / YouTube share link into an embeddable iframe URL.
 * Anything unrecognized returns null and the UI falls back to a plain link.
 */
export function videoEmbedUrl(videoUrl: string | null | undefined): string | null {
  if (!videoUrl) return null;
  let url: URL;
  try {
    url = new URL(videoUrl.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');

  if (host === 'loom.com') {
    const m = url.pathname.match(/^\/(?:share|embed)\/([a-zA-Z0-9]+)/);
    return m ? `https://www.loom.com/embed/${m[1]}` : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (url.pathname === '/watch' && url.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${url.searchParams.get('v')}`;
    }
    const m = url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/);
    return m ? `https://www.youtube.com/embed/${m[1]}` : null;
  }
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  return null;
}

/**
 * Dropbox share links render the file browser, not the file. Rewriting to
 * raw=1 makes them usable directly in <img> tags — the crew stores job photos
 * in Dropbox, so this is the common case.
 */
export function directImageUrl(photoUrl: string): string {
  try {
    const url = new URL(photoUrl);
    if (/(^|\.)dropbox\.com$/.test(url.hostname)) {
      url.searchParams.delete('dl');
      url.searchParams.set('raw', '1');
      return url.toString();
    }
    return photoUrl;
  } catch {
    return photoUrl;
  }
}

/** "2026-08-04T…" or "2026-08-04" → "Aug 4, 2026" (UTC-stable for date-only strings). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (isNaN(d.getTime())) return '—';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  if (iso.length === 10) opts.timeZone = 'UTC';
  return d.toLocaleDateString('en-US', opts);
}

/** Today as YYYY-MM-DD in the local timezone (for date-input defaults). */
export function todayYMD(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse a human cost entry ("$1,200", "150") into a number, or null. */
export function parseCost(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export const VALID_CATEGORIES = ['field', 'shop', 'office', 'safety'] as const;
export const VALID_STATUSES = ['draft', 'active', 'archived'] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  field: 'Field',
  shop: 'Shop',
  office: 'Office',
  safety: 'Safety',
};

/** Tailwind classes for category chips — /10 bg + /30 border pattern used app-wide. */
export const CATEGORY_STYLES: Record<string, string> = {
  field: 'bg-green-500/10 border-green-500/30 text-green-300',
  shop: 'bg-orange-500/10 border-orange-500/30 text-orange-300',
  office: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
  safety: 'bg-red-500/10 border-red-500/30 text-red-300',
};
