// Medsys - Inicio de sesión (demo reforzado)
/*
  Cambios clave:
  - Validación de campos vacíos y limpieza de mensajes.
  - Botón con estado "busy" para evitar doble envío.
  - Manejo robusto de almacenamiento (session/local).
  - (Opcional) idPersonal en el token para preseleccionar en Ventas.
*/

// Usuarios demo (puedes ajustar/añadir idPersonal para pruebas)
const demoUsers = {
  admin:   { role: 'admin',   name: 'Administrador', idPersonal: 1 },
  analyst: { role: 'analyst', name: 'Analista',      idPersonal: 2 }
};

document.addEventListener('DOMContentLoaded', () => {
  const form      = document.getElementById('signinForm');
  const errorBox  = document.getElementById('error');
  const okBox     = document.getElementById('success');
  const submitBtn = document.getElementById('submitBtn');
  const remember  = document.getElementById('remember');
  const userEl    = document.getElementById('username');
  const passEl    = document.getElementById('password');

  if (!form || !submitBtn || !userEl || !passEl) {
    console.error('Formulario o campos no encontrados en el DOM');
    return;
  }

  function show(el, msg) {
    if (!el) return;
    el.textContent = String(msg || '');
    el.style.display = 'block';
    // Oculta después de unos segundos, salvo que sea error persistente
    if (el !== errorBox) {
      setTimeout(() => { el.style.display = 'none'; }, 3200);
    }
  }
  function hide(el){ if(el){ el.style.display = 'none'; el.textContent = ''; } }
  function setBusy(on){
    if (!submitBtn) return;
    submitBtn.disabled = !!on;
    if (on) {
      submitBtn.setAttribute('aria-busy', 'true');
      submitBtn.dataset._label = submitBtn.textContent;
      submitBtn.textContent = 'Ingresando…';
    } else {
      submitBtn.removeAttribute('aria-busy');
      if (submitBtn.dataset._label) submitBtn.textContent = submitBtn.dataset._label;
    }
  }

  // Limpia mensajes al escribir
  [userEl, passEl].forEach(el => el.addEventListener('input', () => { hide(errorBox); }));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    hide(errorBox); hide(okBox);

    const username = String(userEl.value || '').trim().toLowerCase();
    const password = String(passEl.value || '');

    if (!username || !password) {
      show(errorBox, 'Por favor ingresa usuario y contraseña.');
      return;
    }

    setBusy(true);

    // Autenticación demo: contraseña "medsys"
    const user = demoUsers[username];
    const ok = !!user && password === 'medsys';

    if (!ok) {
      show(errorBox, 'Credenciales inválidas.');
      setBusy(false);
      return;
    }

    // Token "fake" para demo
    const sessionData = { user: { username, ...user }, ts: Date.now() };
    const token = btoa(JSON.stringify(sessionData));

    try {
      sessionStorage.setItem('medsys_token', token);
      if (remember && remember.checked) {
        localStorage.setItem('medsys_token', token);
      } else {
        localStorage.removeItem('medsys_token');
      }
    } catch (err) {
      console.error('Error guardando token:', err);
      // Intenta al menos mantener en sessionStorage
      try { sessionStorage.setItem('medsys_token', token); } catch {}
    }

    show(okBox, '¡Bienvenido!');
    // Pequeña pausa para feedback visual
    setTimeout(() => { location.href = 'index.html'; }, 500);
  });
});
