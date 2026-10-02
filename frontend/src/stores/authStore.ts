import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  /** JWT issued by the backend. Kept in localStorage so a refresh keeps the session. */
  token: string | null;
  email: string | null;
  /** Epoch milliseconds; the token is not trusted past this. */
  expiresAt: number | null;
  /** One-shot message for the sign-in page (e.g. "Your session has ended"). Not persisted. */
  notice: string | null;
  setSession: (token: string, email: string, expiresInSeconds: number) => void;
  signOut: (notice?: string) => void;
  clearNotice: () => void;
}

// A small margin so a request never leaves with a token that expires in flight.
const SKEW_MS = 5_000;

export const isSessionValid = (s: Pick<AuthState, 'token' | 'expiresAt'>) =>
  !!s.token && !!s.expiresAt && s.expiresAt - SKEW_MS > Date.now();

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      email: null,
      expiresAt: null,
      notice: null,
      setSession: (token, email, expiresInSeconds) =>
        set({
          token,
          email,
          expiresAt: Date.now() + expiresInSeconds * 1000,
          notice: null,
        }),
      signOut: (notice) =>
        set({ token: null, email: null, expiresAt: null, notice: notice ?? null }),
      clearNotice: () => set({ notice: null }),
    }),
    {
      name: 'biogen-auth',
      partialize: (s) => ({ token: s.token, email: s.email, expiresAt: s.expiresAt }),
    }
  )
);
