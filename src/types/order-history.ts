export type OrderType = 'spa' | 'stove' | 'supplies';

export type OrderStatus = 'submitted' | 'confirmed' | 'shipped' | 'delivered';

export interface StoredOrder {
  id: string;
  type: OrderType;
  vendor: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  statusNotes?: string;

  // Summary fields for history list
  poNumber: string;
  orderDate: string;
  orderedBy: string;
  description: string;
  total: number;
  freight: number;

  // Full order payload for detail view / PDF re-download
  orderData: Record<string, unknown>;
}
