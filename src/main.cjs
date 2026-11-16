'use strict';
const {app,BrowserWindow,ipcMain,Tray,Menu,nativeImage,Notification,shell,dialog}=require('electron');
const fs=require('fs'),path=require('path');
const {Monitor,safeUrl}=require('./monitor.cjs');
const {CheckoutEngine,Ledger,fingerprint}=require('./checkout.cjs');
const {validate,defaults}=require('./settings.cjs');
const {pick}=require('./setup.cjs');
let win,monitor,tray,quitting=false;
if(!app.requestSingleInstanceLock())app.quit();
app.on('second-instance',()=>{if(win){win.show();win.focus();}});
const settingsPath=()=>path.join(app.getPath('userData'),'settings.json');
function load(){try{return {...defaults,...JSON.parse(fs.readFileSync(settingsPath(),'utf8'))};}catch{return {...defaults};}}
function save(s){fs.writeFileSync(settingsPath()+'.tmp',JSON.stringify(s,null,2),{mode:0o600});fs.renameSync(settingsPath()+'.tmp',settingsPath());return s;}
function emit(kind,info){
 if(['alert','purchase'].includes(kind)&&Notification.isSupported()){const n=new Notification({title:kind==='purchase'?'AutoCart: '+info.state:'Possible restock',body:kind==='purchase'?(info.orderId?'Order '+info.orderId:info.detail||'Open AutoCart for details'):info.name+' may be available.'});n.on('click',()=>{win.show();win.focus();});n.show();}if(win&&!win.isDestroyed())win.webContents.send('watch-event',{kind,info});}
app.whenReady().then(()=>{
 let ledger;try{ledger=new Ledger(path.join(app.getPath('userData'),'purchase-history.json'));}catch(e){dialog.showErrorBox('AutoCart purchase history',e.message);app.quit();return;}
 const engine=new CheckoutEngine(ledger);monitor=new Monitor(app.getPath('userData'),emit,engine);
 ipcMain.handle('get-settings',()=>load());
 ipcMain.handle('save-settings',(_e,v)=>{if(monitor.started||engine.busy)throw Error('Stop watching before changing settings.');return save(validate(v,load()));});
 ipcMain.handle('start',async(_e,v)=>{const s=validate(v,load());save(s);await monitor.start(s.products,s.interval,s);return true;});
 ipcMain.handle('stop',()=>{monitor.stop();emit('stopped',{});return true;});
 ipcMain.handle('history',()=>ledger.data.entries);
 ipcMain.handle('clear-attention',(_e,id)=>{if(monitor.started||engine.busy)throw Error('Stop watching first.');const item=load().products.find(p=>p.id===id);if(!item)throw Error('Product not found.');ledger.clearAttention(item);return true;});
 ipcMain.handle('setup-open',async(_e,id)=>{if(engine.busy)throw Error('Wait for checkout to finish or stop it.');const item=load().products.find(p=>p.id===id);if(!item)throw Error('Save the product first.');emit('stopped',{});return monitor.openSetup(item.url);});
 const labels={unitPrice:'the product price INCLUDING the $ symbol',add:'the Add to cart button',step:'the NEXT checkout button (never the final payment button)',itemName:'the exact product name in the FINAL order summary',quantity:'the quantity for this product (must be 1)',cartCount:'the TOTAL number of items in the cart (must be 1)',total:'the FINAL total INCLUDING $ symbol, tax and shipping',pay:'the FINAL Place order / Pay now button'};
 ipcMain.handle('setup-pick',async(_e,key)=>{if(!labels[key]||monitor.started||engine.busy)throw Error('Stop watching and open store setup first.');return pick(monitor.setupPage(),labels[key]);});
 ipcMain.handle('test-checkout',async(_e,id)=>{
  if(monitor.started||engine.busy)throw Error('Stop watching before testing.');const s=load(),item=s.products.find(p=>p.id===id);if(!item)throw Error('Product not found.');
  const ctx=await monitor.browser(true);if(!monitor.visible)throw Error('Open store setup first.');const page=await ctx.newPage();
  const result=await engine.run(page,item,s,{dryRun:true});item.verified=fingerprint(item,s);save(s);await page.bringToFront();return result;
 });
 ipcMain.handle('practice',()=>{const demo=new BrowserWindow({width:1150,height:860,minWidth:800,minHeight:650,title:'AutoCart — Practice Mode',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});demo.loadFile(path.join(__dirname,'practice.html'));demo.webContents.setWindowOpenHandler(()=>({action:'deny'}));demo.webContents.on('will-navigate',e=>e.preventDefault());return true;});
 ipcMain.handle('open-product',async(_e,url)=>shell.openExternal(safeUrl(url)));
 win=new BrowserWindow({width:1100,height:790,minWidth:770,minHeight:600,backgroundColor:'#0e1422',title:'AutoCart by SeeZee',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const icon=nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAk0lEQVR4nGMU13b7zzCAgGkgLR91AAMDAwMLuRpfXNmJISah406yOWSFADbL8YnjA4yk5gJkS5B9jEucqg6AWYLPAmLUIIMBT4REO4BYn8HkiU0PAx4CeLOh14YUosSI0b8tYA7pDkAGSXdWE20xKWoHPApGHTDqgFEHjDpg1AGjDhhwB5DcKKU2GPAQGHXAgDsAAPd8Kdf/I8ctAAAAAElFTkSuQmCC');
 tray=new Tray(icon);tray.setToolTip('AutoCart — restock watcher');
 tray.setContextMenu(Menu.buildFromTemplate([
 {label:'Open AutoCart',click:()=>{win.show();win.focus();}},
 {label:'Stop watching',click:()=>{monitor.stop();emit('stopped',{});}},
 {type:'separator'},{label:'Quit AutoCart',click:()=>app.quit()}
 ]));
 tray.on('double-click',()=>{win.show();win.focus();});
 win.on('close',e=>{if(!quitting){e.preventDefault();win.hide();}});
 win.webContents.on('will-navigate',e=>e.preventDefault());
 win.loadFile(path.join(__dirname,'index.html'));
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
});
app.on('before-quit',e=>{if(quitting)return;e.preventDefault();quitting=true;Promise.resolve(monitor?.shutdown()).finally(()=>app.quit());});
app.on('window-all-closed',()=>app.quit());
