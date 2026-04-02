import { Series } from '@/types/manufacturer';
import { marquisShellColors, marquisCovers } from './shared';

export const eliteSeries: Series = {
  id: 'elite',
  name: 'Elite',
  manufacturer: 'marquis',
  models: [
    { id: 'WOOD-ELT', name: 'Woodstock Elite', dealerCost: 7000, msrp: 16395, hasLounge: true },
    { id: 'HOLL-ELT', name: 'Hollywood Elite', dealerCost: 6220, msrp: 14595, hasLounge: true },
    { id: 'VEGA-ELT', name: 'Vegas Elite', dealerCost: 6220, msrp: 14595 },
    { id: 'BROA-ELT', name: 'Broadway Elite', dealerCost: 5495, msrp: 12895 },
    { id: 'MONA-ELT', name: 'Monaco Elite', dealerCost: 5180, msrp: 12095, voltage: 'both', hasLounge: true },
    { id: 'NASH-ELT', name: 'Nashville Elite', dealerCost: 4800, msrp: 11295, voltage: 'both', hasLounge: true },
  ],
  shellColors: marquisShellColors,
  cabinetColors: [
    { id: 'granite', name: 'Granite', code: 'GR' },
    { id: 'hickory', name: 'Hickory', code: 'HK' },
    { id: 'harbor', name: 'Harbor', code: 'HB' },
  ],
  options: [
    { id: 'motown-audio', name: 'Motown Audio w/BT', price: 500 },
    { id: 'audio-expansion', name: 'Audio Expansion Port', price: 40 },
    { id: 'rf-audio-control', name: 'RF Audio Control Kit', price: 115 },
    { id: 'full-foam', name: 'Full Foam Insulation', price: 120 },
    { id: 'controlmyspa', name: 'ControlMySpa RF', price: 225 },
    { id: '240v-upgrade', name: '240V Performance Upgrade', price: 110, availableOn: ['MONA-ELT', 'NASH-ELT'] },
    { id: '2-pump', name: '2-Pump Broadway Elt', price: 425, availableOn: ['BROA-ELT'], requires: '240v-upgrade' },
    { id: 'inline-system', name: 'In-line System', price: 120 },
    { id: 'microsilk', name: 'MicroSilk', price: 1025, unavailableOn: ['MONA-ELT'], excludes: ['2-pump'], note: 'Not available on Monaco Elt or Broadway Elt 2-Pump' },
    { id: 'microsilk-freeze', name: 'MicroSilk Freeze Sensor', price: 75, requires: 'microsilk' },
  ],
  steps: [
    { id: 'elite-step-i', name: 'Elite Step I', price: 155, colors: ['Black', 'Chestnut'] },
    { id: 'elite-step-ii', name: 'Elite Step II Hinged', price: 240, colors: ['Black', 'Chestnut'] },
    { id: 'elite-storage-bench', name: 'Elite 36" Storage Bench', price: 334.50, colors: ['Black', 'Chestnut'] },
  ],
  covers: marquisCovers,
};
