import type { ReactNode } from 'react';
import {
  CircleHelp,
  ChevronDown,
  RotateCcw,
  Play,
  Loader2,
} from 'lucide-react';
import type { DesignWorkspace } from '../../features/useDesignWorkspace';
import { PRESETS } from '../../features/useDesignWorkspace';

const inputCls =
  'h-[32px] px-2.5 border border-[#D9DEE7] rounded-[6px] text-[13px] font-medium focus:outline-none focus:border-ws-primary focus:ring-1 focus:ring-ws-primary/20 w-full';
const selectCls =
  'h-[32px] px-2.5 border border-[#D9DEE7] rounded-[6px] text-[12px] font-medium focus:outline-none focus:border-ws-primary focus:ring-1 focus:ring-ws-primary/20 w-full appearance-none bg-white cursor-pointer';

function Field({
  id,
  label,
  help,
  optional,
  children,
  note,
}: {
  id: string;
  label: string;
  help?: string;
  optional?: boolean;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-[12px] font-semibold text-ws-text">
          {label}{' '}
          {optional && (
            <span className="font-normal text-ws-muted">(optional)</span>
          )}
        </label>
        {help && (
          <span title={help} className="text-ws-muted cursor-help">
            <CircleHelp size={12} />
          </span>
        )}
      </div>
      {children}
      {note}
    </div>
  );
}

function Select({
  id,
  value,
  onChange,
  children,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectCls}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ws-muted pointer-events-none"
      />
    </div>
  );
}

/** Light-weight read of the contigs, only to explain likely mistakes before a run is submitted. */
function readContigs(contigs: string) {
  const heads = contigs
    .replace(/[,:]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((token) => token.split('/'))
    .map((segment) => segment.split('-')[0]);
  return {
    hasFreeLength: heads.some((h) => /^\d+$/.test(h) && h !== '0'),
    targetChains: [...new Set(heads.filter((h) => /^[A-Za-z]/.test(h)).map((h) => h[0]))],
  };
}

export function DesignParametersCard({ d }: { d: DesignWorkspace }) {
  const looksLikeBinder =
    d.targetMode !== 'none' &&
    d.contigs.includes(':') &&
    /^[A-Za-z]/.test(d.contigs);
  const { hasFreeLength, targetChains } = readContigs(d.contigs);
  const partialMode = d.targetMode !== 'none' && !hasFreeLength;
  const hotspotChains = [
    ...new Set(
      d.hotspots
        .split(',')
        .map((h) => h.trim()[0])
        .filter(Boolean)
    ),
  ];
  const badHotspotChains = hotspotChains.filter((c) => !targetChains.includes(c));
  const hotspotProblem = !d.hotspots.trim()
    ? ''
    : d.targetMode === 'none' || !hasFreeLength
      ? 'Hotspots only apply to binder design: Contigs needs a target chain plus a free length, e.g. E6-155:70-100.'
      : badHotspotChains.length
        ? `Hotspot chain ${badHotspotChains.join(', ')} is not in Contigs (target chain: ${targetChains.join(', ') || 'none'}).`
        : '';
  return (
    <div className="bg-ws-card border border-ws-border rounded-[14px] p-3.5 sm:p-4 shadow-[0_1px_4px_rgba(16,24,40,0.03)]">
      {/* Header */}
      <div className="flex items-start gap-2.5 mb-3.5">
        <div className="w-5 h-5 rounded-full bg-ws-primary text-white flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">
          2
        </div>
        <div className="flex flex-col">
          <h3 className="text-[14px] font-[700] text-ws-text leading-tight mb-0.5">
            Design parameters
          </h3>
          <p className="text-[12px] text-ws-text-sec">
            RFdiffusion backbone generation, then ProteinMPNN sequences checked
            by AlphaFold2. Every design runs on its own GPU, in parallel.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3">
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-2.5">
          <Field
            id="designName"
            label="Design name"
            help="Used to name the result files."
          >
            <input
              type="text"
              id="designName"
              value={d.designName}
              onChange={(e) => d.setDesignName(e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field
            id="contigs"
            label="Contigs"
            help="A number is a free length to diffuse (50-70 samples a length per design). A letter+range such as A163-181 keeps those target residues. Separate chains with ':'."
            note={
              partialMode ? (
                <span className="text-[10.5px] text-amber-600">
                  No free length in Contigs, so this is partial diffusion of the
                  whole target (every chain). For a binder add a length, e.g.
                  E6-155:70-100, or limit chains with Input chains.
                </span>
              ) : (
                <span className="text-[10.5px] text-ws-muted">
                  Examples: 100 | A:50-70 | 40/A163-181/40
                </span>
              )
            }
          >
            <input
              type="text"
              id="contigs"
              value={d.contigs}
              onChange={(e) => d.setContigs(e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field
            id="hotspots"
            label="Hotspot residues"
            optional
            help="Target residues the binder should contact. Setting them also switches RFdiffusion to its complex-trained checkpoint."
            note={
              hotspotProblem ? (
                <span className="text-[10.5px] text-amber-600">
                  {hotspotProblem}
                </span>
              ) : looksLikeBinder && !d.hotspots.trim() ? (
                <span className="text-[10.5px] text-amber-600">
                  Binder design works best with hotspots, e.g. E64,E88,E96.
                </span>
              ) : (
                <span className="text-[10.5px] text-ws-muted">
                  e.g. E64,E88,E96
                </span>
              )
            }
          >
            <input
              type="text"
              id="hotspots"
              value={d.hotspots}
              onChange={(e) => d.setHotspots(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-2.5">
          <Field
            id="preset"
            label="Quality preset"
            help="Bundles diffusion steps, sequences per design, AlphaFold recycles and noise scale."
            note={
              <span className="text-[10.5px] text-ws-muted">
                {d.preset === 'custom'
                  ? 'Custom: you changed an advanced setting.'
                  : PRESETS[d.preset].hint}
              </span>
            }
          >
            <Select
              id="preset"
              value={d.preset}
              onChange={(v) => d.applyPreset(v as typeof d.preset)}
            >
              {Object.entries(PRESETS).map(([id, p]) => (
                <option key={id} value={id}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field
              id="iterations"
              label="Iterations"
              help="Diffusion (denoising) steps per design. More steps usually mean better backbones."
            >
              <Select
                id="iterations"
                value={d.iterations}
                onChange={d.setIterations}
              >
                <option value="15">15 steps</option>
                <option value="25">25 steps</option>
                <option value="50">50 steps</option>
                <option value="100">100 steps</option>
                <option value="200">200 steps</option>
              </Select>
            </Field>

            <Field
              id="designs"
              label="Designs count"
              help="Backbones to generate. Each one runs on its own GPU at the same time."
            >
              <Select id="designs" value={d.designs} onChange={d.setDesigns}>
                {['1', '2', '3', '4', '5', '8', '10', '16'].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === '1' ? 'design' : 'designs'}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {d.targetMode !== 'none' && hasFreeLength && parseInt(d.designs) < 8 && (
            <p className="-mt-1 text-[10.5px] leading-snug text-amber-600">
              Binders are hard: in our tests about 1 design in 8 passed AlphaFold
              validation. Generate 8–16 designs to get a few strong candidates.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <Field id="symmetryType" label="Symmetry Type">
              <Select
                id="symmetryType"
                value={d.symmetryType}
                onChange={d.setSymmetryType}
              >
                <option value="none">none</option>
                <option value="cyclic">cyclic</option>
                <option value="dihedral">dihedral</option>
              </Select>
            </Field>

            <Field id="symmetryOrder" label="Symmetry Order">
              <Select
                id="symmetryOrder"
                value={d.symmetryOrder}
                onChange={d.setSymmetryOrder}
              >
                {['1', '2', '3', '4'].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            id="chains"
            label="Input chains"
            optional
            help="Only use these chains of the target structure, e.g. A,B."
          >
            <input
              type="text"
              id="chains"
              value={d.chains}
              onChange={(e) => d.setChains(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <label className="flex items-start gap-2 text-[12px] text-ws-text-sec">
          <input
            type="checkbox"
            checked={d.validate}
            onChange={(e) => d.setValidate(e.target.checked)}
            className="accent-ws-primary mt-0.5"
          />
          <span>
            <b className="text-ws-text">Validate with ProteinMPNN + AlphaFold2</b>{' '}
            (recommended). Designs sequences, predicts their structure, and
            ranks designs by pLDDT and self-consistency RMSD. Roughly doubles
            the run time.
          </span>
        </label>
        <label className="flex items-center gap-2 text-[12px] text-ws-text-sec">
          <input
            type="checkbox"
            checked={d.addPotential}
            onChange={(e) => d.setAddPotential(e.target.checked)}
            className="accent-ws-primary"
          />
          Guiding potentials (discourage inter-chain clashes in symmetric
          designs)
        </label>
        <label className="flex items-center gap-2 text-[12px] text-ws-text-sec">
          <input
            type="checkbox"
            checked={d.useBetaModel}
            onChange={(e) => d.setUseBetaModel(e.target.checked)}
            className="accent-ws-primary"
          />
          Beta-sheet model (try this if you only get helical bundles)
        </label>
        <label className="flex items-center gap-2 text-[12px] text-ws-text-sec">
          <input
            type="checkbox"
            checked={d.useSoluble}
            onChange={(e) => d.setUseSoluble(e.target.checked)}
            className="accent-ws-primary"
          />
          SolubleMPNN (sequence model trained on soluble proteins only)
        </label>
      </div>

      <details className="mt-3 group">
        <summary className="cursor-pointer text-[12px] font-semibold text-ws-text-sec select-none">
          Advanced validation settings
        </summary>
        <div className="grid grid-cols-3 gap-2.5 mt-2.5">
          <Field
            id="numSeqs"
            label="Sequences / design"
            help="ProteinMPNN sequences predicted by AlphaFold2 for each backbone. The best-scoring one is kept."
          >
            <Select
              id="numSeqs"
              value={d.numSeqs}
              onChange={d.setNumSeqs}
            >
              {['1', '2', '4', '8', '16', '32'].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id="numRecycles"
            label="AF2 recycles"
            help="AlphaFold2 recycling iterations. 3 is recommended for binders."
          >
            <Select
              id="numRecycles"
              value={d.numRecycles}
              onChange={d.setNumRecycles}
            >
              {['0', '1', '2', '3', '6'].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id="noiseScale"
            label="Noise scale"
            help="1 = full diversity. Lower values give higher in-silico success at the cost of diversity (RFdiffusion paper)."
          >
            <Select
              id="noiseScale"
              value={d.noiseScale}
              onChange={d.setNoiseScale}
            >
              {['1', '0.75', '0.5', '0.25', '0'].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </details>

      {d.submitError && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700"
        >
          {d.submitError}
        </p>
      )}
      {/* Action Buttons */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-ws-border-light">
        <button
          type="button"
          onClick={d.resetParameters}
          disabled={d.isGenerating}
          className="flex items-center gap-1.5 px-3.5 h-[34px] bg-white border border-[#D9DEE7] rounded-[6px] text-[12px] font-semibold text-ws-text hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <RotateCcw size={13} />
          Reset
        </button>

        <button
          type="button"
          onClick={d.handleGenerate}
          disabled={d.isGenerating}
          className={`flex items-center justify-center gap-1.5 px-6 h-[34px] rounded-[6px] text-[13px] font-bold shadow-xs transition-all active:scale-[0.98] cursor-pointer ${
            d.isGenerating
              ? 'bg-ws-primary/70 text-white cursor-not-allowed'
              : 'bg-ws-primary hover:bg-ws-dark text-white'
          }`}
        >
          {d.isGenerating ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Play size={14} fill="currentColor" />
              Generate Structures
            </>
          )}
        </button>
      </div>
    </div>
  );
}
