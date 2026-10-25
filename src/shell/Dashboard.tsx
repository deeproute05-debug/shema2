import { useTranslation } from 'react-i18next';
import { Shield, Pencil, Eye, ArrowRight, Boxes, Building2, Network, Users } from 'lucide-react';
import { useAuthStore } from '@/core/authStore';
import type { ShellView } from './ProtectedLayout';

interface Props {
  onNavigate: (view: ShellView) => void;
}

export function Dashboard({ onNavigate }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  const role = user.profile.role;
  const RoleIcon = role === 'owner' ? Shield : role === 'editor' ? Pencil : Eye;
  const roleDescKey = `dashboard.role_${role}_desc`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
        <p className="mt-1 text-ink-500 dark:text-ink-400">
          {t('dashboard.greeting', { name: user.email.split('@')[0] })}
        </p>
      </div>

      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-200">
            <RoleIcon className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-ink-500 dark:text-ink-400">{t('dashboard.your_role')}</p>
            <p className="text-lg font-semibold">{t(`roles.${role}`)}</p>
            <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{t(roleDescKey)}</p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">
          {t('dashboard.quick_links')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <button
            onClick={() => onNavigate('company')}
            className="card group flex items-center justify-between p-4 text-left transition-shadow hover:shadow-lg"
          >
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-brand-600" />
              <span className="font-medium">{t('nav.company')}</span>
            </div>
            <ArrowRight className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            onClick={() => onNavigate('departments')}
            className="card group flex items-center justify-between p-4 text-left transition-shadow hover:shadow-lg"
          >
            <div className="flex items-center gap-3">
              <Network className="h-5 w-5 text-brand-600" />
              <span className="font-medium">{t('nav.departments')}</span>
            </div>
            <ArrowRight className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            onClick={() => onNavigate('employees')}
            className="card group flex items-center justify-between p-4 text-left transition-shadow hover:shadow-lg"
          >
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-brand-600" />
              <span className="font-medium">{t('nav.employees')}</span>
            </div>
            <ArrowRight className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            onClick={() => onNavigate('schema')}
            className="card group flex items-center justify-between p-4 text-left transition-shadow hover:shadow-lg"
          >
            <div className="flex items-center gap-3">
              <Network className="h-5 w-5 text-brand-600" />
              <span className="font-medium">{t('nav.schema')}</span>
            </div>
            <ArrowRight className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            onClick={() => onNavigate('modules')}
            className="card group flex items-center justify-between p-4 text-left transition-shadow hover:shadow-lg"
          >
            <div className="flex items-center gap-3">
              <Boxes className="h-5 w-5 text-brand-600" />
              <span className="font-medium">{t('nav.modules')}</span>
            </div>
            <ArrowRight className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
