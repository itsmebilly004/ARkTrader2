DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'bot_xml_presets'
          AND cmd IN ('INSERT', 'UPDATE')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.bot_xml_presets', pol.policyname);
    END LOOP;
END
$$;

create policy "Enable insert for whitelisted bots"
  on public.bot_xml_presets for insert
  with check (
    bot_id in (
      'under-destroyer-v2',
      'nova-v6',
      'mega-mind',
      'phantom-hit-run',
      'candle-mine',
      'dec-entry',
      'under-pro-sentinel',
      'osam-auto-pilot'
    )
  );

create policy "Enable update for whitelisted bots"
  on public.bot_xml_presets for update
  using (
    bot_id in (
      'under-destroyer-v2',
      'nova-v6',
      'mega-mind',
      'phantom-hit-run',
      'candle-mine',
      'dec-entry',
      'under-pro-sentinel',
      'osam-auto-pilot'
    )
  )
  with check (
    bot_id in (
      'under-destroyer-v2',
      'nova-v6',
      'mega-mind',
      'phantom-hit-run',
      'candle-mine',
      'dec-entry',
      'under-pro-sentinel',
      'osam-auto-pilot'
    )
  );

notify pgrst, 'reload schema';
