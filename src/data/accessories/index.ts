import { AccessoryVendor } from '@/types/accessories';
import { marquisAccessories } from './marquis';
import { totalFireplace } from './total-fireplace';

export const accessoryVendors: AccessoryVendor[] = [
  marquisAccessories,
  totalFireplace,
];

export function findAccessoryVendor(vendorId: string): AccessoryVendor | undefined {
  return accessoryVendors.find(v => v.id === vendorId);
}
