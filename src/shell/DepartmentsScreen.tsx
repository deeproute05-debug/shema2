import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Network, Plus, Pencil, Trash2, Loader2, ChevronRight, FolderTree,
} from 'lucide-react';
import { supabase, type Department, type Employee } from '@/core/supabase';
import { useCanEdit } from '@/core/useCanEdit';
import { departmentSchema, type DepartmentInput } from '@/core/formsValidation';
import { extractDbError } from '@/core/dbErrors';
import { toastError, toastSuccess } from '@/core/toast';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface DeptNode extends Department {
  children: DeptNode[];
  employeeCount: number;
}

function buildTree(depts: Department[], employees: Employee[]): DeptNode[] {
  const empCount = new Map<string, number>();
  for (const e of employees) {
    if (e.department_id) empCount.set(e.department_id, (empCount.get(e.department_id) ?? 0) + 1);
  }

  const map = new Map<string, DeptNode>();
  for (const d of depts) {
    map.set(d.id, { ...d, children: [], employeeCount: empCount.get(d.id) ?? 0 });
  }

  const roots: DeptNode[] = [];
  for (const d of depts) {
    const node = map.get(d.id)!;
    if (d.parent_id && map.has(d.parent_id)) {
      map.get(d.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function DepartmentsScreen() {
  const { t } = useTranslation();
  const canEdit = useCanEdit();
  const [depts, setDepts] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [form, setForm] = useState<DepartmentInput | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [deleteChildren, setDeleteChildren] = useState<{ children: Department[]; employees: Employee[] } | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [deptRes, empRes] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase.from('employees').select('id, department_id'),
    ]);
    if (deptRes.error) {
      const msg = extractDbError(deptRes.error);
      setError(msg);
      toastError(msg);
    } else {
      setDepts(deptRes.data as Department[]);
    }
    if (empRes.data) setEmployees(empRes.data as Employee[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreate = (parentId: string | null) => {
    setEditingDept(null);
    setForm({
      name: '',
      parent_id: parentId,
      responsibility_zone: '',
      desired_result: '',
      kpis: '',
      color: '#2563eb',
    });
    setFieldErrors({});
    setModalOpen(true);
  };

  const openEdit = (dept: Department) => {
    setEditingDept(dept);
    setForm({
      name: dept.name,
      parent_id: dept.parent_id,
      responsibility_zone: dept.responsibility_zone,
      desired_result: dept.desired_result,
      kpis: dept.kpis,
      color: dept.color,
    });
    setFieldErrors({});
    setModalOpen(true);
  };

  const save = async () => {
    if (!form) return;
    const parsed = departmentSchema.safeParse(form);
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
    const prevDepts = depts;

    // Optimistic update
    if (editingDept) {
      setDepts((prev) => prev.map((d) => (d.id === editingDept.id ? { ...d, ...data } : d)));
    } else {
      const tempId = crypto.randomUUID();
      setPendingIds((prev) => new Set(prev).add(tempId));
      setDepts((prev) => [...prev, {
        id: tempId, photo_path: '', pos_org: {}, pos_matrix: {}, pos_free: [], updated_at: '',
        ...data,
      }]);
    }

    let result;
    if (editingDept) {
      result = await supabase.from('departments').update(data).eq('id', editingDept.id).select().single();
    } else {
      result = await supabase.from('departments').insert(data).select().single();
    }

    if (result.error) {
      setDepts(prevDepts); // Rollback
      setPendingIds(new Set());
      toastError(t(extractDbError(result.error)));
      setSaving(false);
      return;
    }

    toastSuccess(editingDept ? t('departments.updated') : t('departments.created'));
    setModalOpen(false);
    setForm(null);
    setFieldErrors({});
    setSaving(false);
    setPendingIds(new Set());
    void reload();
  };

  const tryDelete = async (dept: Department) => {
    const children = depts.filter((d) => d.parent_id === dept.id);
    const emps = employees.filter((e) => e.department_id === dept.id);
    if (children.length > 0 || emps.length > 0) {
      setDeleteTarget(dept);
      setDeleteChildren({ children, employees: emps });
    } else {
      setDeleteTarget(dept);
      setDeleteChildren(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    const { error } = await supabase.from('departments').delete().eq('id', deleteTarget.id);
    if (error) {
      toastError(t(extractDbError(error)));
      setSaving(false);
      setDeleteTarget(null);
      return;
    }
    toastSuccess(t('departments.deleted'));
    setSaving(false);
    setDeleteTarget(null);
    setDeleteChildren(null);
    void reload();
  };

  const moveToParent = async () => {
    if (!deleteTarget || !deleteChildren) return;
    setSaving(true);
    const parentId = deleteTarget.parent_id;

    // Move children to parent
    if (deleteChildren.children.length > 0) {
      const { error } = await supabase
        .from('departments')
        .update({ parent_id: parentId })
        .in('id', deleteChildren.children.map((c) => c.id));
      if (error) {
        toastError(t(extractDbError(error)));
        setSaving(false);
        return;
      }
    }

    // Move employees to parent
    if (deleteChildren.employees.length > 0) {
      const { error } = await supabase
        .from('employees')
        .update({ department_id: parentId })
        .in('id', deleteChildren.employees.map((e) => e.id));
      if (error) {
        toastError(t(extractDbError(error)));
        setSaving(false);
        return;
      }
    }

    // Now delete the department
    const { error } = await supabase.from('departments').delete().eq('id', deleteTarget.id);
    if (error) {
      toastError(t(extractDbError(error)));
      setSaving(false);
      return;
    }

    toastSuccess(t('departments.deleted'));
    setSaving(false);
    setDeleteTarget(null);
    setDeleteChildren(null);
    void reload();
  };

  const tree = buildTree(depts, employees);

  const renderNode = (node: DeptNode, depth: number): React.ReactNode => {
    const isExpanded = expanded.has(node.id);
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 rounded-lg py-2 hover:bg-ink-50 dark:hover:bg-ink-800/50"
          style={{ paddingLeft: depth * 20 + 8 }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(node.id)}
              className="shrink-0 rounded p-1 hover:bg-ink-200 dark:hover:bg-ink-700"
              aria-label={isExpanded ? t('common.collapse') : t('common.expand')}
            >
              <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </button>
          ) : (
            <span className="w-7 shrink-0" />
          )}
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: node.color }}
          />
          <span className="flex-1 truncate font-medium">{node.name}</span>
          {node.employeeCount > 0 && (
            <span className="rounded bg-ink-100 px-1.5 py-0.5 text-xs text-ink-500 dark:bg-ink-800 dark:text-ink-400">
              {node.employeeCount}
            </span>
          )}
          {canEdit && (
            <div className="flex shrink-0 gap-1">
              <button
                onClick={() => openCreate(node.id)}
                className="btn-ghost h-8 w-8 p-0"
                aria-label={t('departments.add_child')}
                title={t('departments.add_child')}
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={() => openEdit(node)}
                disabled={pendingIds.has(node.id)}
                className="btn-ghost h-8 w-8 p-0 disabled:opacity-40"
                aria-label={t('common.edit')}
                title={t('common.edit')}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => void tryDelete(node)}
                disabled={pendingIds.has(node.id)}
                className="btn-ghost h-8 w-8 p-0 text-danger-600 hover:text-danger-700 disabled:opacity-40"
                aria-label={t('common.delete')}
                title={t('common.delete')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {isExpanded && hasChildren && (
          <div>{node.children.map((c) => renderNode(c, depth + 1))}</div>
        )}
      </div>
    );
  };

  const formFields: { key: keyof DepartmentInput; label: string; multiline?: boolean }[] = [
    { key: 'name', label: t('departments.name') },
    { key: 'responsibility_zone', label: t('departments.responsibility_zone'), multiline: true },
    { key: 'desired_result', label: t('departments.desired_result'), multiline: true },
    { key: 'kpis', label: t('departments.kpis'), multiline: true },
  ];

  const parentOptions = depts.filter((d) => d.id !== editingDept?.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Network className="h-6 w-6 text-brand-600" />
            {t('departments.title')}
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t('departments.subtitle')}</p>
        </div>
        {canEdit && (
          <button onClick={() => openCreate(null)} className="btn-primary">
            <Plus className="h-4 w-4" />
            {t('departments.add')}
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
      ) : tree.length === 0 ? (
        <div className="card flex flex-col items-center py-12 text-center">
          <FolderTree className="mb-3 h-10 w-10 text-ink-300" />
          <p className="text-sm text-ink-400">{t('departments.empty')}</p>
          {canEdit && (
            <button onClick={() => openCreate(null)} className="btn-primary mt-4">
              <Plus className="h-4 w-4" />
              {t('departments.add')}
            </button>
          )}
        </div>
      ) : (
        <div className="card p-3">
          {tree.map((node) => renderNode(node, 0))}
        </div>
      )}

      {!canEdit && !loading && (
        <p className="text-xs text-ink-400">{t('common.read_only')}</p>
      )}

      <Modal
        open={modalOpen}
        title={editingDept ? t('departments.edit') : t('departments.create')}
        onClose={() => setModalOpen(false)}
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
            <div className="space-y-1.5">
              <label className="label" htmlFor="dept-name">{t('departments.name')}</label>
              <input
                id="dept-name"
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={saving}
              />
              {fieldErrors.name && <p className="text-sm text-danger-600">{t(fieldErrors.name)}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="label" htmlFor="dept-parent">{t('departments.parent')}</label>
              <select
                id="dept-parent"
                className="input"
                value={form.parent_id ?? ''}
                onChange={(e) => setForm({ ...form, parent_id: e.target.value || null })}
                disabled={saving}
              >
                <option value="">{t('departments.no_parent')}</option>
                {parentOptions.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            {formFields.filter((f) => f.key !== 'name').map((f) => (
              <div key={f.key} className="space-y-1.5">
                <label className="label" htmlFor={`dept-${f.key}`}>{f.label}</label>
                {f.multiline ? (
                  <textarea
                    id={`dept-${f.key}`}
                    className="input min-h-[60px]"
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    disabled={saving}
                  />
                ) : (
                  <input
                    id={`dept-${f.key}`}
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
              <label className="label" htmlFor="dept-color">{t('departments.color')}</label>
              <div className="flex items-center gap-2">
                <input
                  id="dept-color"
                  type="color"
                  className="h-10 w-14 cursor-pointer rounded border border-ink-200 dark:border-ink-700"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  disabled={saving}
                />
                <input
                  className="input flex-1"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  disabled={saving}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget && !deleteChildren}
        title={t('departments.delete_title')}
        message={t('departments.delete_confirm', { name: deleteTarget?.name })}
        confirmLabel={t('common.delete')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      <Modal
        open={!!deleteTarget && !!deleteChildren}
        title={t('departments.delete_title')}
        onClose={() => { setDeleteTarget(null); setDeleteChildren(null); }}
        footer={
          <>
            <button
              onClick={() => { setDeleteTarget(null); setDeleteChildren(null); }}
              className="btn-secondary"
              disabled={saving}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() => void moveToParent()}
              className="btn-primary"
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('departments.move_and_delete')}
            </button>
          </>
        }
      >
        {deleteTarget && deleteChildren && (
          <div className="space-y-3 text-sm">
            <p className="text-ink-600 dark:text-ink-300">
              {t('departments.has_children_employees', {
                name: deleteTarget.name,
                children: deleteChildren.children.length,
                employees: deleteChildren.employees.length,
              })}
            </p>
            <p className="text-ink-500 dark:text-ink-400">
              {t('departments.move_to_parent_desc')}
              {deleteTarget.parent_id
                ? depts.find((d) => d.id === deleteTarget.parent_id)?.name
                : t('departments.no_parent')}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
