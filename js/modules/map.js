/**
 * Chiclana Parking — Map Module
 * Mapa visual de los 3 pisos con estados de colores
 */

const MapModule = (() => {

  let currentFloor = 1;
  let filterOverdue = false;

  // Fijos/móviles/diarios vencidos o por vencer en ≤3 días. Las ocupaciones
  // por hora no tienen un "vencimiento" fijo, así que no entran en este filtro.
  function isOverdueOrExpiringSoon(contract) {
    if (!contract || contract.rentalType === 'hourly') return false;
    const days = Utils.daysDiff(contract.endDate);
    return days !== null && days <= 3;
  }

  async function render() {
    const session  = Auth.getSession();
    const branchId = session.branchId;
    const branch   = await Storage.branches.getById(branchId);
    const floors   = branch ? branch.totalFloors : 3;

    document.getElementById('map-body').innerHTML = `
      <!-- Leyenda -->
      <div class="map-legend">
        <span style="font-weight:700;color:var(--text-secondary);font-size:.72rem;margin-right:.25rem">LEYENDA:</span>
        <div class="legend-item"><div class="legend-dot" style="background:var(--spot-free)"></div> Libre</div>
        <div class="legend-item"><div class="legend-dot" style="background:var(--spot-fixed)"></div> Ocupado Fijo</div>
        <div class="legend-item"><div class="legend-dot" style="background:var(--spot-mobile)"></div> Ocupado Móvil</div>
        <div class="legend-item"><div class="legend-dot" style="background:#0284c7"></div> Ocupado por Hora</div>
        <div class="legend-item"><div class="legend-dot" style="background:var(--spot-expiring)"></div> Por vencer (≤3 días)</div>
        <div class="legend-item"><div class="legend-dot" style="background:var(--spot-disabled)"></div> Fuera de servicio</div>
        <span style="margin-left:auto;font-size:.7rem;color:var(--text-muted)" id="map-stats"></span>
      </div>

      <!-- Floor tabs -->
      <div class="tab-list" id="floor-tabs">
        ${Array.from({length: floors}, (_, i) => i + 1).map(f =>
          `<button class="tab-btn ${f === currentFloor ? 'active' : ''}"
                   data-floor="${f}" id="floor-tab-${f}">
             🅿️ Piso ${f}
           </button>`
        ).join('')}
      </div>

      <!-- Filtro -->
      <div class="tab-list" id="map-filter" style="margin-top:.5rem">
        <button class="tab-btn ${!filterOverdue?'active':''}" data-filter="all">Todos los lugares</button>
        <button class="tab-btn ${filterOverdue?'active':''}" data-filter="overdue">⚠️ Solo vencidos / por vencer</button>
      </div>

      <!-- Floor grid container -->
      <div id="floor-grid-container"></div>
    `;

    // Bind tabs
    document.querySelectorAll('#floor-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentFloor = parseInt(btn.dataset.floor);
        document.querySelectorAll('#floor-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderFloor(branchId, currentFloor);
      });
    });

    // Bind filter
    document.querySelectorAll('#map-filter .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        filterOverdue = btn.dataset.filter === 'overdue';
        document.querySelectorAll('#map-filter .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderFloor(branchId, currentFloor);
      });
    });

    await renderFloor(branchId, currentFloor);
  }

  async function renderFloor(branchId, floor) {
    const [spots, contracts, clients, prices, settings] = await Promise.all([
      Storage.spots.getByFloor(branchId, floor),
      Storage.contracts.getActive(branchId),
      Storage.clients.getAll(branchId),
      Storage.prices.getCurrent(branchId),
      Storage.settings.get(branchId)
    ]);

    const clientsById = new Map(clients.map(c => [c.id, c]));

    // Build lookup map
    const contractBySpot = {};
    contracts.forEach(c => { contractBySpot[c.spotId] = c; });

    // Stats for this floor
    const total    = spots.filter(s => s.status !== 'disabled').length;
    const occupied = spots.filter(s => s.status === 'occupied').length;
    const free     = total - occupied;
    document.getElementById('map-stats').textContent =
      `Piso ${floor}: ${free} libre${free !== 1 ? 's' : ''} / ${occupied} ocupado${occupied !== 1 ? 's' : ''} / ${total} total`;

    const visibleSpots = filterOverdue
      ? spots.filter(s => isOverdueOrExpiringSoon(contractBySpot[s.id]))
      : spots;

    const container = document.getElementById('floor-grid-container');
    container.innerHTML = visibleSpots.length === 0 ? `
      <div class="empty-state" style="padding:2rem"><div class="empty-icon">✅</div><h3>Sin vencimientos en este piso</h3></div>
    ` : `<div class="floor-grid">${
      visibleSpots.sort((a, b) => a.number - b.number).map(spot => {
        const contract = contractBySpot[spot.id];
        const client   = contract ? clientsById.get(contract.clientId) : null;
        return buildSpotCard(spot, contract, client, prices, settings);
      }).join('')
    }</div>`;

    // Bind spot clicks (keyboard-accessible: Enter/Space activate like a click)
    container.querySelectorAll('.spot-card[data-spot-id]').forEach(card => {
      card.addEventListener('click', () => showSpotModal(card.dataset.spotId));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showSpotModal(card.dataset.spotId);
        }
      });
    });
  }

  function buildSpotCard(spot, contract, client, prices, settings) {
    let cardClass = 'free';
    let clientName = '';
    let plate = '';
    let daysInfo = '';
    let typeBadge = `<span class="spot-type-badge spot-type-free">LIBRE</span>`;

    if (spot.status === 'disabled') {
      cardClass = 'disabled';
      typeBadge = `<span class="spot-type-badge" style="background:var(--bg-hover);color:var(--text-muted)">N/D</span>`;
    } else if (spot.status === 'occupied' && contract) {
      if (contract.rentalType === 'hourly') {
        cardClass = 'occupied-mobile';
        typeBadge = `<span class="spot-type-badge" style="background:#0284c7;color:#fff">POR HORA</span>`;

        if (client) {
          clientName = Utils.truncate(`${client.firstName} ${client.lastName}`, 16);
          plate = client.plate || contract.plate || '';
        } else {
          clientName = 'Ingreso por Hora';
          plate = contract.plate || '';
        }

        const entry = new Date(contract.entryTime || contract.startDate || contract.createdAt);
        const fee = Utils.calculateHourlyFee(entry, new Date(), contract.hourlyRate || prices?.hourly || 1500, settings);

        daysInfo = `<span class="spot-days" style="color:#0284c7;font-weight:700">⏱️ ${fee.formattedDuration} · ${Utils.formatCurrency(fee.totalAmount)}</span>`;
      } else {
        const days = Utils.daysDiff(contract.endDate);
        const isExpiring = days !== null && days >= 0 && days <= 3;

        if (isExpiring) {
          cardClass = 'expiring';
        } else if (contract.rentalType === 'fixed') {
          cardClass = 'occupied-fixed';
        } else {
          cardClass = 'occupied-mobile';
        }

        if (client) {
          clientName = Utils.truncate(`${client.firstName} ${client.lastName}`, 16);
          plate = client.plate || '';
        }

        const typeLabel = contract.rentalType === 'fixed' ? 'FIJO' : 'MÓVIL';
        const typeClass = contract.rentalType === 'fixed' ? 'spot-type-fixed' : 'spot-type-mobile';
        typeBadge = `<span class="spot-type-badge ${typeClass}">${typeLabel}</span>`;

        if (days !== null) {
          if (days < 0) {
            daysInfo = `<span style="color:var(--danger);font-size:.65rem">⚠ Vencido hace ${Math.abs(days)}d</span>`;
          } else if (days === 0) {
            daysInfo = `<span style="color:var(--warning);font-size:.65rem">⚠ Vence hoy</span>`;
          } else if (days <= 3) {
            daysInfo = `<span style="color:var(--warning);font-size:.65rem">⚠ Vence en ${days}d</span>`;
          } else {
            daysInfo = `<span class="spot-days">Vence: ${Utils.formatDate(contract.endDate)}</span>`;
          }
        }
      }
    }

    const isDisabled = spot.status === 'disabled';
    const statusText = isDisabled ? 'fuera de servicio' : spot.status === 'free' ? 'libre' : 'ocupado';
    return `
      <div class="spot-card ${cardClass}" data-spot-id="${spot.id}"
           ${isDisabled ? '' : 'role="button" tabindex="0"'}
           aria-label="Lugar ${spot.label}, ${statusText}${clientName ? `, ${clientName}` : ''}"
           title="Click para ver detalles">
        ${typeBadge}
        <div class="spot-number">${spot.label}</div>
        ${clientName ? `<div class="spot-client">${Utils.escapeHtml(clientName)}</div>` : ''}
        ${plate ? `<div class="spot-plate">${Utils.escapeHtml(plate)}</div>` : ''}
        ${daysInfo}
        <div class="spot-status-dot"></div>
      </div>
    `;
  }

  // ─── Spot modal ────────────────────────────────────────────────────────────

  async function showSpotModal(spotId) {
    const spot = await Storage.spots.getById(spotId);
    if (!spot) return;

    const [contract, prices] = await Promise.all([
      Storage.contracts.getBySpot(spotId),
      Storage.prices.getCurrent(spot.branchId)
    ]);
    const client  = contract ? await Storage.clients.getById(contract.clientId) : null;
    const canEdit = Auth.isManagerOrAbove();

    if (spot.status === 'free') {
      showFreeSpotModal(spot, prices, canEdit);
    } else {
      await showOccupiedSpotModal(spot, contract, client, canEdit);
    }
  }

  function showFreeSpotModal(spot, prices, canEdit) {
    const actions = canEdit ? [
      { id: 'hourly-entry', label: '⏱️ Ingreso por hora', cls: 'btn-info', handler: () => showHourlyEntryModal(spot), close: true },
      { id: 'assign', label: '+ Asignar cliente', cls: 'btn-primary', handler: () => showAssignModal(spot), close: true }
    ] : [];

    Utils.showModal(
      `Lugar ${spot.label} — Libre`,
      `<div style="text-align:center;padding:1rem">
        <div style="font-size:3rem;margin-bottom:.75rem">🟢</div>
        <p style="color:var(--success);font-weight:700;font-size:1.1rem">Lugar disponible</p>
        <p style="color:var(--text-secondary);font-size:.82rem;margin-top:.5rem">Piso ${spot.floor} · Lugar Nº ${spot.number}</p>
        ${prices ? `
        <div style="margin-top:1.25rem;display:flex;gap:1rem;justify-content:center;flex-wrap:wrap">
          <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.75rem 1rem;text-align:center">
            <div style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase;font-weight:600">Por Hora</div>
            <div style="font-size:1.1rem;font-weight:700;color:#0284c7;margin-top:.25rem">${Utils.formatCurrency(prices.hourly || 1500)}</div>
          </div>
          <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.75rem 1rem;text-align:center">
            <div style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase;font-weight:600">Por día</div>
            <div style="font-size:1.1rem;font-weight:700;color:var(--success);margin-top:.25rem">${Utils.formatCurrency(prices.daily)}</div>
          </div>
          <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.75rem 1rem;text-align:center">
            <div style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase;font-weight:600">Fijo mensual</div>
            <div style="font-size:1.1rem;font-weight:700;color:var(--danger);margin-top:.25rem">${Utils.formatCurrency(prices.monthlyFixed)}</div>
          </div>
          <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.75rem 1rem;text-align:center">
            <div style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase;font-weight:600">Móvil mensual</div>
            <div style="font-size:1.1rem;font-weight:700;color:var(--warning);margin-top:.25rem">${Utils.formatCurrency(prices.monthlyMobile)}</div>
          </div>
        </div>` : ''}
        ${!canEdit ? '<p style="color:var(--text-muted);font-size:.75rem;margin-top:1rem">Solo el encargado puede asignar clientes o registrar ingresos</p>' : ''}
      </div>`,
      actions
    );
  }

  async function showHourlyEntryModal(spot) {
    const session = Auth.getSession();
    const [prices, clients] = await Promise.all([
      Storage.prices.getCurrent(session.branchId),
      Storage.clients.getActive(session.branchId)
    ]);
    const nowLocal = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16);

    const clientOptions = clients.map(c =>
      `<option value="${c.id}">${Utils.escapeHtml(c.firstName + ' ' + c.lastName)} — ${Utils.escapeHtml(c.plate || 'sin patente')}</option>`
    ).join('');

    Utils.showModal(`Ingreso por Hora — Lugar ${spot.label}`, `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.85rem;font-size:.85rem;display:flex;align-items:center;justify-content:space-between">
          <span>Tarifa por hora: <strong style="color:#0284c7">${Utils.formatCurrency(prices?.hourly || 1500)} / hr</strong></span>
          <span style="font-size:.75rem;color:var(--text-muted)">Piso ${spot.floor} · Lugar Nº ${spot.number}</span>
        </div>

        <div class="form-group">
          <label class="form-label">Patente del vehículo <span class="required">*</span></label>
          <input class="form-control" id="he-plate" placeholder="Ej: AB123CD" style="text-transform:uppercase;font-weight:700;letter-spacing:.05em">
        </div>

        <div class="form-group">
          <label class="form-label">Cliente registrado (opcional)</label>
          <select class="form-control" id="he-client">
            <option value="">— Cliente ocasional / Anónimo —</option>
            ${clientOptions}
          </select>
        </div>

        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Hora de ingreso <span class="required">*</span></label>
            <input class="form-control" type="datetime-local" id="he-entry" value="${nowLocal}">
          </div>
          <div class="form-group">
            <label class="form-label">Tarifa por Hora ($)</label>
            <input class="form-control" type="number" id="he-rate" value="${prices?.hourly || 1500}">
          </div>
        </div>

      </div>
    `, [
      { id: 'confirm-he', label: '🚗 Registrar Ingreso', cls: 'btn-success', close: false, handler: () => confirmHourlyEntry(spot) },
      { id: 'cancel-he', label: 'Cancelar', cls: 'btn-secondary', handler: () => {} }
    ]);
  }

  async function confirmHourlyEntry(spot) {
    const plate    = document.getElementById('he-plate')?.value.trim().toUpperCase();
    const clientId = document.getElementById('he-client')?.value || null;
    const entryVal = document.getElementById('he-entry')?.value;
    const rate     = parseFloat(document.getElementById('he-rate')?.value || 1500);

    if (!plate && !clientId) { Utils.showToast('Ingresá la patente del vehículo', 'error'); return; }
    if (!entryVal) { Utils.showToast('Ingresá la hora de ingreso', 'error'); return; }

    const session = Auth.getSession();
    let finalClientId = clientId;

    if (!finalClientId) {
      const clients = await Storage.clients.getAll(session.branchId);
      const existingClient = clients.find(c => c.plate && c.plate.toUpperCase() === plate);
      if (existingClient) {
        finalClientId = existingClient.id;
      } else {
        const newC = await Storage.clients.add({
          branchId: session.branchId,
          firstName: 'Ocasional',
          lastName: plate || 'Hora',
          plate: plate || '',
          dni: '',
          phone: '',
          notes: 'Creado en ingreso por hora',
          active: true
        });
        finalClientId = newC.id;
      }
    }

    const entryIso = new Date(entryVal).toISOString();

    let contract;
    try {
      contract = await Storage.spots.assign(spot.id, {
        clientId:   finalClientId,
        rentalType: 'hourly',
        period:     'hourly',
        startDate:  entryIso,
        endDate:    entryIso.split('T')[0],
        price:      rate,
        plate
      });
      contract = await Storage.contracts.update(contract.id, { entryTime: entryIso, hourlyRate: rate });
    } catch (err) {
      Utils.showToast(err.message || 'No se pudo registrar el ingreso', 'error');
      return;
    }

    Utils.closeModal();
    Utils.showToast('Ingreso por hora registrado ✓', 'success');
    await render();
    await App.refreshBadges();
  }

  async function showOccupiedSpotModal(spot, contract, client, canEdit) {
    if (!contract) return;
    if (contract.rentalType === 'hourly') {
      const [prices, settings] = await Promise.all([
        Storage.prices.getCurrent(spot.branchId),
        Storage.settings.get(spot.branchId)
      ]);
      showHourlyOccupiedSpotModal(spot, contract, client, canEdit, prices, settings);
      return;
    }
    if (!client) return;

    const branch = await Storage.branches.getById(Auth.getSession().branchId);

    const days   = Utils.daysDiff(contract.endDate);
    const status = Utils.contractStatus(contract);

    const daysText = days === null ? '' :
      days < 0  ? `<span style="color:var(--danger)">⚠ Vencido hace ${Math.abs(days)} día${Math.abs(days)>1?'s':''}</span>` :
      days === 0 ? `<span style="color:var(--warning)">⚠ Vence hoy</span>` :
      `Vence en <strong>${days}</strong> día${days>1?'s':''}`;

    const typeColor = contract.rentalType === 'fixed' ? 'var(--danger)' : 'var(--warning)';

    const actions = [];
    if (canEdit) {
      actions.push({ id: 'pay', label: '💰 Registrar pago', cls: 'btn-success', handler: () => {
        Utils.closeModal();
        PaymentsModule.showNewPaymentModal(contract.clientId);
      }});
      actions.push({ id: 'release', label: '🔓 Liberar lugar', cls: 'btn-danger', handler: () => releaseSpot(spot, contract) });
    }

    Utils.showModal(
      `Lugar ${spot.label} — Ocupado`,
      `<div style="display:flex;flex-direction:column;gap:1rem">

        <div style="display:flex;align-items:center;gap:1rem;padding:1rem;background:var(--bg-tertiary);border-radius:var(--radius)">
          <div class="avatar" style="width:48px;height:48px;font-size:1.1rem">${(client.firstName || 'C').charAt(0)}</div>
          <div>
            <div style="font-weight:700;font-size:1rem">${Utils.escapeHtml(client.firstName)} ${Utils.escapeHtml(client.lastName)}</div>
            <div style="font-size:.78rem;color:var(--text-secondary)">DNI: ${client.dni || '—'} · Tel: ${client.phone || '—'}</div>
          </div>
          ${Utils.statusBadge(status)}
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">
          <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.75rem">
            <div style="font-size:.68rem;color:var(--text-muted);text-transform:uppercase;font-weight:600">Vehículo</div>
            <div style="font-weight:700;margin-top:.25rem">${Utils.escapeHtml(client.plate || '—')}</div>
            <div style="font-size:.78rem;color:var(--text-secondary)">${Utils.escapeHtml([client.vehicleMake, client.vehicleModel, client.vehicleColor].filter(Boolean).join(' ') || '—')}</div>
          </div>
          <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.75rem">
            <div style="font-size:.68rem;color:var(--text-muted);text-transform:uppercase;font-weight:600">Tipo</div>
            <div style="font-weight:700;margin-top:.25rem;color:${typeColor}">${Utils.rentalTypeLabel(contract.rentalType)}</div>
            <div style="font-size:.78rem;color:var(--text-secondary)">${Utils.periodLabel(contract.period)}</div>
          </div>
          <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.75rem">
            <div style="font-size:.68rem;color:var(--text-muted);text-transform:uppercase;font-weight:600">Inicio</div>
            <div style="font-weight:600;margin-top:.25rem">${Utils.formatDate(contract.startDate)}</div>
          </div>
          <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.75rem">
            <div style="font-size:.68rem;color:var(--text-muted);text-transform:uppercase;font-weight:600">Vencimiento</div>
            <div style="font-weight:600;margin-top:.25rem">${Utils.formatDate(contract.endDate)}</div>
            <div style="font-size:.75rem;margin-top:.15rem">${daysText}</div>
          </div>
        </div>

        <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.75rem;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:.82rem;color:var(--text-secondary)">Precio del contrato</span>
          <span style="font-weight:700;font-size:1rem;color:var(--success)">${Utils.formatCurrency(contract.price)}</span>
        </div>

        ${client.phone ? `
        <a href="${Utils.whatsappUrl(client.phone, buildReminderMessage(client, contract, spot, branch))}"
           target="_blank" rel="noopener"
           class="btn btn-success w-full" style="justify-content:center">
          📲 Enviar recordatorio por WhatsApp
        </a>` : ''}
      </div>`,
      actions,
      'modal-lg'
    );
  }

  function showHourlyOccupiedSpotModal(spot, contract, client, canEdit, prices, settings) {
    const entryTime  = new Date(contract.entryTime || contract.startDate || contract.createdAt);
    const hourlyRate = contract.hourlyRate || prices?.hourly || 1500;
    const fee        = Utils.calculateHourlyFee(entryTime, new Date(), hourlyRate, settings);

    const plateText = (client ? client.plate : '') || contract.plate || '—';
    const clientNameText = client ? `${client.firstName} ${client.lastName}` : 'Cliente Ocasional';

    const actions = [];
    if (canEdit) {
      actions.push({ id: 'checkout-hourly', label: '🏁 Registrar Salida y Cobrar', cls: 'btn-success', handler: () => checkoutHourlyModal(spot, contract), close: true });
      actions.push({ id: 'release', label: '🔓 Cancelar / Liberar lugar', cls: 'btn-danger', handler: () => releaseSpot(spot, contract) });
    }

    Utils.showModal(
      `Lugar ${spot.label} — Ocupado por Hora`,
      `<div style="display:flex;flex-direction:column;gap:1rem">

        <div style="display:flex;align-items:center;gap:1rem;padding:1rem;background:var(--bg-tertiary);border-radius:var(--radius)">
          <div class="avatar" style="width:48px;height:48px;font-size:1.1rem;background:#0284c7;color:#fff">⏱️</div>
          <div>
            <div style="font-weight:700;font-size:1.1rem">${Utils.escapeHtml(plateText)}</div>
            <div style="font-size:.82rem;color:var(--text-secondary)">${Utils.escapeHtml(clientNameText)}</div>
          </div>
          <span class="badge" style="background:#0284c7;color:#fff;margin-left:auto">POR HORA</span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">
          <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.75rem">
            <div style="font-size:.68rem;color:var(--text-muted);text-transform:uppercase;font-weight:600">Hora de Ingreso</div>
            <div style="font-weight:700;margin-top:.25rem;color:var(--text-primary)">
              ${entryTime.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
            </div>
            <div style="font-size:.72rem;color:var(--text-muted)">${Utils.formatDate(entryTime)}</div>
          </div>
          <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.75rem">
            <div style="font-size:.68rem;color:var(--text-muted);text-transform:uppercase;font-weight:600">Tiempo Transcurrido</div>
            <div style="font-weight:800;margin-top:.25rem;font-size:1.05rem;color:#0284c7">
              ${fee.formattedDuration}
            </div>
            <div style="font-size:.72rem;color:var(--text-muted)">Mínimo: ${settings.hourlyMinMinutes||60} min</div>
          </div>
          <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.75rem">
            <div style="font-size:.68rem;color:var(--text-muted);text-transform:uppercase;font-weight:600">Tarifa por Hora</div>
            <div style="font-weight:700;margin-top:.25rem">${Utils.formatCurrency(fee.hourlyRate)} / hr</div>
            <div style="font-size:.72rem;color:var(--text-muted)">Fracción: ${settings.hourlyFractionMinutes||15} min</div>
          </div>
          <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.75rem">
            <div style="font-size:.68rem;color:var(--text-muted);text-transform:uppercase;font-weight:600">Monto Estimado</div>
            <div style="font-weight:800;margin-top:.25rem;font-size:1.1rem;color:var(--success)">
              ${Utils.formatCurrency(fee.totalAmount)}
            </div>
            <div style="font-size:.72rem;color:var(--text-muted)">Se calcula al momento del egreso</div>
          </div>
        </div>

      </div>`,
      actions,
      'modal-lg'
    );
  }

  async function checkoutHourlyModal(spot, contract) {
    const session   = Auth.getSession();
    const branchId  = session.branchId;
    const [settings, prices, client] = await Promise.all([
      Storage.settings.get(branchId),
      Storage.prices.getCurrent(branchId),
      Storage.clients.getById(contract.clientId)
    ]);
    const entryTime = new Date(contract.entryTime || contract.startDate || contract.createdAt);
    const nowLocal  = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    const hourlyRate = contract.hourlyRate || prices?.hourly || 1500;
    const plateText = (client ? client.plate : '') || contract.plate || '—';

    const initialFee = Utils.calculateHourlyFee(entryTime, new Date(), hourlyRate, settings);

    Utils.showModal(`Cobro y Salida — Lugar ${spot.label}`, `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:1rem;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-weight:700;font-size:1.1rem">${Utils.escapeHtml(plateText)}</div>
            <div style="font-size:.8rem;color:var(--text-secondary)">Lugar ${spot.label} · Piso ${spot.floor}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase">Tarifa por hora</div>
            <div style="font-weight:700">${Utils.formatCurrency(hourlyRate)} / hr</div>
          </div>
        </div>

        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Hora de ingreso</label>
            <input class="form-control" type="datetime-local" id="co-entry" value="${new Date(entryTime.getTime() - (entryTime.getTimezoneOffset() * 60000)).toISOString().slice(0,16)}" onchange="MapModule._recalcCheckoutFee('${contract.id}', ${hourlyRate})">
          </div>
          <div class="form-group">
            <label class="form-label">Hora de salida</label>
            <input class="form-control" type="datetime-local" id="co-exit" value="${nowLocal}" onchange="MapModule._recalcCheckoutFee('${contract.id}', ${hourlyRate})">
          </div>
        </div>

        <div id="co-summary-card" style="background:var(--info-bg);border:1px solid var(--info);border-radius:var(--radius);padding:1rem">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;font-size:.85rem;margin-bottom:.75rem">
            <div>Tiempo estacionado: <strong id="co-dur">${initialFee.formattedDuration}</strong></div>
            <div>Fracciones cobradas: <strong id="co-frac">${initialFee.fractionsBilled} (${initialFee.fractionMinutes}m)</strong></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:.5rem;border-top:1px solid rgba(0,0,0,0.1)">
            <span style="font-weight:700;font-size:1rem">TOTAL A COBRAR</span>
            <span style="font-weight:800;font-size:1.4rem;color:var(--success)" id="co-total">${Utils.formatCurrency(initialFee.totalAmount)}</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Método de pago <span class="required">*</span></label>
          <select class="form-control" id="co-method">
            <option value="cash">💵 Efectivo</option>
            <option value="transfer">🏦 Transferencia</option>
            <option value="other">Otro</option>
          </select>
        </div>

      </div>
    `, [
      { id: 'confirm-co', label: '💰 Confirmar Cobro y Liberar', cls: 'btn-success', close: false, handler: () => confirmCheckoutHourly(spot, contract, hourlyRate) },
      { id: 'cancel-co', label: 'Cancelar', cls: 'btn-secondary', handler: () => {} }
    ], 'modal-lg');
  }

  async function _recalcCheckoutFee(contractId, hourlyRate) {
    const entryVal = document.getElementById('co-entry')?.value;
    const exitVal  = document.getElementById('co-exit')?.value;
    if (!entryVal || !exitVal) return;

    const session  = Auth.getSession();
    const settings = await Storage.settings.get(session.branchId);
    const fee      = Utils.calculateHourlyFee(new Date(entryVal), new Date(exitVal), hourlyRate, settings);

    const durEl   = document.getElementById('co-dur');
    const fracEl  = document.getElementById('co-frac');
    const totalEl = document.getElementById('co-total');

    if (durEl)   durEl.textContent   = fee.formattedDuration;
    if (fracEl)  fracEl.textContent  = `${fee.fractionsBilled} (${fee.fractionMinutes}m)`;
    if (totalEl) totalEl.textContent = Utils.formatCurrency(fee.totalAmount);
  }

  async function confirmCheckoutHourly(spot, contract, hourlyRate) {
    const entryVal = document.getElementById('co-entry')?.value;
    const exitVal  = document.getElementById('co-exit')?.value;
    const method   = document.getElementById('co-method')?.value || 'cash';

    if (!entryVal || !exitVal) { Utils.showToast('Ingresá las horas de ingreso y salida', 'error'); return; }

    const session   = Auth.getSession();
    const settings  = await Storage.settings.get(session.branchId);
    const entryDate = new Date(entryVal);
    const exitDate  = new Date(exitVal);
    const fee       = Utils.calculateHourlyFee(entryDate, exitDate, hourlyRate, settings);
    const notes     = `Estadía por hora (${fee.formattedDuration}) — ${Utils.formatCurrency(fee.hourlyRate)}/hr`;

    let payment;
    try {
      payment = await Storage.payments.checkoutHourly(contract.id, exitDate.toISOString(), fee.totalAmount, method, notes);
    } catch (err) {
      Utils.showToast(err.message || 'No se pudo registrar el cobro', 'error');
      return;
    }

    Utils.closeModal();
    Utils.showToast(`Salida registrada · Cobrado ${Utils.formatCurrency(fee.totalAmount)} ✓`, 'success');
    await render();
    await App.refreshBadges();

    setTimeout(() => {
      if (PaymentsModule.printReceipt) {
        Utils.showModal('Cobro registrado ✓', `
          <div style="text-align:center;padding:.5rem">
            <div style="font-size:2.5rem;margin-bottom:.5rem">✅</div>
            <p style="font-weight:600;font-size:.95rem">Cobro por hora registrado correctamente</p>
            <p style="color:var(--text-secondary);font-size:.82rem;margin-top:.4rem">Total: <strong>${Utils.formatCurrency(fee.totalAmount)}</strong> (${fee.formattedDuration})</p>
          </div>
        `, [
          { id: 'print-receipt-co', label: '🖨️ Imprimir recibo', cls: 'btn-primary', handler: () => PaymentsModule.printReceipt(payment.id), close: false },
          { id: 'close-receipt-co', label: 'Cerrar', cls: 'btn-secondary', handler: () => {} }
        ], 'modal-sm');
      }
    }, 200);
  }

  function buildReminderMessage(client, contract, spot, branch) {
    return `Hola ${client.firstName}! 👋\n\nTe recordamos que tu lugar *${spot.label}* en ${branch ? branch.name : 'la cochera'} vence el *${Utils.formatDate(contract.endDate)}*.\nMonto: *${Utils.formatCurrency(contract.price)}*\n\nGracias por elegirnos! 🚗`;
  }

  async function showAssignModal(spot) {
    const branchId = spot.branchId;
    const [clients, prices] = await Promise.all([
      Storage.clients.getActive(branchId),
      Storage.prices.getCurrent(branchId)
    ]);
    const today = new Date().toISOString().split('T')[0];

    const clientOptions = clients.map(c =>
      `<option value="${c.id}">${Utils.escapeHtml(c.firstName + ' ' + c.lastName)} — ${Utils.escapeHtml(c.plate || 'sin patente')}</option>`
    ).join('');

    Utils.showModal(`Asignar lugar ${spot.label}`,
      `<div style="display:flex;flex-direction:column;gap:1rem">

        <div class="form-group">
          <label class="form-label">Cliente <span class="required">*</span></label>
          <select class="form-control" id="assign-client">
            <option value="">— Seleccionar cliente —</option>
            ${clientOptions}
          </select>
          <span class="form-hint">¿No aparece el cliente? <a href="#" onclick="Utils.closeModal();ClientsModule.showNewClientModal();return false">+ Crear nuevo</a></span>
        </div>

        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Tipo de alquiler <span class="required">*</span></label>
            <select class="form-control" id="assign-type" onchange="MapModule._updatePrice()">
              <option value="fixed">Fijo (lugar asignado)</option>
              <option value="mobile">Móvil (puede cambiar)</option>
              <option value="hourly">Por hora (fraccionado)</option>
              <option value="daily">Por día</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Período</label>
            <select class="form-control" id="assign-period" onchange="MapModule._updateEndDate()">
              <option value="monthly">Mensual</option>
              <option value="hourly">Por hora</option>
              <option value="daily">Por día</option>
            </select>
          </div>
        </div>

        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Fecha inicio <span class="required">*</span></label>
            <input class="form-control" type="date" id="assign-start" value="${today}" onchange="MapModule._updateEndDate()">
          </div>
          <div class="form-group">
            <label class="form-label">Fecha fin</label>
            <input class="form-control" type="date" id="assign-end">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Precio acordado <span class="required">*</span></label>
          <input class="form-control" type="number" id="assign-price" placeholder="0" min="0">
          <span class="form-hint" id="assign-price-hint">${prices ? `Sugerido: Fijo ${Utils.formatCurrency(prices.monthlyFixed)} / Móvil ${Utils.formatCurrency(prices.monthlyMobile)} / Hora ${Utils.formatCurrency(prices.hourly||1500)}` : ''}</span>
        </div>

      </div>`,
      [
        { id: 'confirm-assign', label: 'Asignar lugar', cls: 'btn-primary', close: false,
          handler: () => confirmAssign(spot) },
        { id: 'cancel-assign', label: 'Cancelar', cls: 'btn-secondary', handler: () => {} }
      ],
      'modal-lg'
    );

    await _updatePrice();
    _updateEndDate();
  }

  async function _updatePrice() {
    const type   = document.getElementById('assign-type')?.value;
    const prices = await Storage.prices.getCurrent(Auth.getSession().branchId);
    if (!prices || !type) return;
    const suggested = type === 'fixed' ? prices.monthlyFixed :
                      type === 'mobile' ? prices.monthlyMobile :
                      type === 'hourly' ? (prices.hourly || 1500) : prices.daily;
    const priceInput = document.getElementById('assign-price');
    if (priceInput && !priceInput._manuallySet) priceInput.value = suggested;

    if (type === 'daily' || type === 'hourly') {
      const periodSel = document.getElementById('assign-period');
      if (periodSel) periodSel.value = type;
    }
  }

  function _updateEndDate() {
    const start  = document.getElementById('assign-start')?.value;
    const period = document.getElementById('assign-period')?.value;
    if (!start) return;
    const endInput = document.getElementById('assign-end');
    if (!endInput) return;

    if (period === 'monthly') {
      endInput.value = Utils.addDays(
        new Date(new Date(start + 'T00:00:00').setMonth(new Date(start + 'T00:00:00').getMonth() + 1) - 1).toISOString().split('T')[0],
        0
      );
    } else {
      endInput.value = Utils.addDays(start, 0); // same day
    }
  }

  async function confirmAssign(spot) {
    const clientId = document.getElementById('assign-client')?.value;
    const type     = document.getElementById('assign-type')?.value;
    const period   = document.getElementById('assign-period')?.value;
    const start    = document.getElementById('assign-start')?.value;
    const end      = document.getElementById('assign-end')?.value;
    const price    = parseFloat(document.getElementById('assign-price')?.value || 0);

    if (!clientId) { Utils.showToast('Seleccioná un cliente', 'error'); return; }
    if (!start)    { Utils.showToast('Ingresá la fecha de inicio', 'error'); return; }
    if (!end)      { Utils.showToast('Ingresá la fecha de fin', 'error'); return; }
    if (!price || price <= 0) { Utils.showToast('Ingresá un precio válido', 'error'); return; }

    try {
      // Reemplaza el viejo "leer estado → chequear → escribir" (race condition
      // real con varios celulares) por la asignación atómica en el servidor.
      await Storage.spots.assign(spot.id, { clientId, rentalType: type, period, startDate: start, endDate: end, price });
    } catch (err) {
      Utils.showToast(err.message || 'No se pudo asignar el lugar', 'error');
      return;
    }

    Utils.closeModal();
    Utils.showToast('Lugar asignado correctamente ✓', 'success');
    await render();
    await App.refreshBadges();
  }

  function releaseSpot(spot, contract) {
    Utils.confirm(
      `¿Liberar el lugar <strong>${spot.label}</strong>? Se cerrará el contrato activo.`,
      async () => {
        try {
          await Storage.spots.release(spot.id);
        } catch (err) {
          Utils.showToast(err.message || 'No se pudo liberar el lugar', 'error');
          return;
        }
        Utils.closeModal();
        Utils.showToast('Lugar liberado correctamente', 'success');
        await render();
        await App.refreshBadges();
      }
    );
  }

  return { render, showSpotModal, showHourlyEntryModal, _updatePrice, _updateEndDate, _recalcCheckoutFee };
})();
