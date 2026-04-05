import { AccessoryVendor } from '@/types/accessories';

export const marquisAccessories: AccessoryVendor = {
  id: 'marquis-accessories',
  name: 'Marquis',
  orderEmail: 'insidesales@marquiscorp.com',
  accountNumber: '101099',
  categories: ['Filters', 'Chemicals', 'Covers', 'Accessories'],
  products: [
    // Filters
    { id: 'mq-filter-35', name: 'Filter Cartridge 35 sq ft', sku: 'FIL-035', price: 29.95, category: 'Filters', unit: 'each' },
    { id: 'mq-filter-50', name: 'Filter Cartridge 50 sq ft', sku: 'FIL-050', price: 34.95, category: 'Filters', unit: 'each' },
    { id: 'mq-filter-75', name: 'Filter Cartridge 75 sq ft', sku: 'FIL-075', price: 44.95, category: 'Filters', unit: 'each' },

    // Chemicals
    { id: 'mq-chlor-gran', name: 'Chlorine Granules 2lb', sku: 'CHM-CHL2', price: 14.95, category: 'Chemicals', unit: 'case', caseSize: 12 },
    { id: 'mq-test-strips', name: 'Test Strips 50ct', sku: 'CHM-TST50', price: 12.95, category: 'Chemicals', unit: 'case', caseSize: 12 },
    { id: 'mq-ph-down', name: 'pH Decreaser 2lb', sku: 'CHM-PHD2', price: 11.95, category: 'Chemicals', unit: 'case', caseSize: 12 },

    // Covers
    { id: 'mq-cover-lifter', name: 'Cover Lifter CoverMate III', sku: 'CVR-CM3', price: 189.00, category: 'Covers', unit: 'each' },

    // Accessories
    { id: 'mq-headrest', name: 'Spa Pillow/Headrest', sku: 'ACC-PIL', price: 39.95, category: 'Accessories', unit: 'each' },
    { id: 'mq-led-light', name: 'LED Light Kit', sku: 'ACC-LED', price: 89.00, category: 'Accessories', unit: 'each' },
  ],
};
