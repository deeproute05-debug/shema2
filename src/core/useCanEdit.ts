import { useAuthStore } from '@/core/authStore';

export function useCanEdit(): boolean {
  const user = useAuthStore((s) => s.user);
  return user?.profile.role === 'owner' || user?.profile.role === 'editor';
}
