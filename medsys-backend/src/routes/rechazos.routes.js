// src/routes/rechazos.routes.js
// Rechazos: compatible con tablas donde ID_Rechazo ES o NO ES IDENTITY
const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Helper: ¿ID_Rechazo es IDENTITY?
async function isIdentityRechazo(pool) {
  const meta = await pool.request().query(`
    SELECT CAST(COLUMNPROPERTY(OBJECT_ID('dbo.Rechazo'),'ID_Rechazo','IsIdentity') AS INT) AS isIdentity
  `);
  return meta.recordset[0]?.isIdentity === 1;
}

// GET /api/rechazos
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const rs = await pool.request().query(`
      SELECT
        r.ID_Rechazo        AS id,
        r.ID_DispositivoMed AS ID_DispositivoMed,
        d.Nombre            AS Dispositivo,
        r.Causa,
        r.Cantidad,
        r.Fecha
      FROM dbo.Rechazo r
      LEFT JOIN dbo.Dispositivo_Medico d
        ON d.ID_DispositivoMed = r.ID_DispositivoMed
      ORDER BY r.ID_Rechazo DESC
    `);
    res.json(rs.recordset);
  } catch (err) {
    console.error('RECHAZOS GET ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// POST /api/rechazos
// Body: { idDispositivo, causa, cantidad, fecha }
router.post('/', async (req, res) => {
  const { idDispositivo, causa, cantidad, fecha } = req.body || {};
  try {
    const pool = await getPool();
    const identity = await isIdentityRechazo(pool);

    if (identity) {
      // Si ID_Rechazo es IDENTITY -> no insertar el ID explícitamente
      const ins = await pool.request()
        .input('idDisp', sql.Int, Number(idDispositivo || 0))
        .input('causa',  sql.VarChar(100), causa || '')
        .input('cant',   sql.Int, Number(cantidad || 0))
        .input('fecha',  sql.DateTime2, fecha ? new Date(fecha) : new Date())
        .query(`
          INSERT INTO dbo.Rechazo (ID_DispositivoMed, Causa, Cantidad, Fecha)
          OUTPUT INSERTED.ID_Rechazo AS id
          VALUES (@idDisp, @causa, @cant, @fecha)
        `);
      const id = ins.recordset[0].id;
      return res.status(201).json({ ok:true, id });
    } else {
      // Si NO es IDENTITY -> calculamos MAX+1
      const next = await pool.request().query(`SELECT ISNULL(MAX(ID_Rechazo),0)+1 AS nextId FROM dbo.Rechazo`);
      const id = next.recordset[0].nextId;

      await pool.request()
        .input('id',     sql.Int, id)
        .input('idDisp', sql.Int, Number(idDispositivo || 0))
        .input('causa',  sql.VarChar(100), causa || '')
        .input('cant',   sql.Int, Number(cantidad || 0))
        .input('fecha',  sql.DateTime2, fecha ? new Date(fecha) : new Date())
        .query(`
          INSERT INTO dbo.Rechazo (ID_Rechazo, ID_DispositivoMed, Causa, Cantidad, Fecha)
          VALUES (@id, @idDisp, @causa, @cant, @fecha)
        `);
      return res.status(201).json({ ok:true, id });
    }
  } catch (err) {
    console.error('RECHAZOS POST ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// PUT /api/rechazos/:id
// Body: { idDispositivo, causa, cantidad, fecha }
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { idDispositivo, causa, cantidad, fecha } = req.body || {};
  try {
    const pool = await getPool();
    await pool.request()
      .input('id',     sql.Int, id)
      .input('idDisp', sql.Int, Number(idDispositivo || 0))
      .input('causa',  sql.VarChar(100), causa || '')
      .input('cant',   sql.Int, Number(cantidad || 0))
      .input('fecha',  sql.DateTime2, fecha ? new Date(fecha) : new Date())
      .query(`
        UPDATE dbo.Rechazo
           SET ID_DispositivoMed = @idDisp,
               Causa             = @causa,
               Cantidad          = @cant,
               Fecha             = @fecha
         WHERE ID_Rechazo = @id
      `);

    res.json({ ok:true });
  } catch (err) {
    console.error('RECHAZOS PUT ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// DELETE /api/rechazos/:id
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, id)
      .query(`DELETE FROM dbo.Rechazo WHERE ID_Rechazo = @id`);
    res.json({ ok:true });
  } catch (err) {
    console.error('RECHAZOS DELETE ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

module.exports = router;
