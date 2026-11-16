'use strict';
const {safeUrl}=require('./monitor.cjs');
const {validateRecipe,fingerprint}=require('./checkout.cjs');
const defaults={products:[],maxUnitPrice:15,maxBudget:60,quantityLimit:2,interval:3};
function validate(v,previous=defaults){
 if(!v||!Array.isArray(v.products)||v.products.length>100)throw Error('Use between 0 and 100 products.');
 const num=(x,min,max,integer=false)=>{const n=Number(x);if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isSafeInteger(n)))throw Error('Please check your limits.');return n;};
 const s={maxUnitPrice:num(v.maxUnitPrice,.01,100000),maxBudget:num(v.maxBudget,.01,100000),quantityLimit:num(v.quantityLimit,1,100,true),interval:num(v.interval,1,60,true)};
 const ids=new Set(),urls=new Set();
 s.products=v.products.map(p=>{
  const item={id:String(p.id).slice(0,60),name:String(p.name||'Product').trim().slice(0,100),url:safeUrl(p.url),autoBuy:p.autoBuy===true};
  if(!item.id||ids.has(item.id)||urls.has(item.url))throw Error('Duplicate product links are not allowed.');ids.add(item.id);urls.add(item.url);
  if(p.recipe)item.recipe=validateRecipe(p.recipe,item.url);
  const prior=previous.products.find(x=>x.id===item.id&&x.url===item.url);
  if(prior?.verified&&prior.verified===fingerprint(item,s))item.verified=prior.verified;
  if(item.autoBuy&&!item.verified)throw Error('Run Test without buying with the current limits before turning on Auto-buy.');
  return item;
 });return s;
}
module.exports={validate,defaults};
