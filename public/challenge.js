import {visibleRows,marketUrl,gameLabel} from './challenge-view.js';
const endpoint='https://back-to-the-top.pages.dev/api/challenge';
const status=document.querySelector('#status'),slots=document.querySelector('#slots');
let lastData=null,busy=false,lastAttempt=0;
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
function freshness(){if(!lastData)return;const expired=Date.now()-Date.parse(lastData.generatedAt)>15*60*1000;status.classList.toggle('warning',expired);status.textContent=`Updated ${new Date(lastData.generatedAt).toLocaleString()}${expired?' · Delayed':''}`;}
function render(data){
 document.querySelector('#title').textContent=data.title;slots.replaceChildren();
 for(const s of data.slots){
  const card=el('section',null,'slot'),heading=el('div',null,'slot-heading');heading.append(el('h2',s.label));
  const finished=s.finishedGames===s.games,confirmed=finished&&s.officialPlayers.length>0;
  if(!finished)heading.append(el('span','Live','live-badge'));
  else if(!confirmed)heading.append(el('span','Awaiting confirmation','pending-badge'));
  card.append(heading,el('p',s.dates.join(' / '),'meta'));
  const rows=visibleRows(s);
  if(!rows.length)card.append(el('p','No results yet.','empty'));
  else{const table=el('table');table.setAttribute('aria-label',s.label+' results');
   for(const r of rows){const tr=el('tr',null,r.qualified?'qualified':'');const name=el('td'),link=el('a',r.name);link.href=marketUrl(r.name);link.target='_blank';link.rel='noopener noreferrer';name.append(link);
    const score=r.qualified?gameLabel(r):'';if(score)name.append(el('small',score,'game-score'));
    tr.append(name,el('td',r.value??''));table.append(tr);
   }card.append(table);
  }slots.append(card);
 }lastData=data;freshness();
}
async function refresh(){if(busy)return;busy=true;lastAttempt=Date.now();try{const r=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('unavailable');const data=await r.json();if(!Array.isArray(data.slots)||!Number.isFinite(Date.parse(data.generatedAt)))throw Error('invalid');render(data);}catch{status.classList.add('warning');status.textContent=lastData?`Update failed · ${new Date(lastData.generatedAt).toLocaleString()}`:'Data unavailable · retrying automatically';}finally{busy=false;}}
setInterval(()=>{freshness();if(!document.hidden)refresh();},300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastAttempt>=300000)refresh();});refresh();
