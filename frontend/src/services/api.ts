import axios from 'axios';
import { useAppStore } from '../stores/appStore';
import { useAuthStore, isSessionValid } from '../stores/authStore';

// Ensure a user-provided endpoint is a full base URL pointing at /api/v1
export const normalizeBackendUrl = (url: string): string => {
  let u = (url || '').trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
  if (u && !/\/api\/v1$/i.test(u)) u += '/api/v1';
  return u;
};

// VITE_BACKEND_URL (e.g. https://<workspace>--biogen-rfdiffusion-api.modal.run) pre-fills the backend so it
// does not have to be typed in on every browser; it is not a secret.
export const DEFAULT_BACKEND_URL =
  normalizeBackendUrl(import.meta.env.VITE_BACKEND_URL ?? '') ||
  'http://localhost:8000/api/v1';

// ---------------------------------------------------------------------------
// Contract with the Modal backend (compute/modal/biogen_modal_app.py)
// ---------------------------------------------------------------------------
export type JobState =
  | 'queued'
  | 'preparing'
  | 'running'
  | 'packaging'
  | 'completed'
  | 'failed'
  | 'cancelled';

const ACTIVE_STATES: string[] = ['queued', 'preparing', 'running', 'packaging'];
export const isJobActive = (state?: string | null): boolean =>
  !!state && ACTIVE_STATES.includes(state);

/** AlphaFold-validation scores. pLDDT is 0-100, RMSD / PAE are in Å. */
export interface DesignMetrics {
  plddt: number | null;
  rmsd: number | null;
  ptm: number | null;
  pae: number | null;
  i_ptm: number | null;
  i_pae: number | null;
  mpnn: number | null;
  n?: number;
}

export interface SampledSequence extends DesignMetrics {
  n: number;
  passed: boolean;
  seq: string;
}

export interface DesignResult {
  index: number;
  rank: number;
  label: string;
  length: number;
  backbone_file: string | null;
  prediction_file: string | null;
  trajectory_file: string | null;
  sequences_file: string | null;
  scores_file: string | null;
  validated: boolean;
  passed: boolean | null;
  metrics: DesignMetrics | null;
  sequence: string | null;
  sequences?: SampledSequence[];
  elapsed?: number;
}

export interface DesignProgress {
  index: number;
  phase: string; // queued | preparing | diffusion | mpnn | af2 | done | failed
  pct: number;
  msg: string;
  step: number;
  total: number;
}

export interface JobStatus {
  job_id: string;
  name: string;
  status: JobState;
  progress_pct: number;
  current_design: number;
  total_designs: number;
  current_step: number;
  total_steps: number;
  status_message: string;
  error_message?: string | null;
  created_at: number;
  updated_at: number;
  runtime_seconds: number;
  output_files: string[];
  generated_pdb_urls: string[];
  has_results_zip: boolean;
  recent_logs: string[];
  designs?: DesignResult[];
  designs_progress?: DesignProgress[];
  warnings?: string[];
  validated?: boolean;
  protocol?: string;
  zip_name?: string;
  /** Echo of the validated request (never includes an uploaded structure). */
  params?: Record<string, unknown>;
}

export interface JobParams {
  name: string;
  pdb: string;
  pdb_content: string;
  contigs: string;
  hotspot: string;
  iterations: number;
  num_designs: number;
  symmetry: string;
  order: number;
  chains?: string;
  add_potential: boolean;
  validate: boolean;
  num_seqs: number;
  num_recycles: number;
  noise_scale: number;
  use_beta_model: boolean;
  use_soluble: boolean;
  preset: string;
}

export interface HealthResponse {
  status: string;
  gpu_available: boolean;
  gpu_name?: string;
  rfdiffusion_ready?: boolean;
  message?: string;
  latency?: number;
}

const api = axios.create({
  baseURL: DEFAULT_BACKEND_URL,
  timeout: 120000,
});

// Intercept requests to dynamically set the baseURL and attach the session token
api.interceptors.request.use((config) => {
  // A request that names its own backend (Settings' Test Connection) must go exactly there. Do not infer that from
  // baseURL === DEFAULT_BACKEND_URL: the URL being tested can equal the configured default while the store still holds
  // an older saved URL, and that request would silently be redirected to the stale one.
  if (!(config as { explicitBackend?: boolean }).explicitBackend) {
    const state = useAppStore.getState();
    if (state.backendUrl) {
      config.baseURL = normalizeBackendUrl(state.backendUrl);
    }
  }
  // Public calls that name their own backend (health checks) carry no credentials.
  const auth = useAuthStore.getState();
  if (!(config as { explicitBackend?: boolean }).explicitBackend && isSessionValid(auth) && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${auth.token}`;
  }
  return config;
});

// The backend refused our token (expired, or the server secret changed): end the session so the route guard
// sends the user to the sign-in page. A failed sign-in attempt is not a session problem.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url: string = err?.config?.url ?? '';
    if (err?.response?.status === 401 && !url.includes('/auth/login') && useAuthStore.getState().token) {
      useAuthStore.getState().signOut('Your session has ended. Sign in again.');
    }
    return Promise.reject(err);
  }
);

/** Best human-readable message from a failed request (FastAPI puts it in `detail`). */
export const getErrorMessage = (err: any, fallback: string): string => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail) && detail.length)
    return detail.map((d) => d?.msg).filter(Boolean).join('; ') || fallback;
  return fallback;
};

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  email: string;
}

/** The backend named in VITE_BACKEND_URL, when the app was built/served with one. */
export const CONFIGURED_BACKEND_URL = normalizeBackendUrl(import.meta.env.VITE_BACKEND_URL ?? '');

export const login = async (
  email: string,
  password: string
): Promise<LoginResponse> => {
  // The configured backend wins over a URL saved in the browser, so a stale saved address (an old deployment)
  // can never lock anyone out of signing in.
  const res = await api.post('/auth/login', { email, password }, {
    timeout: 30000,
    ...(CONFIGURED_BACKEND_URL ? { baseURL: CONFIGURED_BACKEND_URL, explicitBackend: true } : {}),
  } as object);
  return res.data;
};

/** Asks the server whether the stored token is genuinely valid (signature, expiry, account). */
export const fetchMe = async (): Promise<{ email: string; expires_at: number }> => {
  const res = await api.get('/auth/me', { timeout: 30000 });
  return res.data;
};

export const checkHealth = async (
  customUrl?: string
): Promise<HealthResponse> => {
  const startTime = performance.now();

  // A cold gateway container needs a few seconds to boot.
  const config: any = { timeout: 25000 };
  if (customUrl) {
    config.baseURL = normalizeBackendUrl(customUrl);
    config.explicitBackend = true;
  }

  const res = await api.get('/health', config);
  const endTime = performance.now();

  return {
    ...res.data,
    latency: Math.round(endTime - startTime),
  };
};

export const submitJob = async (
  jobParams: JobParams
): Promise<{ job_id: string; status: string }> => {
  const res = await api.post('/jobs', jobParams);
  return res.data;
};

export const getJobStatus = async (jobId: string): Promise<JobStatus> => {
  const res = await api.get(`/jobs/${jobId}`);
  return res.data;
};

export const listJobs = async (limit = 30): Promise<JobStatus[]> => {
  const res = await api.get('/jobs', { params: { limit } });
  return res.data;
};

export const cancelJob = async (jobId: string) => {
  const res = await api.post(`/jobs/${jobId}/cancel`);
  return res.data;
};

export const getJobResult = async (
  jobId: string,
  filename: string
): Promise<string> => {
  const res = await api.get(
    `/jobs/${jobId}/results/${encodeURIComponent(filename)}`,
    {
      responseType: 'text',
      // Prevent axios from trying to JSON-parse the PDB text
      transformResponse: [(data) => data],
    }
  );
  return res.data;
};

const saveBlob = (data: any, filename: string) => {
  const url = URL.createObjectURL(new Blob([data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// Download via the API client so the auth header is applied
export const downloadResult = async (
  jobId: string,
  filename: string
): Promise<void> => {
  const res = await api.get(
    `/jobs/${jobId}/results/${encodeURIComponent(filename)}`,
    {
      responseType: 'blob',
    }
  );
  saveBlob(res.data, filename);
};

export const downloadResultsZip = async (
  jobId: string,
  jobName: string
): Promise<void> => {
  const res = await api.get(`/jobs/${jobId}/results_zip`, {
    responseType: 'blob',
  });
  saveBlob(res.data, `${jobName}.result.zip`);
};

export const fetchStructure = async (pdbId: string) => {
  const res = await api.post(`/pdb/fetch`, { pdb_id: pdbId });
  return res.data;
};
