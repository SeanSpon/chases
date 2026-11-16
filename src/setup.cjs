'use strict';
// Runs only when Chase explicitly presses a Pick button. Never records typing or card data.
async function pick(page,label){
 await page.bringToFront();
 return page.evaluate(label=>new Promise(resolve=>{
  if(window.__autocartCancel)window.__autocartCancel();
  const note=document.createElement('div');note.id='autocart-picker';
  note.textContent='AutoCart: click '+label+'. This click selects it WITHOUT activating it. Esc cancels.';
  Object.assign(note.style,{position:'fixed',top:'0',left:'0',right:'0',zIndex:'2147483647',background:'#12243d',color:'#fff',padding:'20px',font:'bold 17px system-ui',pointerEvents:'none'});
  document.documentElement.append(note);let previous;
  const cleanup=()=>{note.remove();if(previous)previous.style.outline='';document.removeEventListener('mouseover',hover,true);document.removeEventListener('click',choose,true);document.removeEventListener('keydown',key,true);delete window.__autocartCancel;};
  const cancel=()=>{cleanup();resolve(null);};window.__autocartCancel=cancel;
  const hover=e=>{if(previous)previous.style.outline='';previous=e.target;previous.style.outline='3px solid #00dca4';};
  const key=e=>{if(e.key==='Escape')cancel();};
  const selector=el=>{
   if(el.id)return '#'+CSS.escape(el.id);
   for(const attr of ['data-testid','data-test','name']){const v=el.getAttribute(attr);if(v){const s=el.tagName.toLowerCase()+'['+attr+'='+JSON.stringify(v)+']';if(document.querySelectorAll(s).length===1)return s;}}
   const parts=[];let n=el;
   while(n&&n.nodeType===1&&n!==document.documentElement){let s=n.tagName.toLowerCase();const siblings=n.parentElement?Array.from(n.parentElement.children).filter(x=>x.tagName===n.tagName):[];if(siblings.length>1)s+=':nth-of-type('+(siblings.indexOf(n)+1)+')';parts.unshift(s);n=n.parentElement;}
   return parts.join(' > ');
  };
  const choose=e=>{e.preventDefault();e.stopImmediatePropagation();let el=e.target;if(/button/i.test(label))el=el.closest('button,a,input[type=submit],[role=button]')||el;
   const result={selector:selector(el),text:(el.innerText||el.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim().slice(0,200)};
   cleanup();resolve(result);
  };
  document.addEventListener('mouseover',hover,true);document.addEventListener('click',choose,true);document.addEventListener('keydown',key,true);
 }),label);
}
module.exports={pick};
