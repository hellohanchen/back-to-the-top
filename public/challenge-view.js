export function confirmationState(slot,now=Date.now()){
 if(!slot.games||slot.finishedGames!==slot.games)return '';
 if(slot.officialPlayers?.length)return 'official';
 const completed=Date.parse(slot.completedAt);
 return Number.isFinite(completed)&&now>=completed+86400000?'automatic':'';
}
export function visibleRows(slot,now=Date.now()){

 const expected=slot.expectedQualifiers||1;
 const confirmed=confirmationState(slot,now);
 if(confirmed==='official')return slot.officialPlayers.map(name=>({...slot.rankings.find(r=>r.name===name),name,qualified:true}));
 if(confirmed==='automatic')return slot.rankings.filter(r=>r.rank<=expected).map(r=>({...r,qualified:true}));
 const qualifiers=slot.rankings.filter(r=>r.rank<=expected).length;
 return slot.rankings.slice(0,Math.max(expected*3,5,qualifiers,slot.officialPlayers.length)).map(r=>({...r,qualified:r.rank<=expected}));
}
export function marketUrl(name){return 'https://nbatopshot.com/search?'+new URLSearchParams({players:name});}
export function gameLabel(row){
 const g=row.game;if(row.gameStatus!==2||!g||g.homeScore==null||g.awayScore==null)return '';
 const match=/^PT(?:(\d+)M)?([\d.]+)S$/.exec(g.clock||'');
 const clock=match?`${Number(match[1]||0)}:${String(Math.floor(Number(match[2]))).padStart(2,'0')}`:'';
 const period=g.period>4?`OT${g.period-4}`:g.period?`Q${g.period}`:'';
 return `${g.home} ${g.homeScore} - ${g.awayScore} ${g.away} ${period} ${clock||g.statusText||''}`.trim();
}

export function refreshState(data,now=Date.now()){
 const known=data.slots?.length>0&&data.slots.every(s=>Number.isInteger(s.liveGames));
 const live=data.slots?.some(s=>s.liveGames>0);
 const next=Date.parse(data.nextGameAt);
 const due=Number.isFinite(next)&&now>=next-10*60*1000;
 const complete=data.slots?.every(s=>s.finishedGames===s.games);
 const idle=known&&!live&&!due&&(Number.isFinite(next)||complete);
 const stale=!idle&&now-Date.parse(data.generatedAt)>15*60*1000;
 return {stale,label:stale?'Delayed':idle?(complete?'Games complete':'Waiting for next game'):''};
}

export function slotView(slot,preferred){
 const started=slot.liveGames>0||slot.finishedGames>0||slot.rankings.length>0;
 return started?(preferred||'leaderboard'):'games';
}
export function gameStatusLabel(game){
 if(game.status===3)return 'Final';
 if(game.status!==2)return game.statusText||'Scheduled';
 const match=/^PT(?:(\d+)M)?([\d.]+)S$/.exec(game.clock||'');
 const clock=match?`${Number(match[1]||0)}:${String(Math.floor(Number(match[2]))).padStart(2,'0')}`:'';
 const period=game.period>4?`OT${game.period-4}`:game.period?`Q${game.period}`:'';
 return [period,clock].filter(Boolean).join(' · ')||game.statusText||'Live';
}

export function compactGameLabel(game){
 if(game.status===2||game.status===3)return `${game.home} ${game.homeScore??'—'} - ${game.awayScore??'—'} ${game.away} ${gameStatusLabel(game).replace(' · ',' ')}`;
 const start=Date.parse(game.startAt);
 let time=game.date||'Time TBD';
 if(Number.isFinite(start)){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Etc/GMT+5',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).formatToParts(start).map(p=>[p.type,p.value]));
  time=`${parts.month}/${parts.day} ${parts.hour}:${parts.minute} EST`;
 }
 const exception=/postponed|cancelled|canceled|suspended|delayed/i.test(game.statusText||'')?` · ${game.statusText}`:'';
 return `${game.home} - ${game.away}, ${time}${exception}`;
}
