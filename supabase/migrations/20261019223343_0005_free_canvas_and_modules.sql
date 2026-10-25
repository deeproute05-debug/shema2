/*
# Free-form canvas tables and modules registry

1. Purpose
   - `free_nodes` / `free_edges`: a flexible graph canvas for arbitrary nodes
     and edges that don't fit the department/employee tree (strategy diagrams,
     custom links). Node data is a jsonb blob; edges reference node ids by label
     or uuid stored as text.
   - `modules`: the backing table for the frontend module registry. Each row is
     a module id with an enabled flag, so the owner can toggle modules on/off and
     the setting persists across sessions.

2. New tables
   - `free_nodes(id uuid pk, type text, label text, data jsonb, pos jsonb, updated_at)`
   - `free_edges(id uuid pk, source text, target text, kind text, updated_at)`
   - `modules(id text pk, enabled boolean default true, updated_at)`

3. Security
   - RLS on all three: SELECT for authenticated; INSERT/UPDATE/DELETE only for
     is_writer(). Four separate policies per table.

4. Notes
   - Idempotent.
*/

CREATE TABLE IF NOT EXISTS public.free_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'note',
  label text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  pos jsonb NOT NULL DEFAULT '{"x":0,"y":0}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.free_nodes ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS free_nodes_touch_updated_at ON public.free_nodes;
CREATE TRIGGER free_nodes_touch_updated_at
BEFORE UPDATE ON public.free_nodes
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.free_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  target text NOT NULL,
  kind text NOT NULL DEFAULT 'solid',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.free_edges ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS free_edges_touch_updated_at ON public.free_edges;
CREATE TRIGGER free_edges_touch_updated_at
BEFORE UPDATE ON public.free_edges
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.modules (
  id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS modules_touch_updated_at ON public.modules;
CREATE TRIGGER modules_touch_updated_at
BEFORE UPDATE ON public.modules
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- free_nodes policies ----------
DROP POLICY IF EXISTS "free_nodes_select_authenticated" ON public.free_nodes;
CREATE POLICY "free_nodes_select_authenticated"
ON public.free_nodes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "free_nodes_insert_writer" ON public.free_nodes;
CREATE POLICY "free_nodes_insert_writer"
ON public.free_nodes FOR INSERT TO authenticated WITH CHECK (public.is_writer());

DROP POLICY IF EXISTS "free_nodes_update_writer" ON public.free_nodes;
CREATE POLICY "free_nodes_update_writer"
ON public.free_nodes FOR UPDATE TO authenticated
USING (public.is_writer()) WITH CHECK (public.is_writer());

DROP POLICY IF EXISTS "free_nodes_delete_writer" ON public.free_nodes;
CREATE POLICY "free_nodes_delete_writer"
ON public.free_nodes FOR DELETE TO authenticated USING (public.is_writer());

-- ---------- free_edges policies ----------
DROP POLICY IF EXISTS "free_edges_select_authenticated" ON public.free_edges;
CREATE POLICY "free_edges_select_authenticated"
ON public.free_edges FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "free_edges_insert_writer" ON public.free_edges;
CREATE POLICY "free_edges_insert_writer"
ON public.free_edges FOR INSERT TO authenticated WITH CHECK (public.is_writer());

DROP POLICY IF EXISTS "free_edges_update_writer" ON public.free_edges;
CREATE POLICY "free_edges_update_writer"
ON public.free_edges FOR UPDATE TO authenticated
USING (public.is_writer()) WITH CHECK (public.is_writer());

DROP POLICY IF EXISTS "free_edges_delete_writer" ON public.free_edges;
CREATE POLICY "free_edges_delete_writer"
ON public.free_edges FOR DELETE TO authenticated USING (public.is_writer());

-- ---------- modules policies ----------
DROP POLICY IF EXISTS "modules_select_authenticated" ON public.modules;
CREATE POLICY "modules_select_authenticated"
ON public.modules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "modules_insert_writer" ON public.modules;
CREATE POLICY "modules_insert_writer"
ON public.modules FOR INSERT TO authenticated WITH CHECK (public.is_writer());

DROP POLICY IF EXISTS "modules_update_writer" ON public.modules;
CREATE POLICY "modules_update_writer"
ON public.modules FOR UPDATE TO authenticated
USING (public.is_writer()) WITH CHECK (public.is_writer());

DROP POLICY IF EXISTS "modules_delete_writer" ON public.modules;
CREATE POLICY "modules_delete_writer"
ON public.modules FOR DELETE TO authenticated USING (public.is_writer());
