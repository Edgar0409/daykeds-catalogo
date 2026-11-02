import test from 'node:test';
import assert from 'node:assert/strict';
import {phoneNumber,quantity,addItem,orderSummary} from '../dist/model.mjs';
test('WhatsApp peruano e internacional',()=>{
  assert.equal(phoneNumber('51','987 654 321'),'51987654321');
  assert.equal(phoneNumber('51','+51 987654321'),'51987654321');
  assert.equal(phoneNumber('','+57 3001234567'),'573001234567');
  assert.throws(()=>phoneNumber('51','123'));
});
test('Cantidad entera positiva',()=>{for(const v of [0,-2,1.5,'hola',100001])assert.throws(()=>quantity(v));assert.equal(quantity('1000'),1000);});
test('Combina variantes iguales y conserva tallas distintas',()=>{
  const item={producto_id:1,cantidad:3,color:'Negro',talla:'L'};
  const original=[item];const added=addItem(original,item);
  assert.equal(added[0].cantidad,6);assert.equal(original[0].cantidad,3);
  assert.equal(addItem(added,{...item,talla:'M'}).length,2);
});
test('El mínimo por talla se acumula entre diseños',()=>{
  const cart=[
    {producto_id:1,cantidad:2,color:'Rojo',talla:'4'},
    {producto_id:2,cantidad:1,color:'Verde',talla:'4'},
    {producto_id:1,cantidad:3,color:'Rojo',talla:'S'},
    {producto_id:2,cantidad:3,color:'Verde',talla:'M'},
    {producto_id:3,cantidad:3,color:'Rojo',talla:'L'},
  ];
  const summary=orderSummary(cart);
  assert.equal(summary.total,12);
  assert.equal(summary.quantitiesBySize['4'],3);
  assert.equal(summary.canRequest,true);
  assert.equal(orderSummary([{producto_id:1,cantidad:2,talla:'4'}]).incompleteSizes[0].missing,1);
});
