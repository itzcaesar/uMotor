import { create } from 'zustand';
import type { Sparepart } from '@umotor/shared';

export interface CartItem {
  part: Sparepart;
  qty: number;
}

export type DeliveryMode = 'ship' | 'install';

interface CartState {
  items: Record<string, CartItem>;
  delivery: DeliveryMode;
  add: (part: Sparepart) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  setDelivery: (mode: DeliveryMode) => void;
  clear: () => void;
}

/** Local cart for the prototype (no server-side cart). Mirrors Consumer PRD §3. */
export const useCart = create<CartState>((set) => ({
  items: {},
  delivery: 'ship',
  add: (part) =>
    set((s) => {
      const existing = s.items[part.id];
      return {
        items: {
          ...s.items,
          [part.id]: { part, qty: (existing?.qty ?? 0) + 1 },
        },
      };
    }),
  setQty: (id, qty) =>
    set((s) => {
      if (qty <= 0) {
        const next = { ...s.items };
        delete next[id];
        return { items: next };
      }
      const existing = s.items[id];
      if (!existing) return s;
      return { items: { ...s.items, [id]: { ...existing, qty } } };
    }),
  remove: (id) =>
    set((s) => {
      const next = { ...s.items };
      delete next[id];
      return { items: next };
    }),
  setDelivery: (mode) => set({ delivery: mode }),
  clear: () => set({ items: {}, delivery: 'ship' }),
}));

/** Derived selectors — call with useCart(selectCount) etc. */
export const selectCount = (s: CartState) =>
  Object.values(s.items).reduce((n, it) => n + it.qty, 0);

export const selectTotal = (s: CartState) =>
  Object.values(s.items).reduce((sum, it) => sum + it.part.price * it.qty, 0);
