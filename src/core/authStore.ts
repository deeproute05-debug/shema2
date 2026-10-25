import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { eventBus, EVENTS } from './eventBus';
import type { Profile, Role, Language } from './supabase';

export interface AuthUser {
  id: string;
  email: string;
  profile: Profile;
}

interface AuthState {
  ready: boolean;
  loading: boolean;
  session: Session | null;
  user: AuthUser | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setLanguage: (lang: Language) => Promise<{ error: string | null }>;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ready: false,
  loading: false,
  session: null,
  user: null,
  error: null,

  async signIn(email, password) {
    set({ loading: true, error: null });
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      set({ loading: false, error: neutralError(error) });
      return { error: neutralError(error) };
    }
    await loadProfile(data.session?.user, set);
    set({ loading: false });
    return { error: null };
  },

  async signOut() {
    await supabase.auth.signOut();
    set({ session: null, user: null });
    eventBus.emit(EVENTS.authChanged, null);
  },

  async refreshProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    await loadProfile(user, set);
  },

  async setLanguage(lang) {
    const user = get().user;
    if (!user) return { error: 'not_signed_in' };
    const { error } = await supabase
      .from('profiles')
      .update({ language: lang })
      .eq('user_id', user.id);
    if (error) return { error: 'language_update_failed' };
    set({ user: { ...user, profile: { ...user.profile, language: lang } } });
    eventBus.emit(EVENTS.languageChanged, lang);
    return { error: null };
  },

  clear() {
    set({ session: null, user: null });
  },
}));

async function loadProfile(user: User | null, set: (partial: Partial<AuthState>) => void) {
  if (!user) {
    set({ session: null, user: null });
    eventBus.emit(EVENTS.authChanged, null);
    return;
  }
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !profile) {
    set({ user: null, session: null });
    eventBus.emit(EVENTS.authChanged, null);
    return;
  }

  const authUser: AuthUser = {
    id: user.id,
    email: user.email ?? '',
    profile: profile as Profile,
  };
  set({ user: authUser, session: null });
  eventBus.emit(EVENTS.authChanged, authUser);
}

function neutralError(error: { message?: string }): string {
  const msg = (error.message ?? '').toLowerCase();
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) return 'login_invalid';
  if (msg.includes('email not confirmed')) return 'email_not_confirmed';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'rate_limited';
  return 'login_failed';
}

export function hasRole(user: AuthUser | null, ...roles: Role[]): boolean {
  return !!user && roles.includes(user.profile.role);
}
