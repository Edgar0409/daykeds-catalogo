import test from 'node:test';
import assert from 'node:assert/strict';
import {phoneNumber,quantity,addItem} from '../dist/model.mjs';
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
