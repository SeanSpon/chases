'use strict';
const {chromium}=require('playwright-core');
const fs=require('fs'),path=require('path'),net=require('net');
function findBrowser(){
 const roots=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean);
 for(const root of roots)for(const rel of ['Google/Chrome/Application/chrome.exe','Microsoft/Edge/Application/msedge.exe','BraveSoftware/Brave-Browser/Application/brave.exe']){const p=path.join(root,...rel.split('/'));if(fs.existsSync(p))return p;}
 return null;
}
function safeUrl(value){
 const u=new URL(value);
 if(u.protocol!=='https:'||!u.hostname.includes('.')||u.username||u.password||net.isIP(u.hostname))throw Error('Use a normal https:// product link with a public store hostname.');
 if(['localhost','0.0.0.0'].includes(u.hostname)||/\.(local|localhost|internal|test)$/.test(u.hostname))throw Error('Local URLs not allowed.');
 u.hash='';return u.toString();
}
class Monitor{
 constructor(userDataDir,emit,engine){this.dir=path.join(userDataDir,'shopping-browser');this.emit=emit;this.engine=engine;this.context=null;this.timer=null;this.started=false;this.busy=false;this.products=[];this.previous=new Map();this.activePages=new Set();this.generation=0;this.visible=false;this.launching=null;}
 async browser(visible=false){
  if(this.context)return this.context;
  if(this.launching)return this.launching;
  this.launching=(async()=>{
   const executablePath=findBrowser();if(!executablePath)throw Error('Install Chrome or Edge first.');
   const context=await chromium.launchPersistentContext(this.dir,{executablePath,headless:!visible,viewport:{width:1100,height:850},args:['--no-first-run'],acceptDownloads:false});
   this.context=context;this.visible=visible;
   context.on('close',()=>{if(this.context===context){this.context=null;this.stop();}});return context;
  })();
  try{return await this.launching;}finally{this.launching=null;}
 }
 async openSetup(url){await this.shutdown();const ctx=await this.browser(true);const page=await ctx.newPage();await page.goto(safeUrl(url),{waitUntil:'domcontentloaded',timeout:30000});await page.bringToFront();return true;}
 setupPage(){if(!this.context||!this.visible)throw Error('Press Open store setup first.');const pages=this.context.pages().filter(p=>!p.isClosed()&&p.url()!=='about:blank');if(!pages.length)throw Error('Open a store page first.');return pages[pages.length-1];}
 async checkOne(item){
  const ctx=await this.browser();let page;
  try{
   page=await ctx.newPage();this.activePages.add(page);await page.goto(safeUrl(item.url),{waitUntil:'domcontentloaded',timeout:20000});
   if(item.recipe?.add){const add=page.locator(item.recipe.add);await add.waitFor({state:'attached',timeout:5000}).catch(()=>{});return {id:item.id,status:await add.count()===1&&await add.isVisible()&&await add.isEnabled()?'possible':'out',detail:await page.title(),checkedAt:Date.now()};}
   await page.waitForTimeout(1000);
   const signal=await page.evaluate(()=>{
    const content=(document.body?.innerText||'').slice(0,80000).toLowerCase();
    const labels=Array.from(document.querySelectorAll('button,input[type=submit],[role=button]')).filter(el=>el.getClientRects().length).map(el=>({text:(el.innerText||el.value||el.getAttribute('aria-label')||'').trim().toLowerCase().slice(0,120),disabled:el.disabled||el.getAttribute('aria-disabled')==='true'}));
    return {available:labels.some(x=>/^(add to (bag|cart)|buy now|add to basket)(\b|$)/.test(x.text)&&!x.disabled),unavailable:/\b(currently unavailable|temporarily out of stock|sold out)\b/.test(content),title:document.title.slice(0,160)};
   });
   return {id:item.id,status:signal.available&&!signal.unavailable?'possible':signal.unavailable&&!signal.available?'out':'unknown',detail:signal.title,checkedAt:Date.now()};
  }catch(err){return {id:item.id,status:'error',detail:String(err.message).slice(0,150),checkedAt:Date.now()};}
  finally{if(page){this.activePages.delete(page);await page.close().catch(()=>{});}}
 }
 async tick(){
  if(!this.started||this.busy)return;this.busy=true;const generation=this.generation;
  const active=()=>this.started&&generation===this.generation;
  try{for(const item of this.products){
   if(!active())break;const res=await this.checkOne(item);if(!active())break;
   const prior=this.previous.get(item.id);this.previous.set(item.id,res.status);this.emit('status',res);
   if(res.status==='possible'&&prior!=='possible')this.emit('alert',{...res,name:item.name,url:item.url});
   if(res.status==='possible'&&item.autoBuy&&this.engine&&!this.engine.ledger.get(item)){
    const ctx=await this.browser(),page=await ctx.newPage();this.activePages.add(page);
    try{const result=await this.engine.run(page,item,this.limits,{isActive:active});this.emit('purchase',{id:item.id,...result});}
    catch(e){this.emit('purchase',{id:item.id,state:this.engine.ledger.get(item)?.state||'attention',detail:e.message});}
    finally{this.activePages.delete(page);await page.close().catch(()=>{});}
   }
  }}finally{this.busy=false;}
 }
 async start(products,minutes=3,limits={}){
  if(this.busy)throw Error('Wait for the previous check to stop.');
  this.stop();if(!Array.isArray(products)||!products.length)throw Error('Add a product first.');
  for(const p of products)safeUrl(p.url);
  if(this.visible)await this.shutdown();
  await this.browser();this.products=products.map(p=>({...p}));this.limits=limits;this.previous.clear();this.started=true;
  this.timer=setInterval(()=>this.tick().catch(e=>this.emit('error',e.message)),Math.max(1,Math.min(60,minutes))*60000);
  this.tick().catch(e=>this.emit('error',e.message));return true;
 }
 stop(){this.started=false;this.generation++;if(this.timer)clearInterval(this.timer);this.timer=null;for(const page of this.activePages)page.close().catch(()=>{});this.activePages.clear();}
 async shutdown(){this.stop();if(this.launching)await this.launching.catch(()=>{});const ctx=this.context;this.context=null;if(ctx)await ctx.close().catch(()=>{});}
}
module.exports={Monitor,safeUrl,findBrowser};
