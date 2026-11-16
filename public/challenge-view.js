export function visibleRows(slot){
 const expected=slot.expectedQualifiers||1;
 const confirmed=slot.finishedGames===slot.games&&slot.officialPlayers.length>0;
 if(confirmed)return slot.officialPlayers.map(name=>({...slot.rankings.find(r=>r.name===name),name,qualified:true}));
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
