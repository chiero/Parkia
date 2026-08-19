/**
 * Chiclana Parking — Authentication Module
 * Usa Supabase Auth con un email sintético derivado del username
 * (el empleado sigue tipeando solo su "usuario", nunca un email real).
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

  const toEmail = (username) => `${username.trim().toLowerCase()}@parking.local`;

  // Sesión cacheada en memoria: Auth.getSession() sigue siendo síncrono porque
  // decenas de funciones en la app la leen en medio de código sin await.
  let cachedSession = null;
  let restorePromise = null;

  async function buildSessionFromUser(user) {
    const { data: profile, error } = await supabaseClient
      .from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error || !profile || !profile.active) return null;

    let branchId = profile.branch_id;
    if (!branchId) {
      const { data: branches } = await supabaseClient.from('branches').select('id').limit(1);
      branchId = branches?.[0]?.id || null;
    }

    return {
      userId: user.id,
      branchId,
      role: profile.role,
      name: profile.name,
      username: profile.username
    };
  }

  async function restoreSession() {
    if (restorePromise) return restorePromise;
    restorePromise = (async () => {
      const { data } = await supabaseClient.auth.getSession();
      cachedSession = data?.session?.user ? await buildSessionFromUser(data.session.user) : null;
      return cachedSession;
    })();
    return restorePromise;
  }

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') { cachedSession = null; return; }
    if (session?.user) cachedSession = await buildSessionFromUser(session.user);
  });

  async function login(username, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: toEmail(username), password
    });
    if (error) {
      const isNetwork = !navigator.onLine || /network|fetch|failed to fetch/i.test(error.message || '');
      return { success: false, error: isNetwork ? 'Sin conexión a internet. Intentá de nuevo cuando tengas señal.' : 'Usuario o contraseña incorrectos' };
    }

    const session = await buildSessionFromUser(data.user);
    if (!session) {
      await supabaseClient.auth.signOut();
      return { success: false, error: 'Usuario inactivo o sin perfil asociado. Contacte al administrador' };
    }
    if (!session.branchId) {
      await supabaseClient.auth.signOut();
      return { success: false, error: 'No hay sucursales configuradas' };
    }

    cachedSession = session;
    return { success: true, session };
  }

  async function logout() {
    if (typeof RealtimeModule !== 'undefined') RealtimeModule.unsubscribe();
    await supabaseClient.auth.signOut();
    cachedSession = null;
    window.location.href = 'index.html';
  }

  function getSession() {
    return cachedSession;
  }

  async function requireAuth() {
    if (!cachedSession) await restoreSession();
    if (!cachedSession) { window.location.href = 'index.html'; return null; }
    return cachedSession;
  }

  function can(permission) {
    if (!cachedSession) return false;
    const perms = PERMISSIONS[cachedSession.role] || [];
    return perms.includes('all') || perms.includes(permission);
  }

  function isAdmin()          { return cachedSession?.role === ROLES.ADMIN; }
  function isManagerOrAbove() { return [ROLES.ADMIN, ROLES.MANAGER].includes(cachedSession?.role); }

  // Solo cambia el branch "activo" en la sesión en memoria (uso del admin para
  // mirar otra sucursal); no persiste nada, cada login vuelve a resolver la
  // sucursal real del perfil.
  function setBranch(branchId) {
    if (cachedSession) cachedSession.branchId = branchId;
  }

  return {
    ROLES, ROLE_LABELS, PERMISSIONS,
    login, logout, getSession, requireAuth, restoreSession,
    can, isAdmin, isManagerOrAbove, setBranch
  };
})();
