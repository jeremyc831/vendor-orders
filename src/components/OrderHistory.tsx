'use client';

import { StoredOrder, OrderStatus } from '@/types/order-history';

const statusConfig: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  submitted: { label: 'Submitted', color: 'text-amber-400', bg: 'bg-amber-400/15 border-amber-400/30' },
  confirmed: { label: 'Confirmed', color: 'text-blue-400', bg: 'bg-blue-400/15 border-blue-400/30' },
  shipped: { label: 'Shipped', color: 'text-purple-400', bg: 'bg-purple-400/15 border-purple-400/30' },
  delivered: { label: 'Delivered', color: 'text-green-400', bg: 'bg-green-400/15 border-green-400/30' },
};

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${month}/${day}/${year.slice(-2)}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function vendorLabel(vendor: string): string {
  const labels: Record<string, string> = {
    marquis: 'Marquis',
    sundance: 'Sundance',
  };
  return labels[vendor] ?? vendor;
}

interface OrderHistoryProps {
  orders: StoredOrder[];
  loading: boolean;
}

export default function OrderHistory({ orders, loading }: OrderHistoryProps) {
  if (loading) {
    return (
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Recent Orders</h2>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-lg border border-card-border p-4 animate-pulse">
              <div className="h-4 bg-slate-700 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (orders.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Recent Orders</h2>
        <div className="bg-card rounded-lg border border-card-border p-8 text-center">
          <p className="text-slate-400">No orders yet. Select a vendor above to place your first order.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-white mb-4">Recent Orders</h2>
      <div className="space-y-2">
        {orders.map(order => {
          const status = statusConfig[order.status] ?? statusConfig.submitted;
          return (
            <div
              key={order.id}
              className="bg-card rounded-lg border border-card-border px-4 py-3 flex items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-mono text-sm text-white font-medium">
                    PO# {order.poNumber}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatDate(order.orderDate)}
                  </span>
                  <span className="text-xs text-slate-400">
                    {vendorLabel(order.vendor)}
                  </span>
                </div>
                <div className="text-sm text-slate-400 truncate">
                  {order.description}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="font-mono text-sm text-white">
                  {formatCurrency(order.total)}
                </span>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${status.bg} ${status.color}`}>
                  {status.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
