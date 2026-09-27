async function readJson(response){
  const type=response.headers.get('content-type')||'';
  if(!type.includes('application/json')){const text=await response.text();throw new Error(text||`El servidor respondió con HTTP ${response.status}`)}
  return response.json();
}
async function checkSession(){try{const r=await fetch('/api/v1/auth/session',{credentials:'same-origin'});const x=await readJson(r);if(x.authenticated)location.href='/'}catch{}}
document.getElementById('f')?.addEventListener('submit',async e=>{e.preventDefault();const out=document.getElementById('e');const input=document.getElementById('p');out.textContent='';try{const r=await fetch('/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({password:input.value})});const x=await readJson(r);if(!r.ok)throw new Error(x?.error?.message||'No se pudo iniciar sesión');location.href='/'}catch(err){out.textContent=err instanceof Error?err.message:'No se pudo iniciar sesión'}});
checkSession();
