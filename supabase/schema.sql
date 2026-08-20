-- Chiclana Parking — Esquema Supabase (Fase 0)
-- Ejecutar completo en el SQL editor de Supabase (Studio), en una sola sesión.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. EXTENSIONES Y TABLAS
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

create table branches (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  address         text,
  phone           text,
  email           text,
  total_floors    int not null default 3,
  spots_per_floor int not null default 17,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  branch_id   uuid references branches(id) on delete set null, -- null = admin, ve todas
  username    text not null unique,
  role        text not null check (role in ('admin','manager','employee')),
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_profiles_branch on profiles(branch_id);

create table clients (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branches(id) on delete cascade,
  first_name    text not null,
  last_name     text not null,
  dni           text,
  phone         text,
  email         text,
  plate         text,
  vehicle_make  text,
  vehicle_model text,
  vehicle_color text,
  vehicle_type  text default 'car',
  notes         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_clients_branch on clients(branch_id);
create index idx_clients_branch_active on clients(branch_id, active);
create index idx_clients_plate on clients(branch_id, plate);

-- Vehículos ADICIONALES de un cliente. El vehículo "principal" sigue viviendo
-- en clients.plate/vehicle_make/etc (no se toca nada de lo existente); esta
-- tabla es historial/secundarios, igual que en la referencia visual.
create table vehicles (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references branches(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,
  plate       text not null,
  make        text,
  model       text,
  color       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_vehicles_branch on vehicles(branch_id);
create index idx_vehicles_client on vehicles(client_id);

alter table vehicles enable row level security;
create policy vehicles_select on vehicles for select
  using (auth_is_admin() or branch_id = auth_branch_id());
create policy vehicles_insert on vehicles for insert
  with check (auth_is_admin() or branch_id = auth_branch_id());
create policy vehicles_update on vehicles for update
  using (auth_is_admin() or branch_id = auth_branch_id())
  with check (auth_is_admin() or branch_id = auth_branch_id());

create table spots (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references branches(id) on delete cascade,
  floor       int not null,
  number      int not null,
  label       text not null,
  type        text not null default 'fixed' check (type in ('fixed','mobile')),
  status      text not null default 'free' check (status in ('free','occupied','disabled')),
  client_id   uuid,
  contract_id uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (branch_id, floor, number)
);
create index idx_spots_branch_status on spots(branch_id, status);
create index idx_spots_branch_floor on spots(branch_id, floor);

create table contracts (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references branches(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,
  spot_id     uuid not null references spots(id) on delete cascade,
  rental_type text not null check (rental_type in ('fixed','mobile','hourly','daily')),
  period      text,
  plate       text,
  start_date  date,
  end_date    date,
  entry_time  timestamptz,
  exit_time   timestamptz,
  hourly_rate numeric,
  price       numeric not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_contracts_branch_active on contracts(branch_id, active);
create index idx_contracts_spot on contracts(spot_id);
create index idx_contracts_client on contracts(client_id);
create unique index uq_contracts_one_active_per_spot on contracts(spot_id) where active;

alter table spots add constraint fk_spots_client   foreign key (client_id)   references clients(id) on delete set null;
alter table spots add constraint fk_spots_contract  foreign key (contract_id) references contracts(id) on delete set null;

create table payments (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branches(id) on delete cascade,
  client_id      uuid not null references clients(id) on delete cascade,
  contract_id    uuid references contracts(id) on delete set null,
  amount         numeric not null,
  date           date,
  method         text not null default 'cash' check (method in ('cash','transfer','other')),
  receipt_number text not null,
  period_start   date,
  period_end     date,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (branch_id, receipt_number)
);
alter table payments add column voided boolean not null default false;
alter table payments add column voided_at timestamptz;
alter table payments add column void_reason text;

create index idx_payments_branch_created on payments(branch_id, created_at desc);
create index idx_payments_client on payments(client_id);
create index idx_payments_contract on payments(contract_id);

create table prices (
  id                 uuid primary key default gen_random_uuid(),
  branch_id          uuid not null references branches(id) on delete cascade,
  monthly_fixed      numeric not null,
  monthly_mobile     numeric not null,
  daily              numeric not null,
  hourly             numeric,
  effective_date     date not null,
  adjustment_percent numeric,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index idx_prices_branch_effdate on prices(branch_id, effective_date desc);

create table adjustments (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references branches(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,
  type        text not null check (type in ('charge','credit')),
  description text,
  amount      numeric not null,
  date        date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_adjustments_branch on adjustments(branch_id);
create index idx_adjustments_client on adjustments(client_id);

create table settings (
  branch_id                uuid primary key references branches(id) on delete cascade,
  last_price_update        date,
  receipt_footer           text,
  price_alert_days         int default 90,
  hourly_fraction_minutes  int default 15,
  hourly_tolerance_minutes int default 5,
  hourly_min_minutes       int default 60,
  updated_at               timestamptz not null default now()
);

create table receipt_counters (
  branch_id   uuid primary key references branches(id) on delete cascade,
  last_number int not null default 0
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. RLS — HELPERS Y POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

-- IMPORTANTE: estas funciones NO consultan la tabla "profiles". En Supabase,
-- ni SECURITY DEFINER ni el ser owner de la tabla alcanzan para saltarse RLS
-- de forma confiable — consultarla desde adentro genera recursión infinita
-- ("stack depth limit exceeded") en cualquier policy que las use. En cambio,
-- leen rol/sucursal directo del JWT (app_metadata), sin tocar ninguna tabla
-- protegida por RLS. Ver el trigger sync_profile_to_auth_metadata más abajo,
-- que mantiene ese app_metadata sincronizado con "profiles".
create or replace function auth_is_admin() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

create or replace function auth_branch_id() returns uuid
language sql stable as $$
  select (auth.jwt() -> 'app_metadata' ->> 'branch_id')::uuid
$$;

create or replace function auth_role() returns text
language sql stable as $$
  select auth.jwt() -> 'app_metadata' ->> 'role'
$$;

create or replace function sync_profile_to_auth_metadata() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', new.role, 'branch_id', new.branch_id)
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_sync_profile_to_auth_metadata on profiles;
create trigger trg_sync_profile_to_auth_metadata
after insert or update of role, branch_id on profiles
for each row execute function sync_profile_to_auth_metadata();

alter table profiles enable row level security;
create policy profiles_read_own   on profiles for select using (id = auth.uid());
create policy profiles_read_admin on profiles for select using (auth_is_admin());
create policy profiles_read_branch_manager on profiles for select
  using (auth_role() = 'manager' and branch_id = auth_branch_id());
create policy profiles_admin_all  on profiles for all
  using (auth_is_admin()) with check (auth_is_admin());
create policy profiles_manager_update_employee on profiles for update
  using (auth_role() = 'manager' and branch_id = auth_branch_id() and role = 'employee')
  with check (auth_role() = 'manager' and branch_id = auth_branch_id() and role = 'employee');

alter table branches enable row level security;
create policy branches_select on branches for select
  using (auth_is_admin() or id = auth_branch_id());
create policy branches_insert on branches for insert with check (auth_is_admin());
create policy branches_update on branches for update using (auth_is_admin()) with check (auth_is_admin());

-- Patrón repetido para cada tabla de negocio scoped por branch_id
do $$
declare t text;
begin
  foreach t in array array['spots','clients','contracts','payments','prices','adjustments'] loop
    execute format('alter table %I enable row level security', t);
    execute format($f$create policy %1$I_select on %1$I for select
      using (auth_is_admin() or branch_id = auth_branch_id())$f$, t);
    execute format($f$create policy %1$I_insert on %1$I for insert
      with check (auth_is_admin() or branch_id = auth_branch_id())$f$, t);
    execute format($f$create policy %1$I_update on %1$I for update
      using (auth_is_admin() or branch_id = auth_branch_id())
      with check (auth_is_admin() or branch_id = auth_branch_id())$f$, t);
  end loop;
end $$;

-- settings usa branch_id como PK, no como columna de filtro adicional — mismo criterio
alter table settings enable row level security;
create policy settings_select on settings for select
  using (auth_is_admin() or branch_id = auth_branch_id());
create policy settings_upsert on settings for insert
  with check (auth_is_admin() or branch_id = auth_branch_id());
create policy settings_update on settings for update
  using (auth_is_admin() or branch_id = auth_branch_id())
  with check (auth_is_admin() or branch_id = auth_branch_id());

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. FUNCIONES RPC ATÓMICAS
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function next_receipt_number(p_branch_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into receipt_counters(branch_id, last_number) values (p_branch_id, 1)
    on conflict (branch_id) do update set last_number = receipt_counters.last_number + 1
    returning last_number into v_n;
  return lpad(v_n::text, 6, '0');
end;
$$;

create or replace function assign_spot(
  p_spot_id uuid, p_client_id uuid, p_rental_type text, p_period text,
  p_start_date date, p_end_date date, p_price numeric, p_plate text default null
) returns contracts
language plpgsql security definer set search_path = public as $$
declare
  v_branch_id uuid;
  v_contract  contracts;
begin
  select branch_id into v_branch_id from spots where id = p_spot_id;
  if v_branch_id is null then raise exception 'SPOT_NOT_FOUND'; end if;
  if not (auth_is_admin() or v_branch_id = auth_branch_id()) then raise exception 'FORBIDDEN'; end if;

  update spots set status = 'occupied', updated_at = now()
   where id = p_spot_id and status = 'free';

  if not found then
    raise exception 'SPOT_ALREADY_TAKEN';
  end if;

  insert into contracts (branch_id, client_id, spot_id, rental_type, period,
                          start_date, end_date, price, plate, active)
  values (v_branch_id, p_client_id, p_spot_id, p_rental_type, p_period,
          p_start_date, p_end_date, p_price, p_plate, true)
  returning * into v_contract;

  update spots set client_id = p_client_id, contract_id = v_contract.id, updated_at = now()
   where id = p_spot_id;

  return v_contract;
end;
$$;

create or replace function release_spot(p_spot_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_spot spots%rowtype;
begin
  select * into v_spot from spots where id = p_spot_id for update;
  if v_spot is null then raise exception 'SPOT_NOT_FOUND'; end if;
  if v_spot.status = 'free' then raise exception 'SPOT_ALREADY_FREE'; end if;
  if not (auth_is_admin() or v_spot.branch_id = auth_branch_id()) then raise exception 'FORBIDDEN'; end if;

  if v_spot.contract_id is not null then
    update contracts set active = false, updated_at = now() where id = v_spot.contract_id;
  end if;
  update spots set status = 'free', client_id = null, contract_id = null, updated_at = now()
   where id = p_spot_id;
end;
$$;

create or replace function checkout_hourly(
  p_contract_id uuid, p_exit_time timestamptz, p_amount numeric, p_method text, p_notes text
) returns payments
language plpgsql security definer set search_path = public as $$
declare
  v_contract contracts;
  v_receipt  text;
  v_payment  payments;
begin
  select * into v_contract from contracts where id = p_contract_id for update;
  if v_contract is null then raise exception 'CONTRACT_NOT_FOUND'; end if;
  if not v_contract.active then raise exception 'CONTRACT_ALREADY_CLOSED'; end if;
  if not (auth_is_admin() or v_contract.branch_id = auth_branch_id()) then raise exception 'FORBIDDEN'; end if;

  v_receipt := next_receipt_number(v_contract.branch_id);

  insert into payments (branch_id, client_id, contract_id, amount, date, method,
                         receipt_number, period_start, period_end, notes)
  values (v_contract.branch_id, v_contract.client_id, v_contract.id, p_amount,
          p_exit_time::date, p_method, v_receipt, v_contract.start_date, p_exit_time::date, p_notes)
  returning * into v_payment;

  update contracts set active = false, exit_time = p_exit_time, price = p_amount, updated_at = now()
   where id = p_contract_id;
  update spots set status = 'free', client_id = null, contract_id = null, updated_at = now()
   where id = v_contract.spot_id;

  return v_payment;
end;
$$;

create or replace function register_payment(
  p_branch_id uuid, p_client_id uuid, p_contract_id uuid, p_amount numeric,
  p_date date, p_method text, p_period_start date, p_period_end date, p_notes text
) returns payments
language plpgsql security definer set search_path = public as $$
declare v_receipt text; v_payment payments;
begin
  if not (auth_is_admin() or p_branch_id = auth_branch_id()) then raise exception 'FORBIDDEN'; end if;
  v_receipt := next_receipt_number(p_branch_id);
  insert into payments (branch_id, client_id, contract_id, amount, date, method,
                         receipt_number, period_start, period_end, notes)
  values (p_branch_id, p_client_id, p_contract_id, p_amount, p_date, p_method,
          v_receipt, p_period_start, p_period_end, p_notes)
  returning * into v_payment;
  return v_payment;
end;
$$;

grant execute on function assign_spot to authenticated;
grant execute on function release_spot to authenticated;
grant execute on function checkout_hourly to authenticated;
grant execute on function register_payment to authenticated;
grant execute on function next_receipt_number to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. REALTIME — habilitar replicación en las tablas que se suscriben en vivo
-- ═══════════════════════════════════════════════════════════════════════════

alter publication supabase_realtime add table spots;
alter publication supabase_realtime add table contracts;
alter publication supabase_realtime add table payments;
