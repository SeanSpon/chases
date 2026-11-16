'use strict';
const {_electron}=require('playwright-core');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
(async()=>{
 const executablePath=path.resolve('dist/win-unpacked/AutoCart by SeeZee.exe');assert(fs.existsSync(executablePath),'Packaged executable is missing.');
 const app=await _electron.launch({executablePath,timeout:30000});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>!!window.autocart);
  await page.getByRole('button',{name:'How to use this',exact:true}).click();assert(await page.locator('#help').isVisible());await page.locator('#close-help').click();
  await page.locator('#links').fill('NeeDoh Cube | https://shop.example.com/cube\nNeeDoh Drop | https://shop.example.com/drop');await page.locator('#add').click();await page.getByText('2 / 100 products',{exact:true}).waitFor();assert.equal(await page.locator('.toggle input:checked').count(),0);
  const settings=await page.evaluate(()=>window.autocart.get());assert.equal(settings.products.length,2);assert(settings.products.every(p=>p.autoBuy===false));
  fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/AutoCart-0.2.0.png',fullPage:true});
  await page.getByRole('button',{name:'Set up auto-buy',exact:true}).first().click();assert(await page.locator('#setup').isVisible());await page.locator('#close-setup').click();assert.deepEqual(errors,[]);
  console.log('PASS: packaged Windows executable launched; real preload/settings IPC, directions, bulk links, watch-only defaults and checkout setup work.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
