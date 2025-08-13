require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getPool } = require('./src/db');

// Rutas
const productos   = require('./src/routes/productos.routes');
const proveedores = require('./src/routes/proveedores.routes');
const personal    = require('./src/routes/personal.routes');
const rechazos    = require('./src/routes/rechazos.routes');
const materiales  = require('./src/routes/materiales.routes'); 
const ensambles = require('./src/routes/ensambles.routes');
const ventas    = require('./src/routes/ventas.routes');

const app = express();

// -------- Middlewares globales --------
app.use(cors()); // Permite CORS desde el frontend
app.use(express.json({ limit: '1mb' })); // JSON body parser

// -------- Healthcheck DB --------
app.get('/health', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// -------- Montaje de rutas --------
app.use('/api/productos',   productos);
app.use('/api/proveedores', proveedores);
app.use('/api/personal',    personal);
app.use('/api/rechazos',    rechazos);
app.use('/api/materiales',  materiales);
app.use('/api/ensambles', ensambles);
app.use('/api/ventas',    ventas);

// 404 para rutas API no encontradas
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'Endpoint no encontrado' });
});

// Manejador de errores (incluye JSON inválido)
app.use((err, req, res, next) => {
  console.error('ERROR API:', err);
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ ok: false, error: 'JSON inválido en la solicitud' });
  }
  res.status(500).json({ ok: false, error: 'Error interno del servidor' });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`API Medsys escuchando en http://localhost:${PORT}`);
});
