/**
 * Chiclana Parking — Dashboard Module
 */

const Dashboard = (() => {

  async function render() {
    const session  = Auth.getSession();
    const branchId = session.branchId;

    const [branch, spots, contractsAll, payments, clientsAll, prices, settings] = await Promise.all([
      Storage.branches.getById(branchId),
      Storage.spots.getAll(branchId),
      Storage.contracts.getAll(branchId),
      Storage.payments.getAll(branchId),
      Storage.clients.getAll(branchId),
      Storage.prices.getCurrent(branchId),
      Storage.settings.get(branchId)
    ]);

    // Maps por id, para resolver referencias sin volver a golpear Storage.
    const clientsMap   = new Map(clientsAll.map(c => [c.id, c]));
    const contractsMap = new Map(contractsAll.map(c => [c.id, c]));
    const spotsMap     = new Map(spots.map(s => [s.id, s]));

    // Subconjuntos "activos" — equivalentes a los antiguos getActive().
    const contracts = contractsAll.filter(c => c.active);
    const clients    = clientsAll.filter(c => c.active);

    // ─── Stats ────────────────────────────────────────────────────────────────
    const totalSpots   = spots.filter(s => s.status !== 'disabled').length;
    const occupied     = spots.filter(s => s.status === 'occupied').length;
    const free         = totalSpots - occupied;
    const occupancyPct = totalSpots > 0 ? Math.round((occupied / totalSpots) * 100) : 0;

    // Income this month
    const now        = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthPayments = payments.filter(p => p.createdAt >= monthStart);
    const monthIncome   = monthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Alerts count
    let expiredCount    = 0;
    let expiringSoon    = 0;
    contracts.forEach(c => {
      const d = Utils.daysDiff(c.endDate);
      if (d !== null) {
        if (d < 0)      expiredCount++;
        else if (d <= 7) expiringSoon++;
      }
    });

    // Price alert
    const lastUpdate  = settings.lastPriceUpdate;
    const daysSincePrice = lastUpdate ? Math.floor((Date.now() - new Date(lastUpdate)) / 86400000) : 999;
    const priceAlert  = daysSincePrice >= 90;

    // Hourly contracts count
    const hourlyContracts   = contracts.filter(c => c.rentalType === 'hourly');
    const hourlyActiveCount = hourlyContracts.length;

    // Greeting
    const hour   = now.getHours();
    const greet  = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    document.getElementById('dashboard-greeting').textContent =
      `${greet}, ${session.name.split(' ')[0]} — ${Utils.formatDateLong(now)}`;

    // ─── Render ──────────────────────────────────────────────────────────────
    document.getElementById('dashboard-body').innerHTML = `

      <!-- Stats cards -->
      <div class="stats-grid">

        <div class="stat-card">
          <div class="stat-icon" style="background:var(--accent-bg);color:var(--accent)">🅿️</div>
          <div class="stat-value">${totalSpots}</div>
          <div class="stat-label">Total de lugares</div>
          <div class="stat-change">${branch ? `${branch.totalFloors} pisos × ${branch.spotsPerFloor} c/u` : ''}</div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background:var(--success-bg);color:var(--success)">🟢</div>
          <div class="stat-value" style="color:var(--success)">${free}</div>
          <div class="stat-label">Lugares libres</div>
          <div class="stat-change up">${100 - occupancyPct}% disponibilidad</div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background:var(--danger-bg);color:var(--danger)">🔴</div>
          <div class="stat-value" style="color:var(--danger)">${occupied}</div>
          <div class="stat-label">Lugares ocupados</div>
          <div class="stat-change down">${occupancyPct}% ocupación</div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(2, 132, 199, 0.15);color:#0284c7">⏱️</div>
          <div class="stat-value" style="color:#0284c7">${hourlyActiveCount}</div>
          <div class="stat-label">Por Hora activos</div>
          <div class="stat-change" style="color:#0284c7">Tarifa ${Utils.formatCurrency(prices?.hourly||1500)}/hr</div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background:var(--success-bg);color:var(--success)">💰</div>
          <div class="stat-value" style="font-size:1.15rem">${Utils.formatCurrency(monthIncome)}</div>
          <div class="stat-label">Ingresos del mes</div>
          <div class="stat-change">${monthPayments.length} pago${monthPayments.length !== 1 ? 's' : ''} registrado${monthPayments.length !== 1 ? 's' : ''}</div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background:var(--purple-bg);color:var(--purple)">👥</div>
          <div class="stat-value">${clients.length}</div>
          <div class="stat-label">Clientes activos</div>
          <div class="stat-change">${contracts.length} contrato${contracts.length !== 1 ? 's' : ''} vigente${contracts.length !== 1 ? 's' : ''}</div>
        </div>

      </div>

      <!-- Alerts summary -->
      ${(expiredCount > 0 || expiringSoon > 0 || priceAlert) ? `
      <div class="card mb-2">
        <div class="card-header">
          <span class="card-title">🔔 Alertas recientes</span>
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('alerts')">Ver todas →</button>
        </div>
        <div class="card-body" style="padding:0">
          <div class="alert-list" style="padding:.75rem;">
            ${expiredCount > 0 ? `
            <div class="alert-item alert-danger">
              <span class="alert-icon">❌</span>
              <div class="alert-body">
                <div class="alert-title">${expiredCount} contrato${expiredCount !== 1 ? 's' : ''} vencido${expiredCount !== 1 ? 's' : ''}</div>
                <div class="alert-desc">Clientes con pago pendiente. Revisá las alertas.</div>
              </div>
              <div class="alert-actions">
                <button class="btn btn-danger btn-sm" onclick="App.navigate('alerts')">Ver</button>
              </div>
            </div>` : ''}
            ${expiringSoon > 0 ? `
            <div class="alert-item alert-warning">
              <span class="alert-icon">⚠️</span>
              <div class="alert-body">
                <div class="alert-title">${expiringSoon} contrato${expiringSoon !== 1 ? 's' : ''} por vencer esta semana</div>
                <div class="alert-desc">Recordá avisar a los clientes para renovar.</div>
              </div>
              <div class="alert-actions">
                <button class="btn btn-warning btn-sm" onclick="App.navigate('alerts')">Ver</button>
              </div>
            </div>` : ''}
            ${priceAlert ? `
            <div class="alert-item alert-info">
              <span class="alert-icon">💲</span>
              <div class="alert-body">
                <div class="alert-title">Revisión de precios disponible</div>
                <div class="alert-desc">Hace ${daysSincePrice} días del último ajuste. ¿Es momento de actualizar?</div>
              </div>
              <div class="alert-actions">
                <button class="btn btn-secondary btn-sm" onclick="App.navigate('prices')">Precios</button>
              </div>
            </div>` : ''}
          </div>
        </div>
      </div>` : `
      <div class="card mb-2">
        <div class="card-body" style="text-align:center;padding:1.5rem">
          <span style="font-size:2rem">✅</span>
          <p style="color:var(--text-secondary);margin-top:.5rem;font-size:.85rem">Todo al día — Sin alertas pendientes</p>
        </div>
      </div>`}

      <!-- Recent payments -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">💰 Últimos pagos registrados</span>
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('payments')">Ver todos →</button>
        </div>
        <div class="table-wrap">
          ${recentPaymentsTable(payments, clientsMap, contractsMap, spotsMap)}
        </div>
      </div>
    `;
  }

  // 100% síncrona: recibe los Maps ya cargados por render() y no llama a Storage.
  function recentPaymentsTable(payments, clientsMap, contractsMap, spotsMap) {
    const recent = [...payments]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 8);

    if (recent.length === 0) {
      return '<div class="empty-state" style="padding:2rem"><div class="empty-icon">💰</div><h3>Sin pagos registrados</h3><p>Los pagos aparecerán aquí cuando los registres.</p></div>';
    }

    return `<table>
      <thead><tr>
        <th>Recibo</th><th>Cliente</th><th>Lugar</th><th>Periodo</th><th>Monto</th><th>Método</th><th>Fecha</th>
      </tr></thead>
      <tbody>
        ${recent.map(p => {
          const client   = clientsMap.get(p.clientId) || null;
          const contract = contractsMap.get(p.contractId) || null;
          const spot     = contract ? (spotsMap.get(contract.spotId) || null) : null;
          return `<tr>
            <td><span class="badge badge-muted">${Utils.formatReceiptNumber(p.receiptNumber)}</span></td>
            <td class="fw-600">${client ? Utils.escapeHtml(`${client.firstName} ${client.lastName}`) : '—'}</td>
            <td>${spot ? `<span class="badge badge-accent">${spot.label}</span>` : '—'}</td>
            <td style="font-size:.78rem;color:var(--text-secondary)">${Utils.formatDate(p.periodStart)} → ${Utils.formatDate(p.periodEnd)}</td>
            <td class="fw-600 text-success">${Utils.formatCurrency(p.amount)}</td>
            <td>${Utils.methodLabel(p.method)}</td>
            <td style="color:var(--text-muted)">${Utils.formatDate(p.createdAt)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  }

  return { render };
})();
