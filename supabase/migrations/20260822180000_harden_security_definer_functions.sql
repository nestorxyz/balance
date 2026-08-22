-- Harden privileged functions exposed through the public schema.
--
-- User-facing RPCs remain executable by authenticated users because they
-- validate auth.uid() internally. Anonymous users must not execute any
-- SECURITY DEFINER function in this private application. Trigger functions
-- and underscore-prefixed helpers are internal-only.

do $$
declare
  function_signature text;
begin
  for function_signature in
    select p.oid::regprocedure::text
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format(
      'alter function %s set search_path = public, extensions',
      function_signature
    );
    execute format(
      'revoke execute on function %s from anon',
      function_signature
    );
  end loop;

  for function_signature in
    select p.oid::regprocedure::text
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (
        p.proname like '\_%' escape '\'
        or p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
      )
  loop
    execute format(
      'revoke execute on function %s from authenticated',
      function_signature
    );
  end loop;
end;
$$;
