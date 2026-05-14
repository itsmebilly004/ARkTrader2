import { useEffect, useState } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let initialSessionChecked = false;
    const applySession = (s: Session | null) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!initialSessionChecked && !s) return;
      applySession(s);
    });
    supabase.auth.getSession().then(({ data }) => {
      initialSessionChecked = true;
      applySession(data.session);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, session, loading };
}
