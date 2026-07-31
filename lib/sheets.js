'use strict';
const { google } = require('googleapis');
const { CONFIG, COLS, ESTADOS } = require('./config');
const { generateId, logInfo, logError, logWarn, horaAMinutos } = require('./utils');

// ── Autenticación Google Sheets API ──────────────────────────────
function _getAuthClient() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function _getSheets() {
  const auth = _getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

async function _getSheetData(sheetName) {
  const sheets = await _getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    range: sheetName,
  });
  return res.data.values || [];
}

async function _appendRow(sheetName, row) {
  const sheets = await _getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    range: sheetName,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}

async function _updateCell(sheetName, row, col, value) {
  const sheets = await _getSheets();
  // Convertir col (0-indexed) a letra de columna
  const colLetter = String.fromCharCode(65 + col);
  const range = `${sheetName}!${colLetter}${row}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  });
}

async function _updateRow(sheetName, rowIndex, values) {
  const sheets = await _getSheets();
  const colFin = String.fromCharCode(65 + values.length - 1);
  const range = `${sheetName}!A${rowIndex}:${colFin}${rowIndex}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

function _normalizarHora(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    return valor.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  return String(valor).trim();
}

// ── BARBEROS ─────────────────────────────────────────────────────

async function getBarbers() {
  const data = await _getSheetData(CONFIG.SHEET_BARBEROS);
  const barberos = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[COLS.BARBEROS.ID]) continue;
    if (String(row[COLS.BARBEROS.ACTIVO]).toLowerCase() === 'true') {
      barberos.push({ id: String(row[COLS.BARBEROS.ID]), nombre: String(row[COLS.BARBEROS.NOMBRE]) });
    }
  }
  logInfo('getBarbers: encontrados ' + barberos.length);
  return barberos;
}

async function getBarberById(barberId) {
  const data = await _getSheetData(CONFIG.SHEET_BARBEROS);
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row && String(row[COLS.BARBEROS.ID]) === String(barberId)) {
      return { id: String(row[COLS.BARBEROS.ID]), nombre: String(row[COLS.BARBEROS.NOMBRE]) };
    }
  }
  return null;
}

// ── HORARIOS ─────────────────────────────────────────────────────

async function getHorariosBarbero(barberId) {
  const data = await _getSheetData(CONFIG.SHEET_HORARIOS);
  const horarios = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const rowId = String(row[COLS.HORARIOS.BARBER_ID]).trim();
    const buscarId = String(barberId).trim();
    const coincide = rowId === buscarId ||
                     rowId === buscarId.replace('B', '') ||
                     'B' + rowId === buscarId;
    if (coincide) {
      horarios.push({
        dia:        String(row[COLS.HORARIOS.DIA] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
        horaInicio: _normalizarHora(row[COLS.HORARIOS.HORA_INICIO]),
        horaFin:    _normalizarHora(row[COLS.HORARIOS.HORA_FIN]),
      });
    }
  }
  return horarios;
}

async function getDiasLaboralesBarbero(barberId) {
  const horarios = await getHorariosBarbero(barberId);
  return horarios.map(h => h.dia);
}

async function getDescansosBarbero(barberId, diaSemana) {
  try {
    const data = await _getSheetData('Descansos');
    const descansos = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;
      const rowId = String(row[0]).trim();
      const buscarId = String(barberId).trim();
      const coincide = rowId === buscarId || rowId === buscarId.replace('B','') || 'B' + rowId === buscarId;
      const dia = String(row[1] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      if (coincide && dia === diaSemana) {
        descansos.push({
          inicio: horaAMinutos(_normalizarHora(row[2])),
          fin:    horaAMinutos(_normalizarHora(row[3])),
        });
      }
    }
    return descansos;
  } catch(e) {
    return [];
  }
}

// ── SERVICIOS ────────────────────────────────────────────────────

async function getServices(barberId) {
  const data = await _getSheetData(CONFIG.SHEET_SERVICIOS);
  const servicios = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const activo = String(row[COLS.SERVICIOS.ACTIVO]).toLowerCase() === 'true';
    const rowId = String(row[COLS.SERVICIOS.BARBER_ID]).trim();
    const buscarId = String(barberId).trim();
    const coincide = rowId === buscarId || rowId === buscarId.replace('B','') || 'B' + rowId === buscarId;
    if (coincide && activo) {
      servicios.push({
        id:       String(row[COLS.SERVICIOS.ID]),
        nombre:   String(row[COLS.SERVICIOS.NOMBRE]),
        duracion: parseInt(row[COLS.SERVICIOS.DURACION], 10),
      });
    }
  }
  logInfo('getServices barbero=' + barberId + ': ' + servicios.length);
  return servicios;
}

async function getServiceById(serviceId) {
  const data = await _getSheetData(CONFIG.SHEET_SERVICIOS);
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row && String(row[COLS.SERVICIOS.ID]) === String(serviceId)) {
      return {
        id:       String(row[COLS.SERVICIOS.ID]),
        nombre:   String(row[COLS.SERVICIOS.NOMBRE]),
        duracion: parseInt(row[COLS.SERVICIOS.DURACION], 10),
      };
    }
  }
  return null;
}

// ── CITAS ────────────────────────────────────────────────────────

async function getCitasBarberoFecha(barberId, fecha) {
  const data = await _getSheetData(CONFIG.SHEET_CITAS);
  const citas = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const estado = String(row[COLS.CITAS.ESTADO] || '').toLowerCase();
    const fechaCita = String(row[COLS.CITAS.FECHA] || '');
    const coincide = String(row[COLS.CITAS.BARBER_ID]) === String(barberId)
                  && fechaCita === String(fecha)
                  && (estado === 'confirmada' || estado === 'pendiente');
    if (coincide) {
      citas.push({
        horaInicio: _normalizarHora(row[COLS.CITAS.HORA_INICIO]),
        horaFin:    _normalizarHora(row[COLS.CITAS.HORA_FIN]),
      });
    }
  }
  return citas;
}

async function createAppointment(datos) {
  const id = generateId('CITA');
  const ahora = new Date().toISOString();
  await _appendRow(CONFIG.SHEET_CITAS, [
    id,
    datos.telefono,
    datos.nombreCliente || '',
    datos.barberId,
    datos.serviceId,
    datos.fecha,
    datos.horaInicio,
    datos.horaFin,
    'confirmada',
    ahora,
  ]);
  logInfo('Cita creada', { id });
  return id;
}

async function validateAvailability(barberId, fecha, horaInicio, horaFin) {
  const citas = await getCitasBarberoFecha(barberId, fecha);
  const inicio = horaAMinutos(horaInicio);
  const fin    = horaAMinutos(horaFin);
  for (const c of citas) {
    const cI = horaAMinutos(c.horaInicio);
    const cF = horaAMinutos(c.horaFin);
    if (inicio < cF && fin > cI) {
      logWarn('Slot no disponible', { barberId, fecha, horaInicio });
      return false;
    }
  }
  return true;
}

// ── SESIONES ─────────────────────────────────────────────────────

async function getSession(telefono) {
  const data = await _getSheetData(CONFIG.SHEET_SESIONES);
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || String(row[COLS.SESIONES.TELEFONO]) !== String(telefono)) continue;

    const rawFecha = row[COLS.SESIONES.ULTIMA_INTERACCION];
    const ultimaInteraccion = new Date(rawFecha);
    if (isNaN(ultimaInteraccion.getTime())) {
      await clearSession(telefono);
      return null;
    }

    if (Date.now() - ultimaInteraccion.getTime() > CONFIG.SESSION_TIMEOUT_MS) {
      await clearSession(telefono);
      logInfo('Sesión expirada para ' + telefono);
      return null;
    }

    let extra = {};
    try {
      const extraRaw = row[COLS.SESIONES.EXTRA];
      extra = extraRaw ? JSON.parse(String(extraRaw)) : {};
      if (typeof extra !== 'object' || extra === null) extra = {};
    } catch(e) {
      extra = {};
    }

    return {
      telefono:  String(row[COLS.SESIONES.TELEFONO]),
      estado:    String(row[COLS.SESIONES.ESTADO]),
      barberId:  String(row[COLS.SESIONES.BARBER_ID] || ''),
      serviceId: String(row[COLS.SESIONES.SERVICIO_ID] || ''),
      fecha:     String(row[COLS.SESIONES.FECHA] || ''),
      extra,
      _fila: i + 1,
    };
  }
  return null;
}

async function updateSession(telefono, datos) {
  const data = await _getSheetData(CONFIG.SHEET_SESIONES);
  const ahora = new Date().toISOString();
  const extra = datos.hasOwnProperty('extra') ? JSON.stringify(datos.extra || {}) : null;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || String(row[COLS.SESIONES.TELEFONO]) !== String(telefono)) continue;

    const fila = i + 1;
    const nuevaFila = [
      telefono,
      datos.hasOwnProperty('estado')    ? datos.estado    : (row[COLS.SESIONES.ESTADO]      || ''),
      datos.hasOwnProperty('barberId')   ? datos.barberId  : (row[COLS.SESIONES.BARBER_ID]   || ''),
      datos.hasOwnProperty('serviceId')  ? datos.serviceId : (row[COLS.SESIONES.SERVICIO_ID] || ''),
      datos.hasOwnProperty('fecha')      ? datos.fecha     : (row[COLS.SESIONES.FECHA]        || ''),
      ahora,
      extra !== null ? extra : (row[COLS.SESIONES.EXTRA] || '{}'),
    ];
    await _updateRow(CONFIG.SHEET_SESIONES, fila, nuevaFila);
    return;
  }

  // No existe → crear nueva fila
  await _appendRow(CONFIG.SHEET_SESIONES, [
    telefono,
    datos.estado    || ESTADOS.INICIO,
    datos.barberId  || '',
    datos.serviceId || '',
    datos.fecha     || '',
    ahora,
    extra !== null ? extra : '{}',
  ]);
}

async function clearSession(telefono) {
  const sheets = await _getSheets();
  const data = await _getSheetData(CONFIG.SHEET_SESIONES);

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || String(row[COLS.SESIONES.TELEFONO]) !== String(telefono)) continue;

    // Obtener el sheetId de la hoja Sesiones
    const meta = await sheets.spreadsheets.get({ spreadsheetId: CONFIG.SPREADSHEET_ID });
    const hoja = meta.data.sheets.find(s => s.properties.title === CONFIG.SHEET_SESIONES);
    if (!hoja) return;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: hoja.properties.sheetId,
              dimension: 'ROWS',
              startIndex: i,
              endIndex: i + 1,
            },
          },
        }],
      },
    });
    return;
  }
}

module.exports = {
  getBarbers, getBarberById,
  getHorariosBarbero, getDiasLaboralesBarbero, getDescansosBarbero,
  getServices, getServiceById,
  getCitasBarberoFecha, createAppointment, validateAvailability,
  getSession, updateSession, clearSession,
};
