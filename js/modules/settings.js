/**
 * Chiclana Parking — Settings Module
 */

const SettingsModule = (() => {

  let activeTab = 'branch';

  function render() {
    const session  = Auth.getSession();
    const branchId = session.branchId;
    const branch   = Storage.branches.getById(branchId);
    const settings = Storage.settings.get(branchId);

    const body = document.getElementById('settings-body');
    body.innerHTML = `
      <div class="tab-list" id="settings-tabs">
        <button class="tab-btn ${activeTab==='branch'?'active':''}" data-tab="branch">🏢 Sucursal</button>
        <button class="tab-btn ${activeTab==='users'?'active':''}" data-tab="users">👤 Usuarios</button>
        <button class="tab-btn ${activeTab==='system'?'active':''}" data-tab="system">⚙️ Sistema</button>
        ${Auth.isAdmin() ? `<button class="tab-btn ${activeTab==='branches'?'active':''}" data-tab="branches">🏗 Sucursales</button>` : ''}
      </div>
      <div id="settings-tab-content"></div>
    `;

    document.querySelectorAll('#settings-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        document.querySelectorAll('#settings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTab(branchId, branch, settings);
      });
    });

    renderTab(branchId, branch, settings);
  }

  function renderTab(branchId, branch, settings) {
    const el = document.getElementById('settings-tab-content');
    switch (activeTab) {
      case 'branch':   el.innerHTML = renderBranchTab(branch); bindBranchTab(branchId); break;
      case 'users':    el.innerHTML = renderUsersTab(branchId); bindUsersTab(branchId); break;
      case 'system':   el.innerHTML = renderSystemTab(settings); bindSystemTab(branchId, settings); break;
      case 'branches': el.innerHTML = renderBranchesTab(); bindBranchesTab(); break;
    }
  }

  // ─── Branch tab ────────────────────────────────────────────────────────────

  function renderBranchTab(branch) {
    const b = branch || {};
    return `
      <div class="card">
        <div class="card-header"><span class="card-title">🏢 Datos de la sucursal</span></div>
        <div class="card-body">
          <div style="display:flex;flex-direction:column;gap:1rem">
            <div class="form-row cols-2">
              <div class="form-group">
                <label class="form-label">Nombre <span class="required">*</span></label>
                <input class="form-control" id="bs-name" value="${Utils.escapeHtml(b.name||'')}">
              </div>
              <div class="form-group">
                <label class="form-label">Teléfono</label>
                <input class="form-control" id="bs-phone" type="tel" value="${Utils.escapeHtml(b.phone||'')}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Dirección</label>
              <input class="form-control" id="bs-address" value="${Utils.escapeHtml(b.address||'')}">
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input class="form-control" id="bs-email" type="email" value="${Utils.escapeHtml(b.email||'')}">
            </div>
            <div class="form-row cols-2">
              <div class="form-group">
                <label class="form-label">Cantidad de pisos</label>
                <input class="form-control" id="bs-floors" type="number" min="1" max="10" value="${b.totalFloors||3}">
              </div>
              <div class="form-group">
                <label class="form-label">Lugares por piso</label>
                <input class="form-control" id="bs-spots" type="number" min="1" max="100" value="${b.spotsPerFloor||17}">
                <span class="form-hint">Cambiar esto regenera el mapa de lugares</span>
              </div>
            </div>
            <div>
              <button class="btn btn-primary" id="btn-save-branch">Guardar cambios</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function bindBranchTab(branchId) {
    document.getElementById('btn-save-branch')?.addEventListener('click', () => {
      const name    = document.getElementById('bs-name')?.value.trim();
      const phone   = document.getElementById('bs-phone')?.value.trim();
      const address = document.getElementById('bs-address')?.value.trim();
      const email   = document.getElementById('bs-email')?.value.trim();
      const floors  = parseInt(document.getElementById('bs-floors')?.value || 3);
      const spots   = parseInt(document.getElementById('bs-spots')?.value || 17);

      if (!name) { Utils.showToast('El nombre es obligatorio', 'error'); return; }

      const branch = Storage.branches.getById(branchId);
      const needsRegen = branch && (branch.totalFloors !== floors || branch.spotsPerFloor !== spots);

      Storage.branches.update(branchId, { name, phone, address, email, totalFloors: floors, spotsPerFloor: spots });

      if (needsRegen) {
        regenerateSpots(branchId, floors, spots);
      }

      document.getElementById('branch-name').textContent = name;
      Utils.showToast('Sucursal actualizada ✓', 'success');
    });
  }

  function regenerateSpots(branchId, floors, spotsPerFloor) {
    const existingSpots = Storage.spots.getAll(branchId);
    const existingKeys  = new Set(existingSpots.map(s => `${s.floor}-${s.number}`));

    for (let f = 1; f <= floors; f++) {
      for (let n = 1; n <= spotsPerFloor; n++) {
        const key = `${f}-${n}`;
        if (!existingKeys.has(key)) {
          Storage.spots.update && Storage.spots.getAll && (() => {
            // Add new spot via direct localStorage manipulation
            const all = JSON.parse(localStorage.getItem('cp_spots') || '[]');
            const now = new Date().toISOString();
            all.push({
              id: Storage.generateId(), branchId, floor: f, number: n,
              label: `P${f}-${String(n).padStart(2,'0')}`,
              type: 'fixed', status: 'free', clientId: null, contractId: null,
              createdAt: now, updatedAt: now
            });
            localStorage.setItem('cp_spots', JSON.stringify(all));
          })();
        }
      }
    }
  }

  // ─── Users tab ──────────────────────────────────────────────────────────────

  function renderUsersTab(branchId) {
    const users = Storage.users.getAll();
    return `
      <div class="card" style="margin-bottom:1rem">
        <div class="card-header">
          <span class="card-title">👤 Usuarios del sistema</span>
          ${Auth.isAdmin() ? `<button class="btn btn-primary btn-sm" id="btn-new-user">+ Nuevo usuario</button>` : ''}
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Sucursal</th><th>Estado</th>${Auth.isAdmin()?'<th>Acciones</th>':''}</tr></thead>
            <tbody>
              ${users.map(u => `
              <tr>
                <td class="fw-600">
                  <div style="display:flex;align-items:center;gap:.5rem">
                    <div class="avatar" style="width:28px;height:28px;font-size:.7rem">${(u.name||'U').charAt(0)}</div>
                    ${Utils.escapeHtml(u.name)}
                  </div>
                </td>
                <td style="font-family:monospace;color:var(--accent)">${Utils.escapeHtml(u.username)}</td>
                <td><span class="badge ${u.role==='admin'?'badge-danger':u.role==='manager'?'badge-warning':'badge-muted'}">${Auth.ROLE_LABELS[u.role]||u.role}</span></td>
                <td style="font-size:.78rem;color:var(--text-secondary)">${u.branchId ? (Storage.branches.getById(u.branchId)?.name||'—') : 'Todas'}</td>
                <td>${u.active !== false ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-muted">Inactivo</span>'}</td>
                ${Auth.isAdmin() ? `
                <td>
                  <div style="display:flex;gap:.25rem">
                    <button class="btn btn-ghost btn-sm" data-user-action="edit" data-user-id="${u.id}">✏️</button>
                    <button class="btn btn-ghost btn-sm" data-user-action="toggle" data-user-id="${u.id}">${u.active!==false?'🚫':'✓'}</button>
                  </div>
                </td>` : ''}
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function bindUsersTab(branchId) {
    document.getElementById('btn-new-user')?.addEventListener('click', () => showUserModal(null, branchId));

    document.querySelectorAll('[data-user-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.userAction;
        const userId = btn.dataset.userId;
        if (action === 'edit')   showUserModal(Storage.users.getById(userId), branchId);
        if (action === 'toggle') toggleUser(userId);
      });
    });
  }

  function showUserModal(user, branchId) {
    const isEdit = !!user;
    const u = user || {};
    const branches = Storage.branches.getAll();

    Utils.showModal(isEdit ? 'Editar usuario' : 'Nuevo usuario', `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Nombre completo <span class="required">*</span></label>
            <input class="form-control" id="uf-name" value="${Utils.escapeHtml(u.name||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Usuario <span class="required">*</span></label>
            <input class="form-control" id="uf-username" value="${Utils.escapeHtml(u.username||'')}" ${isEdit?'disabled':''}>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">${isEdit ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}</label>
          <input class="form-control" id="uf-password" type="password" placeholder="${isEdit?'••••••••':'Mínimo 6 caracteres'}">
        </div>
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Rol <span class="required">*</span></label>
            <select class="form-control" id="uf-role">
              <option value="employee" ${u.role==='employee'?'selected':''}>Empleado</option>
              <option value="manager"  ${u.role==='manager'?'selected':''}>Encargado</option>
              <option value="admin"    ${u.role==='admin'?'selected':''}>Administrador</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Sucursal</label>
            <select class="form-control" id="uf-branch">
              <option value="">Todas (Admin)</option>
              ${branches.map(b => `<option value="${b.id}" ${u.branchId===b.id?'selected':''}>${Utils.escapeHtml(b.name)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    `, [
      { id: 'save-user', label: isEdit ? 'Guardar cambios' : 'Crear usuario', cls: 'btn-primary', close: false,
        handler: () => saveUser(user?.id || null) },
      { id: 'cancel-user', label: 'Cancelar', cls: 'btn-secondary', handler: () => {} }
    ]);
  }

  function saveUser(existingId) {
    const name     = document.getElementById('uf-name')?.value.trim();
    const username = document.getElementById('uf-username')?.value.trim();
    const password = document.getElementById('uf-password')?.value;
    const role     = document.getElementById('uf-role')?.value || 'employee';
    const branchId = document.getElementById('uf-branch')?.value || null;

    if (!name)                     { Utils.showToast('El nombre es obligatorio', 'error'); return; }
    if (!existingId && !username)  { Utils.showToast('El usuario es obligatorio', 'error'); return; }
    if (!existingId && !password)  { Utils.showToast('La contraseña es obligatoria', 'error'); return; }
    if (!existingId && password.length < 4) { Utils.showToast('La contraseña debe tener al menos 4 caracteres', 'error'); return; }

    // Check duplicate username
    if (!existingId) {
      const existing = Storage.users.getByUsername(username);
      if (existing) { Utils.showToast('El nombre de usuario ya existe', 'error'); return; }
    }

    const data = { name, role, branchId: branchId || null, active: true };
    if (!existingId) data.username = username;
    if (password) data.password = password;

    if (existingId) {
      Storage.users.update(existingId, data);
      Utils.showToast('Usuario actualizado ✓', 'success');
    } else {
      Storage.users.add(data);
      Utils.showToast('Usuario creado ✓', 'success');
    }

    Utils.closeModal();
    render();
  }

  function toggleUser(userId) {
    const user = Storage.users.getById(userId);
    if (!user) return;
    const session = Auth.getSession();
    if (user.id === session.userId) { Utils.showToast('No podés desactivar tu propio usuario', 'warning'); return; }
    Storage.users.update(userId, { active: user.active === false ? true : false });
    Utils.showToast(`Usuario ${user.active === false ? 'activado' : 'desactivado'}`, 'success');
    render();
  }

  // ─── System tab ─────────────────────────────────────────────────────────────

  function renderSystemTab(settings) {
    const frac = settings.hourlyFractionMinutes || 15;
    const minM = settings.hourlyMinMinutes || 60;
    const tol  = settings.hourlyToleranceMinutes ?? 5;

    return `
      <div class="card" style="margin-bottom:1rem">
        <div class="card-header"><span class="card-title">⏱️ Fraccionamiento de Horas</span></div>
        <div class="card-body">
          <div style="display:flex;flex-direction:column;gap:1rem">
            <div class="form-row cols-3">
              <div class="form-group">
                <label class="form-label">Bloque de fraccionamiento</label>
                <select class="form-control" id="sys-hourly-frac">
                  <option value="15" ${frac===15?'selected':''}>Cada 15 minutos (1/4 hora)</option>
                  <option value="30" ${frac===30?'selected':''}>Cada 30 minutos (1/2 hora)</option>
                  <option value="60" ${frac===60?'selected':''}>Hora completa (60 min)</option>
                </select>
                <span class="form-hint">Paso con el que se fracciona el tiempo extra</span>
              </div>
              <div class="form-group">
                <label class="form-label">Tolerancia libre (minutos)</label>
                <input class="form-control" type="number" id="sys-hourly-tol" min="0" max="30" value="${tol}">
                <span class="form-hint">Minutos de margen sin cobro adicional</span>
              </div>
              <div class="form-group">
                <label class="form-label">Cobro mínimo inicial</label>
                <select class="form-control" id="sys-hourly-min">
                  <option value="15" ${minM===15?'selected':''}>15 minutos</option>
                  <option value="30" ${minM===30?'selected':''}>30 minutos</option>
                  <option value="60" ${minM===60?'selected':''}>1 hora completa</option>
                </select>
                <span class="form-hint">Mínimo cobrable al ingresar</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:1rem">
        <div class="card-header"><span class="card-title">⚙️ Configuración del sistema</span></div>
        <div class="card-body">
          <div style="display:flex;flex-direction:column;gap:1rem">
            <div class="form-group">
              <label class="form-label">Pie de recibo</label>
              <input class="form-control" id="sys-footer" value="${Utils.escapeHtml(settings.receiptFooter||'Gracias por elegir Chiclana Parking')}">
              <span class="form-hint">Este texto aparece en la parte inferior de todos los recibos</span>
            </div>
            <div class="form-group">
              <label class="form-label">Alertar revisión de precios cada (días)</label>
              <input class="form-control" id="sys-price-days" type="number" min="30" max="365" value="${settings.priceAlertDays||90}">
            </div>
            <div>
              <button class="btn btn-primary" id="btn-save-system">Guardar configuración</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">💾 Datos del sistema</span></div>
        <div class="card-body">
          <div style="display:flex;gap:.75rem;flex-wrap:wrap">
            <button class="btn btn-secondary" id="btn-export-data">⬇️ Exportar datos</button>
            <button class="btn btn-secondary" id="btn-import-data">⬆️ Importar datos</button>
            <input type="file" id="import-file" accept=".json" style="display:none">
          </div>
          <p style="font-size:.75rem;color:var(--text-muted);margin-top:.75rem">
            Exportá los datos como backup o importá datos de otra instalación.
          </p>
        </div>
      </div>
    `;
  }

  function bindSystemTab(branchId, settings) {
    document.getElementById('btn-save-system')?.addEventListener('click', () => {
      const footer    = document.getElementById('sys-footer')?.value.trim();
      const priceDays = parseInt(document.getElementById('sys-price-days')?.value || 90);
      const frac      = parseInt(document.getElementById('sys-hourly-frac')?.value || 15);
      const tol       = parseInt(document.getElementById('sys-hourly-tol')?.value || 0);
      const minM      = parseInt(document.getElementById('sys-hourly-min')?.value || 60);

      Storage.settings.update(branchId, {
        receiptFooter: footer,
        priceAlertDays: priceDays,
        hourlyFractionMinutes: frac,
        hourlyToleranceMinutes: tol,
        hourlyMinMinutes: minM
      });
      Utils.showToast('Configuración guardada ✓', 'success');
    });

    document.getElementById('btn-export-data')?.addEventListener('click', exportData);
    document.getElementById('btn-import-data')?.addEventListener('click', () => {
      document.getElementById('import-file')?.click();
    });
    document.getElementById('import-file')?.addEventListener('change', importData);
  }

  function exportData() {
    const data = {};
    ['cp_branches','cp_users','cp_spots','cp_clients','cp_contracts','cp_payments','cp_prices','cp_settings'].forEach(k => {
      try { data[k] = JSON.parse(localStorage.getItem(k) || 'null'); } catch {}
    });
    data._exportDate = new Date().toISOString();
    data._version    = '1.0';

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `chiclana-parking-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Utils.showToast('Datos exportados ✓', 'success');
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      Utils.confirm('¿Importar datos? Esto reemplazará todos los datos actuales.', () => {
        try {
          const data = JSON.parse(ev.target.result);
          ['cp_branches','cp_users','cp_spots','cp_clients','cp_contracts','cp_payments','cp_prices','cp_settings'].forEach(k => {
            if (data[k] !== undefined && data[k] !== null) {
              localStorage.setItem(k, JSON.stringify(data[k]));
            }
          });
          Utils.showToast('Datos importados ✓. Recargando…', 'success');
          setTimeout(() => location.reload(), 1500);
        } catch {
          Utils.showToast('Error al leer el archivo. Asegurate de que sea un backup válido.', 'error');
        }
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ─── Branches tab ───────────────────────────────────────────────────────────

  function renderBranchesTab() {
    const branches = Storage.branches.getAll();
    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title">🏗 Sucursales</span>
          <button class="btn btn-primary btn-sm" id="btn-new-branch">+ Nueva sucursal</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Dirección</th><th>Pisos</th><th>Lugares</th><th>Acciones</th></tr></thead>
            <tbody>
              ${branches.map(b => `
              <tr>
                <td class="fw-600">${Utils.escapeHtml(b.name)}</td>
                <td style="color:var(--text-secondary)">${Utils.escapeHtml(b.address||'—')}</td>
                <td>${b.totalFloors}</td>
                <td>${b.totalFloors * b.spotsPerFloor}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" data-branch-edit="${b.id}">✏️</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function bindBranchesTab() {
    document.getElementById('btn-new-branch')?.addEventListener('click', () => showBranchModal(null));
    document.querySelectorAll('[data-branch-edit]').forEach(btn => {
      btn.addEventListener('click', () => showBranchModal(Storage.branches.getById(btn.dataset.branchEdit)));
    });
  }

  function showBranchModal(branch) {
    const isEdit = !!branch;
    const b = branch || {};
    Utils.showModal(isEdit ? 'Editar sucursal' : 'Nueva sucursal', `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div class="form-group">
          <label class="form-label">Nombre <span class="required">*</span></label>
          <input class="form-control" id="bf-name" value="${Utils.escapeHtml(b.name||'')}">
        </div>
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Dirección</label>
            <input class="form-control" id="bf-address" value="${Utils.escapeHtml(b.address||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Teléfono</label>
            <input class="form-control" id="bf-phone" value="${Utils.escapeHtml(b.phone||'')}">
          </div>
        </div>
        ${!isEdit ? `
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Pisos</label>
            <input class="form-control" id="bf-floors" type="number" min="1" max="10" value="3">
          </div>
          <div class="form-group">
            <label class="form-label">Lugares por piso</label>
            <input class="form-control" id="bf-spots" type="number" min="1" max="100" value="17">
          </div>
        </div>` : ''}
      </div>
    `, [
      { id: 'save-branch', label: isEdit ? 'Guardar' : 'Crear sucursal', cls: 'btn-primary', close: false,
        handler: () => saveBranch(branch?.id || null) },
      { id: 'cancel-branch', label: 'Cancelar', cls: 'btn-secondary', handler: () => {} }
    ]);
  }

  function saveBranch(existingId) {
    const name    = document.getElementById('bf-name')?.value.trim();
    const address = document.getElementById('bf-address')?.value.trim();
    const phone   = document.getElementById('bf-phone')?.value.trim();

    if (!name) { Utils.showToast('El nombre es obligatorio', 'error'); return; }

    if (existingId) {
      Storage.branches.update(existingId, { name, address, phone });
      Utils.showToast('Sucursal actualizada ✓', 'success');
    } else {
      const floors = parseInt(document.getElementById('bf-floors')?.value || 3);
      const spots  = parseInt(document.getElementById('bf-spots')?.value || 17);
      const now    = new Date().toISOString();
      const branchId = Storage.generateId();

      Storage.branches.add({ id: branchId, name, address, phone, totalFloors: floors, spotsPerFloor: spots });

      // Create spots
      const allSpots = JSON.parse(localStorage.getItem('cp_spots') || '[]');
      for (let f = 1; f <= floors; f++) {
        for (let n = 1; n <= spots; n++) {
          allSpots.push({ id: Storage.generateId(), branchId, floor: f, number: n,
            label: `P${f}-${String(n).padStart(2,'0')}`, type: 'fixed', status: 'free',
            clientId: null, contractId: null, createdAt: now, updatedAt: now });
        }
      }
      localStorage.setItem('cp_spots', JSON.stringify(allSpots));

      // Default prices
      const allPrices = JSON.parse(localStorage.getItem('cp_prices') || '[]');
      allPrices.push({ id: Storage.generateId(), branchId, monthlyFixed: 50000, monthlyMobile: 35000,
        daily: 5000, effectiveDate: now.split('T')[0], notes: 'Precio inicial', createdAt: now, updatedAt: now });
      localStorage.setItem('cp_prices', JSON.stringify(allPrices));

      Utils.showToast('Sucursal creada ✓', 'success');
    }

    Utils.closeModal();
    render();
  }

  return { render };
})();
