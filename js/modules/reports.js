/**
 * Chiclana Parking — Reports Module
 */

const ReportsModule = (() => {

  function render() {
    const session   = Auth.getSession();
    const branchId  = session.branchId;
    const payments  = Storage.payments.getAll(branchId);
    const contracts = Storage.contracts.getActive(branchId);
    const spots     = Storage.spots.getAll(branchId);
    const clients   = Storage.clients.getActive(branchId);

    const now   = new Date();
    const month = now.getMonth();
    const year  = now.getFullYear();

    // ─── Income this month ─────────────────────────────────────────────────
    const thisMonthKey = `${year}-${String(month+1).padStart(2,'0')}`;
    const lastMonthKey = (() => {
      const d = new Date(year, month - 1, 1);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    })();

    const thisMonthPays = payments.filter(p => (p.createdAt||'').startsWith(thisMonthKey));
    const lastMonthPays = payments.filter(p => (p.createdAt||'').startsWith(lastMonthKey));
    const thisIncome    = thisMonthPays.reduce((s,p) => s+(p.amount||0), 0);
    const lastIncome    = lastMonthPays.reduce((s,p) => s+(p.amount||0), 0);
    const incomeChange  = lastIncome > 0 ? Math.round(((thisIncome-lastIncome)/lastIncome)*100) : null;

    // ─── Occupancy by floor ────────────────────────────────────────────────
    const floorStats = [1,2,3].map(f => {
      const floorSpots = spots.filter(s => s.floor === f && s.status !== 'disabled');
      const occupied   = floorSpots.filter(s => s.status === 'occupied').length;
      return { floor: f, total: floorSpots.length, occupied, free: floorSpots.length - occupied };
    });

    // ─── Debtors ──────────────────────────────────────────────────────────
    const debtors = contracts
      .filter(c => {
        const d = Utils.daysDiff(c.endDate);
        return d !== null && d < 0;
      })
      .map(c => {
        const client = Storage.clients.getById(c.clientId);
        const spot   = Storage.spots.getById(c.spotId);
        const days   = Math.abs(Utils.daysDiff(c.endDate));
        return { contract: c, client, spot, daysOverdue: days };
      })
      .sort((a,b) => b.daysOverdue - a.daysOverdue);

    // ─── Income by month (last 6) ──────────────────────────────────────────
    const monthlyIncome = [];
    for (let i = 5; i >= 0; i--) {
      const d   = new Date(year, month - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const inc = payments.filter(p => (p.createdAt||'').startsWith(key)).reduce((s,p) => s+(p.amount||0), 0);
      monthlyIncome.push({
        label: d.toLocaleDateString('es-AR', {month:'short', year:'2-digit'}),
        amount: inc,
        key
      });
    }
    const maxIncome = Math.max(...monthlyIncome.map(m => m.amount), 1);

    // ─── Payment methods breakdown ─────────────────────────────────────────
    const methods = { cash: 0, transfer: 0, other: 0 };
    payments.forEach(p => { methods[p.method] = (methods[p.method]||0) + (p.amount||0); });
    const totalAll = Object.values(methods).reduce((s,v) => s+v, 0);

    const body = document.getElementById('reports-body');
    body.innerHTML = `

      <!-- Top stats -->
      <div class="stats-grid" style="margin-bottom:1.5rem">

        <div class="stat-card">
          <div class="stat-icon" style="background:var(--success-bg);color:var(--success)">💰</div>
          <div class="stat-value" style="font-size:1.1rem">${Utils.formatCurrency(thisIncome)}</div>
          <div class="stat-label">Ingresos del mes</div>
          <div class="stat-change ${incomeChange !== null ? (incomeChange >= 0 ? 'up' : 'down') : ''}">
            ${incomeChange !== null ? `${incomeChange >= 0 ? '↑' : '↓'} ${Math.abs(incomeChange)}% vs mes anterior` : 'Sin mes anterior'}
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background:var(--accent-bg);color:var(--accent)">📋</div>
          <div class="stat-value">${payments.length}</div>
          <div class="stat-label">Total pagos registrados</div>
          <div class="stat-change">${Utils.formatCurrency(payments.reduce((s,p)=>s+(p.amount||0),0))} acumulado</div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background:var(--danger-bg);color:var(--danger)">⚠️</div>
          <div class="stat-value" style="color:${debtors.length>0?'var(--danger)':'var(--text-primary)'}">${debtors.length}</div>
          <div class="stat-label">Clientes deudores</div>
          <div class="stat-change ${debtors.length>0?'down':'up'}">
            ${debtors.length > 0 ? `${Utils.formatCurrency(debtors.reduce((s,d)=>s+(d.contract.price||0),0))} adeudado` : 'Sin deudores ✓'}
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon" style="background:var(--purple-bg);color:var(--purple)">👥</div>
          <div class="stat-value">${clients.length}</div>
          <div class="stat-label">Clientes activos</div>
          <div class="stat-change">${contracts.length} contratos vigentes</div>
        </div>

      </div>

      <div class="report-grid">

        <!-- Monthly income chart -->
        <div class="card">
          <div class="card-header"><span class="card-title">📊 Ingresos últimos 6 meses</span></div>
          <div class="card-body">
            <div style="display:flex;align-items:flex-end;gap:.4rem;height:120px;margin-bottom:.5rem">
              ${monthlyIncome.map(m => `
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:.3rem">
                  <div style="font-size:.62rem;color:var(--text-muted)">${m.amount > 0 ? Utils.formatCurrency(m.amount).replace('$','$') : ''}</div>
                  <div style="
                    flex:1;width:100%;
                    background:${m.key===thisMonthKey?'var(--accent)':'var(--bg-tertiary)'};
                    border-radius:4px 4px 0 0;
                    min-height:4px;
                    max-height:100px;
                    height:${Math.round((m.amount/maxIncome)*100)}px;
                    border:1px solid ${m.key===thisMonthKey?'var(--accent)':'var(--border)'};
                    transition:all .3s;
                  " title="${Utils.formatCurrency(m.amount)}"></div>
                </div>
              `).join('')}
            </div>
            <div style="display:flex;gap:.4rem">
              ${monthlyIncome.map(m => `
                <div style="flex:1;text-align:center;font-size:.65rem;color:var(--text-muted)">${m.label}</div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Occupancy by floor -->
        <div class="card">
          <div class="card-header"><span class="card-title">🏢 Ocupación por piso</span></div>
          <div class="card-body">
            ${floorStats.map(f => {
              const pct = f.total > 0 ? Math.round((f.occupied/f.total)*100) : 0;
              return `
              <div style="margin-bottom:.85rem">
                <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:.3rem">
                  <span class="fw-600">Piso ${f.floor}</span>
                  <span style="color:var(--text-secondary)">${f.occupied}/${f.total} · <strong>${pct}%</strong></span>
                </div>
                <div style="height:8px;background:var(--bg-tertiary);border-radius:4px;overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:${pct>80?'var(--danger)':pct>50?'var(--warning)':'var(--success)'};border-radius:4px;transition:width .4s"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:.65rem;color:var(--text-muted);margin-top:.2rem">
                  <span>${f.free} libre${f.free!==1?'s':''}</span>
                  <span>${f.occupied} ocupado${f.occupied!==1?'s':''}</span>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Payment methods -->
        <div class="card">
          <div class="card-header"><span class="card-title">💳 Métodos de pago</span></div>
          <div class="card-body">
            ${[
              {key:'cash',    label:'💵 Efectivo',       color:'var(--success)'},
              {key:'transfer',label:'🏦 Transferencia',  color:'var(--accent)'},
              {key:'other',   label:'🔹 Otro',           color:'var(--text-secondary)'}
            ].map(m => {
              const amt = methods[m.key] || 0;
              const pct = totalAll > 0 ? Math.round((amt/totalAll)*100) : 0;
              return `
              <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem">
                <span style="font-size:.8rem;width:130px">${m.label}</span>
                <div style="flex:1;height:8px;background:var(--bg-tertiary);border-radius:4px;overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:${m.color};border-radius:4px"></div>
                </div>
                <span style="font-size:.75rem;color:var(--text-secondary);width:80px;text-align:right">${Utils.formatCurrency(amt)} (${pct}%)</span>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Debtors -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">❌ Deudores</span>
            <span style="font-size:.72rem;color:var(--text-muted)">${debtors.length} cliente${debtors.length!==1?'s':''}</span>
          </div>
          ${debtors.length === 0 ? `
            <div class="card-body" style="text-align:center;padding:1.5rem">
              <span style="font-size:1.5rem">✅</span>
              <p style="color:var(--text-secondary);font-size:.8rem;margin-top:.4rem">Sin deudores</p>
            </div>
          ` : `
          <div class="table-wrap">
            <table style="font-size:.78rem">
              <thead><tr><th>Cliente</th><th>Lugar</th><th>Vencido hace</th><th>Monto</th></tr></thead>
              <tbody>
                ${debtors.map(d => `
                <tr>
                  <td class="fw-600">${d.client ? Utils.escapeHtml(`${d.client.firstName} ${d.client.lastName}`) : '—'}</td>
                  <td>${d.spot ? `<span class="badge badge-accent">${d.spot.label}</span>` : '—'}</td>
                  <td style="color:var(--danger)">${d.daysOverdue} día${d.daysOverdue!==1?'s':''}</td>
                  <td class="fw-600 text-danger">${Utils.formatCurrency(d.contract.price)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
        </div>

      </div>
    `;
  }

  return { render };
})();
