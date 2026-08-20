/**
 * Chiclana Parking — Settings Module
 */

const SettingsModule = (() => {

  let activeTab = 'branch';

  async function render() {
    const session  = Auth.getSession();
    const branchId = session.branchId;
    const [branch, settings] = await Promise.all([
      Storage.branches.getById(branchId),
      Storage.settings.get(branchId)
    ]);

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

    await renderTab(branchId, branch, settings);
  }

  async function renderTab(branchId, branch, settings) {
    const el = document.getElementById('settings-tab-content');
    switch (activeTab) {
      case 'branch':   el.innerHTML = renderBranchTab(branch); bindBranchTab(branchId); break;
      case 'users':    el.innerHTML = await renderUsersTab(branchId); bindUsersTab(branchId); break;
      case 'system':   el.innerHTML = renderSystemTab(settings); bindSystemTab(branchId, settings); break;
      case 'branches': el.innerHTML = await renderBranchesTab(); bindBranchesTab(); break;
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
    document.getElementById('btn-save-branch')?.addEventListener('click', async () => {
      const name    = document.getElementById('bs-name')?.value.trim();
      const phone   = document.getElementById('bs-phone')?.value.trim();
      const address = document.getElementById('bs-address')?.value.trim();
      const email   = document.getElementById('bs-email')?.value.trim();
      const floors  = parseInt(document.getElementById('bs-floors')?.value || 3);
      const spots   = parseInt(document.getElementById('bs-spots')?.value || 17);

      if (!name) { Utils.showToast('El nombre es obligatorio', 'error'); return; }

      const branch = await Storage.branches.getById(branchId);
      const needsRegen = branch && (branch.totalFloors !== floors || branch.spotsPerFloor !== spots);

      await Storage.branches.update(branchId, { name, phone, address, email, totalFloors: floors, spotsPerFloor: spots });

      if (needsRegen) {
        await regenerateSpots(branchId, floors, spots);
      }

      document.getElementById('branch-name').textContent = name;
      Utils.showToast('Sucursal actualizada ✓', 'success');
    });
  }

  async function regenerateSpots(branchId, floors, spotsPerFloor) {
    const existingSpots = await Storage.spots.getAll(branchId);
    const existingKeys  = new Set(existingSpots.map(s => `${s.floor}-${s.number}`));

    const toCreate = [];
    for (let f = 1; f <= floors; f++) {
      for (let n = 1; n <= spotsPerFloor; n++) {
        const key = `${f}-${n}`;
        if (!existingKeys.has(key)) {
          toCreate.push({
            branchId, floor: f, number: n,
            label: `P${f}-${String(n).padStart(2,'0')}`,
            type: 'fixed', status: 'free'
          });
        }
      }
    }

    await Promise.all(toCreate.map(s => Storage.spots.add(s)));
  }

  // ─── Users tab ──────────────────────────────────────────────────────────────

  async function renderUsersTab(branchId) {
    const [users, branches] = await Promise.all([
      Storage.users.getAll(),
      Storage.branches.getAll()
    ]);
    const branchesById = new Map(branches.map(b => [b.id, b]));

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
                <td style="font-size:.78rem;color:var(--text-secondary)">${u.branchId ? (branchesById.get(u.branchId)?.name||'—') : 'Todas'}</td>
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
      btn.addEventListener('click', async () => {
        const action = btn.dataset.userAction;
        const userId = btn.dataset.userId;
        if (action === 'edit')   await showUserModal(await Storage.users.getById(userId), branchId);
        if (action === 'toggle') await toggleUser(userId);
      });
    });
  }

  async function showUserModal(user, branchId) {
    const isEdit = !!user;
    const u = user || {};
    const branches = await Storage.branches.getAll();

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
            ${isEdit ? '<span class="form-hint">El usuario no se puede cambiar</span>' : ''}
          </div>
        </div>
        ${!isEdit ? `
        <div class="form-group">
          <label class="form-label">Contraseña <span class="required">*</span></label>
          <input class="form-control" id="uf-password" type="password" placeholder="Mínimo 6 caracteres">
        </div>` : `
        <p style="font-size:.78rem;color:var(--text-muted)">La contraseña se cambia desde Supabase (Authentication → Users), no desde acá.</p>
        `}
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

  async function saveUser(existingId) {
    const name     = document.getElementById('uf-name')?.value.trim();
    const username = document.getElementById('uf-username')?.value.trim();
    const password = document.getElementById('uf-password')?.value;
    const role     = document.getElementById('uf-role')?.value || 'employee';
    const branchId = document.getElementById('uf-branch')?.value || null;

    if (!name) { Utils.showToast('El nombre es obligatorio', 'error'); return; }
    if (role !== 'admin' && !branchId) {
      Utils.showToast('Los usuarios con rol Empleado o Encargado necesitan una sucursal asignada', 'error');
      return;
    }

    try {
      if (existingId) {
        await Storage.users.update(existingId, { name, role, branchId: branchId || null });
        Utils.showToast('Usuario actualizado ✓', 'success');
      } else {
        if (!username) { Utils.showToast('El usuario es obligatorio', 'error'); return; }
        if (!password || password.length < 6) { Utils.showToast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }
        await Storage.users.add({ username, password, name, role, branchId: branchId || null });
        Utils.showToast('Usuario creado ✓', 'success');
      }
    } catch (err) {
      Utils.showToast(err.message || 'No se pudo guardar el usuario', 'error');
      return;
    }

    Utils.closeModal();
    await render();
  }

  async function toggleUser(userId) {
    const user = await Storage.users.getById(userId);
    if (!user) return;
    const session = Auth.getSession();
    if (user.id === session.userId) { Utils.showToast('No podés desactivar tu propio usuario', 'warning'); return; }
    await Storage.users.update(userId, { active: user.active === false ? true : false });
    Utils.showToast(`Usuario ${user.active === false ? 'activado' : 'desactivado'}`, 'success');
    await render();
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
          </div>
          <p style="font-size:.75rem;color:var(--text-muted);margin-top:.75rem">
            Exportá los datos de esta sucursal como backup de lectura. Restaurar datos se hace
            directamente en Supabase, no desde acá.
          </p>
        </div>
      </div>
    `;
  }

  function bindSystemTab(branchId, settings) {
    document.getElementById('btn-save-system')?.addEventListener('click', async () => {
      const footer    = document.getElementById('sys-footer')?.value.trim();
      const priceDays = parseInt(document.getElementById('sys-price-days')?.value || 90);
      const frac      = parseInt(document.getElementById('sys-hourly-frac')?.value || 15);
      const tol       = parseInt(document.getElementById('sys-hourly-tol')?.value || 0);
      const minM      = parseInt(document.getElementById('sys-hourly-min')?.value || 60);

      await Storage.settings.update(branchId, {
        receiptFooter: footer,
        priceAlertDays: priceDays,
        hourlyFractionMinutes: frac,
        hourlyToleranceMinutes: tol,
        hourlyMinMinutes: minM
      });
      Utils.showToast('Configuración guardada ✓', 'success');
    });

    document.getElementById('btn-export-data')?.addEventListener('click', exportData);
  }

  async function exportData() {
    const session = Auth.getSession();
    const [branches, clients, contracts, payments, prices, settings] = await Promise.all([
      Storage.branches.getAll(),                        // RLS: admin ve todas, empleado solo la suya
      Storage.clients.getAll(session.branchId),
      Storage.contracts.getAll(session.branchId),
      Storage.payments.getAll(session.branchId),
      Storage.prices.getAll(session.branchId),
      Storage.settings.get(session.branchId)
    ]);

    const data = {
      branches, clients, contracts, payments, prices, settings,
      _exportDate: new Date().toISOString(),
      _version: '2.0-supabase'
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `chiclana-parking-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Utils.showToast('Datos exportados ✓', 'success');
  }

  // ─── Branches tab ───────────────────────────────────────────────────────────

  async function renderBranchesTab() {
    const branches = await Storage.branches.getAll();
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
      btn.addEventListener('click', async () => {
        const branch = await Storage.branches.getById(btn.dataset.branchEdit);
        showBranchModal(branch);
      });
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

  async function saveBranch(existingId) {
    const name    = document.getElementById('bf-name')?.value.trim();
    const address = document.getElementById('bf-address')?.value.trim();
    const phone   = document.getElementById('bf-phone')?.value.trim();

    if (!name) { Utils.showToast('El nombre es obligatorio', 'error'); return; }

    if (existingId) {
      await Storage.branches.update(existingId, { name, address, phone });
      Utils.showToast('Sucursal actualizada ✓', 'success');
    } else {
      const floors = parseInt(document.getElementById('bf-floors')?.value || 3);
      const spots  = parseInt(document.getElementById('bf-spots')?.value || 17);

      const newBranch = await Storage.branches.add({ name, address, phone, totalFloors: floors, spotsPerFloor: spots });

      const spotsToCreate = [];
      for (let f = 1; f <= floors; f++) {
        for (let n = 1; n <= spots; n++) {
          spotsToCreate.push({
            branchId: newBranch.id, floor: f, number: n,
            label: `P${f}-${String(n).padStart(2,'0')}`, type: 'fixed', status: 'free'
          });
        }
      }
      await Promise.all(spotsToCreate.map(s => Storage.spots.add(s)));

      await Storage.prices.add({
        branchId: newBranch.id, monthlyFixed: 50000, monthlyMobile: 35000, daily: 5000,
        effectiveDate: new Date().toISOString().split('T')[0], notes: 'Precio inicial'
      });

      Utils.showToast('Sucursal creada ✓', 'success');
    }

    Utils.closeModal();
    await render();
  }

  return { render };
})();
