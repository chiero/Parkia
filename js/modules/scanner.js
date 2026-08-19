/**
 * Chiclana Parking — Scanner Module
 * Escaneo de patente por cámara (OCR en el navegador con Tesseract.js) + búsqueda de estado de cuenta
 */

const ScannerModule = (() => {

  const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js';

  let stream = null;
  let facingMode = 'environment';
  let tesseractLoadingPromise = null;

  // ─── Render ────────────────────────────────────────────────────────────────

  function render() {
    stopCamera();

    document.getElementById('scanner-body').innerHTML = `
      <div class="scanner-layout">

        <div class="scanner-camera-wrap" id="scanner-camera-wrap">
          <video id="scanner-video" autoplay playsinline muted></video>
          <div class="scanner-frame" aria-hidden="true"></div>
          <div class="scanner-overlay hidden" id="scanner-overlay">
            <div class="spinner" aria-hidden="true"></div>
            <span>Leyendo patente…</span>
          </div>
        </div>
        <canvas id="scanner-canvas" class="hidden" aria-hidden="true"></canvas>

        <div class="scanner-controls">
          <button class="btn btn-primary btn-lg" id="btn-scan-capture">📸 Capturar y leer</button>
          <button class="btn btn-secondary btn-icon" id="btn-scan-camera-toggle" title="Cambiar cámara" aria-label="Cambiar cámara">🔄</button>
        </div>

        <div class="form-group">
          <label class="form-label" for="scanner-plate-input">Patente detectada — revisá y corregí si hace falta</label>
          <input class="form-control" id="scanner-plate-input" placeholder="Ej: AB123CD"
                 style="text-transform:uppercase;font-weight:700;letter-spacing:.08em;font-size:1.1rem" autocomplete="off">
          <span class="form-hint">También podés escribir la patente manualmente sin usar la cámara.</span>
        </div>

        <button class="btn btn-success w-full" id="btn-scan-search" style="justify-content:center">🔍 Buscar en el sistema</button>

        <div id="scanner-result" aria-live="polite"></div>
      </div>
    `;

    const input = document.getElementById('scanner-plate-input');
    input.addEventListener('input', function() { this.value = this.value.toUpperCase(); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });

    document.getElementById('btn-scan-capture').addEventListener('click', captureAndRecognize);
    document.getElementById('btn-scan-camera-toggle').addEventListener('click', () => startCamera(true));
    document.getElementById('btn-scan-search').addEventListener('click', doSearch);

    startCamera(false);
  }

  function teardown() {
    stopCamera();
  }

  // ─── Camera ────────────────────────────────────────────────────────────────

  async function startCamera(toggleFacing) {
    if (toggleFacing) facingMode = facingMode === 'environment' ? 'user' : 'environment';
    stopCamera();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showCameraError('Este navegador no soporta acceso a la cámara. Probá con una versión actualizada de Chrome o Safari.');
      return;
    }
    if (!window.isSecureContext) {
      showCameraError('La cámara del celular solo funciona en una conexión segura (HTTPS) o en "localhost". Consultá con quien administra el sistema para habilitar acceso seguro.');
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      const video = document.getElementById('scanner-video');
      if (video) video.srcObject = stream;
    } catch (err) {
      showCameraError(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Se denegó el permiso de cámara. Habilitalo en la configuración del navegador para este sitio y volvé a intentar.'
          : err.name === 'NotFoundError'
          ? 'No se encontró ninguna cámara en este dispositivo.'
          : `No se pudo acceder a la cámara (${err.message || err.name}).`
      );
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  }

  function showCameraError(msg) {
    const wrap = document.getElementById('scanner-camera-wrap');
    if (wrap) wrap.innerHTML = `<div class="empty-state" style="padding:1.5rem 1rem">
      <div class="empty-icon">📷</div>
      <p>${Utils.escapeHtml(msg)}</p>
    </div>`;
  }

  // ─── OCR (Tesseract.js, cargado bajo demanda desde CDN) ─────────────────────

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (tesseractLoadingPromise) return tesseractLoadingPromise;
    tesseractLoadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TESSERACT_SRC;
      script.onload = () => resolve();
      script.onerror = () => { tesseractLoadingPromise = null; reject(new Error('No se pudo cargar el motor de reconocimiento (revisá tu conexión a internet)')); };
      document.head.appendChild(script);
    });
    return tesseractLoadingPromise;
  }

  async function captureAndRecognize() {
    const video   = document.getElementById('scanner-video');
    const canvas  = document.getElementById('scanner-canvas');
    const overlay = document.getElementById('scanner-overlay');
    if (!video || !video.videoWidth) { Utils.showToast('La cámara todavía no está lista', 'error'); return; }

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    overlay.classList.remove('hidden');
    try {
      await loadTesseract();
      const { data } = await Tesseract.recognize(canvas, 'eng', {
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      });
      const cleaned = normalizePlate(data.text);
      const input = document.getElementById('scanner-plate-input');
      if (cleaned) {
        input.value = cleaned;
        Utils.showToast('Patente leída — revisá que esté correcta antes de buscar', 'info');
        input.focus();
      } else {
        Utils.showToast('No se pudo leer la patente. Acercá más la cámara o escribila manualmente', 'warning');
      }
    } catch (err) {
      Utils.showToast(err.message || 'Error al leer la patente', 'error');
    } finally {
      overlay.classList.add('hidden');
    }
  }

  function normalizePlate(s) {
    return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  // ─── Búsqueda y resultado ────────────────────────────────────────────────

  async function doSearch() {
    const raw   = document.getElementById('scanner-plate-input')?.value || '';
    const plate = normalizePlate(raw);
    if (!plate) { Utils.showToast('Ingresá o escaneá una patente', 'error'); return; }

    const session = Auth.getSession();
    const clients = await Storage.clients.getAll(session.branchId);
    const client  = clients.find(c => normalizePlate(c.plate) === plate);

    const resultEl = document.getElementById('scanner-result');
    resultEl.innerHTML = client ? await buildFoundResult(client) : buildNotFoundResult(plate);
    await bindResultActions(client, plate);
  }

  function buildNotFoundResult(plate) {
    const canCreate = Auth.isManagerOrAbove();
    return `
      <div class="card" style="border-color:var(--warning)">
        <div class="card-body" style="text-align:center">
          <div style="font-size:2.5rem;margin-bottom:.5rem">🚫</div>
          <h3 style="font-size:1rem;margin-bottom:.3rem">Patente <strong>${Utils.escapeHtml(plate)}</strong> no registrada</h3>
          <p class="text-muted" style="font-size:.85rem;margin-bottom:1rem">Este vehículo no figura en el sistema para esta sucursal.</p>
          ${canCreate
            ? `<button class="btn btn-primary" id="btn-scan-new-client">+ Registrar cliente con esta patente</button>`
            : `<p class="text-muted" style="font-size:.78rem">Avisá a un encargado para registrarlo si corresponde.</p>`}
        </div>
      </div>`;
  }

  async function getRelevantContract(clientId) {
    const all       = await Storage.contracts.getByClient(clientId);
    const contracts = all.filter(c => c.active);
    return contracts.find(c => c.rentalType === 'hourly') || contracts[0] || null;
  }

  async function buildFoundResult(client) {
    const session  = Auth.getSession();
    const contract = await getRelevantContract(client.id);
    const name     = `${Utils.escapeHtml(client.firstName)} ${Utils.escapeHtml(client.lastName)}`;

    const [spot, settings, prices] = await Promise.all([
      contract ? Storage.spots.getById(contract.spotId) : Promise.resolve(null),
      Storage.settings.get(session.branchId),
      Storage.prices.getCurrent(session.branchId)
    ]);

    let statusBlock;

    if (!contract) {
      statusBlock = `
        <div class="alert-item alert-info">
          <span class="alert-icon">ℹ️</span>
          <div class="alert-body">
            <div class="alert-title">Sin contrato activo</div>
            <div class="alert-desc">El cliente está registrado pero no tiene un contrato vigente en este momento.</div>
          </div>
        </div>`;
    } else if (contract.rentalType === 'hourly') {
      const entry = new Date(contract.entryTime || contract.startDate || contract.createdAt);
      const fee   = Utils.calculateHourlyFee(entry, new Date(), contract.hourlyRate || prices?.hourly || 1500, settings);
      statusBlock = `
        <div class="alert-item alert-info">
          <span class="alert-icon">⏱️</span>
          <div class="alert-body">
            <div class="alert-title">Estacionado por hora — ${fee.formattedDuration}</div>
            <div class="alert-desc">Lugar ${spot ? spot.label : '—'} · Monto estimado: <strong>${Utils.formatCurrency(fee.totalAmount)}</strong></div>
          </div>
        </div>`;
    } else {
      const status = Utils.contractStatus(contract);
      const days   = Utils.daysDiff(contract.endDate);
      const isBad  = status === 'expired';
      const isSoon = status === 'expiring_soon' || status === 'expiring';
      const cls    = isBad ? 'alert-danger' : isSoon ? 'alert-warning' : 'alert-success';
      const icon   = isBad ? '⛔' : isSoon ? '⚠️' : '✅';
      const title  = isBad ? `En mora — vencido hace ${Math.abs(days)} día${Math.abs(days) !== 1 ? 's' : ''}`
                   : isSoon ? `Vence en ${days} día${days !== 1 ? 's' : ''}`
                   : 'Cuenta al día';
      statusBlock = `
        <div class="alert-item ${cls}">
          <span class="alert-icon">${icon}</span>
          <div class="alert-body">
            <div class="alert-title">${title}</div>
            <div class="alert-desc">${Utils.rentalTypeLabel(contract.rentalType)} · Lugar ${spot ? spot.label : '—'} · Vence ${Utils.formatDate(contract.endDate)} · ${Utils.formatCurrency(contract.price)}</div>
          </div>
        </div>`;
    }

    const canViewClient = Auth.isManagerOrAbove();

    return `
      <div class="card">
        <div class="card-body" style="display:flex;flex-direction:column;gap:1rem">
          <div style="display:flex;align-items:center;gap:1rem">
            <div class="avatar" style="width:48px;height:48px;font-size:1.1rem">${(client.firstName || 'C').charAt(0)}</div>
            <div>
              <div style="font-weight:700;font-size:1.05rem">${name}</div>
              <div style="font-size:.8rem;color:var(--text-secondary)">Patente <strong>${Utils.escapeHtml(client.plate || '—')}</strong> · Tel: ${Utils.escapeHtml(client.phone || '—')}</div>
            </div>
          </div>

          ${statusBlock}

          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            ${canViewClient ? `<button class="btn btn-secondary btn-sm" id="btn-scan-view-client">👁 Ver ficha del cliente</button>` : ''}
            ${spot ? `<button class="btn btn-secondary btn-sm" id="btn-scan-view-spot">🗺️ Ver lugar ${spot.label}</button>` : ''}
            ${contract && contract.rentalType !== 'hourly' ? `<button class="btn btn-success btn-sm" id="btn-scan-pay">💰 Registrar pago</button>` : ''}
          </div>
        </div>
      </div>`;
  }

  async function bindResultActions(client, plate) {
    const btnNewClient = document.getElementById('btn-scan-new-client');
    if (btnNewClient) btnNewClient.addEventListener('click', () => ClientsModule.showNewClientModal(plate));

    if (!client) return;

    const btnView = document.getElementById('btn-scan-view-client');
    if (btnView) btnView.addEventListener('click', () => ClientsModule.showClientDetail(client.id));

    const btnPay = document.getElementById('btn-scan-pay');
    if (btnPay) btnPay.addEventListener('click', () => PaymentsModule.showNewPaymentModal(client.id));

    const btnSpot = document.getElementById('btn-scan-view-spot');
    if (btnSpot) {
      const contract = await getRelevantContract(client.id);
      const spot = contract ? await Storage.spots.getById(contract.spotId) : null;
      if (spot) btnSpot.addEventListener('click', () => MapModule.showSpotModal(spot.id));
    }
  }

  return { render, teardown };
})();
