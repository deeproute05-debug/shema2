import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { Building2, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import type { Department, Employee } from '@/core/supabase';
import { hasDeptProblems } from './types';

export function DeptNodeFactory(
  depts: Department[],
  employees: Employee[],
  onSelect: (id: string) => void,
  onToggleCollapse: (id: string) => void,
  collapsed: Set<string>,
  highlightIds: Set<string> | null,
) {
  const Component = memo(({ data, selected }: NodeProps) => {
    const { t } = useTranslation();
    const dept = depts.find((d) => d.id === (data as { deptId: string }).deptId);
    if (!dept) return null;
    const empCount = employees.filter((e) => e.department_id === dept.id).length;
    const isCollapsed = collapsed.has(dept.id);
    const problems = hasDeptProblems(dept, employees);
    const dimmed = highlightIds !== null && !highlightIds.has(dept.id);
    const isHighlighted = highlightIds !== null && highlightIds.has(dept.id);

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
          <span className="flex-1 truncate text-sm font-semibold">{dept.name}</span>
          {problems && (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning-500" />
          )}
          <span className="sr-only">{t('schema.has_problems')}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleCollapse(dept.id); }}
            className="shrink-0 rounded p-0.5 hover:bg-ink-100 dark:hover:bg-ink-800"
            aria-label={isCollapsed ? t('common.expand') : t('common.collapse')}
          >
            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
        <span className="mt-0.5 text-xs text-ink-400">{t('schema.people', { count: empCount })}</span>
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      </div>
    );
  });
  return Component;
}
