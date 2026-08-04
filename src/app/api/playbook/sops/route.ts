import { NextRequest, NextResponse } from 'next/server';
import { ensureSeeded, listSops, createSop } from '@/lib/playbook-store';
import { parseSopInput } from '@/lib/playbook-api';

export async function GET() {
  try {
    await ensureSeeded();
    const sops = await listSops();
    return NextResponse.json({ sops });
  } catch (error) {
    console.error('Failed to list SOPs:', error);
    return NextResponse.json({ error: 'Failed to list SOPs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = parseSopInput(body);
    if (typeof input === 'string') {
      return NextResponse.json({ error: input }, { status: 400 });
    }
    const sop = await createSop(input, {
      changedBy: typeof body.changedBy === 'string' ? body.changedBy : '',
      changeNote: typeof body.changeNote === 'string' ? body.changeNote : undefined,
      fromMistakeId: typeof body.fromMistakeId === 'string' ? body.fromMistakeId : undefined,
    });
    return NextResponse.json({ sop }, { status: 201 });
  } catch (error) {
    console.error('Failed to create SOP:', error);
    return NextResponse.json({ error: 'Failed to create SOP' }, { status: 500 });
  }
}
