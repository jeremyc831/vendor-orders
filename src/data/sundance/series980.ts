import { Series } from '@/types/manufacturer';
import { sundanceShellColors, sundanceCovers980 } from './shared';

export const series980: Series = {
  id: '980',
  name: '980 Series',
  manufacturer: 'sundance',
  models: [
    { id: 'CX', name: 'Claremont', dealerCost: 11958, msrp: 0, hasLounge: true },
    { id: 'KN', name: 'Kingston', dealerCost: 11958, msrp: 0 },
  ],
  shellColors: sundanceShellColors,
  cabinetColors: [
    { id: 'coastal', name: 'Coastal', code: 'G' },
    { id: 'mahogany', name: 'Mahogany', code: 'M' },
  ],
  options: [
    { id: 'smarttub', name: 'SmartTub', price: 0, includedByDefault: true, note: 'Included - must be ordered' },
    { id: 'stereo', name: 'Stereo', price: 450 },
    { id: 'ecowrap', name: 'EcoWrap CWP (Full Foam Insulation)', price: 171 },
  ],
  steps: [],
  covers: sundanceCovers980,
};
