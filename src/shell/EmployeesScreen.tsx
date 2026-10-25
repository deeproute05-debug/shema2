import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users, Plus, Pencil, Trash2, Loader2, Briefcase, UserCircle,
} from 'lucide-react';
import { supabase, type Employee, type Department } from '@/core/supabase';
import { useCanEdit } from '@/core/useCanEdit';
import { employeeSchema, type EmployeeInput } from '@/core/formsValidation';
import { extractDbError } from '@/core/dbErrors';
import { toastError, toastSuccess } from '@/core/toast';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export function EmployeesScreen() {
  const { t } = useTranslation();
  const canEdit = useCanEdit();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState<string>('');
  const [showVacanciesOnly, setShowVacanciesOnly] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeInput | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [empRes, deptRes] = await Promise.all([
      supabase.from('employees').select('*').order('full_name'),
      supabase.from('departments').select('*').order('name'),
    ]);
    if (empRes.error) {
      const msg = extractDbError(empRes.error);
      setError(msg);
      toastError(msg);
    } else {
      setEmployees(empRes.data as Employee[]);
    }
    if (deptRes.data) setDepartments(deptRes.data as Department[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const deptName = (id: string | null) =>
    id ? departments.find((d) => d.id === id)?.name ?? '—' : '—';

  const managerName = (id: string | null) => {
    if (!id) return '—';
    const m = employees.find((e) => e.id === id);
    if (!m) return '—';
    return m.is_vacancy ? t('employees.vacancy_label') : m.full_name;
  };

  const filtered = employees.filter((e) => {
    if (showVacanciesOnly && !e.is_vacancy) return false;
    if (filterDept && e.department_id !== filterDept) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.full_name.toLowerCase().includes(q) && !e.position.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const openCreate = () => {
    setEditingEmp(null);
    setForm({
      full_name: '',
      position: '',
      department_id: departments[0]?.id ?? null,
      duties: '',
      responsibility_zone: '',
      manager_id: null,
      project_manager_id: null,
      is_vacancy: false,
    });
    setFieldErrors({});
    setModalOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditingEmp(emp);
    setForm({
      full_name: emp.full_name,
      position: emp.position,
      department_id: emp.department_id,
      duties: emp.duties,
      responsibility_zone: emp.responsibility_zone,
      manager_id: emp.manager_id,
      project_manager_id: emp.project_manager_id,
      is_vacancy: emp.is_vacancy,
    });
    setFieldErrors({});
    setModalOpen(true);
  };

  const save = async () => {
    if (!form) return;
    const parsed = employeeSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errs[issue.path[0] as string] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    setSaving(true);
    const data = parsed.data;
    const prevEmployees = employees;

    // Optimistic update
    if (editingEmp) {
      setEmployees((prev) => prev.map((e) => (e.id === editingEmp.id ? { ...e, ...data } : e)));
    } else {
      const tempId = crypto.randomUUID();
      setPendingIds((prev) => new Set(prev).add(tempId));
      setEmployees((prev) => [...prev, {
        id: tempId, photo_path: '', pos_org: {}, pos_matrix: {}, pos_free: [], updated_at: '',
        ...data,
      }]);
    }

    let result;
    if (editingEmp) {
      result = await supabase.from('employees').update(data).eq('id', editingEmp.id).select().single();
    } else {
      result = await supabase.from('employees').insert(data).select().single();
    }

    if (result.error) {
      setEmployees(prevEmployees); // Rollback
      setPendingIds(new Set());
      toastError(t(extractDbError(result.error)));
      setSaving(false);
      return;
    }

    toastSuccess(editingEmp ? t('employees.updated') : t('employees.created'));
    setModalOpen(false);
    setForm(null);
    setFieldErrors({});
    setSaving(false);
    setPendingIds(new Set());
    void reload();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    const prev = employees;
    setEmployees((prev) => prev.filter((e) => e.id !== deleteTarget.id));

    const { error } = await supabase.from('employees').delete().eq('id', deleteTarget.id);
    if (error) {
      setEmployees(prev); // Rollback
      toastError(t(extractDbError(error)));
      setSaving(false);
      setDeleteTarget(null);
      return;
    }

    toastSuccess(t('employees.deleted'));
    setSaving(false);
    setDeleteTarget(null);
    void reload();
  };

  const formFields: { key: 'position' | 'duties' | 'responsibility_zone'; label: string; multiline?: boolean }[] = [
    { key: 'position', label: t('employees.position') },
    { key: 'duties', label: t('employees.duties'), multiline: true },
    { key: 'responsibility_zone', label: t('employees.responsibility_zone'), multiline: true },
  ];

  // Exclude self and vacancies from manager dropdown
  const managerOptions = employees.filter((e) => {
    if (editingEmp && e.id === editingEmp.id) return false;
    if (e.is_vacancy) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Users className="h-6 w-6 text-brand-600" />
            {t('employees.title')}
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t('employees.subtitle')}</p>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="btn-primary">
            <Plus className="h-4 w-4" />
            {t('employees.add')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-ink-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : error ? (
        <div className="card flex flex-col items-center py-12 text-center">
          <p className="mb-3 text-sm text-danger-600">{t(error)}</p>
          <button onClick={() => void reload()} className="btn-secondary">{t('common.retry')}</button>
        </div>
      ) : employees.length === 0 ? (
        <div className="card flex flex-col items-center py-12 text-center">
          <UserCircle className="mb-3 h-10 w-10 text-ink-300" />
          <p className="text-sm text-ink-400">{t('employees.empty')}</p>
          {canEdit && (
            <button onClick={openCreate} className="btn-primary mt-4">
              <Plus className="h-4 w-4" />
              {t('employees.add')}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="input flex-1 min-w-[200px]"
              placeholder={t('employees.search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="input w-auto"
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
            >
              <option value="">{t('employees.all_departments')}</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <button
              onClick={() => setShowVacanciesOnly((v) => !v)}
              className={showVacanciesOnly ? 'btn-primary' : 'btn-secondary'}
            >
              <Briefcase className="h-4 w-4" />
              {t('employees.vacancies_only')}
            </button>
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-ink-400 py-8">{t('employees.no_results')}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((emp) => (
                <div key={emp.id} className="card p-4">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      emp.is_vacancy
                        ? 'bg-warning-500/20 text-warning-600'
                        : 'bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-200'
                    }`}>
                      {emp.is_vacancy ? <Briefcase className="h-5 w-5" /> : <UserCircle className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {emp.is_vacancy ? t('employees.vacancy_label') : emp.full_name}
                      </p>
                      <p className="truncate text-sm text-ink-500 dark:text-ink-400">{emp.position}</p>
                      <p className="mt-1 truncate text-xs text-ink-400">{deptName(emp.department_id)}</p>
                      {emp.duties && (
                        <p className="mt-1 line-clamp-2 text-xs text-ink-500 dark:text-ink-400">{emp.duties}</p>
                      )}
                      {emp.responsibility_zone && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-ink-400">{t('employees.responsibility_zone')}: {emp.responsibility_zone}</p>
                      )}
                      {!emp.is_vacancy && emp.manager_id && (
                        <p className="mt-0.5 truncate text-xs text-ink-400">
                          {t('employees.manager')}: {managerName(emp.manager_id)}
                        </p>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          onClick={() => openEdit(emp)}
                          disabled={pendingIds.has(emp.id)}
                          className="btn-ghost h-8 w-8 p-0 disabled:opacity-40"
                          aria-label={t('common.edit')}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(emp)}
                          disabled={pendingIds.has(emp.id)}
                          className="btn-ghost h-8 w-8 p-0 text-danger-600 hover:text-danger-700 disabled:opacity-40"
                          aria-label={t('common.delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!canEdit && !loading && (
        <p className="text-xs text-ink-400">{t('common.read_only')}</p>
      )}

      <Modal
        open={modalOpen}
        title={editingEmp ? t('employees.edit') : t('employees.create')}
        onClose={() => setModalOpen(false)}
        size="lg"
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="btn-secondary" disabled={saving}>
              {t('common.cancel')}
            </button>
            <button onClick={() => void save()} className="btn-primary" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('common.save')}
            </button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            {/* Vacancy toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                checked={form.is_vacancy}
                onChange={(e) => setForm({ ...form, is_vacancy: e.target.checked })}
                disabled={saving}
              />
              <span className="text-sm font-medium">{t('employees.is_vacancy')}</span>
            </label>

            {!form.is_vacancy && (
              <div className="space-y-1.5">
                <label className="label" htmlFor="emp-name">{t('employees.full_name')}</label>
                <input
                  id="emp-name"
                  className="input"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  disabled={saving}
                />
                {fieldErrors.full_name && <p className="text-sm text-danger-600">{t(fieldErrors.full_name)}</p>}
              </div>
            )}

            {formFields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <label className="label" htmlFor={`emp-${f.key}`}>{f.label}</label>
                {f.multiline ? (
                  <textarea
                    id={`emp-${f.key}`}
                    className="input min-h-[60px]"
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    disabled={saving}
                  />
                ) : (
                  <input
                    id={`emp-${f.key}`}
                    className="input"
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    disabled={saving}
                  />
                )}
                {fieldErrors[f.key] && <p className="text-sm text-danger-600">{t(fieldErrors[f.key])}</p>}
              </div>
            ))}

            <div className="space-y-1.5">
              <label className="label" htmlFor="emp-dept">{t('employees.department')}</label>
              <select
                id="emp-dept"
                className="input"
                value={form.department_id ?? ''}
                onChange={(e) => setForm({ ...form, department_id: e.target.value || null })}
                disabled={saving}
              >
                <option value="">{t('employees.no_department')}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="label" htmlFor="emp-manager">{t('employees.manager')}</label>
                <select
                  id="emp-manager"
                  className="input"
                  value={form.manager_id ?? ''}
                  onChange={(e) => setForm({ ...form, manager_id: e.target.value || null })}
                  disabled={saving}
                >
                  <option value="">{t('employees.no_manager')}</option>
                  {managerOptions.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="label" htmlFor="emp-pm">{t('employees.project_manager')}</label>
                <select
                  id="emp-pm"
                  className="input"
                  value={form.project_manager_id ?? ''}
                  onChange={(e) => setForm({ ...form, project_manager_id: e.target.value || null })}
                  disabled={saving}
                >
                  <option value="">{t('employees.no_manager')}</option>
                  {managerOptions.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('employees.delete_title')}
        message={t('employees.delete_confirm', {
          name: deleteTarget?.is_vacancy ? t('employees.vacancy_label') : deleteTarget?.full_name,
        })}
        confirmLabel={t('common.delete')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
