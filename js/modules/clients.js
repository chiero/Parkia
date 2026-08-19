/**
 * Chiclana Parking — Clients Module
 */

const ClientsModule = (() => {

  let searchQuery = '';
  let filterStatus = 'all';

  async function render() {
    const session  = Auth.getSession();
    const branchId = session.branchId;

    const [allClients, contracts, spots] = await Promise.all([
      Storage.clients.getAll(branchId),
      Storage.contracts.getAll(branchId),
      Storage.spots.getAll(branchId)
    ]);

    const spotsById = new Map(spots.map(s => [s.id, s]));

    // Build contract lookup
    const activeContractByClient = {};
    contracts.filter(c => c.active).forEach(c => {
      activeContractByClient[c.clientId] = c;
    });

    // Filter
    let filtered = allClients.filter(c => {
      if (filterStatus === 'active'   && c.active === false) return false;
      if (filterStatus === 'inactive' && c.active !== false) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          (c.firstName + ' ' + c.lastName).toLowerCase().includes(q) ||
          (c.plate || '').toLowerCase().includes(q) ||
          (c.dni || '').includes(q) ||
          (c.phone || '').includes(q)
        );
      }
      return true;
    });

    const body = document.getElementById('clients-body');
    body.innerHTML = `
      <!-- Filters -->
      <div class="search-bar mb-2" style="margin-bottom:1rem">
        <div class="search-input-wrap">
          <span class="search-icon">🔍</span>
          <input class="form-control" type="text" id="client-search"
                 placeholder="Buscar por nombre, patente, DNI, teléfono…"
                 style="width:300px" value="${Utils.escapeHtml(searchQuery)}">
        </div>
        <select class="form-control" id="client-filter" style="width:auto">
          <option value="all" ${filterStatus==='all'?'selected':''}>Todos</option>
          <option value="active" ${filterStatus==='active'?'selected':''}>Activos</option>
          <option value="inactive" ${filterStatus==='inactive'?'selected':''}>Inactivos</option>
        </select>
        <span style="color:var(--text-muted);font-size:.78rem;margin-left:auto">${filtered.length} cliente${filtered.length!==1?'s':''}</span>
      </div>

      <!-- Table -->
      <div class="card">
        <div class="table-wrap">
          ${filtered.length === 0 ? `
            <div class="empty-state">
              <div class="empty-icon">👥</div>
              <h3>${searchQuery ? 'Sin resultados' : 'Sin clientes registrados'}</h3>
              <p>${searchQuery ? 'Probá con otro término de búsqueda.' : 'Creá el primer cliente con el botón "+ Nuevo cliente".'}</p>
            </div>
          ` : `
          <table>
            <thead><tr>
              <th>Cliente</th><th>DNI</th><th>Teléfono</th><th>Vehículo</th>
              <th>Lugar</th><th>Tipo</th><th>Estado</th><th>Vencimiento</th><th>Acciones</th>
            </tr></thead>
            <tbody>
              ${filtered.map(c => renderClientRow(c, activeContractByClient[c.id], spotsById)).join('')}
            </tbody>
          </table>`}
        </div>
      </div>
    `;

    // Events
    const searchInput = document.getElementById('client-search');
    searchInput.addEventListener('input', Utils.debounce(e => {
      searchQuery = e.target.value;
      render();
    }));
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') { searchQuery = ''; render(); }
    });

    document.getElementById('client-filter').addEventListener('change', e => {
      filterStatus = e.target.value;
      render();
    });

    // Row action buttons
    body.querySelectorAll('[data-client-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const { clientAction, clientId } = btn.dataset;
        if (clientAction === 'view')    showClientDetail(clientId);
        if (clientAction === 'edit')    showEditClientModal(clientId);
        if (clientAction === 'pay')     { Utils.closeModal(); PaymentsModule.showNewPaymentModal(clientId); }
        if (clientAction === 'toggle')  toggleClientActive(clientId);
      });
    });

    // Row click → detail
    body.querySelectorAll('tr[data-client-id]').forEach(row => {
      row.addEventListener('click', () => showClientDetail(row.dataset.clientId));
    });
  }

  function renderClientRow(client, contract, spotsById) {
    const status = Utils.contractStatus(contract);
    const spot   = contract ? spotsById.get(contract.spotId) : null;

    return `<tr data-client-id="${client.id}" style="cursor:pointer">
      <td>
        <div style="display:flex;align-items:center;gap:.6rem">
          <div class="avatar">${(client.firstName || 'C').charAt(0)}</div>
          <div>
            <div class="fw-600">${Utils.escapeHtml(client.firstName)} ${Utils.escapeHtml(client.lastName)}</div>
            <div style="font-size:.72rem;color:var(--text-muted)">${Utils.escapeHtml(client.email || '')}</div>
          </div>
        </div>
      </td>
      <td style="color:var(--text-secondary)">${Utils.escapeHtml(client.dni || '—')}</td>
      <td>${client.phone ?
        `<a href="tel:${Utils.escapeHtml(client.phone)}" onclick="event.stopPropagation()">
          ${Utils.escapeHtml(client.phone)}</a>` : '—'}</td>
      <td>
        <div class="fw-600">${Utils.escapeHtml(client.plate || '—')}</div>
        <div style="font-size:.72rem;color:var(--text-muted)">${Utils.escapeHtml([client.vehicleMake, client.vehicleModel].filter(Boolean).join(' ') || '')}</div>
      </td>
      <td>${spot ? `<span class="badge badge-accent">${spot.label}</span>` : '<span class="text-muted">—</span>'}</td>
      <td>${contract ? `<span class="badge ${contract.rentalType==='fixed'?'badge-danger':'badge-warning'}">${Utils.rentalTypeLabel(contract.rentalType)}</span>` : '—'}</td>
      <td>${Utils.statusBadge(contract ? status : (client.active === false ? 'inactive' : 'inactive'))}</td>
      <td style="font-size:.8rem">${contract ? Utils.formatDate(contract.endDate) : '—'}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:.25rem">
          <button class="btn btn-ghost btn-icon btn-sm" data-client-action="view" data-client-id="${client.id}" title="Ver detalle">👁</button>
          ${Auth.isManagerOrAbove() ? `
          <button class="btn btn-ghost btn-icon btn-sm" data-client-action="edit" data-client-id="${client.id}" title="Editar">✏️</button>
          <button class="btn btn-ghost btn-icon btn-sm" data-client-action="pay" data-client-id="${client.id}" title="Registrar pago">💰</button>` : ''}
        </div>
      </td>
    </tr>`;
  }

  // ─── New / Edit client modal ────────────────────────────────────────────────

  function showNewClientModal(prefillPlate) {
    showClientForm(null, prefillPlate);
  }

  async function showEditClientModal(clientId) {
    const client = await Storage.clients.getById(clientId);
    showClientForm(client);
  }

  function showClientForm(client, prefillPlate) {
    const isEdit = !!client;
    const c = client || { plate: prefillPlate || '' };

    Utils.showModal(
      isEdit ? `Editar cliente — ${c.firstName} ${c.lastName}` : 'Nuevo cliente',
      `<div style="display:flex;flex-direction:column;gap:.9rem">

        <div class="form-section-title">📋 Datos personales</div>

        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Nombre <span class="required">*</span></label>
            <input class="form-control" id="cf-firstname" type="text" placeholder="Juan" value="${Utils.escapeHtml(c.firstName||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Apellido <span class="required">*</span></label>
            <input class="form-control" id="cf-lastname" type="text" placeholder="García" value="${Utils.escapeHtml(c.lastName||'')}">
          </div>
        </div>

        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">DNI</label>
            <input class="form-control" id="cf-dni" type="text" placeholder="12.345.678" value="${Utils.escapeHtml(c.dni||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Teléfono / WhatsApp</label>
            <input class="form-control" id="cf-phone" type="tel" placeholder="011 1234 5678" value="${Utils.escapeHtml(c.phone||'')}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-control" id="cf-email" type="email" placeholder="cliente@email.com" value="${Utils.escapeHtml(c.email||'')}">
        </div>

        <div class="form-section-title" style="margin-top:.25rem">🚗 Datos del vehículo</div>

        <div class="form-group">
          <label class="form-label">Patente <span class="required">*</span></label>
          <input class="form-control" id="cf-plate" type="text" placeholder="ABC 123"
                 value="${Utils.escapeHtml(c.plate||'')}" style="text-transform:uppercase">
        </div>

        <div class="form-row cols-3">
          <div class="form-group">
            <label class="form-label">Marca</label>
            <input class="form-control" id="cf-make" type="text" placeholder="Toyota" value="${Utils.escapeHtml(c.vehicleMake||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Modelo</label>
            <input class="form-control" id="cf-model" type="text" placeholder="Corolla" value="${Utils.escapeHtml(c.vehicleModel||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Color</label>
            <input class="form-control" id="cf-color" type="text" placeholder="Blanco" value="${Utils.escapeHtml(c.vehicleColor||'')}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Tipo de vehículo</label>
          <select class="form-control" id="cf-vehicle-type">
            <option value="car"   ${(c.vehicleType||'car')==='car'?'selected':''}>Automóvil</option>
            <option value="truck" ${c.vehicleType==='truck'?'selected':''}>Camioneta / SUV</option>
            <option value="van"   ${c.vehicleType==='van'?'selected':''}>Utilitario / Van</option>
            <option value="moto"  ${c.vehicleType==='moto'?'selected':''}>Moto</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Notas</label>
          <textarea class="form-control" id="cf-notes" placeholder="Notas adicionales sobre el cliente o vehículo…" rows="2">${Utils.escapeHtml(c.notes||'')}</textarea>
        </div>

      </div>`,
      [
        { id: 'save-client', label: isEdit ? 'Guardar cambios' : '+ Crear cliente', cls: 'btn-primary',
          close: false, handler: () => saveClient(client ? client.id : null) },
        { id: 'cancel-client', label: 'Cancelar', cls: 'btn-secondary', handler: () => {} }
      ],
      'modal-lg'
    );

    document.getElementById('cf-plate').addEventListener('input', function() {
      this.value = this.value.toUpperCase();
    });
  }

  async function saveClient(existingId) {
    const firstName   = document.getElementById('cf-firstname')?.value.trim();
    const lastName    = document.getElementById('cf-lastname')?.value.trim();
    const plate       = document.getElementById('cf-plate')?.value.trim().toUpperCase();

    if (!firstName) { Utils.showToast('El nombre es obligatorio', 'error'); return; }
    if (!lastName)  { Utils.showToast('El apellido es obligatorio', 'error'); return; }
    if (!plate)     { Utils.showToast('La patente es obligatoria', 'error'); return; }

    const session = Auth.getSession();
    const data = {
      firstName,
      lastName,
      dni:          document.getElementById('cf-dni')?.value.trim() || '',
      phone:        document.getElementById('cf-phone')?.value.trim() || '',
      email:        document.getElementById('cf-email')?.value.trim() || '',
      plate,
      vehicleMake:  document.getElementById('cf-make')?.value.trim() || '',
      vehicleModel: document.getElementById('cf-model')?.value.trim() || '',
      vehicleColor: document.getElementById('cf-color')?.value.trim() || '',
      vehicleType:  document.getElementById('cf-vehicle-type')?.value || 'car',
      notes:        document.getElementById('cf-notes')?.value.trim() || '',
      active:       true
    };

    if (existingId) {
      await Storage.clients.update(existingId, data);
      Utils.showToast('Cliente actualizado ✓', 'success');
    } else {
      await Storage.clients.add({ ...data, branchId: session.branchId });
      Utils.showToast('Cliente creado correctamente ✓', 'success');
    }

    Utils.closeModal();
    await render();
  }

  // ─── Client detail & Cuenta Corriente ────────────────────────────────────────

  async function getClientLedger(clientId) {
    const session = Auth.getSession();

    const [contracts, payments, adjustments, spots] = await Promise.all([
      Storage.contracts.getByClient(clientId),
      Storage.payments.getByClient(clientId),
      Storage.adjustments ? Storage.adjustments.getByClient(clientId) : Promise.resolve([]),
      Storage.spots.getAll(session.branchId)
    ]);

    const spotsById = new Map(spots.map(s => [s.id, s]));

    const movements = [];

    // Charges from contracts
    contracts.forEach(c => {
      const spot = c.spotId ? spotsById.get(c.spotId) : null;
      const spotText = spot ? ` (Lugar ${spot.label})` : '';
      const concept = c.rentalType === 'hourly'
        ? `Estadía por hora${spotText}`
        : `Alquiler ${Utils.rentalTypeLabel(c.rentalType)}${spotText} — ${Utils.formatDate(c.startDate)} al ${Utils.formatDate(c.endDate)}`;

      movements.push({
        id: c.id,
        date: c.startDate || c.createdAt,
        type: 'charge',
        concept,
        debe: c.price || 0,
        haber: 0
      });
    });

    // Credits from payments
    payments.forEach(p => {
      movements.push({
        id: p.id,
        date: p.createdAt || p.date,
        type: 'payment',
        concept: `Pago Recibo ${Utils.formatReceiptNumber(p.receiptNumber)} (${Utils.methodLabel(p.method)})`,
        debe: 0,
        haber: p.amount || 0,
        receiptNumber: p.receiptNumber
      });
    });

    // Manual Adjustments
    adjustments.forEach(a => {
      const isCharge = a.type === 'charge';
      movements.push({
        id: a.id,
        date: a.date || a.createdAt,
        type: a.type,
        concept: a.description || (isCharge ? 'Cargo / Ajuste manual' : 'Descuento / Saldo a favor'),
        debe: isCharge ? (a.amount || 0) : 0,
        haber: isCharge ? 0 : (a.amount || 0)
      });
    });

    // Sort chronologically
    movements.sort((a, b) => new Date(a.date) - new Date(b.date));

    let totalDebe  = 0;
    let totalHaber = 0;
    let running    = 0;

    movements.forEach(m => {
      totalDebe  += m.debe;
      totalHaber += m.haber;
      running    += (m.debe - m.haber);
      m.runningBalance = running;
    });

    return {
      movements,
      totalDebe,
      totalHaber,
      balance: running
    };
  }

  async function showClientDetail(clientId, defaultTab = 'ledger') {
    const [client, contracts, payments] = await Promise.all([
      Storage.clients.getById(clientId),
      Storage.contracts.getByClient(clientId),
      Storage.payments.getByClient(clientId)
    ]);
    if (!client) return;

    const active = contracts.find(c => c.active) || null;
    const spot   = active ? await Storage.spots.getById(active.spotId) : null;
    const status = Utils.contractStatus(active);
    const ledger = await getClientLedger(clientId);

    let balanceBadge = '';
    if (ledger.balance > 0) {
      balanceBadge = `<span class="badge badge-danger" style="font-size:.85rem;padding:.35rem .75rem">🔴 Debe: ${Utils.formatCurrency(ledger.balance)}</span>`;
    } else if (ledger.balance === 0) {
      balanceBadge = `<span class="badge badge-success" style="font-size:.85rem;padding:.35rem .75rem">🟢 Al día ($0)</span>`;
    } else {
      balanceBadge = `<span class="badge badge-info" style="font-size:.85rem;padding:.35rem .75rem">🔵 A favor: ${Utils.formatCurrency(Math.abs(ledger.balance))}</span>`;
    }

    Utils.showModal(
      `Ficha de Cliente — ${client.firstName} ${client.lastName}`,
      `<div style="display:flex;flex-direction:column;gap:1rem">

        <!-- Client Header -->
        <div style="display:flex;align-items:center;gap:1rem;padding:1rem;background:var(--bg-tertiary);border-radius:var(--radius);flex-wrap:wrap">
          <div class="avatar" style="width:52px;height:52px;font-size:1.3rem">${(client.firstName||'C').charAt(0)}</div>
          <div style="flex:1;min-width:200px">
            <div style="font-weight:700;font-size:1.1rem">${Utils.escapeHtml(client.firstName)} ${Utils.escapeHtml(client.lastName)}</div>
            <div style="font-size:.8rem;color:var(--text-secondary);margin-top:.2rem">
              ${client.dni ? `DNI: ${client.dni} · ` : ''}
              ${client.phone ? `📞 ${client.phone} · ` : ''}
              Patente: <strong>${Utils.escapeHtml(client.plate || '—')}</strong>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.35rem">
            ${balanceBadge}
            ${Utils.statusBadge(active ? status : 'inactive')}
          </div>
        </div>

        <!-- Detail Tabs -->
        <div class="tab-list" id="client-detail-tabs" style="margin:0">
          <button class="tab-btn ${defaultTab==='ledger'?'active':''}" data-tab="ledger">📊 Cuenta Corriente</button>
          <button class="tab-btn ${defaultTab==='info'?'active':''}" data-tab="info">📋 Datos y Contrato</button>
          <button class="tab-btn ${defaultTab==='payments'?'active':''}" data-tab="payments">💰 Historial de Pagos (${payments.length})</button>
        </div>

        <!-- Tab Content Container -->
        <div id="client-tab-content">
          ${renderClientDetailTab(client, active, spot, status, ledger, payments, defaultTab)}
        </div>

      </div>`,
      [
        ...(Auth.isManagerOrAbove() ? [
          { id: 'add-adj-btn', label: '+ Ajuste / Cargo', cls: 'btn-secondary', handler: () => showAddAdjustmentModal(clientId) },
          { id: 'edit-client-btn', label: '✏️ Editar datos', cls: 'btn-secondary', handler: () => showEditClientModal(clientId) },
          { id: 'pay-client-btn', label: '💰 Registrar Pago', cls: 'btn-success', handler: () => { Utils.closeModal(); PaymentsModule.showNewPaymentModal(clientId); } }
        ] : []),
        { id: 'close-detail', label: 'Cerrar', cls: 'btn-secondary', handler: () => {} }
      ],
      'modal-xl'
    );

    // Bind tab clicks inside detail modal
    document.querySelectorAll('#client-detail-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('#client-detail-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('client-tab-content').innerHTML =
          renderClientDetailTab(client, active, spot, status, ledger, payments, tab);
      });
    });
  }

  function renderClientDetailTab(client, active, spot, status, ledger, payments, tab) {
    if (tab === 'ledger') {
      return `
        <div style="display:flex;flex-direction:column;gap:1rem">

          <!-- Summary Cards -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.75rem">
            <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.85rem;text-align:center">
              <div style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase;font-weight:700">Total Cargos / Debe</div>
              <div style="font-size:1.15rem;font-weight:700;color:var(--text-primary);margin-top:.25rem">${Utils.formatCurrency(ledger.totalDebe)}</div>
            </div>
            <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.85rem;text-align:center">
              <div style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase;font-weight:700">Total Pagado / Haber</div>
              <div style="font-size:1.15rem;font-weight:700;color:var(--success);margin-top:.25rem">${Utils.formatCurrency(ledger.totalHaber)}</div>
            </div>
            <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.85rem;text-align:center">
              <div style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase;font-weight:700">Saldo Actual</div>
              <div style="font-size:1.2rem;font-weight:800;color:${ledger.balance>0?'var(--danger)':ledger.balance<0?'#0284c7':'var(--success)'};margin-top:.25rem">
                ${ledger.balance > 0 ? `Debe ${Utils.formatCurrency(ledger.balance)}` : ledger.balance < 0 ? `A Favor ${Utils.formatCurrency(Math.abs(ledger.balance))}` : '$0 (Al día)'}
              </div>
            </div>
          </div>

          <!-- Actions Bar -->
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;justify-content:flex-end">
            ${client.phone ? `
            <button class="btn btn-success btn-sm" onclick="ClientsModule.sendAccountSummaryWhatsApp('${client.id}')">
              📲 Enviar Cta Cte por WhatsApp
            </button>` : ''}
            <button class="btn btn-secondary btn-sm" onclick="ClientsModule.printAccountStatement('${client.id}')">
              🖨️ Imprimir Estado de Cuenta
            </button>
          </div>

          <!-- Ledger Table -->
          <div class="card">
            <div class="table-wrap">
              ${ledger.movements.length === 0 ? `
                <div class="empty-state" style="padding:2rem"><div class="empty-icon">📊</div><h3>Sin movimientos</h3><p>Los cargos y pagos aparecerán aquí.</p></div>
              ` : `
              <table style="font-size:.82rem">
                <thead><tr>
                  <th>Fecha</th><th>Concepto / Detalle</th><th>Debe (Cargo)</th><th>Haber (Pago)</th><th>Saldo</th>
                </tr></thead>
                <tbody>
                  ${ledger.movements.map(m => {
                    const salClass = m.runningBalance > 0 ? 'text-danger fw-700' : m.runningBalance < 0 ? 'text-info fw-700' : 'text-success';
                    const salText = m.runningBalance > 0 ? `${Utils.formatCurrency(m.runningBalance)} Dr.` : m.runningBalance < 0 ? `${Utils.formatCurrency(Math.abs(m.runningBalance))} Cr.` : '$0';

                    return `<tr>
                      <td style="color:var(--text-muted);white-space:nowrap">${Utils.formatDate(m.date)}</td>
                      <td class="fw-600">${Utils.escapeHtml(m.concept)}</td>
                      <td>${m.debe > 0 ? `<span style="color:var(--text-primary)">${Utils.formatCurrency(m.debe)}</span>` : '—'}</td>
                      <td>${m.haber > 0 ? `<span class="text-success fw-600">${Utils.formatCurrency(m.haber)}</span>` : '—'}</td>
                      <td class="${salClass}">${salText}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>`}
            </div>
          </div>

        </div>
      `;
    }

    if (tab === 'info') {
      return `
        <div style="display:flex;flex-direction:column;gap:1rem">
          <!-- Vehicle -->
          <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.85rem">
            <div style="font-size:.7rem;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:.5rem">🚗 Vehículo</div>
            <div style="font-size:1.2rem;font-weight:800;letter-spacing:.05em">${Utils.escapeHtml(client.plate || '—')}</div>
            <div style="font-size:.82rem;color:var(--text-secondary);margin-top:.2rem">
              ${Utils.escapeHtml([client.vehicleMake, client.vehicleModel, client.vehicleColor].filter(Boolean).join(' ') || 'Sin datos adicionales')}
            </div>
          </div>

          <!-- Active contract -->
          ${active ? `
          <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.85rem">
            <div style="font-size:.7rem;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:.5rem">📋 Contrato activo</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;font-size:.82rem">
              <div><span style="color:var(--text-muted)">Lugar:</span> ${spot ? `<strong>${spot.label}</strong>` : '—'}</div>
              <div><span style="color:var(--text-muted)">Tipo:</span> <strong>${Utils.rentalTypeLabel(active.rentalType)}</strong></div>
              <div><span style="color:var(--text-muted)">Inicio:</span> ${Utils.formatDate(active.startDate)}</div>
              <div><span style="color:var(--text-muted)">Vence:</span> <strong>${Utils.formatDate(active.endDate)}</strong></div>
              <div><span style="color:var(--text-muted)">Precio:</span> <strong style="color:var(--success)">${Utils.formatCurrency(active.price)}</strong></div>
            </div>
          </div>` : '<div style="text-align:center;padding:1rem;color:var(--text-muted);font-size:.85rem;background:var(--bg-tertiary);border-radius:var(--radius)">Sin contrato activo actualmente</div>'}

          <!-- Notes -->
          ${client.notes ? `
          <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.85rem">
            <div style="font-size:.7rem;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:.3rem">📝 Notas</div>
            <div style="font-size:.82rem;color:var(--text-secondary)">${Utils.escapeHtml(client.notes)}</div>
          </div>` : ''}
        </div>
      `;
    }

    if (tab === 'payments') {
      return `
        <div>
          ${payments.length === 0 ? '<p style="color:var(--text-muted);font-size:.85rem;text-align:center;padding:2rem">Sin pagos registrados para este cliente.</p>' : `
          <div style="max-height:280px;overflow-y:auto">
            <table style="font-size:.8rem">
              <thead><tr><th>Recibo</th><th>Periodo</th><th>Monto</th><th>Método</th><th>Fecha</th><th>Acción</th></tr></thead>
              <tbody>
                ${[...payments].sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).map(p => `
                <tr>
                  <td><span class="badge badge-muted">${Utils.formatReceiptNumber(p.receiptNumber)}</span></td>
                  <td>${Utils.formatDate(p.periodStart)} → ${Utils.formatDate(p.periodEnd)}</td>
                  <td class="fw-600 text-success">${Utils.formatCurrency(p.amount)}</td>
                  <td>${Utils.methodLabel(p.method)}</td>
                  <td style="color:var(--text-muted)">${Utils.formatDate(p.createdAt)}</td>
                  <td>
                    <button class="btn btn-ghost btn-icon btn-sm" onclick="PaymentsModule.printReceipt('${p.id}')" title="Imprimir recibo">🖨️</button>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
        </div>
      `;
    }
  }

  async function showAddAdjustmentModal(clientId) {
    const client = await Storage.clients.getById(clientId);
    if (!client) return;
    const today = new Date().toISOString().split('T')[0];

    Utils.showModal(`Agregar Ajuste / Cargo — ${client.firstName} ${client.lastName}`, `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div class="form-group">
          <label class="form-label">Tipo de movimiento <span class="required">*</span></label>
          <select class="form-control" id="adj-type">
            <option value="charge">🔴 Cargo / Aumento de deuda (Debe)</option>
            <option value="credit">🟢 Descuento / Pago a favor (Haber)</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Concepto / Descripción <span class="required">*</span></label>
          <input class="form-control" id="adj-desc" placeholder="Ej: Duplicado de llave, Recargo por mora, Descuento especial">
        </div>

        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Monto ($) <span class="required">*</span></label>
            <input class="form-control" type="number" id="adj-amount" placeholder="0" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Fecha <span class="required">*</span></label>
            <input class="form-control" type="date" id="adj-date" value="${today}">
          </div>
        </div>
      </div>
    `, [
      { id: 'save-adj', label: 'Guardar Ajuste', cls: 'btn-primary', close: false, handler: () => saveAdjustment(clientId) },
      { id: 'cancel-adj', label: 'Cancelar', cls: 'btn-secondary', handler: () => {} }
    ]);
  }

  async function saveAdjustment(clientId) {
    const type   = document.getElementById('adj-type')?.value;
    const desc   = document.getElementById('adj-desc')?.value.trim();
    const amount = parseFloat(document.getElementById('adj-amount')?.value || 0);
    const date   = document.getElementById('adj-date')?.value;

    if (!desc)                 { Utils.showToast('Ingresá una descripción', 'error'); return; }
    if (!amount || amount <= 0){ Utils.showToast('Ingresá un monto válido', 'error'); return; }
    if (!date)                 { Utils.showToast('Ingresá la fecha', 'error'); return; }

    const session = Auth.getSession();
    await Storage.adjustments.add({
      branchId: session.branchId,
      clientId,
      type,
      description: desc,
      amount,
      date
    });

    Utils.closeModal();
    Utils.showToast('Ajuste registrado ✓', 'success');
    await showClientDetail(clientId, 'ledger');
  }

  async function sendAccountSummaryWhatsApp(clientId) {
    const client = await Storage.clients.getById(clientId);
    if (!client || !client.phone) { Utils.showToast('El cliente no tiene teléfono registrado', 'warning'); return; }

    const session = Auth.getSession();
    const [branch, ledger] = await Promise.all([
      Storage.branches.getById(session.branchId),
      getClientLedger(clientId)
    ]);

    const salText = ledger.balance > 0
      ? `*SALDO PENDIENTE: Debe ${Utils.formatCurrency(ledger.balance)}* ⚠️`
      : ledger.balance < 0
      ? `*SALDO A FAVOR: ${Utils.formatCurrency(Math.abs(ledger.balance))}* 🔵`
      : `*SALDO AL DÍA: $0* ✅`;

    const msg = `📊 *Resumen de Cuenta Corriente*\n` +
      `*${branch ? branch.name : 'Cochera'}*\n\n` +
      `Cliente: *${client.firstName} ${client.lastName}*\n` +
      `Vehículo: *${client.plate || '—'}*\n` +
      `Fecha: ${Utils.formatDate(new Date())}\n\n` +
      `-----------------------------------\n` +
      `• Total Facturado: ${Utils.formatCurrency(ledger.totalDebe)}\n` +
      `• Total Abonado: ${Utils.formatCurrency(ledger.totalHaber)}\n` +
      `${salText}\n` +
      `-----------------------------------\n\n` +
      `¡Gracias por tu confianza! 🚗`;

    window.open(Utils.whatsappUrl(client.phone, msg), '_blank');
  }

  async function printAccountStatement(clientId) {
    const client  = await Storage.clients.getById(clientId);
    if (!client) return;

    const session = Auth.getSession();
    const [branch, ledger] = await Promise.all([
      Storage.branches.getById(session.branchId),
      getClientLedger(clientId)
    ]);

    const html = `
      <div class="receipt" style="max-width:600px">
        <div class="receipt-header">
          <h2>${Utils.escapeHtml(branch ? branch.name : 'Cochera')}</h2>
          <p>${Utils.escapeHtml(branch?.address || '')}</p>
          <p>Tel: ${Utils.escapeHtml(branch?.phone || '—')}</p>
        </div>
        <div class="receipt-number" style="font-size:1rem;margin:.5rem 0">ESTADO DE CUENTA CORRIENTE</div>
        <hr class="receipt-divider">
        <table class="receipt-table">
          <tr><td>Cliente:</td><td><strong>${Utils.escapeHtml(client.firstName + ' ' + client.lastName)}</strong></td></tr>
          ${client.dni ? `<tr><td>DNI:</td><td>${Utils.escapeHtml(client.dni)}</td></tr>` : ''}
          <tr><td>Vehículo:</td><td>${Utils.escapeHtml(client.plate || '—')}</td></tr>
          <tr><td>Fecha emisión:</td><td>${Utils.formatDate(new Date())}</td></tr>
        </table>
        <hr class="receipt-divider">

        <table style="width:100%;font-size:.78rem;border-collapse:collapse;margin:.75rem 0">
          <thead>
            <tr style="border-bottom:1px solid #000;text-align:left">
              <th style="padding:.25rem">Fecha</th>
              <th style="padding:.25rem">Concepto</th>
              <th style="padding:.25rem;text-align:right">Debe</th>
              <th style="padding:.25rem;text-align:right">Haber</th>
              <th style="padding:.25rem;text-align:right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            ${ledger.movements.map(m => `
              <tr style="border-bottom:1px solid #eee">
                <td style="padding:.25rem">${Utils.formatDate(m.date)}</td>
                <td style="padding:.25rem">${Utils.escapeHtml(m.concept)}</td>
                <td style="padding:.25rem;text-align:right">${m.debe > 0 ? Utils.formatCurrency(m.debe) : '—'}</td>
                <td style="padding:.25rem;text-align:right">${m.haber > 0 ? Utils.formatCurrency(m.haber) : '—'}</td>
                <td style="padding:.25rem;text-align:right;font-weight:bold">${m.runningBalance > 0 ? Utils.formatCurrency(m.runningBalance) : m.runningBalance < 0 ? Utils.formatCurrency(Math.abs(m.runningBalance)) + ' Cr' : '$0'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <hr class="receipt-divider">
        <div class="receipt-total" style="display:flex;justify-content:space-between;font-size:1.1rem;font-weight:bold;margin-top:.5rem">
          <span>SALDO FINAL:</span>
          <span>${ledger.balance > 0 ? `DEBE ${Utils.formatCurrency(ledger.balance)}` : ledger.balance < 0 ? `A FAVOR ${Utils.formatCurrency(Math.abs(ledger.balance))}` : '$0 (AL DÍA)'}</span>
        </div>
      </div>
    `;

    const printArea = document.getElementById('print-area');
    printArea.innerHTML = html;
    window.print();
    setTimeout(() => { printArea.innerHTML = ''; }, 500);
  }

  async function toggleClientActive(clientId) {
    const client = await Storage.clients.getById(clientId);
    if (!client) return;
    const newState = client.active === false ? true : false;
    Utils.confirm(
      `¿${newState ? 'Activar' : 'Desactivar'} a <strong>${client.firstName} ${client.lastName}</strong>?`,
      async () => {
        await Storage.clients.update(clientId, { active: newState });
        Utils.showToast(`Cliente ${newState ? 'activado' : 'desactivado'}`, 'success');
        await render();
      }
    );
  }

  return {
    render,
    showNewClientModal,
    showEditClientModal,
    showClientDetail,
    sendAccountSummaryWhatsApp,
    printAccountStatement
  };
})();
