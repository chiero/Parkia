/**
 * Chiclana Parking — Authentication Module
 */

const Auth = (() => {

  const ROLES = { ADMIN: 'admin', MANAGER: 'manager', EMPLOYEE: 'employee' };

  const ROLE_LABELS = { admin: 'Administrador', manager: 'Encargado', employee: 'Empleado' };

  // Qué puede hacer cada rol
  const PERMISSIONS = {
    admin:    ['all'],
    manager:  ['view_map','manage_clients','manage_contracts','manage_payments','view_alerts','view_reports','view_prices'],
    employee: ['view_map','register_payment','view_alerts']
  };

  function login(username, password) {
    const user = Storage.users.getByUsername(username.trim());
    if (!user)        return { success: false, error: 'Usuario no encontrado' };
    if (!user.active) return { success: false, error: 'Usuario inactivo. Contacte al administrador' };
    if (user.password !== password) return { success: false, error: 'Contraseña incorrecta' };

    // Determinar sucursal
    let branchId = user.branchId;
    if (!branchId) {
      const branches = Storage.branches.getAll();
      if (branches.length === 0) return { success: false, error: 'No hay sucursales configuradas' };
      branchId = branches[0].id;
    }

    const session = {
      userId: user.id,
      branchId,
      role: user.role,
      name: user.name,
      username: user.username
    };

    Storage.session.set(session);
    return { success: true, session };
  }

  function logout() {
    Storage.session.clear();
    window.location.href = 'index.html';
  }

  function getSession() {
    return Storage.session.get();
  }

  function requireAuth() {
    const session = getSession();
    if (!session) { window.location.href = 'index.html'; return null; }
    return session;
  }

  function can(permission) {
    const session = getSession();
    if (!session) return false;
    const perms = PERMISSIONS[session.role] || [];
    return perms.includes('all') || perms.includes(permission);
  }

  function isAdmin()          { return getSession()?.role === ROLES.ADMIN; }
  function isManagerOrAbove() { return [ROLES.ADMIN, ROLES.MANAGER].includes(getSession()?.role); }

  function setBranch(branchId) {
    const session = getSession();
    if (!session) return;
    session.branchId = branchId;
    Storage.session.set(session);
  }

  return { ROLES, ROLE_LABELS, PERMISSIONS, login, logout, getSession, requireAuth, can, isAdmin, isManagerOrAbove, setBranch };
})();
