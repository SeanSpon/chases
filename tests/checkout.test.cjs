'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Ledger,money,validateRecipe,fingerprint}=require('../src/checkout.cjs');
const limits={maxUnitPrice:15,maxBudget:60,quantityLimit:2};
const recipe={unitPrice:'#price',add:'#add',steps:['#checkout'],itemName:'#name',expectedItem:'NeeDoh Nice Cube',quantity:'#quantity',cartCount:'#count',total:'#total',pay:'#pay',origins:['https://shop.example.com']};
test('USD parsing rejects multiple prices, unsupported currency and invalid amounts',()=>{
 assert.equal(money('Total $1,234.56 USD'),123456);assert.equal(money('US$8.99'),899);
 for(const s of ['$8.99 / $9.99','CAD $8.99','€9.99','9.99','$0.00','$NaN'])assert.throws(()=>money(s));
});
test('recipe validation and verification include product, all selectors and purchase limits',()=>{
 const item={url:'https://shop.example.com/toy',recipe:validateRecipe(recipe,'https://shop.example.com/toy')};
 const hash=fingerprint(item,limits);assert.notEqual(hash,fingerprint(item,{...limits,maxBudget:61}));
 assert.notEqual(hash,fingerprint({...item,recipe:{...item.recipe,pay:'#another'}},limits));
 assert.throws(()=>validateRecipe({...recipe,total:''},item.url));assert.throws(()=>validateRecipe({...recipe,origins:['http://bad.test']},item.url));
});
test('ledger persists charge reservations, counts uncertain purchases and never clears ambiguous orders',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'autocart-ledger-')),file=path.join(dir,'history.json'),item={name:'Toy',url:'https://shop.example.com/toy'};
 try{const l=new Ledger(file);l.put(item,{state:'submitting',cents:1299});const reloaded=new Ledger(file);assert.deepEqual(reloaded.totals(),{cents:1299,quantity:1});assert.throws(()=>reloaded.clearAttention(item));reloaded.put(item,{state:'attention',cents:0});reloaded.clearAttention(item);assert.equal(reloaded.get(item),undefined);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
