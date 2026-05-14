
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  market text NOT NULL DEFAULT 'R_100',
  code text,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY strategies_select_public_or_own ON public.strategies FOR SELECT USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY strategies_insert_own ON public.strategies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY strategies_update_own ON public.strategies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY strategies_delete_own ON public.strategies FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.copy_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL,
  leader_id uuid NOT NULL,
  allocation numeric NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, leader_id)
);
ALTER TABLE public.copy_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY copy_select_own ON public.copy_subscriptions FOR SELECT USING (auth.uid() = follower_id);
CREATE POLICY copy_insert_own ON public.copy_subscriptions FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY copy_update_own ON public.copy_subscriptions FOR UPDATE USING (auth.uid() = follower_id);
CREATE POLICY copy_delete_own ON public.copy_subscriptions FOR DELETE USING (auth.uid() = follower_id);

CREATE TRIGGER trg_strategies_updated BEFORE UPDATE ON public.strategies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_copy_updated BEFORE UPDATE ON public.copy_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
