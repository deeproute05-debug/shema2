import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow, type Node, type Edge, type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Loader as Loader2, Search, Workflow, Table, Network, Boxes, Sparkles, FileText, RotateCcw, Map as MapIcon, Lock, Pencil, Link2, Unlink, Plus } from 'lucide-react';
import { supabase, type Department, type Employee, type FreeNode, type FreeEdge, type NodePosition, type PositionView } from '@/core/supabase';
import { extractDbError } from '@/core/dbErrors';
import { toastError, toastSuccess, toastInfo } from '@/core/toast';
import { layoutOrgChart, layoutMatrix, buildPositionMap, detectManagerCycle, detectProjectManagerCycle, NODE_W, DEPT_H, EMP_H, type PositionMap } from '@/schema/layout';
import { DeptNodeFactory } from '@/schema/DeptNode';
import { EmpNodeFactory, type ConnectMode } from '@/schema/EmpNode';
import { SidePanel, type EmployeePatch, type SaveEmployeeResult } from '@/schema/SidePanel';
import { TEMPLATES } from '@/schema/templates';
import { useCanEdit } from '@/core/useCanEdit';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Modal } from '@/components/Modal';
import { employeeSchema, type EmployeeInput } from '@/core/formsValidation';
import type { SchemaTab } from '@/schema/types';

interface StructureData {
  depts: Department[];
  emps: Employee[];
  freeNodes: FreeNode[];
  freeEdges: FreeEdge[];
}

// Hit-test: find the visible department node whose bounds contain the
// dragged employee card's center. If several overlap, return the smallest.
function findDeptAtNode(allNodes: Node[], draggedNode: Node): string | null {
  const cx = draggedNode.position.x + NODE_W / 2;
  const cy = draggedNode.position.y + EMP_H / 2;
  let best: { id: string; area: number } | null = null;
  for (const n of allNodes) {
    if (n.type !== 'deptNode' || n.id === draggedNode.id) continue;
    const nx = n.position.x;
    const ny = n.position.y;
    if (cx >= nx && cx <= nx + NODE_W && cy >= ny && cy <= ny + DEPT_H) {
      const area = NODE_W * DEPT_H;
      if (!best || area < best.area) best = { id: n.id.replace(/^dept:/, ''), area };
    }
  }
  return best?.id ?? null;
}

export function SchemaScreen() {
  return (
    <ReactFlowProvider>
      <SchemaScreenInner />
    </ReactFlowProvider>
  );
}

function SchemaScreenInner() {
  const { t } = useTranslation();
  const canEdit = useCanEdit();
  const { fitView } = useReactFlow();
  const [tab, setTab] = useState<SchemaTab>('org');
  const [structure, setStructure] = useState<StructureData | null>(null);
  const [positions, setPositions] = useState<NodePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [showMinimap, setShowMinimap] = useState(() => {
    if (typeof window !== 'undefined') return window.innerWidth >= 640;
    return false;
  });
  const [fitViewSignal, setFitViewSignal] = useState(0);
  const posMapRef = useRef<PositionMap>(new Map());
  const userInteractedRef = useRef(false);
  const firstLoadRef = useRef(true);
  const nodesRef = useRef<Node[]>([]);
  const dragStateRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const hoverDeptIdRef = useRef<string | null>(null);
  const [coarsePointer, setCoarsePointer] = useState(() => {
    if (typeof window !== 'undefined') return window.matchMedia('(pointer: coarse)').matches;
    return false;
  });
  const [touchEdit, setTouchEdit] = useState(false);
  const [connectMode, setConnectMode] = useState<ConnectMode>('none');
  const [pendingConnectSource, setPendingConnectSource] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ empId: string; empName: string; deptId: string; deptName: string; prevX: number; prevY: number } | null>(null);
  const [addEmpOpen, setAddEmpOpen] = useState(false);
  const [addEmpKind, setAddEmpKind] = useState<'subordinate' | 'colleague'>('subordinate');
  const [addEmpSourceId, setAddEmpSourceId] = useState<string | null>(null);
  const [addEmpForm, setAddEmpForm] = useState<EmployeeInput | null>(null);
  const [addEmpFieldErrors, setAddEmpFieldErrors] = useState<Record<string, string>>({});
  const [addEmpSaving, setAddEmpSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'employee' | 'department'; id: string; name: string; affectedCount: number } | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const deleteBusyRef = useRef(false);
  const saveEmpBusyRef = useRef(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  nodesRef.current = nodes;

  const loadData = useCallback(async () => {
    const isFirst = firstLoadRef.current;
    if (isFirst) setLoading(true);
    setError(null);
    const [dRes, eRes, fnRes, feRes, posRes] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase.from('employees').select('*').order('full_name'),
      supabase.from('free_nodes').select('*'),
      supabase.from('free_edges').select('*'),
      supabase.from('node_positions').select('*'),
    ]);
    if (dRes.error) { setError(t(extractDbError(dRes.error))); if (isFirst) setLoading(false); return; }
    if (eRes.error) { setError(t(extractDbError(eRes.error))); if (isFirst) setLoading(false); return; }
    if (posRes.error) { setError(t(extractDbError(posRes.error))); if (isFirst) setLoading(false); return; }
    setStructure({
      depts: (dRes.data as Department[]) ?? [],
      emps: (eRes.data as Employee[]) ?? [],
      freeNodes: (fnRes.data as FreeNode[]) ?? [],
      freeEdges: (feRes.data as FreeEdge[]) ?? [],
    });
    setPositions((posRes.data as NodePosition[]) ?? []);
    if (isFirst) {
      setLoading(false);
      firstLoadRef.current = false;
      setFitViewSignal((n) => n + 1);
    }
  }, [t]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const handler = (e: MediaQueryListEvent) => setCoarsePointer(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const currentView: PositionView | null = tab === 'org' ? 'org' : tab === 'matrix' ? 'matrix' : null;

  // Position map is recomputed every render from `positions` but assigned to a
  // ref so the layout effect can read it without depending on it.  This keeps
  // position-only updates (drag saves) from retriggering the layout effect.
  const currentPosMap = useMemo(
    () => (currentView ? buildPositionMap(positions, currentView) : new Map()),
    [positions, currentView],
  );
  posMapRef.current = currentPosMap;

  const highlightIds = useMemo(() => {
    if (!structure || !search.trim()) return null;
    const q = search.toLowerCase();
    const ids = new Set<string>();
    for (const d of structure.depts) {
      if (d.name.toLowerCase().includes(q)) ids.add(d.id);
    }
    for (const e of structure.emps) {
      if (e.full_name.toLowerCase().includes(q) || e.position.toLowerCase().includes(q)) {
        ids.add(e.id);
      }
    }
    return ids;
  }, [structure, search]);

  const handleSelectDept = useCallback((id: string) => {
    setSelectedDeptId(id);
    setSelectedEmpId(null);
    setPanelOpen(true);
  }, []);

  const handleSelectEmp = useCallback((id: string) => {
    setSelectedEmpId(id);
    setSelectedDeptId(null);
    setPanelOpen(true);
  }, []);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);


  // Layout effect — re-runs only when structure (depts/emps/freeNodes/freeEdges),
  // tab, or collapsed changes.  Position-only updates do NOT retrigger this
  // effect, so a drag save preserves the current node set, selection, and
  // side-panel state.
  useEffect(() => {
    if (!structure) return;
    const posMap = posMapRef.current;
    if (tab === 'org') {
      const { nodes: ns, edges: es } = layoutOrgChart(structure.depts, structure.emps, collapsed, posMap);
      setNodes(ns);
      setEdges(es);
    } else if (tab === 'matrix') {
      const { nodes: ns, edges: es } = layoutMatrix(structure.emps, posMap);
      setNodes(ns);
      setEdges(es);
    } else if (tab === 'free') {
      const ns: Node[] = structure.freeNodes.map((n) => {
        const pos = (n.pos as { x?: number; y?: number } | null) ?? { x: 0, y: 0 };
        return { id: n.id, type: 'freeNode', position: { x: pos.x ?? 0, y: pos.y ?? 0 }, data: { nodeId: n.id } };
      });
      const es: Edge[] = structure.freeEdges.map((e) => ({
        id: e.id, source: e.source, target: e.target,
        style: e.kind === 'dashed' ? { stroke: '#94a3b8', strokeDasharray: '5 5' } : { stroke: '#94a3b8' },
      }));
      setNodes(ns);
      setEdges(es);
    }
  }, [structure, tab, collapsed, setNodes, setEdges]);

  // Reset the interaction flag only on tab switch so fitView can run for the
  // new view.  Data refreshes do NOT reset it — if the user panned/zoomed,
  // the viewport stays put.
  useEffect(() => {
    userInteractedRef.current = false;
    setTouchEdit(false);
    setConnectMode('none');
    setPendingConnectSource(null);
    setSelectedEdgeId(null);
  }, [tab]);

  // Fit view only when fitViewSignal changes (first load or tab switch) and
  // the user has not panned/zoomed since the last tab switch.  The ReactFlow
  // Controls panel provides the explicit "fit" button independently.
  useEffect(() => {
    if (fitViewSignal === 0) return;
    if (!structure || loading || error) return;
    if (tab === 'list') return;
    if (tab === 'free' ? !structure.freeNodes.length : !(structure.depts.length || structure.emps.length)) return;
    if (userInteractedRef.current) return;
    const timer = setTimeout(() => fitView({ padding: 0.2, maxZoom: 1.5 }), 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitViewSignal, fitView]);

  const lastToastRef = useRef(0);

  const savePosition = useCallback(async (
    view: PositionView,
    entityType: 'department' | 'employee',
    entityId: string,
    x: number,
    y: number,
  ) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const { error } = await supabase
      .from('node_positions')
      .upsert({ view, entity_type: entityType, entity_id: entityId, x, y });
    if (error) {
      toastError(t(extractDbError(error)));
      void loadData();
    } else {
      const now = Date.now();
      if (now - lastToastRef.current > 1500) {
        lastToastRef.current = now;
        toastSuccess(t('schema.position_saved'));
      }
      // Update only the positions array — structure is unchanged, so the
      // layout effect does not re-run and nodes are not rebuilt.
      setPositions((prev) => {
        const existing = prev.findIndex(
          (p) => p.view === view && p.entity_type === entityType && p.entity_id === entityId,
        );
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = { ...next[existing], x, y };
          return next;
        }
        return [...prev, { view, entity_type: entityType, entity_id: entityId, x, y, updated_at: new Date().toISOString() }];
      });
    }
  }, [t, loadData]);

  const handleNodesChange = useCallback((changes: NodeChange<Node>[]) => {
    onNodesChange(changes);
  }, [onNodesChange]);

  const handleNodeDragStop = useCallback((_: MouseEvent | TouchEvent, node: Node) => {
    // Clear any hover ring left from the drag.
    if (hoverDeptIdRef.current !== null) {
      hoverDeptIdRef.current = null;
      setNodes((prev) => prev.map((n) => n.type === 'deptNode' ? { ...n, className: undefined } : n));
    }
    if (!canEdit || !currentView) return;
    const isDept = node.type === 'deptNode';
    // Org-tab employee dropped on a different department → confirm move.
    // Do NOT save the dropped position in this case.
    if (!isDept && tab === 'org') {
      const empId = (node.data as { empId: string }).empId;
      if (empId) {
        const dropDeptId = findDeptAtNode(nodesRef.current, node);
        if (dropDeptId) {
          const emp = structure?.emps.find((e) => e.id === empId);
          const dept = structure?.depts.find((d) => d.id === dropDeptId);
          if (emp && dept && emp.department_id !== dropDeptId) {
            const start = dragStateRef.current;
            setMoveTarget({
              empId,
              empName: emp.is_vacancy ? t('employees.vacancy_label') : emp.full_name,
              deptId: dropDeptId,
              deptName: dept.name,
              prevX: start ? start.x : node.position.x,
              prevY: start ? start.y : node.position.y,
            });
            return;
          }
        }
      }
    }
    const entityType = isDept ? 'department' : 'employee';
    const entityId = isDept
      ? (node.data as { deptId: string }).deptId
      : (node.data as { empId: string }).empId;
    if (!entityId) return;
    void savePosition(currentView, entityType, entityId, node.position.x, node.position.y);
  }, [canEdit, currentView, savePosition, tab, structure, t, setNodes]);

  const handleMove = useCallback((event: MouseEvent | TouchEvent | null) => {
    if (event !== null) userInteractedRef.current = true;
  }, []);

  const handleNodeDragStart = useCallback((_: MouseEvent | TouchEvent, node: Node) => {
    if (node.type === 'empNode') {
      dragStateRef.current = { id: node.id, x: node.position.x, y: node.position.y };
    }
  }, []);

  const handleNodeDrag = useCallback((_: MouseEvent | TouchEvent, node: Node) => {
    if (!canEdit || tab !== 'org' || node.type !== 'empNode') return;
    const empId = (node.data as { empId: string }).empId;
    const emp = structure?.emps.find((e) => e.id === empId);
    if (!emp) return;
    const dropDeptId = findDeptAtNode(nodesRef.current, node);
    const targetId = dropDeptId && dropDeptId !== emp.department_id ? dropDeptId : null;
    if (hoverDeptIdRef.current === targetId) return;
    hoverDeptIdRef.current = targetId;
    setNodes((prev) => prev.map((n) => {
      if (n.type !== 'deptNode') return n;
      const isTarget = targetId !== null && n.id === `dept:${targetId}`;
      const hasRing = typeof n.className === 'string' && n.className.includes('ring-brand-400');
      if (isTarget && !hasRing) return { ...n, className: 'z-10 ring-2 ring-brand-400 rounded-lg' };
      if (!isTarget && hasRing) return { ...n, className: undefined };
      return n;
    }));
  }, [canEdit, tab, structure, setNodes]);

  const moveEmpDept = useCallback(async (empId: string, newDeptId: string) => {
    if (!structure) return;
    const prevEmps = structure.emps;
    const prevPositions = positions;
    // Update structure AND drop the stale saved position in the same batch, so the
    // layout effect (which reads the position map on the structure change) re-seats
    // the card under its new department immediately.
    setStructure((prev) => prev ? {
      ...prev,
      emps: prev.emps.map((e) => e.id === empId ? { ...e, department_id: newDeptId } : e),
    } : prev);
    setPositions((prev) => prev.filter((p) => !(p.view === 'org' && p.entity_type === 'employee' && p.entity_id === empId)));
    const { data, error } = await supabase
      .from('employees')
      .update({ department_id: newDeptId })
      .eq('id', empId)
      .select('id');
    if (error) {
      setStructure((prev) => prev ? { ...prev, emps: prevEmps } : prev);
      setPositions(prevPositions);
      toastError(t(extractDbError(error)));
      return;
    }
    if (!data || data.length === 0) {
      setStructure((prev) => prev ? { ...prev, emps: prevEmps } : prev);
      setPositions(prevPositions);
      toastError(t('errors.permission_denied'));
      return;
    }
    // Delete only this employee's org-view saved position so the layout
    // places the card under the new department.
    const { error: delError } = await supabase
      .from('node_positions')
      .delete()
      .eq('view', 'org')
      .eq('entity_type', 'employee')
      .eq('entity_id', empId);
    if (delError) {
      toastError(t(extractDbError(delError)));
    }
    toastSuccess(t('schema.emp_moved'));
  }, [structure, positions, t]);

  const confirmMove = useCallback(() => {
    if (!moveTarget) return;
    const target = moveTarget;
    setMoveTarget(null);
    void moveEmpDept(target.empId, target.deptId);
  }, [moveTarget, moveEmpDept]);

  const cancelMove = useCallback(() => {
    if (!moveTarget) return;
    setNodes((prev) => prev.map((n) => n.id === `emp:${moveTarget.empId}` ? { ...n, position: { x: moveTarget.prevX, y: moveTarget.prevY } } : n));
    setMoveTarget(null);
  }, [moveTarget, setNodes]);

  const setManager = useCallback(async (empId: string, newManagerId: string | null) => {
    if (!structure) return;
    const emp = structure.emps.find((e) => e.id === empId);
    if (!emp) return;

    if (newManagerId !== null) {
      if (newManagerId === empId) {
        toastError(t('errors.self_manager'));
        return;
      }
      if (detectManagerCycle(structure.emps, empId, newManagerId)) {
        toastError(t('errors.cycle_detected'));
        return;
      }
    }

    const prevEmps = structure.emps;
    setStructure((prev) => prev ? {
      ...prev,
      emps: prev.emps.map((e) => e.id === empId ? { ...e, manager_id: newManagerId } : e),
    } : prev);

    const { data, error } = await supabase
      .from('employees')
      .update({ manager_id: newManagerId })
      .eq('id', empId)
      .select('id');

    if (error) {
      setStructure((prev) => prev ? { ...prev, emps: prevEmps } : prev);
      toastError(t(extractDbError(error)));
      return;
    }
    if (!data || data.length === 0) {
      // RLS filters rows silently (no error): nothing was written.
      setStructure((prev) => prev ? { ...prev, emps: prevEmps } : prev);
      toastError(t('errors.permission_denied'));
      return;
    }

    toastSuccess(t(newManagerId === null ? 'schema.manager_disconnected' : 'schema.manager_set'));
  }, [structure, t]);

  const setProjectManager = useCallback(async (empId: string, newPmId: string | null) => {
    if (!structure) return;
    const emp = structure.emps.find((e) => e.id === empId);
    if (!emp) return;

    if (newPmId !== null) {
      if (newPmId === empId) {
        toastError(t('errors.self_project_manager'));
        return;
      }
      if (detectProjectManagerCycle(structure.emps, empId, newPmId)) {
        toastError(t('errors.pm_cycle_detected'));
        return;
      }
    }

    const prevEmps = structure.emps;
    setStructure((prev) => prev ? {
      ...prev,
      emps: prev.emps.map((e) => e.id === empId ? { ...e, project_manager_id: newPmId } : e),
    } : prev);

    const { data, error } = await supabase
      .from('employees')
      .update({ project_manager_id: newPmId })
      .eq('id', empId)
      .select('id');

    if (error) {
      setStructure((prev) => prev ? { ...prev, emps: prevEmps } : prev);
      toastError(t(extractDbError(error)));
      return;
    }
    if (!data || data.length === 0) {
      setStructure((prev) => prev ? { ...prev, emps: prevEmps } : prev);
      toastError(t('errors.permission_denied'));
      return;
    }

    toastSuccess(t(newPmId === null ? 'schema.pm_disconnected' : 'schema.pm_set'));
  }, [structure, t]);

  const handleConnect = useCallback((connection: { source: string | null; target: string | null; sourceHandle?: string | null; targetHandle?: string | null }) => {
    if (!connection.source || !connection.target) return;
    // Ignore connections that do not match the active connect mode.
    if (connectMode === 'manager') {
      void setManager(connection.target.replace(/^emp:/, ''), connection.source.replace(/^emp:/, ''));
    } else if (connectMode === 'pm') {
      void setProjectManager(connection.target.replace(/^emp:/, ''), connection.source.replace(/^emp:/, ''));
    }
    setPendingConnectSource(null);
  }, [connectMode, setManager, setProjectManager]);

  const handleConnectTarget = useCallback((targetId: string, kind: 'manager' | 'pm') => {
    if (!pendingConnectSource || pendingConnectSource === targetId) {
      setPendingConnectSource(null);
      return;
    }
    if (kind === 'manager') {
      void setManager(targetId, pendingConnectSource);
    } else {
      void setProjectManager(targetId, pendingConnectSource);
    }
    setPendingConnectSource(null);
  }, [pendingConnectSource, setManager, setProjectManager]);

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    // Identify edge type by its target handle (pm edges use 'pm-handle');
    // never parse the UUID portion of the edge id.
    if (edge.targetHandle === 'pm-handle' || edge.id.startsWith('mgr:')) {
      setSelectedEdgeId(edge.id);
      setSelectedEmpId(null);
      setSelectedDeptId(null);
      setPanelOpen(false);
    } else {
      setSelectedEdgeId(null);
    }
  }, []);

  const handleDisconnectEdge = useCallback(() => {
    if (!selectedEdgeId) return;
    const edge = edges.find((e) => e.id === selectedEdgeId);
    if (!edge) {
      setSelectedEdgeId(null);
      toastError(t('common.unknown_error'));
      return;
    }
    const targetEmpId = edge.target.replace(/^emp:/, '');
    if (edge.targetHandle === 'pm-handle') {
      void setProjectManager(targetEmpId, null);
    } else {
      void setManager(targetEmpId, null);
    }
    setSelectedEdgeId(null);
  }, [selectedEdgeId, edges, setManager, setProjectManager, t]);

  const toggleConnectMode = useCallback(() => {
    setConnectMode((prev) => prev === 'manager' ? 'none' : 'manager');
    setPendingConnectSource(null);
    setSelectedEdgeId(null);
  }, []);

  const togglePmMode = useCallback(() => {
    setConnectMode((prev) => prev === 'pm' ? 'none' : 'pm');
    setPendingConnectSource(null);
    setSelectedEdgeId(null);
  }, []);

  const handleSetConnectSource = useCallback((id: string) => {
    setPendingConnectSource((prev) => prev === id ? null : id);
  }, []);

  const pendingSourceName = useMemo(() => {
    if (!pendingConnectSource || !structure) return null;
    const emp = structure.emps.find((e) => e.id === pendingConnectSource);
    if (!emp) return null;
    return emp.is_vacancy ? t('employees.vacancy_label') : emp.full_name;
  }, [pendingConnectSource, structure, t]);

  const handleAddEmployee = useCallback((empId: string, kind: 'subordinate' | 'colleague') => {
    if (!structure) return;
    setAddEmpSourceId(empId);
    setAddEmpKind(kind);
    setAddEmpForm({
      full_name: '',
      position: '',
      department_id: null,
      duties: '',
      responsibility_zone: '',
      manager_id: null,
      project_manager_id: null,
      is_vacancy: false,
    });
    setAddEmpFieldErrors({});
    setAddEmpOpen(true);
  }, [structure]);

  const saveAddEmployee = useCallback(async () => {
    if (!addEmpForm || !addEmpSourceId || !structure) return;
    const sourceEmp = structure.emps.find((e) => e.id === addEmpSourceId);
    if (!sourceEmp) return;

    const parsed = employeeSchema.safeParse(addEmpForm);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errs[issue.path[0] as string] = issue.message;
      }
      setAddEmpFieldErrors(errs);
      return;
    }

    setAddEmpSaving(true);
    const base = parsed.data;
    const insertData = {
      ...base,
      // A vacancy never stores a name, even if one was typed before ticking the box.
      full_name: base.is_vacancy ? '' : base.full_name,
      // Subordinate: manager = clicked employee, dept = clicked employee's dept.
      // Colleague: same dept and same manager as the clicked employee.
      department_id: sourceEmp.department_id,
      manager_id: addEmpKind === 'subordinate' ? addEmpSourceId : sourceEmp.manager_id,
      project_manager_id: null,
    };

    const { data, error } = await supabase
      .from('employees')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      toastError(t(extractDbError(error)));
      setAddEmpSaving(false);
      return;
    }
    if (!data) {
      toastError(t('errors.permission_denied'));
      setAddEmpSaving(false);
      return;
    }

    setStructure((prev) => prev ? { ...prev, emps: [...prev.emps, data as Employee] } : prev);
    toastSuccess(t('employees.created'));
    setAddEmpOpen(false);
    setAddEmpForm(null);
    setAddEmpFieldErrors({});
    setAddEmpSaving(false);
    setAddEmpSourceId(null);
  }, [addEmpForm, addEmpSourceId, addEmpKind, structure, t]);

  const cancelAddEmployee = useCallback(() => {
    setAddEmpOpen(false);
    setAddEmpForm(null);
    setAddEmpFieldErrors({});
    setAddEmpSaving(false);
    setAddEmpSourceId(null);
  }, []);

  const requestDelete = useCallback((kind: 'employee' | 'department', id: string) => {
    if (!structure) return;
    if (kind === 'employee') {
      const emp = structure.emps.find((e) => e.id === id);
      if (!emp) return;
      const name = emp.is_vacancy ? t('employees.vacancy_label') : emp.full_name;
      // De-duplicated count of OTHER employees that would lose a manager and/or
      // project manager when this employee is deleted.
      const affected = new Set<string>();
      for (const e of structure.emps) {
        if (e.id === id) continue;
        if (e.manager_id === id) affected.add(e.id);
        if (e.project_manager_id === id) affected.add(e.id);
      }
      setDeleteTarget({ kind, id, name, affectedCount: affected.size });
      return;
    }
    // kind === 'department'
    const dept = structure.depts.find((d) => d.id === id);
    if (!dept) return;
    const empCount = structure.emps.filter((e) => e.department_id === id).length;
    const subDeptCount = structure.depts.filter((d) => d.parent_id === id).length;
    if (empCount > 0 || subDeptCount > 0) {
      // Do NOT call the DB and do NOT open the confirm dialog.
      toastError(t('schema.delete_dept_blocked', { employees: empCount, sub_depts: subDeptCount }));
      return;
    }
    setDeleteTarget({ kind, id, name: dept.name, affectedCount: 0 });
  }, [structure, t]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || !structure || deleteBusyRef.current) return;
    deleteBusyRef.current = true; // guard against double tap on Confirm
    setDeleteSaving(true);
    const kind = deleteTarget.kind;
    const id = deleteTarget.id;
    const prevEmps = structure.emps;
    const prevDepts = structure.depts;
    const prevPositions = positions;

    if (kind === 'employee') {
      // Optimistic: remove the employee, null manager_id / project_manager_id on
      // dependents (mirrors ON DELETE SET NULL), and drop the deleted employee's
      // local positions. Structure + positions rolled back together on error.
      setStructure((prev) => prev ? {
        ...prev,
        emps: prev.emps
          .filter((e) => e.id !== id)
          .map((e) => (e.manager_id === id || e.project_manager_id === id)
            ? {
                ...e,
                manager_id: e.manager_id === id ? null : e.manager_id,
                project_manager_id: e.project_manager_id === id ? null : e.project_manager_id,
              }
            : e),
      } : prev);
      setPositions((prev) => prev.filter((p) => !(p.entity_type === 'employee' && p.entity_id === id)));

      const { data, error } = await supabase
        .from('employees')
        .delete()
        .eq('id', id)
        .select('id');

      if (error) {
        setStructure((prev) => prev ? { ...prev, emps: prevEmps } : prev);
        setPositions(prevPositions);
        toastError(t(extractDbError(error)));
        setDeleteSaving(false);
        deleteBusyRef.current = false;
        return;
      }
      if (!data || data.length === 0) {
        setStructure((prev) => prev ? { ...prev, emps: prevEmps } : prev);
        setPositions(prevPositions);
        toastError(t('errors.permission_denied'));
        setDeleteSaving(false);
        deleteBusyRef.current = false;
        return;
      }

      toastSuccess(t('employees.deleted'));
      setDeleteTarget(null);
      setDeleteSaving(false);
      deleteBusyRef.current = false;
      setSelectedEmpId(null);
      setSelectedDeptId(null);
      setPanelOpen(false);
      return;
    }

    // kind === 'department' (empty department only — requestDelete guards this)
    setStructure((prev) => prev ? {
      ...prev,
      depts: prev.depts.filter((d) => d.id !== id),
    } : prev);
    setPositions((prev) => prev.filter((p) => !(p.entity_type === 'department' && p.entity_id === id)));

    const { data, error } = await supabase
      .from('departments')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) {
      setStructure((prev) => prev ? { ...prev, depts: prevDepts } : prev);
      setPositions(prevPositions);
      toastError(t(extractDbError(error)));
      setDeleteSaving(false);
      deleteBusyRef.current = false;
      return;
    }
    if (!data || data.length === 0) {
      setStructure((prev) => prev ? { ...prev, depts: prevDepts } : prev);
      setPositions(prevPositions);
      toastError(t('errors.permission_denied'));
      setDeleteSaving(false);
      deleteBusyRef.current = false;
      return;
    }

    toastSuccess(t('departments.deleted'));
    setDeleteTarget(null);
    setDeleteSaving(false);
    deleteBusyRef.current = false;
    setSelectedDeptId(null);
    setSelectedEmpId(null);
    setPanelOpen(false);
  }, [deleteTarget, structure, positions, t]);

  const cancelDelete = useCallback(() => {
    setDeleteTarget(null);
    setDeleteSaving(false);
    deleteBusyRef.current = false;
  }, []);

  const saveEmployee = useCallback(async (id: string, patch: EmployeePatch): Promise<SaveEmployeeResult> => {
    if (!structure || saveEmpBusyRef.current) return { ok: false };
    saveEmpBusyRef.current = true;
    const { data, error } = await supabase
      .from('employees')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      saveEmpBusyRef.current = false;
      return { ok: false, message: t(extractDbError(error)) };
    }
    if (!data) {
      saveEmpBusyRef.current = false;
      return { ok: false, message: t('errors.permission_denied') };
    }
    // Replace only the updated row; keep other rows unchanged.
    setStructure((prev) => prev ? {
      ...prev,
      emps: prev.emps.map((e) => e.id === id ? (data as Employee) : e),
    } : prev);
    toastSuccess(t('employees.updated'));
    saveEmpBusyRef.current = false;
    return { ok: true };
  }, [structure, t]);

  const nodeTypes = useMemo(() => {
    if (!structure) return undefined;
    return {
      deptNode: DeptNodeFactory(structure.depts, structure.emps, handleSelectDept, toggleCollapse, collapsed, highlightIds),
      empNode: EmpNodeFactory(
        structure.emps, structure.depts, handleSelectEmp, highlightIds,
        canEdit && tab === 'matrix' && connectMode !== 'none' && (!coarsePointer || touchEdit),
        connectMode,
        pendingConnectSource,
        handleConnectTarget,
        handleSetConnectSource,
        coarsePointer,
        handleAddEmployee,
        canEdit && (tab === 'org' || tab === 'matrix') && connectMode === 'none' && (!coarsePointer || touchEdit),
      ),
      freeNode: FreeNodeFactory(structure.freeNodes),
    };
  }, [
    structure, handleSelectDept, handleSelectEmp, toggleCollapse, collapsed, highlightIds,
    canEdit, tab, connectMode, coarsePointer, touchEdit, pendingConnectSource, handleConnectTarget,
    handleSetConnectSource, handleAddEmployee,
  ]);

  const handleResetLayout = useCallback(async () => {
    if (!currentView) return;
    const { error } = await supabase
      .from('node_positions')
      .delete()
      .eq('view', currentView);
    if (error) {
      toastError(t(extractDbError(error)));
      return;
    }
    setResetOpen(false);
    toastSuccess(t('schema.layout_reset'));
    await loadData();
    userInteractedRef.current = false;
    setFitViewSignal((n) => n + 1);
  }, [currentView, t, loadData]);

  const selectedDept = structure?.depts.find((d) => d.id === selectedDeptId) ?? null;
  const selectedEmp = structure?.emps.find((e) => e.id === selectedEmpId) ?? null;

  const hasOrgData = structure ? structure.depts.length > 0 || structure.emps.length > 0 : false;
  const hasFreeData = structure ? structure.freeNodes.length > 0 : false;
  const hasCustomLayout = positions.some((p) => p.view === currentView);

  const tabs: { id: SchemaTab; label: string; icon: typeof Network }[] = [
    { id: 'org', label: t('schema.tab_org'), icon: Network },
    { id: 'matrix', label: t('schema.tab_matrix'), icon: Workflow },
    { id: 'list', label: t('schema.tab_list'), icon: Table },
    { id: 'free', label: t('schema.tab_free'), icon: Boxes },
  ];

  const showCanvas = structure && !loading && !error && tab !== 'list' &&
    (tab === 'free' ? hasFreeData : hasOrgData);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Workflow className="h-6 w-6 text-brand-600" />
            {t('schema.title')}
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{canEdit ? t('schema.subtitle_editable') : t('schema.subtitle')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-ink-100 p-1 dark:bg-ink-800">
        {tabs.map((tb) => {
          const Icon = tb.icon;
          return (
            <button
              key={tb.id}
              onClick={() => { setTab(tb.id); setFitViewSignal((n) => n + 1); }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors min-h-[44px] ${
                tab === tb.id
                  ? 'bg-white text-brand-700 shadow-sm dark:bg-ink-900 dark:text-brand-200'
                  : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tb.label}</span>
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-ink-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {error && !loading && (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <p className="mb-3 text-sm text-danger-600">{error}</p>
          <button onClick={() => void loadData()} className="btn-secondary">{t('common.retry')}</button>
        </div>
      )}

      {/* Empty schema */}
      {structure && !loading && !error && !hasOrgData && tab !== 'free' && (
        <EmptySchema structure={structure} onCreated={loadData} />
      )}

      {/* Empty free-form */}
      {structure && !loading && !error && tab === 'free' && !hasFreeData && !hasOrgData && (
        <EmptyFreeForm />
      )}

      {/* Search bar (for org/matrix/free) */}
      {structure && !loading && !error && tab !== 'list' && (hasOrgData || hasFreeData) && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-10"
            placeholder={t('schema.search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Canvas (org/matrix/free) */}
      {showCanvas && (
        <div className="relative h-[70vh] min-h-[400px] overflow-hidden rounded-xl border border-ink-200 bg-ink-50 dark:border-ink-800 dark:bg-ink-950" dir="ltr">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={handleNodeDragStart}
            onNodeDrag={handleNodeDrag}
            onNodeDragStop={handleNodeDragStop}
            onMove={handleMove}
            nodeTypes={nodeTypes}
            fitView={false}
            minZoom={0.05}
            maxZoom={2}
            nodesDraggable={canEdit && tab !== 'free' && (!coarsePointer || touchEdit) && connectMode === 'none'}
            nodesConnectable={canEdit && tab === 'matrix' && connectMode !== 'none' && (!coarsePointer || touchEdit)}
            onConnect={handleConnect}
            onEdgeClick={handleEdgeClick}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
            panOnDrag
            selectionOnDrag={false}
            panOnScroll={false}
            zoomOnPinch
            nodeDragThreshold={coarsePointer ? 8 : undefined}
            preventScrolling
          >
            <Background gap={16} size={1} />
            <Controls
              showInteractive={false}
              className="!rounded-lg !border-ink-200 !bg-white !shadow-md dark:!border-ink-700 dark:!bg-ink-900"
            />
            {showMinimap && (
              <MiniMap
                pannable
                zoomable
                className="!rounded-lg !border !border-ink-200 !bg-white !shadow-md dark:!border-ink-700 dark:!bg-ink-900"
                maskColor="rgba(0,0,0,0.05)"
                nodeColor={(n) => {
                  if (n.type === 'deptNode') {
                    const dept = structure?.depts.find((d) => d.id === (n.data as { deptId: string }).deptId);
                    return dept?.color ?? '#94a3b8';
                  }
                  return '#2563eb';
                }}
              />
            )}
          </ReactFlow>
          {/* Touch edit toggle — coarse pointer + editor/owner + org/matrix only */}
          {coarsePointer && canEdit && (tab === 'org' || tab === 'matrix') && (
            <button
              onClick={() => setTouchEdit((v) => !v)}
              className={`absolute top-3 left-3 z-10 inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-md transition-colors ${
                touchEdit
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-900/30 dark:text-brand-200'
                  : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-100 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 dark:hover:bg-ink-800'
              }`}
              aria-label={touchEdit ? t('schema.touch_edit_done') : t('schema.touch_edit_start')}
              aria-pressed={touchEdit}
            >
              {touchEdit ? <Pencil className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              <span>{touchEdit ? t('schema.touch_edit_on') : t('schema.touch_edit_off')}</span>
            </button>
          )}
          {touchEdit && coarsePointer && canEdit && (tab === 'org' || tab === 'matrix') && (
            <p className="pointer-events-none absolute top-16 left-3 z-10 rounded-md bg-ink-900/80 px-2 py-1 text-xs text-white dark:bg-ink-700/80">
              {t('schema.touch_edit_hint')}
            </p>
          )}
          {/* Connect toolbar — editor/owner, matrix tab only */}
          {canEdit && tab === 'matrix' && (!coarsePointer || touchEdit) && (
            <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
              <button
                onClick={toggleConnectMode}
                className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-md transition-colors ${
                  connectMode === 'manager'
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-900/30 dark:text-brand-200'
                    : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-100 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 dark:hover:bg-ink-800'
                }`}
                aria-label={t('schema.connect_manager')}
                aria-pressed={connectMode === 'manager'}
              >
                <Link2 className="h-4 w-4" />
                <span>{t('schema.connect_manager_short')}</span>
              </button>
              <button
                onClick={togglePmMode}
                className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-md transition-colors ${
                  connectMode === 'pm'
                    ? 'border-warning-500 bg-warning-50 text-warning-700 dark:border-warning-400 dark:bg-warning-900/30 dark:text-warning-200'
                    : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-100 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 dark:hover:bg-ink-800'
                }`}
                aria-label={t('schema.connect_pm')}
                aria-pressed={connectMode === 'pm'}
              >
                <Link2 className="h-4 w-4" />
                <span>{t('schema.connect_pm_short')}</span>
              </button>
            </div>
          )}
          {connectMode === 'manager' && canEdit && tab === 'matrix' && (
            <p className="pointer-events-none absolute top-28 right-3 z-10 max-w-[220px] rounded-md bg-ink-900/80 px-2 py-1 text-xs text-white dark:bg-ink-700/80">
              {pendingSourceName
                ? t('schema.connect_source_selected', { name: pendingSourceName })
                : t('schema.connect_manager_on')}
            </p>
          )}
          {connectMode === 'pm' && canEdit && tab === 'matrix' && (
            <p className="pointer-events-none absolute top-28 right-3 z-10 max-w-[220px] rounded-md bg-ink-900/80 px-2 py-1 text-xs text-white dark:bg-ink-700/80">
              {pendingSourceName
                ? t('schema.connect_source_selected', { name: pendingSourceName })
                : t('schema.connect_pm_on')}
            </p>
          )}
          {/* Disconnect button when an edge is selected */}
          {canEdit && tab === 'matrix' && selectedEdgeId && (
            <button
              onClick={handleDisconnectEdge}
              className="absolute bottom-4 right-4 z-10 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-danger-300 bg-white px-3 py-2 text-sm font-medium text-danger-600 shadow-md transition-colors hover:bg-danger-50 dark:border-danger-700 dark:bg-ink-900 dark:text-danger-400 dark:hover:bg-ink-800"
            >
              <Unlink className="h-4 w-4" />
              <span>{(() => {
                const edge = edges.find((e) => e.id === selectedEdgeId);
                return edge && edge.targetHandle === 'pm-handle' ? t('schema.disconnect_pm') : t('schema.disconnect_manager');
              })()}</span>
            </button>
          )}
          {/* Minimap toggle button — hidden on small screens where minimap is off by default */}
          <button
            onClick={() => setShowMinimap((v) => !v)}
            className="absolute bottom-4 left-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 shadow-md transition-colors hover:bg-ink-100 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 sm:hidden"
            aria-label={showMinimap ? t('schema.hide_minimap') : t('schema.show_minimap')}
            title={showMinimap ? t('schema.hide_minimap') : t('schema.show_minimap')}
          >
            <MapIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* List tab */}
      {structure && !loading && !error && tab === 'list' && (
        <ListTab depts={structure.depts} emps={structure.emps} onSelectEmp={handleSelectEmp} />
      )}

      {/* Action buttons for org/matrix views */}
      {structure && !loading && !error && (tab === 'org' || tab === 'matrix') && hasOrgData && (
        <div className="flex items-center justify-between gap-2">
          {tab === 'org' && (
            <button
              onClick={() => setCollapsed(new Set())}
              className="btn-secondary"
            >
              <Sparkles className="h-4 w-4" />
              {t('schema.expand_all')}
            </button>
          )}
          {tab === 'matrix' && <span />}
          {canEdit && hasCustomLayout && (
            <button
              onClick={() => setResetOpen(true)}
              className="btn-secondary"
            >
              <RotateCcw className="h-4 w-4" />
              {t('schema.reset_layout')}
            </button>
          )}
        </div>
      )}

      {!canEdit && (tab === 'org' || tab === 'matrix') && hasOrgData && structure && !loading && !error && (
        <p className="text-center text-xs text-ink-400">{t('common.read_only')}</p>
      )}

      <SidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        selectedDept={selectedDept}
        selectedEmp={selectedEmp}
        depts={structure?.depts ?? []}
        employees={structure?.emps ?? []}
        onSelectEmp={handleSelectEmp}
        onSelectDept={handleSelectDept}
        canEdit={canEdit}
        onRequestDelete={requestDelete}
        onSaveEmployee={saveEmployee}
      />

      <ConfirmDialog
        open={resetOpen}
        title={t('schema.reset_layout_title')}
        message={t('schema.reset_layout_confirm')}
        confirmLabel={t('schema.reset_layout')}
        onConfirm={() => void handleResetLayout()}
        onCancel={() => setResetOpen(false)}
      />

      <ConfirmDialog
        open={moveTarget !== null}
        title={t('schema.move_emp_title')}
        message={moveTarget ? t('schema.move_emp_confirm', { name: moveTarget.empName, department: moveTarget.deptName }) : ''}
        confirmLabel={t('schema.move_emp_confirm_btn')}
        confirmKind="primary"
        onConfirm={confirmMove}
        onCancel={cancelMove}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget?.kind === 'department' ? t('schema.delete_department_title') : t('schema.delete_employee_title')}
        message={deleteTarget
          ? deleteTarget.kind === 'department'
            ? t('schema.delete_department_confirm', { name: deleteTarget.name })
            : t('schema.delete_employee_confirm', { name: deleteTarget.name, count: deleteTarget.affectedCount })
          : ''}
        confirmLabel={t('common.delete')}
        confirmKind="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={cancelDelete}
      />

      <Modal
        open={addEmpOpen}
        title={t(addEmpKind === 'subordinate' ? 'schema.add_subordinate_title' : 'schema.add_colleague_title')}
        onClose={cancelAddEmployee}
        footer={
          <>
            <button onClick={cancelAddEmployee} className="btn-secondary" disabled={addEmpSaving}>
              {t('common.cancel')}
            </button>
            <button onClick={() => void saveAddEmployee()} className="btn-primary" disabled={addEmpSaving}>
              {addEmpSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t('common.save')}
            </button>
          </>
        }
      >
        {addEmpForm && (
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                checked={addEmpForm.is_vacancy}
                onChange={(e) => setAddEmpForm({ ...addEmpForm, is_vacancy: e.target.checked })}
                disabled={addEmpSaving}
              />
              <span className="text-sm font-medium">{t('employees.is_vacancy')}</span>
            </label>

            {!addEmpForm.is_vacancy && (
              <div className="space-y-1.5">
                <label className="label" htmlFor="add-emp-name">{t('employees.full_name')}</label>
                <input
                  id="add-emp-name"
                  className="input"
                  value={addEmpForm.full_name}
                  onChange={(e) => setAddEmpForm({ ...addEmpForm, full_name: e.target.value })}
                  disabled={addEmpSaving}
                />
                {addEmpFieldErrors.full_name && <p className="text-sm text-danger-600">{t(addEmpFieldErrors.full_name)}</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="label" htmlFor="add-emp-position">{t('employees.position')}</label>
              <input
                id="add-emp-position"
                className="input"
                value={addEmpForm.position}
                onChange={(e) => setAddEmpForm({ ...addEmpForm, position: e.target.value })}
                disabled={addEmpSaving}
              />
            </div>

            <div className="space-y-1.5">
              <label className="label" htmlFor="add-emp-duties">{t('employees.duties')}</label>
              <textarea
                id="add-emp-duties"
                className="input min-h-[60px]"
                value={addEmpForm.duties}
                onChange={(e) => setAddEmpForm({ ...addEmpForm, duties: e.target.value })}
                disabled={addEmpSaving}
              />
            </div>

            <div className="space-y-1.5">
              <label className="label" htmlFor="add-emp-zone">{t('employees.responsibility_zone')}</label>
              <textarea
                id="add-emp-zone"
                className="input min-h-[60px]"
                value={addEmpForm.responsibility_zone}
                onChange={(e) => setAddEmpForm({ ...addEmpForm, responsibility_zone: e.target.value })}
                disabled={addEmpSaving}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function FreeNodeFactory(freeNodes: FreeNode[]) {
  const Component = memo(({ data }: { data: { nodeId: string } }) => {
    const node = freeNodes.find((n) => n.id === data.nodeId);
    if (!node) return null;
    return (
      <div
        className="flex min-w-[120px] flex-col rounded-lg border-2 border-ink-300 bg-white px-3 py-2 dark:border-ink-700 dark:bg-ink-900"
        dir="ltr"
      >
        <span className="text-xs font-medium capitalize text-ink-600 dark:text-ink-300">{node.type}</span>
        <span className="truncate text-sm font-semibold">{node.label}</span>
      </div>
    );
  });
  return Component;
}

function ListTab({
  depts, emps, onSelectEmp,
}: {
  depts: Department[];
  emps: Employee[];
  onSelectEmp: (id: string) => void;
}) {
  const { t } = useTranslation();
  const deptName = (id: string | null) => depts.find((d) => d.id === id)?.name ?? '—';
  const managerName = (id: string | null) => {
    if (!id) return '—';
    const m = emps.find((e) => e.id === id);
    return m ? (m.is_vacancy ? t('employees.vacancy_label') : m.full_name) : '—';
  };

  if (emps.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-12 text-center">
        <Table className="mb-3 h-10 w-10 text-ink-300" />
        <p className="text-sm text-ink-400">{t('schema.empty_list')}</p>
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-200 dark:border-ink-800">
            <th className="px-4 py-2 text-left font-medium text-ink-400">{t('employees.full_name')}</th>
            <th className="px-4 py-2 text-left font-medium text-ink-400">{t('employees.position')}</th>
            <th className="px-4 py-2 text-left font-medium text-ink-400">{t('employees.department')}</th>
            <th className="px-4 py-2 text-left font-medium text-ink-400">{t('employees.manager')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
          {emps.map((e) => (
            <tr
              key={e.id}
              onClick={() => onSelectEmp(e.id)}
              className="cursor-pointer hover:bg-ink-50 dark:hover:bg-ink-800/50"
            >
              <td className="px-4 py-2.5 font-medium">
                {e.is_vacancy ? (
                  <span className="text-warning-600">{t('employees.vacancy_label')}</span>
                ) : (
                  e.full_name
                )}
              </td>
              <td className="px-4 py-2.5 text-ink-500 dark:text-ink-400">{e.position || '—'}</td>
              <td className="px-4 py-2.5 text-ink-500 dark:text-ink-400">{deptName(e.department_id)}</td>
              <td className="px-4 py-2.5 text-ink-500 dark:text-ink-400">{managerName(e.manager_id)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptySchema({
  structure, onCreated,
}: {
  structure: StructureData;
  onCreated: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);

  const applyTemplate = async (templateId: string) => {
    const tpl = TEMPLATES.find((x) => x.id === templateId);
    if (!tpl) return;

    if (structure.depts.length > 0 || structure.emps.length > 0 || structure.freeNodes.length > 0) {
      toastInfo(t('schema.template_exists'));
      return;
    }

    if (!window.confirm(t('schema.template_confirm'))) return;

    setLoading(true);
    const { data: result, error } = await supabase.rpc('insert_template', {
      p_template: templateId,
      p_lang: i18n.language?.startsWith('ru') ? 'ru' : 'en',
    });
    if (error) {
      toastError(t(extractDbError(error)));
      setLoading(false);
      return;
    }
    if (result === 'exists') {
      toastInfo(t('schema.template_exists'));
    } else {
      toastSuccess(t('schema.template_loaded'));
    }
    setLoading(false);
    onCreated();
  };

  return (
    <div className="card flex flex-col items-center justify-center py-12 text-center">
      <FileText className="mb-3 h-10 w-10 text-ink-300" />
      <p className="mb-1 text-sm font-medium">{t('schema.empty_title')}</p>
      <p className="mb-4 text-sm text-ink-400">{t('schema.empty_desc')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => void applyTemplate(tpl.id)}
            disabled={loading}
            className="btn-secondary"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {t(tpl.nameKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyFreeForm() {
  const { t } = useTranslation();
  return (
    <div className="card flex flex-col items-center justify-center py-12 text-center">
      <Boxes className="mb-3 h-10 w-10 text-ink-300" />
      <p className="text-sm text-ink-400">{t('schema.empty_free')}</p>
    </div>
  );
}
