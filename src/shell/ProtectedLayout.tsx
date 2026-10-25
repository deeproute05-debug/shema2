import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut, LayoutDashboard, Settings, Boxes, Sun, Moon, UserCircle, Building2, Network, Users, Workflow } from 'lucide-react';
import { useAuthStore } from '@/core/authStore';
import { useTheme } from '@/core/theme';
import { eventBus, EVENTS } from '@/core/eventBus';

export type ShellView = 'dashboard' | 'company' | 'departments' | 'employees' | 'schema' | 'settings' | 'modules';

interface Props {
  view: ShellView;
  onNavigate: (view: ShellView) => void;
  children: ReactNode;
}

export function ProtectedLayout({ view, onNavigate, children }: Props) {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    const off = eventBus.on(EVENTS.languageChanged, (lang) => {
      void i18n.changeLanguage(lang as string);
    });
    return off;
  }, [i18n]);

  useEffect(() => {
    if (user?.profile.language) void i18n.changeLanguage(user.profile.language);
  }, [user?.profile.language, i18n]);

  if (!user) return null;

  const navItems: { id: ShellView; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { id: 'company', label: t('nav.company'), icon: Building2 },
    { id: 'departments', label: t('nav.departments'), icon: Network },
    { id: 'employees', label: t('nav.employees'), icon: Users },
    { id: 'schema', label: t('nav.schema'), icon: Workflow },
    { id: 'modules', label: t('nav.modules'), icon: Boxes },
    { id: 'settings', label: t('nav.settings'), icon: Settings },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-100">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/80 backdrop-blur dark:border-ink-800 dark:bg-ink-900/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:gap-4 sm:px-4">
          <div className="flex shrink-0 items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Boxes className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">{t('app.name')}</span>
          </div>

          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3 ${
                    active
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                      : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden md:inline">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={toggle}
              className="btn-ghost h-9 w-9 p-0"
              aria-label={t('settings.theme')}
              title={t('settings.theme')}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="hidden items-center gap-2 rounded-lg bg-ink-100 px-2.5 py-1.5 text-sm dark:bg-ink-800 md:flex">
              <UserCircle className="h-4 w-4 text-ink-400" />
              <span className="text-ink-600 dark:text-ink-300">{user.email}</span>
              <span className="rounded bg-brand-100 px-1.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900/50 dark:text-brand-200">
                {t(`roles.${user.profile.role}`)}
              </span>
            </div>
            <button onClick={() => void signOut()} className="btn-ghost h-9 w-9 p-0" aria-label={t('auth.sign_out')} title={t('auth.sign_out')}>
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
