// src/routes/productos.routes.js
const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// GET /api/productos
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const rs = await pool.request().query(`
      SELECT
        d.ID_DispositivoMed AS id,
        d.Nombre,
        d.Descripcion,
        d.Clasificacion_Riesgo,
        d.Aprobado_Por,
        d.Uso_Especifico,
        d.Precio,
        ISNULL(i.Stock_Actual,0)  AS Stock_Actual,
        ISNULL(i.Stock_Minimo,0)  AS Stock_Minimo
      FROM dbo.Dispositivo_Medico d
      LEFT JOIN dbo.Inventario i
        ON i.ID_DispositivoMed = d.ID_DispositivoMed
      ORDER BY d.ID_DispositivoMed DESC
    `);
    res.json(rs.recordset);
  } catch (err) {
    console.error('PRODUCTOS GET ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// POST /api/productos
router.post('/', async (req, res) => {
  const { nombre, descripcion, riesgo, aprobadoPor, uso, precio, stock, stockMin } = req.body || {};
  try {
    const pool = await getPool();
    const ins = await pool.request()
      .input('Nombre', sql.VarChar(100), nombre || '')
      .input('Descripcion', sql.VarChar(200), descripcion || null)
      .input('Riesgo', sql.VarChar(50), riesgo || null)
      .input('Aprobado', sql.VarChar(100), aprobadoPor || null)
      .input('Uso', sql.VarChar(50), uso || null)
      .input('Precio', sql.Decimal(10,2), Number(precio || 0))
      .query(`
        INSERT INTO dbo.Dispositivo_Medico (Nombre, Descripcion, Clasificacion_Riesgo, Aprobado_Por, Uso_Especifico, Precio)
        OUTPUT INSERTED.ID_DispositivoMed AS id
        VALUES (@Nombre, @Descripcion, @Riesgo, @Aprobado, @Uso, @Precio)
      `);
    const id = ins.recordset[0].id;

    // Upsert inventario
    await pool.request()
      .input('id', sql.Int, id)
      .input('stock', sql.Int, Number(stock || 0))
      .input('stockMin', sql.Int, Number(stockMin || 0))
      .query(`
        MERGE dbo.Inventario AS t
        USING (SELECT @id AS ID_DispositivoMed, @stock AS Stock_Actual, @stockMin AS Stock_Minimo) AS s
        ON t.ID_DispositivoMed = s.ID_DispositivoMed
        WHEN MATCHED THEN
          UPDATE SET Stock_Actual = s.Stock_Actual,
                     Stock_Minimo = s.Stock_Minimo,
                     Ultima_Actualizacion = SYSDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (ID_DispositivoMed, Stock_Actual, Stock_Minimo, Ultima_Actualizacion)
          VALUES (s.ID_DispositivoMed, s.Stock_Actual, s.Stock_Minimo, SYSDATETIME());
      `);

    res.status(201).json({ ok:true, id });
  } catch (err) {
    console.error('PRODUCTOS POST ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// PUT /api/productos/:id
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, descripcion, riesgo, aprobadoPor, uso, precio, stock, stockMin } = req.body || {};
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('Nombre', sql.VarChar(100), nombre || '')
      .input('Descripcion', sql.VarChar(200), descripcion || null)
      .input('Riesgo', sql.VarChar(50), riesgo || null)
      .input('Aprobado', sql.VarChar(100), aprobadoPor || null)
      .input('Uso', sql.VarChar(50), uso || null)
      .input('Precio', sql.Decimal(10,2), Number(precio || 0))
      .query(`
        UPDATE dbo.Dispositivo_Medico
           SET Nombre = @Nombre,
               Descripcion = @Descripcion,
               Clasificacion_Riesgo = @Riesgo,
               Aprobado_Por = @Aprobado,
               Uso_Especifico = @Uso,
               Precio = @Precio
         WHERE ID_DispositivoMed = @id
      `);

    await pool.request()
      .input('id', sql.Int, id)
      .input('stock', sql.Int, Number(stock || 0))
      .input('stockMin', sql.Int, Number(stockMin || 0))
      .query(`
        MERGE dbo.Inventario AS t
        USING (SELECT @id AS ID_DispositivoMed, @stock AS Stock_Actual, @stockMin AS Stock_Minimo) AS s
        ON t.ID_DispositivoMed = s.ID_DispositivoMed
        WHEN MATCHED THEN
          UPDATE SET Stock_Actual = s.Stock_Actual,
                     Stock_Minimo = s.Stock_Minimo,
                     Ultima_Actualizacion = SYSDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (ID_DispositivoMed, Stock_Actual, Stock_Minimo, Ultima_Actualizacion)
          VALUES (s.ID_DispositivoMed, s.Stock_Actual, s.Stock_Minimo, SYSDATETIME());
      `);

    res.json({ ok:true });
  } catch (err) {
    console.error('PRODUCTOS PUT ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// DELETE /api/productos/:id
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const pool = await getPool();
    // Eliminar inventario primero (FK)
    await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.Inventario WHERE ID_DispositivoMed=@id');
    await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.Dispositivo_Medico WHERE ID_DispositivoMed=@id');
    res.json({ ok:true });
  } catch (err) {
    console.error('PRODUCTOS DELETE ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

module.exports = router;
