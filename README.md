# Medsys Technologies — Demo Inventory & Sales App

A lightweight **Node.js + Express + SQL Server** API with a **vanilla HTML/CSS/JS** frontend for managing medical devices, materials, providers, assemblies, scrap (rejects), personnel, and sales. Built for coursework/demo use (non‑production).

---

## ✨ Features

- Dashboard with live KPIs (items, in‑stock, low stock, rejects) and recent activity
- CRUD for **Products**, **Materials**, **Providers**, **Personnel**, **Assemblies**, **Rejects**
- **Sales**: creates master + detail, validates stock, **decrements inventory**, optional **ID_Personal** capture
- CSV export (quick report)
- Simple demo sign‑in (`admin`/`analyst` + password `medsys`)

> ⚠️ This project targets **SQL Server (SSMS)**. It supports stock stored either in `Inventario` or directly in `Dispositivo_Medico` (auto‑detects).

---

## 🧱 Tech Stack

- Backend: Node.js, Express, `mssql` / `msnodesqlv8`
- DB: SQL Server (SSMS)
- Frontend: HTML + CSS + JavaScript (no frameworks)
- Auth: demo only (local token; not for production)

---

## 📂 Project Structure (key files)

```
/ (frontend)
├─ index.html           # main dashboard UI
├─ signin.html          # login page
├─ styles.css           # design system + layout
├─ app.js               # UI logic, modals, live KPIs, API calls
└─ signin.js            # demo sign-in

/backend
├─ server.js            # Express server + routers
├─ .env                 # DB config (sample)
└─ src
   ├─ db.js             # SQL Server pool + Windows/SQL auth
   └─ routes
      ├─ productos.routes.js
      ├─ materiales.routes.js
      ├─ proveedores.routes.js
      ├─ personal.routes.js
      ├─ ensambles.routes.js
      ├─ rechazos.routes.js
      └─ ventas.routes.js
```

---

## 🛠️ Local Setup (Backend)

1) **Install dependencies**

```bash
npm install
# If using Windows Auth, also ensure ODBC driver is installed
# and add the msnodesqlv8 package:
npm i msnodesqlv8
```

2) **Configure `.env`** (sample included):

```ini
DB_AUTH=windows            # windows | sql
DB_SERVER=TITAN-4          # your server or instance (e.g., TITAN-4\SQLEXPRESS)
DB_DATABASE=DispositivosMedicosDB
DB_TRUST_CERT=true
DB_ODBC_DRIVER=ODBC Driver 17 for SQL Server

# For DB_AUTH=sql
# DB_USER=sa
# DB_PASSWORD=...
# DB_ENCRYPT=false
```

3) **Start API**

```bash
node server.js
# API: http://localhost:3000
# Healthcheck: http://localhost:3000/health
```

---

## 🖥️ Frontend

Open `index.html` (or use VS Code **Live Server**).  
On first load, you’ll be redirected to `signin.html`. Use:
- **User**: `admin` (or `analyst`)
- **Password**: `medsys`

---

## 🔌 API Overview (base URL: `http://localhost:3000/api`)

| Resource      | Methods                 | Notes |
|---------------|-------------------------|-------|
| `/productos`  | GET, POST, PUT/:id, DELETE/:id | Upserts to `Inventario` and `Dispositivo_Medico` |
| `/materiales` | GET, POST, PUT/:id, DELETE/:id?cascade=1 | Cascade deletes `Ensamble_Detalle` if requested |
| `/proveedores`| GET, POST, PUT/:id, DELETE/:id | Basic CRUD |
| `/personal`   | GET, POST, PUT/:id, DELETE/:id | Supports `FechaIngreso`, `Activo` |
| `/ensambles`  | GET, POST, PUT/:id, DELETE/:id?cascade=1 | Flexible schema: name or `ID_DispositivoMed` |
| `/rechazos`   | GET, POST, PUT/:id, DELETE/:id | Accepts `Fecha` |
| `/ventas`     | GET, POST, DELETE/:id?restock=1 | Creates master+detail, decrements stock; `restock` on delete |

---

## 🗄️ Database Schema (ER)

> The app works whether stock lives in `Inventario` or directly in `Dispositivo_Medico`. Columns like `ID_Personal` (in `Venta_Maestra`) and identity on some tables are optional—routes handle both cases.

```mermaid
erDiagram
  Proveedor ||--o{ Material_Medico : provides
  Dispositivo_Medico ||--o{ Inventario : has
  Dispositivo_Medico ||--o{ Rechazo : has
  Dispositivo_Medico ||--o{ Ensamble : is_built_as
  Ensamble ||--o{ Ensamble_Detalle : contains
  Material_Medico ||--o{ Ensamble_Detalle : component
  Venta_Maestra ||--o{ Venta_Detalle : includes
  Dispositivo_Medico ||--o{ Venta_Detalle : sold
  Personal ||--o{ Venta_Maestra : attended_by

  Proveedor {
    INT ID_Proveedor PK
    VARCHAR(100) Nombre
    VARCHAR(100) Contacto
    VARCHAR(20)  Telefono
    VARCHAR(100) Email
  }
  Material_Medico {
    INT ID_MaterialMed PK
    VARCHAR(100) Nombre
    VARCHAR(50)  Tipo
    DECIMAL(10,2) Costo_Unitario
    BIT Certificado_Sanitario
    BIT Uso_Esteril
    INT ID_Proveedor FK
  }
  Dispositivo_Medico {
    INT ID_DispositivoMed PK
    VARCHAR(100) Nombre
    VARCHAR(200) Descripcion
    VARCHAR(50)  Clasificacion_Riesgo
    VARCHAR(100) Aprobado_Por
    VARCHAR(50)  Uso_Especifico
    DECIMAL(10,2) Precio
    INT Stock_Actual?          # optional if using Inventario
    INT Stock_Minimo?          # optional if using Inventario
  }
  Inventario {
    INT ID_DispositivoMed PK, FK
    INT Stock_Actual
    INT Stock_Minimo
    DATETIME2 Ultima_Actualizacion
  }
  Ensamble {
    INT ID_Ensamble PK
    INT ID_DispositivoMed FK?  # present in some schemas
    VARCHAR(100) Producto?     # optional alternative
    VARCHAR(200) Componentes?
    DATETIME2 Fecha?
    VARCHAR(100) Responsable?
  }
  Ensamble_Detalle {
    INT ID_Ensamble FK
    INT ID_MaterialMed FK
    INT Cantidad
  }
  Personal {
    INT ID_Personal PK
    VARCHAR(120) Nombre
    VARCHAR(80)  Rol
    VARCHAR(50)  Turno
    VARCHAR(180) Correo
    VARCHAR(40)  Telefono
    DATE FechaIngreso
    BIT  Activo
  }
  Rechazo {
    INT ID_Rechazo PK
    INT ID_DispositivoMed FK
    VARCHAR(100) Causa
    INT Cantidad
    DATETIME2 Fecha
  }
  Venta_Maestra {
    INT ID_Venta PK
    DATETIME2 Fecha
    VARCHAR(120) Cliente
    INT ID_Personal?           # optional column
    DECIMAL(18,2) Total?       # optional; computed if missing
  }
  Venta_Detalle {
    INT ID_Venta FK
    INT ID_DispositivoMed FK
    INT Cantidad
    DECIMAL(18,2) PrecioUnitario
  }
```

---

## 🧪 Demo Data / Login

- Sign-in is **client-side only** (educational). Use `admin` or `analyst` with password `medsys`.
- Token is stored in `sessionStorage` or `localStorage` when “remember me” is checked.

---

## 🩺 Troubleshooting

- **ODBC Driver not found**: Install **ODBC Driver 17/18 for SQL Server** and ensure `.env` has `DB_ODBC_DRIVER=...`.  
- **Windows Auth**: Requires `msnodesqlv8`. Use `DB_AUTH=windows` (default in sample).  
- **SQL Login**: Set `DB_AUTH=sql` and provide `DB_USER`, `DB_PASSWORD`.  
- **FK/identity variations**: Routes detect whether ID columns are `IDENTITY` and whether optional columns exist; for deletes with dependencies, use query flags like `?cascade=1` (materials/ensambles) or `?restock=1` (ventas).  
- **CORS/JSON**: Server enables CORS and safe JSON parsing; malformed JSON returns `400`.

---

## 📜 License

Educational/demo use. No warranty; not intended for production.

---

## 🇪🇸 Versión en Español (resumen)

**Medsys Technologies** es una app demo (no productiva) con **API en Node/Express** y **frontend HTML/CSS/JS** para gestionar dispositivos médicos, materiales, proveedores, ensambles, rechazos, personal y ventas.

### Características
- KPIs en vivo + actividad reciente
- CRUD completo (productos, materiales, etc.)
- Ventas con detalle: descuenta stock y guarda `ID_Personal` (si la columna existe)
- Exportación CSV
- Inicio de sesión de **demo** (usuario `admin` o `analyst`, contraseña `medsys`)

### Instalación rápida
1. `npm install` (+ `npm i msnodesqlv8` si usas **Windows Auth**)  
2. Configura `.env` (ver ejemplo)  
3. `node server.js` → `http://localhost:3000`  
4. Abre `index.html` con Live Server

### Diagrama ER
Ver el bloque **Mermaid** en la sección “Database Schema (ER)”. Muestra tablas claves: `Proveedor`, `Material_Medico`, `Dispositivo_Medico`, `Inventario`, `Ensamble`, `Ensamble_Detalle`, `Personal`, `Rechazo`, `Venta_Maestra`, `Venta_Detalle` y sus relaciones.

---

_“Powered by Securisk Technologies”_
