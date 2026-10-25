import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { useServiceWorkerUpdate } from '@/core/useServiceWorkerUpdate';

export function UpdateBanner() {
  const { t } = useTranslation();
  const { hasUpdate, applyUpdate } = useServiceWorkerUpdate();
  if (!hasUpdate) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 bg-brand-600 px-4 py-2 text-sm text-white shadow-lg">
      <span>{t('update.available')}</span>
      <button className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1 font-medium hover:bg-white/25" onClick={applyUpdate}>
        <RefreshCw className="h-3.5 w-3.5" />
        {t('update.reload')}
      </button>
    </div>
  );
}
