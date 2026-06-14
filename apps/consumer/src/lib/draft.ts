import { create } from 'zustand';
import type { Service, Slot, Sparepart, Workshop } from '@umotor/shared';

/**
 * Booking draft carried across the flow:
 * booking/new → booking/workshop/[id] → booking/confirm.
 */
interface DraftState {
  motorcycleId: string | null;
  preferredServiceCode: string | null; // from the maintenance banner deep-link
  workshop: Workshop | null;
  service: Service | null;
  slot: Slot | null;
  isHomeService: boolean;
  homeAddress: string | null;
  parts: Sparepart[];
  setBike: (motorcycleId: string, preferredServiceCode?: string | null) => void;
  setWorkshop: (workshop: Workshop) => void;
  setServiceSlot: (service: Service, slot: Slot) => void;
  setHomeService: (service: Service, address: string) => void;
  togglePart: (part: Sparepart) => void;
  reset: () => void;
}

const initial = {
  motorcycleId: null,
  preferredServiceCode: null,
  workshop: null,
  service: null,
  slot: null,
  isHomeService: false,
  homeAddress: null,
  parts: [],
};

export const useDraft = create<DraftState>((set) => ({
  ...initial,
  setBike: (motorcycleId, preferredServiceCode = null) =>
    set({ ...initial, motorcycleId, preferredServiceCode }),
  setWorkshop: (workshop) => set({ workshop }),
  setServiceSlot: (service, slot) => set({ service, slot, isHomeService: false, homeAddress: null }),
  setHomeService: (service, address) =>
    set({ service, slot: null, isHomeService: true, homeAddress: address }),
  togglePart: (part) =>
    set((s) => ({
      parts: s.parts.some((p) => p.id === part.id)
        ? s.parts.filter((p) => p.id !== part.id)
        : [...s.parts, part],
    })),
  reset: () => set(initial),
}));

export const selectDraftTotal = (s: DraftState) =>
  (s.service?.base_price ?? 0) + s.parts.reduce((sum, p) => sum + p.price, 0);
