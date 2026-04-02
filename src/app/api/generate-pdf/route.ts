import { NextRequest, NextResponse } from 'next/server';
import { generatePdf, OrderData } from '@/lib/pdf';

export async function POST(request: NextRequest) {
  try {
    const data: OrderData = await request.json();
    const pdfBuffer = generatePdf(data);

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${data.dealerInfo.poNumber}_${data.manufacturer}_order.pdf"`,
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
