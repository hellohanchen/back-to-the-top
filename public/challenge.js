import {visibleRows,marketUrl,gameLabel,refreshState,confirmationState,slotView,compactGameLabel} from './challenge-view.js';
const endpoint='https://back-to-the-top.pages.dev/api/challenge';
const status=document.querySelector('#status'),slots=document.querySelector('#slots');
const selectedViews=new Map();
let lastData=null,busy=false,lastAttempt=0;
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
function freshness(){if(!lastData)return;const {stale,label}=refreshState(lastData);status.classList.toggle('warning',stale);status.textContent=`Updated ${new Date(lastData.generatedAt).toLocaleString()}${stale?' · '+label:''}`;}
function render(data){
 document.querySelector('#title').textContent=data.title;slots.replaceChildren();
 for(const s of data.slots){
  const card=el('section',null,'slot'),heading=el('div',null,'slot-heading');heading.append(el('h2',s.label));
  const finished=s.games>0&&s.finishedGames===s.games,confirmed=confirmationState(s);
  if(!finished)heading.append(el('span',s.liveGames>0?'Live':s.rankings.length?'In progress':'Upcoming',s.liveGames>0?'live-badge':'pending-badge'));
  else heading.append(el('span',confirmed==='official'?'Confirmed':confirmed==='automatic'?'Auto-confirmed':'Final · 24h review','pending-badge'));
  card.append(heading);
  const requirement=s.qualification||data.qualification;
  if(requirement)card.append(el('p',requirement.split('. ')[0]+'.','requirement'));
  const panel=el('div'),view=slotView(s,selectedViews.get(s.id));
  const started=s.liveGames>0||s.finishedGames>0||s.rankings.length>0;
  if(started){
   const tabs=el('div',null,'slot-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label',s.label+' view');
   for(const [key,label] of [['leaderboard','Leaderboard'],['games','Games']]){
    const button=el('button',label);button.type='button';button.setAttribute('aria-pressed',String(view===key));
    button.addEventListener('click',()=>{selectedViews.set(s.id,key);render(lastData);slots.querySelector(`[data-slot="${s.id}"] button[data-view="${key}"]`)?.focus();});
    button.dataset.view=key;tabs.append(button);
   }card.append(tabs);
  }
  card.dataset.slot=s.id;
  if(view==='games')renderGames(panel,s);
  else renderLeaderboard(panel,s);
  card.append(panel);slots.append(card);
 }lastData=data;freshness();
}
function renderGames(panel,slot){
 const games=slot.gameDetails||[];
 if(!games.length){panel.append(el('p','Schedule unavailable','empty'));return;}
 const list=el('div',null,'games-list');
 for(const g of games){
  const row=el('div',null,'game-row');
  row.textContent=compactGameLabel(g);
  list.append(row);
 }panel.append(list);
}
function renderLeaderboard(card,s){
  const rows=visibleRows(s);
  if(!rows.length)card.append(el('p','No results yet.','empty'));
  else{const table=el('table');table.setAttribute('aria-label',s.label+' results');
   for(const r of rows){const tr=el('tr',null,r.qualified?'qualified':'');const name=el('td'),link=el('a',r.name);link.href=marketUrl(r.name);link.target='_blank';link.rel='noopener noreferrer';name.append(link);
    const score=r.qualified?gameLabel(r):'';if(score)name.append(el('small',score,'game-score'));
    tr.append(name,el('td',r.value??''));table.append(tr);
   }card.append(table);
  }
}
async function refresh(){if(busy)return;busy=true;lastAttempt=Date.now();try{const r=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('unavailable');const data=await r.json();if(!Array.isArray(data.slots)||!Number.isFinite(Date.parse(data.generatedAt)))throw Error('invalid');render(data);}catch{status.classList.add('warning');status.textContent=lastData?`Update failed · ${new Date(lastData.generatedAt).toLocaleString()}`:'Data unavailable · retrying automatically';}finally{busy=false;}}
setInterval(()=>{freshness();if(!document.hidden)refresh();},300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastAttempt>=300000)refresh();});refresh();
