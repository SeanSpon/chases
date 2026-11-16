'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validate,defaults}=require('../src/settings.cjs');
test('multiple product settings survive saving and duplicate URLs are refused',()=>{
 const products=Array.from({length:5},(_,i)=>({id:String(i),name:'Toy '+i,url:'https://shop.example.com/toy/'+i}));
 assert.equal(validate({...defaults,products}).products.length,5);
 assert.throws(()=>validate({...defaults,products:[products[0],{...products[0],id:'other'}]}),/Duplicate/);
 assert.throws(()=>validate({...defaults,products:[{...products[0],autoBuy:true}]}),/Test without buying/);
 assert.throws(()=>validate({...defaults,quantityLimit:1.5}),/limits/);
});
