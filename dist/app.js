import {phoneNumber, quantity, addItem} from './model.mjs';
const URL = 'https://yyvemwpssysspysnseby.supabase.co';
const publicKey = 'sb_publishable_Wqp_XJZ30jx9dqMilfAIGQ_ZqBNibeo';
const $ = id => document.getElementById(id);
const catalog = new URLSearchParams(location.hash.slice(1)).get('catalogo');
let products = [], cart = [], pending = null, sending = false;
const storeKey = `daykeds-cart-${catalog}`;
function save() { try { sessionStorage.setItem(storeKey, JSON.stringify({cart,pending})); } catch {} }
try { const saved=JSON.parse(sessionStorage.getItem(storeKey)||'null'); if(saved && Array.isArray(saved.cart)) {cart=saved.cart; pending=saved.pending;} } catch {}
function node(tag, text, className) { const el=document.createElement(tag); if(text!==undefined) el.textContent=text; if(className) el.className=className; return el; }
async function rpc(name, body) {
  const response=await fetch(`${URL}/rest/v1/rpc/${name}`, {method:'POST',headers:{apikey:publicKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const result=await response.json();
  if(!response.ok) throw new Error(response.status===404?'El catálogo todavía no está habilitado.':result.message || 'No se pudo completar la solicitud.');
  return result;
}
function field(label, name, max) {const wrap=node('label',label);const input=node('input');input.name=name;input.maxLength=max;wrap.append(input);return wrap;}
function money(value) { return new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(Number(value||0)); }
function renderProducts() {
  $('products').replaceChildren();
  const term=$('search').value.toLowerCase().trim();
  const filtered=products.filter(p=>`${p.nombre} ${p.codigo}`.toLowerCase().includes(term));
  $('status').textContent=products.length ? `${filtered.length} productos` : 'Pronto encontrarás nuestros productos aquí.';
  for(const p of filtered) {
    const article=node('article',undefined,'product');const img=node('img');img.className='photo';img.loading='lazy';img.alt=p.nombre;
    const fallback=()=>{img.onerror=null;img.src='logo.png';img.classList.add('fallback');img.alt='DAYKEDS';};
    if(p.imagen_url?.startsWith('https://')) {img.src=p.imagen_url;img.onerror=fallback;}else fallback();
    const content=node('div',undefined,'product-content');content.append(node('p',p.codigo,'code'),node('h2',p.nombre),node('p',p.descripcion||'','description'),node('p',money(p.precio),'quote-price'));
    const form=node('form');const variants=node('div',undefined,'variants');variants.append(field('Color (opcional)','color',80),field('Talla (opcional)','talla',30));
    const row=node('div',undefined,'add-row');const label=node('label','Cantidad');const input=node('input');Object.assign(input,{type:'number',min:'1',max:'100000',step:'1',value:'1',required:true,name:'cantidad'});label.append(input);
    const add=node('button','Agregar','primary');add.type='submit';row.append(label,add);form.append(variants,row);content.append(form);article.append(img,content);$('products').append(article);
    form.addEventListener('submit',e=>{e.preventDefault();try{const data=new FormData(form);cart=addItem(cart,{producto_id:p.id,nombre:p.nombre,precio:Number(p.precio),cantidad:quantity(data.get('cantidad')),color:data.get('color').trim(),talla:data.get('talla').trim()});pending=null;save();renderCart();add.textContent='Agregado';setTimeout(()=>add.textContent='Agregar',1200);}catch(error){alert(error.message);}});
  }
}
function renderCart() {
  $('items').replaceChildren();$('count').textContent=cart.length;
  cart.forEach((item,i)=>{
    const row=node('div',undefined,'cart-item');const desc=node('div');desc.append(node('strong',item.nombre),node('small',[item.color,item.talla].filter(Boolean).join(' · ')),node('small',`${money(item.precio)} × ${item.cantidad} = ${money(Number(item.precio||0)*item.cantidad)}`));
    const input=node('input');Object.assign(input,{type:'number',min:'1',max:'100000',step:'1',value:String(item.cantidad)});input.setAttribute('aria-label',`Cantidad de ${item.nombre}`);
    input.onchange=()=>{try{item.cantidad=quantity(input.value);pending=null;save();renderCart();}catch(e){input.value=item.cantidad;alert(e.message);}};
    const remove=node('button','×');remove.setAttribute('aria-label',`Quitar ${item.nombre}`);remove.onclick=()=>{cart.splice(i,1);pending=null;save();renderCart();};
    row.append(desc,input,remove);$('items').append(row);
  });
  $('units').textContent=cart.length?`${cart.reduce((n,x)=>n+x.cantidad,0)} unidades · Total referencial ${money(cart.reduce((n,x)=>n+Number(x.precio||0)*x.cantidad,0))}`:'Tu solicitud está vacía.';
  $('send').disabled=!cart.length||sending;
}
async function load() {
  $('retry').hidden=true;$('status').textContent='Cargando catálogo…';
  if(!/^[0-9a-f-]{36}$/i.test(catalog||'')) {$('status').textContent='Abre el enlace del catálogo que te compartió DAYKEDS.';return;}
  try {const data=await rpc('ver_catalogo_web',{p_catalogo_id:catalog});if(!data)throw new Error('Este catálogo no está disponible.');products=data.productos;renderProducts();}
  catch(e){$('status').textContent=e.message;$('retry').hidden=false;}
}
$('brand').onclick=e=>{e.preventDefault();window.scrollTo({top:0});};$('search').oninput=renderProducts;$('retry').onclick=load;
$('cart-button').onclick=()=>{$('success').hidden=true;$('checkout').hidden=false;renderCart();$('cart').showModal();};
$('close').onclick=()=>{if(!sending)$('cart').close();};$('done').onclick=()=>$('cart').close();
$('cart').addEventListener('cancel',e=>{if(sending)e.preventDefault();});
$('checkout').onsubmit=async e=>{
  e.preventDefault();if(sending||!cart.length)return;$('error').textContent='';
  try {
    const data=new FormData(e.target);const body={p_catalogo_id:catalog,p_nombre:data.get('nombre').trim(),p_whatsapp:phoneNumber(data.get('pais'),data.get('telefono')),p_documento:data.get('documento').trim(),p_observaciones:data.get('observaciones').trim(),p_items:cart.map(({producto_id,cantidad,color,talla})=>({producto_id,cantidad:quantity(cantidad),color,talla}))};
    if(body.p_nombre.length<2)throw new Error('Ingresa tu nombre.');
    const fingerprint=JSON.stringify(body);if(!pending||pending.fingerprint!==fingerprint)pending={fingerprint,id:crypto.randomUUID()};save();
    sending=true;$('send').disabled=true;$('send').textContent='Enviando…';
    const receipt=await rpc('enviar_solicitud_catalogo',{...body,p_clave_envio:pending.id});
    if(typeof receipt!=='string')throw new Error('No se recibió la confirmación. Intenta nuevamente.');
    cart=[];pending=null;save();renderCart();$('checkout').reset();$('checkout').hidden=true;$('success').hidden=false;$('reference').textContent=`Referencia: ${receipt.slice(0,8).toUpperCase()}`;
  }catch(error){$('error').textContent=error.name==='TimeoutError'?'No recibimos confirmación. Reintenta sin cambiar los datos; tu solicitud no se duplicará.':error.message;}
  finally{sending=false;$('send').textContent='Enviar solicitud';renderCart();}
};
renderCart();load();
