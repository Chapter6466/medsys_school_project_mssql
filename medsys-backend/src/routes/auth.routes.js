// src/routes/auth.routes.js
// Simple demo auth:
// - Accepts any user with password "medsys"
// - Role = "admin" if username === "admin", otherwise "analyst"
// - If a matching person exists in dbo.Personal (by Correo or Nombre), attaches idPersonal

const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');
const { signToken } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  const { username = '', password = '' } = req.body || {};
  const uname = String(username).trim().toLowerCase();

  if (!uname || !password) {
    return res.status(400).json({ ok: false, error: 'Usuario y contraseña requeridos' });
  }

  // College-project simplicity: single shared password
  if (password !== 'medsys') {
    return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
  }

  // Resolve role from username (admin vs analyst)
  const role = (uname === 'admin') ? 'admin' : 'analyst';

  // Try to find idPersonal (optional)
  let idPersonal = null;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('u1', sql.VarChar(120), uname)
      .input('u2', sql.VarChar(120), uname)
      .query(`
        SELECT TOP 1 ID_Personal AS id
        FROM dbo.Personal
        WHERE LOWER(Correo) = @u1 OR LOWER(Nombre) = @u2
      `);
    idPersonal = r.recordset[0]?.id ?? null;
  } catch (_) {
    // swallow for demo – DB is optional here
  }

  const user = { username: uname, role, idPersonal };
  const token = signToken(user);

  return res.json({ ok: true, token, user });
});

// Quick token check / current user
router.get('/me', (req, res) => {
  // Frontend can store the token; just decoding is done in middleware in protected routes.
  // Here we just indicate the endpoint exists; the frontend can hit it if you later protect it.
  return res.json({ ok: true, info: 'Use protected endpoints to validate token.' });
});

module.exports = router;
