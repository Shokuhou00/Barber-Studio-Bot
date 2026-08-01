'use strict';
require('dotenv').config();
const { CONFIG } = require('../lib/config');
const { sanitize, logInfo, logError, logWarn } = require('../lib/utils');
const { procesarMensaje } = require('../lib/sessions');
const { marcarLeido } = require('../lib/whatsapp');
const { parse } = require('url');

// Helper para parsear body de la request
function parseBody(req) {
  return new Promise((resolve, reject) => {
    // Si ya viene parseado (algunos entornos lo hacen)
    if (req.body && typeof req.body === 'object') {
      return resolve(req.body);
    }
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch(e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  const { query } = parse(req.url, true);

  // ── GET: verificación del webhook con Meta ──────────────────────
  if (req.method === 'GET') {
    const mode      = query['hub.mode'];
    const token     = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    logInfo('doGet webhook verify', { mode, token: token ? '***' : 'FALTANTE' });

    if (mode === 'subscribe' && token === CONFIG.VERIFY_TOKEN) {
      logInfo('Webhook verificado por Meta');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
      return;
    }

    logWarn('Verificación fallida');
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // ── POST: mensajes entrantes de WhatsApp ────────────────────────
  if (req.method === 'POST') {
    // Responder 200 inmediatamente para que Meta no reenvíe
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');

    try {
      const body = await parseBody(req);
      logInfo('doPost body recibido', { object: body.object });

      if (!body || body.object !== 'whatsapp_business_account') return;

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
      logError('doPost error', { error: e.message, stack: e.stack });
    }
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
};

async function _procesarMensaje(msg) {
  const telefono = sanitize(msg.from || '');
  if (!telefono) return;

  const msgType = msg.type || '';
  let msgData = null;

  switch (msgType) {
    case 'text':
      msgData = msg.text || {};
      break;
    case 'interactive':
      msgData = msg.interactive || {};
      break;
    default:
      logWarn('Tipo de mensaje no manejado: ' + msgType);
      return;
  }

  logInfo('Mensaje entrante', { telefono, tipo: msgType, id: msg.id });
  await marcarLeido(telefono, msg.id);
  await procesarMensaje(telefono, msgType, msgData);
}
