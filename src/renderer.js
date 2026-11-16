'use strict';
let state={products:[],maxUnitPrice:15,maxBudget:60,quantityLimit:2,interval:3},running=false,setupId=null,draft={},pending=false;
const $=id=>document.getElementById(id),api=window.autocart;
const message=s=>{$('message').textContent=s;};
const controls=['maxUnitPrice','maxBudget','quantityLimit','interval'];
const labels={unitPrice:'Pick product price ($)',add:'Pick Add to cart button',itemName:'Pick cart product name',quantity:'Pick product quantity (1)',cartCount:'Pick cart TOTAL item count (1)',total:'Pick FINAL total ($)',pay:'Pick FINAL order button'};
function pull(){for(const k of controls)state[k]=Number($(k).value);}
function put(){for(const k of controls)$(k).value=state[k];}
function make(tag,cls,text){const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;}
function button(text,cls,fn){const b=make('button',cls,text);b.onclick=()=>Promise.resolve(fn()).catch(e=>message(e.message));return b;}
function setRunning(v){running=v;$('start').disabled=v;$('stop').disabled=!v;$('overall').textContent=v?'Running':'Stopped';$('overall').classList.toggle('on',v);for(const k of controls)$(k).disabled=v;$('save').disabled=v;$('add').disabled=v;render();}
function render(){
 $('mode-note').textContent=state.products.some(p=>p.autoBuy)?'Auto-buy is enabled for selected products.':'Watch mode spends $0.';
 const root=$('products');root.replaceChildren();$('count').textContent=state.products.length+' / 100 products';
 if(!state.products.length){root.append(make('div','empty','Add one or many links above.'));return;}
 for(const item of state.products){
  const row=make('div','product'),meta=make('div','meta');meta.append(make('strong','',item.name),make('small','',item.url));
  const status=make('div','status',item.autoBuy?'Auto-buy armed · one item, once':item.verified?'Checkout tested · auto-buy OFF':'Watch-only · spends $0');status.id='s-'+item.id;meta.append(status);
  const actions=make('div','actions');
  const toggle=make('label','toggle'),check=make('input');check.type='checkbox';check.checked=!!item.autoBuy;check.disabled=running||!item.verified;
  check.onchange=async()=>{const old=item.autoBuy;try{if(check.checked&&!confirm('Enable REAL automatic orders for '+item.name+'? This can charge the payment method saved with the store, within your limits. Empty the test cart first.')){check.checked=false;return;}item.autoBuy=check.checked;await save();render();}catch(e){item.autoBuy=old;check.checked=old;message(e.message);}};toggle.append(check,document.createTextNode('Auto-buy'));
  actions.append(toggle,button('Set up auto-buy','secondary',async()=>{if(running)throw Error('Stop watching first.');await save();setupId=item.id;draft=structuredClone(item.recipe||{steps:[],origins:[]});$('setup-name').textContent=item.name;$('origins').value=(draft.origins||[]).filter(s=>s!==new URL(item.url).origin).join(', ');renderPicks();$('setup-message').textContent='Open store setup, then follow A, B, C.';$('setup').showModal();}),button('Open store','muted',()=>api.openProduct(item.url)));
  const remove=button('Remove','danger',async()=>{const old=state.products;state.products=state.products.filter(p=>p.id!==item.id);try{await save();render();}catch(e){state.products=old;throw e;}});remove.disabled=running;actions.append(remove);row.append(meta,actions);root.append(row);
 }
}
async function save(){pull();state=await api.save(state);return state;}
$('directions').onclick=()=>$('help').showModal();$('close-help').onclick=()=>$('help').close();$('close-setup').onclick=()=>{if(pending){$('setup-message').textContent='Finish the selection or press Esc in the store first.';return;}$('setup').close();};$('setup').addEventListener('cancel',e=>{if(pending)e.preventDefault();});
$('practice').onclick=()=>api.practice().catch(e=>message(e.message));
$('add-form').addEventListener('submit',async e=>{
 e.preventDefault();const old=state.products;
 try{
  const seen=new Set(old.map(p=>p.url)),added=[];
  for(const line of $('links').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)){
   const split=line.indexOf('|'),raw=split<0?line:line.slice(split+1).trim();const u=new URL(raw);if(u.protocol!=='https:')throw Error('Use https:// store links.');u.hash='';
   const url=u.toString();if(seen.has(url))continue;seen.add(url);
   let name=split<0?'':line.slice(0,split).trim();if(!name){let slug=u.pathname.split('/').filter(Boolean).pop()||u.hostname;try{slug=decodeURIComponent(slug);}catch{}name=slug.replace(/[-_]/g,' ').slice(0,100);}
   added.push({id:crypto.randomUUID(),name,url,autoBuy:false});
  }
  if(!added.length)throw Error('No new links. Duplicates are skipped.');state.products=[...old,...added];await save();$('links').value='';render();message('Added '+added.length+' products. Watch-only is on until you configure auto-buy.');
 }catch(err){state.products=old;message('Could not add links: '+err.message);}
});
$('save').onclick=async()=>{try{for(const p of state.products)p.autoBuy=false;await save();render();message('Limits saved. Repeat checkout tests before re-enabling auto-buy.');}catch(e){message(e.message);}};
$('start').onclick=async()=>{try{await save();await api.start(state);setRunning(true);message('Running. Close the window to keep working in the tray.');}catch(e){message('Could not start: '+e.message);}};
$('stop').onclick=async()=>{await api.stop();setRunning(false);message('Stopped. Already-submitted orders may still be charged.');await history();};
function renderPicks(){
 for(const [id,keys] of [['product-picks',['unitPrice','add']],['checkout-picks',['itemName','quantity','cartCount','total','pay']]]){
  const root=$(id);root.replaceChildren();for(const key of keys){const wrap=make('div','pick');const b=button((draft[key]?'✓ ':'')+labels[key],'secondary',()=>doPick(key));wrap.append(b,make('small','',draft[key]||'Not selected'));root.append(wrap);}
 }
 $('steps').replaceChildren(...(draft.steps||[]).map(s=>make('li','',s)));
}
async function doPick(key){
 if(pending)throw Error('Finish the current selection in the store, or press Esc there.');pending=true;$('setup-message').textContent='Switch to the store browser and click the requested element. Esc cancels.';
 try{const result=await api.setupPick(key);if(!result){$('setup-message').textContent='Selection cancelled.';return;}if(key==='step'){draft.steps||=[];if(draft.steps.length>=8)throw Error('At most 8 checkout steps.');draft.steps.push(result.selector);}else{draft[key]=result.selector;if(key==='itemName')draft.expectedItem=result.text;}renderPicks();$('setup-message').textContent='Selected. For Add/Next buttons, click the store button again yourself to continue.';}
 catch(e){$('setup-message').textContent=e.message;}finally{pending=false;}
}
$('pick-step').onclick=()=>doPick('step').catch(e=>{$('setup-message').textContent=e.message;});$('clear-steps').onclick=()=>{draft.steps=[];renderPicks();};
$('setup-open').onclick=async()=>{try{await api.setupOpen(setupId);setRunning(false);$('setup-message').textContent='Sign into the store. Save shipping/payment there. Then use the Pick buttons.';}catch(e){$('setup-message').textContent=e.message;}};
async function saveRecipe(){
 const item=state.products.find(p=>p.id===setupId),old=structuredClone(item);draft.origins=$('origins').value.split(',').map(s=>s.trim()).filter(Boolean);item.recipe=structuredClone(draft);item.autoBuy=false;
 try{await save();render();}catch(e){Object.assign(item,old);throw e;}
}
$('save-recipe').onclick=async()=>{try{await saveRecipe();$('setup-message').textContent='Saved. Now run Test without buying.';}catch(e){$('setup-message').textContent=e.message;}};
$('test-checkout').onclick=async()=>{
 if(pending)return;$('test-checkout').disabled=true;
 try{await saveRecipe();$('setup-message').textContent='Testing checkout. The final order button will not be clicked.';const result=await api.testCheckout(setupId);state=await api.get();render();$('setup-message').textContent=result.message+' Then close this dialog and turn on Auto-buy for this product.';}
 catch(e){$('setup-message').textContent='Test failed: '+e.message;}finally{$('test-checkout').disabled=false;}
};
async function history(){
 const entries=await api.history(),root=$('history');root.replaceChildren();const values=Object.entries(entries);
 if(!values.length){root.append(make('p','','No orders submitted.'));return;}
 for(const [url,e] of values){const row=make('div','history-row');row.append(make('strong','',e.product+' · '+e.state),make('p','',e.orderId?'Order '+e.orderId+' · $'+(e.cents/100).toFixed(2):e.detail||'Check retailer order history before retrying.'));
  if(e.state==='attention'){const item=state.products.find(p=>p.url===url);if(item)row.append(button('I fixed the issue — allow another attempt','muted',async()=>{await api.clearAttention(item.id);await history();}));}root.append(row);
 }
}
$('refresh-history').onclick=()=>history().catch(e=>message(e.message));
api.onEvent(({kind,info})=>{
 if(kind==='stopped'){setRunning(false);return;}
 if(kind==='error'){message('Error: '+info);return;}
 if(kind==='status'){const s=$('s-'+info.id);if(s){s.className='status '+info.status;s.textContent=({possible:'Appears available',out:'Unavailable or configured button missing',unknown:'Availability unclear',error:info.detail||'Could not check'})[info.status]+' · '+new Date(info.checkedAt).toLocaleTimeString();}}
 if(kind==='alert')message('Possible restock: '+info.name+'. Auto-buy runs only if its switch is enabled.');
 if(kind==='purchase'){message(info.state==='purchased'?'Order confirmed: '+info.orderId:info.state+': '+info.detail);history().catch(e=>message(e.message));}
});
api.get().then(s=>{state=s;put();render();return history();}).catch(e=>message('Unable to load: '+e.message));
