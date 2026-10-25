import { useTranslation } from 'react-i18next';
import { Construction } from 'lucide-react';

interface Props {
  nameKey: string;
}

export function ModuleStub({ nameKey }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <Construction className="h-10 w-10 text-ink-300 dark:text-ink-600" />
      <h2 className="text-lg font-semibold">{t(nameKey)}</h2>
      <p className="text-sm text-ink-400">{t('dashboard.coming_soon')}</p>
    </div>
  );
}
