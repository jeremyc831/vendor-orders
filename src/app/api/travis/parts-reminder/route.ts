import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getQueue } from '@/lib/travis-queue';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function checkCronAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function buildReminderHtml(
  lineItems: Array<{ sku: string; qty: number; priceAtAdd: number; nameAtAdd: string }>,
  subtotal: number,
  appUrl: string
): string {
  const rows = lineItems.map(li => `
    <tr>
      <td style="padding:4px 8px;border:1px solid #ddd;font-family:monospace;font-size:12px">${li.sku}</td>
      <td style="padding:4px 8px;border:1px solid #ddd">${li.nameAtAdd}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:center">${li.qty}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:right">${formatCurrency(li.priceAtAdd * li.qty)}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#333">
      <h2 style="color:#1565a6;margin-bottom:4px">Travis parts order submitting in ~1 hour</h2>
      <p style="color:#666;margin-top:0">Click <a href="${appUrl}/travis/parts">Travis Parts</a> to edit or cancel before the auto-submit fires.</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:left">SKU</th>
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:left">Description</th>
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:center">Qty</th>
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:right">Line</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:#f5f5f5">
            <td colspan="3" style="padding:6px 8px;text-align:right;border:1px solid #ddd;font-weight:bold">Subtotal</td>
            <td style="padding:6px 8px;text-align:right;border:1px solid #ddd;font-weight:bold">${formatCurrency(subtotal)}</td>
          </tr>
        </tfoot>
      </table>

      <p style="color:#999;font-size:12px;margin-top:24px">Auto-reminder from Hibernation Stoves &amp; Spas Order System</p>
    </div>
  `;
}

export async function GET(request: NextRequest) {
  if (!checkCronAuth(request)) return unauthorized();

  try {
    const queue = await getQueue();
    if (queue.lineItems.length === 0) {
      return NextResponse.json({ success: true, sent: false, reason: 'queue empty' });
    }

    const subtotal = queue.lineItems.reduce((sum, li) => sum + li.priceAtAdd * li.qty, 0);
    const itemCount = queue.lineItems.reduce((sum, li) => sum + li.qty, 0);
    const appUrl = process.env.APP_URL ?? 'https://orders.hibernation.com';

    await transporter.sendMail({
      from: `"Hibernation Orders" <${process.env.GMAIL_USER}>`,
      to: 'jeremy@hibernation.com',
      cc: 'info@hibernation.com',
      subject: `Travis parts order submitting in 1 hour — ${itemCount} item${itemCount !== 1 ? 's' : ''}, ${formatCurrency(subtotal)}`,
      html: buildReminderHtml(queue.lineItems, subtotal, appUrl),
    });

    return NextResponse.json({ success: true, sent: true });
  } catch (err) {
    console.error('parts-reminder failed:', err);
    const message = err instanceof Error ? err.message : 'Reminder failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
