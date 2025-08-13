// src/routes/materiales.routes.js
const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

async function isIdentityMaterial(pool) {
  const r = await pool.request().query(`SELECT CAST(COLUMNPROPERTY(OBJECT_ID('dbo.Material_Medico'),'ID_MaterialMed','IsIdentity') AS INT) AS isIdentity`);
  return r.recordset[0]?.isIdentity === 1;
}

// GET
router.get('/', async (req,res)=>{
  try{
    const rs = await (await getPool()).request().query(`
      SELECT
        m.ID_MaterialMed AS id,
        m.Nombre,
        m.Tipo,
        m.Costo_Unitario,
        m.Certificado_Sanitario,
        m.Uso_Esteril,
        m.ID_Proveedor,
        p.Nombre AS Proveedor
      FROM dbo.Material_Medico m
      LEFT JOIN dbo.Proveedor p ON p.ID_Proveedor = m.ID_Proveedor
      ORDER BY m.ID_MaterialMed DESC
    `);
    res.json(rs.recordset);
  }catch(err){
    console.error('MATERIALES GET ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// POST {nombre, tipo, costo, certificado (bool), esteril (bool), idProveedor}
router.post('/', async (req,res)=>{
  const { nombre, tipo, costo, certificado, esteril, idProveedor } = req.body || {};
  try{
    const pool = await getPool();
    const identity = await isIdentityMaterial(pool);
    if(identity){
      const ins = await pool.request()
        .input('Nombre', sql.VarChar(100), nombre || '')
        .input('Tipo', sql.VarChar(50), tipo || null)
        .input('Costo', sql.Decimal(10,2), Number(costo || 0))
        .input('Cert', sql.Bit, !!certificado)
        .input('Esteril', sql.Bit, !!esteril)
        .input('Prov', sql.Int, Number(idProveedor || 0))
        .query(`
          INSERT INTO dbo.Material_Medico (Nombre, Tipo, Costo_Unitario, Certificado_Sanitario, Uso_Esteril, ID_Proveedor)
          OUTPUT INSERTED.ID_MaterialMed AS id
          VALUES (@Nombre, @Tipo, @Costo, @Cert, @Esteril, @Prov)
        `);
      return res.status(201).json({ ok:true, id: ins.recordset[0].id });
    } else {
      const next = await pool.request().query(`SELECT ISNULL(MAX(ID_MaterialMed),0)+1 AS nextId FROM dbo.Material_Medico`);
      const id = next.recordset[0].nextId;
      await pool.request()
        .input('id', sql.Int, id)
        .input('Nombre', sql.VarChar(100), nombre || '')
        .input('Tipo', sql.VarChar(50), tipo || null)
        .input('Costo', sql.Decimal(10,2), Number(costo || 0))
        .input('Cert', sql.Bit, !!certificado)
        .input('Esteril', sql.Bit, !!esteril)
        .input('Prov', sql.Int, Number(idProveedor || 0))
        .query(`
          INSERT INTO dbo.Material_Medico (ID_MaterialMed, Nombre, Tipo, Costo_Unitario, Certificado_Sanitario, Uso_Esteril, ID_Proveedor)
          VALUES (@id, @Nombre, @Tipo, @Costo, @Cert, @Esteril, @Prov)
        `);
      return res.status(201).json({ ok:true, id });
    }
  }catch(err){
    console.error('MATERIALES POST ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// PUT /:id
router.put('/:id', async (req,res)=>{
  const id = Number(req.params.id);
  const { nombre, tipo, costo, certificado, esteril, idProveedor } = req.body || {};
  try{
    await (await getPool()).request()
      .input('id', sql.Int, id)
      .input('Nombre', sql.VarChar(100), nombre || '')
      .input('Tipo', sql.VarChar(50), tipo || null)
      .input('Costo', sql.Decimal(10,2), Number(costo || 0))
      .input('Cert', sql.Bit, certificado != null ? !!certificado : null)
      .input('Esteril', sql.Bit, esteril != null ? !!esteril : null)
      .input('Prov', sql.Int, Number(idProveedor || 0))
      .query(`
        UPDATE dbo.Material_Medico
           SET Nombre=@Nombre,
               Tipo=@Tipo,
               Costo_Unitario=@Costo,
               Certificado_Sanitario=COALESCE(@Cert, Certificado_Sanitario),
               Uso_Esteril=COALESCE(@Esteril, Uso_Esteril),
               ID_Proveedor=@Prov
         WHERE ID_MaterialMed=@id
      `);
    res.json({ ok:true });
  }catch(err){
    console.error('MATERIALES PUT ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// DELETE /:id  (?cascade=1 para eliminar dependencias de Ensamble_Detalle antes)
router.delete('/:id', async (req,res)=>{
  const id = Number(req.params.id);
  const cascade = String(req.query.cascade || '').toLowerCase();
  const doCascade = cascade === '1' || cascade === 'true' || cascade === 'yes';
  try{
    const pool = await getPool();

    if (doCascade) {
      // Transacción: borra dependencias en Ensamble_Detalle y luego el material
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        const reqTx = new sql.Request(tx);
        await reqTx.input('id', sql.Int, id).query('DELETE FROM dbo.Ensamble_Detalle WHERE ID_MaterialMed=@id');
        await reqTx.input('id2', sql.Int, id).query('DELETE FROM dbo.Material_Medico WHERE ID_MaterialMed=@id2');
        await tx.commit();
        return res.json({ ok:true, cascaded:true });
      } catch (errTx) {
        await tx.rollback();
        throw errTx;
      }
    }

    // Intento normal (sin cascada)
    await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.Material_Medico WHERE ID_MaterialMed=@id');
    res.json({ ok:true });
  }catch(err){
    // 547 = violation of foreign key constraint
    const msg = String(err && (err.message || err));
    if (err.number === 547 || /REFERENCE constraint|FOREIGN KEY/i.test(msg)) {
      try {
        const pool = await getPool();
        const cq = await pool.request().input('id', sql.Int, id)
          .query('SELECT COUNT(1) AS refs FROM dbo.Ensamble_Detalle WHERE ID_MaterialMed=@id');
        const refs = cq.recordset[0]?.refs ?? 0;
        return res.status(409).json({ ok:false, error: `No se puede eliminar: el material está referenciado en ${refs} ensamble(s). Elimine esas filas o llame a DELETE /api/materiales/${id}?cascade=1 para borrar dependencias.` });
      } catch { /* ignore */ }
      return res.status(409).json({ ok:false, error: 'No se puede eliminar: el material está referenciado por ensambles. Elimine dependencias o use ?cascade=1.' });
    }
    console.error('MATERIALES DELETE ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

module.exports = router;
