import { Series } from '@/types/manufacturer';
import { marquisShellColors, marquisCovers } from './shared';

export const crownSeries: Series = {
  id: 'crown',
  name: 'Crown Collection',
  manufacturer: 'marquis',
  models: [
    { id: 'SUMMIT', name: 'Summit', dealerCost: 10635, msrp: 26595 },
    { id: 'EPIC', name: 'Epic', dealerCost: 9895, msrp: 24695, hasLounge: true },
    { id: 'EUPHORIA', name: 'Euphoria', dealerCost: 9795, msrp: 24495 },
    { id: 'RESORT', name: 'Resort', dealerCost: 9270, msrp: 23195, hasLounge: 'double' },
    { id: 'DESTINY', name: 'Destiny', dealerCost: 9070, msrp: 22695 },
    { id: 'WISH', name: 'Wish', dealerCost: 7825, msrp: 19595, hasLounge: true },
    { id: 'SPIRIT', name: 'Spirit', dealerCost: 7620, msrp: 18995, hasLounge: true },
  ],
  shellColors: marquisShellColors,
  cabinetColors: [
    { id: 'granite', name: 'Granite', code: 'GR' },
    { id: 'timber', name: 'Timber', code: 'TBR' },
  ],
  options: [
    { id: 'bluetooth-audio', name: 'Bluetooth Audio', price: 500 },
    { id: 'controlmyspa', name: 'ControlMySpa RF', price: 225 },
    { id: 'durabase', name: 'DuraBase', price: 0, includedByDefault: true, note: 'Included on all Crown models' },
    { id: '2-pump-wish', name: '2-Pump Wish', price: 425, availableOn: ['WISH'], excludes: ['microsilk'] },
    { id: 'microsilk', name: 'MicroSilk', price: 1025, excludes: ['2-pump-wish'], note: 'Not available on Wish 2-Pump' },
    { id: 'microsilk-freeze', name: 'MicroSilk Freeze Sensor', price: 75, requires: 'microsilk' },
  ],
  steps: [
    { id: 'resort-spirit-bench', name: 'Resort/Spirit Bench', price: 225, availableOn: ['RESORT', 'SPIRIT'] },
    { id: 'curved-step-i', name: 'Curved Step I', price: 155, availableOn: ['RESORT', 'SPIRIT'] },
    { id: 'step-i', name: 'Step I', price: 155 },
    { id: 'step-ii-hinged', name: 'Step II Hinged', price: 250 },
    { id: 'storage-bench-36', name: '36" Storage Bench', price: 334.50 },
  ],
  covers: marquisCovers,
};
