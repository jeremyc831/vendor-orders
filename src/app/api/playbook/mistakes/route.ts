import { NextRequest, NextResponse } from 'next/server';
import { ensureSeeded, listMistakes, addMistake } from '@/lib/playbook-store';
import { todayYMD } from '@/lib/playbook';

export async function GET() {
  try {
    await ensureSeeded();
    const mistakes = await listMistakes();
    return NextResponse.json({ mistakes });
  } catch (error) {
    console.error('Failed to list mistakes:', error);
    return NextResponse.json({ error: 'Failed to list mistakes' }, { status: 500 });
  }
}

/** The 30-second quick add: description required, everything else optional. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }
    const happenedOn =
      typeof body.happenedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.happenedOn)
        ? body.happenedOn
        : todayYMD();
    const estCostNum = typeof body.estCost === 'number' && Number.isFinite(body.estCost) ? body.estCost : null;

    const mistake = await addMistake({
      happenedOn,
      description,
      jobRef: typeof body.jobRef === 'string' ? body.jobRef : '',
      estCost: estCostNum,
      reportedBy: typeof body.reportedBy === 'string' ? body.reportedBy : '',
    });
    return NextResponse.json({ mistake }, { status: 201 });
  } catch (error) {
    console.error('Failed to add mistake:', error);
    return NextResponse.json({ error: 'Failed to add mistake' }, { status: 500 });
  }
}
