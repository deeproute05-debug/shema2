import type { PostgrestError } from '@supabase/supabase-js';

export function extractDbError(error: PostgrestError | { message?: string } | null | undefined): string {
  if (!error) return 'common.unknown_error';
  const msg = (error as PostgrestError).message ?? '';
  if (msg.includes('cycle') || msg.includes('ancestor')) return 'errors.cycle_detected';
  if (msg.includes('own parent')) return 'errors.own_parent';
  if (msg.includes('manage themselves')) return 'errors.self_manager';
  if (msg.includes('own project manager')) return 'errors.self_project_manager';
  if (msg.includes('sub-department')) return 'errors.dept_has_children';
  if (msg.includes('employees. Move them')) return 'errors.dept_has_employees';
  if (msg.includes('Only owners and editors')) return 'errors.insufficient_privilege';
  if (msg.includes('Company already exists')) return 'errors.company_exists';
  if (msg.includes('row-level security')) return 'errors.permission_denied';
  return 'common.unknown_error';
}
