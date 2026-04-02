import { Series } from '@/types/manufacturer';
import { sundanceShellColors } from './shared';
import { CoverDef } from '@/types/manufacturer';

const sundanceCovers680: CoverDef[] = [
  { id: 'sunstrong', name: 'SUNSTRONG Insulating Cover', price: 0 },
  { id: 'sunstrong-extreme', name: 'SUNSTRONG Extreme (WeatherShield)', price: 98, isDefault: true },
];

export const series680: Series = {
  id: '680',
  name: '680 Series',
  manufacturer: 'sundance',
  models: [
    { id: 'MC', name: 'McKinley', dealerCost: 5519, msrp: 0 },
    { id: 'PY', name: 'Peyton', dealerCost: 4517, msrp: 0, hasLounge: true },
    { id: 'ED', name: 'Edison', dealerCost: 4517, msrp: 0 },
    { id: 'PD', name: 'Prado', dealerCost: 4205, msrp: 0, voltage: 'both' },
    { id: 'AC', name: 'Alicia', dealerCost: 3948, msrp: 0, voltage: 'both', hasLounge: true },
  ],
  shellColors: sundanceShellColors,
  cabinetColors: [
    { id: 'slate', name: 'Slate', code: 'A' },
    { id: 'graphite', name: 'Graphite', code: 'P' },
  ],
  options: [
    { id: 'smarttub', name: 'SmartTub', price: 350 },
  ],
  steps: [],
  covers: sundanceCovers680,
};
