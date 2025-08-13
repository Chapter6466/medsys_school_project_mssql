// src/routes/proveedores.routes.js
const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

async function isIdentityProveedor(pool) {
  const r = await pool.request().query(`SELECT CAST(COLUMNPROPERTY(OBJECT_ID('dbo.Proveedor'),'ID_Proveedor','IsIdentity') AS INT) AS isIdentity`);
  return r.recordset[0]?.isIdentity === 1;
}

// GET
router.get('/', async (req,res)=>{
  try{
    const rs = await (await getPool()).request().query(`
      SELECT ID_Proveedor AS id, Nombre, Contacto, Telefono, Email
      FROM dbo.Proveedor
      ORDER BY ID_Proveedor DESC
    `);
    res.json(rs.recordset);
  }catch(err){
    console.error('PROVEEDORES GET ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// POST {nombre, contacto, telefono, email}
router.post('/', async (req,res)=>{
  const { nombre, contacto, telefono, email } = req.body || {};
  try{
    const pool = await getPool();
    const identity = await isIdentityProveedor(pool);
    if(identity){
      const ins = await pool.request()
        .input('Nombre', sql.VarChar(100), nombre || '')
        .input('Contacto', sql.VarChar(100), contacto || '')
        .input('Telefono', sql.VarChar(20), telefono || '')
        .input('Email', sql.VarChar(100), email || '')
        .query(`
          INSERT INTO dbo.Proveedor (Nombre, Contacto, Telefono, Email)
          OUTPUT INSERTED.ID_Proveedor AS id
          VALUES (@Nombre, @Contacto, @Telefono, @Email)
        `);
      return res.status(201).json({ ok:true, id: ins.recordset[0].id });
    } else {
      const next = await pool.request().query(`SELECT ISNULL(MAX(ID_Proveedor),0)+1 AS nextId FROM dbo.Proveedor`);
      const id = next.recordset[0].nextId;
      await pool.request()
        .input('id', sql.Int, id)
        .input('Nombre', sql.VarChar(100), nombre || '')
        .input('Contacto', sql.VarChar(100), contacto || '')
        .input('Telefono', sql.VarChar(20), telefono || '')
        .input('Email', sql.VarChar(100), email || '')
        .query(`
          INSERT INTO dbo.Proveedor (ID_Proveedor, Nombre, Contacto, Telefono, Email)
          VALUES (@id, @Nombre, @Contacto, @Telefono, @Email)
        `);
      return res.status(201).json({ ok:true, id });
    }
  }catch(err){
    console.error('PROVEEDORES POST ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// PUT /:id {nombre, contacto, telefono, email}
router.put('/:id', async (req,res)=>{
  const id = Number(req.params.id);
  const { nombre, contacto, telefono, email } = req.body || {};
  try{
    await (await getPool()).request()
      .input('id', sql.Int, id)
      .input('Nombre', sql.VarChar(100), nombre || '')
      .input('Contacto', sql.VarChar(100), contacto || '')
      .input('Telefono', sql.VarChar(20), telefono || '')
      .input('Email', sql.VarChar(100), email || '')
      .query(`
        UPDATE dbo.Proveedor
           SET Nombre=@Nombre, Contacto=@Contacto, Telefono=@Telefono, Email=@Email
         WHERE ID_Proveedor=@id
      `);
    res.json({ ok:true });
  }catch(err){
    console.error('PROVEEDORES PUT ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// DELETE /:id
router.delete('/:id', async (req,res)=>{
  const id = Number(req.params.id);
  try{
    await (await getPool()).request().input('id', sql.Int, id).query('DELETE FROM dbo.Proveedor WHERE ID_Proveedor=@id');
    res.json({ ok:true });
  }catch(err){
    console.error('PROVEEDORES DELETE ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

module.exports = router;
