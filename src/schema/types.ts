import type { Department, Employee, FreeNode, FreeEdge } from '@/core/supabase';

export type SchemaTab = 'org' | 'matrix' | 'list' | 'free';

export interface SchemaData {
  departments: Department[];
  employees: Employee[];
  freeNodes: FreeNode[];
  freeEdges: FreeEdge[];
}

export type NodeKind = 'department' | 'employee';

export interface DeptNodeData {
  kind: 'department';
  dept: Department;
  employeeCount: number;
  hasProblems: boolean;
  collapsed: boolean;
  dimmed: boolean;
}

export interface EmpNodeData {
  kind: 'employee';
  emp: Employee;
  deptName: string;
  managerName: string;
  subordinateCount: number;
  problems: string[];
  dimmed: boolean;
}

export const MAX_SPAN = 8;

export type ProblemType = 'span_exceeded' | 'no_manager' | 'empty_responsibility_zone';

export function getEmployeeProblems(
  emp: Employee,
  allEmployees: Employee[],
): ProblemType[] {
  const problems: ProblemType[] = [];
  const subordinates = allEmployees.filter((e) => e.manager_id === emp.id);
  if (subordinates.length > MAX_SPAN) problems.push('span_exceeded');

  const hasManager = emp.manager_id !== null;
  const isManagedBySomeone = allEmployees.some((e) => e.id === emp.manager_id);
  if (!hasManager && !emp.is_vacancy) {
    // Check if this person manages others — if so, they're top-level (OK)
    const managesOthers = subordinates.length > 0;
    if (!managesOthers) problems.push('no_manager');
  } else if (hasManager && !isManagedBySomeone) {
    problems.push('no_manager');
  }

  if (!emp.is_vacancy && !emp.responsibility_zone.trim()) {
    problems.push('empty_responsibility_zone');
  }
  return problems;
}

export function hasDeptProblems(
  dept: Department,
  employees: Employee[],
): boolean {
  const deptEmps = employees.filter((e) => e.department_id === dept.id);
  return deptEmps.some((e) => getEmployeeProblems(e, employees).length > 0);
}
