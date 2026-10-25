import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Loader2, Save, Sparkles } from 'lucide-react';
import { supabase, type Company } from '@/core/supabase';
import { useCanEdit } from '@/core/useCanEdit';
import { companySchema, type CompanyInput } from '@/core/formsValidation';
import { extractDbError } from '@/core/dbErrors';
import { toastError, toastSuccess, toastInfo } from '@/core/toast';
import { useCompanyLoader } from '@/core/useCompanyLoader';

function jsonbToText(val: unknown): string {
  if (Array.isArray(val)) return val.filter((v) => typeof v === 'string').join('\n');
  if (typeof val === 'string') return val;
  return '';
}

function textToJsonb(val: string): string[] {
  return val.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
}

export function CompanyScreen() {
  const { t, i18n } = useTranslation();
  const canEdit = useCanEdit();
  const { company, loading, error, reload } = useCompanyLoader();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CompanyInput | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const editing = form ?? company ?? null;

  const startEdit = () => {
    if (company) {
      setForm({
        name: company.name,
        description: company.description,
        industry: company.industry,
        mission: company.mission,
        size: company.size,
        goals: jsonbToText(company.goals),
        products: jsonbToText(company.products),
        notes: company.notes,
      });
    } else {
      setForm({ name: '', description: '', industry: '', mission: '', size: '', goals: '', products: '', notes: '' });
    }
  };

  const cancelEdit = () => {
    setForm(null);
    setFieldErrors({});
  };

  const save = async () => {
    if (!form) return;
    const parsed = companySchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errs[issue.path[0] as string] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    setSaving(true);
    const prevCompany = company;

    // Convert text fields to jsonb for the DB
    const dbData = {
      name: parsed.data.name,
      description: parsed.data.description,
      industry: parsed.data.industry,
      mission: parsed.data.mission,
      size: parsed.data.size,
      goals: textToJsonb(parsed.data.goals),
      products: textToJsonb(parsed.data.products),
      notes: parsed.data.notes,
    };

    if (prevCompany) {
      const { error } = await supabase
        .from('company')
        .update(dbData)
        .eq('id', 1)
        .select()
        .single();

      if (error) {
        toastError(t(extractDbError(error)));
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase
        .from('company')
        .insert({ id: 1, ...dbData })
        .select()
        .single();

      if (error) {
        toastError(t(extractDbError(error)));
        setSaving(false);
        return;
      }
    }

    toastSuccess(t('company.saved'));
    setForm(null);
    setFieldErrors({});
    setSaving(false);
    void reload();
  };

  const loadDemo = async () => {
    setSaving(true);
    const lang = i18n.language === 'ru' ? 'ru' : 'en';
    const { data, error } = await supabase.rpc('load_demo_data', { p_lang: lang });
    if (error) {
      toastError(t(extractDbError(error)));
      setSaving(false);
      return;
    }
    if (data === 'exists') {
      toastInfo(t('demo.already_exists'));
    } else {
      toastSuccess(t('demo.loaded'));
    }
    setSaving(false);
    void reload();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-ink-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error && !company) {
    return (
      <div className="space-y-4">
        <ErrorState message={error} onRetry={reload} />
      </div>
    );
  }

  const fields: { key: keyof CompanyInput; label: string; multiline?: boolean }[] = [
    { key: 'name', label: t('company.name') },
    { key: 'industry', label: t('company.industry') },
    { key: 'size', label: t('company.size') },
    { key: 'description', label: t('company.description'), multiline: true },
    { key: 'mission', label: t('company.mission'), multiline: true },
    { key: 'goals', label: t('company.goals'), multiline: true },
    { key: 'products', label: t('company.products'), multiline: true },
    { key: 'notes', label: t('company.notes'), multiline: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Building2 className="h-6 w-6 text-brand-600" />
            {t('company.title')}
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t('company.description')}</p>
        </div>
        {canEdit && !form && (
          <div className="flex gap-2">
            {!company && (
              <button onClick={() => void loadDemo()} disabled={saving} className="btn-secondary">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {t('demo.load')}
              </button>
            )}
            <button onClick={startEdit} className="btn-primary">
              {company ? t('common.edit') : t('common.create')}
            </button>
          </div>
        )}
      </div>

      {company === null && !form && !loading && (
        <EmptyState message={t('company.empty')} />
      )}

      {form ? (
        <div className="card space-y-4 p-6">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <label className="label" htmlFor={`co-${f.key}`}>{f.label}</label>
              {f.multiline ? (
                <textarea
                  id={`co-${f.key}`}
                  className="input min-h-[80px]"
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  disabled={saving}
                />
              ) : (
                <input
                  id={`co-${f.key}`}
                  className="input"
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  disabled={saving}
                />
              )}
              {fieldErrors[f.key] && (
                <p className="text-sm text-danger-600">{t(fieldErrors[f.key])}</p>
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={cancelEdit} className="btn-secondary" disabled={saving}>
              {t('common.cancel')}
            </button>
            <button onClick={() => void save()} className="btn-primary" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t('common.save')}
            </button>
          </div>
        </div>
      ) : company ? (
        <div className="card divide-y divide-ink-200 dark:divide-ink-800">
          {fields.map((f) => {
            const val = f.key === 'goals' || f.key === 'products'
              ? jsonbToText(company[f.key as keyof Company])
              : (company[f.key as keyof Company] as string);
            return (
              <div key={f.key} className="px-5 py-3">
                <p className="text-sm font-medium text-ink-500 dark:text-ink-400">{f.label}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-ink-900 dark:text-ink-100">
                  {val || '—'}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="card flex flex-col items-center justify-center py-12 text-center">
      <Building2 className="mb-3 h-10 w-10 text-ink-300" />
      <p className="text-sm text-ink-400">{message}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="card flex flex-col items-center justify-center py-12 text-center">
      <p className="mb-3 text-sm text-danger-600">{message}</p>
      <button onClick={onRetry} className="btn-secondary">{t('common.retry')}</button>
    </div>
  );
}

