import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email();
export const passwordSchema = z.string().min(8, 'password_min_8');

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;

export const invitationSchema = z.object({
  email: emailSchema,
  role: z.enum(['editor', 'viewer']),
});

export type InvitationInput = z.infer<typeof invitationSchema>;

export const languageSchema = z.enum(['ru', 'en', 'ar']);
