'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const FINAL=/\b(place (?:my |your )?order|pay|complete (?:purchase|order)|submit order|buy|confirm (?:purchase|order)|purchase)\b/i;
function money(text){
 const s=String(text).trim();
 if(/(?:€|£|¥|CAD|AUD|EUR|GBP|C\$|A\$)/i.test(s))throw Error('Only USD checkout is supported.');
 const matches=[...s.matchAll(/(?:US\s*\$|USD\s*|\$)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{2})?)(?![\d.])/gi)];
 if(matches.length!==1)throw Error('Select a single USD price including its $ symbol.');
 const cents=Math.round(Number(matches[0][1].replaceAll(',',''))*100);
 if(!Number.isSafeInteger(cents)||cents<=0)throw Error('Invalid price.');
 return cents;
}
function fingerprint(item,limits){return crypto.createHash('sha256').update(JSON.stringify([item.url,item.recipe,limits.maxUnitPrice,limits.maxBudget,limits.quantityLimit])).digest('hex');}
function validateRecipe(recipe,url){
 if(!recipe||typeof recipe!=='object')throw Error('Set up checkout first.');
 const origin=new URL(url).origin;
 const result={};
 for(const key of ['unitPrice','add','itemName','quantity','cartCount','total','pay']){
  if(typeof recipe[key]!=='string'||!recipe[key].trim()||recipe[key].length>1000)throw Error('Missing checkout field: '+key);
  result[key]=recipe[key].trim();
 }
 result.expectedItem=String(recipe.expectedItem||'').trim().slice(0,200);
 if(result.expectedItem.length<3)throw Error('Pick the cart product name to identify the item.');
 result.steps=Array.isArray(recipe.steps)?recipe.steps.map(s=>String(s).trim()):[];
 if(result.steps.length>8||result.steps.some(s=>!s||s.length>1000))throw Error('Use at most 8 checkout steps.');
 result.origins=[origin,...(Array.isArray(recipe.origins)?recipe.origins:[])].map(s=>{
  const u=new URL(s);if(u.protocol!=='https:'||u.username||u.password)throw Error('Checkout origins must use HTTPS.');return u.origin;
 }).filter((s,i,a)=>a.indexOf(s)===i);
 if(result.origins.length>6)throw Error('Too many checkout domains.');
 return result;
}
class Ledger{
 constructor(file){this.file=file;this.data={entries:{}};if(fs.existsSync(file)){this.data=JSON.parse(fs.readFileSync(file,'utf8'));if(!this.data.entries||typeof this.data.entries!=='object')throw Error('Purchase history is invalid. Restore it before enabling auto-buy.');}}
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=this.file+'.tmp';fs.writeFileSync(temp,JSON.stringify(this.data,null,2),{mode:0o600});fs.renameSync(temp,this.file);}
 key(item){const u=new URL(item.url);u.hash='';return u.toString();}
 get(item){return this.data.entries[this.key(item)];}
 put(item,entry){this.data.entries[this.key(item)]={...entry,product:item.name,updatedAt:Date.now()};this.save();}
 totals(){return Object.values(this.data.entries).filter(x=>['submitting','purchased','uncertain'].includes(x.state)).reduce((a,x)=>({cents:a.cents+x.cents,quantity:a.quantity+1}),{cents:0,quantity:0});}
 clearAttention(item){const e=this.get(item);if(e&&['submitting','purchased','uncertain'].includes(e.state))throw Error('This order may already have charged. Check the retailer; automatic retry is locked.');delete this.data.entries[this.key(item)];this.save();}
}
class CheckoutEngine{
 constructor(ledger){this.ledger=ledger;this.busy=false;}
 async run(page,item,limits,{dryRun=false,isActive=()=>true,onSubmitting=()=>{},receiptTimeout=15000}={}){
  if(this.busy)throw Error('Another checkout is running.');
  const recipe=validateRecipe(item.recipe,item.url);
  if(!dryRun&&this.ledger.get(item))throw Error('This product is locked in purchase history.');
  this.busy=true;let submitted=false,reservation=0;
  const guard=async()=>{
   if(!isActive())throw Error('Stopped.');
   if(!recipe.origins.includes(new URL(page.url()).origin))throw Error('Unexpected checkout domain. Add the correct domain in setup.');
   const body=await page.locator('body').innerText({timeout:5000});
   if(/verify (?:that )?you(?: are|'re) human|access denied|unusual traffic|robot check|complete the captcha|security verification/i.test(body))throw Error('Store verification needs you. Open setup and complete it yourself.');
   const challenge=page.locator('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],iframe[src*="challenges.cloudflare.com"]');
   for(let i=0;i<await challenge.count();i++)if(await challenge.nth(i).isVisible())throw Error('CAPTCHA needs you. Open the store yourself.');
  };
  const one=async selector=>{const l=page.locator(selector);await l.waitFor({state:'visible',timeout:10000});if(await l.count()!==1)throw Error('Checkout field is ambiguous. Repeat setup.');return l;};
  const text=async selector=>{const l=await one(selector);return l.evaluate(el=>['INPUT','SELECT'].includes(el.tagName)?el.value:el.innerText);};
  const click=async(selector,final=false,add=false)=>{
   await guard();const l=await one(selector);
   const label=await l.evaluate(el=>[el.innerText,el.value,el.getAttribute('aria-label'),el.getAttribute('name')].filter(Boolean).join(' '));
   if(!final&&FINAL.test(label))throw Error('A payment button was recorded as an earlier step. Pick it only as the final order button.');
   if(add&&!/^add to (?:cart|bag|basket)\b/i.test(label.trim()))throw Error('The Add to cart selection is not a supported add button.');
   if(!final&&!add&&!/\b(checkout|check out|continue|proceed|next|review|shipping|delivery|payment)\b/i.test(label))throw Error('Unrecognized checkout navigation button. Leave this store in watch-only mode.');
   await l.click({timeout:10000});
   await page.waitForLoadState('domcontentloaded').catch(()=>{});
  };
  const route=async route=>{
   const req=route.request();
   if(req.isNavigationRequest()&&req.frame()===page.mainFrame()&&!recipe.origins.includes(new URL(req.url()).origin))return route.abort();
   return route.fallback();
  };
  await page.route('**/*',route);
  try{
   await page.goto(item.url,{waitUntil:'domcontentloaded',timeout:30000});await guard();
   const unit=money(await text(recipe.unitPrice));
   if(unit>Math.round(limits.maxUnitPrice*100))throw Error('Item exceeds the maximum item price.');
   await click(recipe.add,false,true);
   for(const step of recipe.steps)await click(step);
   await guard();
   const name=(await text(recipe.itemName)).replace(/\s+/g,' ').trim();
   if(name!==recipe.expectedItem.replace(/\s+/g,' ').trim())throw Error('Cart product does not match the configured item.');
   for(const key of ['quantity','cartCount']){
    const value=(await text(recipe[key])).trim();
    const nums=value.match(/\d+/g);
    if(!nums||nums.length!==1||Number(nums[0])!==1)throw Error('Cart must contain exactly one item and quantity one. Empty extra items and repeat the test.');
   }
   const total=money(await text(recipe.total));
   if(total<unit)throw Error('Checkout total is lower than the item price. Select the final total including tax and shipping.');
   const used=this.ledger.totals();
   if(total+used.cents>Math.round(limits.maxBudget*100))throw Error('Total budget exceeded, including tax and shipping.');
   if(used.quantity+1>limits.quantityLimit)throw Error('Total item limit reached.');
   await one(recipe.pay);await guard();
   if(dryRun)return {state:'tested',unit,total,message:'Test passed; final order button was NOT clicked. Empty the test cart before starting.'};
   if(item.verified!==fingerprint(item,limits))throw Error('Test this recipe with the current limits before enabling auto-buy.');
   // Journal the charge reservation before clicking. Crashes and uncertain results stay locked.
   this.ledger.put(item,{state:'submitting',cents:total});reservation=total;submitted=true;onSubmitting();
   await click(recipe.pay,true);
   const end=Date.now()+receiptTimeout;
   while(Date.now()<end){
    await guard();const body=await page.locator('body').innerText();
    const order=body.match(/order\s*(?:number|confirmation(?:\s*number)?|#|no\.?|id)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{3,})/i);
    if(/thank you for (?:your )?(?:order|purchase)|order (?:is )?confirmed|order has been placed/i.test(body)&&order&&/\d/.test(order[1])){
     this.ledger.put(item,{state:'purchased',cents:total,orderId:order[1]});return {state:'purchased',total,orderId:order[1]};
    }
    await page.waitForTimeout(250);
   }
   throw Error('No confirmed receipt. Check the retailer before doing anything else.');
  }catch(error){
   if(!dryRun)this.ledger.put(item,{state:submitted?'uncertain':'attention',cents:submitted?reservation:0,detail:String(error.message).slice(0,250)});
   throw error;
  }finally{this.busy=false;await page.unroute('**/*',route).catch(()=>{});}
 }
}
module.exports={money,fingerprint,validateRecipe,Ledger,CheckoutEngine};
