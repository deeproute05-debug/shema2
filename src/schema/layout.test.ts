// Pure-function unit tests for layout.ts — no test runner required.
// Run: npx tsx src/schema/layout.test.ts
import { positionMapKey, buildPositionMap, mergePosition, layoutOrgChart, detectManagerCycle, detectProjectManagerCycle } from './layout';
import type { Department, Employee } from '@/core/supabase';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${msg} — expected ${e}, got ${a}`);
}

// --- positionMapKey ---

assertEq(positionMapKey('org', 'department', 'abc-123'), 'org:department:abc-123', 'positionMapKey org dept');
assertEq(positionMapKey('matrix', 'employee', 'xyz-789'), 'matrix:employee:xyz-789', 'positionMapKey matrix emp');

// --- mergePosition: hit (saved wins over dagre) ---

assertEq(
  mergePosition({ x: 932.9, y: -521.5 }, { x: 420, y: 200 }, 200, 64),
  { x: 932.9, y: -521.5 },
  'mergePosition hit: saved overrides dagre',
);

// --- mergePosition: miss (no saved, dagre centered) ---

assertEq(
  mergePosition(undefined, { x: 420, y: 200 }, 200, 80),
  { x: 320, y: 160 },
  'mergePosition miss: dagre centered (420-100, 200-40)',
);

// --- mergePosition: neither saved nor dagre (fallback) ---

assertEq(
  mergePosition(undefined, undefined, 200, 80),
  { x: 0, y: 0 },
  'mergePosition fallback: origin',
);

// --- buildPositionMap + mergePosition: full hit scenario ---

const positions = [
  { view: 'org' as const, entity_type: 'department' as const, entity_id: 'fe95a5bb', x: 932.9, y: -521.5 },
  { view: 'org' as const, entity_type: 'employee' as const, entity_id: '2f727d51', x: 620.4, y: 41.7 },
  { view: 'matrix' as const, entity_type: 'employee' as const, entity_id: '2f727d51', x: 100, y: 200 },
];

const orgMap = buildPositionMap(positions, 'org');
assertEq(orgMap.size, 2, 'org map has 2 entries (filtered by view)');

// Hit: department with saved position in org view
const deptSaved = orgMap.get(positionMapKey('org', 'department', 'fe95a5bb'));
assert(deptSaved !== undefined, 'org dept fe95a5bb found in map');
assertEq(
  mergePosition(deptSaved, { x: 500, y: 300 }, 200, 64),
  { x: 932.9, y: -521.5 },
  'hit: department uses saved position',
);

// Hit: employee with saved position in org view
const empSaved = orgMap.get(positionMapKey('org', 'employee', '2f727d51'));
assert(empSaved !== undefined, 'org emp 2f727d51 found in map');
assertEq(
  mergePosition(empSaved, { x: 100, y: 100 }, 200, 80),
  { x: 620.4, y: 41.7 },
  'hit: employee uses saved position',
);

// --- Collapsed parent scenario ---
// When a parent department is collapsed, its children are filtered out of
// visibleDepts in layoutOrgChart and never reach mergePosition.  We simulate
// that by checking that a child whose parent is collapsed is simply absent
// from the node list (no mergePosition call needed).
//
// Here we verify that buildPositionMap still contains the child's position
// (the DB stores it regardless of collapse state), but the layout function
// would skip it.  The mergePosition call itself is never made for the child.
const childSaved = orgMap.get(positionMapKey('org', 'department', 'child-of-collapsed'));
assert(childSaved === undefined, 'collapsed child not in positions (no row for it)');

// If the child DID have a saved position, mergePosition would return it —
// but layoutOrgChart filters it out before that point.
const childInMap = buildPositionMap(
  [{ view: 'org', entity_type: 'department', entity_id: 'child-1', x: 50, y: 50 }],
  'org',
);
const childPos = childInMap.get(positionMapKey('org', 'department', 'child-1'));
assertEq(
  mergePosition(childPos, { x: 300, y: 300 }, 200, 64),
  { x: 50, y: 50 },
  'collapsed child: if it were rendered, saved position would apply',
);

// --- Cross-view isolation ---

const matrixMap = buildPositionMap(positions, 'matrix');
assertEq(matrixMap.size, 1, 'matrix map has 1 entry (only matrix view)');
const matrixEmp = matrixMap.get(positionMapKey('matrix', 'employee', '2f727d51'));
assertEq(
  mergePosition(matrixEmp, { x: 0, y: 0 }, 200, 80),
  { x: 100, y: 200 },
  'cross-view: matrix emp uses matrix position, not org',
);

// --- After reset: no saved positions, all nodes use dagre positions ---
// Simulates handleResetLayout: positions deleted, layoutOrgChart called
// with an empty position map. Every node must fall back to dagre-centered
// coordinates (mergePosition miss path).
const resetDepts: Department[] = [
  { id: 'root-d', parent_id: null, name: 'Root', responsibility_zone: '', desired_result: '', kpis: '', color: '#ccc', photo_path: '', pos_org: null, pos_matrix: null, pos_free: null, updated_at: '' },
  { id: 'child-d', parent_id: 'root-d', name: 'Child', responsibility_zone: '', desired_result: '', kpis: '', color: '#ccc', photo_path: '', pos_org: null, pos_matrix: null, pos_free: null, updated_at: '' },
];
const resetEmps: Employee[] = [
  { id: 'emp-1', department_id: 'root-d', full_name: 'Alice', position: 'CEO', duties: '', responsibility_zone: '', manager_id: null, project_manager_id: null, is_vacancy: false, photo_path: '', pos_org: null, pos_matrix: null, pos_free: null, updated_at: '' },
];
const resetResult = layoutOrgChart(resetDepts, resetEmps, new Set(), new Map());
assert(resetResult.nodes.length === 3, 'reset: 3 nodes rendered (2 depts + 1 emp)');
assert(resetResult.edges.length === 2, 'reset: 2 edges (root->child, root->emp)');
for (const n of resetResult.nodes) {
  assert(n.position.x !== 932.9 && n.position.y !== -521.5, `reset: node ${n.id} uses dagre position, not stale saved`);
  assert(Number.isFinite(n.position.x) && Number.isFinite(n.position.y), `reset: node ${n.id} has finite coordinates`);
}
// With empty saved map, all nodes use mergePosition(undefined, dagrePos, ...) = dagre-centered
// Verify one specific node's position matches the dagre-centered formula
const rootNode = resetResult.nodes.find((n) => n.id === 'dept:root-d');
assert(rootNode !== undefined, 'reset: root dept node exists');
// dagre position is deterministic for this small graph; we can't predict the
// exact value without running dagre, but we CAN verify it equals the centered
// formula applied to whatever dagre computed. Since we don't have the dagre
// output separately, we verify the key invariant: no saved position was used.

// --- Saved position survives collapse/expand ---
// A department with a saved position should retain it after collapsing and
// then expanding its parent. The position is stored in the DB independently
// of collapse state; layoutOrgChart reads it from the saved map whenever the
// node is visible. When collapsed (parent in collapsed set), the child is
// filtered out. When expanded (empty collapsed set), the child reappears
// with its saved position intact.
const surviveDepts: Department[] = [
  { id: 'p-d', parent_id: null, name: 'Parent', responsibility_zone: '', desired_result: '', kpis: '', color: '#ccc', photo_path: '', pos_org: null, pos_matrix: null, pos_free: null, updated_at: '' },
  { id: 'c-d', parent_id: 'p-d', name: 'Child', responsibility_zone: '', desired_result: '', kpis: '', color: '#ccc', photo_path: '', pos_org: null, pos_matrix: null, pos_free: null, updated_at: '' },
];
const surviveEmps: Employee[] = [];
const savedPositions = buildPositionMap(
  [{ view: 'org', entity_type: 'department', entity_id: 'c-d', x: 777, y: 333 }],
  'org',
);

// Collapsed: child filtered out
const collapsedResult = layoutOrgChart(surviveDepts, surviveEmps, new Set(['p-d']), savedPositions);
assert(
  !collapsedResult.nodes.some((n) => n.id === 'dept:c-d'),
  'collapse/expand: child absent when parent collapsed',
);
assert(collapsedResult.nodes.length === 1, 'collapse/expand: only parent visible when collapsed');

// Expanded: child reappears with saved position
const expandedResult = layoutOrgChart(surviveDepts, surviveEmps, new Set(), savedPositions);
const childNode = expandedResult.nodes.find((n) => n.id === 'dept:c-d');
assert(childNode !== undefined, 'collapse/expand: child reappears after expand');
assertEq(
  childNode!.position,
  { x: 777, y: 333 },
  'collapse/expand: saved position (777,333) survives collapse/expand cycle',
);

// --- detectManagerCycle ---

// Self-link: A -> A
assert(detectManagerCycle([], 'a', 'a'), 'cycle: self-link detected');

// No cycle: B -> A -> null
const chainEmps = [
  { id: 'a', manager_id: null },
  { id: 'b', manager_id: 'a' },
];
assert(!detectManagerCycle(chainEmps, 'b', 'a'), 'cycle: B->A is not a cycle');

// 2-node cycle: A -> B, setting B's manager to A creates A->B->A
assert(detectManagerCycle(chainEmps, 'a', 'b'), 'cycle: 2-node cycle A->B->A detected');

// 3-node cycle: A -> B -> C -> A
const threeNodeEmps = [
  { id: 'a', manager_id: 'c' },
  { id: 'b', manager_id: 'a' },
  { id: 'c', manager_id: 'b' },
];
// Setting C's manager to A: A->C, but A's manager is C already -> cycle
assert(detectManagerCycle(threeNodeEmps, 'c', 'a'), 'cycle: 3-node cycle detected (C->A where A->C->B->A)');

// Setting B's manager to C when C->B->A->C would be a cycle
assert(detectManagerCycle(threeNodeEmps, 'b', 'c'), 'cycle: 3-node cycle detected (B->C where C->B->A->C)');

// No cycle: D -> C -> B -> A -> null
const safeChain = [
  { id: 'a', manager_id: null },
  { id: 'b', manager_id: 'a' },
  { id: 'c', manager_id: 'b' },
  { id: 'd', manager_id: 'c' },
];
assert(!detectManagerCycle(safeChain, 'd', 'c'), 'cycle: D->C->B->A is not a cycle');
assert(!detectManagerCycle(safeChain, 'd', 'a'), 'cycle: D->A (skip levels) is not a cycle');

// Null manager: no cycle
assert(!detectManagerCycle(safeChain, 'd', 'nonexistent'), 'cycle: nonexistent manager is not a cycle');

// --- detectProjectManagerCycle ---

assert(detectProjectManagerCycle([], 'x', 'x'), 'pm cycle: self-link detected');

const pmChain = [
  { id: 'x', project_manager_id: null },
  { id: 'y', project_manager_id: 'x' },
];
assert(!detectProjectManagerCycle(pmChain, 'y', 'x'), 'pm cycle: Y->X is not a cycle');
assert(detectProjectManagerCycle(pmChain, 'x', 'y'), 'pm cycle: 2-node cycle X->Y->X detected');

const pmThree = [
  { id: 'x', project_manager_id: 'z' },
  { id: 'y', project_manager_id: 'x' },
  { id: 'z', project_manager_id: 'y' },
];
assert(detectProjectManagerCycle(pmThree, 'z', 'x'), 'pm cycle: 3-node cycle detected');

// --- Summary ---

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
