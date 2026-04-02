import { ColorOption, CoverDef } from '@/types/manufacturer';

export const sundanceShellColors: ColorOption[] = [
  { id: 'platinum', name: 'Platinum', code: '12 PLAT' },
  { id: 'celestite', name: 'Celestite', code: '33 CELE' },
  { id: 'monaco', name: 'Monaco', code: '60 MONA', upcharge: 82, note: 'While supplies last' },
  { id: 'travertine', name: 'Travertine', code: '83 TRAV', upcharge: 175 },
  { id: 'morning-mist', name: 'Morning Mist', code: '84 MMST', upcharge: 175 },
];

export const sundanceCovers: CoverDef[] = [
  { id: 'sunstrong', name: 'SUNSTRONG Insulating Cover', price: 0 },
  { id: 'sunstrong-extreme', name: 'SUNSTRONG Extreme (WeatherShield)', price: 98, isDefault: true },
];

export const sundanceCovers980: CoverDef[] = [
  { id: 'sunstrong', name: 'SUNSTRONG Insulating Cover', price: 0 },
  { id: 'sunstrong-extreme', name: 'SUNSTRONG Extreme (WeatherShield)', price: 0, isDefault: true },
];
