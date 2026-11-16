const endpoint='https://back-to-the-top.pages.dev/api/challenge';
const status=document.querySelector('#status'),slots=document.querySelector('#slots'),button=document.querySelector('#refresh');
let lastData=null,busy=false,lastAttempt=0;
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
function freshness(){if(!lastData)return;const age=Date.now()-Date.parse(lastData.generatedAt);const expired=age>15*60*1000;status.classList.toggle('warning',expired);status.textContent=`Updated ${new Date(lastData.generatedAt).toLocaleString()} · ${expired?'Data is stale; collection may be delayed':'Checks for updates every 5 minutes'}`;}
function render(data){
 document.querySelector('#title').textContent=data.title;
 document.querySelector('#qualification').textContent=data.qualification;
 document.querySelector('#aggregation').textContent=data.aggregation;
 slots.replaceChildren();
 for(const s of data.slots){
  const card=el('section',null,'slot');card.append(el('h2',s.label));
  card.append(el('p',`${s.dates.join(' / ')} · ${s.finishedGames}/${s.games} games finished`,'meta'));
  if(s.officialPlayers.length)card.append(el('p','Top Shot reference result: '+s.officialPlayers.join(' / '),'confirmed'));
  else card.append(el('p','Official result not confirmed · provisional single-game ranking','meta'));
  if(!s.rankings.length)card.append(el('p','Waiting for games to start.','empty'));
  else {const table=el('table');table.setAttribute('aria-label',s.label+' statistical rankings');for(const r of s.rankings){const tr=el('tr',null,r.rank===1?'leading':'');const name=el('td',r.name+' ');name.append(el('small',r.team+(r.gameStatus===2?' · LIVE':'')));tr.append(el('td',r.rank),name,el('td',r.value));table.append(tr);}card.append(table);}
  slots.append(card);
 }
 lastData=data;freshness();
 const end=new Date(data.throughDate+'T23:59:59-05:00');
 if(Date.now()>end.getTime())document.querySelector('#aggregation').textContent+=' This is a previous week; new Wheel rules must be configured before new challenges appear.';
}
async function refresh(){if(busy)return;busy=true;lastAttempt=Date.now();button.disabled=true;try{const r=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('unavailable');const data=await r.json();if(!Array.isArray(data.slots)||!Number.isFinite(Date.parse(data.generatedAt)))throw Error('invalid');render(data);}catch{status.classList.add('warning');status.textContent=lastData?`Update failed · showing data from ${new Date(lastData.generatedAt).toLocaleString()}`:'Tracker data is not available yet. It will retry automatically.';}finally{busy=false;button.disabled=false;}}
button.addEventListener('click',refresh);setInterval(()=>{freshness();if(!document.hidden)refresh();},300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastAttempt>=300000)refresh();});refresh();
