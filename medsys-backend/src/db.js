// src/db.js — conexión SQL Server (Windows Auth o SQL Login) con pool único
// Comentarios en español para facilidad de revisión.
//
// MODO DE AUTENTICACIÓN:
//   - DB_AUTH=windows  -> usa controlador msnodesqlv8 (ODBC / Trusted Connection)
//   - DB_AUTH=sql      -> usa autenticación SQL (usuario/contraseña)
//
// VARIABLES .env RELEVANTES
//   DB_AUTH=windows|sql
//   DB_SERVER=localhost\\SQLEXPRESS  (o el nombre/instancia real, p.ej. TITAN-4\\SQLEXPRESS)
//   DB_DATABASE=DispositivosMedicosDB
//   DB_ODBC_DRIVER=ODBC Driver 17 for SQL Server   (para windows)
//   DB_USER=sa           (solo si DB_AUTH=sql)
//   DB_PASSWORD=...      (solo si DB_AUTH=sql)
//   DB_ENCRYPT=false     (local dev)
//   DB_TRUST_CERT=true   (local dev)
//
const authMode = (process.env.DB_AUTH || 'windows').toLowerCase();

// Carga del paquete y tipo sql según el modo
let sql;
if (authMode === 'windows') {
  try {
    sql = require('mssql/msnodesqlv8'); // requiere: npm i msnodesqlv8
  } catch (e) {
    console.error('Falta el paquete msnodesqlv8. Instala con: npm i msnodesqlv8');
    throw e;
  }
} else {
  sql = require('mssql');
}

// Construye la configuración para el pool
function getConfig() {
  const server   = process.env.DB_SERVER || 'localhost';
  const database = process.env.DB_DATABASE || 'master';
  const trust    = String(process.env.DB_TRUST_CERT || 'true').toLowerCase() === 'true';
  const encrypt  = String(process.env.DB_ENCRYPT   || 'false').toLowerCase() === 'true';

  if (authMode === 'windows') {
    // Conexión por Windows Auth via msnodesqlv8
    const odbcDriver = process.env.DB_ODBC_DRIVER || 'ODBC Driver 17 for SQL Server';
    return {
      server,
      database,
      options: {
        trustServerCertificate: trust,
        encrypt,               // no suele ser necesario en local
        enableArithAbort: true
      },
      driver: 'msnodesqlv8',
      connectionString: `Driver={${odbcDriver}};Server=${server};Database=${database};Trusted_Connection=Yes;`
    };
  } else {
    // Autenticación SQL
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    return {
      user, password, server, database,
      options: {
        trustServerCertificate: trust,
        encrypt,
        enableArithAbort: true
      }
    };
  }
}

// Pool único (singleton)
let poolPromise = null;

/** Obtiene (o crea) el pool de conexiones */
async function getPool() {
  if (!poolPromise) {
    const cfg = getConfig();
    console.log(`[DB] Modo: ${authMode} | Server: ${process.env.DB_SERVER} | DB: ${process.env.DB_DATABASE}`);
    poolPromise = new sql.ConnectionPool(cfg).connect()
      .then(pool => { console.log('Conectado a SQL Server'); return pool; })
      .catch(err => { console.error('Error de conexión a SQL Server', err); throw err; });
  }
  return poolPromise;
}

module.exports = { sql, getPool };
