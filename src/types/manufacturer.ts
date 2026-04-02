export type Manufacturer = 'marquis' | 'sundance';

export interface SpaModel {
  id: string;
  name: string;
  dealerCost: number;
  msrp: number;
  voltage?: '240V' | '120V' | 'both';
  hasLounge?: boolean | 'double';
}

export interface ColorOption {
  id: string;
  name: string;
  code?: string;
  upcharge?: number;
  note?: string;
}

export interface OptionDef {
  id: string;
  name: string;
  price: number;
  availableOn?: string[];
  unavailableOn?: string[];
  requires?: string;
  excludes?: string[];
  note?: string;
  category?: string;
  includedByDefault?: boolean;
}

export interface StepDef {
  id: string;
  name: string;
  price: number;
  availableOn?: string[];
  colors?: string[];
}

export interface CoverDef {
  id: string;
  name: string;
  price: number;
  isDefault?: boolean;
}

export interface Series {
  id: string;
  name: string;
  manufacturer: Manufacturer;
  models: SpaModel[];
  shellColors: ColorOption[];
  cabinetColors: ColorOption[];
  options: OptionDef[];
  steps: StepDef[];
  covers: CoverDef[];
}

export interface DealerInfo {
  dealerName: string;
  dealerNumber: string;
  orderedBy: string;
  email: string;
  shippingAddress: string;
  phone: string;
  lastName: string;
  orderDate: string;
  paymentMethod: string;
}
