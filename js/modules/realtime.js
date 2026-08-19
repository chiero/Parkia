/**
 * Chiclana Parking — Realtime Module
 * Un canal por sucursal: cuando otro celular asigna/libera una plaza o
 * registra un pago, todas las pantallas abiertas se actualizan solas.
 */

const RealtimeModule = (() => {

  let channel = null;

  const isViewActive = id => document.getElementById(`view-${id}`)?.classList.contains('active');

  const debouncedMapRender       = Utils.debounce(() => isViewActive('map')       && MapModule.render(), 250);
  const debouncedDashboardRender = Utils.debounce(() => isViewActive('dashboard') && Dashboard.render(), 250);
  const debouncedPaymentsRender  = Utils.debounce(() => isViewActive('payments')  && PaymentsModule.render(), 250);
  const debouncedAlertsRender    = Utils.debounce(() => isViewActive('alerts')    && AlertsModule.render(), 250);

  function subscribe(branchId) {
    unsubscribe();
    if (!branchId) return;

    channel = supabaseClient.channel(`branch-${branchId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'spots', filter: `branch_id=eq.${branchId}` },
        () => { debouncedMapRender(); debouncedDashboardRender(); })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'contracts', filter: `branch_id=eq.${branchId}` },
        () => { debouncedMapRender(); debouncedDashboardRender(); debouncedAlertsRender(); App.refreshBadges(); })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'payments', filter: `branch_id=eq.${branchId}` },
        () => { debouncedPaymentsRender(); debouncedDashboardRender(); })
      .subscribe();
  }

  function unsubscribe() {
    if (channel) { supabaseClient.removeChannel(channel); channel = null; }
  }

  return { subscribe, unsubscribe };
})();
