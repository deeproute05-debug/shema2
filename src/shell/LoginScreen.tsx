import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/core/authStore';
import { loginSchema } from '@/core/validation';

export function LoginScreen() {
  const { t } = useTranslation();
  const signIn = useAuthStore((s) => s.signIn);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldError('login_invalid');
      return;
    }
    await signIn(parsed.data.email, parsed.data.password);
  };

  const showErr = fieldError ?? error;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink-50 via-ink-100 to-brand-50 px-4 dark:from-ink-950 dark:via-ink-900 dark:to-ink-950">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg">
            <LogIn className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            {t('app.name')}
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t('app.tagline')}</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <div className="space-y-1.5">
            <label className="label" htmlFor="email">{t('auth.email')}</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <label className="label" htmlFor="password">{t('auth.password')}</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              dir="ltr"
            />
          </div>

          {showErr && (
            <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-600 dark:text-danger-500">
              {t(`auth.${showErr}`, { defaultValue: t('auth.login_failed') })}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {loading ? t('auth.signing_in') : t('auth.sign_in')}
          </button>

          <p className="pt-2 text-center text-xs text-ink-400 dark:text-ink-500">
            {t('auth.invite_only_hint')}
          </p>
        </form>
      </div>
    </div>
  );
}
