import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Hand,
  MagnifyingGlassPlus,
  ArrowsOut,
  Play,
  Pause,
} from '@phosphor-icons/react';

export type ColorMode = 'spectrum' | 'chain' | 'plddt';

interface ViewerProps {
  pdbData?: string;
  pdbId?: string;
  compact?: boolean;
  /** Drawn as a faint grey backbone under `pdbData` (e.g. the RFdiffusion design under its AF2 prediction). */
  overlayPdb?: string;
  /** Multi-model PDB (noise -> final). Shown as playable frames instead of `pdbData`. */
  trajectoryPdb?: string;
  /** Initial colouring; pLDDT is only offered when the B-factors really are pLDDT. */
  defaultColorBy?: ColorMode;
  hasPlddt?: boolean;
}

type Representation = 'cartoon' | 'surface' | 'stick';

const STYLES: { id: Representation; label: string }[] = [
  { id: 'cartoon', label: 'Cartoon' },
  { id: 'surface', label: 'Surface' },
  { id: 'stick', label: 'Stick' },
];

const COLOR_LABELS: Record<ColorMode, string> = {
  spectrum: 'Rainbow',
  chain: 'Chain',
  plddt: 'pLDDT',
};

// AlphaFold's pLDDT confidence bands.
const PLDDT_BANDS = [
  { color: '#0053D6', label: 'Very high (>90)' },
  { color: '#65CBF3', label: 'High (70–90)' },
  { color: '#FFDB13', label: 'Low (50–70)' },
  { color: '#FF7D45', label: 'Very low (<50)' },
];
const plddtColor = (b: number) =>
  b > 90 ? 0x0053d6 : b > 70 ? 0x65cbf3 : b > 50 ? 0xffdb13 : 0xff7d45;

const CHAIN_COLORS = [
  0x10a875, 0x2f80ed, 0xf2994a, 0x9b51e0, 0xeb5757, 0x20b15a, 0xeab308,
  0x0fb5c4,
];
// A -> first colour, B -> second, ... (case-insensitive; digits wrap around too)
const chainColor = (chain: string) => {
  const i = ((chain || 'A').toUpperCase().charCodeAt(0) - 65) % CHAIN_COLORS.length;
  return CHAIN_COLORS[(i + CHAIN_COLORS.length) % CHAIN_COLORS.length];
};

const FRAME_MS = 110;

/** Colour spec for a 3Dmol style, by mode. */
function colorSpec(mode: ColorMode, extra: Record<string, unknown> = {}) {
  if (mode === 'plddt') return { colorfunc: (a: any) => plddtColor(a.b), ...extra };
  if (mode === 'chain') return { colorfunc: (a: any) => chainColor(a.chain), ...extra };
  return { color: 'spectrum', ...extra };
}

/** Applies a representation + colouring to the live 3Dmol viewer. */
function applyStyle(
  viewer: any,
  w: any,
  rep: Representation,
  mode: ColorMode,
  hasOverlay: boolean
) {
  viewer.removeAllSurfaces();
  // With an overlay, model 0 is the faint reference and model 1 the structure being inspected.
  const main = hasOverlay ? { model: 1 } : {};
  if (hasOverlay) {
    viewer.setStyle(
      { model: 0 },
      { cartoon: { color: '#98A2B3', opacity: 0.4, thickness: 0.4 } }
    );
  }
  if (rep === 'cartoon') {
    viewer.setStyle(main, { cartoon: colorSpec(mode) });
  } else if (rep === 'stick') {
    viewer.setStyle(main, {
      stick:
        mode === 'spectrum'
          ? { radius: 0.16, colorscheme: 'Jmol' }
          : colorSpec(mode, { radius: 0.16 }),
    });
  } else {
    // surface: a translucent envelope over a faint cartoon underneath,
    // for a more cinematic, biologically legible look than a flat solid shell.
    viewer.setStyle(main, { cartoon: colorSpec(mode, { opacity: 0.55 }) });
    try {
      viewer.addSurface(
        w.$3Dmol.SurfaceType.VDW,
        mode === 'spectrum'
          ? { opacity: 0.82, colorscheme: 'whiteCarbon' }
          : colorSpec(mode, { opacity: 0.82 }),
        main
      );
    } catch {
      // Surface generation can fail on huge/odd structures -- fall back to cartoon only.
    }
  }
  viewer.render();
}

export function MolecularViewer({
  pdbData,
  pdbId,
  compact = false,
  overlayPdb,
  trajectoryPdb,
  defaultColorBy = 'spectrum',
  hasPlddt = false,
}: ViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerInstance = useRef<any>(null);
  const [representation, setRepresentation] =
    useState<Representation>('cartoon');
  const [colorMode, setColorMode] = useState<ColorMode>(defaultColorBy);
  const [spinning, setSpinning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [frames, setFrames] = useState(0);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);

  const repRef = useRef(representation);
  const colorRef = useRef(colorMode);
  const overlayRef = useRef(false);
  useEffect(() => {
    repRef.current = representation;
  }, [representation]);
  useEffect(() => {
    colorRef.current = colorMode;
  }, [colorMode]);

  // The parent switching views (e.g. overlay -> backbone) resets the colouring. This must update the ref
  // synchronously and restyle: the viewer is NOT remounted when the files are already cached, and the model
  // effect below (declared after this one, so it sees the new ref) only runs if the structure itself changed.
  useEffect(() => {
    colorRef.current = defaultColorBy;
    setColorMode(defaultColorBy);
    const viewer = viewerInstance.current;
    const w = window as any;
    if (viewer && w.$3Dmol) {
      applyStyle(viewer, w, repRef.current, defaultColorBy, overlayRef.current);
    }
  }, [defaultColorBy]);

  const goToFrame = useCallback((n: number) => {
    const viewer = viewerInstance.current;
    if (!viewer) return;
    setFrame(n);
    const r = viewer.setFrame(n);
    if (r && typeof r.then === 'function') r.then(() => viewer.render());
    else viewer.render();
  }, []);

  useEffect(() => {
    if (!viewerRef.current || !(window as any).$3Dmol) return;
    const w = window as any;

    if (!viewerInstance.current) {
      viewerInstance.current = w.$3Dmol.createViewer(viewerRef.current, {
        backgroundColor: 'white',
      });
    }

    const viewer = viewerInstance.current;
    viewer.clear();
    setLoaded(false);
    setSpinning(false);
    setPlaying(false);
    setFrames(0);
    setFrame(0);
    overlayRef.current = false;

    const onReady = () => {
      applyStyle(
        viewer,
        w,
        repRef.current,
        colorRef.current,
        overlayRef.current
      );
      viewer.zoomTo();
      viewer.render();
      // Fade/scale the canvas in once the structure has actually resolved,
      // instead of an instant pop the moment 3Dmol finishes rendering.
      requestAnimationFrame(() => setLoaded(true));
    };

    if (trajectoryPdb) {
      viewer.addModelsAsFrames(trajectoryPdb, 'pdb');
      const n = viewer.getNumFrames?.() ?? 1;
      setFrames(n);
      // Frame the final design, then park on it; Play replays the denoising from noise.
      if (n > 1) {
        viewer.setFrame(n - 1);
        setFrame(n - 1);
      }
      onReady();
    } else if (pdbData) {
      if (overlayPdb) {
        viewer.addModel(overlayPdb, 'pdb');
        overlayRef.current = true;
      }
      viewer.addModel(pdbData, 'pdb');
      onReady();
    } else if (pdbId) {
      w.$3Dmol.download(`pdb:${pdbId}`, viewer, {}, onReady);
    }
  }, [pdbData, pdbId, overlayPdb, trajectoryPdb]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      viewerInstance.current?.resize();
      viewerInstance.current?.render();
    });
    if (viewerRef.current) observer.observe(viewerRef.current);
    return () => {
      observer.disconnect();
      viewerInstance.current?.spin(false);
      viewerInstance.current?.clear();
    };
  }, []);

  // Denoising playback: noise -> final, stopping on the finished design.
  useEffect(() => {
    if (!playing || frames < 2) return;
    let current = frame >= frames - 1 ? 0 : frame;
    goToFrame(current);
    const timer = setInterval(() => {
      current += 1;
      if (current >= frames) {
        clearInterval(timer);
        setPlaying(false);
        return;
      }
      goToFrame(current);
    }, FRAME_MS);
    return () => clearInterval(timer);
    // `frame` is intentionally read once when playback starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, frames, goToFrame]);

  const handleReset = () => {
    const viewer = viewerInstance.current;
    if (!viewer) return;
    // Animate back to the fitted view instead of snapping instantly.
    viewer.zoomTo({}, 800);
    viewer.render();
  };

  const handleZoom = (factor = 1.25) => {
    const viewer = viewerInstance.current;
    if (!viewer) return;
    viewer.zoom(factor, 500);
    viewer.render();
  };

  const handleToggleSpin = () => {
    const viewer = viewerInstance.current;
    if (!viewer) return;
    const next = !spinning;
    viewer.spin(next ? 'y' : false, 0.6);
    setSpinning(next);
  };

  const restyle = (rep: Representation, mode: ColorMode) => {
    const viewer = viewerInstance.current;
    const w = window as any;
    if (!viewer || !w.$3Dmol) return;
    applyStyle(viewer, w, rep, mode, overlayRef.current);
  };

  const handleRepresentation = (rep: Representation) => {
    setRepresentation(rep);
    restyle(rep, colorMode);
  };

  const handleColor = (mode: ColorMode) => {
    setColorMode(mode);
    restyle(representation, mode);
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch((err) => {
        console.error(
          `Error attempting to enable full-screen mode: ${err.message}`
        );
      });
    } else {
      document.exitFullscreen();
    }
  };

  const isTrajectory = !!trajectoryPdb;
  const colorOptions: ColorMode[] = hasPlddt
    ? ['plddt', 'spectrum', 'chain']
    : ['spectrum', 'chain'];

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative bg-white overflow-hidden"
    >
      <div
        ref={viewerRef}
        className={`w-full transition-all duration-700 ease-out ${compact ? 'h-[calc(100%-42px)]' : 'h-full'}`}
        style={{
          opacity: loaded ? 1 : 0,
          transform: loaded ? 'scale(1)' : 'scale(0.94)',
        }}
      />

      {!loaded && (pdbData || pdbId || trajectoryPdb) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-8 w-8 rounded-full border-2 border-emerald-200 border-t-emerald-500 animate-spin" />
        </div>
      )}

      {/* Representation + colour switchers */}
      <div className="absolute left-4 top-4 z-10 flex flex-col items-start gap-2">
        <div className="flex items-center gap-0.5 bg-white/90 backdrop-blur border border-slate-200 rounded-lg shadow-sm p-1">
          {STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => handleRepresentation(s.id)}
              className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                representation === s.id
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {!compact && !isTrajectory && (
          <div
            className="flex items-center gap-0.5 bg-white/90 backdrop-blur border border-slate-200 rounded-lg shadow-sm p-1"
            role="group"
            aria-label="Colour by"
          >
            {colorOptions.map((c) => (
              <button
                key={c}
                onClick={() => handleColor(c)}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                  colorMode === c
                    ? 'bg-sky-50 text-sky-700'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                {COLOR_LABELS[c]}
              </button>
            ))}
          </div>
        )}
        {!compact && !isTrajectory && colorMode === 'plddt' && (
          <div className="bg-white/90 backdrop-blur border border-slate-200 rounded-lg shadow-sm px-2.5 py-2">
            <p className="text-[10px] font-bold text-slate-600 mb-1">
              AlphaFold2 pLDDT
            </p>
            {PLDDT_BANDS.map((b) => (
              <p
                key={b.label}
                className="flex items-center gap-1.5 text-[10px] text-slate-500"
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ background: b.color }}
                />
                {b.label}
              </p>
            ))}
          </div>
        )}
        {overlayPdb && !isTrajectory && !compact && (
          <p className="flex items-center gap-1.5 text-[10px] text-slate-500 bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-2.5 py-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#98A2B3]" />
            RFdiffusion backbone (grey)
          </p>
        )}
      </div>

      {/* Denoising playback */}
      {isTrajectory && frames > 1 && (
        <div className="absolute left-4 right-20 bottom-12 z-10 flex items-center gap-3 bg-white/90 backdrop-blur border border-slate-200 rounded-lg shadow-sm px-3 py-2">
          <button
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause denoising' : 'Play denoising'}
            className="w-7 h-7 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shrink-0"
          >
            {playing ? (
              <Pause size={14} weight="fill" />
            ) : (
              <Play size={14} weight="fill" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={frames - 1}
            value={frame}
            onChange={(e) => {
              setPlaying(false);
              goToFrame(Number(e.target.value));
            }}
            aria-label="Denoising step"
            className="flex-1 accent-emerald-500"
          />
          <span className="text-[10px] font-mono text-slate-500 w-[84px] text-right">
            {frame === frames - 1
              ? 'final design'
              : `step ${frame + 1}/${frames}`}
          </span>
        </div>
      )}

      {/* Right Floating Toolbar */}
      <div
        className={
          compact
            ? 'absolute bottom-0 inset-x-0 h-[42px] bg-white border-t border-ws-border-light flex items-center justify-center gap-2 z-10'
            : 'absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur border border-slate-200 rounded-xl shadow-sm p-1.5 flex flex-col gap-1 z-10'
        }
      >
        <ToolbarButton
          compact={compact}
          icon={<ArrowClockwise size={18} weight="bold" />}
          label="Spin"
          active={spinning}
          onClick={handleToggleSpin}
        />
        <ToolbarButton
          compact={compact}
          icon={<MagnifyingGlassPlus size={18} weight="bold" />}
          label="Zoom"
          onClick={() => handleZoom()}
        />
        {!compact && <div className="w-8 h-px bg-slate-100 my-1 mx-auto" />}
        <ToolbarButton
          compact={compact}
          icon={<ArrowCounterClockwise size={18} weight="bold" />}
          label="Reset"
          onClick={handleReset}
        />
        <ToolbarButton
          compact={compact}
          icon={<ArrowsOut size={18} weight="bold" />}
          label="Fullscreen"
          onClick={handleFullscreen}
        />
      </div>

      {/* Bottom Left Instructions */}
      <div
        className={`absolute left-3 right-3 flex flex-wrap justify-center gap-2 text-[9px] text-slate-400 font-medium z-10 bg-white/80 backdrop-blur px-2 py-1 rounded ${compact ? 'bottom-12' : 'bottom-4'}`}
      >
        <span className="flex items-center gap-1.5">
          <ArrowClockwise size={12} weight="bold" /> Left: Rotate
        </span>
        <span className="flex items-center gap-1.5">
          <Hand size={12} weight="bold" /> Right: Pan
        </span>
        <span className="flex items-center gap-1.5">
          <MagnifyingGlassPlus size={12} weight="bold" /> Scroll: Zoom
        </span>
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  active,
  onClick,
  compact,
}: {
  compact?: boolean;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`${compact ? 'px-2 h-7 flex-row gap-1 text-[10px]' : 'w-10 h-10 flex-col gap-0.5 text-[9px]'} rounded-lg flex items-center justify-center font-semibold transition ${active ? 'bg-sky-50 text-sky-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
