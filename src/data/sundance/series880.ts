import { Series } from '@/types/manufacturer';
import { sundanceShellColors, sundanceCovers } from './shared';

export const series880: Series = {
  id: '880',
  name: '880 Series',
  manufacturer: 'sundance',
  models: [
    { id: 'AE', name: 'Aspen', dealerCost: 12003, msrp: 0 },
    { id: 'OP', name: 'Optima', dealerCost: 9943, msrp: 0 },
    { id: 'CA', name: 'Cameo', dealerCost: 9943, msrp: 0, hasLounge: true },
    { id: 'AL', name: 'Altamar', dealerCost: 9122, msrp: 0, hasLounge: true },
    { id: 'VM', name: 'Vistamar', dealerCost: 9122, msrp: 0, hasLounge: true },
    { id: 'MR', name: 'Marin', dealerCost: 8714, msrp: 0, hasLounge: true },
    { id: 'CP', name: 'Capri', dealerCost: 7894, msrp: 0, hasLounge: true },
  ],
  shellColors: sundanceShellColors,
  cabinetColors: [
    { id: 'windy-oak', name: 'Windy Oak', code: 'F' },
    { id: 'ironwood', name: 'Ironwood', code: 'Y' },
    { id: 'flint-gray', name: 'Flint Gray', code: 'H' },
  ],
  options: [
    { id: 'smarttub', name: 'SmartTub', price: 0, includedByDefault: true, note: 'Included - must be ordered' },
    { id: 'stereo', name: 'Stereo w/Wireless Charger', price: 550 },
    { id: 'ecowrap', name: 'EcoWrap CWP (Full Foam Insulation)', price: 171 },
  ],
  steps: [],
  covers: sundanceCovers,
};
