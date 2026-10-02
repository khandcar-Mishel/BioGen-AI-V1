import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock3, Inbox, Loader2, RefreshCw } from 'lucide-react';
import {
  getErrorMessage,
  getJobStatus,
  isJobActive,
  listJobs,
} from '../services/api';
import type { JobStatus } from '../services/api';
import { useAppStore } from '../stores/appStore';

const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
  cancelled: 'bg-slate-100 text-slate-600',
};

const timeAgo = (epochSeconds: number) => {
  const s = Math.max(0, Date.now() / 1000 - epochSeconds);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(epochSeconds * 1000).toLocaleDateString();
};

const duration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  return m >= 1 ? `${m} min ${Math.round(seconds % 60)} s` : `${Math.round(seconds)} s`;
};

/** Earlier runs from the backend. Jobs live there, so this works across browsers and sessions. */
export function HistoryView() {
  const { setCurrentJobId, setJobStatus, currentJobId, isBackendConnected } =
    useAppStore();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobStatus[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setJobs(await listJobs());
      setError('');
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          'Could not load runs. Check the connection in Settings.'
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = () => {
    setLoading(true);
    void load();
  };

  const open = async (job: JobStatus) => {
    setOpening(job.job_id);
    try {
      // The list omits per-sequence tables; fetch the full record.
      const full = await getJobStatus(job.job_id);
      setCurrentJobId(full.job_id);
      setJobStatus(full);
      navigate(
        isJobActive(full.status)
          ? '/rfdiffusion/studio'
          : '/rfdiffusion/studio/results'
      );
    } catch (err) {
      setError(getErrorMessage(err, 'Could not open that run.'));
      setOpening(null);
    }
  };

  return (
    <div className="max-w-[980px] mx-auto bg-white border border-ws-border rounded-[14px] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-ws-border-light">
        <div>
          <h1 className="flex items-center gap-2 text-[14px] font-bold text-ws-text">
            <Clock3 size={15} className="text-ws-primary" /> Run history
          </h1>
          <p className="text-[11px] text-ws-text-sec mt-0.5">
            Runs are kept on the backend for about a week of inactivity.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold border border-[#D9DEE7] rounded-[6px] hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <p role="alert" className="m-4 rounded-lg bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {jobs === null && loading ? (
        <p className="flex items-center justify-center gap-2 py-10 text-[12px] text-ws-muted">
          <Loader2 size={14} className="animate-spin" /> Loading runs…
        </p>
      ) : jobs && jobs.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-10 text-[12px] text-ws-muted">
          <Inbox size={18} />
          {isBackendConnected
            ? 'No runs yet. Generate a structure to see it here.'
            : 'Connect the backend in Settings to see your runs.'}
        </p>
      ) : (
        <ul className="divide-y divide-ws-border-light">
          {(jobs ?? []).map((job) => {
            const designs = job.designs ?? [];
            const passed = designs.filter((d) => d.passed).length;
            const best = designs[0]?.metrics;
            return (
              <li key={job.job_id}>
                <button
                  onClick={() => open(job)}
                  disabled={opening !== null}
                  className={`w-full text-left px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-ws-page disabled:opacity-70 ${currentJobId === job.job_id ? 'bg-ws-pale-subtle' : ''}`}
                >
                  <span className="min-w-[160px] flex-1">
                    <span className="block text-[13px] font-semibold text-ws-text truncate">
                      {job.name}
                    </span>
                    <span className="block text-[11px] text-ws-text-sec">
                      {timeAgo(job.created_at)} ·{' '}
                      {job.params ? `contigs ${String(job.params.contigs || '—')}` : ''}
                    </span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${STATUS_STYLE[job.status] ?? 'bg-amber-50 text-amber-700'}`}
                  >
                    {job.status}
                  </span>
                  <span className="text-[11px] text-ws-text-sec w-[150px]">
                    {job.status === 'completed'
                      ? `${designs.length}/${job.total_designs} designs${job.validated ? ` · ${passed} pass` : ''}`
                      : isJobActive(job.status)
                        ? `${Math.round(job.progress_pct)}% · ${job.total_designs} designs`
                        : `${job.total_designs} designs`}
                  </span>
                  <span className="text-[11px] font-mono text-ws-text-sec w-[130px]">
                    {best
                      ? `pLDDT ${best.plddt?.toFixed(0) ?? '–'} · ${best.rmsd?.toFixed(1) ?? '–'} Å`
                      : ''}
                  </span>
                  <span className="text-[11px] text-ws-muted w-[70px] text-right">
                    {job.runtime_seconds || job.updated_at
                      ? duration(
                          job.runtime_seconds ||
                            Math.max(0, job.updated_at - job.created_at)
                        )
                      : ''}
                  </span>
                  {opening === job.job_id && (
                    <Loader2 size={13} className="animate-spin text-ws-primary" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
