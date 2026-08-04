import { NextRequest, NextResponse } from 'next/server';
import { getMistake, setMistakeStatus, attachMistake } from '@/lib/playbook-store';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const mistake = await getMistake(id);
    if (!mistake) {
      return NextResponse.json({ error: 'Mistake not found' }, { status: 404 });
    }
    return NextResponse.json({ mistake });
  } catch (error) {
    console.error('Failed to fetch mistake:', error);
    return NextResponse.json({ error: 'Failed to fetch mistake' }, { status: 500 });
  }
}

/**
 * Actions:
 *   { action: 'attach', sopId, addAsStep?, changedBy? }  link to an existing SOP
 *   { action: 'dismiss' }                                 not worth an SOP
 *   { action: 'reopen' }                                  back to open (unlinks)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();

    if (body.action === 'attach') {
      if (typeof body.sopId !== 'string' || !body.sopId) {
        return NextResponse.json({ error: 'sopId is required' }, { status: 400 });
      }
      const mistake = await attachMistake(id, body.sopId, {
        addAsStep: !!body.addAsStep,
        changedBy: typeof body.changedBy === 'string' ? body.changedBy : undefined,
      });
      if (!mistake) {
        return NextResponse.json({ error: 'Mistake or SOP not found' }, { status: 404 });
      }
      return NextResponse.json({ mistake });
    }

    if (body.action === 'dismiss' || body.action === 'reopen') {
      const mistake = await setMistakeStatus(id, body.action === 'dismiss' ? 'dismissed' : 'open');
      if (!mistake) {
        return NextResponse.json({ error: 'Mistake not found' }, { status: 404 });
      }
      return NextResponse.json({ mistake });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Failed to patch mistake:', error);
    return NextResponse.json({ error: 'Failed to patch mistake' }, { status: 500 });
  }
}
