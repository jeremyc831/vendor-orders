import { Series, Manufacturer } from '@/types/manufacturer';
import { OrderLineItem } from '@/types/order';

export function calculateLineItemTotal(
  series: Series,
  lineItem: OrderLineItem
): number {
  const model = series.models.find(m => m.id === lineItem.modelId);
  if (!model) return 0;

  let total = model.dealerCost;

  // Shell color upcharge
  const shellColor = series.shellColors.find(c => c.id === lineItem.shellColorId);
  if (shellColor?.upcharge) total += shellColor.upcharge;

  // Options
  for (const optId of lineItem.selectedOptions) {
    const opt = series.options.find(o => o.id === optId);
    if (opt) total += opt.price;
  }

  // Cover
  const cover = series.covers.find(c => c.id === lineItem.coverId);
  if (cover) total += cover.price;

  // Steps (multiple)
  for (const sId of lineItem.selectedSteps) {
    const step = series.steps.find(s => s.id === sId);
    if (step) total += step.price;
  }

  return total;
}

export function calculateOrderTotal(
  lineItemTotal: number,
  freight: number,
  manufacturer: Manufacturer
): { subtotal: number; discount: number; total: number } {
  const subtotal = lineItemTotal + freight;
  // Marquis 2% EFT/prepay discount on spa cost (before freight)
  const discount = manufacturer === 'marquis' ? Math.round(lineItemTotal * 0.02 * 100) / 100 : 0;
  const total = subtotal - discount;
  return { subtotal, discount, total };
}

export function isOptionAvailable(
  optionId: string,
  modelId: string,
  selectedOptions: string[],
  series: Series
): boolean {
  const opt = series.options.find(o => o.id === optionId);
  if (!opt) return false;

  if (opt.availableOn && !opt.availableOn.includes(modelId)) return false;
  if (opt.unavailableOn && opt.unavailableOn.includes(modelId)) return false;
  if (opt.requires && !selectedOptions.includes(opt.requires)) return false;

  if (opt.excludes) {
    for (const excl of opt.excludes) {
      if (selectedOptions.includes(excl)) return false;
    }
  }

  return true;
}

export function isStepAvailable(
  stepId: string,
  modelId: string,
  series: Series
): boolean {
  const step = series.steps.find(s => s.id === stepId);
  if (!step) return false;
  if (step.availableOn && !step.availableOn.includes(modelId)) return false;
  return true;
}

export function getDefaultOptions(series: Series): string[] {
  return series.options
    .filter(o => o.includedByDefault)
    .map(o => o.id);
}

export function getDefaultCoverId(series: Series): string | null {
  const def = series.covers.find(c => c.isDefault);
  return def?.id ?? series.covers[0]?.id ?? null;
}

/** Generate PO from order date + last name, e.g. "040226CARLSON" */
export function generatePO(orderDate: string, lastName: string): string {
  const [year, month, day] = orderDate.split('-');
  const yy = year.slice(-2);
  return `${month}${day}${yy}${lastName.toUpperCase()}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}
