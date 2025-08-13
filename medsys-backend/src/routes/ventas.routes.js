// src/routes/ventas.routes.js
// Ventas con detalle + control de stock (DM o Inventario) + soporte ID_Personal en Venta_Maestra
const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

async function tableHas(pool, table, column){
  const r = await pool.request()
    .input('t', sql.VarChar(128), `dbo.${table}`)
    .query(`SELECT name FROM sys.columns WHERE object_id = OBJECT_ID(@t)`);
  return new Set(r.recordset.map(x => String(x.name))).has(column);
}

async function isIdentity(pool, table, idCol){
  const r = await pool.request().query(`
    SELECT CAST(COLUMNPROPERTY(OBJECT_ID('dbo.${table}'),'${idCol}','IsIdentity') AS INT) AS isIdentity
  `);
  return r.recordset[0] && r.recordset[0].isIdentity === 1;
}

async function getInventoryMode(pool){
  // 'DM' = stock en Dispositivo_Medico, 'INV' = stock en Inventario
  const hasStockOnDM = await tableHas(pool, 'Dispositivo_Medico', 'Stock_Actual');
  if (hasStockOnDM) return 'DM';
  const hasInv = await tableHas(pool, 'Inventario', 'Stock_Actual');
  return hasInv ? 'INV' : 'DM';
}

function asDate(d){ try{ return d ? new Date(d) : new Date(); }catch{ return new Date(); } }
function num(n, def=0){ const v = Number(n); return Number.isFinite(v) ? v : def; }

// -------------------- GET /api/ventas --------------------
router.get('/', async (req, res) => {
  try{
    const pool = await getPool();
    const hasTotal = await tableHas(pool, 'Venta_Maestra', 'Total');
    const hasPers  = await tableHas(pool, 'Venta_Maestra', 'ID_Personal');

    const totalExpr = hasTotal
      ? 'v.Total'
      : 'ISNULL(SUM(d.Cantidad * d.PrecioUnitario), 0)';

    const selPers = hasPers ? ', v.ID_Personal AS idPersonal' : '';
    const grpPers = hasPers ? ', v.ID_Personal' : '';

    const rs = await pool.request().query(`
      SELECT
        v.ID_Venta AS id,
        v.Fecha,
        v.Cliente
        ${selPers},
        ${totalExpr} AS Total,
        ISNULL(SUM(d.Cantidad), 0) AS Items
      FROM dbo.Venta_Maestra v
      LEFT JOIN dbo.Venta_Detalle d
        ON d.ID_Venta = v.ID_Venta
      GROUP BY v.ID_Venta, v.Fecha, v.Cliente ${grpPers} ${hasTotal ? ', v.Total' : ''}
      ORDER BY v.ID_Venta DESC
    `);
    res.json(rs.recordset);
  }catch(err){
    console.error('VENTAS GET ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// ---------- POST /api/ventas ----------
// body: { cliente, fecha, idPersonal?, items: [{ idDispositivo, cantidad, precioUnitario? }] }
router.post('/', async (req, res) => {
  const { cliente, fecha, idPersonal, items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok:false, error:'Se requiere al menos un item' });
  }

  try{
    const pool = await getPool();
    const hasTotal = await tableHas(pool, 'Venta_Maestra', 'Total');
    const identity = await isIdentity(pool, 'Venta_Maestra', 'ID_Venta');
    const invMode  = await getInventoryMode(pool);
    const hasPers  = await tableHas(pool, 'Venta_Maestra', 'ID_Personal');

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try{
      // Normalizar/validar idPersonal si la columna existe
      let idPersonalVal = null;
      if (hasPers && idPersonal !== undefined && idPersonal !== null && String(idPersonal).trim() !== '') {
        idPersonalVal = Number(idPersonal);
        if (!Number.isInteger(idPersonalVal)) {
          throw Object.assign(new Error('idPersonal inválido'), { status:400 });
        }
        // valida que exista en dbo.Personal
        const per = await (new sql.Request(tx))
          .input('pid', sql.Int, idPersonalVal)
          .query(`SELECT 1 FROM dbo.Personal WHERE ID_Personal=@pid`);
        if (per.recordset.length === 0) {
          throw Object.assign(new Error(`ID_Personal ${idPersonalVal} no existe en Personal`), { status:400 });
        }
      }

      // Validación y lectura de precios/stock actuales
      const itemsNorm = [];
      for (const it of items) {
        const idDisp = num(it.idDispositivo, NaN);
        const cant   = num(it.cantidad, NaN);
        if (!Number.isFinite(idDisp) || !Number.isFinite(cant) || cant <= 0) {
          throw Object.assign(new Error('Ítem inválido'), { status:400 });
        }

        let prod;
        if (invMode === 'INV') {
          prod = await (new sql.Request(tx)).input('id', sql.Int, idDisp).query(`
            SELECT TOP 1
              d.ID_DispositivoMed AS id,
              d.Nombre,
              d.Precio,
              ISNULL(i.Stock_Actual,0) AS Stock_Actual
            FROM dbo.Dispositivo_Medico d
            LEFT JOIN dbo.Inventario i
              ON i.ID_DispositivoMed = d.ID_DispositivoMed
            WHERE d.ID_DispositivoMed=@id
          `);
        } else {
          prod = await (new sql.Request(tx)).input('id', sql.Int, idDisp).query(`
            SELECT TOP 1 ID_DispositivoMed AS id, Nombre, Precio, Stock_Actual
            FROM dbo.Dispositivo_Medico WHERE ID_DispositivoMed=@id
          `);
        }

        if (!prod.recordset[0]) {
          throw Object.assign(new Error('Producto no encontrado: '+idDisp), { status:400 });
        }
        const p = prod.recordset[0];
        const price = it.precioUnitario != null ? num(it.precioUnitario, 0) : num(p.Precio, 0);
        if (num(p.Stock_Actual, 0) < cant) {
          throw Object.assign(new Error(`Sin stock suficiente para ${p.Nombre} (id ${idDisp}). Disponible: ${p.Stock_Actual}`), { status:409 });
        }
        itemsNorm.push({ id: idDisp, nombre: p.Nombre, cant, price });
      }

      // Total
      const total = itemsNorm.reduce((a,b)=> a + b.cant*b.price, 0);

      // Insert Venta_Maestra (4 combinaciones: identity x total, con/sin ID_Personal)
      let idVenta;

      if (identity) {
        if (hasTotal && hasPers) {
          const ins = await (new sql.Request(tx))
            .input('Fecha',   sql.DateTime2, asDate(fecha))
            .input('Cliente', sql.VarChar(120), cliente || '')
            .input('Pers',    sql.Int, idPersonalVal)
            .input('Total',   sql.Decimal(18,2), total)
            .query(`
              INSERT INTO dbo.Venta_Maestra (Fecha, Cliente, ID_Personal, Total)
              OUTPUT INSERTED.ID_Venta AS id
              VALUES (@Fecha, @Cliente, @Pers, @Total)
            `);
          idVenta = ins.recordset[0].id;
        } else if (hasTotal && !hasPers) {
          const ins = await (new sql.Request(tx))
            .input('Fecha',   sql.DateTime2, asDate(fecha))
            .input('Cliente', sql.VarChar(120), cliente || '')
            .input('Total',   sql.Decimal(18,2), total)
            .query(`
              INSERT INTO dbo.Venta_Maestra (Fecha, Cliente, Total)
              OUTPUT INSERTED.ID_Venta AS id
              VALUES (@Fecha, @Cliente, @Total)
            `);
          idVenta = ins.recordset[0].id;
        } else if (!hasTotal && hasPers) {
          const ins = await (new sql.Request(tx))
            .input('Fecha',   sql.DateTime2, asDate(fecha))
            .input('Cliente', sql.VarChar(120), cliente || '')
            .input('Pers',    sql.Int, idPersonalVal)
            .query(`
              INSERT INTO dbo.Venta_Maestra (Fecha, Cliente, ID_Personal)
              OUTPUT INSERTED.ID_Venta AS id
              VALUES (@Fecha, @Cliente, @Pers)
            `);
          idVenta = ins.recordset[0].id;
        } else { // !hasTotal && !hasPers
          const ins = await (new sql.Request(tx))
            .input('Fecha',   sql.DateTime2, asDate(fecha))
            .input('Cliente', sql.VarChar(120), cliente || '')
            .query(`
              INSERT INTO dbo.Venta_Maestra (Fecha, Cliente)
              OUTPUT INSERTED.ID_Venta AS id
              VALUES (@Fecha, @Cliente)
            `);
          idVenta = ins.recordset[0].id;
        }
      } else {
        const next = await (new sql.Request(tx)).query(`
          SELECT ISNULL(MAX(ID_Venta),0)+1 AS nextId FROM dbo.Venta_Maestra
        `);
        idVenta = next.recordset[0].nextId;

        if (hasTotal && hasPers) {
          await (new sql.Request(tx))
            .input('ID',      sql.Int, idVenta)
            .input('Fecha',   sql.DateTime2, asDate(fecha))
            .input('Cliente', sql.VarChar(120), cliente || '')
            .input('Pers',    sql.Int, idPersonalVal)
            .input('Total',   sql.Decimal(18,2), total)
            .query(`
              INSERT INTO dbo.Venta_Maestra (ID_Venta, Fecha, Cliente, ID_Personal, Total)
              VALUES (@ID, @Fecha, @Cliente, @Pers, @Total)
            `);
        } else if (hasTotal && !hasPers) {
          await (new sql.Request(tx))
            .input('ID',      sql.Int, idVenta)
            .input('Fecha',   sql.DateTime2, asDate(fecha))
            .input('Cliente', sql.VarChar(120), cliente || '')
            .input('Total',   sql.Decimal(18,2), total)
            .query(`
              INSERT INTO dbo.Venta_Maestra (ID_Venta, Fecha, Cliente, Total)
              VALUES (@ID, @Fecha, @Cliente, @Total)
            `);
        } else if (!hasTotal && hasPers) {
          await (new sql.Request(tx))
            .input('ID',      sql.Int, idVenta)
            .input('Fecha',   sql.DateTime2, asDate(fecha))
            .input('Cliente', sql.VarChar(120), cliente || '')
            .input('Pers',    sql.Int, idPersonalVal)
            .query(`
              INSERT INTO dbo.Venta_Maestra (ID_Venta, Fecha, Cliente, ID_Personal)
              VALUES (@ID, @Fecha, @Cliente, @Pers)
            `);
        } else {
          await (new sql.Request(tx))
            .input('ID',      sql.Int, idVenta)
            .input('Fecha',   sql.DateTime2, asDate(fecha))
            .input('Cliente', sql.VarChar(120), cliente || '')
            .query(`
              INSERT INTO dbo.Venta_Maestra (ID_Venta, Fecha, Cliente)
              VALUES (@ID, @Fecha, @Cliente)
            `);
        }
      }

      // Insert detalle + actualizar stock
      for (const it of itemsNorm) {
        await (new sql.Request(tx))
          .input('v',  sql.Int, idVenta)
          .input('p',  sql.Int, it.id)
          .input('c',  sql.Int, it.cant)
          .input('pr', sql.Decimal(18,2), it.price)
          .query(`
            INSERT INTO dbo.Venta_Detalle (ID_Venta, ID_DispositivoMed, Cantidad, PrecioUnitario)
            VALUES (@v, @p, @c, @pr)
          `);

        if (invMode === 'INV') {
          const upd = await (new sql.Request(tx))
            .input('p', sql.Int, it.id)
            .input('c', sql.Int, it.cant)
            .query(`
              UPDATE dbo.Inventario
                 SET Stock_Actual = Stock_Actual - @c,
                     Ultima_Actualizacion = SYSDATETIME()
               WHERE ID_DispositivoMed = @p AND Stock_Actual >= @c
            `);
          if (upd.rowsAffected[0] === 0) {
            throw Object.assign(new Error(`Sin stock suficiente para ${it.nombre} (id ${it.id}).`), { status:409 });
          }
        } else {
          await (new sql.Request(tx))
            .input('p', sql.Int, it.id)
            .input('c', sql.Int, it.cant)
            .query(`
              UPDATE dbo.Dispositivo_Medico
                 SET Stock_Actual = Stock_Actual - @c
               WHERE ID_DispositivoMed = @p
            `);
        }
      }

      await tx.commit();
      res.status(201).set('Location', `/api/ventas/${idVenta}`).json({ ok:true, id:idVenta, total });
    }catch(errTx){
      await tx.rollback();
      if (errTx && errTx.status) {
        return res.status(errTx.status).json({ ok:false, error: errTx.message });
      }
      throw errTx;
    }
  }catch(err){
    console.error('VENTAS POST ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// ---------- DELETE /api/ventas/:id (?restock=1) ----------
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const restockQ = String(req.query.restock || '').toLowerCase();
  const doRestock = restockQ === '1' || restockQ === 'true' || restockQ === 'yes';
  try{
    const pool = await getPool();
    const invMode = await getInventoryMode(pool);

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try{
      let det = [];
      if (doRestock) {
        const rs = await (new sql.Request(tx)).input('v', sql.Int, id).query(`
          SELECT ID_DispositivoMed AS id, Cantidad
          FROM dbo.Venta_Detalle WHERE ID_Venta=@v
        `);
        det = rs.recordset || [];
      }

      await (new sql.Request(tx)).input('v', sql.Int, id).query(`DELETE FROM dbo.Venta_Detalle WHERE ID_Venta=@v`);
      await (new sql.Request(tx)).input('v', sql.Int, id).query(`DELETE FROM dbo.Venta_Maestra WHERE ID_Venta=@v`);

      if (doRestock && det.length) {
        for (const d of det) {
          if (invMode === 'INV') {
            await (new sql.Request(tx))
              .input('p', sql.Int, d.id)
              .input('c', sql.Int, d.Cantidad)
              .query(`
                UPDATE dbo.Inventario
                   SET Stock_Actual = Stock_Actual + @c,
                       Ultima_Actualizacion = SYSDATETIME()
                 WHERE ID_DispositivoMed = @p
              `);
          } else {
            await (new sql.Request(tx))
              .input('p', sql.Int, d.id)
              .input('c', sql.Int, d.Cantidad)
              .query(`
                UPDATE dbo.Dispositivo_Medico
                   SET Stock_Actual = Stock_Actual + @c
                 WHERE ID_DispositivoMed = @p
              `);
          }
        }
      }

      await tx.commit();
      res.json({ ok:true, restocked: doRestock && det.length });
    }catch(errTx){
      await tx.rollback();
      throw errTx;
    }
  }catch(err){
    const msg = String(err && (err.message || err));
    if (err.number === 547 || /REFERENCE constraint|FOREIGN KEY/i.test(msg)) {
      return res.status(409).json({ ok:false, error:'No se puede eliminar la venta: tiene dependencias.' });
    }
    console.error('VENTAS DELETE ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

module.exports = router;
