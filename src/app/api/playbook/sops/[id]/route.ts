import { NextRequest, NextResponse } from 'next/server';
import {
  getSop,
  updateSop,
  markReviewed,
  restoreRevision,
  listRevisions,
  mistakesForSop,
} from '@/lib/playbook-store';
import { parseSopInput } from '@/lib/playbook-api';

/**
 * GET one SOP by id or slug, with its linked mistakes and revision history
 * metadata (snapshots stay server-side — restore happens by version number,
 * which keeps this payload phone-friendly).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const sop = await getSop(id);
    if (!sop) {
      return NextResponse.json({ error: 'SOP not found' }, { status: 404 });
    }
    const [mistakes, revisions] = await Promise.all([mistakesForSop(sop.id), listRevisions(sop.id)]);
    return NextResponse.json({
      sop,
      mistakes,
      revisions: revisions
        .map(({ version, changedBy, changeNote, createdAt }) => ({ version, changedBy, changeNote, createdAt }))
        .reverse(),
    });
  } catch (error) {
    console.error('Failed to fetch SOP:', error);
    return NextResponse.json({ error: 'Failed to fetch SOP' }, { status: 500 });
  }
}

/** Save an edit — bumps version and writes a revision. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const input = parseSopInput(body);
    if (typeof input === 'string') {
      return NextResponse.json({ error: input }, { status: 400 });
    }
    const sop = await updateSop(id, input, {
      changedBy: typeof body.changedBy === 'string' ? body.changedBy : '',
      changeNote: typeof body.changeNote === 'string' ? body.changeNote : '',
    });
    if (!sop) {
      return NextResponse.json({ error: 'SOP not found' }, { status: 404 });
    }
    return NextResponse.json({ sop });
  } catch (error) {
    console.error('Failed to update SOP:', error);
    return NextResponse.json({ error: 'Failed to update SOP' }, { status: 500 });
  }
}

/** Small non-edit actions: { action: 'mark-reviewed' } or { action: 'restore', version, changedBy }. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();

    if (body.action === 'mark-reviewed') {
      const sop = await markReviewed(id);
      if (!sop) return NextResponse.json({ error: 'SOP not found' }, { status: 404 });
      return NextResponse.json({ sop });
    }

    if (body.action === 'restore') {
      const version = Number(body.version);
      if (!Number.isInteger(version) || version < 1) {
        return NextResponse.json({ error: 'Invalid version' }, { status: 400 });
      }
      const sop = await restoreRevision(id, version, typeof body.changedBy === 'string' ? body.changedBy : '');
      if (!sop) return NextResponse.json({ error: 'SOP or version not found' }, { status: 404 });
      return NextResponse.json({ sop });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Failed to patch SOP:', error);
    return NextResponse.json({ error: 'Failed to patch SOP' }, { status: 500 });
  }
}
