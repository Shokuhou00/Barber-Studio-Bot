'use strict';
const { ESTADOS } = require('./config');
const { logInfo, logWarn, sanitize } = require('./utils');
const { getSession, updateSession, clearSession, getBarberById, getServiceById } = require('./sheets');
const { reservarSlotSeguro } = require('./availability');
const {
  sendWhatsAppMessage, sendButtons,
  enviarBarberos, enviarServicios, enviarFechas,
  enviarHorarios, enviarConfirmacion, enviarCitaConfirmada,
} = require('./whatsapp');

async function procesarMensaje(telefono, msgType, msgData) {
  logInfo('procesarMensaje', { telefono, tipo: msgType });

  const sesion = await getSession(telefono);

  let texto = '';
  let interactiveId = '';
  if (msgType === 'text') {
    texto = sanitize((msgData.body || '').toLowerCase().trim());
  } else if (msgType === 'interactive') {
    const tipo  = msgData.type;
    const reply = msgData[tipo] || {};
    interactiveId = sanitize(reply.id || '');
    texto = sanitize((reply.title || '').toLowerCase());
  }

  // Comando global: reiniciar
  if (['hola','menu','inicio','reiniciar'].includes(texto) || interactiveId === 'REINICIAR') {
    await clearSession(telefono);
    return _estado_INICIO(telefono);
  }

  if (!sesion) return _estado_INICIO(telefono);

  switch (sesion.estado) {
    case ESTADOS.ESPERANDO_BARBERO:
      return _estado_ESPERANDO_BARBERO(telefono, sesion, interactiveId);
    case ESTADOS.ESPERANDO_SERVICIO:
      return _estado_ESPERANDO_SERVICIO(telefono, sesion, interactiveId);
    case ESTADOS.ESPERANDO_FECHA:
      return _estado_ESPERANDO_FECHA(telefono, sesion, interactiveId);
    case ESTADOS.ESPERANDO_HORA:
      return _estado_ESPERANDO_HORA(telefono, sesion, interactiveId);
    case ESTADOS.CONFIRMACION:
      return _estado_CONFIRMACION(telefono, sesion, interactiveId);
    case ESTADOS.CITA_CONFIRMADA:
      return sendButtons(telefono, '✅ Ya tienes una cita agendada. ¿Deseas agendar otra?',
        [{ id: 'REINICIAR', titulo: 'Agendar otra cita' }]);
    default:
      await clearSession(telefono);
      return _estado_INICIO(telefono);
  }
}

async function _estado_INICIO(telefono) {
  await updateSession(telefono, { estado: ESTADOS.ESPERANDO_BARBERO });
  return enviarBarberos(telefono);
}

async function _estado_ESPERANDO_BARBERO(telefono, sesion, interactiveId) {
  if (!interactiveId || !interactiveId.startsWith('BARBERO_')) {
    return sendWhatsAppMessage(telefono, 'Por favor selecciona un barbero de la lista. Escribe *hola* para ver las opciones. 💈');
  }
  const barberId = interactiveId.replace('BARBERO_', '');
  const barbero  = await getBarberById(barberId);
  if (!barbero) return sendWhatsAppMessage(telefono, '⚠️ Barbero no encontrado. Escribe *hola* para reiniciar.');

  await updateSession(telefono, { estado: ESTADOS.ESPERANDO_SERVICIO, barberId, serviceId: '', fecha: '' });
  return enviarServicios(telefono, barberId);
}

async function _estado_ESPERANDO_SERVICIO(telefono, sesion, interactiveId) {
  if (!interactiveId || !interactiveId.startsWith('SERVICIO_')) {
    return sendWhatsAppMessage(telefono, 'Por favor selecciona un servicio de la lista. Escribe *hola* para reiniciar. ✂️');
  }
  const serviceId = interactiveId.replace('SERVICIO_', '');
  const servicio  = await getServiceById(serviceId);
  if (!servicio) return sendWhatsAppMessage(telefono, '⚠️ Servicio no encontrado. Escribe *hola* para reiniciar.');

  await updateSession(telefono, { estado: ESTADOS.ESPERANDO_FECHA, barberId: sesion.barberId, serviceId, fecha: '' });
  return enviarFechas(telefono, sesion.barberId);
}

async function _estado_ESPERANDO_FECHA(telefono, sesion, interactiveId) {
  if (!interactiveId || !interactiveId.startsWith('FECHA_')) {
    return sendWhatsAppMessage(telefono, 'Por favor selecciona una fecha de la lista. Escribe *hola* para reiniciar. 📅');
  }
  const fecha = interactiveId.replace('FECHA_', '');

  await updateSession(telefono, { estado: ESTADOS.ESPERANDO_HORA, barberId: sesion.barberId, serviceId: sesion.serviceId, fecha });
  return enviarHorarios(telefono, sesion.barberId, sesion.serviceId, fecha);
}

async function _estado_ESPERANDO_HORA(telefono, sesion, interactiveId) {
  if (interactiveId === 'CAMBIAR_FECHA') {
    await updateSession(telefono, { estado: ESTADOS.ESPERANDO_FECHA, barberId: sesion.barberId, serviceId: sesion.serviceId, fecha: '' });
    return enviarFechas(telefono, sesion.barberId);
  }
  if (!interactiveId || !interactiveId.startsWith('HORA_')) {
    return sendWhatsAppMessage(telefono, 'Por favor selecciona un horario de la lista. Escribe *hola* para reiniciar. ⏰');
  }

  const partes     = interactiveId.replace('HORA_', '').split('_');
  const horaInicio = partes[0] || '';
  const horaFin    = partes[1] || '';

  if (!horaInicio || !horaFin || !horaInicio.includes(':') || !horaFin.includes(':')) {
    return sendWhatsAppMessage(telefono, '⚠️ Horario inválido. Escribe *hola* para reiniciar.');
  }

  const extra = { ...(sesion.extra || {}), horaInicio, horaFin };
  await updateSession(telefono, {
    estado: ESTADOS.CONFIRMACION,
    barberId:  sesion.barberId,
    serviceId: sesion.serviceId,
    fecha:     sesion.fecha,
    extra,
  });

  const sesionActualizada = await getSession(telefono);
  if (!sesionActualizada) return sendWhatsAppMessage(telefono, '⚠️ Error al guardar selección. Escribe *hola* para reiniciar.');

  const servicio = await getServiceById(sesion.serviceId);
  const barbero  = await getBarberById(sesion.barberId);
  return enviarConfirmacion(telefono, sesionActualizada, servicio, barbero);
}

async function _estado_CONFIRMACION(telefono, sesion, interactiveId) {
  if (interactiveId === 'CONFIRMAR_SI') return _confirmarCita(telefono, sesion);
  if (interactiveId === 'CONFIRMAR_NO') {
    await clearSession(telefono);
    return sendWhatsAppMessage(telefono, '❌ Cita cancelada. Escribe *hola* cuando quieras agendar. 💈');
  }
  return sendWhatsAppMessage(telefono, 'Por favor confirma o cancela tu cita usando los botones. ✅❌');
}

async function _confirmarCita(telefono, sesion) {
  const extra = sesion.extra || {};

  if (!extra.horaInicio || !extra.horaFin) {
    logWarn('_confirmarCita: hora faltante', { extra: JSON.stringify(extra) });
    await clearSession(telefono);
    return sendWhatsAppMessage(telefono, '⚠️ Error con el horario seleccionado. Escribe *hola* para intentar de nuevo.');
  }

  if (!sesion.barberId || !sesion.serviceId || !sesion.fecha) {
    await clearSession(telefono);
    return sendWhatsAppMessage(telefono, '⚠️ Datos incompletos. Escribe *hola* para intentar de nuevo.');
  }

  const resultado = await reservarSlotSeguro({
    telefono,
    nombreCliente: extra.nombreCliente || '',
    barberId:  sesion.barberId,
    serviceId: sesion.serviceId,
    fecha:     sesion.fecha,
    horaInicio: extra.horaInicio,
    horaFin:    extra.horaFin,
  });

  if (!resultado.exito) {
    await clearSession(telefono);
    return sendWhatsAppMessage(telefono, resultado.mensaje + '\n\nEscribe *hola* para intentar de nuevo.');
  }

  await updateSession(telefono, {
    estado:    ESTADOS.CITA_CONFIRMADA,
    barberId:  sesion.barberId,
    serviceId: sesion.serviceId,
    fecha:     sesion.fecha,
    extra: { horaInicio: extra.horaInicio, horaFin: extra.horaFin, citaId: resultado.citaId },
  });

  const sesionFinal = await getSession(telefono);
  const servicio    = await getServiceById(sesion.serviceId);
  const barbero     = await getBarberById(sesion.barberId);
  return enviarCitaConfirmada(telefono, resultado.citaId, sesionFinal, servicio, barbero);
}

module.exports = { procesarMensaje };
