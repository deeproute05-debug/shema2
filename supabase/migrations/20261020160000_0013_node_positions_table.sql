/*
# Node positions table for org/matrix canvas drag-and-save

1. Purpose
   Stores per-node x/y positions for the org-chart and matrix views so that
   editors/owners can drag nodes and have their layout persist across sessions.
   Free-form canvas continues to use free_nodes.pos — this table is only for
   the dagre-auto-laid-out views (org, matrix).

2. New table
   - `node_positions`
     - `view` (text, NOT NULL) — which canvas: 'org' or 'matrix'
     - `entity_type` (text, NOT NULL) — 'department' or 'employee'
     - `entity_id` (uuid, NOT NULL) — references departments.id or employees.id
     - `x` (double precision, NOT NULL) — canvas x coordinate
     - `y` (double precision, NOT NULL) — canvas y coordinate
     - `updated_at` (timestamptz, NOT NULL, default now())
     - PRIMARY KEY (view, entity_type, entity_id)

3. Constraints
   - CHECK (view IN ('org', 'matrix'))
   - CHECK (entity_type IN ('department', 'employee'))
   - CHECK (x::text NOT IN ('NaN','Infinity','-Infinity'))
   - CHECK (y::text NOT IN ('NaN','Infinity','-Infinity'))
   - Entity existence validated by trigger (see migration 0014)

4. Security
   - RLS enabled.
   - SELECT: authenticated (all users can see positions).
   - INSERT / UPDATE / DELETE: is_writer() only (editor + owner).
   - Four separate policies (no FOR ALL).

5. Notes
   - Idempotent: uses IF NOT EXISTS and DROP POLICY IF EXISTS.
   - No changes to existing tables, policies, triggers, or grants.
*/

CREATE TABLE IF NOT EXISTS public.node_positions (
  view text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  x double precision NOT NULL,
  y double precision NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT node_positions_pkey PRIMARY KEY (view, entity_type, entity_id),
  CONSTRAINT node_positions_view_check CHECK (view IN ('org', 'matrix')),
  CONSTRAINT node_positions_entity_type_check CHECK (entity_type IN ('department', 'employee')),
  CONSTRAINT node_positions_x_finite CHECK (x::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  CONSTRAINT node_positions_y_finite CHECK (y::text NOT IN ('NaN', 'Infinity', '-Infinity'))
);

ALTER TABLE public.node_positions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS node_positions_touch_updated_at ON public.node_positions;
CREATE TRIGGER node_positions_touch_updated_at
BEFORE UPDATE ON public.node_positions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- policies ----------
DROP POLICY IF EXISTS "node_positions_select_authenticated" ON public.node_positions;
CREATE POLICY "node_positions_select_authenticated"
ON public.node_positions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "node_positions_insert_writer" ON public.node_positions;
CREATE POLICY "node_positions_insert_writer"
ON public.node_positions FOR INSERT TO authenticated WITH CHECK (public.is_writer());

DROP POLICY IF EXISTS "node_positions_update_writer" ON public.node_positions;
CREATE POLICY "node_positions_update_writer"
ON public.node_positions FOR UPDATE TO authenticated
USING (public.is_writer()) WITH CHECK (public.is_writer());

DROP POLICY IF EXISTS "node_positions_delete_writer" ON public.node_positions;
CREATE POLICY "node_positions_delete_writer"
ON public.node_positions FOR DELETE TO authenticated USING (public.is_writer());
