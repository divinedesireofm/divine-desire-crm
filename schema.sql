-- ============================================================
-- DIVINE DESIRE CRM — Esquema de base de datos
-- Ejecutar completo en Supabase → SQL Editor → New query → Run
-- ============================================================

-- 1. ROLES Y PERFILES
-- Cada usuario que inicia sesión tiene un perfil con un rol.
create type user_role as enum ('admin', 'chatter', 'ig_assistant');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'chatter',
  created_at timestamptz not null default now()
);

-- 2. MODELOS / CREADORAS
create type model_status as enum ('activa', 'pausada', 'en_negociacion', 'baja');

create table models (
  id uuid primary key default gen_random_uuid(),
  stage_name text not null,
  real_name text,
  status model_status not null default 'en_negociacion',
  contract_start date,
  commission_percent numeric(5,2),
  contact_info text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. CUENTAS DE INSTAGRAM (monitoreo + equipo)
create type ig_account_status as enum ('activa', 'en_revision', 'suspendida', 'baneada', 'calentando');

create table instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  model_id uuid references models(id) on delete set null,
  username text not null unique,
  status ig_account_status not null default 'calentando',
  assigned_to uuid references profiles(id) on delete set null, -- asistente de IG responsable
  followers_count integer,
  proxy_notes text,
  last_incident text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. CHATTERS (equipo de chat)
create table chatters (
  id uuid primary key references profiles(id) on delete cascade,
  models_assigned uuid[] default '{}', -- ids de modelos que atiende
  shift text, -- ej. "mañana", "tarde", "noche"
  active boolean not null default true
);

-- 5. MÉTRICAS SEMANALES (sustituye tu spreadsheet)
create table weekly_metrics (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id) on delete cascade,
  week_start date not null, -- lunes de la semana que se reporta
  -- OnlyFans
  of_net_sales numeric(10,2),
  of_subs_new integer,
  of_subs_churned integer,
  of_ppv_sent integer,
  of_ppv_purchased integer,
  of_tips numeric(10,2),
  -- Instagram
  ig_reach integer,
  ig_new_followers integer,
  ig_profile_visits integer,
  ig_link_clicks integer,
  -- meta
  entered_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (model_id, week_start)
);

-- 6. RENDIMIENTO POR CHATTER (por semana)
create table chatter_performance (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references chatters(id) on delete cascade,
  model_id uuid not null references models(id) on delete cascade,
  week_start date not null,
  sales numeric(10,2) not null default 0,
  messages_sent integer,
  ppv_unlocked integer,
  notes text,
  created_at timestamptz not null default now(),
  unique (chatter_id, model_id, week_start)
);

-- 7. FUNNEL DE RECLUTAMIENTO (leads de modelos potenciales)
create type lead_stage as enum ('nuevo', 'contactado', 'en_conversacion', 'negociando', 'firmado', 'descartado');

create table recruitment_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  instagram_handle text,
  source text, -- ej. "IG orgánico", "Meta Ads", "referido"
  stage lead_stage not null default 'nuevo',
  assigned_to uuid references profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Todas las tablas protegidas: solo usuarios logueados con el rol correcto
-- ============================================================

alter table profiles enable row level security;
alter table models enable row level security;
alter table instagram_accounts enable row level security;
alter table chatters enable row level security;
alter table weekly_metrics enable row level security;
alter table chatter_performance enable row level security;
alter table recruitment_leads enable row level security;

-- Función helper: rol del usuario actual
create or replace function auth_role() returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql security definer stable;

-- PROFILES: cada uno ve su propio perfil, el admin ve todos
create policy "ver propio perfil o admin ve todos" on profiles
  for select using (id = auth.uid() or auth_role() = 'admin');
create policy "admin gestiona perfiles" on profiles
  for all using (auth_role() = 'admin');

-- MODELS: admin todo; chatters e ig_assistants solo lectura
create policy "todos los logueados pueden leer modelos" on models
  for select using (auth.uid() is not null);
create policy "solo admin escribe modelos" on models
  for insert with check (auth_role() = 'admin');
create policy "solo admin actualiza modelos" on models
  for update using (auth_role() = 'admin');
create policy "solo admin borra modelos" on models
  for delete using (auth_role() = 'admin');

-- INSTAGRAM ACCOUNTS: admin todo; ig_assistant solo ve/edita las suyas
create policy "admin ve todas las cuentas ig" on instagram_accounts
  for select using (auth_role() = 'admin' or assigned_to = auth.uid());
create policy "admin crea cuentas ig" on instagram_accounts
  for insert with check (auth_role() = 'admin');
create policy "admin o asistente asignado actualiza" on instagram_accounts
  for update using (auth_role() = 'admin' or assigned_to = auth.uid());
create policy "solo admin borra cuentas ig" on instagram_accounts
  for delete using (auth_role() = 'admin');

-- CHATTERS
create policy "admin ve todos los chatters, chatter se ve a si mismo" on chatters
  for select using (auth_role() = 'admin' or id = auth.uid());
create policy "solo admin gestiona chatters" on chatters
  for all using (auth_role() = 'admin');

-- WEEKLY METRICS: admin todo; resto solo lectura
create policy "logueados leen metricas" on weekly_metrics
  for select using (auth.uid() is not null);
create policy "solo admin escribe metricas" on weekly_metrics
  for insert with check (auth_role() = 'admin');
create policy "solo admin actualiza metricas" on weekly_metrics
  for update using (auth_role() = 'admin');
create policy "solo admin borra metricas" on weekly_metrics
  for delete using (auth_role() = 'admin');

-- CHATTER PERFORMANCE: admin ve todo; chatter ve solo lo suyo
create policy "admin ve todo, chatter ve lo suyo" on chatter_performance
  for select using (auth_role() = 'admin' or chatter_id = auth.uid());
create policy "admin escribe rendimiento" on chatter_performance
  for insert with check (auth_role() = 'admin');
create policy "admin actualiza rendimiento" on chatter_performance
  for update using (auth_role() = 'admin');
create policy "admin borra rendimiento" on chatter_performance
  for delete using (auth_role() = 'admin');

-- RECRUITMENT LEADS: admin todo
create policy "logueados leen leads" on recruitment_leads
  for select using (auth.uid() is not null);
create policy "solo admin gestiona leads" on recruitment_leads
  for all using (auth_role() = 'admin');

-- ============================================================
-- Trigger: crear perfil automáticamente al registrarse un usuario
-- ============================================================
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'chatter');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
