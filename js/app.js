/**
 * Chiclana Parking — App Router & Main Controller
 */

const App = (() => {

  let session = null;

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    session = Auth.requireAuth();
    if (!session) return;

    Storage.initialize();
    setupUI();
    setupNavigation();
    setupMobileMenu();
    setupBranchSelector();
    navigate('dashboard');
    refreshBadges();

    // Refresh badges every 5 minutes
    setInterval(refreshBadges, 5 * 60 * 1000);
  }

  // ─── UI ────────────────────────────────────────────────────────────────────

  function setupUI() {
    // User info in sidebar
    const branch = Storage.branches.getById(session.branchId);
    document.getElementById('branch-name').textContent = branch ? branch.name : 'Cochera';
    document.getElementById('mobile-branch-name').textContent = branch ? branch.name : 'Cochera';
    document.getElementById('user-name').textContent   = session.name;
    document.getElementById('user-role').textContent   = Auth.ROLE_LABELS[session.role] || session.role;
    document.getElementById('user-avatar').textContent = (session.name || 'U').charAt(0).toUpperCase();

    // Hide admin sections for non-admins
    if (!Auth.isManagerOrAbove()) {
      document.getElementById('nav-prices').style.display  = 'none';
      document.getElementById('nav-reports').style.display = 'none';
      document.getElementById('nav-settings').style.display = 'none';
      document.getElementById('admin-section-label').style.display = 'none';
      document.getElementById('nav-clients').style.display = 'none';
    } else if (!Auth.isAdmin()) {
      document.getElementById('nav-settings').style.display = 'none';
    }

    document.getElementById('btn-logout').addEventListener('click', () => {
      Utils.confirm('¿Cerrar sesión?', () => Auth.logout(), null, false);
    });
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

  function navigate(viewId) {
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
    if (VIEW_INIT[viewId]) VIEW_INIT[viewId]();
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

  function setupBranchSelector() {
    if (!Auth.isAdmin()) return;
    const branches = Storage.branches.getAll();
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

    sel.addEventListener('change', () => {
      Auth.setBranch(sel.value);
      session = Auth.getSession();
      const branch = Storage.branches.getById(session.branchId);
      document.getElementById('branch-name').textContent = branch ? branch.name : 'Cochera';
      // Re-render current view
      const activeView = document.querySelector('.nav-item.active');
      if (activeView) navigate(activeView.dataset.view);
    });
  }

  // ─── Badges ────────────────────────────────────────────────────────────────

  function refreshBadges() {
    const s = Auth.getSession();
    if (!s) return;
    const contracts = Storage.contracts.getActive(s.branchId);
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

// Bootstrap
document.addEventListener('DOMContentLoaded', App.init);
