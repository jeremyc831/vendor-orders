import { Series } from '@/types/manufacturer';
import { marquisShellColors, marquisCovers } from './shared';

export const vector21Series: Series = {
  id: 'vector21',
  name: 'Vector21',
  manufacturer: 'marquis',
  models: [
    { id: 'V94L', name: 'V94L', dealerCost: 8195, msrp: 20495, hasLounge: true },
    { id: 'V94', name: 'V94', dealerCost: 8195, msrp: 20495 },
    { id: 'V84L', name: 'V84L', dealerCost: 7525, msrp: 18795, hasLounge: true },
    { id: 'V84', name: 'V84', dealerCost: 7525, msrp: 18795 },
    { id: 'V77L', name: 'V77L', dealerCost: 6165, msrp: 15395, hasLounge: true },
    { id: 'V65L', name: 'V65L', dealerCost: 5660, msrp: 14095, hasLounge: true, voltage: 'both' },
  ],
  shellColors: marquisShellColors,
  cabinetColors: [
    { id: 'barnwood', name: 'Barnwood', code: 'BW' },
    { id: 'chestnut', name: 'Chestnut', code: 'CT' },
  ],
  options: [
    { id: 'cosmic-audio', name: 'Cosmic Audio Bluetooth', price: 500 },
    { id: 'audio-expansion', name: 'Audio Expansion Port', price: 40 },
    { id: 'full-foam', name: 'Full Foam Insulation', price: 120 },
    { id: 'controlmyspa', name: 'ControlMySpa', price: 225 },
    { id: 'durabase', name: 'DuraBase', price: 300 },
    { id: '240v-upgrade', name: '240V Performance Upgrade', price: 110, availableOn: ['V65L'] },
    { id: '2-pump-v77l', name: '2-Pump V77L', price: 425, availableOn: ['V77L'], requires: '240v-upgrade', excludes: ['microsilk'] },
    { id: 'pump-upgrade-v65l', name: 'Pump Upgrade V65L', price: 425, availableOn: ['V65L'], requires: '240v-upgrade' },
    { id: 'microsilk', name: 'MicroSilk', price: 1025, excludes: ['2-pump-v77l'], note: 'Not available with V77L 2-Pump' },
    { id: 'microsilk-freeze', name: 'MS Freeze Sensor', price: 75, requires: 'microsilk' },
  ],
  steps: [
    { id: 'step-i', name: 'Step I', price: 155 },
    { id: 'step-ii-hinged', name: 'Step II Hinged', price: 240 },
    { id: 'storage-bench-36', name: '36" Storage Bench', price: 334.50 },
  ],
  covers: marquisCovers,
};
