import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type { Department, Employee, PositionView } from '@/core/supabase';

const NODE_W = 200;
const DEPT_H = 64;
const EMP_H = 80;

export type PositionMap = Map<string, { x: number; y: number }>;

export function positionMapKey(view: PositionView, entityType: 'department' | 'employee', entityId: string): string {
  return `${view}:${entityType}:${entityId}`;
}

export function buildPositionMap(
  positions: { view: PositionView; entity_type: 'department' | 'employee'; entity_id: string; x: number; y: number }[],
  view: PositionView,
): PositionMap {
  const map: PositionMap = new Map();
  for (const p of positions) {
    if (p.view === view) {
      map.set(positionMapKey(view, p.entity_type, p.entity_id), { x: p.x, y: p.y });
    }
  }
  return map;
}

export function mergePosition(
  saved: { x: number; y: number } | undefined,
  dagrePos: { x: number; y: number } | undefined,
  nodeW: number,
  nodeH: number,
): { x: number; y: number } {
  if (saved) return saved;
  if (dagrePos) return { x: dagrePos.x - nodeW / 2, y: dagrePos.y - nodeH / 2 };
  return { x: 0, y: 0 };
}

export function layoutOrgChart(
  depts: Department[],
  employees: Employee[],
  collapsed: Set<string>,
  savedPositions: PositionMap | null,
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  const visibleDepts = depts.filter((d) => {
    let parent = d.parent_id;
    while (parent) {
      if (collapsed.has(parent)) return false;
      const parentNode = depts.find((x) => x.id === parent);
      parent = parentNode?.parent_id ?? null;
    }
    return true;
  });

  for (const d of visibleDepts) {
    g.setNode(`dept:${d.id}`, { width: NODE_W, height: DEPT_H });
    if (d.parent_id) {
      const parentVisible = visibleDepts.some((x) => x.id === d.parent_id);
      if (parentVisible) {
        g.setEdge(`dept:${d.parent_id}`, `dept:${d.id}`);
      }
    }
  }

  const visibleEmps = employees.filter(
    (e) => e.department_id && visibleDepts.some((d) => d.id === e.department_id && !collapsed.has(d.id)),
  );
  for (const e of visibleEmps) {
    g.setNode(`emp:${e.id}`, { width: NODE_W, height: EMP_H });
    if (e.department_id) g.setEdge(`dept:${e.department_id}`, `emp:${e.id}`);
  }

  dagre.layout(g);

  const nodes: Node[] = [];
  for (const d of visibleDepts) {
    const pos = g.node(`dept:${d.id}`);
    const saved = savedPositions?.get(positionMapKey('org', 'department', d.id));
    if (pos) nodes.push({ id: `dept:${d.id}`, type: 'deptNode', position: mergePosition(saved, pos, NODE_W, DEPT_H), data: { deptId: d.id } });
  }
  for (const e of visibleEmps) {
    const pos = g.node(`emp:${e.id}`);
    const saved = savedPositions?.get(positionMapKey('org', 'employee', e.id));
    if (pos) nodes.push({ id: `emp:${e.id}`, type: 'empNode', position: mergePosition(saved, pos, NODE_W, EMP_H), data: { empId: e.id } });
  }

  const edges: Edge[] = [];
  g.edges().forEach((edgeObj) => {
    edges.push({
      id: `e:${edgeObj.v}-${edgeObj.w}`,
      source: edgeObj.v,
      target: edgeObj.w,
      type: 'smoothstep',
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    });
  });

  return { nodes, edges };
}

export function detectManagerCycle(
  employees: Pick<Employee, 'id' | 'manager_id'>[],
  empId: string,
  newManagerId: string,
): boolean {
  if (empId === newManagerId) return true;
  let current: string | null = newManagerId;
  const visited = new Set<string>();
  while (current !== null) {
    if (current === empId) return true;
    if (visited.has(current)) return true;
    visited.add(current);
    const emp = employees.find((e) => e.id === current);
    current = emp?.manager_id ?? null;
  }
  return false;
}

export function detectProjectManagerCycle(
  employees: Pick<Employee, 'id' | 'project_manager_id'>[],
  empId: string,
  newPmId: string,
): boolean {
  if (empId === newPmId) return true;
  let current: string | null = newPmId;
  const visited = new Set<string>();
  while (current !== null) {
    if (current === empId) return true;
    if (visited.has(current)) return true;
    visited.add(current);
    const emp = employees.find((e) => e.id === current);
    current = emp?.project_manager_id ?? null;
  }
  return false;
}

export function layoutMatrix(
  employees: Employee[],
  savedPositions: PositionMap | null,
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const e of employees) {
    g.setNode(`emp:${e.id}`, { width: NODE_W, height: EMP_H });
  }
  for (const e of employees) {
    if (e.manager_id && employees.some((m) => m.id === e.manager_id)) {
      g.setEdge(`emp:${e.manager_id}`, `emp:${e.id}`);
    }
  }

  dagre.layout(g);

  const nodes: Node[] = employees.map((e) => {
    const pos = g.node(`emp:${e.id}`);
    const saved = savedPositions?.get(positionMapKey('matrix', 'employee', e.id));
    return {
      id: `emp:${e.id}`,
      type: 'empNode',
      position: mergePosition(saved, pos, NODE_W, EMP_H),
      data: { empId: e.id },
    };
  });

  const edges: Edge[] = [];
  for (const e of employees) {
    if (e.manager_id && employees.some((m) => m.id === e.manager_id)) {
      edges.push({
        id: `mgr:${e.manager_id}-${e.id}`,
        source: `emp:${e.manager_id}`,
        target: `emp:${e.id}`,
        type: 'smoothstep',
        style: { stroke: '#2563eb', strokeWidth: 2 },
      });
    }
    if (e.project_manager_id && employees.some((m) => m.id === e.project_manager_id)) {
      edges.push({
        id: `pm:${e.project_manager_id}-${e.id}`,
        source: `emp:${e.project_manager_id}`,
        target: `emp:${e.id}`,
        type: 'smoothstep',
        style: { stroke: '#d97706', strokeWidth: 1.5, strokeDasharray: '5 5' },
      });
    }
  }

  return { nodes, edges };
}
