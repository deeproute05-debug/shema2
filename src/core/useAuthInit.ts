import { useEffect } from 'react';
import { supabase } from './supabase';
import { useAuthStore } from './authStore';

export function useAuthInit() {
  const ready = useAuthStore((s) => s.ready);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const clear = useAuthStore((s) => s.clear);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session) {
        await refreshProfile();
      } else {
        clear();
      }
      useAuthStore.setState({ ready: true });
    };

    void init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (session) {
          await refreshProfile();
        } else {
          clear();
        }
      })();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshProfile, clear]);

  return { ready };
}
