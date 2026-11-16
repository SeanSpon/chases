'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright-core');
const {findBrowser}=require('../src/monitor.cjs');
const {CheckoutEngine,Ledger,fingerprint}=require('../src/checkout.cjs');
const {pick}=require('../src/setup.cjs');
const origin='https://shop.autocart.example';
const limits={maxUnitPrice:15,maxBudget:60,quantityLimit:2};
const recipe={unitPrice:'#price',add:'#add',steps:['#checkout'],itemName:'#name',expectedItem:'NeeDoh Nice Cube',quantity:'#quantity',cartCount:'#count',total:'#total',pay:'#pay',origins:[origin]};
test('real Playwright checkout integration against a simulated retailer',async t=>{
 const executablePath=process.env.AUTOCART_TEST_BROWSER||findBrowser()||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
 assert.ok(executablePath,'Chrome/Edge must be installed to run purchase integration tests.');
 const browser=await chromium.launch({executablePath,headless:true,args:process.platform==='linux'?['--no-sandbox']:[]});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'autocart-browser-'));
 async function fixture(options={}){
  const context=await browser.newContext();let charges=0,adds=0;
  await context.route(origin+'/**',async route=>{
   const pathname=new URL(route.request().url()).pathname;
   if(pathname==='/charge'){charges++;return route.fulfill({contentType:'application/json',body:JSON.stringify({id:'AC-10001'})});}
   let body='';
   if(pathname==='/product')body=options.blocked?'Verify you are human':`<h1>NeeDoh Nice Cube</h1><span id="price">${options.price||'$8.99'}</span><button id="add" onclick="location.href='/cart'">Add to cart</button>`;
   else if(pathname==='/cart'){adds++;body=`<button id="checkout" onclick="location.href='${options.redirect||'/checkout'}'">${options.earlyPay?'Place order':'Checkout'}</button>`;}
   else if(pathname==='/checkout')body=`<span id="name">${options.wrongItem?'Different toy':'NeeDoh Nice Cube'}</span><input id="quantity" value="${options.quantity||1}"><span id="count">${options.cartCount||1}</span><span id="total">${options.total||'$12.62'}</span><button id="pay" onclick="this.disabled=true;fetch('/charge',{method:'POST'}).then(r=>r.json()).then(r=>{document.body.innerHTML=${JSON.stringify(options.noReceipt?'Payment processing':'Thank you for your order. Order number: AC-10001')}})">Place order</button>`;
   else body='Not found';
   return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body>'+body+'</body></html>'});
  });
  const page=await context.newPage(),item={id:'toy',name:'NeeDoh Nice Cube',url:origin+'/product',recipe:structuredClone(recipe)};item.verified=fingerprint(item,limits);
  const ledger=new Ledger(path.join(dir,'ledger-'+Math.random()+'.json')),engine=new CheckoutEngine(ledger);
  return {context,page,item,ledger,engine,charges:()=>charges,adds:()=>adds};
 }
 try{
  await t.test('dry run navigates and checks totals without submitting a payment',async()=>{const f=await fixture();try{const r=await f.engine.run(f.page,f.item,limits,{dryRun:true});assert.equal(r.state,'tested');assert.equal(r.total,1262);assert.equal(f.charges(),0);assert.equal(f.adds(),1);assert.equal(f.ledger.get(f.item),undefined);}finally{await f.context.close();}});
  await t.test('auto-buy submits exactly once, finds a receipt and refuses repeats after restart',async()=>{const f=await fixture();try{const r=await f.engine.run(f.page,f.item,limits);assert.equal(r.state,'purchased');assert.equal(r.orderId,'AC-10001');assert.equal(f.charges(),1);const restarted=new CheckoutEngine(new Ledger(f.ledger.file));await assert.rejects(restarted.run(f.page,f.item,limits),/locked/);assert.equal(f.charges(),1);}finally{await f.context.close();}});
  for(const [name,opts,adjust,pattern] of [
   ['unit price cap',{price:'$99.00'},null,/item price/],
   ['tax and shipping budget',{total:'$61.00'},null,/budget/],
   ['wrong item',{wrongItem:true},null,/does not match/],
   ['extra quantity',{quantity:2},null,/exactly one/],
   ['other cart items',{cartCount:2},null,/exactly one/],
   ['non USD currency',{total:'CAD $12.62'},null,/Only USD/],
   ['CAPTCHA / store block',{blocked:true},null,/verification/],
   ['payment recorded before guards',{earlyPay:true},null,/earlier step/],
   ['stale untested recipe',{},f=>{f.item.verified='old';},/Test this recipe/],
   ['global quantity limit',{},f=>{f.ledger.put({url:origin+'/other',name:'Other'},{state:'purchased',cents:100});f.ledger.put({url:origin+'/other2',name:'Other2'},{state:'uncertain',cents:100});},/item limit/],
   ['reserved budget across restarts',{},f=>{f.ledger.put({url:origin+'/other',name:'Other'},{state:'submitting',cents:5500});},/budget/]
  ])await t.test(name+' prevents charging',async()=>{const f=await fixture(opts);try{if(adjust)adjust(f);await assert.rejects(f.engine.run(f.page,f.item,limits),pattern);assert.equal(f.charges(),0);assert.equal(f.ledger.get(f.item).state,'attention');}finally{await f.context.close();}});
  await t.test('Stop before final submission prevents payment',async()=>{const f=await fixture();try{await assert.rejects(f.engine.run(f.page,f.item,limits,{isActive:()=>!f.page.url().endsWith('/checkout')}),/Stopped/);assert.equal(f.charges(),0);}finally{await f.context.close();}});
  await t.test('unexpected checkout domain is blocked',async()=>{const f=await fixture({redirect:'https://wrong.autocart.example/checkout'});try{await assert.rejects(f.engine.run(f.page,f.item,limits));assert.equal(f.charges(),0);}finally{await f.context.close();}});
  await t.test('missing receipt leaves a charged order uncertain and locked',async()=>{const f=await fixture({noReceipt:true});try{await assert.rejects(f.engine.run(f.page,f.item,limits,{receiptTimeout:600}),/No confirmed receipt/);assert.equal(f.charges(),1);assert.equal(f.ledger.get(f.item).state,'uncertain');assert.throws(()=>f.ledger.clearAttention(f.item));await assert.rejects(f.engine.run(f.page,f.item,limits),/locked/);assert.equal(f.charges(),1);}finally{await f.context.close();}});
  await t.test('picker captures a selector without activating the clicked purchase button',async()=>{const f=await fixture();try{await f.page.goto(origin+'/checkout');const picked=pick(f.page,'the FINAL order button');await f.page.locator('#autocart-picker').waitFor();await f.page.locator('#pay').click();const result=await picked;assert.equal(result.selector,'#pay');assert.equal(f.charges(),0);}finally{await f.context.close();}});
  await t.test('app UI supports bulk links, directions, setup dialog and start/stop',async()=>{
   const context=await browser.newContext({viewport:{width:1280,height:960}});
   try{
    const appOrigin='https://app.autocart.example';
    await context.addInitScript(()=>{let s={products:[],maxUnitPrice:15,maxBudget:60,quantityLimit:2,interval:3};window.autocart={get:async()=>structuredClone(s),save:async v=>{s=structuredClone(v);return structuredClone(s);},history:async()=>({}),start:async()=>true,stop:async()=>true,onEvent(){},practice:async()=>true,openProduct:async()=>true};});
    await context.route(appOrigin+'/**',async route=>{const pathname=new URL(route.request().url()).pathname;const file=path.join(__dirname,'..','src',pathname==='/'?'index.html':pathname.slice(1));if(!fs.existsSync(file))return route.fulfill({status:404,body:''});return route.fulfill({contentType:pathname.endsWith('.js')?'application/javascript':pathname.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file,'utf8')});});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(appOrigin);
    await page.getByRole('button',{name:'How to use this',exact:true}).click();assert.equal(await page.locator('#help').isVisible(),true);await page.locator('#close-help').click();
    await page.locator('#links').fill('Nice Cube | https://shop.example.com/nice-cube\nhttps://shop.example.com/dream-drop\nhttps://another.example.com/toy\nhttps://shop.example.com/nice-cube');await page.locator('#add').click();await page.getByText('3 / 100 products',{exact:true}).waitFor();assert.equal(await page.locator('.product').count(),3);assert.equal(await page.locator('.toggle input:checked').count(),0);assert.equal(await page.locator('.toggle input:disabled').count(),3);
    await page.getByRole('button',{name:'Set up auto-buy',exact:true}).first().click();assert.equal(await page.locator('#setup').isVisible(),true);assert.equal(await page.locator('#checkout-picks button').count(),5);await page.locator('#close-setup').click();
    await page.locator('#start').click();await page.getByText('Running',{exact:true}).waitFor();assert.equal(await page.locator('#maxBudget').isDisabled(),true);await page.locator('#stop').click();await page.getByText('Stopped',{exact:true}).waitFor();assert.deepEqual(errors,[]);
   }finally{await context.close();}
  });
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
});
