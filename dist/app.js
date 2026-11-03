import {phoneNumber, quantity, addItem, orderSummary} from './model.mjs';

const URL = 'https://yyvemwpssysspysnseby.supabase.co';
const publicKey = 'sb_publishable_Wqp_XJZ30jx9dqMilfAIGQ_ZqBNibeo';
const $ = id => document.getElementById(id);
const catalog = new URLSearchParams(location.hash.slice(1)).get('catalogo');
const sizes = ['4', '6', '8', '10', '12', '14', '16', 'S', 'M', 'L'];
let products = [], cart = [], pending = null, sending = false;
let activeProduct = null;
const drafts = new Map();
const storeKey = 'daykeds-cart-' + catalog;

function save() { try { sessionStorage.setItem(storeKey, JSON.stringify({cart, pending})); } catch {} }
try {
  const saved = JSON.parse(sessionStorage.getItem(storeKey) || 'null');
  if (saved && Array.isArray(saved.cart)) { cart = saved.cart; pending = saved.pending; }
} catch {}

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function money(value) {
  return new Intl.NumberFormat('es-PE', {style: 'currency', currency: 'PEN'}).format(Number(value || 0));
}

function cartTotal() {
  return cart.reduce((total, item) => total + Number(item.precio || 0) * Number(item.cantidad || 0), 0);
}

function sizeConfig(product, size) {
  const prices = product.precios_talla && typeof product.precios_talla === 'object' ? product.precios_talla : {};
  const value = prices[size];
  if (value && typeof value === 'object') return {price: Number(value.precio ?? product.precio ?? 0), available: value.disponible !== false};
  return {price: Number(value ?? product.precio ?? 0), available: true};
}

function priceForSize(product, size) { return sizeConfig(product, size).price; }

function priceLabel(product) {
  const values = sizes.map(size => priceForSize(product, size)).filter(value => value > 0);
  if (!values.length) return 'Precio por confirmar';
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? money(min) + ' por unidad' : 'Desde ' + money(min) + ' por unidad';
}

function imagesFor(product) {
  const raw = Array.isArray(product.imagenes) ? product.imagenes : [];
  const images = raw
    .filter(image => image && image.url)
    .sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0));
  if (images.length) return images;
  return [{color: 'Color por confirmar', url: product.imagen_url || 'logo.png', orden: 1}];
}

function imageNode(product, className = 'photo') {
  const image = node('img');
  image.className = className;
  image.loading = 'lazy';
  image.alt = product.nombre;
  image.src = imagesFor(product)[0].url;
  image.onerror = () => {
    image.onerror = null;
    image.src = 'logo.png';
    image.classList.add('fallback');
    image.alt = 'DAYKEDS';
  };
  return image;
}

function priceTable(product) {
  const table = node('div', undefined, 'size-prices');
  const grid = node('div', undefined, 'size-price-grid');
  for (const size of sizes) {
    const config = sizeConfig(product, size);
    const line = node('div', undefined, 'size-price');
    if (!config.available) line.classList.add('sold-out');
    line.append(node('span', 'Talla ' + size), node('b', config.available ? money(config.price) : 'Agotada'));
    grid.append(line);
  }
  table.append(grid);
  return table;
}

async function rpc(name, body) {
  const response = await fetch(URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {apikey: publicKey, 'Content-Type': 'application/json'},
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(response.status === 404 ? 'El catálogo todavía no está habilitado.' : result.message || 'No se pudo completar la solicitud.');
  return result;
}

function sizeRules(summary) {
  if (!summary.total) return 'Elige diseño, color y talla. Cada combinación inicia con 2 prendas.';
  if (summary.incompleteItems.length) {
    return 'Cada combinación de diseño, color y talla debe tener al menos 2 prendas.';
  }
  if (!summary.hasMinimumOrder) return 'Faltan ' + (12 - summary.total) + ' prendas para el pedido mínimo.';
  return summary.total + ' prendas. Pedido mínimo completado.';
}

function renderProducts() {
  $('products').replaceChildren();
  const term = $('search').value.toLowerCase().trim();
  const filtered = products.filter(product => (product.nombre + ' ' + product.codigo).toLowerCase().includes(term));
  $('status').textContent = products.length ? filtered.length + ' diseños disponibles' : 'Pronto encontrarás nuestros diseños aquí.';
  for (const product of filtered) {
    const article = node('article', undefined, 'product');
    const open = node('button', undefined, 'product-open');
    open.type = 'button';
    open.append(imageNode(product), node('p', product.codigo, 'code'), node('h2', product.nombre), node('p', priceLabel(product), 'quote-price'));
    open.onclick = () => openDetail(product);
    const choose = node('button', 'Ver diseño y elegir tallas', 'primary product-choose');
    choose.type = 'button';
    choose.onclick = () => openDetail(product);
    article.append(open, choose);
    $('products').append(article);
  }
}

function getDraft(product) {
  if (!drafts.has(product.id)) {
    const first = imagesFor(product)[0];
    drafts.set(product.id, {color: first.color, imageUrl: first.url, quantities: new Map()});
  }
  return drafts.get(product.id);
}

function openDetail(product) {
  activeProduct = product;
  const draft = getDraft(product);
  $('detail-title').textContent = product.nombre;
  const body = $('detail-body');
  body.replaceChildren();
  const viewer = imageNode(product, 'detail-photo');
  viewer.src = draft.imageUrl;
  const dots = node('div', undefined, 'color-dots');
  const colorName = node('p', draft.color, 'chosen-color');
  const variants = imagesFor(product);
  const refresh = () => {
    viewer.src = draft.imageUrl;
    colorName.textContent = draft.color;
    [...dots.children].forEach(button => {
      const selected = button.dataset.color === draft.color;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  };
  for (const variant of variants) {
    const dot = node('button', undefined, 'color-dot');
    dot.type = 'button';
    dot.dataset.color = variant.color;
    dot.title = variant.color;
    dot.setAttribute('aria-label', 'Ver color ' + variant.color);
    dot.style.backgroundImage = `url("${String(variant.url).replace(/"/g, '%22')}")`;
    dot.onclick = () => { draft.color = variant.color; draft.imageUrl = variant.url; refresh(); };
    dots.append(dot);
  }
  const description = node('p', product.descripcion || 'Escoge la talla y color que prefieras.', 'detail-description');
  const priceDetails = node('details');
  priceDetails.className = 'price-details';
  priceDetails.open = false;
  priceDetails.append(node('summary', 'Ver precios por talla'), priceTable(product));
  const pickerTitle = node('h3', 'Elige tus tallas');
  const help = node('p', 'Cada combinación de diseño, color y talla inicia con 2 prendas. Luego puedes aumentar de una en una.', 'size-help');
  const picker = node('div', undefined, 'size-picker');
  const selected = node('div', undefined, 'selected-sizes');
  const subtotal = node('p', undefined, 'design-subtotal');
  const add = node('button', 'Agregar diseño al pedido', 'primary');
  add.type = 'button';
  const renderSelection = () => {
    selected.replaceChildren();
    let total = 0;
    for (const [size, amount] of draft.quantities) {
      total += amount * priceForSize(product, size);
      const line = node('div', undefined, 'selected-size');
      const info = node('div');
      info.append(node('strong', 'Talla ' + size), node('small', money(priceForSize(product, size)) + ' por unidad'));
      const controls = node('div', undefined, 'quantity-stepper');
      const minus = node('button', '−'); minus.type = 'button';
      minus.onclick = () => { if (amount === 2) draft.quantities.delete(size); else draft.quantities.set(size, amount - 1); renderSelection(); };
      const value = node('span', String(amount));
      const plus = node('button', '+'); plus.type = 'button';
      plus.onclick = () => { draft.quantities.set(size, amount + 1); renderSelection(); };
      controls.append(minus, value, plus); line.append(info, controls); selected.append(line);
    }
    [...picker.children].forEach(button => button.classList.toggle('selected', draft.quantities.has(button.dataset.size)));
    subtotal.textContent = draft.quantities.size ? 'Subtotal de este diseño: ' + money(total) : 'Selecciona al menos una talla.';
    add.disabled = draft.quantities.size === 0;
  };
  for (const size of sizes) {
    const config = sizeConfig(product, size);
    const button = node('button', undefined, 'size-choice');
    button.type = 'button'; button.dataset.size = size;
    button.append(
      node('strong', size),
      node('small', config.available ? money(config.price) : 'Agotada'),
    );
    if (!config.available) { button.disabled = true; button.classList.add('sold-out'); button.title = 'Talla agotada'; }
    button.onclick = () => { if (!draft.quantities.has(size)) draft.quantities.set(size, 2); renderSelection(); };
    picker.append(button);
  }
  add.onclick = () => {
    try {
      for (const [talla, cantidad] of draft.quantities) {
        cart = addItem(cart, {producto_id: product.id, nombre: product.nombre, precio: priceForSize(product, talla), cantidad: quantity(cantidad), color: draft.color, talla});
      }
      draft.quantities.clear(); pending = null; save(); renderCart(); renderSelection();
      add.textContent = 'Agregado al pedido';
      setTimeout(() => { add.textContent = 'Agregar diseño al pedido'; }, 1200);
    } catch (error) { alert(error.message); }
  };
  const actionBar = node('div', undefined, 'detail-action-bar');
  actionBar.append(subtotal, add);
  body.append(viewer, dots, colorName, description, priceDetails, pickerTitle, help, picker, selected, actionBar);
  refresh(); renderSelection();
  $('detail').showModal();
}

function renderCart() {
  $('items').replaceChildren();
  const summary = orderSummary(cart);
  $('count').textContent = summary.total;
  $('cart-total').textContent = money(cartTotal());
  for (const [index, item] of cart.entries()) {
    const row = node('div', undefined, 'cart-item');
    const description = node('div');
    description.append(node('strong', item.nombre), node('small', [item.color, 'Talla ' + item.talla].filter(Boolean).join(' · ')), node('small', money(item.precio) + ' × ' + item.cantidad + ' = ' + money(Number(item.precio || 0) * item.cantidad)));
    const input = node('input');
    Object.assign(input, {type: 'number', min: '2', max: '100000', step: '1', value: String(item.cantidad)});
    input.setAttribute('aria-label', 'Cantidad de ' + item.nombre + ', talla ' + item.talla);
    input.onchange = () => { try { item.cantidad = quantity(input.value); pending = null; save(); renderCart(); } catch (error) { input.value = item.cantidad; alert(error.message); } };
    const remove = node('button', '×');
    remove.setAttribute('aria-label', 'Quitar ' + item.nombre + ', talla ' + item.talla);
    remove.onclick = () => { cart.splice(index, 1); pending = null; save(); renderCart(); };
    row.append(description, input, remove); $('items').append(row);
  }
  $('units').textContent = cart.length ? summary.total + ' prendas en tu solicitud' : 'Tu solicitud está vacía.';
  $('cart-grand-total').textContent = cart.length ? money(cartTotal()) : '';
  $('size-rules').textContent = cart.length ? sizeRules(summary) : '';
  $('size-rules').classList.toggle('is-valid', summary.canRequest);
  $('send').disabled = !summary.canRequest || sending;
  $('send').textContent = sending ? 'Enviando...' : summary.canRequest ? 'Enviar solicitud' : 'Completa el pedido mínimo';
}

async function load() {
  $('retry').hidden = true; $('status').textContent = 'Cargando catálogo...';
  if (!/^[0-9a-f-]{36}$/i.test(catalog || '')) { $('status').textContent = 'Abre el enlace del catálogo que te compartió DAYKEDS.'; return; }
  try {
    const data = await rpc('ver_catalogo_web', {p_catalogo_id: catalog});
    if (!data) throw new Error('Este catálogo no está disponible.');
    products = data.productos || []; renderProducts();
  } catch (error) { $('status').textContent = error.message; $('retry').hidden = false; }
}

$('brand').onclick = event => { event.preventDefault(); window.scrollTo({top: 0, behavior: 'smooth'}); };
$('search').oninput = renderProducts;
$('retry').onclick = load;
$('cart-button').onclick = () => { $('success').hidden = true; $('checkout').hidden = false; renderCart(); $('cart').showModal(); };
$('close').onclick = () => { if (!sending) $('cart').close(); };
$('close-detail').onclick = () => $('detail').close();
$('choose-more').onclick = () => { $('cart').close(); window.scrollTo({top: 0, behavior: 'smooth'}); };
$('done').onclick = () => $('cart').close();
$('cart').addEventListener('cancel', event => { if (sending) event.preventDefault(); });

$('checkout').onsubmit = async event => {
  event.preventDefault(); if (sending || !cart.length) return;
  $('error').textContent = '';
  try {
    const summary = orderSummary(cart);
    if (!summary.canRequest) throw new Error(sizeRules(summary));
    const data = new FormData(event.target);
    const body = {p_catalogo_id: catalog, p_nombre: data.get('nombre').trim(), p_whatsapp: phoneNumber(data.get('pais'), data.get('telefono')), p_documento: data.get('documento').trim(), p_observaciones: data.get('observaciones').trim(), p_items: cart.map(({producto_id, cantidad, color, talla}) => ({producto_id, cantidad: quantity(cantidad), color, talla}))};
    if (body.p_nombre.length < 2) throw new Error('Ingresa tu nombre.');
    const fingerprint = JSON.stringify(body);
    if (!pending || pending.fingerprint !== fingerprint) pending = {fingerprint, id: crypto.randomUUID()};
    save(); sending = true; renderCart();
    const receipt = await rpc('enviar_solicitud_catalogo', {...body, p_clave_envio: pending.id});
    if (typeof receipt !== 'string') throw new Error('No se recibió la confirmación. Intenta nuevamente.');
    cart = []; pending = null; save(); renderCart(); $('checkout').reset(); $('checkout').hidden = true; $('success').hidden = false;
    $('reference').textContent = 'Referencia: ' + receipt.slice(0, 8).toUpperCase();
  } catch (error) {
    $('error').textContent = error.name === 'TimeoutError' ? 'No recibimos confirmación. Reintenta sin cambiar los datos; tu solicitud no se duplicará.' : error.message;
  } finally { sending = false; renderCart(); }
};

renderCart();
load();
