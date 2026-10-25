import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { UserCircle, Briefcase, AlertTriangle } from 'lucide-react';
import type { Employee, Department } from '@/core/supabase';
import { getEmployeeProblems, type ProblemType } from './types';

const problemLabels: Record<ProblemType, string> = {
  span_exceeded: 'schema.badge_span_exceeded',
  no_manager: 'schema.badge_no_manager',
  empty_responsibility_zone: 'schema.badge_empty_zone',
};

export type ConnectMode = 'none' | 'manager' | 'pm' | 'dept';

export function EmpNodeFactory(
  employees: Employee[],
  depts: Department[],
  onSelect: (id: string) => void,
  highlightIds: Set<string> | null,
  connectable: boolean,
  connectMode: ConnectMode,
  pendingConnectSource: string | null,
  onConnectTarget?: (targetId: string, kind: 'manager' | 'pm') => void,
) {
  const Component = memo(({ data, selected }: NodeProps) => {
    const { t } = useTranslation();
    const emp = employees.find((e) => e.id === (data as { empId: string }).empId);
    if (!emp) return null;
    const dept = depts.find((d) => d.id === emp.department_id);
    const problems = getEmployeeProblems(emp, employees);
    const dimmed = highlightIds !== null && !highlightIds.has(emp.id);
    const isHighlighted = highlightIds !== null && highlightIds.has(emp.id);
    const subCount = employees.filter((e) => e.manager_id === emp.id).length;
    const isConnectSource = pendingConnectSource === emp.id;
    const showHandles = connectable && connectMode !== 'none';
    const handleStyle = showHandles
      ? { opacity: 1, background: '#2563eb', border: '2px solid white', width: '10px', height: '10px' }
      : { opacity: 0 };
    const pmHandleStyle = showHandles && connectMode === 'pm'
      ? { opacity: 1, background: '#d97706', border: '2px solid white', width: '10px', height: '10px' }
      : { opacity: 0 };
    const isPendingTarget = pendingConnectSource !== null && pendingConnectSource !== emp.id;

    return (
      <div
        className={`relative flex flex-col rounded-lg border-2 bg-white dark:bg-ink-900 px-3 py-2 transition-opacity ${
          selected ? 'border-brand-500 ring-2 ring-brand-200' : 'border-ink-300 dark:border-ink-700'
        } ${dimmed ? 'opacity-30' : ''} ${isHighlighted ? 'ring-2 ring-warning-400' : ''} ${
          isConnectSource ? 'ring-2 ring-brand-400 border-brand-400' : ''
        } ${isPendingTarget && showHandles ? 'cursor-pointer hover:border-brand-400 hover:ring-1 hover:ring-brand-200' : ''}`}
        style={{ width: 200, cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation();
          if (isPendingTarget && showHandles && connectMode !== 'dept' && onConnectTarget) {
            onConnectTarget(emp.id, connectMode === 'pm' ? 'pm' : 'manager');
          } else {
            onSelect(emp.id);
          }
        }}
        dir="ltr"
      >
        <Handle type="target" position={Position.Top} style={handleStyle} isConnectableStart={false} isConnectableEnd={showHandles} />
        <div className="flex items-center gap-2">
          {emp.is_vacancy ? (
            <Briefcase className="h-5 w-5 shrink-0 text-warning-500" />
          ) : (
            <UserCircle className="h-5 w-5 shrink-0 text-brand-500" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {emp.is_vacancy ? t('employees.vacancy_label') : emp.full_name}
            </p>
            <p className="truncate text-xs text-ink-400">{emp.position}</p>
          </div>
          {problems.length > 0 && (
            <span title={problems.map((p) => t(problemLabels[p])).join(', ')}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning-500" />
            </span>
          )}
        </div>
        {dept && <p className="mt-0.5 truncate text-xs text-ink-400">{dept.name}</p>}
        {subCount > 0 && <p className="text-xs text-ink-400">{t('schema.reports', { count: subCount })}</p>}
        <Handle type="source" position={Position.Bottom} style={handleStyle} isConnectableStart={showHandles} isConnectableEnd={false} />
        <Handle type="target" position={Position.Left} id="pm-handle" style={pmHandleStyle} isConnectableStart={showHandles && connectMode === 'pm'} isConnectableEnd={showHandles} />
      </div>
    );
  });
  return Component;
}
