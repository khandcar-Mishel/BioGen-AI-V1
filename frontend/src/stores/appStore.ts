import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { checkHealth, DEFAULT_BACKEND_URL } from '../services/api';
import type { JobStatus } from '../services/api';

interface AppState {
  currentJobId: string | null;
  jobStatus: JobStatus | null;
  backendUrl: string;
  isBackendConnected: boolean;
  lastConnected: string | null;
  setCurrentJobId: (id: string | null) => void;
  setJobStatus: (status: JobStatus | null) => void;
  setBackendUrl: (url: string) => void;
  setConnectionStatus: (isConnected: boolean, timestamp?: string) => void;
  clearConfig: () => void;
  checkConnection: () => Promise<boolean>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentJobId: null,
      jobStatus: null,
      backendUrl: '',
      isBackendConnected: false,
      lastConnected: null,
      setCurrentJobId: (id) => set({ currentJobId: id }),
      setJobStatus: (status) => set({ jobStatus: status }),
      setBackendUrl: (url) => set({ backendUrl: url }),
      setConnectionStatus: (isConnected, timestamp) =>
        set((state) => ({
          isBackendConnected: isConnected,
          lastConnected: timestamp || state.lastConnected,
        })),
      clearConfig: () =>
        set({
          backendUrl: '',
          isBackendConnected: false,
          lastConnected: null,
        }),
      checkConnection: async () => {
        try {
          const { backendUrl } = get();
          // Fall back to VITE_BACKEND_URL / the local backend so the app connects out of the box
          await checkHealth(backendUrl || DEFAULT_BACKEND_URL);
          const now = new Date().toISOString();
          set({ isBackendConnected: true, lastConnected: now });
          return true;
        } catch {
          set({ isBackendConnected: false });
          return false;
        }
      },
    }),
    {
      name: 'biogen-storage',
      partialize: (state) => ({
        backendUrl: state.backendUrl,
        lastConnected: state.lastConnected,
        // Jobs live on the backend, so remembering the id lets a refresh pick the run back up.
        currentJobId: state.currentJobId,
        // Explicitly NOT persisting isBackendConnected so it defaults to false on reload
      }),
    }
  )
);
