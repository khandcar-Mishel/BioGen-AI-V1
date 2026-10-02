import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  CircleNotch,
  FileZip,
  Copy,
  Check,
  FileText,
} from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { MolecularViewer } from './MolecularViewer';
import { useAppStore } from '../stores/appStore';
import {
  getJobResult,
  downloadResult,
  downloadResultsZip,
  isJobActive,
} from '../services/api';
import type { DesignResult, JobStatus } from '../services/api';

type ViewMode = 'prediction' | 'backbone' | 'overlay' | 'denoise';

const VIEW_LABELS: Record<ViewMode, string> = {
  prediction: 'AF2 prediction',
  backbone: 'Backbone',
  overlay: 'Overlay',
  denoise: 'Denoising',
};

const PASS_HELP =
  'Passes in-silico validation: pLDDT ≥ 80 and self-consistency RMSD < 2 Å (and interface PAE < 10 Å for binders).';

// PDBs are immutable per job, so each file is fetched once per session.
const fileCache = new Map<string, Promise<string>>();
function loadFile(jobId: string, filename: string): Promise<string> {
  const key = `${jobId}/${filename}`;
  let p = fileCache.get(key);
  if (!p) {
    p = getJobResult(jobId, filename).catch((e) => {
      fileCache.delete(key);
      throw e;
    });
    fileCache.set(key, p);
  }
  return p;
}

interface FileState {
  text?: string;
  error?: string;
  loading: boolean;
}

function useResultFile(jobId?: string, filename?: string | null): FileState {
  const key = jobId && filename ? `${jobId}/${filename}` : null;
  const [loaded, setLoaded] = useState<{
    key: string;
    text?: string;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!jobId || !filename || !key) return;
    let cancelled = false;
    loadFile(jobId, filename)
      .then((text) => !cancelled && setLoaded({ key, text }))
      .catch(
        () =>
          !cancelled && setLoaded({ key, error: `Failed to load ${filename}` })
      );
    return () => {
      cancelled = true;
    };
  }, [jobId, filename, key]);
  if (!key) return { loading: false };
  if (loaded?.key === key)
    return { text: loaded.text, error: loaded.error, loading: false };
  return { loading: true };
}

const num = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? '–' : v.toFixed(digits);

/** Designs from the backend, or a metric-less fallback for backends that only list files. */
function designsOf(job: JobStatus): DesignResult[] {
  if (job.designs?.length) return job.designs;
  return (job.output_files || []).map((file, i) => ({
    index: i,
    rank: i + 1,
    label: `Candidate ${i + 1}`,
    length: 0,
    backbone_file: file,
    prediction_file: null,
    trajectory_file: null,
    sequences_file: null,
    scores_file: null,
    validated: false,
    passed: null,
    metrics: null,
    sequence: null,
  }));
}

function Badge({ design }: { design: DesignResult }) {
  if (!design.validated)
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
        Not validated
      </span>
    );
  return design.passed ? (
    <span
      title={PASS_HELP}
      className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700"
    >
      Passes
    </span>
  ) : (
    <span
      title={PASS_HELP}
      className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"
    >
      Below threshold
    </span>
  );
}

export function ResultsView() {
  const { jobStatus } = useAppStore();
  // Remount per job so the selection and view mode reset without effects.
  return <ResultsPanel key={jobStatus?.job_id ?? 'none'} jobStatus={jobStatus} />;
}

function ResultsPanel({ jobStatus }: { jobStatus: JobStatus | null }) {
  const [selected, setSelected] = useState(0);
  const [view, setView] = useState<ViewMode>('prediction');
  const [downloadError, setDownloadError] = useState('');
  const [copied, setCopied] = useState(false);

  const designs = useMemo(
    () => (jobStatus?.status === 'completed' ? designsOf(jobStatus) : []),
    [jobStatus]
  );
  const design: DesignResult | undefined = designs[selected] ?? designs[0];
  const jobId = jobStatus?.job_id;

  const available: Record<ViewMode, boolean> = {
    prediction: !!design?.prediction_file,
    backbone: !!design?.backbone_file,
    overlay: !!design?.prediction_file && !!design?.backbone_file,
    denoise: !!design?.trajectory_file,
  };
  const defaultView: ViewMode = available.prediction
    ? 'prediction'
    : 'backbone';
  const activeView: ViewMode = available[view] ? view : defaultView;

  const pred = useResultFile(
    jobId,
    activeView === 'prediction' || activeView === 'overlay'
      ? design?.prediction_file
      : null
  );
  const back = useResultFile(
    jobId,
    activeView === 'backbone' || activeView === 'overlay'
      ? design?.backbone_file
      : null
  );
  const traj = useResultFile(
    jobId,
    activeView === 'denoise' ? design?.trajectory_file : null
  );
  const current: FileState =
    activeView === 'denoise'
      ? traj
      : activeView === 'backbone'
        ? back
        : activeView === 'overlay'
          ? pred.loading || back.loading
            ? { loading: true }
            : { text: pred.text, error: pred.error || back.error, loading: false }
          : pred;

  const handleDownload = async (file: string | null) => {
    if (!jobStatus || !file) return;
    setDownloadError('');
    try {
      await downloadResult(jobStatus.job_id, file);
    } catch {
      setDownloadError(`Failed to download ${file}`);
    }
  };

  const handleDownloadZip = async () => {
    if (!jobStatus) return;
    setDownloadError('');
    try {
      await downloadResultsZip(jobStatus.job_id, jobStatus.name || 'results');
    } catch {
      setDownloadError('Failed to download the results zip.');
    }
  };

  // ProteinMPNN joins chains with "/". For a binder the target chain(s) keep their native sequence, so only
  // the designed binder (the last chain) is shown and copied.
  const seqChains = design?.sequence ? design.sequence.split('/') : [];
  const shownSequence =
    jobStatus?.protocol === 'binder' && seqChains.length > 1
      ? seqChains[seqChains.length - 1]
      : seqChains.join(' / ');

  const copySequence = async () => {
    if (!shownSequence) return;
    try {
      await navigator.clipboard.writeText(shownSequence.replace(/ \/ /g, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setDownloadError('Clipboard access was denied.');
    }
  };

  const hasResults = designs.length > 0;
  const passes = designs.filter((d) => d.passed).length;
  const validated = designs.some((d) => d.validated);
  const binder = jobStatus?.protocol === 'binder';

  return (
    <div className="min-h-[600px] h-full flex flex-col lg:flex-row gap-3.5">
      <div className="w-full lg:w-[340px] shrink-0 bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col">
        {downloadError && (
          <div className="mb-2 text-[11px] font-bold px-3 py-1.5 rounded-md bg-red-50 text-red-600 border border-red-100">
            {downloadError}
          </div>
        )}

        {hasResults && jobStatus ? (
          <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">
                RANKED DESIGNS
              </h2>
              {jobStatus.has_results_zip && (
                <button
                  onClick={handleDownloadZip}
                  title="Download all results as zip"
                  className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 border border-emerald-200 hover:border-emerald-300 rounded-md px-2 py-1 transition"
                >
                  <FileZip size={13} weight="regular" /> Download all
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 -mt-1 mb-1">
              {validated
                ? `${passes}/${designs.length} pass in-silico validation · best first`
                : 'Backbones only: turn on validation to score designs'}
            </p>
            {jobStatus.warnings?.map((w) => (
              <p
                key={w}
                className="text-[11px] rounded-md bg-amber-50 border border-amber-100 text-amber-700 px-2 py-1.5"
              >
                {w}
              </p>
            ))}
            {designs.map((d, idx) => (
              <div
                key={d.index}
                onClick={() => setSelected(idx)}
                className={`p-3 border rounded-md cursor-pointer transition ${
                  selected === idx
                    ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200'
                    : 'border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <span className="text-slate-400 font-mono text-xs">
                        #{d.rank}
                      </span>
                      {d.label}
                      <Badge design={d} />
                    </p>
                    {d.metrics ? (
                      <p className="text-[11px] text-slate-500 mt-1 font-mono">
                        pLDDT {num(d.metrics.plddt)} · RMSD{' '}
                        {num(d.metrics.rmsd, 2)} Å
                        {binder && d.metrics.i_pae !== null
                          ? ` · iPAE ${num(d.metrics.i_pae)} Å`
                          : ''}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-500 mt-1">
                        {d.backbone_file}
                      </p>
                    )}
                    {d.length > 0 && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {d.length} residues
                      </p>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(d.prediction_file || d.backbone_file);
                    }}
                    title="Download PDB"
                    className="text-slate-400 hover:text-emerald-600 transition shrink-0"
                  >
                    <Download size={16} weight="regular" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold text-slate-800 mb-2">
              RANKED DESIGNS
            </h2>
            {jobStatus && isJobActive(jobStatus.status) ? (
              <p className="text-xs text-slate-500 mb-4">
                A run is in progress ({Math.round(jobStatus.progress_pct)}%).
                Results appear here when it finishes.{' '}
                <Link
                  to="/rfdiffusion/studio"
                  className="text-emerald-600 font-semibold"
                >
                  Watch progress →
                </Link>
              </p>
            ) : jobStatus?.status === 'failed' ? (
              <p className="text-xs text-red-600 mb-4">
                The last run failed: {jobStatus.error_message || 'unknown error'}
              </p>
            ) : (
              <p className="text-xs text-slate-500 mb-4">
                No designs generated yet. Click 'Generate' in the Design
                workspace, or open an earlier run from History.
              </p>
            )}
            <div className="flex-1 border border-slate-200 rounded-md bg-slate-50 p-2 flex flex-col items-center justify-center text-slate-400">
              Empty Gallery
            </div>
          </>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-3.5">
        <div className="flex-1 min-h-[460px] bg-white border border-ws-border rounded-[14px] shadow-sm flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="min-w-0">
              <h3 className="font-bold text-slate-800 text-[13px] truncate">
                {design ? design.label : 'No result selected'}
              </h3>
              {jobStatus && (
                <p className="text-[11px] text-slate-500 truncate">
                  Job: {jobStatus.name} · {jobStatus.status_message}
                </p>
              )}
            </div>
            {design && (
              <div
                className="flex items-center gap-0.5 bg-slate-50 border border-slate-200 rounded-lg p-0.5"
                role="tablist"
                aria-label="View"
              >
                {(Object.keys(VIEW_LABELS) as ViewMode[]).map((m) => (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={activeView === m}
                    disabled={!available[m]}
                    onClick={() => setView(m)}
                    title={
                      available[m]
                        ? undefined
                        : m === 'denoise'
                          ? 'No denoising trajectory for this design'
                          : 'Turn on AlphaFold validation to get predictions'
                    }
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      activeView === m
                        ? 'bg-white text-emerald-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {VIEW_LABELS[m]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 bg-white relative">
            {design ? (
              current.error ? (
                <div className="absolute inset-0 flex items-center justify-center text-red-500 text-sm font-medium">
                  {current.error}
                </div>
              ) : current.text ? (
                activeView === 'denoise' ? (
                  <MolecularViewer trajectoryPdb={current.text} />
                ) : activeView === 'overlay' ? (
                  <MolecularViewer
                    pdbData={pred.text}
                    overlayPdb={back.text}
                    defaultColorBy="plddt"
                    hasPlddt
                  />
                ) : activeView === 'prediction' ? (
                  <MolecularViewer
                    pdbData={current.text}
                    defaultColorBy="plddt"
                    hasPlddt
                  />
                ) : (
                  <MolecularViewer pdbData={current.text} />
                )
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm font-medium">
                  <CircleNotch
                    size={18}
                    weight="regular"
                    className="animate-spin mr-2"
                  />{' '}
                  Loading structure...
                </div>
              )
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                Result Viewer Placeholder
              </div>
            )}
          </div>
        </div>

        {design && design.validated && design.metrics && (
          <div className="bg-white border border-ws-border rounded-[14px] shadow-sm p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="font-bold text-slate-800 text-[13px] flex items-center gap-2">
                {binder && seqChains.length > 1
                  ? 'Designed binder sequence'
                  : 'Designed sequence'}{' '}
                <Badge design={design} />
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={copySequence}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 border border-slate-200 hover:border-slate-300 rounded-md px-2 py-1"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => handleDownload(design.sequences_file)}
                  disabled={!design.sequences_file}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 border border-slate-200 hover:border-slate-300 rounded-md px-2 py-1 disabled:opacity-40"
                >
                  <FileText size={12} /> FASTA
                </button>
                <button
                  onClick={() => handleDownload(design.backbone_file)}
                  disabled={!design.backbone_file}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 border border-slate-200 hover:border-slate-300 rounded-md px-2 py-1 disabled:opacity-40"
                >
                  <Download size={12} /> Backbone
                </button>
              </div>
            </div>
            <p className="font-mono text-[11px] leading-relaxed break-all text-slate-700 bg-slate-50 border border-slate-100 rounded-md p-2.5">
              {shownSequence}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5 text-[11px] text-slate-500">
              <span>
                pLDDT <b className="text-slate-700">{num(design.metrics.plddt)}</b>
              </span>
              <span>
                RMSD <b className="text-slate-700">{num(design.metrics.rmsd, 2)} Å</b>
              </span>
              {design.metrics.ptm !== null && (
                <span>
                  pTM <b className="text-slate-700">{num(design.metrics.ptm, 2)}</b>
                </span>
              )}
              {design.metrics.i_pae !== null && (
                <span>
                  interface PAE{' '}
                  <b className="text-slate-700">{num(design.metrics.i_pae)} Å</b>
                </span>
              )}
              <span>
                ProteinMPNN score{' '}
                <b className="text-slate-700">{num(design.metrics.mpnn, 2)}</b>
              </span>
            </div>
            {design.sequences && design.sequences.length > 1 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[12px] font-semibold text-slate-500 select-none">
                  All {design.sequences.length} sampled sequences (best by{' '}
                  {binder ? 'interface PAE' : 'RMSD'} is kept)
                </summary>
                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-[11px] font-mono">
                    <thead>
                      <tr className="text-left text-slate-400">
                        <th className="py-1 pr-3">#</th>
                        <th className="pr-3">pLDDT</th>
                        <th className="pr-3">RMSD</th>
                        {binder && <th className="pr-3">iPAE</th>}
                        <th className="pr-3">MPNN</th>
                        <th>Pass</th>
                      </tr>
                    </thead>
                    <tbody>
                      {design.sequences.map((s) => (
                        <tr
                          key={s.n}
                          className={
                            s.n === design.metrics?.n
                              ? 'bg-emerald-50 text-slate-800'
                              : 'text-slate-600'
                          }
                        >
                          <td className="py-1 pr-3">{s.n + 1}</td>
                          <td className="pr-3">{num(s.plddt)}</td>
                          <td className="pr-3">{num(s.rmsd, 2)}</td>
                          {binder && <td className="pr-3">{num(s.i_pae)}</td>}
                          <td className="pr-3">{num(s.mpnn, 2)}</td>
                          <td>{s.passed ? '✓' : '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
