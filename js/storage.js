/**
 * Chiclana Parking — Storage Layer
 * Toda la persistencia de datos via localStorage
 */

const STORAGE_KEYS = {
  BRANCHES:    'cp_branches',
  USERS:       'cp_users',
  SPOTS:       'cp_spots',
  CLIENTS:     'cp_clients',
  CONTRACTS:   'cp_contracts',
  PAYMENTS:    'cp_payments',
  PRICES:      'cp_prices',
  SESSION:     'cp_session',
  SETTINGS:    'cp_settings',
  ADJUSTMENTS: 'cp_adjustments'
};

const Storage = (() => {

  // ─── Core helpers ──────────────────────────────────────────────────────────

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch { return []; }
  }

  function write(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); }
    catch (e) { console.error('Storage write error:', e); }
  }

  function getById(key, id) {
    return read(key).find(i => i.id === id) || null;
  }

  function insert(key, item) {
    const items = read(key);
    const now = new Date().toISOString();
    const newItem = { id: generateId(), createdAt: now, updatedAt: now, ...item };
    items.push(newItem);
    write(key, items);
    return newItem;
  }

  function updateById(key, id, updates) {
    const items = read(key);
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...updates, updatedAt: new Date().toISOString() };
    write(key, items);
    return items[idx];
  }

  function deleteById(key, id) {
    write(key, read(key).filter(i => i.id !== id));
  }

  // ─── Initialize default data ───────────────────────────────────────────────

  function initialize() {
    if (read(STORAGE_KEYS.BRANCHES).length > 0) return; // Ya iniciado

    const now = new Date().toISOString();
    const branchId = generateId();

    // Sucursal por defecto
    write(STORAGE_KEYS.BRANCHES, [{
      id: branchId, name: 'Chiclana Parking', address: '', phone: '', email: '',
      totalFloors: 3, spotsPerFloor: 17, createdAt: now, updatedAt: now
    }]);

    // Usuario admin por defecto
    write(STORAGE_KEYS.USERS, [{
      id: generateId(), branchId: null, username: 'admin', password: 'admin123',
      role: 'admin', name: 'Administrador', active: true, createdAt: now, updatedAt: now
    }]);

    // Crear lugares (3 pisos x 17 cada uno)
    const spots = [];
    for (let floor = 1; floor <= 3; floor++) {
      for (let num = 1; num <= 17; num++) {
        spots.push({
          id: generateId(), branchId, floor, number: num,
          label: `P${floor}-${String(num).padStart(2, '0')}`,
          type: 'fixed',   // 'fixed' | 'mobile'
          status: 'free',  // 'free' | 'occupied' | 'disabled'
          clientId: null, contractId: null,
          createdAt: now, updatedAt: now
        });
      }
    }
    write(STORAGE_KEYS.SPOTS, spots);

    // Precios iniciales
    write(STORAGE_KEYS.PRICES, [{
      id: generateId(), branchId,
      monthlyFixed: 50000, monthlyMobile: 35000, daily: 5000, hourly: 1500,
      effectiveDate: now.split('T')[0], adjustmentPercent: null,
      notes: 'Precio inicial de configuración', createdAt: now, updatedAt: now
    }]);

    // Settings por defecto
    const settings = {};
    settings[branchId] = {
      lastPriceUpdate: now.split('T')[0],
      receiptFooter: 'Gracias por elegir Chiclana Parking',
      priceAlertDays: 90,
      hourlyFractionMinutes: 15,
      hourlyToleranceMinutes: 5,
      hourlyMinMinutes: 60
    };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  return {
    generateId,

    branches: {
      getAll: ()      => read(STORAGE_KEYS.BRANCHES),
      getById: (id)   => getById(STORAGE_KEYS.BRANCHES, id),
      add: (b)        => insert(STORAGE_KEYS.BRANCHES, b),
      update: (id, u) => updateById(STORAGE_KEYS.BRANCHES, id, u)
    },

    users: {
      getAll: ()            => read(STORAGE_KEYS.USERS),
      getById: (id)         => getById(STORAGE_KEYS.USERS, id),
      getByUsername: (name) => read(STORAGE_KEYS.USERS).find(u => u.username === name) || null,
      add: (u)              => insert(STORAGE_KEYS.USERS, u),
      update: (id, u)       => updateById(STORAGE_KEYS.USERS, id, u),
      remove: (id)          => deleteById(STORAGE_KEYS.USERS, id)
    },

    spots: {
      getAll: (bid)         => read(STORAGE_KEYS.SPOTS).filter(s => s.branchId === bid),
      getByFloor: (bid, fl) => read(STORAGE_KEYS.SPOTS).filter(s => s.branchId === bid && s.floor === fl),
      getById: (id)         => getById(STORAGE_KEYS.SPOTS, id),
      update: (id, u)       => updateById(STORAGE_KEYS.SPOTS, id, u)
    },

    clients: {
      getAll: (bid)    => read(STORAGE_KEYS.CLIENTS).filter(c => c.branchId === bid),
      getActive: (bid) => read(STORAGE_KEYS.CLIENTS).filter(c => c.branchId === bid && c.active !== false),
      getById: (id)    => getById(STORAGE_KEYS.CLIENTS, id),
      add: (c)         => insert(STORAGE_KEYS.CLIENTS, c),
      update: (id, u)  => updateById(STORAGE_KEYS.CLIENTS, id, u)
    },

    contracts: {
      getAll: (bid)       => read(STORAGE_KEYS.CONTRACTS).filter(c => c.branchId === bid),
      getActive: (bid)    => read(STORAGE_KEYS.CONTRACTS).filter(c => c.branchId === bid && c.active),
      getById: (id)       => getById(STORAGE_KEYS.CONTRACTS, id),
      getBySpot: (sid)    => read(STORAGE_KEYS.CONTRACTS).find(c => c.spotId === sid && c.active) || null,
      getByClient: (cid)  => read(STORAGE_KEYS.CONTRACTS).filter(c => c.clientId === cid),
      add: (c)            => insert(STORAGE_KEYS.CONTRACTS, c),
      update: (id, u)     => updateById(STORAGE_KEYS.CONTRACTS, id, u)
    },

    payments: {
      getAll: (bid)          => read(STORAGE_KEYS.PAYMENTS).filter(p => p.branchId === bid),
      getByClient: (cid)     => read(STORAGE_KEYS.PAYMENTS).filter(p => p.clientId === cid),
      getByContract: (ctid)  => read(STORAGE_KEYS.PAYMENTS).filter(p => p.contractId === ctid),
      getNextReceiptNumber: (bid) => {
        const n = read(STORAGE_KEYS.PAYMENTS).filter(p => p.branchId === bid).length + 1;
        return String(n).padStart(6, '0');
      },
      add: (p) => insert(STORAGE_KEYS.PAYMENTS, p)
    },

    prices: {
      getAll: (bid)    => read(STORAGE_KEYS.PRICES).filter(p => p.branchId === bid),
      getCurrent: (bid) => {
        const list = read(STORAGE_KEYS.PRICES)
          .filter(p => p.branchId === bid)
          .sort((a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate));
        return list[0] || null;
      },
      add: (p) => insert(STORAGE_KEYS.PRICES, p)
    },

    session: {
      get:   ()  => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION)); } catch { return null; } },
      set:   (s) => localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(s)),
      clear: ()  => localStorage.removeItem(STORAGE_KEYS.SESSION)
    },

    settings: {
      get: (bid) => {
        try {
          const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}');
          return all[bid] || {};
        } catch { return {}; }
      },
      update: (bid, updates) => {
        try {
          const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}');
          all[bid] = { ...(all[bid] || {}), ...updates };
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(all));
        } catch {}
      }
    },

    adjustments: {
      getAll: (bid)      => read(STORAGE_KEYS.ADJUSTMENTS).filter(a => a.branchId === bid),
      getByClient: (cid) => read(STORAGE_KEYS.ADJUSTMENTS).filter(a => a.clientId === cid),
      add: (a)           => insert(STORAGE_KEYS.ADJUSTMENTS, a)
    },

    initialize
  };
})();
