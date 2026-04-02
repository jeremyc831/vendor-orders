import { ColorOption, CoverDef } from '@/types/manufacturer';

export const marquisShellColors: ColorOption[] = [
  { id: 'alba', name: 'Alba', code: 'ALB' },
  { id: 'glacier', name: 'Glacier', code: 'GLA' },
  { id: 'midnight-canyon', name: 'Midnight Canyon', code: 'MID' },
  { id: 'sterling-silver', name: 'Sterling Silver', code: 'SIL' },
  { id: 'tuscan-sun', name: 'Tuscan Sun', code: 'TUS' },
  { id: 'winter-solstice', name: 'Winter Solstice', code: 'WIN' },
];

export const marquisCovers: CoverDef[] = [
  { id: 'black-vinyl', name: 'Black Vinyl Cover', price: 0 },
  { id: 'black-weathershield', name: 'Black WeatherShield Upgrade', price: 100, isDefault: true },
];
