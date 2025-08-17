// Rechazos: compatible con tablas donde ID_Rechazo ES o NO ES IDENTITY
// y compatible si existe (o no) la columna Reportado_Por
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

// Helper: ¿existe la columna Reportado_Por?
async function hasReportadoPor(pool) {
  const rs = await pool.request().query(`
    SELECT 1 AS ok
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.Rechazo')
      AND name = 'Reportado_Por'
  `);
  return rs.recordset.length > 0;
}

// GET /api/rechazos
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const withReporter = await hasReportadoPor(pool);

    const selectCols = [
      'r.ID_Rechazo        AS id',
      'r.ID_DispositivoMed AS ID_DispositivoMed',
      'd.Nombre            AS Dispositivo',
      'r.Causa',
      'r.Cantidad',
      'r.Fecha'
    ];
    if (withReporter) {
      selectCols.push('r.Reportado_Por    AS Reportado_Por');
    }

    const query = `
      SELECT
        ${selectCols.join(',\n        ')}
      FROM dbo.Rechazo r
      LEFT JOIN dbo.Dispositivo_Medico d
        ON d.ID_DispositivoMed = r.ID_DispositivoMed
      ORDER BY r.ID_Rechazo DESC
    `;

    const rs = await pool.request().query(query);
    res.json(rs.recordset);
  } catch (err) {
    console.error('RECHAZOS GET ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// POST /api/rechazos
// Body: { idDispositivo, causa, cantidad, fecha, reportadoPor }
router.post('/', async (req, res) => {
  const { idDispositivo, causa, cantidad, fecha, reportadoPor } = req.body || {};
  const reporter = (reportadoPor && String(reportadoPor).trim()) ? String(reportadoPor).trim() : null;

  try {
    const pool = await getPool();
    const identity = await isIdentityRechazo(pool);
    const withReporter = await hasReportadoPor(pool);

    const reqq = pool.request()
      .input('idDisp', sql.Int, Number(idDispositivo || 0))
      .input('causa',  sql.VarChar(100), causa || '')
      .input('cant',   sql.Int, Number(cantidad || 0))
      .input('fecha',  sql.DateTime2, fecha ? new Date(fecha) : new Date());

    if (withReporter) {
      reqq.input('reportado', sql.NVarChar(120), reporter);
    }

    if (identity) {
      const cols = ['ID_DispositivoMed','Causa','Cantidad','Fecha'];
      const vals = ['@idDisp','@causa','@cant','@fecha'];
      if (withReporter) { cols.push('Reportado_Por'); vals.push('@reportado'); }

      const ins = await reqq.query(`
        INSERT INTO dbo.Rechazo (${cols.join(', ')})
        OUTPUT INSERTED.ID_Rechazo AS id
        VALUES (${vals.join(', ')})
      `);
      const id = ins.recordset[0].id;
      return res.status(201).json({ ok:true, id });
    } else {
      const next = await pool.request().query(`SELECT ISNULL(MAX(ID_Rechazo),0)+1 AS nextId FROM dbo.Rechazo`);
      const id = next.recordset[0].nextId;

      const cols = ['ID_Rechazo','ID_DispositivoMed','Causa','Cantidad','Fecha'];
      const vals = ['@id','@idDisp','@causa','@cant','@fecha'];
      if (withReporter) { cols.push('Reportado_Por'); vals.push('@reportado'); }

      await reqq
        .input('id', sql.Int, id)
        .query(`
          INSERT INTO dbo.Rechazo (${cols.join(', ')})
          VALUES (${vals.join(', ')})
        `);
      return res.status(201).json({ ok:true, id });
    }
  } catch (err) {
    console.error('RECHAZOS POST ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// PUT /api/rechazos/:id
// Body: { idDispositivo, causa, cantidad, fecha, reportadoPor }
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { idDispositivo, causa, cantidad, fecha, reportadoPor } = req.body || {};
  const reporter = (reportadoPor && String(reportadoPor).trim()) ? String(reportadoPor).trim() : null;

  try {
    const pool = await getPool();
    const withReporter = await hasReportadoPor(pool);

    const reqq = pool.request()
      .input('id',     sql.Int, id)
      .input('idDisp', sql.Int, Number(idDispositivo || 0))
      .input('causa',  sql.VarChar(100), causa || '')
      .input('cant',   sql.Int, Number(cantidad || 0))
      .input('fecha',  sql.DateTime2, fecha ? new Date(fecha) : new Date());

    let setParts = [
      'ID_DispositivoMed = @idDisp',
      'Causa             = @causa',
      'Cantidad          = @cant',
      'Fecha             = @fecha'
    ];

    if (withReporter) {
      reqq.input('reportado', sql.NVarChar(120), reporter);
      setParts.push('Reportado_Por      = @reportado');
    }

    const sqlUpdate = `
      UPDATE dbo.Rechazo
         SET ${setParts.join(', ')}
       WHERE ID_Rechazo = @id
    `;

    await reqq.query(sqlUpdate);
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
