'use strict';
require('dotenv').config();

const CONFIG = {
  // Meta / WhatsApp Cloud API
  WHATSAPP_TOKEN:   process.env.WHATSAPP_TOKEN,
  VERIFY_TOKEN:     process.env.VERIFY_TOKEN,
  PHONE_NUMBER_ID:  process.env.PHONE_NUMBER_ID,
  WHATSAPP_API_URL: 'https://graph.facebook.com/v21.0',

  // Google Sheets
  SPREADSHEET_ID:   process.env.SPREADSHEET_ID,
  SHEET_BARBEROS:   'Barberos',
  SHEET_HORARIOS:   'Horarios',
  SHEET_SERVICIOS:  'Servicios',
  SHEET_CITAS:      'Citas',
  SHEET_SESIONES:   'Sesiones',
  SHEET_LOGS:       'logs',

  // Negocio
  NOMBRE_BARBERIA:  'Barber Studio',
  TIMEZONE:         'America/Bogota',
  SLOT_INTERVAL:    30,
  BUFFER_MINUTOS:   0,
  DIAS_FUTURO_MAX:  14,

  // Sesiones
  SESSION_TIMEOUT_MS: 24 * 60 * 60 * 1000, // 24 horas
};

const ESTADOS = {
  INICIO:             'INICIO',
  ESPERANDO_BARBERO:  'ESPERANDO_BARBERO',
  ESPERANDO_SERVICIO: 'ESPERANDO_SERVICIO',
  ESPERANDO_FECHA:    'ESPERANDO_FECHA',
  ESPERANDO_HORA:     'ESPERANDO_HORA',
  CONFIRMACION:       'CONFIRMACION',
  CITA_CONFIRMADA:    'CITA_CONFIRMADA',
  ERROR:              'ERROR',
};

const DIAS_SEMANA = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];

const COLS = {
  BARBEROS:  { ID: 0, NOMBRE: 1, ACTIVO: 2 },
  HORARIOS:  { BARBER_ID: 0, DIA: 1, HORA_INICIO: 2, HORA_FIN: 3 },
  SERVICIOS: { ID: 0, BARBER_ID: 1, NOMBRE: 2, DURACION: 3, ACTIVO: 4 },
  CITAS: {
    ID: 0, TELEFONO: 1, NOMBRE_CLIENTE: 2, BARBER_ID: 3,
    SERVICIO_ID: 4, FECHA: 5, HORA_INICIO: 6, HORA_FIN: 7,
    ESTADO: 8, FECHA_CREACION: 9,
  },
  SESIONES: {
    TELEFONO: 0, ESTADO: 1, BARBER_ID: 2, SERVICIO_ID: 3,
    FECHA: 4, ULTIMA_INTERACCION: 5, EXTRA: 6,
  },
};

module.exports = { CONFIG, ESTADOS, DIAS_SEMANA, COLS };
