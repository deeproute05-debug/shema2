import { useState, useEffect, useCallback } from 'react';
import { supabase, type Company } from '@/core/supabase';
import { extractDbError } from '@/core/dbErrors';
import { toastError } from '@/core/toast';

export function useCompanyLoader() {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('company')
      .select('*')
      .maybeSingle();

    if (error) {
      const msg = extractDbError(error);
      setError(msg);
      toastError(msg);
    } else {
      setCompany(data as Company | null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { company, loading, error, reload };
}
