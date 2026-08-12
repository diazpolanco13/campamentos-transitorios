-- Cutover §7: cerrar acceso por token personal (/terreno?t=…).
-- Denuncias con token publico intactas.
-- Gotcha: tras CREATE OR REPLACE, re-verificar REVOKE/GRANT.

begin;

-- 1) Revocar todos los tokens personal activos
update public.tokens_centros
set activo = false, revocado_en = now()
where tipo = 'personal' and activo;

-- 2) Trigger: solo generar token publico (INSERT y UPDATE de centros)
create or replace function public.generar_tokens_centro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tokens_centros (centro_id, tipo)
  select new.id, 'publico'
  where not exists (
    select 1 from public.tokens_centros x
    where x.centro_id = new.id and x.tipo = 'publico' and x.activo
  );
  return new;
end;
$$;

revoke all on function public.generar_tokens_centro() from public, anon, authenticated;

-- 3) Impedir reactivar tokens personal
alter table public.tokens_centros
  drop constraint if exists tokens_centros_personal_inactivo;
alter table public.tokens_centros
  add constraint tokens_centros_personal_inactivo
  check (tipo <> 'personal' or activo = false);

-- 4) centro_de_token: personal nunca resuelve (publico sigue)
create or replace function public.centro_de_token(p_token text, p_tipo text)
returns text language sql stable security definer set search_path = public as $$
  select t.centro_id from public.tokens_centros t
  where t.token = p_token
    and t.tipo = p_tipo
    and t.tipo = 'publico'
    and t.activo;
$$;
revoke all on function public.centro_de_token(text, text) from public, anon, authenticated;

-- 5) acceso_censo_centro: sin fast-path de token; solo sesión + alcance
create or replace function public.acceso_censo_centro(p_token text, p_centro_id text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  -- p_token ignorado (compat firma RPC); cutover: solo sesión autenticada.
  if auth.uid() is null then
    raise exception 'Acceso no autorizado: inicie sesión con usuario y contraseña';
  end if;
  if (select public.mi_rol()) in ('admin', 'autoridad', 'censo_rapido')
     or (select public.es_analista_total())
     or (
       (select public.mi_rol()) in ('analista_sae', 'supervisor', 'operador')
       and p_centro_id = any ((select public.mis_centros())::text[])
     ) then
    return;
  end if;
  raise exception 'Solo puede censar en sus campamentos asignados';
end;
$$;
revoke all on function public.acceso_censo_centro(text, text) from public, anon, authenticated;

-- 6) terreno_centro: nadie la ejecuta (QR personal muerto)
revoke all on function public.terreno_centro(text) from public, anon, authenticated;

commit;

-- Postcondiciones (fuera de la txn de DDL para lectura clara; fallan el deploy si no)
do $$
declare
  v_personal int;
  v_publico int;
  v_centros int;
begin
  select count(*) into v_personal from public.tokens_centros where tipo = 'personal' and activo;
  select count(*) into v_publico from public.tokens_centros where tipo = 'publico' and activo;
  select count(*) into v_centros from public.centros where not deleted;
  if v_personal <> 0 then
    raise exception 'postcondición: tokens personal activos = % (esperado 0)', v_personal;
  end if;
  if v_publico <> v_centros then
    raise exception 'postcondición: tokens publico (%) != centros activos (%)', v_publico, v_centros;
  end if;
  if has_function_privilege('anon', 'public.terreno_centro(text)', 'execute')
     or has_function_privilege('authenticated', 'public.terreno_centro(text)', 'execute') then
    raise exception 'postcondición: terreno_centro aún ejecutable por anon/authenticated';
  end if;
end;
$$;
