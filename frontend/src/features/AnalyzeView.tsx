export function AnalyzeView() {
  return (
    <div className="p-8 bg-white border border-slate-200 rounded-xl shadow-sm h-full overflow-y-auto">
      <h1 className="text-xl font-bold text-slate-800 mb-4">
        DESIGN &amp; VALIDATION PIPELINE
      </h1>
      <p className="text-slate-600 mb-8 text-sm">
        Each run generates de novo backbones, designs sequences for them, and
        checks that those sequences fold back into the designed shape. Every
        design runs on its own GPU, in parallel.
      </p>

      <div className="space-y-4">
        <StageCard
          title="Stage 1: RFdiffusion"
          desc="Generates de novo backbone scaffolds with generative diffusion. Binder, motif-scaffolding, partial-diffusion and symmetric modes are supported."
          status="Active ✓"
          active
        />
        <StageCard
          title="Stage 2: ProteinMPNN"
          desc="Inverse folding: designs plausible amino-acid sequences for each backbone."
          status="Active ✓"
          active
        />
        <StageCard
          title="Stage 3: AlphaFold2"
          desc="Predicts the structure of every designed sequence and compares it with the backbone (self-consistency). Binders use the initial-guess protocol."
          status="Active ✓"
          active
        />
      </div>

      <h2 className="text-sm font-bold text-slate-800 mt-8 mb-2">
        How designs are ranked
      </h2>
      <div className="border border-slate-200 bg-slate-50 p-4 rounded-lg text-xs text-slate-600 space-y-2">
        <p>
          A design <b className="text-emerald-700">passes</b> in-silico
          validation when its best sequence reaches{' '}
          <b>pLDDT ≥ 80</b> and a self-consistency <b>RMSD &lt; 2 Å</b>
          ; binders must also reach an <b>interface PAE &lt; 10 Å</b>. These
          are the success criteria used in the RFdiffusion paper.
        </p>
        <p>
          Passing designs are listed first, then ordered by RMSD (interface PAE
          for binders) and pLDDT. Passing in silico is a strong filter, not a
          guarantee: validate promising designs experimentally.
        </p>
      </div>
    </div>
  );
}

function StageCard({
  title,
  desc,
  status,
  active = false,
}: {
  title: string;
  desc: string;
  status: string;
  active?: boolean;
}) {
  return (
    <div className="border border-slate-200 bg-slate-50 p-4 rounded-lg">
      <div className="flex justify-between items-center mb-1">
        <h3 className="font-bold text-sm text-slate-800">{title}</h3>
        <span
          className={`text-xs font-bold ${active ? 'text-emerald-600' : 'text-slate-500'}`}
        >
          {status}
        </span>
      </div>
      <p className="text-xs text-slate-500">{desc}</p>
    </div>
  );
}
