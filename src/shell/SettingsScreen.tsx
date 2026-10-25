import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, Download, Check, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/core/authStore';
import { useTheme } from '@/core/theme';
import { usePwaInstall } from '@/core/usePwaInstall';
import type { Language } from '@/core/supabase';
import { languageSchema } from '@/core/validation';

export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setLanguage = useAuthStore((s) => s.setLanguage);
  const { theme, setTheme } = useTheme();
  const { state, promptInstall } = usePwaInstall();
  const [savedLang, setSavedLang] = useState(false);
  const [langLoading, setLangLoading] = useState(false);

  if (!user) return null;

  const languages: { code: Language; label: string }[] = [
    { code: 'ru', label: t('settings.language_ru') },
    { code: 'en', label: t('settings.language_en') },
    { code: 'ar', label: t('settings.language_ar') },
  ];

  const onLanguageChange = async (code: Language) => {
    const parsed = languageSchema.safeParse(code);
    if (!parsed.success) return;
    setLangLoading(true);
    const { error } = await setLanguage(code);
    setLangLoading(false);
    if (!error) {
      void i18n.changeLanguage(code);
      setSavedLang(true);
      setTimeout(() => setSavedLang(false), 1800);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('settings.appearance')}</h2>

        <div className="space-y-4">
          <div>
            <p className="label mb-2">{t('settings.theme')}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setTheme('light')}
                className={`btn ${theme === 'light' ? 'bg-brand-600 text-white' : 'btn-secondary'}`}
              >
                <Sun className="h-4 w-4" />
                {t('settings.theme_light')}
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`btn ${theme === 'dark' ? 'bg-brand-600 text-white' : 'btn-secondary'}`}
              >
                <Moon className="h-4 w-4" />
                {t('settings.theme_dark')}
              </button>
            </div>
          </div>

          <div>
            <p className="label mb-2">{t('settings.language')}</p>
            <div className="flex flex-wrap gap-2">
              {languages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => onLanguageChange(l.code)}
                  className={`btn ${user.profile.language === l.code ? 'bg-brand-600 text-white' : 'btn-secondary'}`}
                  dir="auto"
                >
                  {langLoading && user.profile.language === l.code ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : savedLang && user.profile.language === l.code ? (
                    <Check className="h-4 w-4" />
                  ) : null}
                  {l.label}
                </button>
              ))}
            </div>
            {savedLang && <p className="mt-2 text-sm text-success-600">{t('settings.saved')}</p>}
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('settings.account')}</h2>
        <div className="space-y-2">
          <p className="label">{t('settings.account_email')}</p>
          <p className="text-ink-800 dark:text-ink-100" dir="ltr">{user.email}</p>
        </div>
      </section>

      {state !== 'unsupported' && state !== 'installed' && (
        <section className="card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{t('settings.install_app')}</h2>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t('settings.install_app_desc')}</p>
            </div>
            <button onClick={() => void promptInstall()} className="btn-primary">
              <Download className="h-4 w-4" />
              {t('settings.install')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
