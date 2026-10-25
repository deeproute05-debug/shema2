import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error('Missing Supabase env vars. VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set.');
}

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type Role = 'owner' | 'editor' | 'viewer';
export type Language = 'ru' | 'en' | 'ar';

export interface Profile {
  user_id: string;
  role: Role;
  language: Language;
  updated_at: string;
}

export interface Invitation {
  email: string;
  role: 'editor' | 'viewer';
  created_by: string | null;
  used: boolean;
  updated_at: string;
}

export interface Company {
  id: number;
  name: string;
  description: string;
  industry: string;
  mission: string;
  goals: unknown;
  products: unknown;
  size: string;
  notes: string;
  updated_at: string;
}

export interface Department {
  id: string;
  parent_id: string | null;
  name: string;
  responsibility_zone: string;
  desired_result: string;
  kpis: string;
  color: string;
  photo_path: string;
  pos_org: unknown;
  pos_matrix: unknown;
  pos_free: unknown;
  updated_at: string;
}

export interface Employee {
  id: string;
  department_id: string | null;
  full_name: string;
  position: string;
  duties: string;
  responsibility_zone: string;
  manager_id: string | null;
  project_manager_id: string | null;
  is_vacancy: boolean;
  photo_path: string;
  pos_org: unknown;
  pos_matrix: unknown;
  pos_free: unknown;
  updated_at: string;
}

export interface FreeNode {
  id: string;
  type: string;
  label: string;
  data: unknown;
  pos: unknown;
  updated_at: string;
}

export interface FreeEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  updated_at: string;
}

export interface ModuleRow {
  id: string;
  enabled: boolean;
  updated_at: string;
}

export type PositionView = 'org' | 'matrix';
export type PositionEntityType = 'department' | 'employee';

export interface NodePosition {
  view: PositionView;
  entity_type: PositionEntityType;
  entity_id: string;
  x: number;
  y: number;
  updated_at: string;
}
