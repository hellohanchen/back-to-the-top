export function dailyGroups(day, dimension) {
 if(day?.status!=='complete'||day.marketShare?.version!==1)return null;
 const total=day.marketShare.volume;
 return day.marketShare[dimension].map(g=>({...g,share:total>0?g.volume/total*100:0}));
}
export function shareSeries(days, visible, dimension, limit=8) {
 const totals=new Map(),names=new Map();
 for(const day of visible)for(const group of dailyGroups(day,dimension)||[]){
  totals.set(group.id,(totals.get(group.id)||0)+group.volume);names.set(group.id,group.name);
 }
 const top=[...totals].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,limit).map(([id])=>id);
 const other=[...totals.keys()].some(id=>!top.includes(id));
 return [...top,...(other?['__other']:[])].map(id=>({
  name:id==='__other'?'Other':names.get(id),type:'bar',stack:dimension,
  data:days.map(day=>{
   const groups=dailyGroups(day,dimension);
   if(!groups||day.marketShare.volume<=0)return {value:null,volume:null};
   const volume=groups.filter(g=>id==='__other'?!top.includes(g.id):g.id===id).reduce((sum,g)=>sum+g.volume,0);
   return {value:volume/day.marketShare.volume*100,volume};
  })
 }));
}
