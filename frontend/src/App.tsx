import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  Navigate,
} from 'react-router-dom';
import {
  SquaresFour,
  Folder,
  Hammer,
  Microscope,
  Waves,
  BookOpen,
  Question,
} from '@phosphor-icons/react';
import { DesignView } from './features/DesignView';
import { AnalyzeView } from './features/AnalyzeView';
import { ResultsView } from './features/ResultsView';
import { HistoryView } from './features/HistoryView';
import { SettingsView } from './features/SettingsView';
import { ComingSoon } from './components/ComingSoon';
import { WorkspaceShell } from './components/workspace/WorkspaceShell';
import { useDesignWorkspace } from './features/useDesignWorkspace';
import { RequireAuth } from './features/auth/RequireAuth';
import { lazy, Suspense, useEffect } from 'react';

const LandingPage = lazy(() =>
  import('./features/LandingPage').then((module) => ({
    default: module.LandingPage,
  }))
);

const RFdiffusionLanding = lazy(() =>
  import('./features/RFdiffusionLanding').then((module) => ({
    default: module.RFdiffusionLanding,
  }))
);

const ScreeningLanding = lazy(() =>
  import('./features/ScreeningLanding').then((module) => ({
    default: module.ScreeningLanding,
  }))
);

const MDSimulationLanding = lazy(() =>
  import('./features/MDSimulationLanding').then((module) => ({
    default: module.MDSimulationLanding,
  }))
);

const LoginPage = lazy(() =>
  import('./features/auth/LoginPage').then((module) => ({
    default: module.LoginPage,
  }))
);

const AboutUsPage = lazy(() =>
  import('./features/AboutUsPage').then((module) => ({
    default: module.AboutUsPage,
  }))
);

export default function App() {
  return (
    <BrowserRouter>
      <RouteScrollReset />
      <Suspense
        fallback={
          <div
            className="min-h-screen bg-bg-soft flex items-center justify-center text-text-secondary"
            role="status"
          >
            Loading BioGen AI...
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<LandingPage />} />

          <Route path="/rfdiffusion" element={<RFdiffusionLanding />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/rfdiffusion/studio/*"
            element={
              <RequireAuth>
                <RFdiffusionStudio />
              </RequireAuth>
            }
          />
          <Route path="/rfdiffusion/workspace/*" element={<WorkspaceAlias />} />

          <Route path="/screening" element={<ScreeningLanding />} />
          <Route
            path="/screening/workspace"
            element={
              <ComingSoon
                icon={Microscope}
                eyebrow="Pipeline · Stage 2"
                title="Screening Workspace"
                description="The Screening workspace itself isn't wired up yet — the tools table on the Screening page links out to the real bioinformatics services in the meantime."
                bullets={[
                  'Batch scoring across every design from a completed RFdiffusion job',
                  'Configurable filters: toxicity, allergenicity, stability, solubility',
                  'Rank and shortlist candidates directly from the Results library',
                ]}
              />
            }
          />

          <Route path="/md-simulation" element={<MDSimulationLanding />} />
          <Route
            path="/md-simulation/workspace"
            element={
              <ComingSoon
                icon={Waves}
                eyebrow="Pipeline · Stage 3"
                title="MD Simulation Workspace"
                description="GPU-accelerated molecular dynamics to confirm a designed fold holds up over time, launched straight from an RFdiffusion result."
                bullets={[
                  'OpenMM-based MD, run on the same serverless GPU as RFdiffusion',
                  'RMSD, RMSF, radius of gyration and secondary-structure trajectories',
                  'Trajectory playback inside the same 3D viewer used for results',
                ]}
              />
            }
          />

          <Route
            path="/results"
            element={
              <ComingSoon
                icon={SquaresFour}
                eyebrow="Unified library"
                title="Results Library"
                description="A single, searchable library of every design, sequence and structure produced across RFdiffusion, Screening and MD Simulation — not just the current session."
                bullets={[
                  'Cross-pipeline history, persisted beyond one browser session',
                  'Side-by-side structure comparison and diffing',
                  'One-click export to PDB, FASTA or a shareable report',
                ]}
              />
            }
          />

          <Route path="/about" element={<AboutUsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

/** Marketing links start at the top; hash links keep their section target. */
function RouteScrollReset() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      return;
    }
    const scrollToTarget = () => {
      const target = document.getElementById(hash.slice(1));
      if (!target) return false;
      target.scrollIntoView({ block: 'start', behavior: 'instant' });
      return true;
    };
    if (scrollToTarget()) return;
    // Lazy-loaded pages can render their anchor after the route changes.
    const observer = new MutationObserver(() => {
      if (scrollToTarget()) observer.disconnect();
    });
    observer.observe(document.getElementById('root')!, {
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [pathname, hash]);
  return null;
}

/** The working RFdiffusion studio — Design / Analyze / Results / Settings. */
function RFdiffusionStudio() {
  // No background pings: every request wakes the (billed) Modal gateway, so the backend is only contacted when the
  // person does something. RequireAuth's session check already proves it is reachable, and "Check connection" is manual.
  const design = useDesignWorkspace();

  return (
    <WorkspaceShell>
      <Routes>
        <Route path="/" element={<DesignView design={design} />} />
        <Route path="/analyze" element={<AnalyzeView />} />
        <Route path="/results" element={<ResultsView />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route
          path="/examples"
          element={
            <PlaceholderPage
              icon={<BookOpen size={20} weight="regular" />}
              title="Examples"
              message="A gallery of ready-to-run presets (binder design, motif scaffolding, symmetric oligomers) is coming here. Configure a PDB target and contigs directly in the Design panel for now."
            />
          }
        />
        <Route
          path="/projects"
          element={
            <PlaceholderPage
              icon={<Folder size={20} weight="regular" />}
              title="Projects"
              message="Project workspaces are coming in a future release. All designs you generate stay available under Results."
            />
          }
        />
        <Route path="/history" element={<HistoryView />} />
        <Route
          path="/help"
          element={
            <PlaceholderPage
              icon={<Question size={20} weight="regular" />}
              title="Help"
              message="Docs are on the way. In the meantime, hover the (?) icons next to each field for guidance, or reach out from the About Us page."
            />
          }
        />
        <Route
          path="*"
          element={<Navigate to="/rfdiffusion/studio" replace />}
        />
      </Routes>
    </WorkspaceShell>
  );
}

function WorkspaceAlias() {
  const { pathname, search, hash } = useLocation();
  return (
    <Navigate
      to={
        pathname.replace('/rfdiffusion/workspace', '/rfdiffusion/studio') +
        search +
        hash
      }
      replace
    />
  );
}

function PlaceholderPage({
  icon,
  title,
  message,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="max-w-md text-center bg-white border border-slate-200 rounded-2xl shadow-sm p-10">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
          {icon}
        </div>
        <h2 className="text-lg font-black text-slate-800 mb-2 tracking-tight">
          {title}
        </h2>
        <p className="text-[13px] text-slate-500 font-medium mb-4">{message}</p>
        <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          <Hammer size={12} weight="regular" /> Under construction
        </div>
      </div>
    </div>
  );
}
