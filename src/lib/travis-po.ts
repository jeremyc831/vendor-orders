/**
 * Travis PO # generator.
 *
 * Format: MMDDYY + suffix (uppercased, spaces stripped).
 * Suffix is typically a customer last name, 'Stock', or a freeform string —
 * unlike the spa-flow `generatePO` in `src/lib/pricing.ts`, which assumes a
 * customer last name.
 */
export function generateTravisPO(orderDate: string, suffix: string): string {
  const [year, month, day] = orderDate.split('-');
  const yy = year.slice(-2);
  const prefix = `${month}${day}${yy}`;
  const cleanSuffix = suffix.replace(/\s+/g, '').toUpperCase();
  return `${prefix}${cleanSuffix}`;
}
