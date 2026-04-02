import { Series, Manufacturer } from '@/types/manufacturer';
import { celebritySeries } from './marquis/celebrity';
import { eliteSeries } from './marquis/elite';
import { vector21Series } from './marquis/vector21';
import { crownSeries } from './marquis/crown';
import { series980 } from './sundance/series980';
import { series880 } from './sundance/series880';
import { series780 } from './sundance/series780';
import { series680 } from './sundance/series680';

export const marquisSeries: Series[] = [
  crownSeries,
  vector21Series,
  eliteSeries,
  celebritySeries,
];

export const sundanceSeries: Series[] = [
  series980,
  series880,
  series780,
  series680,
];

export function getSeriesForManufacturer(manufacturer: Manufacturer): Series[] {
  return manufacturer === 'marquis' ? marquisSeries : sundanceSeries;
}

export function findSeries(manufacturer: Manufacturer, seriesId: string): Series | undefined {
  return getSeriesForManufacturer(manufacturer).find(s => s.id === seriesId);
}
