/**
 * Chiclana Parking — App Router & Main Controller
 */

const App = (() => {

  let session = null;

  // ─── Init ──────────────────────────────────────────────────────────────────

  async function init() {
    session = await Auth.requireAuth();
    if (!session) return;

    // Se ata primero y fuera de cualquier try/catch: si algo más abajo falla
    // (ej. un usuario sin sucursal asignada), siempre queda una forma de salir.
    bindLogout();

    try {
      await setupUI();
      setupNavigation();
      setupMobileMenu();
      setupOfflineBanner();
      await setupBranchSelector();
      await navigate('dashboard');
      await refreshBadges();

      if (typeof RealtimeModule !== 'undefined') RealtimeModule.subscribe(session.branchId);

      // Refresh badges every 5 minutes
      setInterval(refreshBadges, 5 * 60 * 1000);
    } catch (err) {
      console.error('Error al iniciar la app:', err);
      const main = document.getElementById('main-content');
      if (main) {
        main.innerHTML = `
          <div style="padding:3rem 1.5rem;text-align:center;max-width:480px;margin:0 auto">
            <p style="font-size:1rem;font-weight:700;color:var(--danger)">No se pudo cargar el sistema</p>
            <p style="color:var(--text-secondary);font-size:.85rem;margin-top:.6rem">${Utils.escapeHtml(err.message || 'Error desconocido')}</p>
            <p style="color:var(--text-muted);font-size:.78rem;margin-top:.9rem">
              Si el problema persiste, es probable que tu usuario no tenga una sucursal asignada.
              Contactá al administrador, o cerrá sesión con el botón de abajo a la izquierda.
            </p>
          </div>
        `;
      }
    }
  }

  function bindLogout() {
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      Utils.confirm('¿Cerrar sesión?', () => Auth.logout(), null, false);
    });
  }

  // ─── UI ────────────────────────────────────────────────────────────────────

  async function setupUI() {
    // User info in sidebar
    const branch = await Storage.branches.getById(session.branchId);
    document.getElementById('branch-name').textContent = branch ? branch.name : 'Cochera';
    document.getElementById('mobile-branch-name').textContent = branch ? branch.name : 'Cochera';
    document.getElementById('user-name').textContent   = session.name;
    document.getElementById('user-role').textContent   = Auth.ROLE_LABELS[session.role] || session.role;
    document.getElementById('user-avatar').textContent = (session.name || 'U').charAt(0).toUpperCase();

    // Hide admin sections for non-admins. Los "Encargado" sí ven Configuración
    // (solo la pestaña Usuarios, para gestionar el personal de su sucursal).
    if (!Auth.isManagerOrAbove()) {
      document.getElementById('nav-prices').style.display  = 'none';
      document.getElementById('nav-reports').style.display = 'none';
      document.getElementById('nav-settings').style.display = 'none';
      document.getElementById('admin-section-label').style.display = 'none';
      document.getElementById('nav-clients').style.display = 'none';
    }
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  const VIEW_INIT = {
    dashboard: () => Dashboard.render(),
    map:       () => MapModule.render(),
    scanner:   () => ScannerModule.render(),
    alerts:    () => AlertsModule.render(),
    clients:   () => ClientsModule.render(),
    payments:  () => PaymentsModule.render(),
    prices:    () => PricesModule.render(),
    reports:   () => ReportsModule.render(),
    settings:  () => SettingsModule.render()
  };

  // Views that need cleanup when navigating away (e.g. releasing the camera)
  const VIEW_TEARDOWN = {
    scanner: () => ScannerModule.teardown()
  };

  function setupNavigation() {
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', () => {
        navigate(item.dataset.view);
        closeMobileMenu();
      });
      // nav-item is a <div role="button">, not natively keyboard-activatable
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(item.dataset.view);
          closeMobileMenu();
        }
      });
    });

    document.getElementById('btn-map-refresh').addEventListener('click', () => MapModule.render());
    document.getElementById('btn-new-client').addEventListener('click', () => ClientsModule.showNewClientModal());
    document.getElementById('btn-new-payment').addEventListener('click', () => PaymentsModule.showNewPaymentModal());
  }

  async function navigate(viewId) {
    // Tear down the previously active view (e.g. stop the camera stream)
    const prevItem = document.querySelector('.nav-item.active');
    const prevView = prevItem ? prevItem.dataset.view : null;
    if (prevView && prevView !== viewId && VIEW_TEARDOWN[prevView]) VIEW_TEARDOWN[prevView]();

    // Show/hide views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(`view-${viewId}`);
    if (view) view.classList.add('active');

    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.remove('active');
      n.removeAttribute('aria-current');
    });
    const navItem = document.getElementById(`nav-${viewId}`);
    if (navItem) {
      navItem.classList.add('active');
      navItem.setAttribute('aria-current', 'page');
    }

    // Run view init
    if (VIEW_INIT[viewId]) await VIEW_INIT[viewId]();
  }

  // ─── Sin conexión ──────────────────────────────────────────────────────────

  function setupOfflineBanner() {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;
    const update = () => banner.classList.toggle('hidden', navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }

  // ─── Mobile menu ───────────────────────────────────────────────────────────

  function setupMobileMenu() {
    const toggle   = document.getElementById('btn-menu-toggle');
    const sidebar  = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    toggle.addEventListener('click', () => {
      const isOpen = sidebar.classList.toggle('open');
      backdrop.classList.toggle('show', isOpen);
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    backdrop.addEventListener('click', closeMobileMenu);
  }

  function closeMobileMenu() {
    const sidebar  = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const toggle   = document.getElementById('btn-menu-toggle');
    sidebar.classList.remove('open');
    backdrop.classList.remove('show');
    toggle.setAttribute('aria-expanded', 'false');
  }

  // ─── Branch selector (admin) ────────────────────────────────────────────────

  async function setupBranchSelector() {
    if (!Auth.isAdmin()) return;
    const branches = await Storage.branches.getAll();
    if (branches.length <= 1) return;

    const wrap = document.getElementById('branch-selector-wrap');
    const sel  = document.getElementById('branch-selector');
    wrap.style.display = '';

    branches.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.name;
      if (b.id === session.branchId) opt.selected = true;
      sel.appendChild(opt);
    });

    sel.addEventListener('change', async () => {
      Auth.setBranch(sel.value);
      session = Auth.getSession();
      const branch = await Storage.branches.getById(session.branchId);
      document.getElementById('branch-name').textContent = branch ? branch.name : 'Cochera';
      if (typeof RealtimeModule !== 'undefined') RealtimeModule.subscribe(session.branchId);
      // Re-render current view
      const activeView = document.querySelector('.nav-item.active');
      if (activeView) await navigate(activeView.dataset.view);
    });
  }

  // ─── Badges ────────────────────────────────────────────────────────────────

  async function refreshBadges() {
    const s = Auth.getSession();
    if (!s) return;
    const contracts = await Storage.contracts.getActive(s.branchId);
    const today = new Date();

    let alertCount = 0;
    contracts.forEach(c => {
      const days = Utils.daysDiff(c.endDate);
      if (days !== null && days <= 7) alertCount++;
    });

    const alertBadge = document.getElementById('nav-badge-alerts');
    if (alertCount > 0) {
      alertBadge.textContent = alertCount;
      alertBadge.classList.remove('hidden');
    } else {
      alertBadge.classList.add('hidden');
    }
  }

  // ─── Public ────────────────────────────────────────────────────────────────

  return { init, navigate, refreshBadges, getSession: () => session };
})();

// Red de seguridad: cualquier llamada a Storage.* que falle (sin conexión,
// error de Supabase) y no haya sido capturada localmente con try/catch cae
// acá, para nunca fallar en silencio.
window.addEventListener('unhandledrejection', e => {
  if (e.reason && e.reason.name === 'StorageError') {
    Utils.handleStorageError(e.reason);
    e.preventDefault();
  }
});

// Bootstrap
document.addEventListener('DOMContentLoaded', App.init);
