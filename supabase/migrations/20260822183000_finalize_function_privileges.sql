-- Remove implicit PUBLIC execution from privileged functions and make every
-- public function use a deterministic search path.

do $$
declare
  function_record record;
begin
  for function_record in
    select
      p.oid,
      p.oid::regprocedure::text as signature,
      p.proname,
      p.prosecdef,
      p.prorettype,
      pg_catalog.pg_get_functiondef(p.oid) as definition
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
  loop
    execute format(
      'alter function %s set search_path = public, extensions',
      function_record.signature
    );

    if function_record.prosecdef then
      execute format(
        'revoke execute on function %s from public, anon, authenticated',
        function_record.signature
      );
      execute format(
        'grant execute on function %s to service_role',
        function_record.signature
      );

      if function_record.proname not like '\_%' escape '\'
        and function_record.prorettype <> 'pg_catalog.trigger'::pg_catalog.regtype
        and function_record.definition ilike '%auth.uid()%'
      then
        execute format(
          'grant execute on function %s to authenticated',
          function_record.signature
        );
      end if;
    end if;
  end loop;
end;
$$;
