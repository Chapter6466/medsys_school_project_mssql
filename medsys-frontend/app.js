// Medsys Technologies - App JS (Dashboard live updates, Ensambles, Ventas with idPersonal)
// ✅ Working modals (window.modal + global alias modal)
// ✅ API persistence (productos, materiales, proveedores, personal, ensambles, rechazos, ventas)
// ✅ Ventas: descuenta stock + captura ID_Personal
// ✅ Dashboard: KPIs en vivo + actividad reciente + auto-refresh
// ✅ UX: Esc para cerrar, foco inicial + focus trap, inline errors, loading/empty, highlight row
// ✅ No optional chaining en asignaciones
// ✅ Logging global de errores
// ✅ Productos: Riesgo/Uso dropdowns; Aprobado Por dropdown (desde Personal)
// ✅ Productos: filtros por Riesgo y Uso + columnas actualizadas (incluye “Aprobado por”)
// ✅ Ensambles: Responsable como dropdown desde Personal (alta y edición)
// ✅ Rechazos: Reportado por (dropdown desde Personal) en alta/edición + columna en tabla

// ---------- Token helper (JWT o base64 plano) ----------
function parseTokenAny(token) {
  if (!token) return null;
  if (token.includes('.')) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '==='.slice((base64.length + 3) % 4);
      return JSON.parse(atob(padded));
    } catch {}
  }
  try { return JSON.parse(atob(token)); } catch { return null; }
}

// ---------- Sesión ----------
(function(){
  const token = sessionStorage.getItem('medsys_token') || localStorage.getItem('medsys_token');
  const payload = parseTokenAny(token);
  const chip = document.getElementById('usernameChip');
  if (chip) chip.textContent = (payload && payload.user && payload.user.username) ? payload.user.username : 'Demo';
})();

// ---------- Quick styles for UX ----------
(function(){
  const css = `
    .inline-error{ color:#c62828; font-size:12px; margin-top:4px; }
    .is-loading{ opacity:.7 }
    @keyframes rowflash { 0%{ background:#fff3cd } 100%{ background:transparent } }
    .flash{ animation: rowflash 1s ease-in-out 1 }
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
})();

// ---------- Config (catálogos UI) ----------
const RISK_OPTIONS = ['Clase I', 'Clase II', 'Clase III'];
const USE_OPTIONS  = ['Diagnóstico', 'Tratamiento', 'Monitoreo', 'Prevención', 'Rehabilitación', 'Otro'];

// ---------- Navegación ----------
const sidebar = document.getElementById('sidebar');
const menuBtn = document.getElementById('menuBtn');
if (menuBtn) menuBtn.addEventListener('click', ()=> sidebar && sidebar.classList.toggle('open'));
document.querySelectorAll('.nav a[data-section]').forEach(link=>{
  link.addEventListener('click', (e)=>{
    e.preventDefault();
    const id = link.getAttribute('data-section');
    document.querySelectorAll('.section').forEach(s=> s.style.display = (s.id===id?'block':'none'));
    document.querySelectorAll('.nav a').forEach(a=> a.classList.toggle('active', a===link));
    if(innerWidth<720 && sidebar) sidebar.classList.remove('open');

    refreshKPIs().catch(()=>{});
    if (id === 'dashboard') { renderActivity().catch(()=>{}); }
  });
});

const logoutBtn = document.getElementById('logout');
if (logoutBtn) logoutBtn.addEventListener('click', (e)=>{
  e.preventDefault(); sessionStorage.removeItem('medsys_token'); localStorage.removeItem('medsys_token'); location.href='signin.html';
});

// ---------- Helpers ----------
const API = 'http://localhost:3000/api';

window.addEventListener('error', e => {
  console.error('UNCAUGHT ERROR:', e.error || e.message || e);
});
window.addEventListener('unhandledrejection', e => {
  console.error('UNHANDLED PROMISE REJECTION:', e.reason);
});

async function fetchJson(url, options = {}){
  const token = sessionStorage.getItem('medsys_token') || localStorage.getItem('medsys_token') || '';
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(token ? { Authorization: 'Bearer ' + token } : {})
  };
  const r = await fetch(url, { ...options, headers });
  let data = null; try{ data = await r.json(); }catch(e){}
  if(!r.ok){
    const msg = (data && (data.error || data.message)) || ('HTTP '+r.status);
    const err = new Error(msg);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

function setText(id, val){ const el = document.getElementById(id); if(el) el.textContent = String(val); }
function showToast(msg){
  const t = document.getElementById('toast'); if(!t) return;
  const m = document.getElementById('toastMsg'); if(m) m.textContent = msg;
  t.classList.add('show'); setTimeout(()=> t.classList.remove('show'), 2500);
}
function fmtDateISO(s){ if(!s) return ''; const d=new Date(s); const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return y+'-'+m+'-'+dd; }
function money(v, symbol = '$') {
  const n = Number(v || 0);
  const fmt = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol + fmt.format(isFinite(n) ? n : 0);
}

// Render helpers (tables)
function setTableLoading(tableEl, text='Cargando…'){
  if(!tableEl) return;
  const tbody = tableEl.querySelector('tbody'); if(!tbody) return;
  const cols = (tableEl.querySelectorAll('thead th')||[]).length || 1;
  tbody.innerHTML = '<tr class="is-loading"><td colspan="'+cols+'">'+text+'</td></tr>';
}
function setTableEmpty(tableEl, text='Sin datos'){
  if(!tableEl) return;
  const tbody = tableEl.querySelector('tbody'); if(!tbody) return;
  const cols = (tableEl.querySelectorAll('thead th')||[]).length || 1;
  tbody.innerHTML = '<tr><td colspan="'+cols+'">'+text+'</td></tr>';
}
function renderTable(el, rows, mapRow, opts){
  if(!el) return;
  const tbody = el.querySelector('tbody');
  if(!tbody) return;
  if (!rows || !rows.length) { setTableEmpty(el); return; }
  tbody.innerHTML = rows.map(mapRow).join('');
  if (opts && opts.highlightId != null) {
    const tr = tbody.querySelector('tr[data-id="'+opts.highlightId+'"]');
    if (tr) { tr.classList.add('flash'); setTimeout(()=>tr.classList.remove('flash'), 1200); }
  }
}

/* ---------- Modal helper ---------- */
const modalEl       = document.getElementById('modalBackdrop');
const modalTitle    = document.getElementById('modalTitle');
const modalForm     = document.getElementById('modalForm');
const modalFields   = document.getElementById('modalFields');
const modalCloseBtn = document.getElementById('modalClose');
const modalCancelBtn= document.getElementById('modalCancel');
const modalSubmitBtn= document.getElementById('modalSubmit');

function buildField(f, initial) {
  const wrap = document.createElement('div');
  wrap.className = 'form-control' + (f.span2 ? ' span-2' : '');

  const label = document.createElement('label');
  label.textContent = f.label || f.name;
  label.style.display = 'block';
  label.style.marginBottom = '6px';
  wrap.appendChild(label);

  let input;
  if (f.type === 'select') {
    input = document.createElement('select');
    (f.options || []).forEach(opt => {
      let value, text;
      if (typeof opt === 'string') { value = opt; text = opt; }
      else if (Array.isArray(opt)) { value = opt[0]; text = opt[1]; }
      else { value = opt.value; text = opt.label; }
      const o = document.createElement('option');
      o.value = value != null ? value : '';
      o.textContent = text != null ? text : String(o.value);
      input.appendChild(o);
    });
  } else if (f.type === 'textarea') {
    input = document.createElement('textarea');
  } else {
    input = document.createElement('input');
    input.type = f.type || 'text';
    if (f.step) input.step = f.step;
    if (f.min != null) input.min = f.min;
    if (f.max != null) input.max = f.max;
  }

  input.name = f.name;
  if (f.placeholder) input.placeholder = f.placeholder;
  if (f.required) input.required = true;
  if (f.disabled) input.disabled = true;

  const initVal = (f.value !== undefined ? f.value : (initial ? initial[f.name] : undefined));
  if (initVal !== undefined && initVal !== null) input.value = String(initVal);

  wrap.appendChild(input);
  return wrap;
}

function clearFieldErrors(){
  if (!modalFields) return;
  modalFields.querySelectorAll('.inline-error').forEach(el => el.remove());
}
function setFieldError(name, msg){
  if (!modalFields) return;
  const input = modalFields.querySelector('[name="'+name+'"]');
  if (!input) return;
  let err = document.createElement('div');
  err.className = 'inline-error';
  err.textContent = msg;
  input.parentElement.appendChild(err);
}

// focus trap helpers
let _trapHandler = null;
let _lastFocus = null;
function enableFocusTrap(){
  const focusables = modalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const first = focusables[0], last = focusables[focusables.length - 1];
  _trapHandler = function(e){
    if (e.key === 'Escape'){ window.modal.close(); }
    if (e.key !== 'Tab') return;
    if (e.shiftKey){
      if (document.activeElement === first){ e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last){ e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', _trapHandler);
}
function disableFocusTrap(){
  if (_trapHandler){ document.removeEventListener('keydown', _trapHandler); _trapHandler = null; }
}

window.modal = {
  open(config, initial = {}) {
    if(!modalEl) return alert('No se encontró el modal en el HTML');
    _lastFocus = document.activeElement;
    const title = config.title || 'Formulario';
    const fields = config.fields || [];
    const submitText = config.submitText || 'Guardar';
    const onSubmit = config.onSubmit;

    if (modalTitle) modalTitle.textContent = title;
    if (modalSubmitBtn) { modalSubmitBtn.textContent = submitText; modalSubmitBtn.disabled = false; modalSubmitBtn.removeAttribute('aria-busy'); }
    clearFieldErrors();
    if (modalFields) modalFields.innerHTML = '';
    fields.forEach(f => { if (modalFields) modalFields.appendChild(buildField(f, initial)); });

    modalEl.classList.add('show');

    setTimeout(()=>{
      const firstInput = modalFields && modalFields.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled])');
      if (firstInput) firstInput.focus();
    }, 0);

    enableFocusTrap();

    if (modalForm) modalForm.onsubmit = async (e) => {
      e.preventDefault();
      clearFieldErrors();
      const raw = Object.fromEntries(new FormData(modalForm).entries());
      fields.forEach(f => { if (f.disabled && initial && initial[f.name] !== undefined) raw[f.name] = initial[f.name]; });

      let hasErr = false;
      fields.forEach(f=>{
        if (f.required && (!raw[f.name] || String(raw[f.name]).trim() === '')){
          hasErr = true; setFieldError(f.name, 'Requerido');
        }
      });
      if (hasErr) return;

      try {
        if (modalSubmitBtn){ modalSubmitBtn.disabled = true; modalSubmitBtn.setAttribute('aria-busy','true'); modalSubmitBtn.textContent = 'Guardando…'; }
        if (onSubmit) await onSubmit(raw);
        window.modal.close();
      } catch (err) {
        console.error(err);
        if (err && err.data && err.data.errors && typeof err.data.errors === 'object'){
          Object.keys(err.data.errors).forEach(k=> setFieldError(k, String(err.data.errors[k])));
        }else{
          setFieldError(fields[0] && fields[0].name || 'form', String(err.message || 'Error al guardar'));
        }
        if (modalSubmitBtn){ modalSubmitBtn.disabled = false; modalSubmitBtn.removeAttribute('aria-busy'); modalSubmitBtn.textContent = submitText; }
      }
    };
  },
  close() {
    if(!modalEl) return;
    modalEl.classList.remove('show');
    if (modalForm) modalForm.reset();
    disableFocusTrap();
    if (_lastFocus && typeof _lastFocus.focus === 'function'){ try{ _lastFocus.focus(); }catch(e){} }
  }
};
if (modalCloseBtn)  modalCloseBtn.addEventListener('click', () => window.modal.close());
if (modalCancelBtn) modalCancelBtn.addEventListener('click', () => window.modal.close());
if (modalEl)        modalEl.addEventListener('click', (e) => { if (e.target === modalEl) window.modal.close(); });

// Back-compat alias
var modal = window.modal;

// ---------- API clients ----------
const ProductosAPI = {
  list:   ()=> fetchJson(API+'/productos'),
  create: (b)=> fetchJson(API+'/productos', {method:'POST', body:JSON.stringify(b)}),
  update: (id,b)=> fetchJson(API+'/productos/'+id, {method:'PUT', body:JSON.stringify(b)}),
  remove: (id)=> fetchJson(API+'/productos/'+id, {method:'DELETE'})
};
const ProveedoresAPI = {
  list:   ()=> fetchJson(API+'/proveedores'),
  create: (b)=> fetchJson(API+'/proveedores', {method:'POST', body:JSON.stringify(b)}),
  update: (id,b)=> fetchJson(API+'/proveedores/'+id, {method:'PUT', body:JSON.stringify(b)}),
  remove: (id)=> fetchJson(API+'/proveedores/'+id, {method:'DELETE'})
};
const PersonalAPI = {
  list:   ()=> fetchJson(API+'/personal'),
  create: (b)=> fetchJson(API+'/personal', {method:'POST', body:JSON.stringify(b)}),
  update: (id,b)=> fetchJson(API+'/personal/'+id, {method:'PUT', body:JSON.stringify(b)}),
  remove: (id)=> fetchJson(API+'/personal/'+id, {method:'DELETE'})
};
const RechazosAPI = {
  list:   ()=> fetchJson(API+'/rechazos'),
  create: (b)=> fetchJson(API+'/rechazos', {method:'POST', body:JSON.stringify(b)}),
  update: (id,b)=> fetchJson(API+'/rechazos/'+id, {method:'PUT', body:JSON.stringify(b)}),
  remove: (id)=> fetchJson(API+'/rechazos/'+id, {method:'DELETE'})
};
const MaterialesAPI = {
  list:   ()=> fetchJson(API+'/materiales'),
  create: (b)=> fetchJson(API+'/materiales', {method:'POST', body:JSON.stringify(b)}),
  update: (id,b)=> fetchJson(API+'/materiales/'+id, {method:'PUT', body:JSON.stringify(b)}),
  remove: (id)=> fetchJson(API+'/materiales/'+id, {method:'DELETE'})
};
const EnsamblesAPI = {
  list:   ()=> fetchJson(API+'/ensambles'),
  create: (b)=> fetchJson(API+'/ensambles', {method:'POST', body:JSON.stringify(b)}),
  update: (id,b)=> fetchJson(API+'/ensambles/'+id, {method:'PUT', body:JSON.stringify(b)}),
  remove: (id, cascade)=> fetchJson(API+'/ensambles/'+id + (cascade?'?cascade=1':''), {method:'DELETE'})
};
const VentasAPI = {
  list:   ()=> fetchJson(API+'/ventas'),
  create: (b)=> fetchJson(API+'/ventas', {method:'POST', body:JSON.stringify(b)}),
  remove: (id, restock)=> fetchJson(API+'/ventas/'+id + (restock?'?restock=1':''), {method:'DELETE'})
};

// ---------- KPI ----------
async function refreshKPIs(){
  try{
    const [productos, mats, rechazos] = await Promise.all([
      ProductosAPI.list(),
      MaterialesAPI.list(),
      RechazosAPI.list()
    ]);

    const totalItems = productos.length + mats.length;
    const conStock = productos.filter(p=>Number(p.Stock_Actual)>0).length;
    const lowStock = productos.filter(p=>{
      const stock = Number(p.Stock_Actual || 0);
      const min   = Number(p.Stock_Minimo || 0);
      return stock <= min;
    }).length;

    setText('kpiDevices', totalItems);
    setText('kpiStock', conStock);
    setText('kpiPending', lowStock);
    setText('kpiRejects', rechazos.length);

    const mini = document.getElementById('miniChart');
    if (mini) {
      const groups = {};
      (productos || []).forEach(p => {
        const k = (p.Clasificacion_Riesgo || 'N/A');
        const s = Number(p.Stock_Actual || 0);
        groups[k] = (groups[k] || 0) + s;
      });
      const entries = Object.entries(groups);
      if (entries.length === 0) {
        mini.textContent = 'Sin datos';
      } else {
        entries.sort((a,b)=> b[1]-a[1]);
        mini.innerHTML = entries.map(([k,v])=> '<div>'+k+': <strong>'+v+'</strong></div>').join('');
      }
    }
  }catch(e){
    console.warn('refreshKPIs error:', e);
    setText('kpiDevices', '—');
    setText('kpiStock', '—');
    setText('kpiPending', '—');
    setText('kpiRejects', '—');
    const mini = document.getElementById('miniChart'); if(mini) mini.textContent = '—';
  }
}

// ---------- Actividad reciente ----------
async function renderActivity(){
  const table = document.getElementById('ordersTable');
  if (!table) return;

  setTableLoading(table, 'Cargando actividad…');

  try{
    const [ventas, ensambles, rechazos] = await Promise.all([
      VentasAPI.list().catch(()=>[]),
      EnsamblesAPI.list().catch(()=>[]),
      RechazosAPI.list().catch(()=>[])
    ]);

    const events = [];

    (ventas || []).forEach(v => {
      events.push({
        id: v.id,
        item: 'Venta a ' + (v.Cliente || '—'),
        qty: Number(v.Items || 0),
        estado: 'Venta',
        fecha: v.Fecha
      });
    });

    (ensambles || []).forEach(e => {
      events.push({
        id: e.id,
        item: 'Ensamble ' + (e.Producto || ''),
        qty: 1,
        estado: 'Ensamble',
        fecha: e.Fecha
      });
    });

    (rechazos || []).forEach(r => {
      events.push({
        id: r.id,
        item: 'Rechazo ' + (r.Dispositivo || ''),
        qty: Number(r.Cantidad || 0),
        estado: 'Rechazo',
        fecha: r.Fecha
      });
    });

    events.sort(function(a,b){ return new Date(b.fecha) - new Date(a.fecha); });
    renderTable(table, events.slice(0,6), function(ev){
      return '<tr>'
        +'<td>'+ev.id+'</td>'
        +'<td>'+ev.item+'</td>'
        +'<td>'+ev.qty+'</td>'
        +'<td>'+ev.estado+'</td>'
        +'</tr>';
    });
  }catch(e){
    console.warn('renderActivity error:', e);
    setTableEmpty(table, 'Sin actividad');
  }
}

// ---------- Productos (render + filtros) ----------
function renderProductosTable(productos){
  const table = document.getElementById('productosTable');
  if (!table) return;
  if (!productos) { setTableEmpty(table); return; }
  renderTable(table, productos, function(p){
    return '<tr data-id="'+p.id+'">'
      +'<td>'+p.id+'</td>'
      +'<td>'+p.Nombre+'</td>'
      +'<td>'+(p.Clasificacion_Riesgo || '')+'</td>'
      +'<td>'+(p.Uso_Especifico || '')+'</td>'
      +'<td>'+(p.Aprobado_Por || '')+'</td>'
      +'<td>'+money(p.Precio)+'</td>'
      +'<td>'+p.Stock_Actual+'</td>'
      +'<td><button class="button secondary btn-edit" data-entity="producto">Editar</button>'
      +'    <button class="button ghost btn-del" data-entity="producto">Eliminar</button></td>'
      +'</tr>';
  });
}
function applyProductoFilters(){
  const riskSel = document.getElementById('filterRisk');
  const useSel  = document.getElementById('filterUse');
  const risk = riskSel ? String(riskSel.value || '') : '';
  const uso  = useSel  ? String(useSel.value  || '') : '';
  let rows = (window.__productosCache || []).slice();

  if (risk) {
    const rlow = risk.toLowerCase();
    rows = rows.filter(function(p){ return String(p.Clasificacion_Riesgo || '').toLowerCase() === rlow; });
  }
  if (uso) {
    const ulow = uso.toLowerCase();
    rows = rows.filter(function(p){ return String(p.Uso_Especifico || '').toLowerCase() === ulow; });
  }
  renderProductosTable(rows);
}
async function renderProductosFromAPI(){
  const table = document.getElementById('productosTable'); setTableLoading(table);
  try{
    const productos = await ProductosAPI.list();
    window.__productosCache = productos || [];
    applyProductoFilters();
  }catch(err){
    console.error(err);
    setTableEmpty(table, 'Error cargando productos');
    showToast('Error cargando productos');
  }
}

// ---------- Render secciones ----------
async function renderOtros(){
  await renderActivity().catch(()=>{});

  // Materiales
  try{
    const table = document.getElementById('materialesTable'); setTableLoading(table);
    const mats = await MaterialesAPI.list();
    renderTable(table, mats, function(r){
      return '<tr data-id="'+r.id+'">'
        +'<td>'+r.id+'</td>'
        +'<td>'+r.Nombre+'</td>'
        +'<td>'+money(r.Costo_Unitario)+'</td>'
        +'<td>'+(r.Uso_Esteril ? 'Sí':'No')+'</td>'
        +'<td><button class="button secondary btn-edit" data-entity="material">Editar</button>'
        +'    <button class="button ghost btn-del" data-entity="material">Eliminar</button></td>'
        +'</tr>';
    });
  }catch(e){ console.warn('Materiales API', e); }

  // Proveedores
  try{
    const table = document.getElementById('proveedoresTable'); setTableLoading(table);
    const provs = await ProveedoresAPI.list();
    renderTable(table, provs, function(r){
      return '<tr data-id="'+r.id+'"><td>'+r.id+'</td><td>'+r.Nombre+'</td><td>'+(r.Contacto||'')+'</td><td>'+(r.Telefono||'')+'</td><td>'+(r.Email||'')+'</td>'
        +'<td><button class="button secondary btn-edit" data-entity="proveedor">Editar</button>'
        +'    <button class="button ghost btn-del" data-entity="proveedor">Eliminar</button></td></tr>';
    });
  }catch(e){ console.warn('Proveedores API', e); }

  // Ensambles
  try{
    const table = document.getElementById('ensamblesTable'); setTableLoading(table);
    const ens = await EnsamblesAPI.list();
    renderTable(table, ens, function(r){
      return '<tr data-id="'+r.id+'"><td>'+r.id+'</td><td>'+(r.Producto||'')+'</td><td>'+(r.Componentes||'')+'</td><td>'+fmtDateISO(r.Fecha)+'</td><td>'+(r.Responsable||'')+'</td>'
        +'<td><button class="button secondary btn-edit" data-entity="ensamble">Editar</button>'
        +'    <button class="button ghost btn-del" data-entity="ensamble">Eliminar</button></td></tr>';
    });
  }catch(e){ console.warn('Ensambles API', e); }

  // Rechazos (Scrap) — ahora con “Reportado por”
  try{
    const table = document.getElementById('scrapTable'); setTableLoading(table);
    const rs = await RechazosAPI.list();
    renderTable(table, rs, function(r){
      return '<tr data-id="'+r.id+'">'
        +'<td>'+r.id+'</td>'
        +'<td>'+(r.Dispositivo||'')+'</td>'
        +'<td>'+(r.Causa||'')+'</td>'
        +'<td>'+(r.Cantidad||0)+'</td>'
        +'<td>'+fmtDateISO(r.Fecha)+'</td>'
        +'<td>'+(r.Reportado_Por || r.ReportadoPor || '')+'</td>'
        +'<td><button class="button secondary btn-edit" data-entity="rechazo">Editar</button>'
        +'    <button class="button ghost btn-del" data-entity="rechazo">Eliminar</button></td>'
        +'</tr>';
    });
  }catch(e){ console.warn('Rechazos API', e); }

  // Personal
  try{
    const table = document.getElementById('personalTable'); setTableLoading(table);
    const per = await PersonalAPI.list();
    renderTable(table, per, function(r){
      return '<tr data-id="'+r.id+'"><td>'+r.id+'</td><td>'+r.Nombre+'</td><td>'+(r.Rol||'')+'</td><td>'+(r.Turno||'')+'</td><td>'+(r.Correo||'')+'</td>' +'<td>'+(r.Telefono||'')+'</td>'
        +'<td><button class="button secondary btn-edit" data-entity="persona">Editar</button>'
        +'    <button class="button ghost btn-del" data-entity="persona">Eliminar</button></td></tr>';
    });
  }catch(e){ console.warn('Personal API', e); }

  // Ventas
  const ventasTable = document.getElementById('ventasTable');
  if (ventasTable) {
    try{
      setTableLoading(ventasTable);
      const vs = await VentasAPI.list();
      renderTable(ventasTable, vs, function(r){
        return '<tr data-id="'+r.id+'"><td>'+r.id+'</td><td>'+fmtDateISO(r.Fecha)+'</td><td>'+(r.Cliente||'')+'</td><td>'+money(r.Total)+'</td><td>'+(r.Items||0)+'</td>'
          +'<td><button class="button ghost btn-del" data-entity="venta">Eliminar</button></td></tr>';
      }, window.__highlight && window.__highlight.venta ? { highlightId: window.__highlight.venta } : undefined);
      if (window.__highlight) delete window.__highlight.venta;
    }catch(e){ console.warn('Ventas API', e); }
  }
}

// ---------- Dashboard Auto-Refresh ----------
async function refreshDashboard(){
  await Promise.all([refreshKPIs(), renderOtros()]);
}
const DASH_INTERVAL_MS = 15000;
setInterval(function(){
  refreshKPIs().catch(()=>{});
  const isDashActive = document.querySelector('.nav a.active[data-section="dashboard"]');
  if (isDashActive) { renderActivity().catch(()=>{}); }
}, DASH_INTERVAL_MS);
document.addEventListener('visibilitychange', function(){
  if (!document.hidden) {
    refreshKPIs().catch(()=>{});
    const isDashActive = document.querySelector('.nav a.active[data-section="dashboard"]');
    if (isDashActive) { renderActivity().catch(()=>{}); }
  }
});

// ---------- Carga inicial ----------
refreshDashboard().catch(function(e){ console.error('refreshDashboard failed:', e); });
renderProductosFromAPI().catch(function(e){ console.error('renderProductosFromAPI failed:', e); });

// Wire up Productos filters
document.addEventListener('DOMContentLoaded', function(){
  const riskSel = document.getElementById('filterRisk');
  const useSel  = document.getElementById('filterUse');
  const clearBtn= document.getElementById('clearProdFilters');
  if (riskSel) riskSel.addEventListener('change', applyProductoFilters);
  if (useSel)  useSel.addEventListener('change', applyProductoFilters);
  if (clearBtn) clearBtn.addEventListener('click', function(){
    if (riskSel) riskSel.value = '';
    if (useSel)  useSel.value = '';
    applyProductoFilters();
  });
});

// ---------- Crear ----------
const addProductoBtn = document.getElementById('addProducto');
if (addProductoBtn) addProductoBtn.addEventListener('click', async function(){
  let personal = [];
  try { personal = await PersonalAPI.list(); } catch (e) { console.warn('No se pudo cargar personal:', e); }
  const aprobOptions = (personal && personal.length)
    ? personal.map(p => p.Nombre)
    : ['-- Sin personal --'];

  modal.open({
    title:'Agregar producto',
    fields:[
      {name:'Nombre', label:'Nombre', required:true, span2:true},
      {name:'Descripcion', label:'Descripción', span2:true},
      {name:'Clasificacion_Riesgo', label:'Riesgo', type:'select', options:RISK_OPTIONS},
      {name:'Aprobado_Por', label:'Aprobado por', type:'select', options:aprobOptions},
      {name:'Uso_Especifico', label:'Uso', type:'select', options:USE_OPTIONS},
      {name:'Precio', label:'Precio', type:'number', step:'0.01'},
      {name:'Stock_Actual', label:'Stock', type:'number'},
      {name:'Stock_Minimo', label:'Stock mínimo', type:'number'}
    ],
    onSubmit: async function(v){
      await ProductosAPI.create({
        nombre:v.Nombre, descripcion:v.Descripcion, riesgo:v.Clasificacion_Riesgo,
        aprobadoPor:v.Aprobado_Por, uso:v.Uso_Especifico, precio:Number(v.Precio||0),
        stock:Number(v.Stock_Actual||0), stockMin:Number(v.Stock_Minimo||0)
      });
      showToast('Producto agregado'); await renderProductosFromAPI(); await refreshDashboard();
    }
  });
});

// ---- Materiales ----
const addMaterialBtn = document.getElementById('addMaterial');
if (addMaterialBtn) addMaterialBtn.addEventListener('click', async function(){
  let provs = [];
  try{ provs = await ProveedoresAPI.list(); }catch(e){ console.warn('Proveedores para Material:', e); }
  const provOptions = (provs && provs.length)
    ? provs.map(function(p){ return [String(p.id), p.id+' - '+p.Nombre]; })
    : [['0', '-- Sin proveedores --']];

  modal.open({
    title:'Agregar material',
    fields:[
      {name:'nombre', label:'Nombre', required:true, span2:true},
      {name:'tipo', label:'Tipo'},
      {name:'costo', label:'Costo unitario', type:'number', step:'0.01'},
      {name:'certificado', label:'Certificado sanitario', type:'select', options:[['1','Sí'],['0','No']]},
      {name:'esteril', label:'Uso estéril', type:'select', options:[['1','Sí'],['0','No']]},
      {name:'idProveedor', label:'Proveedor', type:'select', options:provOptions, required:true}
    ],
    onSubmit: async function(v){
      await MaterialesAPI.create({
        nombre: v.nombre,
        tipo: v.tipo,
        costo: Number(v.costo || 0),
        certificado: String(v.certificado)==='1',
        esteril: String(v.esteril)==='1',
        idProveedor: Number(v.idProveedor || 0)
      });
      showToast('Material agregado'); await refreshDashboard();
    }
  });
});

// ---- Ensambles ----
const addEnsambleBtn = document.getElementById('addEnsamble');
if (addEnsambleBtn) addEnsambleBtn.addEventListener('click', async function () {
  let productos = [];
  let materiales = [];
  let personal = [];
  try {
    const rs = await Promise.all([
      ProductosAPI.list().catch(() => []),
      MaterialesAPI.list().catch(() => []),
      PersonalAPI.list().catch(() => [])
    ]);
    productos = rs[0]; materiales = rs[1]; personal = rs[2];
  } catch (e) {
    console.error(e); showToast('No se pudo cargar catálogos'); return;
  }

  const prodOptions = productos.map(p => `${p.id} - ${p.Nombre}`);
  const personalOptions = (personal && personal.length) ? personal.map(p => p.Nombre) : ['-- Sin personal --'];
  const detalles = [];

  modal.open({
    title: 'Registrar ensamble',
    fields: [
      { name: 'ID_DispositivoMed', label: 'Producto', type: 'select', options: prodOptions, required: true },
      { name:'Cantidad', label:'Cantidad a fabricar', type:'number', min:1, value:1, required:true },
      { name: 'Fecha', label: 'Fecha', type: 'date' },
      { name: 'Responsable', label: 'Responsable', type: 'select', options: personalOptions },
      { name: '__detalles__', label: 'Materiales usados', type: 'textarea', span2: true, disabled: true, value: '' }
    ],
    onSubmit: async function(v){
      const idTxt = String(v.ID_DispositivoMed).split(' - ')[0];
      await EnsamblesAPI.create({
        idDispositivo: Number(idTxt||0),
        componentes: v.Componentes,
        fecha: v.Fecha,
        responsable: v.Responsable,
        cantidad: Number(v.Cantidad || 1)
      });
      showToast('Ensamble registrado');
      await renderProductosFromAPI();
      await refreshDashboard();
    }
  });

  // UI para materiales usados
  setTimeout(() => {
    const holder = modalFields && modalFields.querySelector('[name="__detalles__"]');
    if (!holder) return;
    const wrap = holder.parentElement;
    wrap.innerHTML = `
      <label style="display:block;margin-bottom:6px;">Materiales usados</label>
      <div class="det-row" style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <select class="det-mat" style="flex:1;min-width:220px;"></select>
        <input class="det-qty" type="number" min="1" value="1" style="width:110px;" />
        <button type="button" class="button secondary det-add">+ Agregar</button>
      </div>
      <div class="det-list" style="display:flex;flex-direction:column;gap:6px;"></div>
      <div class="det-empty" style="color:#6b7280;font-size:13px;">Sin materiales aún.</div>
    `;

    const sel = wrap.querySelector('.det-mat');
    const qty = wrap.querySelector('.det-qty');
    const add = wrap.querySelector('.det-add');
    const list = wrap.querySelector('.det-list');
    const empty = wrap.querySelector('.det-empty');

    materiales.forEach(m => {
      const o = document.createElement('option');
      o.value = String(m.id);
      o.textContent = `${m.id} - ${m.Nombre}${m.Tipo ? ' (' + m.Tipo + ')' : ''}`;
      sel.appendChild(o);
    });

    function renderList () {
      list.innerHTML = '';
      if (!detalles.length) { empty.style.display = 'block'; return; }
      empty.style.display = 'none';
      detalles.forEach((d, i) => {
        const mat = materiales.find(x => Number(x.id) === Number(d.idMaterial));
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.innerHTML =
          `<div style="flex:1;">${mat ? mat.Nombre : ('ID ' + d.idMaterial)} × <strong>${d.cantidad}</strong></div>
           <button type="button" class="button ghost det-del" data-i="${i}">Quitar</button>`;
        list.appendChild(row);
      });
    }

    add.addEventListener('click', () => {
      const idMaterial = Number(sel.value || 0);
      const cantidad = Math.max(1, Number(qty.value || 1));
      if (!idMaterial) return;
      detalles.push({ idMaterial, cantidad });
      renderList();
      qty.value = '1';
    });

    list.addEventListener('click', e => {
      const b = e.target.closest('.det-del');
      if (!b) return;
      const i = Number(b.dataset.i);
      detalles.splice(i, 1);
      renderList();
    });

    renderList();
  }, 0);
});

// ---- Rechazos (Scrap) ----
const addScrapBtn = document.getElementById('addScrap');
if (addScrapBtn) addScrapBtn.addEventListener('click', async function(){
  let productos = [];
  let personal  = [];
  try{
    productos = await ProductosAPI.list();
  }catch(e){
    console.error(e); showToast('No se pudo cargar dispositivos'); return;
  }
  try{
    personal = await PersonalAPI.list();
  }catch(e){
    console.warn('No se pudo cargar personal:', e);
    personal = [];
  }

  const options = productos.map(function(p){ return p.id+' - '+p.Nombre; });
  const personalOptions = (personal && personal.length) ? personal.map(p => p.Nombre) : ['-- Sin personal --'];

  modal.open({
    title:'Registrar rechazo',
    fields:[
      {name:'ID_DispositivoMed', label:'Dispositivo', type:'select', options, required:true},
      {name:'Causa', label:'Causa', required:true},
      {name:'Cantidad', label:'Cantidad', type:'number'},
      {name:'Fecha', label:'Fecha', type:'date'},
      {name:'Reportado_Por', label:'Reportado por', type:'select', options: personalOptions}
    ],
    onSubmit: async function(v){
      try{
        const idTxt = String(v.ID_DispositivoMed).split(' - ')[0];
        await RechazosAPI.create({
          idDispositivo:Number(idTxt||0),
          causa:v.Causa,
          cantidad:Number(v.Cantidad||0),
          fecha:v.Fecha,
          reportadoPor: v.Reportado_Por
        });
        showToast('Rechazo registrado'); await refreshDashboard();
      }catch(err){ console.error(err); showToast('Error: '+err.message); }
    }
  });
});

// ---- Personal ----
const addPersonaBtn = document.getElementById('addPersona');
if (addPersonaBtn) addPersonaBtn.addEventListener('click', ()=>{
  modal.open({
    title:'Agregar personal',
    fields:[
      {name:'Nombre', label:'Nombre', required:true, span2:true},
      {name:'Rol', label:'Rol'},
      {name:'Turno', label:'Turno', type:'select', options:['Día','Noche','Mixto']},
      {name:'Correo', label:'Correo', type:'email', span2:true},
      {name:'FechaIngreso', label:'Fecha de ingreso', type:'date'},
      {name:'Telefono', label:'Teléfono'}
    ],
    onSubmit: async (v)=>{
      await PersonalAPI.create({
        nombre: v.Nombre, rol: v.Rol, turno: v.Turno, correo: v.Correo,
        fechaIngreso: v.FechaIngreso, telefono: v.Telefono
      });
      showToast('Persona agregada'); await refreshDashboard();
    }
  });
});

// ---- Ventas ----
const addVentaBtn = document.getElementById('addVenta');
if (addVentaBtn) addVentaBtn.addEventListener('click', async function(){
  let productos = [];
  let personal  = [];
  try{
    productos = await ProductosAPI.list();
  }catch(e){
    console.error(e); showToast('No se pudo cargar dispositivos'); return;
  }
  try{
    personal = await PersonalAPI.list();
  }catch(e){
    console.warn('No se pudo cargar personal:', e);
    personal = [];
  }

  const productoOptions = productos.map(function(p){ return p.id+' - '+p.Nombre+' (stock: '+p.Stock_Actual+')'; });
  const personalOptions = personal.map(function(per){
    return { value: per.id, label: per.Nombre + (per.Rol ? ' ('+per.Rol+')' : '') };
  });

  let preIdPersonal = '';
  try{
    const token = sessionStorage.getItem('medsys_token') || localStorage.getItem('medsys_token');
    const payload = parseTokenAny(token);
    if (payload && payload.user && payload.user.idPersonal) preIdPersonal = String(payload.user.idPersonal);
  }catch{}

  const hoyISO = new Date().toISOString().slice(0,10);

  modal.open({
    title:'Registrar venta',
    fields:[
      {name:'Cliente', label:'Cliente', required:true},
      {name:'Fecha', label:'Fecha', type:'date', value: hoyISO},
      {name:'idPersonal', label:'Atendido por', type:'select', options: personalOptions, value: preIdPersonal},
      {name:'ID_DispositivoMed', label:'Producto', type:'select', options: productoOptions, required:true},
      {name:'Cantidad', label:'Cantidad', type:'number', min:1, value:1, required:true},
      {name:'Precio', label:'Precio unitario', type:'number', step:'0.01'},
      {name:'Importe', label:'Total (cant × precio)', type:'number', step:'0.01', disabled:true}
    ],
    onSubmit: async function(v){
      try{
        const idTxt   = String(v.ID_DispositivoMed).split(' - ')[0];
        const idProd  = Number(idTxt || 0);
        const qty     = Number(v.Cantidad || 1);

        let price = Number(v.Precio || 0);
        if (!price || price <= 0) {
          const prod = productos.find(p => Number(p.id) === idProd);
          price = Number(prod && prod.Precio != null ? prod.Precio : 0);
        }

        const idPersonal = (v.idPersonal === '' || v.idPersonal == null) ? null : Number(v.idPersonal);
        const payload = {
          cliente: v.Cliente,
          fecha: v.Fecha || hoyISO,
          idPersonal,
          items: [{ idDispositivo: idProd, cantidad: qty, precioUnitario: price }]
        };

        const resp = await VentasAPI.create(payload);
        showToast('Venta registrada');
        window.__highlight = window.__highlight || {};
        if (resp && resp.id) window.__highlight.venta = Number(resp.id);
        await renderProductosFromAPI();
        await refreshDashboard();
      }catch(err){
        const msg = String(err.message || err);
        if (err.status === 409 || /Sin stock suficiente/i.test(msg)) {
          alert(msg);
        } else {
          console.error(err);
          showToast('Error: '+msg);
        }
      }
    }
  }, {
    Fecha: hoyISO,
    Cantidad: 1,
    Precio: '',
    Importe: ''
  });

  setTimeout(() => {
    const form = document.querySelector('.modal form') || document;
    const sel = form.querySelector('[name="ID_DispositivoMed"]');
    const qty = form.querySelector('[name="Cantidad"]');
    const prc = form.querySelector('[name="Precio"]');
    const tot = form.querySelector('[name="Importe"]');

    function parseId() {
      const raw = String(sel && sel.value || '');
      const id = Number(raw.split(' - ')[0] || 0);
      return Number.isFinite(id) ? id : 0;
    }

    function setPriceFromProduct() {
      const id = parseId();
      const p  = productos.find(x => Number(x.id) === id);
      if (!p) { if (prc) prc.value = ''; updateTotal(); return; }
      if (prc) prc.value = String(Number(p.Precio ?? 0).toFixed(2));
      updateTotal();
    }

    function updateTotal() {
      const q = Number(qty && qty.value || 0);
      const u = Number(prc && prc.value || 0);
      const total = q * u;
      if (tot) tot.value = isFinite(total) ? total.toFixed(2) : '';
    }

    sel && sel.addEventListener('change', setPriceFromProduct);
    qty && qty.addEventListener('input', updateTotal);
    prc && prc.addEventListener('input', updateTotal);

    setPriceFromProduct();
    updateTotal();
  }, 0);
});

// ---------- Editar/Eliminar (delegación) ----------
document.addEventListener('click', async function(e){
  const btnEdit = e.target.closest && e.target.closest('.btn-edit');
  const btnDel  = e.target.closest && e.target.closest('.btn-del');

  if(btnEdit){
    const entity = btnEdit.dataset.entity;
    const tr = btnEdit.closest('tr');

    if (entity === 'producto') {
      const id = Number(tr.dataset.id);
      let p = {};
      let personal = [];
      try {
        const results = await Promise.all([
          ProductosAPI.list().catch(()=>[]),
          PersonalAPI.list().catch(()=>[])
        ]);
        const list = results[0];
        personal = results[1] || [];
        p = (list || []).find(x => Number(x.id) === id) || {};
      } catch {}

      const aprobOptions = (personal && personal.length)
        ? personal.map(per => per.Nombre)
        : ['-- Sin personal --'];

      modal.open({
        title: 'Editar producto',
        fields: [
          {name:'id', label:'ID', type:'number', disabled:true},
          {name:'Nombre', label:'Nombre', span2:true},
          {name:'Descripcion', label:'Descripción', span2:true},
          {name:'Clasificacion_Riesgo', label:'Riesgo', type:'select', options:RISK_OPTIONS},
          {name:'Aprobado_Por', label:'Aprobado por', type:'select', options:aprobOptions},
          {name:'Uso_Especifico', label:'Uso', type:'select', options:USE_OPTIONS},
          {name:'Precio', label:'Precio', type:'number', step:'0.01'},
          {name:'Stock_Actual', label:'Stock', type:'number'},
          {name:'Stock_Minimo', label:'Stock mínimo', type:'number'}
        ],
        onSubmit: async (v) => {
          await ProductosAPI.update(id, {
            nombre: v.Nombre,
            descripcion: v.Descripcion,
            riesgo: v.Clasificacion_Riesgo,
            aprobadoPor: v.Aprobado_Por,
            uso: v.Uso_Especifico,
            precio: Number(v.Precio || 0),
            stock: Number(v.Stock_Actual || 0),
            stockMin: Number(v.Stock_Minimo || 0)
          });
          showToast('Producto actualizado');
          await renderProductosFromAPI(); await refreshDashboard();
        }
      }, {
        id: p.id,
        Nombre: p.Nombre || '',
        Descripcion: p.Descripcion || '',
        Clasificacion_Riesgo: p.Clasificacion_Riesgo || (RISK_OPTIONS[0] || ''),
        Aprobado_Por: p.Aprobado_Por || (aprobOptions[0] || ''),
        Uso_Especifico: p.Uso_Especifico || (USE_OPTIONS[0] || ''),
        Precio: p.Precio || 0,
        Stock_Actual: p.Stock_Actual || 0,
        Stock_Minimo: p.Stock_Minimo || 0
      });
    }

    if(entity==='material'){
      const id = Number(tr.dataset.id);
      const results = await Promise.all([
        MaterialesAPI.list().catch(function(){ return []; }),
        ProveedoresAPI.list().catch(function(){ return []; })
      ]);
      const mats = results[0], provs = results[1];
      const m = (mats || []).find(function(x){ return x.id===id; }) || {};
      const provOptions = (provs && provs.length)
        ? provs.map(function(p){ return [String(p.id), p.id+' - '+p.Nombre]; })
        : [['0','-- Sin proveedores --']];

      modal.open({
        title:'Editar material',
        fields:[
          {name:'id', label:'ID', type:'number', disabled:true},
          {name:'nombre', label:'Nombre', span2:true},
          {name:'tipo', label:'Tipo'},
          {name:'costo', label:'Costo unitario', type:'number', step:'0.01'},
          {name:'certificado', label:'Certificado sanitario', type:'select', options:[['1','Sí'],['0','No']]},
          {name:'esteril', label:'Uso estéril', type:'select', options:[['1','Sí'],['0','No']]},
          {name:'idProveedor', label:'Proveedor', type:'select', options:provOptions}
        ],
        onSubmit: async function(v){
          await MaterialesAPI.update(id, {
            nombre: v.nombre != null ? v.nombre : m.Nombre,
            tipo: v.tipo != null ? v.tipo : m.Tipo,
            costo: Number((v.costo != null ? v.costo : m.Costo_Unitario) || 0),
            certificado: String(v.certificado != null ? v.certificado : (m.Certificado_Sanitario ? '1':'0'))==='1',
            esteril: String(v.esteril != null ? v.esteril : (m.Uso_Esteril ? '1':'0'))==='1',
            idProveedor: Number((v.idProveedor != null ? v.idProveedor : m.ID_Proveedor) || 0)
          });
          showToast('Material actualizado');
          await refreshDashboard();
        }
      }, {
        id: m.id,
        nombre: m.Nombre,
        tipo: m.Tipo || '',
        costo: m.Costo_Unitario || 0,
        certificado: m.Certificado_Sanitario ? '1':'0',
        esteril: m.Uso_Esteril ? '1':'0',
        idProveedor: String(m.ID_Proveedor || '0')
      });
    }

    if (entity === 'ensamble') {
      const id = Number(tr.dataset.id);
      let cur = {}; let productos = []; let personal = [];
      try {
        const results = await Promise.all([EnsamblesAPI.list(), ProductosAPI.list(), PersonalAPI.list()]);
        cur = (results[0] || []).find(x => Number(x.id) === id) || {};
        productos = results[1] || [];
        personal = results[2] || [];
      } catch {}

      const prodOptions = productos.map(p => p.id + ' - ' + p.Nombre);
      const personalOptions = (personal && personal.length) ? personal.map(p => p.Nombre) : ['-- Sin personal --'];

      let initialProducto = '';
      if (cur && cur.Producto) {
        const match = productos.find(p => String(p.Nombre) === String(cur.Producto));
        if (match) initialProducto = match.id + ' - ' + match.Nombre;
      }
      const initialResp = cur && cur.Responsable ? String(cur.Responsable) : (personalOptions[0] || '');

      modal.open({
        title:'Editar ensamble',
        fields:[
          {name:'id', label:'ID', type:'number', disabled:true},
          {name:'ID_DispositivoMed', label:'Dispositivo', type:'select', options: prodOptions},
          {name:'Componentes', label:'Componentes', span2:true},
          {name:'Fecha', label:'Fecha', type:'date'},
          {name:'Responsable', label:'Responsable', type:'select', options: personalOptions}
        ],
        onSubmit: async (v)=>{
          const payload = {
            componentes: v.Componentes,
            fecha: v.Fecha,
            responsable: v.Responsable
          };
          if (v.ID_DispositivoMed && String(v.ID_DispositivoMed).trim() !== '') {
            const idTxt = String(v.ID_DispositivoMed).split(' - ')[0];
            payload.idDispositivo = Number(idTxt || 0);
          }
          await EnsamblesAPI.update(id, payload);
          showToast('Ensamble actualizado'); await refreshDashboard();
        }
      }, {
        id,
        ID_DispositivoMed: initialProducto,
        Componentes: cur.Componentes || '',
        Fecha: cur.Fecha ? fmtDateISO(cur.Fecha) : '',
        Responsable: initialResp
      });
    }

    if (entity === 'rechazo') {
      const id = Number(tr.dataset.id);
      let r = {}; let productos = []; let personal = [];
      try {
        const results = await Promise.all([
          RechazosAPI.list().catch(()=>[]),
          ProductosAPI.list().catch(()=>[]),
          PersonalAPI.list().catch(()=>[])
        ]);
        r = (results[0] || []).find(x => Number(x.id) === id) || {};
        productos = results[1] || [];
        personal = results[2] || [];
      } catch {}

      const options = productos.map(p => p.id + ' - ' + p.Nombre);
      const match = productos.find(p => Number(p.id) === Number(r.ID_DispositivoMed));
      const initialOption = match ? (match.id + ' - ' + match.Nombre) : '';
      const personalOptions = (personal && personal.length) ? personal.map(p => p.Nombre) : ['-- Sin personal --'];
      const initialReporter = (r && (r.Reportado_Por || r.ReportadoPor)) ? String(r.Reportado_Por || r.ReportadoPor) : (personalOptions[0] || '');

      modal.open({
        title:'Editar rechazo',
        fields:[
          {name:'id', label:'ID', type:'number', disabled:true},
          {name:'ID_DispositivoMed', label:'Dispositivo', type:'select', options},
          {name:'Causa', label:'Causa'},
          {name:'Cantidad', label:'Cantidad', type:'number'},
          {name:'Fecha', label:'Fecha', type:'date'},
          {name:'Reportado_Por', label:'Reportado por', type:'select', options: personalOptions}
        ],
        onSubmit: async (v)=>{
          const idTxt = String(v.ID_DispositivoMed).split(' - ')[0];
          await RechazosAPI.update(id, {
            idDispositivo:Number(idTxt||0),
            causa:v.Causa,
            cantidad:Number(v.Cantidad||0),
            fecha:v.Fecha,
            reportadoPor: v.Reportado_Por
          });
          showToast('Rechazo actualizado'); await refreshDashboard();
        }
      }, {
        id: r.id,
        ID_DispositivoMed: initialOption,
        Causa: r.Causa || '',
        Cantidad: r.Cantidad || 0,
        Fecha: r.Fecha ? fmtDateISO(r.Fecha) : '',
        Reportado_Por: initialReporter
      });
    }

    if (entity === 'persona') {
      const id = Number(tr.dataset.id);
      let per = {};
      try {
        const list = await PersonalAPI.list();
        per = (list || []).find(x => Number(x.id) === id) || {};
      } catch {}

      modal.open({
        title:'Editar personal',
        fields:[
          {name:'id', label:'ID', type:'number', disabled:true},
          {name:'Nombre', label:'Nombre', span2:true},
          {name:'Rol', label:'Rol'},
          {name:'Turno', label:'Turno'},
          {name:'Correo', label:'Correo', type:'email', span2:true},
          {name:'FechaIngreso', label:'Fecha de ingreso', type:'date'},
          {name:'Telefono', label:'Teléfono'}
        ],
        onSubmit: async (v)=>{
          await PersonalAPI.update(id, {
            nombre: v.Nombre, rol: v.Rol, turno: v.Turno, correo: v.Correo,
            fechaIngreso: v.FechaIngreso, telefono: v.Telefono
          });
          showToast('Registro actualizado'); await refreshDashboard();
        }
      }, {
        id: per.id,
        Nombre: per.Nombre || '',
        Rol: per.Rol || '',
        Turno: per.Turno || '',
        Correo: per.Correo || '',
        FechaIngreso: per.FechaIngreso ? fmtDateISO(per.FechaIngreso) : '',
        Telefono: per.Telefono || ''
      });
    }
  } // fin if(btnEdit)

  if(btnDel){
    const entity = btnDel.dataset.entity;
    const tr = btnDel.closest('tr');
    if(!confirm('¿Eliminar registro?')) return;

    if(entity==='producto'){
      const id = Number(tr.dataset.id);
      await ProductosAPI.remove(id);
      showToast('Producto eliminado');
      await renderProductosFromAPI();
      await refreshDashboard();
    }
    if(entity==='material'){
      const id = Number(tr.dataset.id);
      try{
        await MaterialesAPI.remove(id);
        showToast('Material eliminado');
        await refreshDashboard();
      }catch(err){
        const msg = String(err && (err.message || err));
        const isFK = (err && err.status === 409) || /referenciado|FOREIGN KEY|REFERENCE constraint/i.test(msg);
        if(isFK){
          const ok = confirm(msg + '\n\n¿Eliminar dependencias automáticamente?');
          if(ok){
            await fetchJson(API+'/materiales/'+id+'?cascade=1', { method:'DELETE' });
            showToast('Material y dependencias eliminados');
            await refreshDashboard();
          }
        }else{
          alert(msg);
        }
      }
    }
    if(entity==='proveedor'){
      const id = Number(tr.dataset.id); await ProveedoresAPI.remove(id); await refreshDashboard(); showToast('Proveedor eliminado');
    }
    if(entity==='ensamble'){
      const id = Number(tr.dataset.id);
      try{
        await EnsamblesAPI.remove(id);
        showToast('Ensamble eliminado'); await refreshDashboard();
      }catch(err){
        const msg = String(err && (err.message || err));
        const isFK = (err && err.status === 409) || /detalles|FOREIGN KEY|REFERENCE constraint/i.test(msg);
        if(isFK){
          const ok = confirm(msg + '\n\n¿Eliminar detalles automáticamente?');
          if(ok){
            await EnsamblesAPI.remove(id, true);
            showToast('Ensamble y detalles eliminados'); await refreshDashboard();
          }
        } else {
          alert(msg);
        }
      }
    }
    if(entity==='rechazo'){
      const id = Number(tr.dataset.id); await RechazosAPI.remove(id); await refreshDashboard(); showToast('Rechazo eliminado');
    }
    if(entity==='persona'){
      const id = Number(tr.dataset.id); await PersonalAPI.remove(id); await refreshDashboard(); showToast('Registro eliminado');
    }
    if(entity==='venta'){
      const id = Number(tr.dataset.id);
      const restock = confirm('¿Deseas devolver el stock de los items de esta venta? Aceptar = sí');
      await VentasAPI.remove(id, restock);
      showToast('Venta eliminada'+(restock?' (con reposición de stock)':''));
      await renderProductosFromAPI(); await refreshDashboard();
    }
  }
});

// ---------- Exportar CSV ----------
const exportCsvBtn = document.getElementById('exportCsv');
if (exportCsvBtn) exportCsvBtn.addEventListener('click', async function(){
  try{
    const results = await Promise.all([ProductosAPI.list(), MaterialesAPI.list()]);
    const productos = results[0], mats = results[1];
    const header = ['Tipo','ID/SKU','Nombre','Precio/Costo','Stock/Estéril'];
    const rows = [
      ...productos.map(function(p){ return ['Producto', p.id, p.Nombre, p.Precio, p.Stock_Actual]; }),
      ...mats.map(function(i){ return ['Material', i.id, i.Nombre, i.Costo_Unitario, (i.Uso_Esteril?'Sí':'No')]; })
    ];
    const csv = [header, ...rows].map(function(r){ return r.map(function(x){ return '"'+String(x==null?'':x).replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'inventario.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast('Inventario exportado.');
  }catch(err){ console.error(err); showToast('Error exportando CSV'); }
});

// ---------- Picker de tema ----------
const themePicker = document.getElementById('themePicker');
if (themePicker) themePicker.addEventListener('input', function(e){
  document.documentElement.style.setProperty('--brand', e.target.value);
  showToast('Tema actualizado.');
});

// =================== REPORTES ===================

// Helpers: rango de fechas
function getReportRange() {
  const f = document.getElementById('repFrom')?.value || '';
  const t = document.getElementById('repTo')?.value || '';
  const from = f ? new Date(f + 'T00:00:00') : null;
  const to   = t ? new Date(t + 'T23:59:59') : null;
  return { from, to };
}
function inRange(dateStr, range) {
  const d = new Date(dateStr);
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}
function setTableRows(tableId, rowsHtml, emptyText='Sin datos') {
  const tb = document.querySelector('#'+tableId+' tbody');
  if (!tb) return;
  tb.innerHTML = rowsHtml && rowsHtml.trim() ? rowsHtml : `<tr><td colspan="99">${emptyText}</td></tr>`;
}
function tableToCsv(tableId) {
  const el = document.getElementById(tableId);
  if (!el) return '';
  const rows = [...el.querySelectorAll('tr')].map(tr =>
    [...tr.children].map(td => `"${String(td.textContent||'').replace(/"/g,'""')}"`).join(',')
  );
  return rows.join('\n');
}
function downloadCsv(csv, filename) {
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// Presets de fecha
(function wireReportPresets(){
  const todayBtn = document.getElementById('repPresetToday');
  const d7 = document.getElementById('repPreset7');
  const d30 = document.getElementById('repPreset30');
  const all = document.getElementById('repPresetAll');

  function setRange(days) {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - (days-1));
    const iso = d => d.toISOString().slice(0,10);
    const f = document.getElementById('repFrom');
    const t = document.getElementById('repTo');
    if (f) f.value = iso(from);
    if (t) t.value = iso(to);
  }
  todayBtn?.addEventListener('click', ()=> setRange(1));
  d7?.addEventListener('click',    ()=> setRange(7));
  d30?.addEventListener('click',   ()=> setRange(30));
  all?.addEventListener('click',   ()=> {
    const f = document.getElementById('repFrom'); const t = document.getElementById('repTo');
    if (f) f.value = ''; if (t) t.value = '';
  });
})();

// --- Reporte: Ventas (resumen) ---
async function runRepSales(){
  const range = getReportRange();
  const ventas = await VentasAPI.list().catch(()=>[]);
  const rows = ventas.filter(v => v.Fecha ? inRange(v.Fecha, range) : true);

  const totVentas = rows.length;
  const totItems  = rows.reduce((a,b)=> a + Number(b.Items||0), 0);
  const totMonto  = rows.reduce((a,b)=> a + Number(b.Total||0), 0);

  const sumEl = document.getElementById('repSalesSummary');
  if (sumEl) {
    sumEl.innerHTML = `
      <div><strong>Ventas:</strong> ${totVentas}</div>
      <div><strong>Items vendidos:</strong> ${totItems}</div>
      <div><strong>Monto total:</strong> ${money(totMonto)}</div>
    `;
  }

  const html = rows.map(v => `
    <tr>
      <td>${v.id}</td>
      <td>${fmtDateISO(v.Fecha)}</td>
      <td>${v.Cliente || ''}</td>
      <td>${Number(v.Items||0)}</td>
      <td>${money(v.Total||0)}</td>
    </tr>
  `).join('');
  setTableRows('repSalesTable', html);
}
document.getElementById('btnRepSales')?.addEventListener('click', runRepSales);
document.getElementById('btnRepSalesCsv')?.addEventListener('click', ()=>{
  const csv = tableToCsv('repSalesTable');
  downloadCsv(csv, 'reporte_ventas.csv');
});

// --- Reporte: Rechazos por causa ---
async function runRepRejects(){
  const range = getReportRange();
  const rechazos = await RechazosAPI.list().catch(()=>[]);
  const rows = rechazos.filter(r => r.Fecha ? inRange(r.Fecha, range) : true);

  const byCause = {};
  rows.forEach(r => {
    const k = String(r.Causa || 'Sin causa');
    if (!byCause[k]) byCause[k] = { incidents: 0, qty: 0 };
    byCause[k].incidents += 1;
    byCause[k].qty += Number(r.Cantidad || 0);
  });

  const entries = Object.entries(byCause).sort((a,b)=> b[1].qty - a[1].qty);
  const html = entries.map(([cause, agg]) => `
    <tr>
      <td>${cause}</td>
      <td>${agg.incidents}</td>
      <td>${agg.qty}</td>
    </tr>
  `).join('');
  setTableRows('repRejectsTable', html);
}
document.getElementById('btnRepRejects')?.addEventListener('click', runRepRejects);
document.getElementById('btnRepRejectsCsv')?.addEventListener('click', ()=>{
  const csv = tableToCsv('repRejectsTable');
  downloadCsv(csv, 'reporte_rechazos_por_causa.csv');
});

// --- Reporte: Ensambles por responsable ---
async function runRepEnsambles(){
  const range = getReportRange();
  const ensambles = await EnsamblesAPI.list().catch(()=>[]);
  const rows = ensambles.filter(e => e.Fecha ? inRange(e.Fecha, range) : true);

  const byResp = {};
  rows.forEach(e => {
    const key = String(e.Responsable || 'Sin responsable');
    byResp[key] = (byResp[key] || 0) + 1;
  });

  const entries = Object.entries(byResp).sort((a,b)=> b[1] - a[1]);
  const html = entries.map(([resp, count]) => `
    <tr><td>${resp}</td><td>${count}</td></tr>
  `).join('');
  setTableRows('repEnsamblesTable', html);
}
document.getElementById('btnRepEnsambles')?.addEventListener('click', runRepEnsambles);
document.getElementById('btnRepEnsamblesCsv')?.addEventListener('click', ()=>{
  const csv = tableToCsv('repEnsamblesTable');
  downloadCsv(csv, 'reporte_ensambles_por_responsable.csv');
});

// --- Reporte: Inventario bajo ---
async function runRepLowStock(){
  const productos = await ProductosAPI.list().catch(()=>[]);
  const low = productos.filter(p => Number(p.Stock_Actual||0) <= Number(p.Stock_Minimo||0));
  const html = low.map(p => `
    <tr>
      <td>${p.id}</td><td>${p.Nombre||''}</td>
      <td>${Number(p.Stock_Actual||0)}</td>
      <td>${Number(p.Stock_Minimo||0)}</td>
    </tr>
  `).join('');
  setTableRows('repLowStockTable', html, 'Sin productos con poco stock');
}
document.getElementById('btnRepLowStock')?.addEventListener('click', runRepLowStock);
document.getElementById('btnRepLowStockCsv')?.addEventListener('click', ()=>{
  const csv = tableToCsv('repLowStockTable');
  downloadCsv(csv, 'reporte_low_stock.csv');
});

// --- Reporte: Valoración de inventario ---
async function runRepValuation(){
  const productos = await ProductosAPI.list().catch(()=>[]);
  let totalValue = 0;
  const rows = productos.map(p => {
    const price = Number(p.Precio || 0);
    const stock = Number(p.Stock_Actual || 0);
    const val = price * stock;
    totalValue += val;
    return { id:p.id, nombre:p.Nombre||'', price, stock, val };
  }).sort((a,b)=> b.val - a.val);

  const sumEl = document.getElementById('repValuationSummary');
  if (sumEl) sumEl.innerHTML = `<strong>Valor total del inventario:</strong> ${money(totalValue)}`;

  const html = rows.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${r.nombre}</td>
      <td>${money(r.price)}</td>
      <td>${r.stock}</td>
      <td>${money(r.val)}</td>
    </tr>
  `).join('');
  setTableRows('repValuationTable', html);
}
document.getElementById('btnRepValuation')?.addEventListener('click', runRepValuation);
document.getElementById('btnRepValuationCsv')?.addEventListener('click', ()=>{
  const csv = tableToCsv('repValuationTable');
  downloadCsv(csv, 'reporte_valoracion_inventario.csv');
});

// =================== REPORTES — Fancy visuals ===================

// ---- Shared helpers (already used above) ----
// getReportRange(), inRange(), setTableRows(), tableToCsv(), downloadCsv(), money(), fmtDateISO()
// are already defined in your file from the previous step. We reuse them here.

// ---- Visual helpers ----
function getBrandColor() {
  try {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
    return c || '#0077C8';
  } catch { return '#0077C8'; }
}
function hexToRgb(hex) {
  const h = hex.replace('#','').trim();
  const n = h.length === 3 ? h.split('').map(ch => ch+ch).join('') : h;
  const int = parseInt(n, 16);
  return { r:(int>>16)&255, g:(int>>8)&255, b:int&255 };
}
function rgba(hexOrRgb, a) {
  if (typeof hexOrRgb === 'string') {
    const {r,g,b} = hexToRgb(hexOrRgb);
    return `rgba(${r},${g},${b},${a})`;
  }
  const {r,g,b} = hexOrRgb;
  return `rgba(${r},${g},${b},${a})`;
}
function makeVertGradient(ctx, color, height=260) {
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, rgba(color, 0.35));
  g.addColorStop(1, rgba(color, 0.00));
  return g;
}

// ---- Chart defaults (nice fonts, rounded bars, subtle grid) ----
(function setChartDefaults(){
  if (!window.Chart) return;
  const brand = getBrandColor();

  Chart.register(window.ChartDataLabels || {});
  Chart.defaults.font.family = "'Montserrat','Roboto',system-ui,-apple-system,'Segoe UI',Arial,sans-serif";
  Chart.defaults.color = '#111827';
  Chart.defaults.borderColor = 'rgba(0,0,0,.08)';
  Chart.defaults.elements.point.radius = 3;
  Chart.defaults.elements.point.hoverRadius = 5;
  Chart.defaults.datasets.bar.borderRadius = 8;
  Chart.defaults.plugins.legend.position = 'bottom';
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(31,41,55,.92)';
  Chart.defaults.plugins.tooltip.titleColor = '#fff';
  Chart.defaults.plugins.tooltip.bodyColor = '#e5e7eb';

  if (Chart.defaults.plugins.datalabels) {
    Chart.defaults.plugins.datalabels = {
      color: '#111827',
      align: 'end',
      anchor: 'end',
      offset: 4,
      clamp: true,
      formatter: (v, ctx) => {
        const label = ctx.dataset.label || '';
        if (/Monto|Valor|USD|Déficit/i.test(label)) {
          return money(v);
        }
        return String(v);
      },
      display: (ctx) => {
        // Only label when there are not too many bars/points
        const len = (ctx.dataset && ctx.dataset.data && ctx.dataset.data.length) || 0;
        return len <= 12;
      }
    };
  }

  // Provide a few palette mates for brand
  window.__palette = {
    brand,
    brandSoft: rgba(brand, .15),
    accent: '#10B981',   // emerald
    warn:   '#F59E0B',   // amber
    danger: '#EF4444',   // red
    slate:  '#64748B',   // slate
    purple: '#8B5CF6'
  };
})();

// ---- Light wrapper to render/destroy safely ----
const Charts = {
  _inst: {},
  render(id, config){
    if (!window.Chart) return;
    const canvas = document.getElementById(id);
    if (!canvas) return;
    if (Charts._inst[id]) Charts._inst[id].destroy();
    Charts._inst[id] = new Chart(canvas.getContext('2d'), config);
  }
};

// =================== REPORTES with visuals ===================

// Presets already wired earlier; we keep the same buttons/listeners.

// --- Ventas (mixed: line for monto, bars for items) ---
async function runRepSales(){
  const range = getReportRange();
  const ventas = await VentasAPI.list().catch(()=>[]);
  const rows = ventas.filter(v => v.Fecha ? inRange(v.Fecha, range) : true);

  // KPIs
  const totVentas = rows.length;
  const totItems  = rows.reduce((a,b)=> a + Number(b.Items||0), 0);
  const totMonto  = rows.reduce((a,b)=> a + Number(b.Total||0), 0);
  const sumEl = document.getElementById('repSalesSummary');
  if (sumEl) {
    sumEl.innerHTML = `
      <div><strong>Ventas:</strong> ${totVentas}</div>
      <div><strong>Items vendidos:</strong> ${totItems}</div>
      <div><strong>Monto total:</strong> ${money(totMonto)}</div>
    `;
  }

  // Table
  const html = rows.map(v => `
    <tr>
      <td>${v.id}</td>
      <td>${fmtDateISO(v.Fecha)}</td>
      <td>${v.Cliente || ''}</td>
      <td>${Number(v.Items||0)}</td>
      <td>${money(v.Total||0)}</td>
    </tr>
  `).join('');
  setTableRows('repSalesTable', html);

  // Group by day
  const byDay = {};
  rows.forEach(v=>{
    const k = fmtDateISO(v.Fecha || new Date());
    if (!byDay[k]) byDay[k] = { total:0, items:0 };
    byDay[k].total += Number(v.Total||0);
    byDay[k].items += Number(v.Items||0);
  });
  const labels = Object.keys(byDay).sort();
  const totals = labels.map(d=> byDay[d].total);
  const items  = labels.map(d=> byDay[d].items);

  // Visuals
  const brand = __palette.brand;
  const ctx = document.getElementById('repSalesChart')?.getContext('2d');
  const grad = ctx ? makeVertGradient(ctx, brand) : rgba(brand, .15);

  Charts.render('repSalesChart', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'line',
          label: 'Monto (USD)',
          data: totals,
          tension: .35,
          borderColor: brand,
          backgroundColor: grad,
          fill: 'origin',
          pointHoverRadius: 6,
          yAxisID: 'y'
        },
        {
          type: 'bar',
          label: 'Items',
          data: items,
          backgroundColor: __palette.accent,
          borderColor: rgba(__palette.accent, .9),
          yAxisID: 'y2'
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y:  { beginAtZero:true, title:{ display:true, text:'Monto' },
              ticks:{ callback:v=> money(v).replace('$','$ ') } },
        y2: { beginAtZero:true, position:'right', grid:{ drawOnChartArea:false },
              title:{ display:true, text:'Items' } }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx)=>{
              const v = ctx.parsed.y;
              if (ctx.dataset.label.includes('Monto')) return ` ${ctx.dataset.label}: ${money(v)}`;
              return ` ${ctx.dataset.label}: ${v}`;
            }
          }
        }
      }
    }
  });
}
document.getElementById('btnRepSales')?.addEventListener('click', runRepSales);
document.getElementById('btnRepSalesCsv')?.addEventListener('click', ()=>{
  const csv = tableToCsv('repSalesTable');
  downloadCsv(csv, 'reporte_ventas.csv');
});

// --- Rechazos por causa (doughnut top-8) ---
async function runRepRejects(){
  const range = getReportRange();
  const rechazos = await RechazosAPI.list().catch(()=>[]);
  const rows = rechazos.filter(r => r.Fecha ? inRange(r.Fecha, range) : true);

  const byCause = {};
  rows.forEach(r => {
    const k = String(r.Causa || 'Sin causa');
    if (!byCause[k]) byCause[k] = { incidents: 0, qty: 0 };
    byCause[k].incidents += 1;
    byCause[k].qty += Number(r.Cantidad || 0);
  });

  // Table
  const entries = Object.entries(byCause).sort((a,b)=> b[1].qty - a[1].qty);
  const html = entries.map(([cause, agg]) => `
    <tr>
      <td>${cause}</td>
      <td>${agg.incidents}</td>
      <td>${agg.qty}</td>
    </tr>
  `).join('');
  setTableRows('repRejectsTable', html);

  // Doughnut: top 8 causas por cantidad
  const top = entries.slice(0, 8);
  const labels = top.map(([c])=> c);
  const data = top.map(([,v])=> v.qty);
  const palette = [
    __palette.brand, __palette.accent, __palette.warn, __palette.danger,
    __palette.purple, '#0EA5E9', '#84CC16', '#F97316'
  ];

  Charts.render('repRejectsChart', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ label: 'Cantidad', data, backgroundColor: palette.slice(0, data.length) }]
    },
    options: {
      cutout: '62%',
      plugins: {
        legend: { position: 'right' },
        tooltip: { callbacks: { label: (ctx)=> ` ${ctx.label}: ${ctx.parsed}` } }
      }
    }
  });
}
document.getElementById('btnRepRejects')?.addEventListener('click', runRepRejects);
document.getElementById('btnRepRejectsCsv')?.addEventListener('click', ()=>{
  const csv = tableToCsv('repRejectsTable');
  downloadCsv(csv, 'reporte_rechazos_por_causa.csv');
});

// --- Ensambles por responsable (horizontal bar) ---
async function runRepEnsambles(){
  const range = getReportRange();
  const ensambles = await EnsamblesAPI.list().catch(()=>[]);
  const rows = ensambles.filter(e => e.Fecha ? inRange(e.Fecha, range) : true);

  const byResp = {};
  rows.forEach(e => {
    const key = String(e.Responsable || 'Sin responsable');
    byResp[key] = (byResp[key] || 0) + 1;
  });

  const entries = Object.entries(byResp).sort((a,b)=> b[1] - a[1]);
  const html = entries.map(([resp, count]) => `<tr><td>${resp}</td><td>${count}</td></tr>`).join('');
  setTableRows('repEnsamblesTable', html);

  const labels = entries.slice(0, 12).map(([r])=> r);
  const data = entries.slice(0, 12).map(([,n])=> n);

  Charts.render('repEnsamblesChart', {
    type: 'bar',
    data: { labels, datasets: [{ label:'# Ensambles', data, backgroundColor: __palette.brand }] },
    options: {
      indexAxis: 'y',
      scales: { x: { beginAtZero:true } },
      plugins: { tooltip: { callbacks: { label: (c)=> ` ${c.dataset.label}: ${c.parsed.x}` } } }
    }
  });
}
document.getElementById('btnRepEnsambles')?.addEventListener('click', runRepEnsambles);
document.getElementById('btnRepEnsamblesCsv')?.addEventListener('click', ()=>{
  const csv = tableToCsv('repEnsamblesTable');
  downloadCsv(csv, 'reporte_ensambles_por_responsable.csv');
});

// --- Inventario bajo (horizontal bar by déficit) ---
async function runRepLowStock(){
  const productos = await ProductosAPI.list().catch(()=>[]);
  const low = productos.filter(p => Number(p.Stock_Actual||0) <= Number(p.Stock_Minimo||0));

  // Table
  const html = low.map(p => `
    <tr>
      <td>${p.id}</td><td>${p.Nombre||''}</td>
      <td>${Number(p.Stock_Actual||0)}</td>
      <td>${Number(p.Stock_Minimo||0)}</td>
    </tr>
  `).join('');
  setTableRows('repLowStockTable', html, 'Sin productos con poco stock');

  // Chart: top 12 por déficit
  const ranked = low.map(p => ({
    nombre: p.Nombre || ('ID '+p.id),
    deficit: Math.max(0, Number(p.Stock_Minimo||0) - Number(p.Stock_Actual||0))
  })).sort((a,b)=> b.deficit - a.deficit).slice(0,12);

  Charts.render('repLowStockChart', {
    type: 'bar',
    data: {
      labels: ranked.map(x=> x.nombre),
      datasets: [{ label:'Déficit (min - stock)', data: ranked.map(x=> x.deficit), backgroundColor: __palette.danger }]
    },
    options: {
      indexAxis: 'y',
      scales: { x: { beginAtZero:true } }
    }
  });
}
document.getElementById('btnRepLowStock')?.addEventListener('click', runRepLowStock);
document.getElementById('btnRepLowStockCsv')?.addEventListener('click', ()=>{
  const csv = tableToCsv('repLowStockTable');
  downloadCsv(csv, 'reporte_low_stock.csv');
});

// --- Valoración de inventario (top 12 por valor) ---
async function runRepValuation(){
  const productos = await ProductosAPI.list().catch(()=>[]);
  let totalValue = 0;
  const rows = productos.map(p => {
    const price = Number(p.Precio || 0);
    const stock = Number(p.Stock_Actual || 0);
    const val = price * stock;
    totalValue += val;
    return { id:p.id, nombre:p.Nombre||'', price, stock, val };
  }).sort((a,b)=> b.val - a.val);

  const sumEl = document.getElementById('repValuationSummary');
  if (sumEl) sumEl.innerHTML = `<strong>Valor total del inventario:</strong> ${money(totalValue)}`;

  // Table
  const html = rows.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${r.nombre}</td>
      <td>${money(r.price)}</td>
      <td>${r.stock}</td>
      <td>${money(r.val)}</td>
    </tr>
  `).join('');
  setTableRows('repValuationTable', html);

  // Chart
  const top = rows.slice(0, 12);
  Charts.render('repValuationChart', {
    type: 'bar',
    data: {
      labels: top.map(r=> r.nombre),
      datasets: [{ label:'Valor (USD)', data: top.map(r=> r.val), backgroundColor: __palette.slate }]
    },
    options: {
      indexAxis: 'y',
      scales: {
        x: { beginAtZero:true, ticks:{ callback:v=> money(v).replace('$','$ ') } }
      },
      plugins: {
        tooltip: { callbacks: { label: (c)=> ` ${c.dataset.label}: ${money(c.parsed.x)}` } }
      }
    }
  });
}
document.getElementById('btnRepValuation')?.addEventListener('click', runRepValuation);
document.getElementById('btnRepValuationCsv')?.addEventListener('click', ()=>{
  const csv = tableToCsv('repValuationTable');
  downloadCsv(csv, 'reporte_valoracion_inventario.csv');
});
