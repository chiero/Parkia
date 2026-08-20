/**
 * Chiclana Parking — Storage Layer
 * Persistencia vía Supabase (Postgres). Misma API pública que la versión
 * anterior sobre localStorage, pero todos los métodos son ahora async.
 */

const Storage = (() => {

  const sb = supabaseClient;

  class StorageError extends Error {
    constructor(message, cause) { super(message); this.name = 'StorageError'; this.cause = cause; }
  }

  // ─── camelCase (JS) ↔ snake_case (Postgres) ────────────────────────────────

  const toSnake = s => s.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
  const toCamel = s => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

  function toDb(obj) {
    if (!obj) return obj;
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [toSnake(k), v]));
  }
  function fromDb(row) {
    if (!row) return null;
    return Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v]));
  }
  function fromDbList(rows) {
    return (rows || []).map(fromDb);
  }

  function check(error) {
    if (error) {
      console.error('Supabase error:', error);
      throw new StorageError(error.message || 'Error de base de datos', error);
    }
  }

  function rpcError(error, translations) {
    const msg = error?.message || '';
    for (const [code, text] of Object.entries(translations)) {
      if (msg.includes(code)) throw new StorageError(text, error);
    }
    check(error);
  }

  // ─── Core helpers (CRUD genérico) ───────────────────────────────────────────

  async function getAll(table, filters = {}) {
    let q = sb.from(table).select('*');
    for (const [k, v] of Object.entries(filters)) q = q.eq(toSnake(k), v);
    const { data, error } = await q;
    check(error);
    return fromDbList(data);
  }

  async function getById(table, id) {
    if (!id) return null;
    const { data, error } = await sb.from(table).select('*').eq('id', id).maybeSingle();
    check(error);
    return fromDb(data);
  }

  async function insert(table, item) {
    const { data, error } = await sb.from(table).insert(toDb(item)).select().single();
    check(error);
    return fromDb(data);
  }

  async function updateById(table, id, updates) {
    const { data, error } = await sb.from(table)
      .update(toDb({ ...updates, updatedAt: new Date().toISOString() }))
      .eq('id', id).select().maybeSingle();
    check(error);
    return fromDb(data);
  }

  async function deleteById(table, id) {
    const { error } = await sb.from(table).delete().eq('id', id);
    check(error);
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  return {
    generateId: () => crypto.randomUUID(),

    branches: {
      getAll:  ()      => getAll('branches'),
      getById: (id)    => getById('branches', id),
      add:     (b)     => insert('branches', b),
      update:  (id, u) => updateById('branches', id, u)
    },

    users: {
      // Compatibilidad de nombre: la tabla real es "profiles" (users vive en Supabase Auth).
      getAll:         ()             => getAll('profiles'),
      getById:        (id)           => getById('profiles', id),
      getByUsername:  async (name)   => (await getAll('profiles', { username: name }))[0] || null,
      update:         (id, u)        => updateById('profiles', id, u),

      // Crear un usuario requiere la service role key (Auth admin API), que
      // nunca debe viajar al navegador. La Edge Function "create-user" la
      // guarda del lado del servidor y valida que quien llama sea admin.
      add: async (u) => {
        const { data, error } = await sb.functions.invoke('create-user', {
          body: { username: u.username, password: u.password, name: u.name, role: u.role, branchId: u.branchId || null }
        });
        if (error) {
          let message = error.message;
          try { const body = await error.context?.json(); if (body?.error) message = body.error; } catch {}
          throw new StorageError(message || 'No se pudo crear el usuario', error);
        }
        if (data?.error) throw new StorageError(data.error);
        return fromDb(data.profile);
      }
      // remove() no se expone: dar de baja un usuario es toggle de "active", no borrado.
    },

    spots: {
      getAll:     (bid)     => getAll('spots', { branchId: bid }),
      getByFloor: (bid, fl) => getAll('spots', { branchId: bid, floor: fl }),
      getById:    (id)      => getById('spots', id),
      add:        (s)       => insert('spots', s),
      update:     (id, u)   => updateById('spots', id, u),

      // Reemplaza el viejo patrón "leer → chequear status → update" (race condition
      // real con varios celulares) por una función atómica en el servidor.
      assign: async (spotId, { clientId, rentalType, period, startDate, endDate, price, plate }) => {
        const { data, error } = await sb.rpc('assign_spot', {
          p_spot_id: spotId, p_client_id: clientId, p_rental_type: rentalType, p_period: period,
          p_start_date: startDate || null, p_end_date: endDate || null,
          p_price: price, p_plate: plate || null
        });
        if (error) {
          rpcError(error, { SPOT_ALREADY_TAKEN: 'Ese lugar ya fue asignado por otro usuario. Actualizá la pantalla.' });
        }
        return fromDb(data);
      },

      release: async (spotId) => {
        const { error } = await sb.rpc('release_spot', { p_spot_id: spotId });
        if (error) {
          rpcError(error, { SPOT_ALREADY_FREE: 'Ese lugar ya estaba libre. Actualizá la pantalla.' });
        }
      }
    },

    clients: {
      getAll:    (bid) => getAll('clients', { branchId: bid }),
      getActive: (bid) => getAll('clients', { branchId: bid, active: true }),
      getById:   (id)  => getById('clients', id),
      add:       (c)   => insert('clients', c),
      update:    (id, u) => updateById('clients', id, u)
    },

    contracts: {
      getAll:      (bid)  => getAll('contracts', { branchId: bid }),
      getActive:   (bid)  => getAll('contracts', { branchId: bid, active: true }),
      getById:     (id)   => getById('contracts', id),
      getBySpot:   async (sid) => (await getAll('contracts', { spotId: sid, active: true }))[0] || null,
      getByClient: (cid)  => getAll('contracts', { clientId: cid }),
      add:         (c)    => insert('contracts', c),
      update:      (id, u) => updateById('contracts', id, u)
    },

    payments: {
      getAll:        (bid)  => getAll('payments', { branchId: bid }),
      getByClient:   (cid)  => getAll('payments', { clientId: cid }),
      getByContract: (ctid) => getAll('payments', { contractId: ctid }),

      // La numeración de recibo ya no se calcula en el cliente (getNextReceiptNumber
      // tenía la misma race condition que la asignación de plaza): el servidor la
      // genera atómicamente dentro de add()/checkoutHourly().
      add: async (p) => {
        const { data, error } = await sb.rpc('register_payment', {
          p_branch_id: p.branchId, p_client_id: p.clientId, p_contract_id: p.contractId || null,
          p_amount: p.amount, p_date: p.date || null, p_method: p.method || 'cash',
          p_period_start: p.periodStart || null, p_period_end: p.periodEnd || null,
          p_notes: p.notes || null
        });
        check(error);
        return fromDb(data);
      },

      checkoutHourly: async (contractId, exitTimeIso, amount, method, notes) => {
        const { data, error } = await sb.rpc('checkout_hourly', {
          p_contract_id: contractId, p_exit_time: exitTimeIso,
          p_amount: amount, p_method: method || 'cash', p_notes: notes || null
        });
        check(error);
        return fromDb(data);
      }
    },

    prices: {
      getAll: (bid) => getAll('prices', { branchId: bid }),
      getCurrent: async (bid) => {
        const list = (await getAll('prices', { branchId: bid }))
          .sort((a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate));
        return list[0] || null;
      },
      add: (p) => insert('prices', p)
    },

    adjustments: {
      getAll:      (bid) => getAll('adjustments', { branchId: bid }),
      getByClient: (cid) => getAll('adjustments', { clientId: cid }),
      add:         (a)   => insert('adjustments', a)
    },

    settings: {
      get: async (bid) => {
        const { data, error } = await sb.from('settings').select('*').eq('branch_id', bid).maybeSingle();
        check(error);
        return fromDb(data) || {};
      },
      update: async (bid, updates) => {
        const { data, error } = await sb.from('settings')
          .upsert(toDb({ ...updates, branchId: bid, updatedAt: new Date().toISOString() }), { onConflict: 'branch_id' })
          .select().maybeSingle();
        check(error);
        return fromDb(data);
      }
    },

    // El seed inicial (sucursal, plazas, precios, settings) se corre una sola vez
    // en Supabase (supabase/seed.sql), no en el cliente.
    initialize: async () => {}
  };
})();
