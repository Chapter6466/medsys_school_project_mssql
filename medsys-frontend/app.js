// Medsys Technologies - App JS (Dashboard live updates, Ensambles, Ventas with idPersonal)
// ✅ Working modals (window.modal + global alias modal)
// ✅ API persistence (productos, materiales, proveedores, personal, ensambles, rechazos, ventas)
// ✅ Ventas: descuenta stock + captura ID_Personal
// ✅ Dashboard: KPIs en vivo + actividad reciente + auto-refresh
// ✅ UX: Esc para cerrar, foco inicial + focus trap, inline errors, loading/empty, highlight row
// ✅ No optional chaining en asignaciones
// ✅ Logging global de errores

// ---------- Sesión ----------
(function(){
  const token = sessionStorage.getItem('medsys_token') || localStorage.getItem('medsys_token');
  if(!token){ location.href = 'signin.html'; return; }
  try{
    const data = JSON.parse(atob(token));
    const chip = document.getElementById('usernameChip');
    if (chip) chip.textContent = (data && data.user && data.user.username) ? data.user.username : 'Usuario';
  }catch(e){
    sessionStorage.removeItem('medsys_token'); localStorage.removeItem('medsys_token'); location.href = 'signin.html';
  }
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
    if (id === 'dashboard') { refreshDashboard().catch(()=>{}); }
  });
}); // <-- faltaba este cierre

const logoutBtn = document.getElementById('logout');
if (logoutBtn) logoutBtn.addEventListener('click', (e)=>{
  e.preventDefault(); sessionStorage.removeItem('medsys_token'); localStorage.removeItem('medsys_token'); location.href='signin.html';
});

// ---------- Helpers ----------
const API = 'http://localhost:3000/api';

// ---- Global error logging ----
window.addEventListener('error', e => {
  console.error('UNCAUGHT ERROR:', e.error || e.message || e);
});
window.addEventListener('unhandledrejection', e => {
  console.error('UNHANDLED PROMISE REJECTION:', e.reason);
});

async function fetchJson(url, options = {}){
  const r = await fetch(url, { headers:{'Content-Type':'application/json'}, ...options });
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

// Small helper to safely set textContent
function setText(id, val){ const el = document.getElementById(id); if(el) el.textContent = String(val); }

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

function showToast(msg){
  const t = document.getElementById('toast'); if(!t) return;
  const m = document.getElementById('toastMsg'); if(m) m.textContent = msg;
  t.classList.add('show'); setTimeout(()=> t.classList.remove('show'), 2500);
}
function fmtDateISO(s){ if(!s) return ''; const d=new Date(s); const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return y+'-'+m+'-'+dd; }

/* ---------- Modal helper ----------
   Requires IDs in HTML:
   modalBackdrop, modalTitle, modalForm, modalFields, modalClose, modalCancel, modalSubmit
----------------------------------- */
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
      // opt can be: "Texto", [value,label], {value,label}
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

    // autofocus first enabled input
    setTimeout(()=>{
      const firstInput = modalFields && modalFields.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled])');
      if (firstInput) firstInput.focus();
    }, 0);

    enableFocusTrap();

    if (modalForm) modalForm.onsubmit = async (e) => {
      e.preventDefault();
      clearFieldErrors();
      const raw = Object.fromEntries(new FormData(modalForm).entries());
      // keep disabled field values from initial
      fields.forEach(f => { if (f.disabled && initial && initial[f.name] !== undefined) raw[f.name] = initial[f.name]; });

      // basic required check
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

// Back-compat alias so existing code can call modal.open(...)
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

    // Mini "chart": stock por riesgo (texto simple)
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

// ---------- Actividad reciente (Dashboard) ----------
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

// ---------- Render secciones ----------
async function renderOtros(){
  // Actividad reciente en Dashboard (reemplaza demo)
  await renderActivity().catch(()=>{});

  // Materiales (API)
  try{
    const table = document.getElementById('materialesTable'); setTableLoading(table);
    const mats = await MaterialesAPI.list();
    renderTable(table, mats, function(r){
      return '<tr data-id="'+r.id+'">'
        +'<td>'+r.id+'</td>'
        +'<td>'+r.Nombre+'</td>'
        +'<td>$'+Number(r.Costo_Unitario).toFixed(2)+'</td>'
        +'<td>'+(r.Uso_Esteril ? 'Sí':'No')+'</td>'
        +'<td><button class="button secondary btn-edit" data-entity="material">Editar</button>'
        +'    <button class="button ghost btn-del" data-entity="material">Eliminar</button></td>'
        +'</tr>';
    });
  }catch(e){ console.warn('Materiales API', e); }

  // Proveedores (API)
  try{
    const table = document.getElementById('proveedoresTable'); setTableLoading(table);
    const provs = await ProveedoresAPI.list();
    renderTable(table, provs, function(r){
      return '<tr data-id="'+r.id+'"><td>'+r.id+'</td><td>'+r.Nombre+'</td><td>'+(r.Contacto||'')+'</td><td>'+(r.Telefono||'')+'</td><td>'+(r.Email||'')+'</td>'
        +'<td><button class="button secondary btn-edit" data-entity="proveedor">Editar</button>'
        +'    <button class="button ghost btn-del" data-entity="proveedor">Eliminar</button></td></tr>';
    });
  }catch(e){ console.warn('Proveedores API', e); }

  // Ensambles (API)
  try{
    const table = document.getElementById('ensamblesTable'); setTableLoading(table);
    const ens = await EnsamblesAPI.list();
    renderTable(table, ens, function(r){
      return '<tr data-id="'+r.id+'"><td>'+r.id+'</td><td>'+(r.Producto||'')+'</td><td>'+(r.Componentes||'')+'</td><td>'+fmtDateISO(r.Fecha)+'</td><td>'+(r.Responsable||'')+'</td>'
        +'<td><button class="button secondary btn-edit" data-entity="ensamble">Editar</button>'
        +'    <button class="button ghost btn-del" data-entity="ensamble">Eliminar</button></td></tr>';
    });
  }catch(e){ console.warn('Ensambles API', e); }

  // Rechazos (API)
  try{
    const table = document.getElementById('scrapTable'); setTableLoading(table);
    const rs = await RechazosAPI.list();
    renderTable(table, rs, function(r){
      return '<tr data-id="'+r.id+'"><td>'+r.id+'</td><td>'+(r.Dispositivo||'')+'</td><td>'+(r.Causa||'')+'</td><td>'+(r.Cantidad||0)+'</td><td>'+fmtDateISO(r.Fecha)+'</td>'
        +'<td><button class="button secondary btn-edit" data-entity="rechazo">Editar</button>'
        +'    <button class="button ghost btn-del" data-entity="rechazo">Eliminar</button></td></tr>';
    });
  }catch(e){ console.warn('Rechazos API', e); }

  // Personal (API) — mostrar CORREO (tu HTML tiene la columna "Correo")
  try{
    const table = document.getElementById('personalTable'); setTableLoading(table);
    const per = await PersonalAPI.list();
    renderTable(table, per, function(r){
      return '<tr data-id="'+r.id+'"><td>'+r.id+'</td><td>'+r.Nombre+'</td><td>'+(r.Rol||'')+'</td><td>'+(r.Turno||'')+'</td><td>'+(r.Correo||'')+'</td>' +'<td>'+(r.Telefono||'')+'</td>'
        +'<td><button class="button secondary btn-edit" data-entity="persona">Editar</button>'
        +'    <button class="button ghost btn-del" data-entity="persona">Eliminar</button></td></tr>';
    });
  }catch(e){ console.warn('Personal API', e); }

  // Ventas (API)
  const ventasTable = document.getElementById('ventasTable');
  if (ventasTable) {
    try{
      setTableLoading(ventasTable);
      const vs = await VentasAPI.list();
      renderTable(ventasTable, vs, function(r){
        return '<tr data-id="'+r.id+'"><td>'+r.id+'</td><td>'+fmtDateISO(r.Fecha)+'</td><td>'+(r.Cliente||'')+'</td><td>'+Number(r.Total).toFixed(2)+'</td><td>'+(r.Items||0)+'</td>'
          +'<td><button class="button ghost btn-del" data-entity="venta">Eliminar</button></td></tr>';
      }, window.__highlight && window.__highlight.venta ? { highlightId: window.__highlight.venta } : undefined);
      if (window.__highlight) delete window.__highlight.venta;
    }catch(e){ console.warn('Ventas API', e); }
  }
}

async function renderProductosFromAPI(){
  try{
    const table = document.getElementById('productosTable'); setTableLoading(table);
    const productos = await ProductosAPI.list();
    renderTable(table, productos, function(p){
      return '<tr data-id="'+p.id+'"><td>'+p.id+'</td><td>'+p.Nombre+'</td><td>'+(p.Clasificacion_Riesgo||'')+'</td><td>$'+Number(p.Precio).toFixed(2)+'</td><td>'+p.Stock_Actual+'</td>'
        +'<td><button class="button secondary btn-edit" data-entity="producto">Editar</button>'
        +'    <button class="button ghost btn-del" data-entity="producto">Eliminar</button></td></tr>';
    });
  }catch(err){ console.error(err); showToast('Error cargando productos'); }
}

// ---------- Dashboard Auto-Refresh ----------
async function refreshDashboard(){
  await Promise.all([refreshKPIs(), renderOtros()]);
}
const DASH_INTERVAL_MS = 15000;
setInterval(function(){
  const isDashActive = document.querySelector('.nav a.active[data-section="dashboard"]');
  if (isDashActive) { refreshDashboard().catch(()=>{}); }
}, DASH_INTERVAL_MS);
document.addEventListener('visibilitychange', function(){
  if (!document.hidden) { refreshDashboard().catch(()=>{}); }
});

// ---------- Carga inicial ----------
refreshDashboard().catch(function(e){ console.error('refreshDashboard failed:', e); });
renderProductosFromAPI().catch(function(e){ console.error('renderProductosFromAPI failed:', e); });

// ---------- Crear ----------
const addProductoBtn = document.getElementById('addProducto');
if (addProductoBtn) addProductoBtn.addEventListener('click', function(){
  modal.open({
    title:'Agregar producto',
    fields:[
      {name:'Nombre', label:'Nombre', required:true, span2:true},
      {name:'Descripcion', label:'Descripción', span2:true},
      {name:'Clasificacion_Riesgo', label:'Riesgo'},
      {name:'Aprobado_Por', label:'Aprobado por'},
      {name:'Uso_Especifico', label:'Uso'},
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

const addMaterialBtn = document.getElementById('addMaterial');
if (addMaterialBtn) addMaterialBtn.addEventListener('click', async function(){
  // Cargar proveedores para selector
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

// ---- Ensambles (API) ----
const addEnsambleBtn = document.getElementById('addEnsamble');
if (addEnsambleBtn) addEnsambleBtn.addEventListener('click', async function(){
  let productos = [];
  try { productos = await ProductosAPI.list(); } catch(e){ console.error(e); showToast('No se pudo cargar dispositivos'); return; }
  const options = productos.map(function(p){ return p.id+' - '+p.Nombre; });
  modal.open({
    title:'Registrar ensamble',
    fields:[
      {name:'ID_DispositivoMed', label:'Dispositivo', type:'select', options, required:true},
      {name:'Componentes', label:'Componentes', required:false, span2:true},
      {name:'Fecha', label:'Fecha', type:'date'},
      {name:'Responsable', label:'Responsable'}
    ],
    onSubmit: async function(v){
      const idTxt = String(v.ID_DispositivoMed).split(' - ')[0];
      await EnsamblesAPI.create({
        idDispositivo: Number(idTxt||0),
        componentes: v.Componentes,
        fecha: v.Fecha,
        responsable: v.Responsable
      });
      showToast('Ensamble registrado'); await refreshDashboard();
    }
  });
});

// ---- Proveedores (API) ----
const addProveedorBtn = document.getElementById('addProveedor');
if (addProveedorBtn) addProveedorBtn.addEventListener('click', function(){
  modal.open({
    title:'Agregar proveedor',
    fields:[
      {name:'Nombre', label:'Nombre', required:true, span2:true},
      {name:'Contacto', label:'Contacto'},
      {name:'Telefono', label:'Teléfono'},
      {name:'Email', label:'Email', span2:true}
    ],
    onSubmit: async function(v){
      await ProveedoresAPI.create({ nombre:v.Nombre, contacto:v.Contacto, telefono:v.Telefono, email:v.Email });
      showToast('Proveedor agregado'); await refreshDashboard();
    }
  });
});

// ---- Rechazos (API) ----
const addScrapBtn = document.getElementById('addScrap');
if (addScrapBtn) addScrapBtn.addEventListener('click', async function(){
  let productos = [];
  try{ productos = await ProductosAPI.list(); }catch(e){ console.error(e); showToast('No se pudo cargar dispositivos'); return; }
  const options = productos.map(function(p){ return p.id+' - '+p.Nombre; });
  modal.open({
    title:'Registrar rechazo',
    fields:[
      {name:'ID_DispositivoMed', label:'Dispositivo', type:'select', options, required:true},
      {name:'Causa', label:'Causa', required:true},
      {name:'Cantidad', label:'Cantidad', type:'number'},
      {name:'Fecha', label:'Fecha', type:'date'}
    ],
    onSubmit: async function(v){
      try{
        const idTxt = String(v.ID_DispositivoMed).split(' - ')[0];
        await RechazosAPI.create({
          idDispositivo:Number(idTxt||0),
          causa:v.Causa, cantidad:Number(v.Cantidad||0), fecha:v.Fecha
        });
        showToast('Rechazo registrado'); await refreshDashboard();
      }catch(err){ console.error(err); showToast('Error: '+err.message); }
    }
  });
});

// ---- Personal (API) ----
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
        nombre: v.Nombre,
        rol: v.Rol,
        turno: v.Turno,
        correo: v.Correo,
        fechaIngreso: v.FechaIngreso,   // 'YYYY-MM-DD'
        telefono: v.Telefono
      });
      showToast('Persona agregada');
      await refreshDashboard();
    }
  });
});

// ---- Ventas (API) ----
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

  // Opciones para selects
  const productoOptions = productos.map(function(p){ return p.id+' - '+p.Nombre+' (stock: '+p.Stock_Actual+')'; });
  const personalOptions = personal.map(function(per){
    return { value: per.id, label: per.Nombre + (per.Rol ? ' ('+per.Rol+')' : '') };
  });

  // (Opcional) preseleccionar desde el token si lo guardas ahí
  let preIdPersonal = '';
  try{
    const token = sessionStorage.getItem('medsys_token') || localStorage.getItem('medsys_token');
    const payload = token ? JSON.parse(atob(token)) : null;
    if (payload && payload.user && payload.user.idPersonal) preIdPersonal = String(payload.user.idPersonal);
  }catch{}

  modal.open({
    title:'Registrar venta',
    fields:[
      {name:'Cliente', label:'Cliente', required:true},
      {name:'Fecha', label:'Fecha', type:'date'},
      {name:'idPersonal', label:'Atendido por', type:'select', options: personalOptions, value: preIdPersonal},
      {name:'ID_DispositivoMed', label:'Producto', type:'select', options: productoOptions, required:true},
      {name:'Cantidad', label:'Cantidad', type:'number', min:1, value:1, required:true},
      {name:'Precio', label:'Precio unitario', type:'number', step:'0.01'}
    ],
    onSubmit: async function(v){
      try{
        const idTxt = String(v.ID_DispositivoMed).split(' - ')[0];
        const precioUnit = (v.Precio === '' || v.Precio == null) ? undefined : Number(v.Precio);
        const items = [{
          idDispositivo: Number(idTxt || 0),
          cantidad: Number(v.Cantidad || 1),
          precioUnitario: precioUnit
        }];
        const idPersonal = (v.idPersonal === '' || v.idPersonal == null) ? null : Number(v.idPersonal);

        const resp = await VentasAPI.create({ cliente: v.Cliente, fecha: v.Fecha, idPersonal, items });
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
  });
});

// ---------- Editar/Eliminar (delegación) ----------
document.addEventListener('click', async function(e){
  const btnEdit = e.target.closest && e.target.closest('.btn-edit');
  const btnDel  = e.target.closest && e.target.closest('.btn-del');

  if(btnEdit){
    const entity = btnEdit.dataset.entity;
    const tr = btnEdit.closest('tr');

    if(entity==='producto'){
      const id = Number(tr.dataset.id);
      modal.open({
        title:'Editar producto',
        fields:[
          {name:'id', label:'ID', type:'number', disabled:true},
          {name:'Nombre', label:'Nombre', span2:true},
          {name:'Descripcion', label:'Descripción', span2:true},
          {name:'Clasificacion_Riesgo', label:'Riesgo'},
          {name:'Aprobado_Por', label:'Aprobado por'},
          {name:'Uso_Especifico', label:'Uso'},
          {name:'Precio', label:'Precio', type:'number', step:'0.01'},
          {name:'Stock_Actual', label:'Stock', type:'number'},
          {name:'Stock_Minimo', label:'Stock mínimo', type:'number'}
        ],
        onSubmit: async function(v){
          await ProductosAPI.update(id, {
            nombre:v.Nombre, descripcion:v.Descripcion, riesgo:v.Clasificacion_Riesgo,
            aprobadoPor:v.Aprobado_Por, uso:v.Uso_Especifico, precio:Number(v.Precio||0),
            stock:Number(v.Stock_Actual||0), stockMin:Number(v.Stock_Minimo||0)
          });
          showToast('Producto actualizado'); await renderProductosFromAPI(); await refreshDashboard();
        }
      }, {id});
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

    if(entity==='proveedor'){
      const id = Number(tr.dataset.id);
      modal.open({
        title:'Editar proveedor',
        fields:[
          {name:'id', label:'ID', type:'number', disabled:true},
          {name:'Nombre', label:'Nombre', span2:true},
          {name:'Contacto', label:'Contacto'},
          {name:'Telefono', label:'Teléfono'},
          {name:'Email', label:'Email', span2:true}
        ],
        onSubmit: async function(v){
          await ProveedoresAPI.update(id, { nombre:v.Nombre, contacto:v.Contacto, telefono:v.Telefono, email:v.Email });
          showToast('Proveedor actualizado'); await refreshDashboard();
        }
      }, {id});
    }

    if(entity==='ensamble'){
      const id = Number(tr.dataset.id);
      let cur = {}; let productos = [];
      try{
        const results = await Promise.all([EnsamblesAPI.list(), ProductosAPI.list()]);
        const enList = results[0], prods = results[1];
        cur = (enList || []).find(function(x){ return Number(x.id) === id; }) || {};
        productos = prods || [];
      }catch(e){}
      const options = productos.map(function(p){ return p.id+' - '+p.Nombre; });
      let initialId = '';
      if (cur && cur.Producto) {
        const match = productos.find(function(p){ return String(p.Nombre) === String(cur.Producto); });
        if (match) initialId = String(match.id);
      }

      modal.open({
        title:'Editar ensamble',
        fields:[
          {name:'id', label:'ID', type:'number', disabled:true},
          {name:'ID_DispositivoMed', label:'Dispositivo', type:'select', options: options},
          {name:'Componentes', label:'Componentes', span2:true},
          {name:'Fecha', label:'Fecha', type:'date'},
          {name:'Responsable', label:'Responsable'}
        ],
        onSubmit: async function(v){
          const hasSel = v.ID_DispositivoMed && String(v.ID_DispositivoMed).trim() !== '';
          const payload = {
            componentes: v.Componentes,
            fecha: v.Fecha,
            responsable: v.Responsable
          };
          if (hasSel) {
            const idTxt = String(v.ID_DispositivoMed).split(' - ')[0];
            payload.idDispositivo = Number(idTxt || 0);
          }
          await EnsamblesAPI.update(id, payload);
          showToast('Ensamble actualizado'); await refreshDashboard();
        }
      }, {
        id: id,
        ID_DispositivoMed: initialId,
        Componentes: cur.Componentes || '',
        Fecha: cur.Fecha ? fmtDateISO(cur.Fecha) : '',
        Responsable: cur.Responsable || ''
      });
    }

    if(entity==='rechazo'){
      const id = Number(tr.dataset.id);
      let productos=[]; try{ productos = await ProductosAPI.list(); }catch(e){ console.error(e); showToast('No se pudo cargar dispositivos'); return; }
      const options = productos.map(function(p){ return p.id+' - '+p.Nombre; });
      modal.open({
        title:'Editar rechazo',
        fields:[
          {name:'id', label:'ID', type:'number', disabled:true},
          {name:'ID_DispositivoMed', label:'Dispositivo', type:'select', options},
          {name:'Causa', label:'Causa'},
          {name:'Cantidad', label:'Cantidad', type:'number'},
          {name:'Fecha', label:'Fecha', type:'date'}
        ],
        onSubmit: async function(v){
          try{
            const idTxt = String(v.ID_DispositivoMed).split(' - ')[0];
            await RechazosAPI.update(id, {
              idDispositivo:Number(idTxt||0), causa:v.Causa, cantidad:Number(v.Cantidad||0), fecha:v.Fecha
            });
            showToast('Rechazo actualizado'); await refreshDashboard();
          }catch(err){ console.error(err); showToast('Error: '+err.message); }
        }
      }, {id});
    }

    if(entity==='persona'){
      const id = Number(tr.dataset.id);
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
            nombre: v.Nombre,
            rol: v.Rol,
            turno: v.Turno,
            correo: v.Correo,
            fechaIngreso: v.FechaIngreso,
            telefono: v.Telefono
          });
          showToast('Registro actualizado'); await refreshDashboard();
        }
      }, { id });
    }
  } // <-- cierre de if(btnEdit)

  if(btnDel){
    const entity = btnDel.dataset.entity;
    const tr = btnDel.closest('tr');
    if(!confirm('¿Eliminar registro?')) return;

    if(entity==='producto'){
      const id = Number(tr.dataset.id); await ProductosAPI.remove(id); showToast('Producto eliminado'); await renderProductosFromAPI(); await refreshDashboard();
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