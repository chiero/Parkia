/**
 * Chiclana Parking — Payments Module
 */

const PaymentsModule = (() => {

  let filterMonth = '';
  let filterClient = '';

  function render() {
    const session   = Auth.getSession();
    const branchId  = session.branchId;
    const payments  = Storage.payments.getAll(branchId);
    const clients   = Storage.clients.getAll(branchId);

    // Filter
    let filtered = [...payments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (filterMonth) {
      filtered = filtered.filter(p => (p.createdAt || '').startsWith(filterMonth));
    }
    if (filterClient) {
      filtered = filtered.filter(p => p.clientId === filterClient);
    }

    const totalFiltered = filtered.reduce((s, p) => s + (p.amount || 0), 0);

    // Month options
    const months = [...new Set(payments.map(p => p.createdAt?.slice(0, 7)).filter(Boolean))].sort().reverse();

    const body = document.getElementById('payments-body');
    body.innerHTML = `
      <!-- Filters -->
      <div class="search-bar mb-2" style="margin-bottom:1rem;flex-wrap:wrap">
        <select class="form-control" id="pay-filter-month" style="width:auto">
          <option value="">Todos los meses</option>
          ${months.map(m => {
            const d = new Date(m + '-01');
            const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
            return `<option value="${m}" ${filterMonth===m?'selected':''}>${Utils.capitalize(label)}</option>`;
          }).join('')}
        </select>
        <select class="form-control" id="pay-filter-client" style="width:200px">
          <option value="">Todos los clientes</option>
          ${clients.map(c => `<option value="${c.id}" ${filterClient===c.id?'selected':''}>${Utils.escapeHtml(c.firstName+' '+c.lastName)}</option>`).join('')}
        </select>
        <span style="margin-left:auto;font-size:.78rem;color:var(--text-secondary)">
          ${filtered.length} pago${filtered.length!==1?'s':''} · 
          Total: <strong style="color:var(--success)">${Utils.formatCurrency(totalFiltered)}</strong>
        </span>
      </div>

      <!-- Table -->
      <div class="card">
        <div class="table-wrap">
          ${filtered.length === 0 ? `
            <div class="empty-state">
              <div class="empty-icon">💰</div>
              <h3>Sin pagos registrados</h3>
              <p>Usá el botón "+ Registrar pago" para registrar el primer pago.</p>
            </div>
          ` : `
          <table>
            <thead><tr>
              <th>Recibo</th><th>Cliente</th><th>Lugar</th><th>Periodo</th>
              <th>Monto</th><th>Método</th><th>Registrado</th><th>Acciones</th>
            </tr></thead>
            <tbody>
              ${filtered.map(p => renderPaymentRow(p)).join('')}
            </tbody>
          </table>`}
        </div>
      </div>
    `;

    document.getElementById('pay-filter-month').addEventListener('change', e => {
      filterMonth = e.target.value; render();
    });
    document.getElementById('pay-filter-client').addEventListener('change', e => {
      filterClient = e.target.value; render();
    });

    body.querySelectorAll('[data-pay-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const { payAction, payId } = btn.dataset;
        if (payAction === 'print')    printReceipt(payId);
        if (payAction === 'whatsapp') sendReceiptWhatsApp(payId);
      });
    });
  }

  function renderPaymentRow(p) {
    const client   = Storage.clients.getById(p.clientId);
    const contract = Storage.contracts.getById(p.contractId);
    const spot     = contract ? Storage.spots.getById(contract.spotId) : null;

    return `<tr>
      <td><span class="badge badge-muted">${Utils.formatReceiptNumber(p.receiptNumber)}</span></td>
      <td class="fw-600">${client ? Utils.escapeHtml(`${client.firstName} ${client.lastName}`) : '—'}</td>
      <td>${spot ? `<span class="badge badge-accent">${spot.label}</span>` : '—'}</td>
      <td style="font-size:.78rem;color:var(--text-secondary)">
        ${Utils.formatDate(p.periodStart)} → ${Utils.formatDate(p.periodEnd)}
      </td>
      <td class="fw-600 text-success">${Utils.formatCurrency(p.amount)}</td>
      <td>${Utils.methodLabel(p.method)}</td>
      <td style="color:var(--text-muted)">${Utils.formatDate(p.createdAt)}</td>
      <td>
        <div style="display:flex;gap:.25rem">
          <button class="btn btn-ghost btn-icon btn-sm" data-pay-action="print" data-pay-id="${p.id}" title="Imprimir recibo">🖨️</button>
          ${client && client.phone ? `<button class="btn btn-ghost btn-icon btn-sm" data-pay-action="whatsapp" data-pay-id="${p.id}" title="Enviar por WhatsApp">📲</button>` : ''}
        </div>
      </td>
    </tr>`;
  }

  // ─── New payment modal ──────────────────────────────────────────────────────

  function showNewPaymentModal(preselectedClientId = null) {
    const session   = Auth.getSession();
    const branchId  = session.branchId;
    const clients   = Storage.clients.getActive(branchId);
    const contracts = Storage.contracts.getActive(branchId);
    const today     = new Date().toISOString().split('T')[0];

    const clientOptions = clients.map(c => {
      const contract = contracts.find(ct => ct.clientId === c.id);
      const spot     = contract ? Storage.spots.getById(contract.spotId) : null;
      return `<option value="${c.id}" ${preselectedClientId===c.id?'selected':''}>
        ${Utils.escapeHtml(c.firstName+' '+c.lastName)}${spot ? ` — Lugar ${spot.label}` : ''}
      </option>`;
    }).join('');

    Utils.showModal('Registrar pago', `
      <div style="display:flex;flex-direction:column;gap:1rem">

        <div class="form-group">
          <label class="form-label">Cliente <span class="required">*</span></label>
          <select class="form-control" id="pf-client" onchange="PaymentsModule._onClientChange()">
            <option value="">— Seleccionar cliente —</option>
            ${clientOptions}
          </select>
        </div>

        <!-- Contract info (populated on client select) -->
        <div id="pf-contract-info" style="display:none;background:var(--bg-tertiary);border-radius:var(--radius);padding:.85rem;font-size:.82rem"></div>

        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Período desde <span class="required">*</span></label>
            <input class="form-control" type="date" id="pf-from" value="${today}">
          </div>
          <div class="form-group">
            <label class="form-label">Período hasta <span class="required">*</span></label>
            <input class="form-control" type="date" id="pf-to">
          </div>
        </div>

        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Monto <span class="required">*</span></label>
            <input class="form-control" type="number" id="pf-amount" placeholder="0" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Método de pago</label>
            <select class="form-control" id="pf-method">
              <option value="cash">💵 Efectivo</option>
              <option value="transfer">🏦 Transferencia</option>
              <option value="other">Otro</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Notas (opcional)</label>
          <input class="form-control" type="text" id="pf-notes" placeholder="Ej: Pago adelantado, descuento, etc.">
        </div>

      </div>
    `, [
      { id: 'save-pay', label: '💰 Registrar pago', cls: 'btn-success', close: false, handler: savePayment },
      { id: 'cancel-pay', label: 'Cancelar', cls: 'btn-secondary', handler: () => {} }
    ], 'modal-lg');

    // If client preselected, trigger change
    if (preselectedClientId) {
      setTimeout(() => _onClientChange(), 100);
    }
  }

  function _onClientChange() {
    const session  = Auth.getSession();
    const branchId = session.branchId;
    const clientId = document.getElementById('pf-client')?.value;
    const infoEl   = document.getElementById('pf-contract-info');
    const amountEl = document.getElementById('pf-amount');
    const toEl     = document.getElementById('pf-to');
    const fromEl   = document.getElementById('pf-from');

    if (!clientId || !infoEl) return;

    const contract = Storage.contracts.getActive(branchId).find(c => c.clientId === clientId);

    if (contract) {
      const spot = Storage.spots.getById(contract.spotId);
      const days = Utils.daysDiff(contract.endDate);

      infoEl.style.display = '';
      infoEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap">
          <div>
            <div style="font-weight:700">${spot ? spot.label : '—'} · ${Utils.rentalTypeLabel(contract.rentalType)}</div>
            <div style="color:var(--text-secondary);margin-top:.2rem">
              Contrato activo · Vence: ${Utils.formatDate(contract.endDate)}
              ${days < 0 ? ` <span style="color:var(--danger)">⚠ Vencido hace ${Math.abs(days)}d</span>` :
                days <= 3 ? ` <span style="color:var(--warning)">⚠ Vence en ${days}d</span>` : ''}
            </div>
          </div>
          <span style="font-size:1.1rem;font-weight:800;color:var(--success)">${Utils.formatCurrency(contract.price)}</span>
        </div>
      `;

      // Auto-fill amount
      if (amountEl && !amountEl.value) amountEl.value = contract.price;

      // Auto-fill period: from day after contract end, or today if expired
      if (fromEl && toEl) {
        const startDate = days < 0
          ? fromEl.value
          : contract.endDate;
        // Period = 1 month from start
        const endDate = Utils.addDays(
          new Date(new Date(startDate + 'T00:00:00').setMonth(new Date(startDate + 'T00:00:00').getMonth() + 1) - 1).toISOString().split('T')[0],
          0
        );
        if (contract.period === 'monthly') toEl.value = endDate;
      }
    } else {
      infoEl.style.display = 'none';
    }
  }

  function savePayment() {
    const session   = Auth.getSession();
    const branchId  = session.branchId;
    const clientId  = document.getElementById('pf-client')?.value;
    const from      = document.getElementById('pf-from')?.value;
    const to        = document.getElementById('pf-to')?.value;
    const amount    = parseFloat(document.getElementById('pf-amount')?.value || 0);
    const method    = document.getElementById('pf-method')?.value || 'cash';
    const notes     = document.getElementById('pf-notes')?.value.trim() || '';

    if (!clientId) { Utils.showToast('Seleccioná un cliente', 'error'); return; }
    if (!from)     { Utils.showToast('Indicá la fecha de inicio del período', 'error'); return; }
    if (!to)       { Utils.showToast('Indicá la fecha de fin del período', 'error'); return; }
    if (!amount || amount <= 0) { Utils.showToast('Ingresá un monto válido', 'error'); return; }

    const contract = Storage.contracts.getActive(branchId).find(c => c.clientId === clientId);
    const receiptNum = Storage.payments.getNextReceiptNumber(branchId);

    const payment = Storage.payments.add({
      branchId,
      clientId,
      contractId:   contract?.id || null,
      amount,
      date:         from,
      method,
      receiptNumber: receiptNum,
      periodStart:  from,
      periodEnd:    to,
      notes
    });

    // Auto-extend contract end date
    if (contract && contract.period === 'monthly') {
      Storage.contracts.update(contract.id, { endDate: to });
    }

    Utils.closeModal();
    Utils.showToast('Pago registrado ✓', 'success');
    render();
    App.refreshBadges();

    // Offer to print receipt
    setTimeout(() => {
      Utils.showModal('Pago registrado ✓', `
        <div style="text-align:center;padding:.5rem">
          <div style="font-size:2.5rem;margin-bottom:.5rem">✅</div>
          <p style="font-weight:600;font-size:.95rem">Pago registrado correctamente</p>
          <p style="color:var(--text-secondary);font-size:.82rem;margin-top:.4rem">¿Querés imprimir o enviar el recibo?</p>
        </div>
      `, [
        { id: 'print-receipt', label: '🖨️ Imprimir recibo', cls: 'btn-primary', handler: () => printReceipt(payment.id), close: false },
        { id: 'close-receipt', label: 'No, cerrar', cls: 'btn-secondary', handler: () => {} }
      ], 'modal-sm');
    }, 200);
  }

  // ─── Receipt ────────────────────────────────────────────────────────────────

  function buildReceiptHTML(paymentId) {
    const payment  = Storage.payments.getAll(Auth.getSession().branchId).find(p => p.id === paymentId);
    if (!payment) return null;

    const client   = Storage.clients.getById(payment.clientId);
    const contract = payment.contractId ? Storage.contracts.getById(payment.contractId) : null;
    const spot     = contract ? Storage.spots.getById(contract.spotId) : null;
    const branch   = Storage.branches.getById(payment.branchId);
    const settings = Storage.settings.get(payment.branchId);

    if (!client) return null;

    return `
      <div class="receipt">
        <div class="receipt-header">
          <h2>${Utils.escapeHtml(branch ? branch.name : 'Cochera')}</h2>
          <p>${Utils.escapeHtml(branch?.address || '')}</p>
          <p>Tel: ${Utils.escapeHtml(branch?.phone || '—')}</p>
        </div>
        <div class="receipt-number">RECIBO Nº ${Utils.formatReceiptNumber(payment.receiptNumber)}</div>
        <hr class="receipt-divider">
        <table class="receipt-table">
          <tr><td>Fecha emisión:</td><td>${Utils.formatDate(new Date())}</td></tr>
          <tr><td>Cliente:</td><td>${Utils.escapeHtml(client.firstName + ' ' + client.lastName)}</td></tr>
          ${client.dni ? `<tr><td>DNI:</td><td>${Utils.escapeHtml(client.dni)}</td></tr>` : ''}
          <tr><td>Vehículo:</td><td>${Utils.escapeHtml(client.plate || contract?.plate || '—')}</td></tr>
          ${spot ? `<tr><td>Lugar:</td><td>${Utils.escapeHtml(spot.label)}</td></tr>` : ''}
          ${contract ? `<tr><td>Tipo alquiler:</td><td>${Utils.rentalTypeLabel(contract.rentalType)}</td></tr>` : ''}
          ${contract?.rentalType === 'hourly' ? `
            ${contract.entryTime ? `<tr><td>Ingreso:</td><td>${new Date(contract.entryTime).toLocaleTimeString('es-AR', {hour:'2-digit',minute:'2-digit'})} hs (${Utils.formatDate(contract.entryTime)})</td></tr>` : ''}
            ${contract.exitTime ? `<tr><td>Egreso:</td><td>${new Date(contract.exitTime).toLocaleTimeString('es-AR', {hour:'2-digit',minute:'2-digit'})} hs (${Utils.formatDate(contract.exitTime)})</td></tr>` : ''}
          ` : `
            <tr><td>Período:</td><td>${Utils.formatDate(payment.periodStart)} al ${Utils.formatDate(payment.periodEnd)}</td></tr>
          `}
          <tr><td>Método pago:</td><td>${Utils.methodLabel(payment.method)}</td></tr>
        </table>
        <hr class="receipt-divider">
        <div class="receipt-total">
          <span>TOTAL ABONADO</span>
          <span>${Utils.formatCurrency(payment.amount)}</span>
        </div>
        ${payment.notes ? `<p style="font-size:.72rem;color:#666;margin-top:.75rem">Nota: ${Utils.escapeHtml(payment.notes)}</p>` : ''}
        <div class="receipt-footer">${Utils.escapeHtml(settings.receiptFooter || '')}</div>
        <div class="receipt-stamp">Documento no válido como factura</div>
      </div>
    `;
  }

  function printReceipt(paymentId) {
    const html = buildReceiptHTML(paymentId);
    if (!html) { Utils.showToast('No se encontró el pago', 'error'); return; }
    const printArea = document.getElementById('print-area');
    printArea.innerHTML = html;
    window.print();
    setTimeout(() => { printArea.innerHTML = ''; }, 500);
  }

  function sendReceiptWhatsApp(paymentId) {
    const payment  = Storage.payments.getAll(Auth.getSession().branchId).find(p => p.id === paymentId);
    if (!payment) return;
    const client   = Storage.clients.getById(payment.clientId);
    const contract = payment.contractId ? Storage.contracts.getById(payment.contractId) : null;
    const spot     = contract ? Storage.spots.getById(contract.spotId) : null;
    const branch   = Storage.branches.getById(payment.branchId);

    if (!client?.phone) { Utils.showToast('El cliente no tiene teléfono registrado', 'warning'); return; }

    const msg = `✅ *Recibo de pago — ${branch ? branch.name : 'Cochera'}*\n\n` +
      `Nº: ${Utils.formatReceiptNumber(payment.receiptNumber)}\n` +
      `Cliente: ${client.firstName} ${client.lastName}\n` +
      `Vehículo: ${client.plate || '—'}\n` +
      `${spot ? `Lugar: ${spot.label}\n` : ''}` +
      `Período: ${Utils.formatDate(payment.periodStart)} al ${Utils.formatDate(payment.periodEnd)}\n` +
      `Método: ${Utils.methodLabel(payment.method)}\n` +
      `*Total: ${Utils.formatCurrency(payment.amount)}*\n\n` +
      `¡Gracias por elegirnos! 🚗`;

    window.open(Utils.whatsappUrl(client.phone, msg), '_blank');
  }

  return { render, showNewPaymentModal, printReceipt, sendReceiptWhatsApp, _onClientChange };
})();
