import { AccessoryVendor } from '@/types/accessories';

export const totalFireplace: AccessoryVendor = {
  id: 'total-fireplace',
  name: 'Total Fireplace',
  orderEmail: '', // TBD - Jeremy to provide
  categories: ['Fire Starters', 'Fireplace Tools', 'Accessories'],
  products: [
    // Fire Starters
    { id: 'tf-fatwood', name: 'Fatwood Fire Starter 25lb Box', sku: 'FS-FW25', price: 24.95, category: 'Fire Starters', unit: 'box' },
    { id: 'tf-firestarter-sq', name: 'Fire Starter Squares 24ct', sku: 'FS-SQ24', price: 8.95, category: 'Fire Starters', unit: 'box' },
    { id: 'tf-matches', name: 'Long Fireplace Matches', sku: 'FS-MTH', price: 6.95, category: 'Fire Starters', unit: 'box' },

    // Fireplace Tools
    { id: 'tf-toolset-5pc', name: '5-Piece Fireplace Tool Set', sku: 'FT-5PC', price: 89.00, category: 'Fireplace Tools', unit: 'each' },
    { id: 'tf-log-grate', name: 'Cast Iron Log Grate 24"', sku: 'FT-LG24', price: 49.95, category: 'Fireplace Tools', unit: 'each' },
    { id: 'tf-ash-bucket', name: 'Ash Bucket with Lid', sku: 'FT-ASH', price: 34.95, category: 'Fireplace Tools', unit: 'each' },

    // Accessories
    { id: 'tf-glass-cleaner', name: 'Fireplace Glass Cleaner 16oz', sku: 'AC-GLC', price: 9.95, category: 'Accessories', unit: 'each' },
    { id: 'tf-hearth-rug', name: 'Hearth Rug 36x60', sku: 'AC-HRG', price: 59.95, category: 'Accessories', unit: 'each' },
  ],
};
