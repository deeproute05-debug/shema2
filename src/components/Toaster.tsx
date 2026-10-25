import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { useToastStore, type ToastKind } from '@/core/toast';

export function Toaster() {
  const { t } = useTranslation();
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  const icons: Record<ToastKind, typeof CheckCircle2> = {
    success: CheckCircle2,
    error: XCircle,
    info: Info,
  };

  const colors: Record<ToastKind, string> = {
    success: 'border-success-500/30 bg-success-500/10 text-success-700 dark:text-success-500',
    error: 'border-danger-500/30 bg-danger-500/10 text-danger-700 dark:text-danger-500',
    info: 'border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300',
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" role="alert" aria-live="polite">
      {toasts.map((tst) => {
        const Icon = icons[tst.kind];
        return (
          <div
            key={tst.id}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-card ${colors[tst.kind]}`}
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="flex-1 text-sm">{t(tst.message, { defaultValue: tst.message })}</p>
            <button
              onClick={() => dismiss(tst.id)}
              className="shrink-0 rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
