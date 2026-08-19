/**
 * Chiclana Parking — Alerts Module
 */

const AlertsModule = (() => {

  async function render() {
    const session  = Auth.getSession();
    const branchId = session.branchId;

    // Una sola carga en paralelo: contratos activos, settings, y TODOS los
    // clientes/plazas del branch (para resolver nombre de cliente y lugar
    // de cada contrato con lookups síncronos contra Maps, sin await en el forEach).
    const [contracts, settings, clients, spots] = await Promise.all([
      Storage.contracts.getActive(branchId),
      Storage.settings.get(branchId),
      Storage.clients.getAll(branchId),
      Storage.spots.getAll(branchId)
    ]);

    const clientsById = new Map(clients.map(c => [c.id, c]));
    const spotsById    = new Map(spots.map(s => [s.id, s]));

    // Build alert items
    const alerts = [];

    contracts.forEach(c => {
      const client   = clientsById.get(c.clientId) || null;
      const spot     = spotsById.get(c.spotId) || null;
      const days     = Utils.daysDiff(c.endDate);
      if (days === null) return;

      const name = client ? `${client.firstName} ${client.lastName}` : 'Cliente desconocido';
      const spotLabel = spot ? spot.label : '—';

      if (days < 0) {
        alerts.push({
          priority: 1,
          type: 'danger',
          icon: '❌',
          title: `Contrato vencido — ${name}`,
          desc: `Lugar ${spotLabel} · Vencido hace ${Math.abs(days)} día${Math.abs(days)>1?'s':''}. Monto: ${Utils.formatCurrency(c.price)}`,
          clientId: c.clientId,
          contractId: c.id,
          phone: client?.phone,
          spotLabel,
          contract: c,
          client
        });
      } else if (days === 0) {
        alerts.push({
          priority: 2,
          type: 'danger',
          icon: '⚠️',
          title: `Vence HOY — ${name}`,
          desc: `Lugar ${spotLabel} · Hoy es el último día. Monto: ${Utils.formatCurrency(c.price)}`,
          clientId: c.clientId,
          contractId: c.id,
          phone: client?.phone,
          spotLabel,
          contract: c,
          client
        });
      } else if (days <= 3) {
        alerts.push({
          priority: 3,
          type: 'warning',
          icon: '🟡',
          title: `Vence en ${days} día${days>1?'s':''} — ${name}`,
          desc: `Lugar ${spotLabel} · Vence el ${Utils.formatDate(c.endDate)}. Monto: ${Utils.formatCurrency(c.price)}`,
          clientId: c.clientId,
          contractId: c.id,
          phone: client?.phone,
          spotLabel,
          contract: c,
          client
        });
      } else if (days <= 7) {
        alerts.push({
          priority: 4,
          type: 'warning',
          icon: '🔶',
          title: `Vence esta semana — ${name}`,
          desc: `Lugar ${spotLabel} · Vence el ${Utils.formatDate(c.endDate)} (${days} días). Monto: ${Utils.formatCurrency(c.price)}`,
          clientId: c.clientId,
          contractId: c.id,
          phone: client?.phone,
          spotLabel,
          contract: c,
          client
        });
      }
    });

    // Price alert
    const lastUpdate = settings.lastPriceUpdate;
    const daysSince  = lastUpdate ? Math.floor((Date.now() - new Date(lastUpdate)) / 86400000) : 999;
    const priceDue   = daysSince >= 90;
    if (priceDue) {
      alerts.push({
        priority: 5,
        type: 'info',
        icon: '💲',
        title: 'Revisión de precios recomendada',
        desc: `Último ajuste: ${lastUpdate ? Utils.formatDate(lastUpdate) : 'No registrado'} (${daysSince} días atrás). Considerá actualizar las tarifas por inflación.`,
        isPriceAlert: true
      });
    }

    // Sort by priority
    alerts.sort((a, b) => a.priority - b.priority);

    const body = document.getElementById('alerts-body');

    if (alerts.length === 0) {
      body.innerHTML = `
        <div class="empty-state" style="padding:4rem 1rem">
          <div class="empty-icon">✅</div>
          <h3>¡Todo al día!</h3>
          <p>No hay alertas pendientes en este momento.</p>
        </div>
      `;
      return;
    }

    // Group by type
    const expiredAlerts  = alerts.filter(a => a.priority <= 2);
    const warningAlerts  = alerts.filter(a => a.priority === 3 || a.priority === 4);
    const infoAlerts     = alerts.filter(a => a.priority === 5);

    body.innerHTML = `
      ${expiredAlerts.length > 0 ? renderGroup('❌ Vencidos y críticos', expiredAlerts, 'danger') : ''}
      ${warningAlerts.length > 0 ? renderGroup('⚠️ Por vencer', warningAlerts, 'warning') : ''}
      ${infoAlerts.length   > 0 ? renderGroup('ℹ️ Información', infoAlerts, 'info') : ''}
    `;

    // Bind buttons
    body.querySelectorAll('[data-alert-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.alertAction;
        const idx    = parseInt(btn.dataset.alertIdx);
        const alert  = alerts[idx];
        if (!alert) return;

        if (action === 'pay')       { PaymentsModule.showNewPaymentModal(alert.clientId); }
        if (action === 'whatsapp')  { await sendWhatsApp(alert); }
        if (action === 'prices')    { App.navigate('prices'); }
        if (action === 'client')    { ClientsModule.showClientDetail(alert.clientId); }
      });
    });
  }

  function renderGroup(title, alertItems, type) {
    return `
      <div style="margin-bottom:1.5rem">
        <h3 style="font-size:.82rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.6rem">${title}</h3>
        <div class="alert-list">
          ${alertItems.map((a, globalIdx) => {
            const idx = globalIdx; // approximate, good enough
            const realIdx = a.__idx !== undefined ? a.__idx : idx;
            return `
            <div class="alert-item alert-${a.type}">
              <span class="alert-icon">${a.icon}</span>
              <div class="alert-body">
                <div class="alert-title">${Utils.escapeHtml(a.title)}</div>
                <div class="alert-desc">${Utils.escapeHtml(a.desc)}</div>
              </div>
              <div class="alert-actions">
                ${a.isPriceAlert ? `
                  <button class="btn btn-secondary btn-sm" data-alert-action="prices" data-alert-idx="${realIdx}">Ver precios</button>
                ` : `
                  ${Auth.isManagerOrAbove() ? `<button class="btn btn-success btn-sm" data-alert-action="pay" data-alert-idx="${realIdx}">💰 Cobrar</button>` : ''}
                  ${a.phone ? `<button class="btn btn-ghost btn-sm" data-alert-action="whatsapp" data-alert-idx="${realIdx}" title="WhatsApp">📲</button>` : ''}
                  <button class="btn btn-ghost btn-sm" data-alert-action="client" data-alert-idx="${realIdx}">👁</button>
                `}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  async function sendWhatsApp(alert) {
    if (!alert.phone || !alert.client || !alert.contract) return;
    const session = Auth.getSession();
    const branch  = await Storage.branches.getById(session.branchId);
    const days    = Utils.daysDiff(alert.contract.endDate);
    const msg = days < 0
      ? `Hola ${alert.client.firstName}! Te avisamos que tu alquiler del lugar *${alert.spotLabel}* en *${branch?.name||'la cochera'}* está *vencido* desde el ${Utils.formatDate(alert.contract.endDate)}.\nPor favor acercate a regularizar el pago: *${Utils.formatCurrency(alert.contract.price)}*. Gracias! 🚗`
      : `Hola ${alert.client.firstName}! 👋 Te recordamos que tu lugar *${alert.spotLabel}* en *${branch?.name||'la cochera'}* vence el *${Utils.formatDate(alert.contract.endDate)}* (en ${days} día${days>1?'s':''}).\nMonto: *${Utils.formatCurrency(alert.contract.price)}*\nGracias por elegirnos! 🚗`;
    window.open(Utils.whatsappUrl(alert.phone, msg), '_blank');
  }

  return { render };
})();
