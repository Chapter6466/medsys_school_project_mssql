// src/routes/ensambles.routes.js
// Ensambles con BOM opcional: si no mandas "detalles", busca receta en dbo.Producto_BOM.
// Ajusta inventarios en la misma transacción: +producto terminado y -materiales.
// Incluye validaciones para evitar stock negativo en materiales y evita aumentar
// producto si hay inventario de materiales pero no hay detalles/BOM.

const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

async function getEnsambleSchema(pool){
  const q = await pool.request().query(`
    SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Ensamble')
  `);
  const cols = new Set(q.recordset.map(r => String(r.name)));
  return {
    hasProducto: cols.has('Producto'),
    hasComponentes: cols.has('Componentes'),
    hasFecha: cols.has('Fecha'),
    hasResponsable: cols.has('Responsable'),
    hasIDDispositivo: cols.has('ID_DispositivoMed') || cols.has('ID_Dispositivo')
  };
}

async function isIdentityEnsamble(pool) {
  const r = await pool.request().query(`
    SELECT CAST(COLUMNPROPERTY(OBJECT_ID('dbo.Ensamble'),'ID_Ensamble','IsIdentity') AS INT) AS isIdentity
  `);
  return r.recordset[0] && r.recordset[0].isIdentity === 1;
}

function coalesceDate(dflt){
  try{ return dflt ? new Date(dflt) : new Date(); }catch{ return new Date(); }
}

async function resolveDispositivoId(reqLike, maybeIdOrName){
  if (maybeIdOrName == null || maybeIdOrName === '') return null;
  const num = Number(maybeIdOrName);
  if (!Number.isNaN(num) && String(num) === String(maybeIdOrName)) {
    return num;
  }
  const r = await reqLike
    .input('n', sql.VarChar(120), String(maybeIdOrName))
    .query(`SELECT TOP 1 ID_DispositivoMed AS id FROM dbo.Dispositivo_Medico WHERE Nombre = @n`);
  return (r.recordset[0] && r.recordset[0].id) || null;
}

async function tableHas(pool, table, column){
  const r = await pool.request()
    .input('t', sql.VarChar(128), `dbo.${table}`)
    .query(`SELECT name FROM sys.columns WHERE object_id = OBJECT_ID(@t)`);
  return new Set(r.recordset.map(x => String(x.name))).has(column);
}

// Stock de PRODUCTOS: 'DM' = Dispositivo_Medico.Stock_Actual, 'INV' = Inventario.Stock_Actual
async function getInventoryMode(pool){
  const hasStockOnDM = await tableHas(pool, 'Dispositivo_Medico', 'Stock_Actual');
  if (hasStockOnDM) return 'DM';
  const hasInv = await tableHas(pool, 'Inventario', 'Stock_Actual');
  return hasInv ? 'INV' : 'DM';
}

// Stock de MATERIALES (opcional):
// 'MM' = Material_Medico.Stock_Actual, 'MINV' = Material_Inventario.Stock_Actual, 'NONE' = sin inventario
async function getMaterialInventoryMode(pool){
  if (await tableHas(pool, 'Material_Medico', 'Stock_Actual')) return 'MM';
  if (await tableHas(pool, 'Material_Inventario', 'Stock_Actual')) return 'MINV';
  return 'NONE';
}

function num(n, d=0){ const v = Number(n); return Number.isFinite(v) ? v : d; }

// GET /api/ensambles
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const sch = await getEnsambleSchema(pool);

    const selectParts = [`e.ID_Ensamble AS id`];

    if (sch.hasProducto) {
      selectParts.push(`e.Producto`);
    } else if (sch.hasIDDispositivo) {
      selectParts.push(`d.Nombre AS Producto`);
    }

    if (sch.hasComponentes) {
      selectParts.push(`e.Componentes`);
    } else {
      selectParts.push(`
        STUFF((SELECT ', '+ ISNULL(m.Nombre, CONCAT('Mat:', CAST(ed.ID_MaterialMed as varchar(10))))
                      + ' x' + CAST(ISNULL(ed.Cantidad,1) as varchar(10))
               FROM dbo.Ensamble_Detalle ed
               LEFT JOIN dbo.Material_Medico m ON m.ID_MaterialMed = ed.ID_MaterialMed
               WHERE ed.ID_Ensamble = e.ID_Ensamble
               FOR XML PATH(''), TYPE).value('.','nvarchar(max)'),1,2,'') AS Componentes
      `);
    }

    if (sch.hasFecha)       selectParts.push(`e.Fecha`);
    if (sch.hasResponsable) selectParts.push(`e.Responsable`);

    selectParts.push(`(SELECT COUNT(1) FROM dbo.Ensamble_Detalle d WHERE d.ID_Ensamble = e.ID_Ensamble) AS Detalles`);

    const fromJoin = sch.hasIDDispositivo
      ? `FROM dbo.Ensamble e LEFT JOIN dbo.Dispositivo_Medico d ON d.ID_DispositivoMed = e.ID_DispositivoMed`
      : `FROM dbo.Ensamble e`;

    const sqlText = `
      SELECT ${selectParts.join(',')}
      ${fromJoin}
      ORDER BY e.ID_Ensamble DESC
    `;

    const rs = await pool.request().query(sqlText);
    res.json(rs.recordset);
  } catch (err) {
    console.error('ENSAMBLES GET ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// POST /api/ensambles
// Body: { idDispositivo?, producto?, componentes?, fecha?, responsable?, cantidad?: number, detalles?: [{idMaterial, cantidad}] }
router.post('/', async (req, res) => {
  const { idDispositivo, producto, componentes, fecha, responsable, detalles } = req.body || {};
  const cantidad = num(req.body && req.body.cantidad, 1);
  try {
    const pool = await getPool();
    const sch = await getEnsambleSchema(pool);
    const identity = await isIdentityEnsamble(pool);

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const rt = new sql.Request(tx);

      // Determinar ID_DispositivoMed si la columna existe
      let idDM = null;
      if (sch.hasIDDispositivo) {
        if (idDispositivo != null) {
          const n = Number(idDispositivo);
          idDM = Number.isNaN(n) ? null : n;
        }
        if (idDM == null && producto != null) {
          idDM = await resolveDispositivoId(rt, producto);
        }
        if (idDM == null) {
          throw Object.assign(new Error('Se requiere un Dispositivo válido. Proporcione idDispositivo o un nombre existente.'), { status:400 });
        }
      }

      // Ensamble (insert cabecera)
      let id;
      if (identity) {
        const cols = [];
        const vals = [];
        if (sch.hasIDDispositivo) { cols.push('ID_DispositivoMed'); vals.push('@IDDM'); rt.input('IDDM', sql.Int, idDM); }
        if (sch.hasProducto && producto !== undefined) { cols.push('Producto'); vals.push('@Producto'); rt.input('Producto', sql.VarChar(100), producto || ''); }
        if (sch.hasComponentes && componentes !== undefined) { cols.push('Componentes'); vals.push('@Comp'); rt.input('Comp', sql.VarChar(200), componentes || ''); }
        if (sch.hasFecha && fecha !== undefined) { cols.push('Fecha'); vals.push('@Fecha'); rt.input('Fecha', sql.DateTime2, coalesceDate(fecha)); }
        if (sch.hasResponsable && responsable !== undefined) { cols.push('Responsable'); vals.push('@Resp'); rt.input('Resp', sql.VarChar(100), responsable || null); }

        const ins = await rt.query(`
          INSERT INTO dbo.Ensamble (${cols.join(',')})
          OUTPUT INSERTED.ID_Ensamble AS id
          VALUES (${vals.join(',')})
        `);
        id = ins.recordset[0].id;
      } else {
        const next = await rt.query(`SELECT ISNULL(MAX(ID_Ensamble),0)+1 AS nextId FROM dbo.Ensamble`);
        id = next.recordset[0].nextId;

        const rti = new sql.Request(tx);
        const cols = ['ID_Ensamble'];
        const vals = ['@ID']; rti.input('ID', sql.Int, id);

        if (sch.hasIDDispositivo) { cols.push('ID_DispositivoMed'); vals.push('@IDDM'); rti.input('IDDM', sql.Int, idDM); }
        if (sch.hasProducto && producto !== undefined) { cols.push('Producto'); vals.push('@Producto'); rti.input('Producto', sql.VarChar(100), producto || ''); }
        if (sch.hasComponentes && componentes !== undefined) { cols.push('Componentes'); vals.push('@Comp'); rti.input('Comp', sql.VarChar(200), componentes || ''); }
        if (sch.hasFecha && fecha !== undefined) { cols.push('Fecha'); vals.push('@Fecha'); rti.input('Fecha', sql.DateTime2, coalesceDate(fecha)); }
        if (sch.hasResponsable && responsable !== undefined) { cols.push('Responsable'); vals.push('@Resp'); rti.input('Resp', sql.VarChar(100), responsable || null); }

        await rti.query(`
          INSERT INTO dbo.Ensamble (${cols.join(',')})
          VALUES (${vals.join(',')})
        `);
      }

      // ----------- DETALLES: usa body.detalles; si no hay, carga BOM y lo multiplica por "cantidad"
      let dets = Array.isArray(detalles) ? detalles.slice() : [];
      if (!dets.length && sch.hasIDDispositivo && idDM) {
        const hasBOM = await tableHas(pool, 'Producto_BOM', 'ID_DispositivoMed');
        if (hasBOM) {
          const rb = await (new sql.Request(tx))
            .input('p', sql.Int, idDM)
            .query(`
              SELECT ID_MaterialMed AS idMaterial, CantidadPorUnidad
              FROM dbo.Producto_BOM
              WHERE ID_DispositivoMed = @p
            `);
          dets = rb.recordset.map(row => ({
            idMaterial: Number(row.idMaterial),
            cantidad: num(row.CantidadPorUnidad, 0) * cantidad
          }));
        }
      }

      // Si hay inventario de materiales y NO tenemos detalles ni BOM -> no aumentamos producto
      const matModeAtStart = await getMaterialInventoryMode(pool);
      const willAdjustMaterials = matModeAtStart !== 'NONE' && Array.isArray(dets) && dets.length > 0;
      if (!willAdjustMaterials && matModeAtStart !== 'NONE') {
        throw Object.assign(new Error('No hay BOM ni detalles de materiales para este producto. No se puede aumentar stock.'), { status: 400 });
      }

      // Insertar detalles (nuevo Request por iteración para evitar EDUPEPARAM)
      if (Array.isArray(dets) && dets.length) {
        for (const it of dets) {
          const idMat = Number(it.idMaterial || it.ID_MaterialMed || 0);
          const cant  = Number(it.cantidad || it.Cantidad || 0);
          if (!Number.isFinite(idMat) || idMat <= 0) {
            throw Object.assign(new Error('Detalle inválido: ID de material faltante.'), { status: 400 });
          }
          if (!Number.isFinite(cant) || cant <= 0) {
            throw Object.assign(new Error('Detalle inválido: cantidad debe ser > 0.'), { status: 400 });
          }

          const rtd = new sql.Request(tx);
          await rtd
            .input('En',  sql.Int, id)
            .input('Mat', sql.Int, idMat)
            .input('Qty', sql.Int, cant)
            .query(`
              INSERT INTO dbo.Ensamble_Detalle (ID_Ensamble, ID_MaterialMed, Cantidad)
              VALUES (@En, @Mat, @Qty)
            `);
        }
      }

      // ---------- Ajustes de inventario ----------
      // 1) Aumentar stock del producto terminado
      if (sch.hasIDDispositivo && idDM && cantidad > 0) {
        const invMode = await getInventoryMode(pool);
        if (invMode === 'INV') {
          const upd = await (new sql.Request(tx))
            .input('p', sql.Int, idDM)
            .input('c', sql.Int, cantidad)
            .query(`
              UPDATE dbo.Inventario
                 SET Stock_Actual = ISNULL(Stock_Actual,0) + @c,
                     Ultima_Actualizacion = SYSDATETIME()
               WHERE ID_DispositivoMed = @p
            `);
          if ((upd.rowsAffected && upd.rowsAffected[0]) === 0) {
            await (new sql.Request(tx))
              .input('p', sql.Int, idDM)
              .input('c', sql.Int, cantidad)
              .query(`
                INSERT INTO dbo.Inventario (ID_DispositivoMed, Stock_Actual, Stock_Minimo, Ubicacion, Ultima_Actualizacion)
                VALUES (@p, @c, 0, NULL, SYSDATETIME())
              `);
          }
        } else {
          await (new sql.Request(tx))
            .input('p', sql.Int, idDM)
            .input('c', sql.Int, cantidad)
            .query(`
              UPDATE dbo.Dispositivo_Medico
                 SET Stock_Actual = ISNULL(Stock_Actual,0) + @c
               WHERE ID_DispositivoMed = @p
            `);
        }
      }

      // 2) Descontar inventario de materiales (si existe)
      const matMode = matModeAtStart; // usar el ya calculado
      if (matMode !== 'NONE' && Array.isArray(dets) && dets.length) {
        for (const it of dets) {
          const idMat = num(it.idMaterial || it.ID_MaterialMed, 0);
          const cant  = num(it.cantidad || it.Cantidad, 0);
          if (!idMat || cant <= 0) continue;

          if (matMode === 'MINV') {
            const upd = await (new sql.Request(tx))
              .input('m', sql.Int, idMat)
              .input('c', sql.Int, cant)
              .query(`
                UPDATE dbo.Material_Inventario
                   SET Stock_Actual = Stock_Actual - @c,
                       Ultima_Actualizacion = SYSDATETIME()
                 WHERE ID_MaterialMed = @m AND Stock_Actual >= @c
              `);
            if ((upd.rowsAffected && upd.rowsAffected[0]) === 0) {
              throw Object.assign(new Error(`Sin stock suficiente del material id ${idMat}`), { status: 409 });
            }
          } else if (matMode === 'MM') {
            const upd = await (new sql.Request(tx))
              .input('m', sql.Int, idMat)
              .input('c', sql.Int, cant)
              .query(`
                UPDATE dbo.Material_Medico
                   SET Stock_Actual = Stock_Actual - @c
                 WHERE ID_MaterialMed = @m AND ISNULL(Stock_Actual,0) >= @c
              `);
            if ((upd.rowsAffected && upd.rowsAffected[0]) === 0) {
              throw Object.assign(new Error(`Sin stock suficiente del material id ${idMat}`), { status: 409 });
            }
          }
        }
      }
      // ------------------------------------------

      await tx.commit();
      res.status(201).json({ ok:true, id });
    } catch (errTx) {
      await tx.rollback();
      if (errTx && errTx.status === 400) {
        return res.status(400).json({ ok:false, error: errTx.message });
      }
      if (errTx && errTx.status === 409) {
        return res.status(409).json({ ok:false, error: errTx.message });
      }
      throw errTx;
    }
  } catch (err) {
    console.error('ENSAMBLES POST ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// PUT /api/ensambles/:id (sin tocar inventarios; solo cabecera)
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { idDispositivo, producto, componentes, fecha, responsable } = req.body || {};
  try {
    const pool = await getPool();
    const sch = await getEnsambleSchema(pool);

    const sets = [];
    const reqq = await pool.request().input('id', sql.Int, id);

    if (sch.hasIDDispositivo && (idDispositivo !== undefined || producto !== undefined)) {
      let idDM = null;
      if (idDispositivo != null) {
        const n = Number(idDispositivo);
        idDM = Number.isNaN(n) ? null : n;
      }
      if (idDM == null && producto != null) {
        idDM = await resolveDispositivoId(reqq, producto);
      }
      if (idDM == null) {
        return res.status(400).json({ ok:false, error:'Dispositivo inválido.' });
      }
      sets.push('ID_DispositivoMed=@IDDM'); reqq.input('IDDM', sql.Int, idDM);
    }

    if (sch.hasProducto && producto !== undefined) { sets.push('Producto=@Producto'); reqq.input('Producto', sql.VarChar(100), producto || ''); }
    if (sch.hasComponentes && componentes !== undefined) { sets.push('Componentes=@Comp'); reqq.input('Comp', sql.VarChar(200), componentes || ''); }
    if (sch.hasFecha && fecha !== undefined) { sets.push('Fecha=@Fecha'); reqq.input('Fecha', sql.DateTime2, coalesceDate(fecha)); }
    if (sch.hasResponsable && responsable !== undefined) { sets.push('Responsable=@Resp'); reqq.input('Resp', sql.VarChar(100), responsable || null); }

    if (!sets.length) return res.json({ ok:true, noop:true });

    await reqq.query(`UPDATE dbo.Ensamble SET ${sets.join(', ')} WHERE ID_Ensamble=@id`);
    res.json({ ok:true });
  } catch (err) {
    console.error('ENSAMBLES PUT ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// DELETE /api/ensambles/:id  (?cascade=1 para borrar detalles primero)
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const cascade = String(req.query.cascade || '').toLowerCase();
  const doCascade = cascade === '1' || cascade === 'true' || cascade === 'yes';
  try {
    const pool = await getPool();
    if (doCascade) {
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        const rt = new sql.Request(tx);
        await rt.input('id', sql.Int, id).query('DELETE FROM dbo.Ensamble_Detalle WHERE ID_Ensamble=@id');
        await rt.input('id', sql.Int, id).query('DELETE FROM dbo.Ensamble WHERE ID_Ensamble=@id');
        await tx.commit();
        return res.json({ ok:true, cascaded:true });
      } catch (errTx) {
        await tx.rollback();
        throw errTx;
      }
    }
    await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.Ensamble WHERE ID_Ensamble=@id');
    res.json({ ok:true });
  } catch (err) {
    const msg = String(err && (err.message || err));
    if (err.number === 547 || /REFERENCE constraint|FOREIGN KEY/i.test(msg)) {
      return res.status(409).json({ ok:false, error:'No se puede eliminar: el ensamble tiene detalles. Elimine dependencias o use ?cascade=1.' });
    }
    console.error('ENSAMBLES DELETE ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

module.exports = router;
