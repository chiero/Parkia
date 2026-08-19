-- Chiclana Parking — Seed inicial (Fase 0)
-- Ejecutar UNA sola vez, después de schema.sql, en una base vacía.
-- Replica los valores por defecto que hoy pone Storage.initialize() en localStorage.

do $$
declare
  v_branch_id uuid;
  v_floor     int;
  v_num       int;
begin
  insert into branches (name, total_floors, spots_per_floor)
  values ('Chiclana Parking', 3, 17)
  returning id into v_branch_id;

  for v_floor in 1..3 loop
    for v_num in 1..17 loop
      insert into spots (branch_id, floor, number, label, type, status)
      values (v_branch_id, v_floor, v_num,
              'P' || v_floor || '-' || lpad(v_num::text, 2, '0'),
              'fixed', 'free');
    end loop;
  end loop;

  insert into prices (branch_id, monthly_fixed, monthly_mobile, daily, hourly, effective_date, notes)
  values (v_branch_id, 50000, 35000, 5000, 1500, current_date, 'Precio inicial de configuración');

  insert into settings (branch_id, last_price_update, receipt_footer, price_alert_days,
                         hourly_fraction_minutes, hourly_tolerance_minutes, hourly_min_minutes)
  values (v_branch_id, current_date, 'Gracias por elegir Chiclana Parking', 90, 15, 5, 60);

  raise notice 'Sucursal creada con id: %', v_branch_id;
end $$;

-- Después de correr esto, anotá el id de la sucursal (queda en el mensaje "NOTICE" arriba,
-- o consultalo con: select id, name from branches;) — lo vas a necesitar en el paso
-- "Fase 6: usuarios iniciales" para crear el perfil del admin apuntando a ese branch_id
-- (o branch_id = null si querés que el admin vea todas las sucursales).
