import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getSop } from '@/lib/playbook-store';

/**
 * SVG QR code for an SOP's page, used by the printable QR card. Encodes the
 * production URL (APP_URL, per the existing reminder-email deep-link config),
 * falling back to the request origin in local dev.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const sop = await getSop(slug);
    if (!sop) {
      return NextResponse.json({ error: 'SOP not found' }, { status: 404 });
    }
    const base = (process.env.APP_URL || request.nextUrl.origin).replace(/\/+$/, '');
    const target = `${base}/playbook/${sop.slug}`;

    const svg = await QRCode.toString(target, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });

    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    return NextResponse.json({ error: 'Failed to generate QR code' }, { status: 500 });
  }
}
