import { create } from 'zustand';
import { DEMO_USER_ID } from '@umotor/shared';

interface SessionState {
  userId: string | null;
  login: () => void;
  logout: () => void;
}

/** Fake login by design (architecture doc §3): one tap → seeded demo user. */
export const useSession = create<SessionState>((set) => ({
  userId: null,
  login: () => set({ userId: DEMO_USER_ID }),
  logout: () => set({ userId: null }),
}));
