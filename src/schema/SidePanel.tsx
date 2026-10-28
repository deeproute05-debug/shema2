import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, UserCircle, Building2, AlertTriangle, ImageIcon, ArrowRight, Briefcase, Trash2, Pencil, Save } from 'lucide-react';
import type { Department, Employee } from '@/core/supabase';
import { employeeSchema, departmentSchema, type EmployeeInput, type DepartmentInput } from '@/core/formsValidation';
import { getEmployeeProblems, type ProblemType } from './types';

const problemLabels: Record<ProblemType, string> = {
  span_exceeded: 'schema.badge_span_exceeded',
  no_manager: 'schema.badge_no_manager',
  empty_responsibility_zone: 'schema.badge_empty_zone',
};

export type SaveEmployeeResult = { ok: boolean; message?: string };
export type SaveDepartmentResult = SaveEmployeeResult;

export type EmployeePatch = Partial<Pick<Employee, 'full_name' | 'position' | 'duties' | 'responsibility_zone' | 'is_vacancy'>>;
export type DepartmentPatch = Partial<Pick<Department, 'name' | 'responsibility_zone' | 'desired_result' | 'kpis'>>;

interface Props {
  open: boolean;
  onClose: () => void;
  selectedDept: Department | null;
  selectedEmp: Employee | null;
  depts: Department[];
  employees: Employee[];
  onSelectEmp: (id: string) => void;
  onSelectDept: (id: string) => void;
  canEdit?: boolean;
  onRequestDelete?: (kind: 'employee' | 'department', id: string) => void;
  onSaveEmployee?: (id: string, patch: EmployeePatch) => Promise<SaveEmployeeResult>;
  onSaveDepartment?: (id: string, patch: DepartmentPatch) => Promise<SaveDepartmentResult>;
}

export function SidePanel({
  open, onClose, selectedDept, selectedEmp, depts, employees, onSelectEmp, onSelectDept, canEdit, onRequestDelete, onSaveEmployee, onSaveDepartment,
}: Props) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div
      className="fixed right-0 top-0 z-40 h-full w-full max-w-sm overflow-y-auto border-l border-ink-200 bg-white shadow-xl dark:border-ink-800 dark:bg-ink-900"
      dir="ltr"
      style={{ maxWidth: '100vw' }}
    >
      <div className="sticky top-0 flex items-center justify-between border-b border-ink-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-ink-800 dark:bg-ink-900/90">
        <span className="text-sm font-semibold">{t('schema.details')}</span>
        <button onClick={onClose} className="btn-ghost h-9 w-9 p-0" aria-label={t('common.close')}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {selectedDept && !selectedEmp && (
        <DeptDetails
          dept={selectedDept}
          depts={depts}
          employees={employees}
          onSelectEmp={onSelectEmp}
          onSelectDept={onSelectDept}
          canEdit={canEdit}
          onRequestDelete={onRequestDelete}
          onSaveDepartment={onSaveDepartment}
          panelOpen={open}
        />
      )}

      {selectedEmp && (
        <EmpDetails
          emp={selectedEmp}
          depts={depts}
          employees={employees}
          onSelectEmp={onSelectEmp}
          canEdit={canEdit}
          onRequestDelete={onRequestDelete}
          onSaveEmployee={onSaveEmployee}
          panelOpen={open}
        />
      )}
    </div>
  );
}

function DeptDetails({
  dept, depts, employees, onSelectEmp, onSelectDept, canEdit, onRequestDelete, onSaveDepartment, panelOpen,
}: {
  dept: Department;
  depts: Department[];
  employees: Employee[];
  onSelectEmp: (id: string) => void;
  onSelectDept: (id: string) => void;
  canEdit?: boolean;
  onRequestDelete?: (kind: 'employee' | 'department', id: string) => void;
  onSaveDepartment?: (id: string, patch: DepartmentPatch) => Promise<SaveDepartmentResult>;
  panelOpen: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DepartmentInput | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Reset edit mode whenever the selected department changes or the panel closes.
  useEffect(() => {
    setEditing(false);
    setForm(null);
    setFieldErrors({});
    setFormError(null);
    setSaving(false);
  }, [dept.id, panelOpen]);

  const parent = depts.find((d) => d.id === dept.parent_id);
  const children = depts.filter((d) => d.parent_id === dept.id);
  const deptEmps = employees.filter((e) => e.department_id === dept.id);

  const fields: { label: string; value: string }[] = [
    { label: t('departments.name'), value: dept.name },
    { label: t('departments.responsibility_zone'), value: dept.responsibility_zone },
    { label: t('departments.desired_result'), value: dept.desired_result },
    { label: t('departments.kpis'), value: dept.kpis },
  ];

  const startEdit = () => {
    setForm({
      name: dept.name,
      parent_id: dept.parent_id,
      responsibility_zone: dept.responsibility_zone,
      desired_result: dept.desired_result,
      kpis: dept.kpis,
      color: dept.color,
    });
    setFieldErrors({});
    setFormError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setForm(null);
    setFieldErrors({});
    setFormError(null);
  };

  const handleSave = async () => {
    if (!form || !onSaveDepartment) return;
    const parsed = departmentSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errs[issue.path[0] as string] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    // Send only the editable fields that changed.
    const patch: DepartmentPatch = {};
    if (parsed.data.name !== dept.name) patch.name = parsed.data.name;
    if (parsed.data.responsibility_zone !== dept.responsibility_zone) patch.responsibility_zone = parsed.data.responsibility_zone;
    if (parsed.data.desired_result !== dept.desired_result) patch.desired_result = parsed.data.desired_result;
    if (parsed.data.kpis !== dept.kpis) patch.kpis = parsed.data.kpis;
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      setForm(null);
      setFieldErrors({});
      return;
    }
    setSaving(true);
    setFormError(null);
    const res = await onSaveDepartment(dept.id, patch);
    if (res.ok) {
      setEditing(false);
      setForm(null);
      setFieldErrors({});
      setFormError(null);
    } else {
      setFormError(res.message ?? t('errors.permission_denied'));
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ backgroundColor: dept.color }}
        >
          <Building2 className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{dept.name}</h2>
          <p className="text-xs text-ink-400">
            {t('schema.people', { count: deptEmps.length })}
            {children.length > 0 && ` · ${t('schema.sub_depts', { count: children.length })}`}
          </p>
        </div>
      </div>

      <PhotoSlot />

      {editing && form ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="label" htmlFor="edit-dept-name">{t('departments.name')}</label>
            <input
              id="edit-dept-name"
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={saving}
            />
            {fieldErrors.name && <p className="text-sm text-danger-600">{t(fieldErrors.name)}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="label" htmlFor="edit-dept-zone">{t('departments.responsibility_zone')}</label>
            <textarea
              id="edit-dept-zone"
              className="input min-h-[60px]"
              value={form.responsibility_zone}
              onChange={(e) => setForm({ ...form, responsibility_zone: e.target.value })}
              disabled={saving}
            />
            {fieldErrors.responsibility_zone && <p className="text-sm text-danger-600">{t(fieldErrors.responsibility_zone)}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="label" htmlFor="edit-dept-result">{t('departments.desired_result')}</label>
            <textarea
              id="edit-dept-result"
              className="input min-h-[60px]"
              value={form.desired_result}
              onChange={(e) => setForm({ ...form, desired_result: e.target.value })}
              disabled={saving}
            />
            {fieldErrors.desired_result && <p className="text-sm text-danger-600">{t(fieldErrors.desired_result)}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="label" htmlFor="edit-dept-kpis">{t('departments.kpis')}</label>
            <textarea
              id="edit-dept-kpis"
              className="input min-h-[60px]"
              value={form.kpis}
              onChange={(e) => setForm({ ...form, kpis: e.target.value })}
              disabled={saving}
            />
            {fieldErrors.kpis && <p className="text-sm text-danger-600">{t(fieldErrors.kpis)}</p>}
          </div>

          {formError && <p className="text-sm text-danger-600">{formError}</p>}

          <div className="flex gap-2">
            <button onClick={cancelEdit} className="btn-secondary min-h-[44px] flex-1" disabled={saving}>
              {t('common.cancel')}
            </button>
            <button onClick={() => void handleSave()} className="btn-primary min-h-[44px] flex-1" disabled={saving}>
              {saving ? <Save className="h-4 w-4 animate-pulse" /> : <Save className="h-4 w-4" />}
              {t('common.save')}
            </button>
          </div>
        </div>
      ) : (
        <>
      {fields.map((f) => (
        <DetailField key={f.label} label={f.label} value={f.value} />
      ))}

      {parent && (
        <div>
          <p className="mb-1 text-xs font-medium text-ink-400">{t('departments.parent')}</p>
          <button
            onClick={() => onSelectDept(parent.id)}
            className="flex items-center gap-2 text-sm text-brand-600 hover:underline"
          >
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{parent.name}</span>
            <ArrowRight className="h-3 w-3 shrink-0" />
          </button>
        </div>
      )}

      {children.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-ink-400">{t('schema.sub_depts')}</p>
          <div className="space-y-1">
            {children.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectDept(c.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-ink-100 dark:hover:bg-ink-800"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {deptEmps.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-ink-400">{t('schema.employees_in_dept')}</p>
          <div className="space-y-1">
            {deptEmps.map((e) => (
              <button
                key={e.id}
                onClick={() => onSelectEmp(e.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-ink-100 dark:hover:bg-ink-800"
              >
                {e.is_vacancy ? <Briefcase className="h-3.5 w-3.5 text-warning-500" /> : <UserCircle className="h-3.5 w-3.5 text-brand-500" />}
                <span className="flex-1 truncate text-left">
                  {e.is_vacancy ? t('employees.vacancy_label') : e.full_name}
                </span>
                <span className="text-xs text-ink-400">{e.position}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {canEdit && onRequestDelete && (
        <button
          onClick={() => onRequestDelete('department', dept.id)}
          className="btn mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2 bg-danger-600 text-white hover:bg-danger-700"
          aria-label={t('schema.delete_department')}
        >
          <Trash2 className="h-4 w-4" />
          {t('schema.delete_department')}
        </button>
      )}
        </>
      )}

      {canEdit && !editing && (
        <button
          onClick={startEdit}
          className="btn-secondary mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2"
          aria-label={t('departments.edit')}
        >
          <Pencil className="h-4 w-4" />
          {t('departments.edit')}
        </button>
      )}
    </div>
  );
}

function EmpDetails({
  emp, depts, employees, onSelectEmp, canEdit, onRequestDelete, onSaveEmployee, panelOpen,
}: {
  emp: Employee;
  depts: Department[];
  employees: Employee[];
  onSelectEmp: (id: string) => void;
  canEdit?: boolean;
  onRequestDelete?: (kind: 'employee' | 'department', id: string) => void;
  onSaveEmployee?: (id: string, patch: EmployeePatch) => Promise<SaveEmployeeResult>;
  panelOpen: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EmployeeInput | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Reset edit mode whenever the selected employee changes or the panel closes.
  useEffect(() => {
    setEditing(false);
    setForm(null);
    setFieldErrors({});
    setFormError(null);
    setSaving(false);
  }, [emp.id, panelOpen]);

  const dept = depts.find((d) => d.id === emp.department_id);
  const manager = employees.find((e) => e.id === emp.manager_id);
  const pm = employees.find((e) => e.id === emp.project_manager_id);
  const subordinates = employees.filter((e) => e.manager_id === emp.id);
  const problems = getEmployeeProblems(emp, employees);

  const fields: { label: string; value: string }[] = [
    { label: t('employees.full_name'), value: emp.is_vacancy ? t('employees.vacancy_label') : emp.full_name },
    { label: t('employees.position'), value: emp.position },
    { label: t('employees.department'), value: dept?.name ?? '—' },
    { label: t('employees.duties'), value: emp.duties },
    { label: t('employees.responsibility_zone'), value: emp.responsibility_zone },
  ];

  const startEdit = () => {
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
    setFormError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setForm(null);
    setFieldErrors({});
    setFormError(null);
  };

  const handleSave = async () => {
    if (!form || !onSaveEmployee) return;
    const merged: EmployeeInput = {
      ...form,
      full_name: form.is_vacancy ? '' : form.full_name,
    };
    const parsed = employeeSchema.safeParse(merged);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errs[issue.path[0] as string] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    // Send only the editable fields that changed.
    const patch: EmployeePatch = {};
    if (parsed.data.full_name !== emp.full_name) patch.full_name = parsed.data.full_name;
    if (parsed.data.position !== emp.position) patch.position = parsed.data.position;
    if (parsed.data.duties !== emp.duties) patch.duties = parsed.data.duties;
    if (parsed.data.responsibility_zone !== emp.responsibility_zone) patch.responsibility_zone = parsed.data.responsibility_zone;
    if (parsed.data.is_vacancy !== emp.is_vacancy) patch.is_vacancy = parsed.data.is_vacancy;
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      setForm(null);
      setFieldErrors({});
      return;
    }
    setSaving(true);
    setFormError(null);
    const res = await onSaveEmployee(emp.id, patch);
    if (res.ok) {
      setEditing(false);
      setForm(null);
      setFieldErrors({});
      setFormError(null);
    } else {
      setFormError(res.message ?? t('errors.permission_denied'));
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
          emp.is_vacancy ? 'bg-warning-100 text-warning-600' : 'bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-200'
        }`}>
          {emp.is_vacancy ? <Briefcase className="h-6 w-6" /> : <UserCircle className="h-6 w-6" />}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">
            {emp.is_vacancy ? t('employees.vacancy_label') : emp.full_name}
          </h2>
          <p className="truncate text-xs text-ink-400">{emp.position}</p>
        </div>
      </div>

      {problems.length > 0 && (
        <div className="rounded-lg bg-warning-50 p-3 dark:bg-warning-900/20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning-600" />
            <span className="text-sm font-medium text-warning-700 dark:text-warning-400">{t('schema.problems')}</span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {problems.map((p) => (
              <li key={p} className="text-xs text-warning-600 dark:text-warning-400">{t(problemLabels[p])}</li>
            ))}
          </ul>
        </div>
      )}

      <PhotoSlot />

      {editing && form ? (
        <div className="space-y-4">
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
              <label className="label" htmlFor="edit-emp-name">{t('employees.full_name')}</label>
              <input
                id="edit-emp-name"
                className="input"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                disabled={saving}
              />
              {fieldErrors.full_name && <p className="text-sm text-danger-600">{t(fieldErrors.full_name)}</p>}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="label" htmlFor="edit-emp-position">{t('employees.position')}</label>
            <input
              id="edit-emp-position"
              className="input"
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value })}
              disabled={saving}
            />
            {fieldErrors.position && <p className="text-sm text-danger-600">{t(fieldErrors.position)}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="label" htmlFor="edit-emp-duties">{t('employees.duties')}</label>
            <textarea
              id="edit-emp-duties"
              className="input min-h-[60px]"
              value={form.duties}
              onChange={(e) => setForm({ ...form, duties: e.target.value })}
              disabled={saving}
            />
            {fieldErrors.duties && <p className="text-sm text-danger-600">{t(fieldErrors.duties)}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="label" htmlFor="edit-emp-zone">{t('employees.responsibility_zone')}</label>
            <textarea
              id="edit-emp-zone"
              className="input min-h-[60px]"
              value={form.responsibility_zone}
              onChange={(e) => setForm({ ...form, responsibility_zone: e.target.value })}
              disabled={saving}
            />
            {fieldErrors.responsibility_zone && <p className="text-sm text-danger-600">{t(fieldErrors.responsibility_zone)}</p>}
          </div>

          {formError && <p className="text-sm text-danger-600">{formError}</p>}

          <div className="flex gap-2">
            <button onClick={cancelEdit} className="btn-secondary min-h-[44px] flex-1" disabled={saving}>
              {t('common.cancel')}
            </button>
            <button onClick={() => void handleSave()} className="btn-primary min-h-[44px] flex-1" disabled={saving}>
              {saving ? <Save className="h-4 w-4 animate-pulse" /> : <Save className="h-4 w-4" />}
              {t('common.save')}
            </button>
          </div>
        </div>
      ) : (
        <>
      {fields.map((f) => (
        <DetailField key={f.label} label={f.label} value={f.value} />
      ))}

      {manager && (
        <div>
          <p className="mb-1 text-xs font-medium text-ink-400">{t('employees.manager')}</p>
          <button
            onClick={() => onSelectEmp(manager.id)}
            className="flex items-center gap-2 text-sm text-brand-600 hover:underline"
          >
            <UserCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{manager.is_vacancy ? t('employees.vacancy_label') : manager.full_name}</span>
            <ArrowRight className="h-3 w-3 shrink-0" />
          </button>
        </div>
      )}

      {pm && (
        <div>
          <p className="mb-1 text-xs font-medium text-ink-400">{t('employees.project_manager')}</p>
          <button
            onClick={() => onSelectEmp(pm.id)}
            className="flex items-center gap-2 text-sm text-brand-600 hover:underline"
          >
            <UserCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{pm.is_vacancy ? t('employees.vacancy_label') : pm.full_name}</span>
            <ArrowRight className="h-3 w-3 shrink-0" />
          </button>
        </div>
      )}

      {subordinates.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-ink-400">{t('schema.subordinates')} ({subordinates.length})</p>
          <div className="space-y-1">
            {subordinates.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelectEmp(s.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-ink-100 dark:hover:bg-ink-800"
              >
                {s.is_vacancy ? <Briefcase className="h-3.5 w-3.5 text-warning-500" /> : <UserCircle className="h-3.5 w-3.5 text-brand-500" />}
                <span className="flex-1 truncate text-left">
                  {s.is_vacancy ? t('employees.vacancy_label') : s.full_name}
                </span>
                <span className="text-xs text-ink-400">{s.position}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {canEdit && onRequestDelete && (
        <button
          onClick={() => onRequestDelete('employee', emp.id)}
          className="btn mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2 bg-danger-600 text-white hover:bg-danger-700"
          aria-label={t('schema.delete_employee')}
        >
          <Trash2 className="h-4 w-4" />
          {t('schema.delete_employee')}
        </button>
      )}
        </>
      )}

      {canEdit && !editing && (
        <button
          onClick={startEdit}
          className="btn-secondary mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2"
          aria-label={t('employees.edit')}
        >
          <Pencil className="h-4 w-4" />
          {t('employees.edit')}
        </button>
      )}
    </div>
  );
}

function PhotoSlot() {
  const { t } = useTranslation();
  return (
    <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-ink-200 bg-ink-50 dark:border-ink-700 dark:bg-ink-800">
      <div className="flex flex-col items-center gap-1 text-ink-300">
        <ImageIcon className="h-6 w-6" />
        <span className="text-xs">{t('schema.no_photo')}</span>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-400">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-900 dark:text-ink-100">{value || '—'}</p>
    </div>
  );
}
