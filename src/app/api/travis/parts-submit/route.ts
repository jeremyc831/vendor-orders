import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getQueue, clearQueue } from '@/lib/travis-queue';
import { sendTravisOrder } from '@/lib/travis-submit';
import { buildPartsOrderData } from '@/lib/travis-parts-order';

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
  if (!secret) {
    // Fail closed — never allow a cron route if no secret is configured.
    return false;
  }
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

async function alertJeremy(subject: string, body: string) {
  try {
    await transporter.sendMail({
      from: `"Hibernation Orders" <${process.env.GMAIL_USER}>`,
      to: 'jeremy@hibernation.com',
      cc: 'info@hibernation.com',
      subject,
      text: body,
    });
  } catch (err) {
    console.error('alertJeremy failed:', err);
  }
}

export async function GET(request: NextRequest) {
  if (!checkCronAuth(request)) return unauthorized();

  try {
    const queue = await getQueue();
    if (queue.lineItems.length === 0) {
      // Nothing to send — no alert needed.
      return NextResponse.json({ success: true, submitted: false, reason: 'queue empty' });
    }

    const data = buildPartsOrderData(queue);

    try {
      const { orderId } = await sendTravisOrder(data, { vendor: 'travis-parts' });
      await clearQueue();

      const itemCount = data.lineItems.reduce((sum, li) => sum + li.qty, 0);
      await alertJeremy(
        `Travis parts auto-submitted — PO ${data.dealerInfo.poNumber}`,
        `The weekly Travis parts order submitted successfully.\n\n` +
          `PO: ${data.dealerInfo.poNumber}\n` +
          `Items: ${itemCount}\n` +
          `Total: $${data.total.toFixed(2)}\n` +
          `Order ID: ${orderId}\n`
      );

      return NextResponse.json({ success: true, submitted: true, orderId });
    } catch (sendErr) {
      // Keep the queue intact so Jeremy can retry via the UI.
      console.error('parts-submit send failed (queue kept):', sendErr);
      const message = sendErr instanceof Error ? sendErr.message : String(sendErr);
      await alertJeremy(
        'Travis parts auto-submit FAILED — action required',
        `The Thursday Travis parts submit failed.\n\n` +
          `Error: ${message}\n\n` +
          `The queue was NOT cleared. Open /travis/parts and click "Submit now" once the issue is resolved.`
      );
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (err) {
    console.error('parts-submit unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
