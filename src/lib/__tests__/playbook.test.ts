import { describe, it, expect } from 'vitest';
import {
  slugify,
  uniqueSlug,
  isStale,
  videoEmbedUrl,
  directImageUrl,
  parseCost,
  todayYMD,
  formatDate,
} from '../playbook';

describe('slugify', () => {
  it('kebab-cases titles', () => {
    expect(slugify('Close out a job')).toBe('close-out-a-job');
  });

  it('strips punctuation and collapses runs', () => {
    expect(slugify('TEMPLATE — copy me!')).toBe('template-copy-me');
    expect(slugify('  Winterize:  spa & lines  ')).toBe('winterize-spa-lines');
  });

  it('never returns an empty slug', () => {
    expect(slugify('—')).toBe('sop');
    expect(slugify('')).toBe('sop');
  });
});

describe('uniqueSlug', () => {
  it('returns the base when free', () => {
    expect(uniqueSlug('close-out-a-job', new Set())).toBe('close-out-a-job');
  });

  it('suffixes -2, -3 on collision', () => {
    const taken = new Set(['a', 'a-2']);
    expect(uniqueSlug('a', taken)).toBe('a-3');
  });
});

describe('isStale', () => {
  const now = new Date('2026-08-04T12:00:00Z');

  it('fresh review is not stale', () => {
    expect(isStale({ lastReviewedAt: '2026-07-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' }, now)).toBe(false);
  });

  it('91 days old is stale', () => {
    expect(isStale({ lastReviewedAt: '2026-05-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' }, now)).toBe(true);
  });

  it('falls back to createdAt when never reviewed', () => {
    expect(isStale({ lastReviewedAt: null, createdAt: '2026-01-01T00:00:00Z' }, now)).toBe(true);
    expect(isStale({ lastReviewedAt: null, createdAt: '2026-08-01T00:00:00Z' }, now)).toBe(false);
  });
});

describe('videoEmbedUrl', () => {
  it('embeds Loom share links', () => {
    expect(videoEmbedUrl('https://www.loom.com/share/abc123DEF')).toBe('https://www.loom.com/embed/abc123DEF');
  });

  it('embeds YouTube watch links', () => {
    expect(videoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ'
    );
  });

  it('embeds youtu.be short links', () => {
    expect(videoEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=10')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('embeds YouTube shorts links', () => {
    expect(videoEmbedUrl('https://youtube.com/shorts/xyz_123-A')).toBe('https://www.youtube.com/embed/xyz_123-A');
  });

  it('returns null for unknown hosts and garbage', () => {
    expect(videoEmbedUrl('https://vimeo.com/12345')).toBeNull();
    expect(videoEmbedUrl('not a url')).toBeNull();
    expect(videoEmbedUrl(null)).toBeNull();
    expect(videoEmbedUrl('')).toBeNull();
  });

  it('does not treat lookalike hosts as YouTube', () => {
    expect(videoEmbedUrl('https://notyoutube.com/watch?v=abc')).toBeNull();
  });
});

describe('directImageUrl', () => {
  it('rewrites Dropbox share links to raw=1', () => {
    const out = directImageUrl('https://www.dropbox.com/s/abc/photo.jpg?dl=0');
    expect(out).toContain('raw=1');
    expect(out).not.toContain('dl=0');
  });

  it('leaves other URLs alone', () => {
    expect(directImageUrl('https://example.com/p.jpg')).toBe('https://example.com/p.jpg');
  });

  it('leaves non-URLs alone', () => {
    expect(directImageUrl('not a url')).toBe('not a url');
  });
});

describe('parseCost', () => {
  it('parses money-ish strings', () => {
    expect(parseCost('$1,200')).toBe(1200);
    expect(parseCost('150')).toBe(150);
    expect(parseCost(' 99.50 ')).toBe(99.5);
  });

  it('returns null for empty or junk', () => {
    expect(parseCost('')).toBeNull();
    expect(parseCost('abc')).toBeNull();
    expect(parseCost('-5')).toBeNull();
  });
});

describe('dates', () => {
  it('todayYMD formats local date', () => {
    expect(todayYMD(new Date(2026, 7, 4))).toBe('2026-08-04');
  });

  it('formatDate handles date-only strings without timezone drift', () => {
    expect(formatDate('2026-08-04')).toBe('Aug 4, 2026');
  });

  it('formatDate handles empty', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('garbage')).toBe('—');
  });
});
