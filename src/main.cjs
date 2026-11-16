'use strict';
const {app,BrowserWindow,ipcMain,Tray,Menu,nativeImage,Notification,shell}=require('electron');
const fs=require('fs'),path=require('path');
const {Monitor,safeUrl}=require('./monitor.cjs');
let win,monitor,tray,quitting=false;
if(!app.requestSingleInstanceLock())app.quit();
app.on('second-instance',()=>{if(win){win.show();win.focus();}});
const defaults={products:[],maxUnitPrice:15,maxBudget:60,quantityLimit:2,interval:3};
const settingsPath=()=>path.join(app.getPath('userData'),'settings.json');
function load(){try{return {...defaults,...JSON.parse(fs.readFileSync(settingsPath(),'utf8'))};}catch{return {...defaults};}}
function validate(v){
 if(!v||!Array.isArray(v.products)||v.products.length>100)throw Error('Invalid product list.');
 const products=v.products.map(p=>({id:String(p.id).slice(0,60),name:String(p.name||'Product').slice(0,100),url:safeUrl(p.url)}));
 const num=(x,min,max)=>{let n=Number(x);if(!Number.isFinite(n)||n<min||n>max)throw Error('Please check your limits.');return n;};
 return {products,maxUnitPrice:num(v.maxUnitPrice,0,100000),maxBudget:num(v.maxBudget,0,100000),quantityLimit:num(v.quantityLimit,1,100),interval:num(v.interval,1,60)};
}
function emit(kind,info){
 if(kind==='alert'&&Notification.isSupported()){const n=new Notification({title:'Possible NeeDoh restock',body:info.name+' may be available. Open AutoCart to check.'});n.on('click',()=>{win.show();win.focus();});n.show();}if(win&&!win.isDestroyed())win.webContents.send('watch-event',{kind,info});}
app.whenReady().then(()=>{
 monitor=new Monitor(app.getPath('userData'),emit);
 ipcMain.handle('get-settings',()=>load());
 ipcMain.handle('save-settings',(_e,v)=>{const s=validate(v);fs.writeFileSync(settingsPath(),JSON.stringify(s,null,2),{mode:0o600});return s;});
 ipcMain.handle('start',async(_e,v)=>{const s=validate(v);await monitor.start(s.products,s.interval);return true;});
 ipcMain.handle('stop',()=>{monitor.stop();return true;});
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