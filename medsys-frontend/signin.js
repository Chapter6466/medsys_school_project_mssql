// Medsys - Inicio de sesión (demo)
const demoUsers = {
  'admin': { role:'admin', name:'Administrador' },
  'analyst': { role:'analyst', name:'Analista' }
};

document.addEventListener('DOMContentLoaded', ()=>{
  const form = document.getElementById('signinForm');
  const error = document.getElementById('error');
  const success = document.getElementById('success');
  const submitBtn = document.getElementById('submitBtn');
  const remember = document.getElementById('remember');

  function show(el, msg){
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(()=> el.style.display = 'none', 3200);
  }

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    submitBtn.disabled = true;
    const username = String(document.getElementById('username').value || '').trim().toLowerCase();
    const password = String(document.getElementById('password').value || '');

    // Demo: contraseña "medsys"
    const user = demoUsers[username];
    if(!user || password !== 'medsys'){
      show(error, 'Credenciales inválidas.');
      submitBtn.disabled = false;
      return;
    }

    const sessionData = { user: { username, ...user }, ts: Date.now() };
    const token = btoa(JSON.stringify(sessionData));
    try { sessionStorage.setItem('medsys_token', token); } catch(e) {}
    try { localStorage.setItem('medsys_token', token); } catch(e) {}

    show(success, '¡Bienvenido!');
    location.href = 'index.html';
  });
});
