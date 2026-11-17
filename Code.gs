// Google Apps Script: configure the recipient, deploy as a web app, and use
// the deployment URL in index.html as GOOGLE_APPS_SCRIPT_URL.
const RECIPIENT_EMAIL = 'visonixro@gmail.com';

function doGet(e) {
  return handleOrderRequest_(e);
}

function doPost(e) {
  return handleOrderRequest_(e);
}

function handleOrderRequest_(e) {
  try {
    if (!e || !e.parameter || !e.parameter.payload) {
      throw new Error('Falta la información del pedido.');
    }

    const order = JSON.parse(e.parameter.payload);
    validateOrder_(order);

    const orderKey = Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, order.orderNumber)
    );
    const cache = CacheService.getScriptCache();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (cache.get(orderKey)) {
        return jsonResponse_({ ok: true, duplicate: true });
      }

      const itemLines = order.items.map((item) =>
        `${item.quantity} x ${item.name} — ${formatMoney_(item.unitPrice * item.quantity)}`
      );
      const total = order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const subject = `Nuevo pedido ${order.orderNumber} - Fragancia y Miel`;
      const body = [
        `Pedido: ${order.orderNumber}`,
        `Nombre: ${order.name}`,
        `Teléfono / WhatsApp: ${order.phone}`,
        `Correo: ${order.email || 'No proporcionado'}`,
        `Dirección o zona: ${order.address || 'No proporcionada'}`,
        '',
        'Productos:',
        ...itemLines,
        `Total estimado: ${formatMoney_(total)}`,
        '',
        `Nota: ${order.notes || 'Sin nota'}`,
      ].join('\n');
      const htmlItemLines = order.items.map((item) =>
        `<li>${item.quantity} x ${escapeHtml_(item.name)} — ${formatMoney_(item.unitPrice * item.quantity)}</li>`
      ).join('');
      const htmlBody = `
        <h2>Nuevo pedido ${escapeHtml_(order.orderNumber)}</h2>
        <p><strong>Nombre:</strong> ${escapeHtml_(order.name)}<br>
        <strong>Teléfono / WhatsApp:</strong> ${escapeHtml_(order.phone)}<br>
        <strong>Correo:</strong> ${escapeHtml_(order.email || 'No proporcionado')}<br>
        <strong>Dirección o zona:</strong> ${escapeHtml_(order.address || 'No proporcionada')}</p>
        <h3>Productos</h3>
        <ul>${htmlItemLines}</ul>
        <p><strong>Total estimado:</strong> ${formatMoney_(total)}</p>
        <p><strong>Nota:</strong> ${escapeHtml_(order.notes || 'Sin nota')}</p>
      `;

      MailApp.sendEmail({
        to: RECIPIENT_EMAIL,
        subject,
        body,
        htmlBody,
      });
      cache.put(orderKey, 'sent', 21600);
    } finally {
      lock.releaseLock();
    }

    return jsonResponse_({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok: false, error: error.message || 'No se pudo procesar el pedido.' });
  }
}

function validateOrder_(order) {
  if (!order || typeof order !== 'object') throw new Error('Pedido no válido.');
  ['orderNumber', 'name', 'phone'].forEach((field) => {
    if (typeof order[field] !== 'string' || !order[field].trim()) {
      throw new Error(`Falta el campo ${field}.`);
    }
  });
  if (order.items && Array.isArray(order.items) && order.items.length > 0 && order.items.length <= 50) {
    order.items.forEach((item) => {
      if (!item || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 200
          || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99
          || typeof item.unitPrice !== 'number' || !Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
        throw new Error('La lista de productos no es válida.');
      }
    });
  } else {
    throw new Error('El pedido debe incluir entre 1 y 50 productos.');
  }
  const fieldLimits = {
    orderNumber: 100,
    name: 120,
    phone: 40,
    email: 254,
    address: 500,
    notes: 1000,
  };
  Object.keys(fieldLimits).forEach((field) => {
    if (order[field] != null && (typeof order[field] !== 'string' || order[field].length > fieldLimits[field])) {
      throw new Error(`El campo ${field} no es válido.`);
    }
  });
}

function escapeHtml_(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function formatMoney_(amount) {
  return `L ${amount.toFixed(2)}`;
}

function jsonResponse_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
