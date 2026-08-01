'use strict';
require('dotenv').config();
const { CONFIG } = require('../lib/config');
const { sanitize, logInfo, logError, logWarn } = require('../lib/utils');
const { procesarMensaje } = require('../lib/sessions');
const { marcarLeido } = require('../lib/whatsapp');

module.exports = async (req, res) => {
  // Parsear query params manualmente para manejar claves con puntos
  const url = require('url');
  const parsedUrl = url.parse(req.url, true);
  const query = parsedUrl.query || {};

  // ── GET: verificación del webhook con Meta ──────────────────────
  if (req.method === 'GET') {
    const mode      = query['hub.mode'];
    const token     = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    logInfo('doGet webhook verify', { mode, token: token ? '***' : 'FALTANTE' });

    if (mode === 'subscribe' && token === CONFIG.VERIFY_TOKEN) {
      logInfo('Webhook verificado por Meta');
      return res.status(200).send(challenge);
    }
    logWarn('Verificación fallida — token incorrecto o modo incorrecto');
    return res.status(403).send('Forbidden');
  }

  // ── POST: mensajes entrantes de WhatsApp ────────────────────────
  if (req.method === 'POST') {
    // Responder 200 inmediatamente para que Meta no reenvíe
    res.status(200).send('OK');

    try {
      const body = req.body;
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

  return res.status(405).send('Method Not Allowed');
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
