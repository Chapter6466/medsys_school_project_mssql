// src/routes/personal.routes.js
const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

async function isIdentityPersonal(pool) {
  const r = await pool.request().query(`SELECT CAST(COLUMNPROPERTY(OBJECT_ID('dbo.Personal'),'ID_Personal','IsIdentity') AS INT) AS isIdentity`);
  return r.recordset[0]?.isIdentity === 1;
}

// GET
router.get('/', async (req,res)=>{
  try{
    const rs = await (await getPool()).request().query(`
      SELECT ID_Personal AS id, Nombre, Rol, Turno, Telefono
      FROM dbo.Personal
      ORDER BY ID_Personal DESC
    `);
    res.json(rs.recordset);
  }catch(err){
    console.error('PERSONAL GET ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// POST {nombre, rol, turno, telefono}
router.post('/', async (req,res)=>{
  const { nombre, rol, turno, telefono } = req.body || {};
  try{
    const pool = await getPool();
    const identity = await isIdentityPersonal(pool);
    if(identity){
      const ins = await pool.request()
        .input('Nombre', sql.VarChar(100), nombre || '')
        .input('Rol', sql.VarChar(50), rol || null)
        .input('Turno', sql.VarChar(50), turno || null)
        .input('Telefono', sql.VarChar(20), telefono || null)
        .query(`
          INSERT INTO dbo.Personal (Nombre, Rol, Turno, Telefono)
          OUTPUT INSERTED.ID_Personal AS id
          VALUES (@Nombre, @Rol, @Turno, @Telefono)
        `);
      return res.status(201).json({ ok:true, id: ins.recordset[0].id });
    } else {
      const next = await pool.request().query(`SELECT ISNULL(MAX(ID_Personal),0)+1 AS nextId FROM dbo.Personal`);
      const id = next.recordset[0].nextId;
      await pool.request()
        .input('id', sql.Int, id)
        .input('Nombre', sql.VarChar(100), nombre || '')
        .input('Rol', sql.VarChar(50), rol || null)
        .input('Turno', sql.VarChar(50), turno || null)
        .input('Telefono', sql.VarChar(20), telefono || null)
        .query(`
          INSERT INTO dbo.Personal (ID_Personal, Nombre, Rol, Turno, Telefono)
          VALUES (@id, @Nombre, @Rol, @Turno, @Telefono)
        `);
      return res.status(201).json({ ok:true, id });
    }
  }catch(err){
    console.error('PERSONAL POST ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// PUT /:id
router.put('/:id', async (req,res)=>{
  const id = Number(req.params.id);
  const { nombre, rol, turno, telefono } = req.body || {};
  try{
    await (await getPool()).request()
      .input('id', sql.Int, id)
      .input('Nombre', sql.VarChar(100), nombre || '')
      .input('Rol', sql.VarChar(50), rol || null)
      .input('Turno', sql.VarChar(50), turno || null)
      .input('Telefono', sql.VarChar(20), telefono || null)
      .query(`
        UPDATE dbo.Personal
           SET Nombre=@Nombre, Rol=@Rol, Turno=@Turno, Telefono=@Telefono
         WHERE ID_Personal=@id
      `);
    res.json({ ok:true });
  }catch(err){
    console.error('PERSONAL PUT ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

// DELETE /:id
router.delete('/:id', async (req,res)=>{
  const id = Number(req.params.id);
  try{
    await (await getPool()).request().input('id', sql.Int, id).query('DELETE FROM dbo.Personal WHERE ID_Personal=@id');
    res.json({ ok:true });
  }catch(err){
    console.error('PERSONAL DELETE ERR:', err);
    res.status(500).json({ ok:false, error:String(err) });
  }
});

module.exports = router;
