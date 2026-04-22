/**
 * Shared submit pipeline used by every Travis order path:
 *   - POST /api/travis/send-stoves-order
 *   - POST /api/travis/parts-submit-now
 *   - GET  /api/travis/parts-submit   (cron)
 *
 * Responsibilities: generate PDF, send email (To: saleswest@, CC: info+jeremy,
 * From: GMAIL_USER), save StoredOrder to history. Returns the orderId for the
 * caller to surface.
 */
import nodemailer from 'nodemailer';
import { generateTravisPdf } from './travis-pdf';
import { saveOrder } from './kv';
import type { StoredOrder } from '@/types/order-history';
import type { TravisOrderData } from '@/types/travis-order';

export type TravisVendor = 'travis-stoves' | 'travis-parts';

export interface SubmitOptions {
  vendor: TravisVendor;
}

export interface SubmitResult {
  orderId: string;
}

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function flowLabel(flow: TravisOrderData['flow']): string {
  return flow === 'stoves' ? 'Stoves / Fireplaces' : 'Parts';
}

function flowShortLabel(flow: TravisOrderData['flow']): string {
  return flow === 'stoves' ? 'Stoves' : 'Parts';
}

export function buildTravisOrderEmailHtml(data: TravisOrderData): string {
  const itemRows = data.lineItems.map(item => `
    <tr>
      <td style="padding:4px 8px;border:1px solid #ddd;font-family:monospace;font-size:12px">${item.sku}</td>
      <td style="padding:4px 8px;border:1px solid #ddd">${item.name}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:center">${item.qty}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:right">$${item.unitPrice.toFixed(2)}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:right">$${item.lineTotal.toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#333">
      <h2 style="color:#1565a6;margin-bottom:4px">Travis Industries — ${flowLabel(data.flow)} Order</h2>
      <p style="color:#666;margin-top:0">PO #${data.dealerInfo.poNumber} &middot; ${data.dealerInfo.orderDate}</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr><td style="padding:4px 8px;font-weight:bold;width:130px">PO #</td><td style="padding:4px 8px">${data.dealerInfo.poNumber}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold">Dealer</td><td style="padding:4px 8px">${data.dealerInfo.dealerName} (#${data.dealerInfo.dealerNumber})</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold">Ordered By</td><td style="padding:4px 8px">${data.dealerInfo.orderedBy}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold">Ship To</td><td style="padding:4px 8px">${data.dealerInfo.shippingAddress}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold">Ship Method</td><td style="padding:4px 8px">${data.shipMethod}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold">Payment</td><td style="padding:4px 8px">${data.dealerInfo.paymentMethod}</td></tr>
      </table>

      <h3 style="color:#1565a6;border-bottom:2px solid #1565a6;padding-bottom:4px">Items Ordered</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:left">SKU</th>
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:left">Description</th>
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:center">Qty</th>
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:right">Unit</th>
            <th style="padding:6px 8px;border:1px solid #ddd;text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="padding:4px 8px;text-align:right;border:1px solid #ddd;font-weight:bold">Subtotal</td>
            <td style="padding:4px 8px;text-align:right;border:1px solid #ddd;font-weight:bold">$${data.subtotal.toFixed(2)}</td>
          </tr>
          ${data.freight > 0 ? `<tr>
            <td colspan="4" style="padding:4px 8px;text-align:right;border:1px solid #ddd">Freight</td>
            <td style="padding:4px 8px;text-align:right;border:1px solid #ddd">$${data.freight.toFixed(2)}</td>
          </tr>` : ''}
          <tr style="background:#f5f5f5">
            <td colspan="4" style="padding:6px 8px;text-align:right;border:1px solid #ddd;font-weight:bold">Total</td>
            <td style="padding:6px 8px;text-align:right;border:1px solid #ddd;font-weight:bold">$${data.total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      ${data.orderNotes ? `<p style="background:#f5f5f5;padding:12px;border-radius:4px"><strong>Order Notes:</strong> ${data.orderNotes}</p>` : ''}

      <p style="margin-top:20px;font-size:13px"><strong>Please send order confirmations to:</strong><br/>info@hibernation.com and jeremy@hibernation.com</p>

      <p style="color:#999;font-size:12px;margin-top:24px">Generated by Hibernation Stoves &amp; Spas Order System</p>
    </div>
  `;
}

/**
 * Send a Travis order: PDF attached, To saleswest@, CC info+jeremy, and save
 * the StoredOrder history row. Throws on send failure — caller is expected to
 * surface or catch.
 */
export async function sendTravisOrder(
  data: TravisOrderData,
  options: SubmitOptions
): Promise<SubmitResult> {
  if (!data.lineItems || data.lineItems.length === 0) {
    throw new Error('No line items');
  }
  if (!data.dealerInfo?.poNumber) {
    throw new Error('PO number required');
  }

  const pdfBytes = generateTravisPdf(data);
  const filename = `Hibernation_PO_${data.dealerInfo.poNumber}_Travis_${flowShortLabel(data.flow)}.pdf`;

  await transporter.sendMail({
    from: `"Hibernation Orders" <${process.env.GMAIL_USER}>`,
    to: 'saleswest@travisindustries.com',
    cc: ['info@hibernation.com', 'jeremy@hibernation.com'],
    subject: `New Order - Hibernation PO# ${data.dealerInfo.poNumber} - Travis ${flowShortLabel(data.flow)}`,
    html: buildTravisOrderEmailHtml(data),
    attachments: [
      { filename, content: Buffer.from(pdfBytes), contentType: 'application/pdf' },
    ],
  });

  const orderId = crypto.randomUUID();
  const itemCount = data.lineItems.reduce((sum, i) => sum + i.qty, 0);
  const storedOrder: StoredOrder = {
    id: orderId,
    type: 'stove',
    vendor: options.vendor,
    status: 'submitted',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    poNumber: data.dealerInfo.poNumber,
    orderDate: data.dealerInfo.orderDate,
    orderedBy: data.dealerInfo.orderedBy,
    description: `Travis ${flowShortLabel(data.flow)} — ${itemCount} item${itemCount !== 1 ? 's' : ''}`,
    total: data.total,
    freight: data.freight,
    orderData: data as unknown as Record<string, unknown>,
  };
  try {
    await saveOrder(storedOrder);
  } catch (kvError) {
    // Email already sent; history-save failure is non-fatal.
    console.error(`Failed to save Travis ${options.vendor} order to KV (email sent):`, kvError);
  }

  return { orderId };
}
