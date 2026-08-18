/**
 * Chiclana Parking — Utilities
 */

const Utils = (() => {

  // ─── Dates ────────────────────────────────────────────────────────────────

  function formatDate(date) {
    if (!date) return '—';
    const d = typeof date === 'string' ? new Date(date + (date.includes('T') ? '' : 'T00:00:00')) : date;
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function formatDateLong(date) {
    if (!date) return '—';
    const d = typeof date === 'string' ? new Date(date + (date.includes('T') ? '' : 'T00:00:00')) : date;
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function toInputDate(date) {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date + (date.includes('T') ? '' : 'T00:00:00')) : date;
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  }

  function daysDiff(dateStr, from = new Date()) {
    if (!dateStr) return null;
    const target = new Date(dateStr + 'T23:59:59');
    const origin = typeof from === 'string' ? new Date(from) : from;
    return Math.ceil((target - origin) / (1000 * 60 * 60 * 24));
  }

  function addMonths(date, months) {
    const d = new Date(typeof date === 'string' ? date : date);
    d.setMonth(d.getMonth() + months);
    return d;
  }

  function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  // ─── Money ────────────────────────────────────────────────────────────────

  function formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '—';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency', currency: 'ARS',
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(amount);
  }

  // ─── Phone / WhatsApp ─────────────────────────────────────────────────────

  function normalizePhone(phone) {
    if (!phone) return '';
    const c = phone.replace(/\D/g, '');
    if (c.startsWith('549')) return c;
    if (c.startsWith('54'))  return '549' + c.slice(2);
    if (c.startsWith('0'))   return '549' + c.slice(1);
    return '549' + c;
  }

  function whatsappUrl(phone, message) {
    return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
  }

  // ─── Contract helpers ────────────────────────────────────────────────────

  function contractStatus(contract) {
    if (!contract || !contract.active) return 'inactive';
    const days = daysDiff(contract.endDate);
    if (days === null)  return 'inactive';
    if (days < 0)       return 'expired';
    if (days <= 3)      return 'expiring_soon';
    if (days <= 7)      return 'expiring';
    return 'active';
  }

  const STATUS_MAP = {
    active:        { label: 'Al día',        cls: 'badge-success' },
    expiring_soon: { label: 'Vence en ≤3 días', cls: 'badge-danger' },
    expiring:      { label: 'Vence pronto',  cls: 'badge-warning' },
    expired:       { label: 'Vencido',       cls: 'badge-danger' },
    inactive:      { label: 'Inactivo',      cls: 'badge-muted' }
  };

  function statusBadge(status) {
    const s = STATUS_MAP[status] || { label: status, cls: 'badge-muted' };
    return `<span class="badge ${s.cls}">${s.label}</span>`;
  }

  function rentalTypeLabel(type) {
    return type === 'fixed' ? 'Fijo' : type === 'mobile' ? 'Móvil' : type === 'hourly' ? 'Por Hora' : 'Por día';
  }

  function periodLabel(period) {
    return period === 'monthly' ? 'Mensual' : period === 'hourly' ? 'Por hora' : 'Diario';
  }

  function methodLabel(method) {
    const m = { cash: 'Efectivo', transfer: 'Transferencia', other: 'Otro' };
    return m[method] || method;
  }

  // ─── Hourly calculation ──────────────────────────────────────────────────

  function formatDuration(minutes) {
    if (minutes === null || minutes === undefined || isNaN(minutes) || minutes < 0) return '0 min';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs === 0) return `${mins} min`;
    if (mins === 0) return `${hrs} h`;
    return `${hrs} h ${mins} min`;
  }

  function calculateHourlyFee(entryTime, exitTime = new Date(), hourlyRate = 1500, settings = {}) {
    const entry = typeof entryTime === 'string' ? new Date(entryTime) : entryTime;
    const exit  = typeof exitTime === 'string' ? new Date(exitTime) : exitTime;

    if (!entry || isNaN(entry.getTime())) {
      return { totalMinutes: 0, formattedDuration: '0 min', billableMinutes: 0, fractionsBilled: 0, hourlyRate, totalAmount: 0 };
    }

    const diffMs = Math.max(0, exit.getTime() - entry.getTime());
    const totalMinutes = Math.max(1, Math.ceil(diffMs / 60000));

    const tolerance      = parseInt(settings.hourlyToleranceMinutes ?? 5);
    const fractionMins   = parseInt(settings.hourlyFractionMinutes ?? 15);
    const minMins        = parseInt(settings.hourlyMinMinutes ?? 60);
    const rate           = parseFloat(hourlyRate || 0);

    // Initial base charge for minMins (e.g. 60 min = 1 hour rate)
    const baseHours = minMins / 60;
    const baseCharge = Math.round(rate * baseHours);

    if (totalMinutes <= minMins + tolerance) {
      return {
        totalMinutes,
        formattedDuration: formatDuration(totalMinutes),
        billableMinutes: minMins,
        fractionsBilled: 0,
        hourlyRate: rate,
        fractionMinutes: fractionMins,
        totalAmount: baseCharge
      };
    }

    // Minutes beyond the base minimum
    const extraMinutes = totalMinutes - minMins;

    // Apply tolerance to extra minutes
    const effectiveExtra = extraMinutes > tolerance ? extraMinutes : 0;
    const fractionsCount = Math.ceil(effectiveExtra / fractionMins);
    const pricePerFraction = (rate * (fractionMins / 60));
    const extraCharge = Math.round(fractionsCount * pricePerFraction);

    const totalAmount = baseCharge + extraCharge;
    const billableMinutes = minMins + (fractionsCount * fractionMins);

    return {
      totalMinutes,
      formattedDuration: formatDuration(totalMinutes),
      billableMinutes,
      fractionsBilled: fractionsCount,
      fractionMinutes: fractionMins,
      hourlyRate: rate,
      totalAmount
    };
  }

  // ─── Toast ────────────────────────────────────────────────────────────────

  function showToast(message, type = 'success', duration = 3500) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    t.innerHTML = `<span class="toast-icon" aria-hidden="true">${icons[type] || 'ℹ'}</span><span>${message}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, duration);
  }

  // ─── Modal ────────────────────────────────────────────────────────────────

  let modalLastFocusedEl = null;
  let modalKeydownHandler = null;

  function showModal(title, content, actions = [], size = '') {
    closeModal();
    modalLastFocusedEl = document.activeElement;

    const titleId = `modal-title-${Date.now()}`;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
        <div class="modal-header">
          <h3 class="modal-title" id="${titleId}">${title}</h3>
          <button class="modal-close" aria-label="Cerrar">✕</button>
        </div>
        <div class="modal-body">${content}</div>
        ${actions.length ? `<div class="modal-footer">${actions.map(a =>
          `<button class="btn ${a.cls||'btn-secondary'}" data-action="${a.id||''}">${a.label}</button>`
        ).join('')}</div>` : ''}
      </div>`;

    ov.querySelector('.modal-close').onclick = closeModal;
    ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });

    actions.forEach(a => {
      if (a.id && a.handler) {
        const btn = ov.querySelector(`[data-action="${a.id}"]`);
        if (btn) btn.addEventListener('click', () => {
          a.handler();
          if (a.close !== false) closeModal();
        });
      }
    });

    modalKeydownHandler = e => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', modalKeydownHandler);

    document.body.appendChild(ov);
    requestAnimationFrame(() => {
      ov.classList.add('show');
      const focusTarget = ov.querySelector('input, select, textarea, button');
      if (focusTarget) focusTarget.focus();
    });
    return ov;
  }

  function closeModal() {
    const ov = document.querySelector('.modal-overlay');
    if (!ov) return;
    ov.classList.remove('show');
    if (modalKeydownHandler) { document.removeEventListener('keydown', modalKeydownHandler); modalKeydownHandler = null; }
    setTimeout(() => {
      ov.remove();
      if (modalLastFocusedEl && typeof modalLastFocusedEl.focus === 'function') modalLastFocusedEl.focus();
      modalLastFocusedEl = null;
    }, 250);
  }

  function confirm(message, onConfirm, onCancel, danger = true) {
    showModal('Confirmar acción', `<p style="margin:0">${message}</p>`, [
      { id: 'ok', label: 'Confirmar', cls: danger ? 'btn-danger' : 'btn-primary', handler: onConfirm || (() => {}) },
      { id: 'cancel', label: 'Cancelar', cls: 'btn-secondary', handler: onCancel || (() => {}) }
    ]);
  }

  // ─── String helpers ──────────────────────────────────────────────────────

  function truncate(s, n = 28) { return s && s.length > n ? s.slice(0, n) + '…' : (s || ''); }
  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ''; }
  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function debounce(fn, ms = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ─── Receipt number ──────────────────────────────────────────────────────

  function formatReceiptNumber(n) { return `REC-${String(n).padStart(6, '0')}`; }

  return {
    formatDate, formatDateLong, toInputDate, daysDiff, addMonths, addDays,
    formatCurrency, normalizePhone, whatsappUrl,
    contractStatus, statusBadge, rentalTypeLabel, periodLabel, methodLabel,
    formatDuration, calculateHourlyFee,
    showToast, showModal, closeModal, confirm,
    truncate, capitalize, escapeHtml, debounce, formatReceiptNumber
  };
})();
