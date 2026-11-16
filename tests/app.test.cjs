'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('desktop close-to-tray, reopen, stop, IPC registration and shutdown',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'autocart-desktop-')),handlers={},ipc={},windows=[];let tray,stopped=0,shutdown=0;
 class Window{constructor(){this.handlers={};this.visible=true;this.webContents={send(){},setWindowOpenHandler(){},on(){}};windows.push(this);}on(k,f){this.handlers[k]=f;}loadFile(){}hide(){this.visible=false;}show(){this.visible=true;}focus(){}isDestroyed(){return false;}}
 const electron={app:{requestSingleInstanceLock:()=>true,on:(k,f)=>handlers[k]=f,whenReady:()=>Promise.resolve(),getPath:()=>dir,quit(){}},BrowserWindow:Window,ipcMain:{handle:(k,f)=>ipc[k]=f},Tray:class{constructor(){tray=this;}setToolTip(){}setContextMenu(m){this.menu=m;}on(){}},Menu:{buildFromTemplate:x=>x},nativeImage:{createFromDataURL:x=>x},Notification:{isSupported:()=>false},shell:{openExternal:async()=>{}},dialog:{showErrorBox(){}}};
 const original=Module._load;
 Module._load=function(name,...args){if(name==='electron')return electron;if(name==='./monitor.cjs')return{safeUrl:x=>x,Monitor:class{stop(){stopped++;}async shutdown(){shutdown++;} }};return original.call(this,name,...args);};
 try{require('../src/main.cjs');await new Promise(r=>setImmediate(r));
  let prevented=false;windows[0].handlers.close({preventDefault(){prevented=true;}});assert(prevented);assert.equal(windows[0].visible,false);tray.menu[0].click();assert.equal(windows[0].visible,true);tray.menu[1].click();assert.equal(stopped,1);
  for(const key of ['setup-open','setup-pick','test-checkout','history','clear-attention'])assert.equal(typeof ipc[key],'function');
  handlers['before-quit']({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(shutdown,1);
 }finally{Module._load=original;fs.rmSync(dir,{recursive:true,force:true});}
});
