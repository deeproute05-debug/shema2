import { memo, useState, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { UserCircle, Briefcase, AlertTriangle, Plus, UserPlus, Users } from 'lucide-react';
import type { Employee, Department } from '@/core/supabase';
import { employeeSchema } from '@/core/formsValidation';
import { getEmployeeProblems, type ProblemType } from './types';

const problemLabels: Record<ProblemType, string> = {
  span_exceeded: 'schema.badge_span_exceeded',
  no_manager: 'schema.badge_no_manager',
  empty_responsibility_zone: 'schema.badge_empty_zone',
};

export type ConnectMode = 'none' | 'manager' | 'pm' | 'dept';

export type RenameResult = { ok: boolean; message?: string };

const fullNameSchema = employeeSchema.shape.full_name;

export function EmpNodeFactory(
  employees: Employee[],
  depts: Department[],
  onSelect: (id: string) => void,
  highlightIds: Set<string> | null,
  connectable: boolean,
  connectMode: ConnectMode,
  pendingConnectSource: string | null,
  onConnectTarget?: (targetId: string, kind: 'manager' | 'pm') => void,
  onSetConnectSource?: (id: string) => void,
  coarsePointer?: boolean,
  onAddEmployee?: (empId: string, kind: 'subordinate' | 'colleague') => void,
  showAddButton?: boolean,
  canRename?: boolean,
  onRename?: (id: string, newName: string) => Promise<RenameResult>,
) {
  const Component = memo(({ data, selected }: NodeProps) => {
    const { t } = useTranslation();
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    // Inline rename state — declared above the early return so hooks order is stable.
    const [renaming, setRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [renameError, setRenameError] = useState<string | null>(null);
    const renameInputRef = useRef<HTMLInputElement | null>(null);
    const lastTapRef = useRef(0);
    const savedRef = useRef(false); // prevents double save (Enter/Escape vs blur)

    const emp = employees.find((e) => e.id === (data as { empId: string }).empId);
    if (!emp) return null;
    const dept = depts.find((d) => d.id === emp.department_id);
    const problems = getEmployeeProblems(emp, employees);
    const dimmed = highlightIds !== null && !highlightIds.has(emp.id);
    const isHighlighted = highlightIds !== null && highlightIds.has(emp.id);
    const subCount = employees.filter((e) => e.manager_id === emp.id).length;
    const isConnectSource = pendingConnectSource === emp.id;
    const showHandles = connectable && connectMode !== 'none' && connectMode !== 'dept';
    // On coarse pointers in connect mode the whole card is the tap target;
    // the visible handle dots are only visual affordances, sized for a
    // comfortable touch hit area.
    const handleStyle = showHandles
      ? { opacity: 1, background: '#2563eb', border: '2px solid white', width: coarsePointer ? '14px' : '10px', height: coarsePointer ? '14px' : '10px' }
      : { opacity: 0 };
    const pmHandleStyle = showHandles && connectMode === 'pm'
      ? { opacity: 1, background: '#d97706', border: '2px solid white', width: coarsePointer ? '14px' : '10px', height: coarsePointer ? '14px' : '10px' }
      : { opacity: 0 };
    // Tap flow is for coarse pointers only; mouse users keep click = open panel + drag-to-connect.
    const isConnectMode = !!coarsePointer && showHandles && (connectMode === 'manager' || connectMode === 'pm');
    const hasPendingSource = pendingConnectSource !== null;
    const isPendingTarget = hasPendingSource && pendingConnectSource !== emp.id;
    const canShowAdd = !!showAddButton && !!onAddEmployee && !isConnectMode && !showHandles;
    // Vacancies never allow inline rename (name is hidden/empty).
    const allowRename = !!canRename && !!onRename && !emp.is_vacancy;

    const startRename = () => {
      setRenameValue(emp.full_name);
      setRenameError(null);
      savedRef.current = false;
      setRenaming(true);
    };

    const commitRename = async () => {
      if (savedRef.current) return;
      const trimmed = renameValue.trim();
      const parsed = fullNameSchema.safeParse(trimmed);
      if (!parsed.success) {
        setRenameError(t(parsed.error.issues[0]?.message ?? 'employees.name_required_unless_vacancy'));
        return;
      }
      if (parsed.data === emp.full_name) {
        savedRef.current = true;
        setRenaming(false);
        setRenameError(null);
        return;
      }
      savedRef.current = true;
      const res = onRename ? await onRename(emp.id, parsed.data) : { ok: false };
      if (res.ok) {
        setRenaming(false);
        setRenameError(null);
      } else {
        savedRef.current = false;
        setRenameError(res.message ?? t('errors.permission_denied'));
      }
    };

    const cancelRename = () => {
      savedRef.current = true;
      setRenaming(false);
      setRenameError(null);
    };

    const onNameDoubleClick = (e: React.MouseEvent) => {
      if (!allowRename) return;
      e.stopPropagation();
      startRename();
    };

    const onNameTap = (e: React.PointerEvent) => {
      if (!allowRename) return;
      e.stopPropagation();
      const now = Date.now();
      if (now - lastTapRef.current < 350) {
        startRename();
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    };

    const onRenameKeyDown = (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        void commitRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRename();
      }
    };

    const onRenameBlur = () => {
      if (savedRef.current) return;
      if (renameValue.trim() !== emp.full_name) {
        void commitRename();
      } else {
        setRenaming(false);
        setRenameError(null);
      }
    };

    return (
      <div
        className={`relative flex flex-col rounded-lg border-2 bg-white dark:bg-ink-900 px-3 py-2 transition-opacity ${
          selected ? 'border-brand-500 ring-2 ring-brand-200' : 'border-ink-300 dark:border-ink-700'
        } ${dimmed ? 'opacity-30' : ''} ${isHighlighted ? 'ring-2 ring-warning-400' : ''} ${
          isConnectSource ? 'ring-2 ring-brand-400 border-brand-400' : ''
        } ${isPendingTarget && showHandles ? 'cursor-pointer hover:border-brand-400 hover:ring-1 hover:ring-brand-200' : ''} ${
          isConnectMode && !hasPendingSource ? 'cursor-pointer hover:border-brand-300 hover:ring-1 hover:ring-brand-200' : ''
        }`}
        style={{ width: 200, cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation();
          if (!isConnectMode) {
            onSelect(emp.id);
            return;
          }
          // Connect mode (manager or pm) — tap flow.
          if (!hasPendingSource) {
            // First tap: mark as source (the manager / project manager).
            if (onSetConnectSource) onSetConnectSource(emp.id);
            return;
          }
          if (isConnectSource) {
            // Tapping the same card again cancels the pending selection.
            if (onSetConnectSource) onSetConnectSource(emp.id);
            return;
          }
          // Second tap on a different card: call the existing target path.
          if (onConnectTarget) {
            onConnectTarget(emp.id, connectMode === 'pm' ? 'pm' : 'manager');
          }
        }}
        dir="ltr"
      >
        <Handle type="target" position={Position.Top} style={handleStyle} isConnectableStart={showHandles} isConnectableEnd={showHandles} />
        {canShowAdd && (
          <div className="absolute -top-3 -right-3 z-20 nodrag" data-nodrag>
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-brand-500 bg-white text-brand-600 shadow-md transition-colors hover:bg-brand-50 dark:border-brand-400 dark:bg-ink-900 dark:text-brand-300 dark:hover:bg-ink-800"
              aria-label={t('schema.add_employee')}
              aria-haspopup="menu"
              aria-expanded={addMenuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setAddMenuOpen((v) => !v);
              }}
            >
              <Plus className="h-5 w-5" />
            </button>
            {addMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-12 z-30 w-44 overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-lg dark:border-ink-700 dark:bg-ink-900"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
                  aria-label={t('schema.add_subordinate')}
                  onClick={() => {
                    setAddMenuOpen(false);
                    onAddEmployee!(emp.id, 'subordinate');
                  }}
                >
                  <UserPlus className="h-4 w-4 shrink-0 text-brand-500" />
                  {t('schema.add_subordinate')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
                  aria-label={t('schema.add_colleague')}
                  onClick={() => {
                    setAddMenuOpen(false);
                    onAddEmployee!(emp.id, 'colleague');
                  }}
                >
                  <Users className="h-4 w-4 shrink-0 text-brand-500" />
                  {t('schema.add_colleague')}
                </button>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          {emp.is_vacancy ? (
            <Briefcase className="h-5 w-5 shrink-0 text-warning-500" />
          ) : (
            <UserCircle className="h-5 w-5 shrink-0 text-brand-500" />
          )}
          <div className="min-w-0 flex-1">
            {renaming ? (
              <input
                ref={renameInputRef}
                type="text"
                className={`nodrag nopan nowheel w-full rounded border bg-white px-1 text-sm font-medium text-ink-900 outline-none min-h-[44px] ${
                  renameError ? 'border-danger-500' : 'border-brand-400'
                } dark:bg-ink-800 dark:text-ink-100`}
                value={renameValue}
                maxLength={200}
                autoFocus
                onFocus={(e) => e.target.select()}
                onChange={(e) => { setRenameValue(e.target.value); setRenameError(null); }}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={onRenameKeyDown}
                onBlur={onRenameBlur}
                aria-invalid={!!renameError}
                title={renameError ?? undefined}
              />
            ) : (
              <p
                className="truncate text-sm font-medium select-none"
                onDoubleClick={onNameDoubleClick}
                onPointerDown={onNameTap}
                title={allowRename ? t('schema.rename_hint') : undefined}
              >
                {emp.is_vacancy ? t('employees.vacancy_label') : emp.full_name}
              </p>
            )}
            {renaming && renameError && (
              <p className="mt-0.5 text-xs text-danger-600">{renameError}</p>
            )}
            {!renaming && (
              <p className="truncate text-xs text-ink-400">{emp.position}</p>
            )}
          </div>
          {problems.length > 0 && !renaming && (
            <span title={problems.map((p) => t(problemLabels[p])).join(', ')}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning-500" />
            </span>
          )}
        </div>
        {dept && <p className="mt-0.5 truncate text-xs text-ink-400">{dept.name}</p>}
        {subCount > 0 && <p className="text-xs text-ink-400">{t('schema.reports', { count: subCount })}</p>}
        <Handle type="source" position={Position.Bottom} style={handleStyle} isConnectableStart={showHandles} isConnectableEnd={showHandles} />
        <Handle type="target" position={Position.Left} id="pm-handle" style={pmHandleStyle} isConnectableStart={showHandles && connectMode === 'pm'} isConnectableEnd={showHandles && connectMode === 'pm'} />
      </div>
    );
  });
  return Component;
}
