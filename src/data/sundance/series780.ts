import { Series } from '@/types/manufacturer';
import { sundanceShellColors, sundanceCovers } from './shared';

export const series780: Series = {
  id: '780',
  name: '780 Series',
  manufacturer: 'sundance',
  models: [
    { id: 'HM', name: 'Hamilton', dealerCost: 7362, msrp: 0, hasLounge: true },
    { id: 'CS', name: 'Chelsee', dealerCost: 7362, msrp: 0 },
    { id: 'BT', name: 'Bristol', dealerCost: 6931, msrp: 0, hasLounge: true },
    { id: 'ML', name: 'Montclair', dealerCost: 6424, msrp: 0, hasLounge: true },
    { id: 'DV', name: 'Dover', dealerCost: 5815, msrp: 0, voltage: 'both' },
  ],
  shellColors: sundanceShellColors,
  cabinetColors: [
    { id: 'modern-hardwood', name: 'Modern Hardwood', code: 'D' },
    { id: 'brushed-gray', name: 'Brushed Gray', code: 'U' },
    { id: 'vintage-oak', name: 'Vintage Oak', code: 'V' },
  ],
  options: [
    { id: 'smarttub', name: 'SmartTub', price: 0, includedByDefault: true, note: 'Included - must be ordered' },
    { id: 'stereo', name: 'Stereo', price: 400 },
    { id: 'ecowrap', name: 'EcoWrap CWP (Full Foam Insulation)', price: 171 },
  ],
  steps: [],
  covers: sundanceCovers,
};
