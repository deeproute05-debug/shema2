import { z } from 'zod';

export const companySchema = z.object({
  name: z.string().trim().min(1, 'company.name_required').max(200, 'company.name_max'),
  description: z.string().trim().max(2000, 'common.too_long').default(''),
  industry: z.string().trim().max(200, 'common.too_long').default(''),
  mission: z.string().trim().max(2000, 'common.too_long').default(''),
  size: z.string().trim().max(100, 'common.too_long').default(''),
  goals: z.string().trim().max(4000, 'common.too_long').default(''),
  products: z.string().trim().max(4000, 'common.too_long').default(''),
  notes: z.string().trim().max(4000, 'common.too_long').default(''),
});

export type CompanyInput = z.infer<typeof companySchema>;

export const departmentSchema = z.object({
  name: z.string().trim().min(1, 'departments.name_required').max(200, 'departments.name_max'),
  parent_id: z.string().uuid().nullable().default(null),
  responsibility_zone: z.string().trim().max(2000, 'common.too_long').default(''),
  desired_result: z.string().trim().max(2000, 'common.too_long').default(''),
  kpis: z.string().trim().max(4000, 'common.too_long').default(''),
  color: z.string().trim().max(20, 'common.too_long').default('#2563eb'),
});

export type DepartmentInput = z.infer<typeof departmentSchema>;

export const employeeSchema = z.object({
  full_name: z.string().trim().max(300, 'common.too_long').default(''),
  position: z.string().trim().max(200, 'common.too_long').default(''),
  department_id: z.string().uuid().nullable().default(null),
  duties: z.string().trim().max(2000, 'common.too_long').default(''),
  responsibility_zone: z.string().trim().max(2000, 'common.too_long').default(''),
  manager_id: z.string().uuid().nullable().default(null),
  project_manager_id: z.string().uuid().nullable().default(null),
  is_vacancy: z.boolean().default(false),
}).superRefine((val, ctx) => {
  if (!val.is_vacancy && val.full_name.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['full_name'],
      message: 'employees.name_required_unless_vacancy',
    });
  }
});

export type EmployeeInput = z.infer<typeof employeeSchema>;

export const positionViewSchema = z.enum(['org', 'matrix']);
export const positionEntityTypeSchema = z.enum(['department', 'employee']);

export const nodePositionSchema = z.object({
  view: positionViewSchema,
  entity_type: positionEntityTypeSchema,
  entity_id: z.string().uuid(),
  x: z.number().finite(),
  y: z.number().finite(),
});

export type NodePositionInput = z.infer<typeof nodePositionSchema>;
