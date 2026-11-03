export function phoneNumber(country, input) {
  const digits = input.replace(/\D/g, '');
  if (country === '51') {
    const local = digits.startsWith('51') && digits.length === 11 ? digits.slice(2) : digits;
    if (!/^9\d{8}$/.test(local)) throw new Error('Ingresa un celular peruano de 9 dígitos.');
    return '51' + local;
  }
  if (!/^[1-9]\d{7,14}$/.test(digits)) throw new Error('Incluye el código de país y tu número de WhatsApp.');
  return digits;
}
export function quantity(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 100000) throw new Error('La cantidad debe ser un entero entre 1 y 100000.');
  return n;
}
export function addItem(cart, item) {
  const next = cart.map(x => ({...x}));
  const same = next.find(x => x.producto_id === item.producto_id && x.color === item.color && x.talla === item.talla);
  if (same) same.cantidad = quantity(same.cantidad + item.cantidad);
  else { if(next.length >= 50) throw new Error('Máximo 50 productos diferentes por solicitud.'); next.push({...item, cantidad:quantity(item.cantidad)}); }
  return next;
}

export function orderSummary(cart) {
  let total = 0;
  const incompleteItems = [];

  for (const item of cart) {
    const itemQuantity = quantity(item.cantidad);
    total += itemQuantity;
    if (itemQuantity < 2) {
      incompleteItems.push({
        productoId: item.producto_id,
        color: String(item.color || '').trim(),
        talla: String(item.talla || '').trim(),
        quantity: itemQuantity,
        missing: 2 - itemQuantity,
      });
    }
  }

  return {
    total,
    incompleteItems,
    hasMinimumOrder: total >= 12,
    canRequest: total >= 12 && incompleteItems.length === 0,
  };
}
