/**
 * Chiclana Parking — Prices Module
 */

const PricesModule = (() => {

  async function render() {
    const session  = Auth.getSession();
    const branchId = session.branchId;

    const [current, allPrices, settings] = await Promise.all([
      Storage.prices.getCurrent(branchId),
      Storage.prices.getAll(branchId),
      Storage.settings.get(branchId)
    ]);

    const history = allPrices
      .sort((a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate));

    const lastUpdate   = settings.lastPriceUpdate || (current?.effectiveDate);
    const daysSince    = lastUpdate ? Math.floor((Date.now() - new Date(lastUpdate)) / 86400000) : 0;
    const alertNeeded  = daysSince >= 90;

    // Render update button (admin/manager only)
    const actionsEl = document.getElementById('prices-actions');
    if (actionsEl && Auth.isManagerOrAbove()) {
      actionsEl.innerHTML = `<button class="btn btn-primary btn-sm" id="btn-update-price">💲 Actualizar precios</button>`;
      document.getElementById('btn-update-price').onclick = showUpdatePriceModal;
    }

    const body = document.getElementById('prices-body');
    body.innerHTML = `

      ${alertNeeded ? `
      <div class="alert-item alert-warning" style="margin-bottom:1.25rem">
        <span class="alert-icon">⏰</span>
        <div class="alert-body">
          <div class="alert-title">¡Revisión de precios recomendada!</div>
          <div class="alert-desc">Hace <strong>${daysSince} días</strong> del último ajuste (${Utils.formatDate(lastUpdate)}). La cochera recomienda revisar precios cada 90 días por inflación.</div>
        </div>
        ${Auth.isManagerOrAbove() ? `<button class="btn btn-warning btn-sm" onclick="PricesModule.showUpdatePriceModal()">Actualizar ahora</button>` : ''}
      </div>` : ''}

      <!-- Current prices -->
      <div style="margin-bottom:1.5rem">
        <h3 style="font-size:.82rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.75rem">
          Precios actuales ${current ? `— vigentes desde ${Utils.formatDate(current.effectiveDate)}` : ''}
        </h3>
        <div class="price-cards">
          <div class="price-card price-fixed">
            <div class="price-label">🔴 Alquiler Fijo Mensual</div>
            <div class="price-value">${current ? Utils.formatCurrency(current.monthlyFixed) : '—'}</div>
            <div style="font-size:.72rem;color:var(--text-muted);margin-top:.35rem">Lugar asignado y fijo</div>
          </div>
          <div class="price-card price-mobile">
            <div class="price-label">🟠 Alquiler Móvil Mensual</div>
            <div class="price-value">${current ? Utils.formatCurrency(current.monthlyMobile) : '—'}</div>
            <div style="font-size:.72rem;color:var(--text-muted);margin-top:.35rem">El lugar puede variar</div>
          </div>
          <div class="price-card price-daily">
            <div class="price-label">🟢 Estadía Diaria</div>
            <div class="price-value">${current ? Utils.formatCurrency(current.daily) : '—'}</div>
            <div style="font-size:.72rem;color:var(--text-muted);margin-top:.35rem">Por día, sin contrato</div>
          </div>
          <div class="price-card" style="border-top:3px solid var(--accent)">
            <div class="price-label">🔵 Fracción / Hora</div>
            <div class="price-value">${current ? Utils.formatCurrency(current.hourly || 1500) : '—'}</div>
            <div style="font-size:.72rem;color:var(--text-muted);margin-top:.35rem">Por hora fraccionada</div>
          </div>
        </div>
      </div>

      <!-- Price history -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">📈 Historial de ajustes</span>
          <span style="font-size:.75rem;color:var(--text-muted)">${history.length} registro${history.length!==1?'s':''}</span>
        </div>
        <div class="table-wrap">
          ${history.length === 0 ? `
            <div class="empty-state"><div class="empty-icon">📈</div><h3>Sin historial</h3></div>
          ` : `
          <table>
            <thead><tr>
              <th>Fecha vigencia</th><th>Fijo mensual</th><th>Móvil mensual</th><th>Diario</th><th>Por hora</th><th>Aumento</th><th>Notas</th>
            </tr></thead>
            <tbody>
              ${history.map((p, i) => {
                const prev = history[i + 1];
                const pct  = p.adjustmentPercent;
                return `<tr>
                  <td>${Utils.formatDate(p.effectiveDate)} ${i===0?'<span class="badge badge-success" style="margin-left:.3rem">Actual</span>':''}</td>
                  <td class="fw-600">${Utils.formatCurrency(p.monthlyFixed)}</td>
                  <td class="fw-600">${Utils.formatCurrency(p.monthlyMobile)}</td>
                  <td class="fw-600">${Utils.formatCurrency(p.daily)}</td>
                  <td class="fw-600">${Utils.formatCurrency(p.hourly || 1500)}</td>
                  <td>${pct ? `<span class="badge badge-warning">+${pct}%</span>` :
                        prev ? (() => {
                          const computed = Math.round(((p.monthlyFixed - prev.monthlyFixed) / prev.monthlyFixed) * 100);
                          return computed > 0 ? `<span class="badge badge-warning">+${computed}%</span>` : '—';
                        })() : '—'}</td>
                  <td style="color:var(--text-secondary);font-size:.8rem">${Utils.escapeHtml(p.notes || '—')}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`}
        </div>
      </div>
    `;
  }

  async function showUpdatePriceModal() {
    const session  = Auth.getSession();
    const current  = await Storage.prices.getCurrent(session.branchId);
    const today    = new Date().toISOString().split('T')[0];

    Utils.showModal('Actualizar precios', `
      <div style="display:flex;flex-direction:column;gap:1rem">

        ${current ? `
        <div style="background:var(--bg-tertiary);border-radius:var(--radius);padding:.85rem;font-size:.82rem">
          <div style="font-weight:700;margin-bottom:.4rem;color:var(--text-secondary)">Precios actuales:</div>
          <div style="display:flex;gap:1rem;flex-wrap:wrap">
            <span>Fijo: <strong>${Utils.formatCurrency(current.monthlyFixed)}</strong></span>
            <span>Móvil: <strong>${Utils.formatCurrency(current.monthlyMobile)}</strong></span>
            <span>Diario: <strong>${Utils.formatCurrency(current.daily)}</strong></span>
            <span>Hora: <strong>${Utils.formatCurrency(current.hourly || 1500)}</strong></span>
          </div>
        </div>` : ''}

        <div style="background:var(--info-bg);border-radius:var(--radius);padding:.85rem;font-size:.82rem">
          <span style="color:var(--info)">💡</span>
          Ingresá el porcentaje de aumento y se calculará automáticamente, o escribí el precio directamente.
        </div>

        <div class="form-group">
          <label class="form-label">Aplicar aumento % (opcional)</label>
          <input class="form-control" type="number" id="price-pct" placeholder="Ej: 15 (para 15%)" min="0" max="999"
                 oninput="PricesModule._applyPct(${current?.monthlyFixed||0}, ${current?.monthlyMobile||0}, ${current?.daily||0}, ${current?.hourly||1500})">
        </div>

        <div class="form-row cols-2" style="grid-template-columns: 1fr 1fr 1fr 1fr;">
          <div class="form-group">
            <label class="form-label">Fijo mensual <span class="required">*</span></label>
            <input class="form-control" type="number" id="price-fixed"
                   value="${current?.monthlyFixed||''}" placeholder="0" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Móvil mensual <span class="required">*</span></label>
            <input class="form-control" type="number" id="price-mobile"
                   value="${current?.monthlyMobile||''}" placeholder="0" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Diario <span class="required">*</span></label>
            <input class="form-control" type="number" id="price-daily"
                   value="${current?.daily||''}" placeholder="0" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Por Hora <span class="required">*</span></label>
            <input class="form-control" type="number" id="price-hourly"
                   value="${current?.hourly||1500}" placeholder="0" min="0">
          </div>
        </div>

        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Fecha de vigencia <span class="required">*</span></label>
            <input class="form-control" type="date" id="price-date" value="${today}">
          </div>
          <div class="form-group">
            <label class="form-label">Notas</label>
            <input class="form-control" type="text" id="price-notes" placeholder="Ej: Ajuste por inflación Q1 2024">
          </div>
        </div>

      </div>
    `, [
      { id: 'save-price', label: '💲 Guardar precios', cls: 'btn-primary', close: false, handler: savePrices },
      { id: 'cancel-price', label: 'Cancelar', cls: 'btn-secondary', handler: () => {} }
    ], 'modal-lg');
  }

  function _applyPct(basFixed, baseMobile, baseDaily, baseHourly) {
    const pct = parseFloat(document.getElementById('price-pct')?.value || 0);
    if (isNaN(pct) || pct <= 0) return;
    const mul = 1 + pct / 100;
    const round = v => Math.round(v * mul / 100) * 100;

    const fixedEl  = document.getElementById('price-fixed');
    const mobileEl = document.getElementById('price-mobile');
    const dailyEl  = document.getElementById('price-daily');
    const hourlyEl = document.getElementById('price-hourly');

    if (fixedEl && basFixed)   fixedEl.value  = round(basFixed);
    if (mobileEl && baseMobile) mobileEl.value = round(baseMobile);
    if (dailyEl && baseDaily)  dailyEl.value  = round(baseDaily);
    if (hourlyEl && baseHourly) hourlyEl.value = round(baseHourly);
  }

  async function savePrices() {
    const session  = Auth.getSession();
    const branchId = session.branchId;
    const fixed    = parseFloat(document.getElementById('price-fixed')?.value || 0);
    const mobile   = parseFloat(document.getElementById('price-mobile')?.value || 0);
    const daily    = parseFloat(document.getElementById('price-daily')?.value || 0);
    const hourly   = parseFloat(document.getElementById('price-hourly')?.value || 0);
    const date     = document.getElementById('price-date')?.value;
    const notes    = document.getElementById('price-notes')?.value.trim() || '';
    const pct      = parseFloat(document.getElementById('price-pct')?.value || 0) || null;

    if (!fixed || fixed <= 0)  { Utils.showToast('Ingresá el precio fijo', 'error'); return; }
    if (!mobile || mobile <= 0){ Utils.showToast('Ingresá el precio móvil', 'error'); return; }
    if (!daily || daily <= 0)  { Utils.showToast('Ingresá el precio diario', 'error'); return; }
    if (!hourly || hourly <= 0){ Utils.showToast('Ingresá el precio por hora', 'error'); return; }
    if (!date)                 { Utils.showToast('Ingresá la fecha de vigencia', 'error'); return; }

    await Storage.prices.add({
      branchId,
      monthlyFixed: fixed,
      monthlyMobile: mobile,
      daily,
      hourly,
      effectiveDate: date,
      adjustmentPercent: pct,
      notes
    });

    await Storage.settings.update(branchId, { lastPriceUpdate: date });

    Utils.closeModal();
    Utils.showToast('Precios actualizados ✓', 'success');
    await render();
  }

  return { render, showUpdatePriceModal, _applyPct };
})();
