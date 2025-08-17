require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression'); // std lib package, likely already present; safe fallback if not
const { getPool } = require('./src/db');

// Auth
const authRoutes = require('./src/routes/auth.routes');
const { authRequired, adminWritesOnly } = require('./src/middleware/auth');

// Rutas
const productos   = require('./src/routes/productos.routes');
const proveedores = require('./src/routes/proveedores.routes');
const personal    = require('./src/routes/personal.routes');
const rechazos    = require('./src/routes/rechazos.routes');
const materiales  = require('./src/routes/materiales.routes');
const ensambles   = require('./src/routes/ensambles.routes');
const ventas      = require('./src/routes/ventas.routes');
const auth        = require('./src/routes/auth.routes');

const app = express();

// -------- Config --------
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = String(process.env.NODE_ENV || 'development');
const CORS_ORIGIN = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : true; // true = any origin

// -------- Middlewares globales --------
app.disable('x-powered-by');
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(compression());

// -------- Healthcheck --------
app.get('/health', async (req, res) => {
  try {
    const pool = await getPool();
    const rs = await pool.request().query('SELECT 1 AS ok');
    res.json({ ok: true, db: rs.recordset?.[0]?.ok === 1 });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// -------- Auth (public) --------
app.use('/api/auth', authRoutes);

// -------- API protegida --------
// Everything under /api/* (except /api/auth/*) requires a valid token.
// Writes (POST/PUT/DELETE) require admin.
app.use('/api', authRequired, adminWritesOnly);

// -------- Montaje de rutas --------
app.use('/api/productos',   productos);
app.use('/api/proveedores', proveedores);
app.use('/api/personal',    personal);
app.use('/api/rechazos',    rechazos);
app.use('/api/materiales',  materiales);
app.use('/api/ensambles',   ensambles);
app.use('/api/ventas',      ventas);
app.use('/api/auth', auth);                                               


// 404 para rutas API no encontradas (solo bajo /api)
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'Endpoint no encontrado' });
});

// Manejador de errores (incluye JSON inválido)
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error('ERROR API:', err);
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ ok: false, error: 'JSON inválido en la solicitud' });
  }
  if (NODE_ENV === 'development') {
    return res.status(500).json({ ok: false, error: String(err), stack: err?.stack });
  }
  res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

// -------- Arranque del servidor --------
const server = app.listen(PORT, () => {
  console.log(`API Medsys escuchando en http://localhost:${PORT} (${NODE_ENV})`);
});

// -------- Señales de apagado gracioso --------
function shutdown(signal) {
  console.log(`\nRecibido ${signal}. Cerrando servidor…`);
  server.close(() => {
    console.log('Servidor cerrado.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
