export interface AccessoryProduct {
  id: string;
  name: string;
  sku?: string;
  price: number;
  category: string;
  unit?: string;      // e.g. "each", "case", "box"
  caseSize?: number;  // units per case/box — shown in product list with running total
  isCustom?: boolean; // true for user-added products stored in KV
}

export interface AccessoryVendor {
  id: string;
  name: string;
  orderEmail: string;
  accountNumber?: string;
  products: AccessoryProduct[];
  categories: string[];
}

export interface AccessoryLineItem {
  productId: string;
  name: string;
  sku?: string;
  price: number;
  quantity: number;
  lineTotal: number;
}

export interface AccessoryOrderData {
  vendorId: string;
  vendorName: string;
  orderEmail: string;
  dealerInfo: {
    dealerName: string;
    orderedBy: string;
    email: string;
    shippingAddress: string;
    phone: string;
    poNumber: string;
    orderDate: string;
    paymentMethod: string;
  };
  lineItems: AccessoryLineItem[];
  notes: string;
  subtotal: number;
  freight: number;
  total: number;
}
