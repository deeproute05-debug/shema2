import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { ModuleRow } from './supabase';
import { eventBus, EVENTS } from './eventBus';

export interface ModuleManifest {
  id: string;
  nameKey: string;
  descriptionKey?: string;
  icon?: string;
  defaultEnabled?: boolean;
}

export const MODULE_MANIFESTS: ModuleManifest[] = [
  { id: 'company', nameKey: 'module_names.company', defaultEnabled: true },
  { id: 'departments', nameKey: 'module_names.departments', defaultEnabled: true },
  { id: 'employees', nameKey: 'module_names.employees', defaultEnabled: true },
  { id: 'canvas', nameKey: 'module_names.canvas', defaultEnabled: true },
  { id: 'strategy', nameKey: 'module_names.strategy', defaultEnabled: false },
];

export function useModules() {
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data, error } = await supabase.from('modules').select('id, enabled');
      if (error || !data) {
        if (mounted) setLoading(false);
        return;
      }
      const map: Record<string, boolean> = {};
      for (const m of MODULE_MANIFESTS) {
        const row = (data as ModuleRow[]).find((r) => r.id === m.id);
        map[m.id] = row ? row.enabled : (m.defaultEnabled ?? true);
      }
      if (mounted) {
        setModules(map);
        setLoading(false);
      }
    };
    void load();

    const off = eventBus.on(EVENTS.modulesChanged, () => void load());
    return () => {
      mounted = false;
      off();
    };
  }, []);

  const toggle = async (id: string, enabled: boolean) => {
    const { error } = await supabase.from('modules').upsert({ id, enabled });
    if (error) return { error: 'module_toggle_failed' };
    setModules((prev) => ({ ...prev, [id]: enabled }));
    eventBus.emit(EVENTS.modulesChanged, { id, enabled });
    return { error: null };
  };

  return { modules, loading, toggle };
}
