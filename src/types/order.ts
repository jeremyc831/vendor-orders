import { Manufacturer, DealerInfo } from './manufacturer';

export interface OrderLineItem {
  manufacturer: Manufacturer;
  seriesId: string;
  seriesName: string;
  modelId: string;
  modelName: string;
  shellColorId: string;
  shellColorName: string;
  cabinetColorId: string;
  cabinetColorName: string;
  selectedOptions: string[];
  coverId: string;
  selectedSteps: string[];
  stepColor?: string;
  notes: string;
  basePrice: number;
  optionsTotal: number;
  shellUpcharge: number;
}

export interface Order {
  manufacturer: Manufacturer;
  dealerInfo: DealerInfo;
  lineItem: OrderLineItem;
  freight: number;
  subtotal: number;
  discount: number;
  total: number;
}
