export function dailyGroups(day, dimension) {
 if(day?.status!=='complete'||day.marketShare?.version!==1)return null;
 const total=day.marketShare.volume;
 return day.marketShare[dimension].map(g=>({...g,share:total>0?g.volume/total*100:0}));
}
export function shareSeries(days, visible, dimension, limit=5) {
 const rank=day=>dailyGroups(day,dimension)?.sort((a,b)=>b.volume-a.volume||a.id.localeCompare(b.id));
 const leaders=new Map();
 for(const day of visible)for(const group of (rank(day)||[]).slice(0,limit)){
  const entry=leaders.get(group.id)||{name:group.name,volume:0};entry.volume+=group.volume;leaders.set(group.id,entry);
 }
 const ids=[...leaders].sort((a,b)=>b[1].volume-a[1].volume||a[0].localeCompare(b[0])).map(([id])=>id);
 const ranked=days.map(rank);
 return [...ids,'__others'].map(id=>({
  name:id==='__others'?'Others':leaders.get(id).name,type:'line',stack:dimension,
  areaStyle:{opacity:.75},itemStyle:id==='__others'?{color:'#64748b'}:undefined,smooth:false,
  data:days.map((day,index)=>{
   const groups=ranked[index];
   if(!groups||day.marketShare.volume<=0)return {value:null,volume:null};
   const top=groups.slice(0,limit),group=top.find(g=>g.id===id);
   const volume=id==='__others'?groups.filter(g=>!top.some(t=>t.id===g.id)||!leaders.has(g.id)).reduce((sum,g)=>sum+g.volume,0):group?.volume||0;
   return {value:volume/day.marketShare.volume*100,volume};
  })
 }));
}
