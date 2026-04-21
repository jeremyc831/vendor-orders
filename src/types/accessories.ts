/**
 * A single purchasable variant of a product (e.g. "Color: Black + Size: 8\"").
 * Used when a product has option dropdowns. Products without variants omit this.
 */
export interface AccessoryVariant {
  id: string;                        // e.g. "black-8"
  options: Record<string, string>;   // e.g. { Color: "Black", Size: "8\"" }
  sku?: string;                      // vendor SKU for this specific variant
  price?: number;                    // line-item price (typically wholesale); falls back to product.price if not set
  wholesale?: number;                // populated from wholesale spreadsheet
  retailSource?: number;             // vendor's retail for this variant, if known
  imageUrl?: string;                 // variant-specific image
  outOfStock?: boolean;
}

export interface AccessoryProduct {
  id: string;
  name: string;
  sku?: string;
  price: number;                     // REQUIRED: line-item price used on order (wholesale once known, else vendor retail)
  category: string;
  unit?: string;                     // "each", "case", "box"
  caseSize?: number;                 // units per case/box — shown with running total
  isCustom?: boolean;                // true for user-added products stored in KV

  // --- Rich product info (optional; populated for vendors with scraped catalogs) ---
  brand?: string;
  description?: string;
  imageUrl?: string;
  sourceUrl?: string;                // link back to the vendor's product page

  // --- Pricing model ---
  retailSource?: number;             // vendor's public retail (reference for markup decisions)
  wholesale?: number;                // Jeremy's actual cost from spreadsheet (when known)
  shippingPct?: number;              // estimated shipping markup % (defaults applied in UI)
  // storeRetail is computed: round((wholesale * (1 + shippingPct/100)) * 2)

  // --- Variants (optional) ---
  variants?: AccessoryVariant[];
  outOfStock?: boolean;              // vendor flagged it out of stock (still orderable from our UI)
}

export interface AccessoryVendor {
  id: string;
  name: string;
  orderEmail: string;
  accountNumber?: string;
  products: AccessoryProduct[];
  categories: string[];
  defaultShippingPct?: number;       // vendor-wide default for computed retail
}

export interface AccessoryLineItem {
  productId: string;
  variantId?: string;                // set when a variant was selected
  name: string;
  sku?: string;
  variantLabel?: string;             // e.g. "Color: Black, Size: 8\""
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
