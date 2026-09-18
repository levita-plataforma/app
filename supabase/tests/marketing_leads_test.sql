-- Sitio público comercial · marketing_leads / app.submit_marketing_lead.
-- Tabla no tenant-aware (leads externos, no personas del directorio):
-- comprueba que anon puede enviar por RPC pero nunca leer ni escribir la
-- tabla directamente, que la validación de campos ocurre dentro de la RPC
-- (no solo en la Server Action) y que el límite de repetición por email
-- corta el abuso.

begin;
select plan(11);

create or replace function test_set_anon() returns void as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end;
$$ language plpgsql;

create or replace function t_err(p_sql text) returns text as $$
declare
  v_state text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate;
  return v_state;
end;
$$ language plpgsql;

-- ============================================================
-- 1. Privilegios de tabla
-- ============================================================
select ok(
  not has_table_privilege('anon', 'marketing_leads', 'select')
  and not has_table_privilege('anon', 'marketing_leads', 'insert'),
  'anon no tiene SELECT ni INSERT directo sobre marketing_leads'
);

select ok(
  not has_table_privilege('authenticated', 'marketing_leads', 'select')
  and not has_table_privilege('authenticated', 'marketing_leads', 'insert'),
  'authenticated tampoco lee ni escribe la tabla directamente: solo por RPC'
);

select ok(
  has_function_privilege('anon', 'public.submit_marketing_lead(text, text, text, text, text, text)', 'execute'),
  'anon puede ejecutar el envoltorio público de la RPC'
);

select ok(
  has_function_privilege('anon', 'public.submit_marketing_lead(text, text, text, text, text, text)', 'execute'),
  'anon ejecuta la RPC pública, el punto real de entrada usado por PostgREST'
);

-- ============================================================
-- 2. Envío válido como anon real
-- ============================================================
select test_set_anon();

select ok(
  (select public.submit_marketing_lead('demo', 'Iglesia Ejemplo', 'contacto@example.test', 'Iglesia Ejemplo', '50-100', 'Nos interesa una demo.')) is not null,
  'anon puede enviar una solicitud de demo válida'
);

select ok(
  (select public.submit_marketing_lead('contacto', 'Otra Persona', 'otra@example.test', null, null, null)) is not null,
  'anon puede enviar un contacto válido sin organización/tamaño/mensaje (opcionales)'
);

-- ============================================================
-- 3. Validación dentro de la RPC, no solo en la Server Action
-- ============================================================
select is(
  t_err($$ select public.submit_marketing_lead('otro', 'Nombre', 'valido@example.test', null, null, null) $$),
  '22023',
  'kind fuera de (demo, contacto) se rechaza dentro de la RPC'
);

select is(
  t_err($$ select public.submit_marketing_lead('demo', '', 'valido@example.test', null, null, null) $$),
  '22023',
  'nombre vacío se rechaza dentro de la RPC'
);

select is(
  t_err($$ select public.submit_marketing_lead('demo', 'Nombre', 'no-es-un-correo', null, null, null) $$),
  '22023',
  'correo con formato inválido se rechaza dentro de la RPC'
);

-- ============================================================
-- 4. Límite de repetición por email (rate-limit simple)
-- ============================================================
select public.submit_marketing_lead('demo', 'Repetido', 'repetido@example.test', null, null, 'intento 1');
select public.submit_marketing_lead('demo', 'Repetido', 'repetido@example.test', null, null, 'intento 2');
select public.submit_marketing_lead('demo', 'Repetido', 'repetido@example.test', null, null, 'intento 3');
select public.submit_marketing_lead('demo', 'Repetido', 'repetido@example.test', null, null, 'intento 4');
select public.submit_marketing_lead('demo', 'Repetido', 'repetido@example.test', null, null, 'intento 5');

select is(
  t_err($$ select public.submit_marketing_lead('demo', 'Repetido', 'REPETIDO@example.test', null, null, 'intento 6') $$),
  '53400',
  'La sexta solicitud con el mismo correo (normalizado, sin distinguir mayúsculas) en la última hora se corta'
);

-- ============================================================
-- 5. Nunca se lee la tabla como anon, ni tras insertar con éxito
-- ============================================================
select is(
  t_err($$ select count(*) from marketing_leads $$),
  '42501',
  'anon no puede leer marketing_leads ni siquiera tras haber insertado filas por RPC'
);

reset role;

select * from finish();
rollback;
