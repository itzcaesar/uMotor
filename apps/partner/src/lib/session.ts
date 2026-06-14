import { create } from 'zustand';
import { DEMO_WORKSHOP_ID } from '@umotor/shared';

interface SessionState {
  workshopId: string | null;
  login: () => void;
  /** Sign in as a freshly registered workshop (see signup flow). */
  loginAs: (workshopId: string) => void;
  logout: () => void;
}

/** Fake login by design (architecture doc §3): one tap → AHASS Bandung Timur. */
export const useSession = create<SessionState>((set) => ({
  workshopId: null,
  login: () => set({ workshopId: DEMO_WORKSHOP_ID }),
  loginAs: (workshopId) => set({ workshopId }),
  logout: () => set({ workshopId: null }),
}));
