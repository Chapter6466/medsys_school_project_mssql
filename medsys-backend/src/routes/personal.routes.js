// src/routes/personal.routes.js
const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// helper: ¿ID_Personal es IDENTITY?
async function isIdentityPersonal(pool) {
  const r = await pool.request().query(`
    SELECT CAST(COLUMNPROPERTY(OBJECT_ID('dbo.Personal'), 'ID_Personal', 'IsIdentity') AS INT) AS isIdentity
  `);
  return r.recordset[0] && r.recordset[0].isIdentity === 1;
}

function asDate(d) {
  try { return d ? new Date(d) : null; } catch { return null; }
}

// GET /api/personal
router.get('/', async (req, res) => {
  try {
    const rs = await (await getPool()).request().query(`
      SELECT
        ID_Personal AS id,
        Nombre,
        Rol,
        Turno,
        Correo,
        Telefono,
        FechaIngreso
      FROM dbo.Personal
      ORDER BY ID_Personal DESC
    `);
    res.json(rs.recordset);
  } catch (err) {
    console.error('PERSONAL GET ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// POST /api/personal
// body: { nombre, rol, turno, telefono, correo, fechaIngreso }
router.post('/', async (req, res) => {
  const { nombre, rol, turno, telefono, correo, fechaIngreso } = req.body || {};
  if (!nombre) return res.status(400).json({ ok:false, error:'Nombre es requerido' });

  try {
    const pool = await getPool();
    const identity = await isIdentityPersonal(pool);

    const rq = pool.request()
      .input('Nombre',  sql.VarChar(120), nombre)
      .input('Rol',     sql.VarChar(80),  rol || null)
      .input('Turno',   sql.VarChar(50),  turno || null)
      .input('Correo',  sql.VarChar(180), correo || null)
      .input('Telefono',sql.VarChar(40),  telefono || null)
      .input('Fecha',   sql.Date,         asDate(fechaIngreso));

    let q = `
      INSERT INTO dbo.Personal (Nombre, Rol, Turno, Correo, Telefono, FechaIngreso, Activo)
      OUTPUT INSERTED.ID_Personal AS id
      VALUES (@Nombre, @Rol, @Turno, @Correo, @Telefono, @Fecha, 1)
    `;

    if (!identity) {
      // fallback por si no es identity (raro, pero cubierto)
      const next = await pool.request().query(`SELECT ISNULL(MAX(ID_Personal),0)+1 AS nextId FROM dbo.Personal`);
      const id = next.recordset[0].nextId;
      await pool.request()
        .input('ID', sql.Int, id)
        .input('Nombre',  sql.VarChar(120), nombre)
        .input('Rol',     sql.VarChar(80),  rol || null)
        .input('Turno',   sql.VarChar(50),  turno || null)
        .input('Correo',  sql.VarChar(180), correo || null)
        .input('Telefono',sql.VarChar(40),  telefono || null)
        .input('Fecha',   sql.Date,         asDate(fechaIngreso))
        .query(`
          INSERT INTO dbo.Personal (ID_Personal, Nombre, Rol, Turno, Correo, Telefono, FechaIngreso, Activo)
          VALUES (@ID, @Nombre, @Rol, @Turno, @Correo, @Telefono, @Fecha, 1)
        `);
      return res.status(201).json({ ok:true, id });
    }

    const ins = await rq.query(q);
    const id = ins.recordset[0].id;
    res.status(201).json({ ok:true, id });
  } catch (err) {
    console.error('PERSONAL POST ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// PUT /api/personal/:id
// body opcional: { nombre, rol, turno, telefono, correo, fechaIngreso, activo }
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, rol, turno, telefono, correo, fechaIngreso, activo } = req.body || {};
  if (!Number.isFinite(id)) return res.status(400).json({ ok:false, error:'ID inválido' });

  try {
    const rq = (await getPool()).request()
      .input('id',       sql.Int,          id)
      .input('Nombre',   sql.VarChar(120), nombre ?? null)
      .input('Rol',      sql.VarChar(80),  rol ?? null)
      .input('Turno',    sql.VarChar(50),  turno ?? null)
      .input('Correo',   sql.VarChar(180), correo ?? null)
      .input('Telefono', sql.VarChar(40),  telefono ?? null)
      .input('Fecha',    sql.Date,         fechaIngreso !== undefined ? asDate(fechaIngreso) : null)
      .input('Activo',   sql.Bit,          typeof activo === 'boolean' ? (activo?1:0) : null);

    await rq.query(`
      UPDATE dbo.Personal SET
        Nombre       = COALESCE(@Nombre, Nombre),
        Rol          = COALESCE(@Rol, Rol),
        Turno        = COALESCE(@Turno, Turno),
        Correo       = COALESCE(@Correo, Correo),
        Telefono     = COALESCE(@Telefono, Telefono),
        FechaIngreso = COALESCE(@Fecha, FechaIngreso),
        Activo       = COALESCE(@Activo, Activo)
      WHERE ID_Personal = @id
    `);

    res.json({ ok:true });
  } catch (err) {
    console.error('PERSONAL PUT ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// DELETE /api/personal/:id
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok:false, error:'ID inválido' });

  try {
    await (await getPool()).request().input('id', sql.Int, id)
      .query('DELETE FROM dbo.Personal WHERE ID_Personal=@id');
    res.json({ ok:true });
  } catch (err) {
    console.error('PERSONAL DELETE ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

module.exports = router;