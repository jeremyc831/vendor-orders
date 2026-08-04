import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SopInput } from '@/types/playbook';

const memStore: Record<string, unknown> = {};

vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(async (key: string) => memStore[key] ?? null),
    set: vi.fn(async (key: string, val: unknown, opts?: { nx?: boolean }) => {
      if (opts?.nx && key in memStore) return null;
      memStore[key] = val;
      return 'OK';
    }),
    mget: vi.fn(async (...keys: string[]) => keys.map(k => memStore[k] ?? null)),
    del: vi.fn(async (key: string) => {
      delete memStore[key];
    }),
  },
}));

import {
  ensureSeeded,
  listSops,
  getSop,
  createSop,
  updateSop,
  markReviewed,
  restoreRevision,
  listRevisions,
  listMistakes,
  addMistake,
  setMistakeStatus,
  attachMistake,
  mistakesForSop,
} from '../playbook-store';

beforeEach(() => {
  for (const k of Object.keys(memStore)) delete memStore[k];
  process.env.KV_REST_API_URL = 'http://fake';
  process.env.KV_REST_API_TOKEN = 'fake';
});

const input = (over: Partial<SopInput> = {}): SopInput => ({
  title: 'Winterize a spa',
  purpose: 'Frozen lines are a $2k callback.',
  trigger: 'Any spa left unpowered below 40°F.',
  category: 'field',
  owner: 'Jeremy',
  steps: [
    { text: 'Drain the shell', required: true },
    { text: 'Blow out the lines', required: true, photoPrompt: 'Lines with fittings open' },
  ],
  videoUrl: null,
  photoUrls: [],
  bodyMd: '',
  status: 'active',
  ...over,
});

describe('ensureSeeded', () => {
  it('seeds the template, example SOP, and starter mistakes once', async () => {
    await ensureSeeded();
    const sops = await listSops();
    expect(sops).toHaveLength(2);
    expect(sops.map(s => s.slug).sort()).toEqual(['close-out-a-job', 'template-copy-me']);

    const closeout = sops.find(s => s.slug === 'close-out-a-job')!;
    expect(closeout.status).toBe('active');
    expect(closeout.category).toBe('field');
    expect(closeout.steps).toHaveLength(8);

    const mistakes = await listMistakes();
    expect(mistakes).toHaveLength(3);
    expect(mistakes.every(m => m.sopId === closeout.id && m.status === 'converted')).toBe(true);

    expect(await listRevisions(closeout.id)).toHaveLength(1);
  });

  it('is idempotent — second call adds nothing', async () => {
    await ensureSeeded();
    await ensureSeeded();
    expect(await listSops()).toHaveLength(2);
    expect(await listMistakes()).toHaveLength(3);
  });
});

describe('createSop', () => {
  it('creates v1 with a slug, revision, and review date', async () => {
    const sop = await createSop(input(), { changedBy: 'Jeremy' });
    expect(sop.version).toBe(1);
    expect(sop.slug).toBe('winterize-a-spa');
    expect(sop.lastReviewedAt).toBeTruthy();

    const revs = await listRevisions(sop.id);
    expect(revs).toHaveLength(1);
    expect(revs[0]).toMatchObject({ version: 1, changedBy: 'Jeremy', changeNote: 'Created' });

    expect(await getSop(sop.id)).toMatchObject({ title: 'Winterize a spa' });
    expect(await getSop('winterize-a-spa')).toMatchObject({ id: sop.id });
  });

  it('de-dupes slugs', async () => {
    await createSop(input(), { changedBy: 'J' });
    const second = await createSop(input(), { changedBy: 'J' });
    expect(second.slug).toBe('winterize-a-spa-2');
  });

  it('drops empty steps and trims fields', async () => {
    const sop = await createSop(
      input({ title: '  Winterize a spa  ', steps: [{ text: '  ok  ', required: false }, { text: '   ', required: true }] }),
      { changedBy: 'J' }
    );
    expect(sop.title).toBe('Winterize a spa');
    expect(sop.steps).toEqual([{ text: 'ok', required: false }]);
  });

  it('links the source mistake when created via Convert', async () => {
    const mistake = await addMistake({ happenedOn: '2026-08-01', description: 'Lines froze' });
    const sop = await createSop(input(), { changedBy: 'J', fromMistakeId: mistake.id });

    const [stored] = await listMistakes();
    expect(stored).toMatchObject({ id: mistake.id, status: 'converted', sopId: sop.id });
    expect(await mistakesForSop(sop.id)).toHaveLength(1);
  });
});

describe('updateSop', () => {
  it('bumps version, keeps slug on rename, writes a revision', async () => {
    const sop = await createSop(input(), { changedBy: 'J' });
    const updated = await updateSop(sop.id, input({ title: 'Winterize any spa' }), {
      changedBy: 'Travis',
      changeNote: 'Broadened title',
    });

    expect(updated).toMatchObject({ version: 2, title: 'Winterize any spa', slug: 'winterize-a-spa' });

    const revs = await listRevisions(sop.id);
    expect(revs).toHaveLength(2);
    expect(revs[1]).toMatchObject({ version: 2, changedBy: 'Travis', changeNote: 'Broadened title' });
    expect(revs[1].snapshot.title).toBe('Winterize any spa');
  });

  it('returns null for unknown ids', async () => {
    expect(await updateSop('nope', input(), { changedBy: 'J', changeNote: '' })).toBeNull();
  });
});

describe('markReviewed', () => {
  it('bumps the review date without a version or revision', async () => {
    const sop = await createSop(input(), { changedBy: 'J' });
    const reviewed = await markReviewed(sop.id);
    expect(reviewed!.version).toBe(1);
    expect(await listRevisions(sop.id)).toHaveLength(1);
  });
});

describe('restoreRevision', () => {
  it('restores an old snapshot as a new version', async () => {
    const sop = await createSop(input(), { changedBy: 'J' });
    await updateSop(sop.id, input({ title: 'Broken title' }), { changedBy: 'J', changeNote: 'oops' });

    const restored = await restoreRevision(sop.id, 1, 'Jeremy');
    expect(restored).toMatchObject({ version: 3, title: 'Winterize a spa' });

    const revs = await listRevisions(sop.id);
    expect(revs).toHaveLength(3);
    expect(revs[2].changeNote).toBe('Restored v1');
  });

  it('returns null for a missing version', async () => {
    const sop = await createSop(input(), { changedBy: 'J' });
    expect(await restoreRevision(sop.id, 99, 'J')).toBeNull();
  });
});

describe('mistakes', () => {
  it('quick-add defaults to open with normalized fields', async () => {
    const m = await addMistake({ happenedOn: '2026-08-04', description: '  Left the gate open  ', jobRef: ' 1042 ' });
    expect(m).toMatchObject({
      status: 'open',
      sopId: null,
      description: 'Left the gate open',
      jobRef: '1042',
      estCost: null,
      reportedBy: 'Unknown',
    });
    expect((await listMistakes())[0].id).toBe(m.id);
  });

  it('dismiss and reopen (reopen unlinks the SOP)', async () => {
    const sop = await createSop(input(), { changedBy: 'J' });
    const m = await addMistake({ happenedOn: '2026-08-04', description: 'x' });
    await attachMistake(m.id, sop.id);

    await setMistakeStatus(m.id, 'dismissed');
    expect((await listMistakes())[0].status).toBe('dismissed');

    await setMistakeStatus(m.id, 'open');
    expect((await listMistakes())[0]).toMatchObject({ status: 'open', sopId: null });
  });

  it('attachMistake links and shows under the SOP', async () => {
    const sop = await createSop(input(), { changedBy: 'J' });
    const m = await addMistake({ happenedOn: '2026-08-04', description: 'Forgot to blow out lines', estCost: 2000 });

    const attached = await attachMistake(m.id, sop.id);
    expect(attached).toMatchObject({ status: 'converted', sopId: sop.id });
    expect(await mistakesForSop(sop.id)).toHaveLength(1);

    // No content change → no version bump.
    expect((await getSop(sop.id))!.version).toBe(1);
  });

  it('attachMistake with addAsStep appends a step through a real revision', async () => {
    const sop = await createSop(input(), { changedBy: 'J' });
    const m = await addMistake({ happenedOn: '2026-08-04', description: 'Forgot to blow out lines' });

    await attachMistake(m.id, sop.id, { addAsStep: true, changedBy: 'Travis' });

    const after = (await getSop(sop.id))!;
    expect(after.version).toBe(2);
    expect(after.steps.at(-1)).toEqual({ text: 'Forgot to blow out lines', required: false });

    const revs = await listRevisions(sop.id);
    expect(revs.at(-1)!.changeNote).toContain('mistake log');
  });

  it('attachMistake returns null for unknown SOP', async () => {
    const m = await addMistake({ happenedOn: '2026-08-04', description: 'x' });
    expect(await attachMistake(m.id, 'nope')).toBeNull();
  });

  it('mistakesForSop hides dismissed and sorts newest first', async () => {
    const sop = await createSop(input(), { changedBy: 'J' });
    const a = await addMistake({ happenedOn: '2026-08-01', description: 'older' });
    const b = await addMistake({ happenedOn: '2026-08-03', description: 'newer' });
    const c = await addMistake({ happenedOn: '2026-08-02', description: 'gone' });
    await attachMistake(a.id, sop.id);
    await attachMistake(b.id, sop.id);
    await attachMistake(c.id, sop.id);
    await setMistakeStatus(c.id, 'dismissed');

    const list = await mistakesForSop(sop.id);
    expect(list.map(m => m.description)).toEqual(['newer', 'older']);
  });
});
