import {phoneNumber, quantity, addItem, orderSummary} from './model.mjs';

const URL = 'https://yyvemwpssysspysnseby.supabase.co';
const publicKey = 'sb_publishable_Wqp_XJZ30jx9dqMilfAIGQ_ZqBNibeo';
const $ = id => document.getElementById(id);
const catalog = new URLSearchParams(location.hash.slice(1)).get('catalogo');
const colors = ['Rojo', 'Verde', 'Blanco', 'Negro', 'Otro / por confirmar'];
const sizes = ['4', '6', '8', '10', '12', '14', '16', 'S', 'M', 'L'];
let products = [], cart = [], pending = null, sending = false;
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

function sizeConfig(product, size) {
  const prices = product.precios_talla && typeof product.precios_talla === 'object'
    ? product.precios_talla
    : {};
  const value = prices[size];
  if (value && typeof value === 'object') {
    return {
      price: Number(value.precio ?? product.precio ?? 0),
      available: value.disponible !== false,
    };
  }
  return {price: Number(value ?? product.precio ?? 0), available: true};
}

function priceForSize(product, size) {
  return sizeConfig(product, size).price;
}

function priceLabel(product) {
  const values = sizes.map(size => priceForSize(product, size)).filter(value => value > 0);
  if (!values.length) return 'Precio por confirmar';
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? money(min) + ' por unidad' : 'Desde ' + money(min) + ' por unidad';
}

function priceTable(product) {
  const table = node('div', undefined, 'size-prices');
  table.append(node('strong', 'Precios por talla'));
  const grid = node('div', undefined, 'size-price-grid');
  for (const size of sizes) {
    const config = sizeConfig(product, size);
    const line = node('div', undefined, 'size-price');
    if (!config.available) line.classList.add('sold-out');
    line.append(
      node('span', 'Talla ' + size),
      node('b', config.available ? money(config.price) : 'Agotada'),
    );
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
  if (!response.ok) {
    throw new Error(response.status === 404
      ? 'El catálogo todavía no está habilitado.'
      : result.message || 'No se pudo completar la solicitud.');
  }
  return result;
}

function sizeRules(summary) {
  const selected = Object.entries(summary.quantitiesBySize);
  if (!selected.length) return 'Elige las tallas que necesitas. La primera selección agrega 3 polos.';
  const current = selected.map(([size, amount]) => 'Talla ' + size + ': ' + amount).join(' · ');
  if (summary.incompleteSizes.length) {
    const missing = summary.incompleteSizes
      .map(item => 'talla ' + item.size + ': falta ' + item.missing)
      .join(' · ');
    return current + '. Completa ' + missing + '.';
  }
  if (!summary.hasMinimumOrder) return current + '. Faltan ' + (12 - summary.total) + ' polos para el pedido mínimo.';
  return current + '. Pedido mínimo completado.';
}

function makeColorSelect() {
  const select = node('select');
  select.name = 'color';
  const placeholder = node('option', 'Elige un color');
  placeholder.value = '';
  placeholder.disabled = true;
  placeholder.selected = true;
  select.append(placeholder);
  for (const color of colors) {
    const option = node('option', color);
    option.value = color;
    select.append(option);
  }
  return select;
}

function renderProducts() {
  $('products').replaceChildren();
  const term = $('search').value.toLowerCase().trim();
  const filtered = products.filter(product => (product.nombre + ' ' + product.codigo).toLowerCase().includes(term));
  $('status').textContent = products.length ? filtered.length + ' diseños disponibles' : 'Pronto encontrarás nuestros productos aquí.';

  for (const product of filtered) {
    const article = node('article', undefined, 'product');
    const image = node('img');
    image.className = 'photo';
    image.loading = 'lazy';
    image.alt = product.nombre;
    const fallback = () => {
      image.onerror = null;
      image.src = 'logo.png';
      image.classList.add('fallback');
      image.alt = 'DAYKEDS';
    };
    if (product.imagen_url?.startsWith('https://')) {
      image.src = product.imagen_url;
      image.onerror = fallback;
    } else {
      fallback();
    }

    const content = node('div', undefined, 'product-content');
    content.append(
      node('p', product.codigo, 'code'),
      node('h2', product.nombre),
      node('p', product.descripcion || '', 'description'),
      node('p', priceLabel(product), 'quote-price'),
      priceTable(product),
    );

    const form = node('form');
    const colorLabel = node('label', 'Color');
    const colorSelect = makeColorSelect();
    colorLabel.append(colorSelect);
    form.append(colorLabel, node('p', 'Toca las tallas que necesitas. Cada talla empieza en 3 polos; luego puedes ajustar de uno en uno.', 'size-help'));

    const selectedSizes = new Map();
    const sizePicker = node('div', undefined, 'size-picker');
    const selectedLines = node('div', undefined, 'selected-sizes');
    const add = node('button', 'Agregar diseño al pedido', 'primary');
    add.type = 'submit';
    add.disabled = true;

    const renderSelectedSizes = () => {
      selectedLines.replaceChildren();
      for (const [size, amount] of selectedSizes) {
        const line = node('div', undefined, 'selected-size');
        const sizeInfo = node('div');
        sizeInfo.append(node('strong', 'Talla ' + size), node('small', money(priceForSize(product, size)) + ' por unidad'));
        line.append(sizeInfo);
        const controls = node('div', undefined, 'quantity-stepper');
        const minus = node('button', '−');
        minus.type = 'button';
        minus.setAttribute('aria-label', 'Reducir talla ' + size);
        minus.onclick = () => {
          if (amount === 1) selectedSizes.delete(size);
          else selectedSizes.set(size, amount - 1);
          renderSelectedSizes();
        };
        const value = node('span', String(amount));
        const plus = node('button', '+');
        plus.type = 'button';
        plus.setAttribute('aria-label', 'Aumentar talla ' + size);
        plus.onclick = () => {
          selectedSizes.set(size, amount + 1);
          renderSelectedSizes();
        };
        controls.append(minus, value, plus);
        line.append(controls);
        selectedLines.append(line);
      }
      [...sizePicker.children].forEach(button => {
        const active = selectedSizes.has(button.dataset.size);
        button.classList.toggle('selected', active);
        button.setAttribute('aria-pressed', String(active));
      });
      add.disabled = selectedSizes.size === 0;
    };

    for (const size of sizes) {
      const config = sizeConfig(product, size);
      const button = node('button', size, 'size-choice');
      button.type = 'button';
      button.dataset.size = size;
      button.setAttribute('aria-pressed', 'false');
      if (!config.available) {
        button.disabled = true;
        button.classList.add('sold-out');
        button.title = 'Talla agotada';
      }
      button.onclick = () => {
        if (!selectedSizes.has(size)) selectedSizes.set(size, 3);
        renderSelectedSizes();
      };
      sizePicker.append(button);
    }

    const row = node('div', undefined, 'add-row');
    row.append(add);
    form.append(sizePicker, selectedLines, row);
    content.append(form);
    article.append(image, content);
    $('products').append(article);

    form.addEventListener('submit', event => {
      event.preventDefault();
      try {
        const color = colorSelect.value;
        if (!color) throw new Error('Elige el color para este diseño.');
        for (const [talla, cantidad] of selectedSizes) {
          cart = addItem(cart, {
            producto_id: product.id,
            nombre: product.nombre,
            precio: priceForSize(product, talla),
            cantidad: quantity(cantidad),
            color,
            talla,
          });
        }
        pending = null;
        save();
        renderCart();
        selectedSizes.clear();
        colorSelect.value = '';
        renderSelectedSizes();
        add.textContent = 'Agregado';
        setTimeout(() => { add.textContent = 'Agregar diseño al pedido'; }, 1200);
      } catch (error) {
        alert(error.message);
      }
    });
  }
}

function renderCart() {
  $('items').replaceChildren();
  $('count').textContent = cart.length;
  for (const [index, item] of cart.entries()) {
    const row = node('div', undefined, 'cart-item');
    const description = node('div');
    description.append(
      node('strong', item.nombre),
      node('small', [item.color, 'Talla ' + item.talla].filter(Boolean).join(' · ')),
      node('small', money(item.precio) + ' × ' + item.cantidad + ' = ' + money(Number(item.precio || 0) * item.cantidad)),
    );
    const input = node('input');
    Object.assign(input, {type: 'number', min: '1', max: '100000', step: '1', value: String(item.cantidad)});
    input.setAttribute('aria-label', 'Cantidad de ' + item.nombre + ', talla ' + item.talla);
    input.onchange = () => {
      try {
        item.cantidad = quantity(input.value);
        pending = null;
        save();
        renderCart();
      } catch (error) {
        input.value = item.cantidad;
        alert(error.message);
      }
    };
    const remove = node('button', '×');
    remove.setAttribute('aria-label', 'Quitar ' + item.nombre + ', talla ' + item.talla);
    remove.onclick = () => {
      cart.splice(index, 1);
      pending = null;
      save();
      renderCart();
    };
    row.append(description, input, remove);
    $('items').append(row);
  }

  const summary = orderSummary(cart);
  $('units').textContent = cart.length
    ? summary.total + ' unidades · Total referencial ' + money(cart.reduce((total, item) => total + Number(item.precio || 0) * item.cantidad, 0))
    : 'Tu solicitud está vacía.';
  $('size-rules').textContent = cart.length ? sizeRules(summary) : '';
  $('size-rules').classList.toggle('is-valid', summary.canRequest);
  $('send').disabled = !summary.canRequest || sending;
  $('send').textContent = sending ? 'Enviando…' : summary.canRequest ? 'Enviar solicitud' : 'Completa el pedido mínimo';
}

async function load() {
  $('retry').hidden = true;
  $('status').textContent = 'Cargando catálogo…';
  if (!/^[0-9a-f-]{36}$/i.test(catalog || '')) {
    $('status').textContent = 'Abre el enlace del catálogo que te compartió DAYKEDS.';
    return;
  }
  try {
    const data = await rpc('ver_catalogo_web', {p_catalogo_id: catalog});
    if (!data) throw new Error('Este catálogo no está disponible.');
    products = data.productos;
    renderProducts();
  } catch (error) {
    $('status').textContent = error.message;
    $('retry').hidden = false;
  }
}

$('brand').onclick = event => { event.preventDefault(); window.scrollTo({top: 0}); };
$('search').oninput = renderProducts;
$('retry').onclick = load;
$('cart-button').onclick = () => {
  $('success').hidden = true;
  $('checkout').hidden = false;
  renderCart();
  $('cart').showModal();
};
$('close').onclick = () => { if (!sending) $('cart').close(); };
$('done').onclick = () => $('cart').close();
$('cart').addEventListener('cancel', event => { if (sending) event.preventDefault(); });

$('checkout').onsubmit = async event => {
  event.preventDefault();
  if (sending || !cart.length) return;
  $('error').textContent = '';
  try {
    const summary = orderSummary(cart);
    if (!summary.canRequest) throw new Error(sizeRules(summary));
    const data = new FormData(event.target);
    const body = {
      p_catalogo_id: catalog,
      p_nombre: data.get('nombre').trim(),
      p_whatsapp: phoneNumber(data.get('pais'), data.get('telefono')),
      p_documento: data.get('documento').trim(),
      p_observaciones: data.get('observaciones').trim(),
      p_items: cart.map(({producto_id, cantidad, color, talla}) => ({producto_id, cantidad: quantity(cantidad), color, talla})),
    };
    if (body.p_nombre.length < 2) throw new Error('Ingresa tu nombre.');
    const fingerprint = JSON.stringify(body);
    if (!pending || pending.fingerprint !== fingerprint) pending = {fingerprint, id: crypto.randomUUID()};
    save();
    sending = true;
    renderCart();
    const receipt = await rpc('enviar_solicitud_catalogo', {...body, p_clave_envio: pending.id});
    if (typeof receipt !== 'string') throw new Error('No se recibió la confirmación. Intenta nuevamente.');
    cart = [];
    pending = null;
    save();
    renderCart();
    $('checkout').reset();
    $('checkout').hidden = true;
    $('success').hidden = false;
    $('reference').textContent = 'Referencia: ' + receipt.slice(0, 8).toUpperCase();
  } catch (error) {
    $('error').textContent = error.name === 'TimeoutError'
      ? 'No recibimos confirmación. Reintenta sin cambiar los datos; tu solicitud no se duplicará.'
      : error.message;
  } finally {
    sending = false;
    renderCart();
  }
};

renderCart();
load();
