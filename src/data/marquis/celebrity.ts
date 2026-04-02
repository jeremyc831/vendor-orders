import { Series } from '@/types/manufacturer';
import { marquisShellColors, marquisCovers } from './shared';

export const celebritySeries: Series = {
  id: 'celebrity',
  name: 'Celebrity',
  manufacturer: 'marquis',
  models: [
    { id: 'WOOD', name: 'Woodstock', dealerCost: 5695, msrp: 12495, hasLounge: true },
    { id: 'HOLL', name: 'Hollywood', dealerCost: 4975, msrp: 10995, hasLounge: true },
    { id: 'VEGA', name: 'Vegas', dealerCost: 4975, msrp: 10995 },
    { id: 'BROA', name: 'Broadway', dealerCost: 4455, msrp: 9795, voltage: 'both' },
    { id: 'MONA', name: 'Monaco', dealerCost: 4145, msrp: 9095, voltage: 'both', hasLounge: true },
    { id: 'NASH', name: 'Nashville', dealerCost: 3945, msrp: 8595, voltage: 'both', hasLounge: true },
  ],
  shellColors: marquisShellColors,
  cabinetColors: [
    { id: 'ash', name: 'Ash' },
    { id: 'pecan', name: 'Pecan' },
  ],
  options: [
    { id: 'motown-audio', name: 'Motown Audio w/BT', price: 500, unavailableOn: ['MONA'] },
    { id: 'audio-expansion', name: 'Audio Expansion Port', price: 40 },
    { id: 'rf-audio-control', name: 'RF Audio Control Kit', price: 115 },
    { id: 'full-foam', name: 'Full Foam Insulation', price: 120 },
    { id: 'controlmyspa', name: 'ControlMySpa RF', price: 225 },
    { id: '240v-upgrade', name: '240V Performance Upgrade', price: 110, availableOn: ['BROA', 'MONA', 'NASH'] },
    { id: '2-pump', name: '2-Pump', price: 425, availableOn: ['BROA', 'MONA', 'NASH'], requires: '240v-upgrade' },
    { id: 'inline-system', name: 'In-line System', price: 120 },
  ],
  steps: [
    { id: '2-tier-black', name: '2-Tier Black Step', price: 75 },
    { id: 'celeb-step', name: 'Celeb Step (Black)', price: 0 },
  ],
  covers: marquisCovers,
};
