import { useState, useEffect, useRef } from 'react';
import {
  submitJob,
  getJobStatus,
  cancelJob,
  getErrorMessage,
  isJobActive,
} from '../services/api';
import { useAppStore } from '../stores/appStore';

export type PresetId = 'fast' | 'balanced' | 'accurate' | 'custom';

/** Quality presets. Values follow the RFdiffusion notebook defaults (balanced) and the paper's guidance. */
export const PRESETS: Record<
  Exclude<PresetId, 'custom'>,
  {
    label: string;
    hint: string;
    iterations: string;
    numSeqs: string;
    numRecycles: string;
    noiseScale: string;
  }
> = {
  fast: {
    label: 'Fast preview',
    hint: '25 diffusion steps, 4 sequences, 1 recycle. A quick sanity check, not for picking winners.',
    iterations: '25',
    numSeqs: '4',
    numRecycles: '1',
    noiseScale: '1',
  },
  balanced: {
    label: 'Balanced',
    hint: 'Notebook defaults: 50 steps, 8 sequences, 3 recycles. Good quality for the cost.',
    iterations: '50',
    numSeqs: '8',
    numRecycles: '3',
    noiseScale: '1',
  },
  accurate: {
    label: 'High accuracy',
    hint: '100 steps, 16 sequences, noise scale 0.5. Higher in-silico success rate, a little less diversity, ~2–3× the time.',
    iterations: '100',
    numSeqs: '16',
    numRecycles: '3',
    noiseScale: '0.5',
  },
};

export function useDesignWorkspace() {
  const [pdbInput, setPdbInput] = useState('');
  const [activePdb, setActivePdb] = useState<string | null>(null);
  const [pdbData, setPdbData] = useState<string | undefined>(undefined);
  const [structureSource, setStructureSource] = useState<
    'none' | 'rcsb' | 'upload'
  >('none');

  const [structureStatus, setStructureStatus] = useState<
    'empty' | 'loading' | 'success' | 'error'
  >('empty');
  const [structureError, setStructureError] = useState('');
  const [structureDetails, setStructureDetails] = useState('');

  const [designName, setDesignName] = useState('biogen_design_01');
  const [contigs, setContigs] = useState('A:50-70');
  const [hotspots, setHotspots] = useState('');

  const [iterations, setIterationsRaw] = useState('50');
  const [designs, setDesigns] = useState('4');
  const [symmetryType, setSymmetryType] = useState('none');
  const [symmetryOrder, setSymmetryOrder] = useState('1');
  const [chains, setChains] = useState('');
  const [addPotential, setAddPotential] = useState(false);
  const [targetMode, setTargetMode] = useState<'pdb' | 'upload' | 'none'>(
    'pdb'
  );

  // ProteinMPNN + AlphaFold2 validation and quality knobs
  const [preset, setPreset] = useState<PresetId>('balanced');
  const [validate, setValidate] = useState(true);
  const [numSeqs, setNumSeqsRaw] = useState('8');
  const [numRecycles, setNumRecyclesRaw] = useState('3');
  const [noiseScale, setNoiseScaleRaw] = useState('1');
  const [useBetaModel, setUseBetaModel] = useState(false);
  const [useSoluble, setUseSoluble] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState('00:00');
  const [jobFailed, setJobFailed] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [pollWarning, setPollWarning] = useState('');

  const { currentJobId, setCurrentJobId, setJobStatus } = useAppStore();

  // Server-side runtime at the last poll, so the timer survives refreshes and resumed jobs.
  const clockRef = useRef({ runtime: 0, at: 0 });

  const markCustom = () => setPreset('custom');
  const setIterations = (v: string) => {
    setIterationsRaw(v);
    markCustom();
  };
  const setNumSeqs = (v: string) => {
    setNumSeqsRaw(v);
    markCustom();
  };
  const setNumRecycles = (v: string) => {
    setNumRecyclesRaw(v);
    markCustom();
  };
  const setNoiseScale = (v: string) => {
    setNoiseScaleRaw(v);
    markCustom();
  };
  const applyPreset = (id: PresetId) => {
    setPreset(id);
    if (id === 'custom') return;
    const p = PRESETS[id];
    setIterationsRaw(p.iterations);
    setNumSeqsRaw(p.numSeqs);
    setNumRecyclesRaw(p.numRecycles);
    setNoiseScaleRaw(p.noiseScale);
  };

  const parsePdbDetails = (text: string) => {
    const chains = new Set<string>();
    let resCount = 0;
    let lastRes = null;
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('ATOM  ')) {
        const chain = line.substring(21, 22).trim();
        const resSeq = line.substring(22, 26).trim();
        if (chain) chains.add(chain);
        const resId = chain + resSeq;
        if (resId !== lastRes) {
          resCount++;
          lastRes = resId;
        }
      }
    }
    const chainStr = chains.size > 0 ? Array.from(chains).join(', ') : 'None';
    return `(Chains: ${chainStr}, ${resCount} residues)`;
  };

  const handleRetrieve = async () => {
    if (!pdbInput.trim()) {
      setStructureError('Enter a PDB ID to load.');
      setStructureStatus('error');
      return;
    }
    setStructureStatus('loading');
    try {
      const res = await fetch(
        `https://files.rcsb.org/download/${pdbInput.trim().toUpperCase()}.pdb`
      );
      if (!res.ok) throw new Error(`Not found in RCSB PDB`);
      const text = await res.text();
      if (!/^ATOM {2}/m.test(text))
        throw new Error('No protein atoms found in this PDB file.');
      setPdbData(text);
      setActivePdb(pdbInput.trim().toUpperCase());
      setStructureSource('rcsb');
      setStructureDetails(parsePdbDetails(text));
      setStructureStatus('success');
      setSubmitError('');
    } catch (e: any) {
      setStructureStatus('error');
      setStructureError(e.message || 'Failed to fetch PDB');
      setActivePdb(null);
      setPdbData(undefined);
      setStructureSource('none');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      setStructureStatus('loading');
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (!/^ATOM {2}/m.test(content)) {
          setStructureStatus('error');
          setStructureError('No protein atoms found in this PDB file.');
          setActivePdb(null);
          setPdbData(undefined);
          setStructureSource('none');
          return;
        }
        setPdbData(content);
        setActivePdb(file.name);
        setStructureSource('upload');
        setStructureDetails(parsePdbDetails(content));
        setStructureStatus('success');
        setSubmitError('');
      };
      reader.onerror = () => {
        setStructureStatus('error');
        setStructureError('Failed to read file');
        setActivePdb(null);
        setPdbData(undefined);
        setStructureSource('none');
      };
      reader.readAsText(file);
    }
  };

  const handleGenerate = async () => {
    if (!activePdb && targetMode !== 'none') {
      setSubmitError(
        'Please load a target structure first, or choose None (De novo).'
      );
      return;
    }
    try {
      setSubmitError('');
      setPollWarning('');
      setJobFailed(false);
      setCancelling(false);
      setCurrentJobId(null);
      setJobStatus(null);
      setIsGenerating(true);
      setProgress(0);
      setElapsed('00:00');
      clockRef.current = { runtime: 0, at: Date.now() };
      const res = await submitJob({
        name: designName,
        pdb:
          targetMode === 'none' || structureSource === 'upload'
            ? ''
            : (activePdb ?? ''),
        pdb_content:
          targetMode !== 'none' && structureSource === 'upload'
            ? pdbData || ''
            : '',
        num_designs: parseInt(designs),
        iterations: parseInt(iterations),
        contigs: contigs,
        hotspot: hotspots,
        symmetry: symmetryType,
        order: parseInt(symmetryOrder),
        add_potential: addPotential,
        validate,
        num_seqs: parseInt(numSeqs),
        num_recycles: parseInt(numRecycles),
        noise_scale: parseFloat(noiseScale),
        use_beta_model: useBetaModel,
        use_soluble: useSoluble,
        preset,
        ...(chains.trim() ? { chains: chains.trim() } : {}),
      });
      setCurrentJobId(res.job_id);
    } catch (err: any) {
      console.error(err);
      setIsGenerating(false);
      setSubmitError(
        err.response
          ? getErrorMessage(
              err,
              `Backend rejected the job (${err.response.status}). Check parameters.`
            )
          : 'Cannot reach the backend. Check the server URL in Settings.'
      );
    }
  };

  const handleCancel = async () => {
    if (!currentJobId) return;
    setCancelling(true);
    try {
      await cancelJob(currentJobId);
    } catch (err: any) {
      setCancelling(false);
      setSubmitError(getErrorMessage(err, 'Could not cancel the job.'));
    }
  };

  // Pick a run back up after a refresh, a revisit, or when History opens one (jobs live on the backend).
  // Runs started from this hook already poll, so those are skipped.
  const generatingRef = useRef(false);
  useEffect(() => {
    generatingRef.current = isGenerating;
  }, [isGenerating]);
  useEffect(() => {
    if (!currentJobId || generatingRef.current) return;
    let cancelled = false;
    getJobStatus(currentJobId)
      .then((status) => {
        if (cancelled) return;
        setJobStatus(status);
        clockRef.current = { runtime: status.runtime_seconds, at: Date.now() };
        if (isJobActive(status.status)) {
          setIsGenerating(true);
          setProgress(status.progress_pct || 0);
        }
      })
      .catch((err) => {
        // The job expired on the backend: forget it. Network errors are ignored (Settings explains those).
        if (!cancelled && err?.response?.status === 404) {
          setCurrentJobId(null);
          setJobStatus(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentJobId, setCurrentJobId, setJobStatus]);

  useEffect(() => {
    let interval: any;
    let timer: any;

    if (currentJobId && isGenerating) {
      const tick = () => {
        const { runtime, at } = clockRef.current;
        const diff = Math.max(
          0,
          Math.floor(runtime + (Date.now() - at) / 1000)
        );
        const mins = String(Math.floor(diff / 60)).padStart(2, '0');
        const secs = String(diff % 60).padStart(2, '0');
        setElapsed(`${mins}:${secs}`);
      };
      tick();
      timer = setInterval(tick, 1000);

      let failures = 0;
      interval = setInterval(async () => {
        if (document.hidden) return;      // nobody is looking: don't wake the backend for a hidden tab
        try {
          const status = await getJobStatus(currentJobId);
          failures = 0;
          setPollWarning('');
          setJobStatus(status);
          clockRef.current = {
            runtime: status.runtime_seconds,
            at: Date.now(),
          };
          setProgress(
            status.status === 'completed' ? 100 : status.progress_pct || 0
          );
          if (!isJobActive(status.status)) {
            setIsGenerating(false);
            setCancelling(false);
            if (status.status === 'failed') setJobFailed(true);
            clearInterval(interval);
            clearInterval(timer);
          }
        } catch (err: any) {
          console.error(err);
          if (err?.response?.status === 404) {
            setIsGenerating(false);
            setJobFailed(true);
            setSubmitError(
              'The backend no longer knows this job (it may have expired). Start a new run.'
            );
            setCurrentJobId(null);
            clearInterval(interval);
            clearInterval(timer);
            return;
          }
          failures += 1;
          if (failures >= 3) {
            setPollWarning(
              'Lost contact with the backend. Your job keeps running on Modal; retrying…'
            );
          }
        }
      }, 2000);
    }
    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [currentJobId, isGenerating, setJobStatus, setCurrentJobId]);

  const clearStructure = () => {
    setActivePdb(null);
    setPdbData(undefined);
    setStructureSource('none');
    setStructureStatus('empty');
    setStructureDetails('');
    setStructureError('');
    setSubmitError('');
  };
  const resetParameters = () => {
    setDesignName('biogen_design_01');
    setContigs('A:50-70');
    setHotspots('');
    setDesigns('4');
    setSymmetryType('none');
    setSymmetryOrder('1');
    setChains('');
    setAddPotential(false);
    setValidate(true);
    setUseBetaModel(false);
    setUseSoluble(false);
    applyPreset('balanced');
    setSubmitError('');
  };
  return {
    pdbInput,
    setPdbInput,
    activePdb,
    pdbData,
    structureSource,
    structureStatus,
    structureError,
    structureDetails,
    designName,
    setDesignName,
    contigs,
    setContigs,
    hotspots,
    setHotspots,
    iterations,
    setIterations,
    designs,
    setDesigns,
    symmetryType,
    setSymmetryType,
    symmetryOrder,
    setSymmetryOrder,
    chains,
    setChains,
    addPotential,
    setAddPotential,
    preset,
    applyPreset,
    validate,
    setValidate,
    numSeqs,
    setNumSeqs,
    numRecycles,
    setNumRecycles,
    noiseScale,
    setNoiseScale,
    useBetaModel,
    setUseBetaModel,
    useSoluble,
    setUseSoluble,
    isGenerating,
    progress,
    elapsed,
    jobFailed,
    submitError,
    cancelling,
    pollWarning,
    handleRetrieve,
    handleFileUpload,
    handleGenerate,
    handleCancel,
    clearStructure,
    resetParameters,
    targetMode,
    setTargetMode,
  };
}
export type DesignWorkspace = ReturnType<typeof useDesignWorkspace>;
