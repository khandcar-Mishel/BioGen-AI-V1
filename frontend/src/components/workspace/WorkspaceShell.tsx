import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Database,
  Grid2X2,
  Folder,
  Clock3,
  Settings2,
  CircleHelp,
  LogOut,
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Cpu,
  RefreshCw,
  Menu,
  X,
  ChartNoAxesCombined,
} from 'lucide-react';
import { BrandMark } from '../BrandMark';
import { useAppStore } from '../../stores/appStore';
import { useAuthStore } from '../../stores/authStore';

const links = [
  { path: '', label: 'RFdiffusion', icon: Activity },
  { path: '/examples', label: 'Examples', icon: Database },
  { path: '/analyze', label: 'Analyze', icon: ChartNoAxesCombined },
  { path: '/results', label: 'Results', icon: Grid2X2 },
  { path: '/projects', label: 'Projects', icon: Folder },
  { path: '/history', label: 'History', icon: Clock3 },
];
const steps = [
  ['Target', 'Structure'],
  ['Design', 'Params'],
  ['Backbone', 'Diffusion'],
  ['Sequence', 'Design'],
  ['Structure', 'Model'],
  ['Results', 'Inspect'],
];

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const { isBackendConnected, checkConnection, jobStatus } = useAppStore();
  const email = useAuthStore((s) => s.email);
  const signOut = () => {
    // the next person on this browser should not inherit this run
    useAppStore.setState({ currentJobId: null, jobStatus: null });
    useAuthStore.getState().signOut();
    navigate('/login', { replace: true });
  };
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const check = async () => {
    setChecking(true);
    const connected = await checkConnection();
    setChecking(false);
    if (!connected) navigate('/rfdiffusion/studio/settings');
  };
  const phases = jobStatus?.designs_progress?.map((d) => d.phase) ?? [];
  const activeStep =
    jobStatus?.status === 'completed'
      ? 5
      : jobStatus?.status === 'running' || jobStatus?.status === 'packaging'
        ? phases.includes('af2')
          ? 4
          : phases.includes('mpnn')
            ? 3
            : 2
        : jobStatus?.status === 'preparing' || jobStatus?.status === 'queued'
          ? 1
          : 0;
  const navLink = (item: (typeof links)[number]) => (
    <NavLink
      key={item.path}
      end
      to={`/rfdiffusion/studio${item.path}`}
      title={item.label}
      onClick={() => setMobileOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-[8px] h-[34px] text-[13px] transition-colors ${collapsed ? 'lg:justify-center px-2' : 'px-2.5'} ${isActive ? 'bg-ws-pale text-ws-dark font-semibold' : 'text-ws-text-sec hover:bg-ws-page font-medium'}`
      }
    >
      <item.icon size={16} className="shrink-0" />
      <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
    </NavLink>
  );
  return (
    <div className="flex h-dvh min-h-[480px] w-full bg-ws-page text-ws-text overflow-hidden font-sans">
      {mobileOpen && (
        <button
          aria-label="Close workspace navigation"
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`${collapsed ? 'lg:w-[58px]' : 'lg:w-[185px]'} ${mobileOpen ? 'flex' : 'hidden lg:flex'} fixed lg:static inset-y-0 left-0 w-[220px] bg-white border-r border-ws-border-light flex-col shrink-0 z-40 transition-[width] duration-200`}
      >
        <div className="p-3 border-b border-ws-border-light flex items-center justify-between gap-1">
          <Link
            to="/"
            className="flex items-center gap-2.5 min-w-0"
            title="BioGen AI home"
          >
            <BrandMark size={34} />
            <span className={collapsed ? 'lg:hidden' : ''}>
              <span className="block font-bold text-[15px] whitespace-nowrap">
                BioGen AI
              </span>
              <span className="block text-[10px] font-semibold text-ws-dark whitespace-nowrap">
                RFdiffusion Studio
              </span>
            </span>
          </Link>
          {!collapsed && (
            <button
              aria-label="Collapse sidebar"
              onClick={() => setCollapsed(true)}
              className="hidden lg:block text-ws-muted"
            >
              <PanelLeftClose size={14} />
            </button>
          )}
          <button
            aria-label="Close menu"
            className="lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <Link
          to="/"
          title="Exit to Platform"
          className={`flex items-center gap-1.5 text-[11px] text-ws-text-sec px-3 py-3 ${collapsed ? 'lg:justify-center' : ''}`}
        >
          <ArrowLeft size={12} />
          <span className={collapsed ? 'lg:hidden' : ''}>Exit to Platform</span>
        </Link>
        <div className="px-2.5 py-1 overflow-y-auto">
          <span
            className={`text-[10px] font-semibold text-ws-muted tracking-wider ml-2 mb-2 block ${collapsed ? 'lg:hidden' : ''}`}
          >
            WORKSPACE
          </span>
          <nav aria-label="Workspace" className="flex flex-col gap-1">
            {links.map(navLink)}
          </nav>
        </div>
        <div className="mt-auto px-2.5 py-3">
          <span
            className={`text-[10px] font-semibold text-ws-muted tracking-wider ml-2 mb-2 block ${collapsed ? 'lg:hidden' : ''}`}
          >
            SYSTEM
          </span>
          <nav aria-label="System" className="flex flex-col gap-1">
            {navLink({ path: '/settings', label: 'Settings', icon: Settings2 })}
            {navLink({ path: '/help', label: 'Help', icon: CircleHelp })}
          </nav>
          {collapsed && (
            <button
              aria-label="Expand sidebar"
              onClick={() => setCollapsed(false)}
              className="hidden lg:flex w-full justify-center py-3 text-ws-muted"
            >
              <PanelLeftOpen size={16} />
            </button>
          )}
        </div>
        <div
          className={`px-4 py-3 border-t border-ws-border-light flex items-center gap-2 text-[10px] text-ws-text-sec ${collapsed ? 'lg:hidden' : ''}`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${isBackendConnected ? 'bg-ws-primary' : 'bg-red-400'}`}
          />
          {isBackendConnected ? 'Backend connected' : 'Backend disconnected'}
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[52px] bg-white border-b border-ws-border-light flex items-center justify-between px-3 sm:px-5 gap-3 shrink-0">
          <button
            aria-label="Open workspace navigation"
            onClick={() => setMobileOpen(true)}
            className="lg:hidden text-ws-text-sec"
          >
            <Menu size={20} />
          </button>
          <div
            className="hidden md:flex flex-1 max-w-[760px] items-center min-w-0 overflow-x-auto"
            aria-label="Design workflow"
          >
            {steps.map(([title, sub], i) => (
              <div key={title} className="flex items-center flex-1 gap-2">
                <span
                  className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${i === activeStep ? 'bg-ws-primary text-white' : 'bg-ws-page text-ws-muted border border-ws-border-light'}`}
                >
                  {i + 1}
                </span>
                <span className="flex flex-col">
                  <span
                    className={`text-[12px] font-semibold leading-none ${i === activeStep ? 'text-ws-text' : 'text-ws-text-sec'}`}
                  >
                    {title}
                  </span>
                  <span className="text-[10px] text-ws-muted mt-0.5">
                    {sub}
                  </span>
                </span>
                {i < steps.length - 1 && (
                  <span className="flex-1 min-w-2 max-w-9 h-px bg-ws-border-light mr-2" />
                )}
              </div>
            ))}
          </div>
          <span className="md:hidden font-semibold text-xs mr-auto">
            RFdiffusion Studio
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <span
              role="status"
              className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-[11px] font-bold ${checking ? 'bg-amber-50 text-amber-700 border-amber-100' : isBackendConnected ? 'bg-green-50 text-green-800 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${checking ? 'bg-amber-500 animate-pulse' : isBackendConnected ? 'bg-green-500' : 'bg-red-500'}`}
              />
              {checking
                ? 'Connecting...'
                : isBackendConnected
                  ? 'Backend Connected'
                  : 'Idle Mode'}
            </span>
            <button
              onClick={check}
              disabled={checking}
              aria-label="Check backend connection"
              className="flex items-center gap-1.5 px-2.5 h-8 bg-ws-primary hover:bg-ws-dark text-white rounded-[7px] text-[11px] font-bold disabled:opacity-60"
            >
              {checking ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <Cpu size={12} />
              )}
              <span className="hidden sm:inline">
                {isBackendConnected ? 'Check connection' : 'Connect GPU'}
              </span>
            </button>
            <button
              type="button"
              onClick={signOut}
              title={email ? `Signed in as ${email}` : 'Sign out'}
              aria-label="Sign out"
              className="flex items-center gap-2 h-8 pl-2.5 pr-2.5 rounded-[7px] border border-ws-border text-[11px] font-semibold text-ws-text-sec hover:bg-ws-page hover:text-ws-text"
            >
              {email && (
                <span className="hidden xl:inline max-w-[160px] truncate font-medium">
                  {email}
                </span>
              )}
              <LogOut size={14} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
            <Link
              to="/rfdiffusion/studio/help"
              aria-label="Workflow help"
              className="hidden sm:block text-ws-muted"
            >
              <CircleHelp size={16} />
            </Link>
          </div>
        </header>
        <main
          className="workspace-main flex-1 min-h-0 overflow-y-auto p-2.5 sm:p-3.5"
          key={pathname === '/rfdiffusion/studio' ? 'design' : 'workspace'}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
