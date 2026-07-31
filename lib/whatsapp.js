'use strict';
const axios = require('axios');
const { CONFIG } = require('./config');
const { logInfo, logError, logWarn, labelFecha } = require('./utils');
const {
  getBarbers, getBarberById, getServices, getServiceById,
  getDiasLaboralesBarbero,
} = require('./sheets');
const { getAvailableSlots } = require('./availability');
const { getFechasDisponibles } = require('./utils');

// ── API base ──────────────────────────────────────────────────────

async function _llamarAPI(payload, intentos = 0) {
  const url = `${CONFIG.WHATSAPP_API_URL}/${CONFIG.PHONE_NUMBER_ID}/messages`;
  try {
    const res = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${CONFIG.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    logInfo('WhatsApp API OK', { to: payload.to, type: payload.type });
    return { exito: true, respuesta: res.data };
  } catch(e) {
    const msg = e.response ? JSON.stringify(e.response.data) : e.message;
    logError(`WhatsApp API error HTTP ${e.response?.status}`, { body: msg });
    if (intentos < 2) {
      await new Promise(r => setTimeout(r, 1500 * (intentos + 1)));
      return _llamarAPI(payload, intentos + 1);
    }
    return { exito: false, error: msg };
  }
}

// ── Mensajes simples ──────────────────────────────────────────────

async function sendWhatsAppMessage(telefono, texto) {
  return _llamarAPI({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefono,
    type: 'text',
    text: { preview_url: false, body: texto },
  });
}

// ── Lista interactiva ─────────────────────────────────────────────

async function sendInteractiveList(telefono, headerText, bodyText, footerText, buttonText, secciones) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefono,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: headerText },
      body: { text: bodyText },
      action: {
        button: buttonText,
        sections: secciones.map(sec => ({
          title: sec.titulo,
          rows: sec.items.map(item => ({
            id: String(item.id),
            title: String(item.titulo).substring(0, 24),
            description: item.descripcion ? String(item.descripcion).substring(0, 72) : '',
          })),
        })),
      },
    },
  };
  if (footerText) payload.interactive.footer = { text: footerText };
  return _llamarAPI(payload);
}

// ── Botones ───────────────────────────────────────────────────────

async function sendButtons(telefono, bodyText, botones, footerText) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefono,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: botones.slice(0, 3).map(b => ({
          type: 'reply',
          reply: {
            id: String(b.id),
            title: String(b.titulo).substring(0, 20),
          },
        })),
      },
    },
  };
  if (footerText) payload.interactive.footer = { text: footerText };
  return _llamarAPI(payload);
}

// ── Mensajes de negocio ───────────────────────────────────────────

async function enviarBarberos(telefono) {
  const barberos = await getBarbers();
  if (barberos.length === 0) {
    return sendWhatsAppMessage(telefono, '⚠️ No hay barberos disponibles en este momento.');
  }
  return sendInteractiveList(
    telefono,
    `💈 ${CONFIG.NOMBRE_BARBERIA}`,
    `¡Hola! Bienvenido a *${CONFIG.NOMBRE_BARBERIA}*.\n\nSelecciona con qué barbero deseas tu cita:`,
    'Responde seleccionando una opción',
    'Ver barberos',
    [{
      titulo: 'Barberos disponibles',
      items: barberos.map(b => ({ id: 'BARBERO_' + b.id, titulo: b.nombre, descripcion: '' })),
    }]
  );
}

async function enviarServicios(telefono, barberId) {
  const barbero   = await getBarberById(barberId);
  const servicios = await getServices(barberId);
  if (servicios.length === 0) {
    return sendWhatsAppMessage(telefono, '⚠️ Este barbero no tiene servicios disponibles. Escribe *hola* para reiniciar.');
  }
  return sendInteractiveList(
    telefono,
    '✂️ Servicios',
    `¿Qué servicio deseas con *${barbero ? barbero.nombre : 'el barbero'}*?`,
    '',
    'Ver servicios',
    [{
      titulo: 'Servicios disponibles',
      items: servicios.map(s => ({ id: 'SERVICIO_' + s.id, titulo: s.nombre, descripcion: s.duracion + ' minutos' })),
    }]
  );
}

async function enviarFechas(telefono, barberId) {
  const dias   = await getDiasLaboralesBarbero(barberId);
  const fechas = getFechasDisponibles(dias);
  if (fechas.length === 0) {
    return sendWhatsAppMessage(telefono, `⚠️ No hay fechas disponibles en los próximos ${CONFIG.DIAS_FUTURO_MAX} días. Escribe *hola* para reiniciar.`);
  }
  return sendInteractiveList(
    telefono,
    '📅 Fecha',
    '¿Qué día prefieres tu cita?',
    `Próximos ${CONFIG.DIAS_FUTURO_MAX} días`,
    'Ver fechas',
    [{
      titulo: 'Fechas disponibles',
      items: fechas.map(f => ({ id: 'FECHA_' + f, titulo: labelFecha(f), descripcion: f })),
    }]
  );
}

async function enviarHorarios(telefono, barberId, serviceId, fecha) {
  const slots = await getAvailableSlots(barberId, serviceId, fecha);
  if (slots.length === 0) {
    return sendButtons(
      telefono,
      '😔 No hay horarios disponibles para la fecha seleccionada.\n¿Qué deseas hacer?',
      [
        { id: 'CAMBIAR_FECHA', titulo: 'Elegir otra fecha' },
        { id: 'REINICIAR',    titulo: 'Empezar de nuevo' },
      ]
    );
  }
  const primeros = slots.slice(0, 10);
  return sendInteractiveList(
    telefono,
    '⏰ Horario',
    `¿A qué hora deseas tu cita el *${labelFecha(fecha)}*?`,
    slots.length > 10 ? 'Mostrando los primeros 10 horarios disponibles' : '',
    'Ver horarios',
    [{
      titulo: 'Horarios disponibles',
      items: primeros.map(s => ({
        id: `HORA_${s.horaInicio}_${s.horaFin}`,
        titulo: `${s.horaInicio} - ${s.horaFin}`,
        descripcion: '',
      })),
    }]
  );
}

async function enviarConfirmacion(telefono, sesion, servicio, barbero) {
  const texto = `📋 *Resumen de tu cita*\n\n`
    + `👤 Barbero: *${barbero ? barbero.nombre : 'N/A'}*\n`
    + `✂️ Servicio: *${servicio ? servicio.nombre : 'N/A'}*\n`
    + `📅 Fecha: *${labelFecha(sesion.fecha)}*\n`
    + `⏰ Hora: *${sesion.extra.horaInicio} - ${sesion.extra.horaFin}*\n\n`
    + `¿Confirmas tu cita?`;
  return sendButtons(
    telefono,
    texto,
    [
      { id: 'CONFIRMAR_SI', titulo: '✅ Confirmar' },
      { id: 'CONFIRMAR_NO', titulo: '❌ Cancelar' },
    ],
    CONFIG.NOMBRE_BARBERIA
  );
}

async function enviarCitaConfirmada(telefono, citaId, sesion, servicio, barbero) {
  const texto = `🎉 *¡Cita confirmada!*\n\n`
    + `🆔 ID: \`${citaId}\`\n`
    + `👤 Barbero: *${barbero ? barbero.nombre : ''}*\n`
    + `✂️ Servicio: *${servicio ? servicio.nombre : ''}*\n`
    + `📅 Fecha: *${labelFecha(sesion.fecha)}*\n`
    + `⏰ Hora: *${sesion.extra.horaInicio} - ${sesion.extra.horaFin}*\n\n`
    + `¡Te esperamos en *${CONFIG.NOMBRE_BARBERIA}*! 💈\n`
    + `_Guarda este mensaje como comprobante._`;
  return sendWhatsAppMessage(telefono, texto);
}

async function marcarLeido(telefono, messageId) {
  if (!messageId) return;
  try {
    await axios.post(
      `${CONFIG.WHATSAPP_API_URL}/${CONFIG.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      },
      { headers: { 'Authorization': `Bearer ${CONFIG.WHATSAPP_TOKEN}` } }
    );
  } catch(e) {
    logWarn('No se pudo marcar como leído', { error: e.message });
  }
}

module.exports = {
  sendWhatsAppMessage, sendInteractiveList, sendButtons,
  enviarBarberos, enviarServicios, enviarFechas,
  enviarHorarios, enviarConfirmacion, enviarCitaConfirmada,
  marcarLeido,
};
