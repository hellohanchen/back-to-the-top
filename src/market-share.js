export function dailyGroups(day, dimension) {
 if(day?.status!=='complete'||day.marketShare?.version!==1)return null;
 const total=day.marketShare.volume;
 return day.marketShare[dimension].map(g=>({...g,share:total>0?g.volume/total*100:0}));
}
export function shareSeries(days, visible, dimension, limit=5) {
 const ranked=days.map(day=>dailyGroups(day,dimension)?.sort((a,b)=>b.volume-a.volume||a.id.localeCompare(b.id)));
 return Array.from({length:limit+1},(_,rank)=>({
  name:rank===limit?'Others':`#${rank+1}`,type:'bar',stack:dimension,
  data:days.map((day,index)=>{
   const groups=ranked[index];
   if(!groups||day.marketShare.volume<=0)return {value:null,volume:null};
   const group=groups[rank],other=rank===limit;
   const volume=other?groups.slice(limit).reduce((sum,g)=>sum+g.volume,0):group?.volume||0;
   return {value:volume/day.marketShare.volume*100,volume,groupName:other?'Others':group?.name||''};
  })
 }));
}
