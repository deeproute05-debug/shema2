import { useTranslation } from 'react-i18next';
import { ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import { useModules, MODULE_MANIFESTS } from '@/core/registry';
import { useAuthStore } from '@/core/authStore';

export function ModulesScreen() {
  const { t } = useTranslation();
  const { modules, loading, toggle } = useModules();
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.profile.role === 'owner' || user?.profile.role === 'editor';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('modules.title')}</h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t('modules.description')}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-ink-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : MODULE_MANIFESTS.length === 0 ? (
        <p className="text-sm text-ink-400">{t('modules.no_modules')}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {MODULE_MANIFESTS.map((m) => {
            const enabled = modules[m.id] ?? m.defaultEnabled ?? true;
            return (
              <div key={m.id} className="card flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{t(m.nameKey)}</p>
                  <p className={`mt-0.5 text-sm ${enabled ? 'text-success-600' : 'text-ink-400'}`}>
                    {enabled ? t('modules.enabled') : t('modules.disabled')}
                  </p>
                </div>
                <button
                  onClick={() => void toggle(m.id, !enabled)}
                  disabled={!canEdit}
                  className="btn-ghost p-1.5"
                  aria-label={enabled ? t('modules.disabled') : t('modules.enabled')}
                >
                  {enabled ? (
                    <ToggleRight className="h-7 w-7 text-brand-600" />
                  ) : (
                    <ToggleLeft className="h-7 w-7 text-ink-400" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!canEdit && (
        <p className="text-xs text-ink-400">{t('dashboard.role_viewer_desc')}</p>
      )}
    </div>
  );
}
