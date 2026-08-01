'use strict';
require('dotenv').config();
const { CONFIG } = require('../lib/config');
const { sanitize, logInfo, logError, logWarn } = require('../lib/utils');
const { procesarMensaje } = require('../lib/sessions');
const { marcarLeido } = require('../lib/whatsapp');
const { parse } = require('url');

module.exports = async (req, res) => {
  const { query } = parse(req.url, true);

  // ── GET: verificación del webhook con Meta ──────────────────────
  if (req.method === 'GET') {
    const mode      = query['hub.mode'];
    const token     = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    logInfo('doGet', { mode, token: token ? '***' : 'FALTANTE' });

    if (mode === 'subscribe' && token === CONFIG.VERIFY_TOKEN) {
      logInfo('Webhook verificado por Meta');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
      return;
    }

    logWarn('Verificación fallida');
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // ── POST: mensajes entrantes ────────────────────────────────────
  if (req.method === 'POST') {
    // 1. Leer body completo primero
    let rawBody = '';
    await new Promise((resolve, reject) => {
      req.on('data', chunk => { rawBody += chunk.toString(); });
      req.on('end', resolve);
      req.on('error', reject);
    });

    // 2. Responder 200 OK inmediatamente
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');

    // 3. Procesar en background
    try {
      if (!rawBody) {
        logWarn('Body vacío');
        return;
      }

      const body = JSON.parse(rawBody);
      logInfo('POST recibido', { object: body.object, rawLen: rawBody.length });

      if (body.object !== 'whatsapp_business_account') return;

      const entries = body.entry || [];
      for (const entry of entries) {
        for (const change of (entry.changes || [])) {
          const value    = change.value || {};
          const mensajes = value.messages || [];
          for (const msg of mensajes) {
            await _procesarMensaje(msg);
          }
        }
      }
    } catch(e) {
      logError('Error procesando POST', { error: e.message, stack: e.stack });
    }
    return;
  }

  res.writeHead(405);
  res.end('Method Not Allowed');
};

async function _procesarMensaje(msg) {
  const telefono = sanitize(msg.from || '');
  if (!telefono) {
    logWarn('Mensaje sin teléfono');
    return;
  }

  const msgType = msg.type || '';
  logInfo('Mensaje entrante', { telefono, tipo: msgType, id: msg.id });

  let msgData = null;
  switch (msgType) {
    case 'text':
      msgData = msg.text || {};
      break;
    case 'interactive':
      msgData = msg.interactive || {};
      break;
    default:
      logWarn('Tipo no manejado: ' + msgType);
      return;
  }

  await marcarLeido(telefono, msg.id);
  await procesarMensaje(telefono, msgType, msgData);
}
