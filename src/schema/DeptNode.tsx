import { memo, useState, useRef, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { Building2, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import type { Department, Employee } from '@/core/supabase';
import { departmentSchema } from '@/core/formsValidation';
import { hasDeptProblems } from './types';

export type RenameResult = { ok: boolean; message?: string };

const nameSchema = departmentSchema.shape.name;

export function DeptNodeFactory(
  depts: Department[],
  employees: Employee[],
  onSelect: (id: string) => void,
  onToggleCollapse: (id: string) => void,
  collapsed: Set<string>,
  highlightIds: Set<string> | null,
  canRename?: boolean,
  onRename?: (id: string, newName: string) => Promise<RenameResult>,
) {
  const Component = memo(({ data, selected }: NodeProps) => {
    const { t } = useTranslation();
    // Inline rename state — declared above the early return so hooks order is stable.
    const [renaming, setRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [renameError, setRenameError] = useState<string | null>(null);
    const renameInputRef = useRef<HTMLInputElement | null>(null);
    const lastTapRef = useRef(0);
    const savedRef = useRef(false); // prevents double save (Enter/Escape vs blur)

    const dept = depts.find((d) => d.id === (data as { deptId: string }).deptId);
    if (!dept) return null;
    const empCount = employees.filter((e) => e.department_id === dept.id).length;
    const isCollapsed = collapsed.has(dept.id);
    const problems = hasDeptProblems(dept, employees);
    const dimmed = highlightIds !== null && !highlightIds.has(dept.id);
    const isHighlighted = highlightIds !== null && highlightIds.has(dept.id);
    const allowRename = !!canRename && !!onRename;

    const startRename = useCallback(() => {
      setRenameValue(dept.name);
      setRenameError(null);
      savedRef.current = false;
      setRenaming(true);
    }, [dept.name]);

    const commitRename = useCallback(async () => {
      if (savedRef.current) return;
      const trimmed = renameValue.trim();
      const parsed = nameSchema.safeParse(trimmed);
      if (!parsed.success) {
        setRenameError(t(parsed.error.issues[0]?.message ?? 'departments.name_required'));
        return;
      }
      if (parsed.data === dept.name) {
        savedRef.current = true;
        setRenaming(false);
        setRenameError(null);
        return;
      }
      savedRef.current = true;
      const res = onRename ? await onRename(dept.id, parsed.data) : { ok: false };
      if (res.ok) {
        setRenaming(false);
        setRenameError(null);
      } else {
        savedRef.current = false;
        setRenameError(res.message ?? t('errors.permission_denied'));
      }
    }, [renameValue, dept.id, dept.name, onRename, t]);

    const cancelRename = useCallback(() => {
      savedRef.current = true;
      setRenaming(false);
      setRenameError(null);
    }, []);

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
      if (renameValue.trim() !== dept.name) {
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
        } ${dimmed ? 'opacity-30' : ''} ${isHighlighted ? 'ring-2 ring-warning-400' : ''}`}
        style={{ width: 200, cursor: 'pointer' }}
        onClick={(e) => { e.stopPropagation(); onSelect(dept.id); }}
        dir="ltr"
      >
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: dept.color }} />
          <Building2 className="h-4 w-4 shrink-0 text-ink-400" />
          {renaming ? (
            <input
              ref={renameInputRef}
              type="text"
              className={`nodrag nopan nowheel flex-1 rounded border bg-white px-1 text-sm font-semibold text-ink-900 outline-none min-h-[44px] ${
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
            <span
              className="flex-1 truncate text-sm font-semibold select-none"
              onDoubleClick={onNameDoubleClick}
              onPointerDown={onNameTap}
              title={allowRename ? t('schema.rename_hint') : undefined}
            >
              {dept.name}
            </span>
          )}
          {problems && !renaming && (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning-500" />
          )}
          {!renaming && <span className="sr-only">{t('schema.has_problems')}</span>}
          {!renaming && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCollapse(dept.id); }}
              className="shrink-0 rounded p-0.5 hover:bg-ink-100 dark:hover:bg-ink-800"
              aria-label={isCollapsed ? t('common.expand') : t('common.collapse')}
            >
              {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        {renaming && renameError && (
          <p className="mt-0.5 text-xs text-danger-600">{renameError}</p>
        )}
        {!renaming && (
          <span className="mt-0.5 text-xs text-ink-400">{t('schema.people', { count: empCount })}</span>
        )}
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      </div>
    );
  });
  return Component;
}
