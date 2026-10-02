import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { BrandMark } from '../../components/BrandMark';
import { fetchMe } from '../../services/api';
import { isSessionValid, useAuthStore } from '../../stores/authStore';

/**
 * Only renders its children once the server has accepted the stored token.
 *
 * The browser cannot tell a real token from a forged one (anyone can write to localStorage), so the check against
 * /auth/me is what keeps the studio from rendering for a fake session. Data is protected on the server regardless:
 * every API route rejects a token it did not sign.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const expiresAt = useAuthStore((s) => s.expiresAt);
  const location = useLocation();
  const valid = isSessionValid({ token, expiresAt });
  // which token the server has vouched for ('offline' when the server could not be asked)
  const [check, setCheck] = useState<{ token: string; result: 'ok' | 'offline' } | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Sign out at the moment the token expires, not only on the next request.
  useEffect(() => {
    if (!token || !expiresAt) return;
    const ms = Math.min(Math.max(0, expiresAt - Date.now()), 2 ** 31 - 1);
    const timer = setTimeout(
      () => useAuthStore.getState().signOut('Your session has ended. Sign in again.'),
      ms
    );
    return () => clearTimeout(timer);
  }, [token, expiresAt]);

  // a stale token left in storage (browser reopened after expiry): drop it and say why
  useEffect(() => {
    if (token && !valid) useAuthStore.getState().signOut('Your session has ended. Sign in again.');
  }, [token, valid]);

  useEffect(() => {
    if (!token || !valid) return;
    let cancelled = false;
    fetchMe()
      .then(() => !cancelled && setCheck({ token, result: 'ok' }))
      .catch((err) => {
        // 401: the API client has already ended the session, and the redirect below takes over.
        if (!cancelled && err?.response?.status !== 401) setCheck({ token, result: 'offline' });
      });
    return () => {
      cancelled = true;
    };
  }, [token, valid, attempt]);

  if (!valid) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  const verified = check?.token === token ? check.result : null;
  if (verified === 'ok') return <>{children}</>;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#E6EFEA] px-6 text-center text-[#0B2B33]">
      <BrandMark size={40} />
      {verified === 'offline' ? (
        <>
          <p role="alert" className="max-w-[34ch] text-[15px]">
            Can't reach the server to check your session.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setCheck(null);
                setAttempt((n) => n + 1);
              }}
              className="h-10 rounded-md bg-[#0B2B33] px-5 text-[14px] font-semibold text-white hover:bg-[#087A59]"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => useAuthStore.getState().signOut()}
              className="h-10 rounded-md border border-[#B4C7BF] px-5 text-[14px] font-semibold hover:bg-white"
            >
              Sign out
            </button>
          </div>
        </>
      ) : (
        <p role="status" className="flex items-center gap-2 text-[15px] text-[#0B2B33]/70">
          <Loader2 size={16} className="animate-spin" aria-hidden />
          Checking your session…
        </p>
      )}
    </main>
  );
}
