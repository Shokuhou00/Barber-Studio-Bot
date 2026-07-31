'use strict';
const { CONFIG, DIAS_SEMANA } = require('./config');

function generateId(prefix) {
  prefix = prefix || 'ID';
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

function logInfo(msg, datos)  { _log('INFO',  msg, datos); }
function logError(msg, datos) { _log('ERROR', msg, datos); }
function logWarn(msg, datos)  { _log('WARN',  msg, datos); }

function _log(nivel, mensaje, datos) {
  const ts = new Date().toISOString();
  let linea = `[${ts}] [${nivel}] ${mensaje}`;
  if (datos) {
    try { linea += ' | ' + JSON.stringify(datos); } catch(e) {}
  }
  console.log(linea);
}

function horaAMinutos(horaStr) {
  if (!horaStr) return 0;
  const parts = String(horaStr).split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
}

function minutosAHora(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

function fechaToString(date) {
  // Formatea en timezone America/Bogota
  return date.toLocaleDateString('en-CA', { timeZone: CONFIG.TIMEZONE });
}

function stringToFecha(str) {
  const parts = str.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

function getDiaSemana(date) {
  // Usar timezone Bogotá para obtener el día correcto
  const diaN = parseInt(date.toLocaleDateString('en-US', { timeZone: CONFIG.TIMEZONE, weekday: 'short' }).slice(0,1));
  const nombreDia = date.toLocaleDateString('es-CO', { timeZone: CONFIG.TIMEZONE, weekday: 'long' });
  return nombreDia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function esFechaValida(str) {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const fecha = stringToFecha(str);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limFuturo = new Date(hoy);
  limFuturo.setDate(limFuturo.getDate() + CONFIG.DIAS_FUTURO_MAX);
  return fecha >= hoy && fecha <= limFuturo;
}

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'`\\]/g, '').trim().substring(0, 200);
}

function getFechasDisponibles(diasConHorario) {
  const fechas = [];
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  for (let i = 1; i <= CONFIG.DIAS_FUTURO_MAX; i++) {
    const d = new Date(hoy);
    d.setDate(d.getDate() + i);
    const diaNombre = getDiaSemana(d);
    if (diasConHorario.includes(diaNombre)) {
      fechas.push(fechaToString(d));
    }
    if (fechas.length >= 7) break;
  }
  return fechas;
}

function labelFecha(str) {
  const d = stringToFecha(str);
  const meses = ['enero','febrero','marzo','abril','mayo','junio',
                  'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const nombreDia = d.toLocaleDateString('es-CO', { timeZone: CONFIG.TIMEZONE, weekday: 'long' });
  const dia = nombreDia.charAt(0).toUpperCase() + nombreDia.slice(1);
  return `${dia} ${d.getDate()} de ${meses[d.getMonth()]}`;
}

function manejarError(e, contexto) {
  logError('Error en ' + (contexto || 'desconocido'), { mensaje: e.message });
  return '⚠️ Ocurrió un error inesperado. Por favor escribe *hola* para comenzar de nuevo.';
}

function minutosActuales() {
  const ahora = new Date();
  const horaStr = ahora.toLocaleTimeString('en-GB', { timeZone: CONFIG.TIMEZONE, hour: '2-digit', minute: '2-digit' });
  return horaAMinutos(horaStr);
}

module.exports = {
  generateId, logInfo, logError, logWarn,
  horaAMinutos, minutosAHora, fechaToString, stringToFecha,
  getDiaSemana, esFechaValida, sanitize,
  getFechasDisponibles, labelFecha, manejarError, minutosActuales,
};
