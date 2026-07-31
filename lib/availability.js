'use strict';
const { CONFIG } = require('./config');
const { logInfo, logError, logWarn, horaAMinutos, minutosAHora, getDiaSemana, stringToFecha, fechaToString, minutosActuales } = require('./utils');
const { getServiceById, getHorariosBarbero, getDescansosBarbero, getCitasBarberoFecha, validateAvailability, createAppointment } = require('./sheets');

async function getAvailableSlots(barberId, serviceId, fecha) {
  logInfo('getAvailableSlots', { barberId, serviceId, fecha });

  const servicio = await getServiceById(serviceId);
  if (!servicio) {
    logError('Servicio no encontrado: ' + serviceId);
    return [];
  }
  const duracionMin = servicio.duracion + CONFIG.BUFFER_MINUTOS;

  const diaSemana = getDiaSemana(stringToFecha(fecha));
  const horarios  = await getHorariosBarbero(barberId);
  const horarioDia = horarios.find(h => h.dia === diaSemana);
  if (!horarioDia) {
    logInfo('Barbero no trabaja ese día: ' + diaSemana);
    return [];
  }

  const apertura = horaAMinutos(horarioDia.horaInicio);
  const cierre   = horaAMinutos(horarioDia.horaFin);

  // Generar todos los slots posibles
  const todosSlots = [];
  for (let t = apertura; t + duracionMin <= cierre; t += CONFIG.SLOT_INTERVAL) {
    todosSlots.push({
      horaInicio: minutosAHora(t),
      horaFin:    minutosAHora(t + servicio.duracion),
      _inicioMin: t,
      _finMin:    t + duracionMin,
    });
  }

  // Citas existentes
  const citasExistentes = await getCitasBarberoFecha(barberId, fecha);
  const ocupados = citasExistentes.map(c => ({
    inicio: horaAMinutos(c.horaInicio),
    fin:    horaAMinutos(c.horaFin),
  }));

  // Descansos
  const descansos = await getDescansosBarbero(barberId, diaSemana);

  // Filtrar slots
  let slotsLibres = todosSlots.filter(slot => {
    for (const o of ocupados) {
      if (slot._inicioMin < o.fin && slot._finMin > o.inicio) return false;
    }
    for (const d of descansos) {
      if (slot._inicioMin < d.fin && slot._finMin > d.inicio) return false;
    }
    return true;
  });

  // Filtrar slots pasados si es hoy
  const hoyStr = fechaToString(new Date());
  if (fecha === hoyStr) {
    const ahoraMin = minutosActuales();
    slotsLibres = slotsLibres.filter(s => s._inicioMin > ahoraMin + 15);
  }

  return slotsLibres.map(s => ({ horaInicio: s.horaInicio, horaFin: s.horaFin }));
}

async function reservarSlotSeguro(datosCita) {
  try {
    const disponible = await validateAvailability(
      datosCita.barberId,
      datosCita.fecha,
      datosCita.horaInicio,
      datosCita.horaFin
    );
    if (!disponible) {
      return {
        exito: false,
        citaId: null,
        mensaje: '⚠️ Ese horario acaba de ser reservado. Por favor selecciona otro.',
      };
    }
    const citaId = await createAppointment(datosCita);
    return { exito: true, citaId, mensaje: 'Cita confirmada' };
  } catch(e) {
    logError('Error en reservarSlotSeguro', { error: e.message });
    return { exito: false, citaId: null, mensaje: '⚠️ Error al reservar. Escribe *hola* para reiniciar.' };
  }
}

module.exports = { getAvailableSlots, reservarSlotSeguro };
