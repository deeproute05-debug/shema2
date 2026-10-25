import { useTranslation } from 'react-i18next';
import { X, UserCircle, Building2, AlertTriangle, ImageIcon, ArrowRight, Briefcase } from 'lucide-react';
import type { Department, Employee } from '@/core/supabase';
import { getEmployeeProblems, type ProblemType } from './types';

const problemLabels: Record<ProblemType, string> = {
  span_exceeded: 'schema.badge_span_exceeded',
  no_manager: 'schema.badge_no_manager',
  empty_responsibility_zone: 'schema.badge_empty_zone',
};

interface Props {
  open: boolean;
  onClose: () => void;
  selectedDept: Department | null;
  selectedEmp: Employee | null;
  depts: Department[];
  employees: Employee[];
  onSelectEmp: (id: string) => void;
  onSelectDept: (id: string) => void;
}

export function SidePanel({
  open, onClose, selectedDept, selectedEmp, depts, employees, onSelectEmp, onSelectDept,
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
        />
      )}

      {selectedEmp && (
        <EmpDetails
          emp={selectedEmp}
          depts={depts}
          employees={employees}
          onSelectEmp={onSelectEmp}
        />
      )}
    </div>
  );
}

function DeptDetails({
  dept, depts, employees, onSelectEmp, onSelectDept,
}: {
  dept: Department;
  depts: Department[];
  employees: Employee[];
  onSelectEmp: (id: string) => void;
  onSelectDept: (id: string) => void;
}) {
  const { t } = useTranslation();
  const parent = depts.find((d) => d.id === dept.parent_id);
  const children = depts.filter((d) => d.parent_id === dept.id);
  const deptEmps = employees.filter((e) => e.department_id === dept.id);

  const fields: { label: string; value: string }[] = [
    { label: t('departments.name'), value: dept.name },
    { label: t('departments.responsibility_zone'), value: dept.responsibility_zone },
    { label: t('departments.desired_result'), value: dept.desired_result },
    { label: t('departments.kpis'), value: dept.kpis },
  ];

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
    </div>
  );
}

function EmpDetails({
  emp, depts, employees, onSelectEmp,
}: {
  emp: Employee;
  depts: Department[];
  employees: Employee[];
  onSelectEmp: (id: string) => void;
}) {
  const { t } = useTranslation();
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
