import { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { createApiClient } from '../services/api.client.js';
import { useAsync } from '../hooks/useAsync.js';
import type { Order, Product } from '../types/models.js';

interface PaginatedOrders {
  items: Order[];
  page: number;
  total: number;
  totalPages: number;
}

export default function OrdersPage() {
  const { token, user } = useAuth();
  const [page, setPage] = useState(1);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [msg, setMsg] = useState('');
  const isStaff = user?.role === 'admin' || user?.role === 'manager';

  const { state, refetch } = useAsync(
    () =>
      createApiClient(token).get<PaginatedOrders>(
        `/orders?page=${page}&limit=10${isStaff ? '&all=true' : ''}`
      ),
    [token, page, isStaff]
  );

  const productsState = useAsync(
    () => createApiClient(token).get<Product[] | { items: Product[] }>('/products'),
    [token]
  );

  const products: Product[] =
    productsState.state.status === 'success'
      ? Array.isArray(productsState.state.data)
        ? productsState.state.data
        : productsState.state.data.items
      : [];

  async function placeOrder() {
    setMsg('');
    if (!productId) {
      setMsg('Select a product');
      return;
    }
    try {
      const idempotencyKey = `ui-${productId}-${Date.now()}`;
      const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';
      const res = await fetch(`${BASE}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          items: [{ productId, quantity: Number(qty) || 1 }],
          shippingAddress: { line1: 'Demo Street', city: 'Demo City' },
        }),
      });
      const json = (await res.json()) as { data?: unknown; error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message ?? 'Order failed');
      setMsg(`Order placed (Idempotency-Key: ${idempotencyKey})`);
      await refetch();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Order failed');
    }
  }

  async function cancelOrder(id: string) {
    try {
      await createApiClient(token).post(`/orders/${id}/cancel`, {});
      setMsg('Order cancelled (stock restored)');
      await refetch();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Cancel failed');
    }
  }

  const data = state.status === 'success' ? state.data : null;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Orders</h1>
        <p>{isStaff ? 'All customer orders' : 'Your orders'}</p>
      </header>

      {msg && <div className="alert">{msg}</div>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Place order</h3>
        <div className="toolbar">
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Select product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (${p.price}) — stock {p.stock}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            style={{ width: '5rem' }}
          />
          <button type="button" className="btn-primary" onClick={() => void placeOrder()}>
            Place order
          </button>
        </div>
      </div>

      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <div className="alert error">{state.error}</div>}

      {data && (
        <>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Total</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((o) => (
                <tr key={o.id}>
                  <td>
                    <code>{o.id.slice(0, 8)}…</code>
                  </td>
                  <td>{o.status}</td>
                  <td>${o.total_amount}</td>
                  <td>{new Date(o.created_at).toLocaleString()}</td>
                  <td>
                    {!['cancelled', 'shipped', 'delivered'].includes(o.status) && (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => void cancelOrder(o.id)}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="toolbar" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="btn-ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </button>
            <span className="muted">
              Page {data.page} / {data.totalPages}
            </span>
            <button
              type="button"
              className="btn-ghost"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
