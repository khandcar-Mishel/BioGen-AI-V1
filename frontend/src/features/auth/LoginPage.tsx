import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CircleAlert, Eye, EyeOff, Info, Loader2 } from 'lucide-react';
import { BrandMark } from '../../components/BrandMark';
import { DenoisingField } from './DenoisingField';
import { CONFIGURED_BACKEND_URL, getErrorMessage, login } from '../../services/api';
import { isSessionValid, useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';

const STUDIO = '/rfdiffusion/studio';

/** Only same-site paths, never another origin or the login page itself. */
const safeNext = (raw: string | null) =>
  raw && /^\/(?!\/)/.test(raw) && !raw.startsWith('/login') ? raw : STUDIO;

export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));

  const token = useAuthStore((s) => s.token);
  const expiresAt = useAuthStore((s) => s.expiresAt);
  const notice = useAuthStore((s) => s.notice);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const stepRef = useRef<HTMLElement>(null);

  // the notice is shown once
  useEffect(() => () => useAuthStore.getState().clearNotice(), []);

  if (isSessionValid({ token, expiresAt })) return <Navigate to={next} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await login(email.trim(), password);
      // keep later calls on the server that just accepted the sign-in
      if (CONFIGURED_BACKEND_URL) useAppStore.getState().setBackendUrl(CONFIGURED_BACKEND_URL);
      useAuthStore.getState().setSession(res.access_token, res.email, res.expires_in);
      navigate(next, { replace: true });
    } catch (err: any) {
      setPassword('');
      setError(
        err?.response
          ? getErrorMessage(err, `Sign-in failed (${err.response.status}). Try again.`)
          : "Can't reach the server. Check your connection and try again."
      );
      setSubmitting(false);
    }
  };

  const inputCls =
    'h-11 w-full rounded-md border border-[#C5D3CD] bg-white px-3.5 text-[15px] text-[#0B2B33] placeholder:text-[#8AA098] outline-none transition-colors focus:border-[#10A875] focus:ring-[3px] focus:ring-[#10A875]/20';

  return (
    <main
      className="grid min-h-dvh bg-white text-[#0B2B33] lg:grid-cols-[minmax(0,1.1fr)_minmax(440px,0.9fr)]"
      style={{ fontFamily: "'DM Sans', ui-sans-serif, system-ui, sans-serif" }}
    >
      {/* figure plate */}
      <section className="relative flex flex-col bg-[#E6EFEA] px-6 py-7 sm:px-10 lg:min-h-dvh lg:px-14 lg:py-12">
        <Link
          to="/"
          aria-label="BioGen AI home"
          className="flex w-fit items-center gap-3 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-[#10A875]/40"
        >
          <BrandMark size={36} />
          <span className="text-[17px] font-semibold tracking-tight">BioGen AI</span>
        </Link>

        <h1 className="font-display mt-8 max-w-[13ch] text-[40px] leading-[1.03] tracking-[-0.02em] sm:text-[52px] lg:mt-14 lg:text-[64px]">
          From noise to a folded protein.
        </h1>
        <p className="mt-4 max-w-[40ch] text-[15.5px] leading-relaxed text-[#0B2B33]/70">
          Design new protein structures, check them against AlphaFold2, and
          rank the ones worth taking to the bench.
        </p>

        <figure className="mt-8 flex min-h-[300px] flex-1 flex-col lg:mt-10">
          <div className="relative flex-1 rounded-[3px] border border-[#B4C7BF]">
            <DenoisingField stepRef={stepRef} />
          </div>
          <figcaption className="font-display mt-3 max-w-[60ch] text-[14px] leading-snug text-[#0B2B33]/75">
            <span className="font-medium not-italic text-[#0B2B33]">Fig. 1</span>{' '}
            <i>
              Backbone of a three-helix bundle emerging from noise. Denoising
              step{' '}
              <b ref={stepRef} className="inline-block min-w-[1.4ch] text-right font-medium not-italic tabular-nums">
                0
              </b>{' '}
              of 50.
            </i>
          </figcaption>
        </figure>
      </section>

      {/* sign-in */}
      <section className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-[380px]">
          <Link
            to="/"
            className="mb-10 inline-flex items-center gap-1.5 rounded text-[13.5px] font-medium text-[#0B2B33]/65 outline-none hover:text-[#087A59] focus-visible:ring-[3px] focus-visible:ring-[#10A875]/30"
          >
            <ArrowLeft size={15} aria-hidden />
            Back to home
          </Link>
          <h2 className="font-display text-[34px] leading-tight tracking-[-0.01em]">Sign in</h2>
          <p className="mt-2 text-[15px] text-[#0B2B33]/65">
            Use the account from your workspace admin.
          </p>

          {notice && !error && (
            <p role="status" className="mt-6 flex items-start gap-2 rounded-md bg-[#EAF3FB] px-3.5 py-2.5 text-[13.5px] text-[#1B4B72]">
              <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
              {notice}
            </p>
          )}

          <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-[13.5px] font-semibold">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoFocus
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!error}
                placeholder="you@lab.org"
                className={inputCls}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-[13.5px] font-semibold">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!error}
                  aria-describedby={error ? 'login-error' : undefined}
                  className={`${inputCls} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded text-[#5C746C] outline-none hover:text-[#0B2B33] focus-visible:ring-[3px] focus-visible:ring-[#10A875]/30"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <p id="login-error" role="alert" className="flex items-start gap-2 text-[13.5px] font-medium text-[#B42318]">
                <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex h-11 items-center justify-center gap-2 rounded-md bg-[#0B2B33] text-[15px] font-semibold text-white outline-none transition-colors hover:bg-[#087A59] focus-visible:ring-[3px] focus-visible:ring-[#10A875]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? (
                <>
                  <Loader2 size={17} className="animate-spin" aria-hidden />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

        </div>
      </section>
    </main>
  );
}
