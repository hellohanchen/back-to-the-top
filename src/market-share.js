export function dailyGroups(day, dimension) {
 if(day?.status!=='complete'||day.marketShare?.version!==1)return null;
 const total=day.marketShare.volume;
 return day.marketShare[dimension].map(g=>({...g,share:total>0?g.volume/total*100:0}));
}
export function shareSeries(days, visible, dimension, limit=5) {
 const leaders=new Map(rangeGroups(visible,dimension).slice(0,limit).map(g=>[g.id,g]));
 const ids=[...leaders.keys()];
 const ranked=days.map(day=>dailyGroups(day,dimension));
 return [...ids,'__others'].map(id=>({
  name:id==='__others'?'Others':leaders.get(id).name,type:'line',stack:dimension,
  areaStyle:{opacity:.75},itemStyle:id==='__others'?{color:'#64748b'}:undefined,smooth:false,
  data:days.map((day,index)=>{
   const groups=ranked[index];
   if(!groups||day.marketShare.volume<=0)return {value:null,volume:null};
   const group=groups.find(g=>g.id===id);
   const volume=id==='__others'?groups.filter(g=>!leaders.has(g.id)).reduce((sum,g)=>sum+g.volume,0):group?.volume||0;
   return {value:volume/day.marketShare.volume*100,volume};
  })
 }));
}

export function rangeGroups(days,dimension){
 const groups=new Map();let total=0;
 for(const day of days){
  const rows=dailyGroups(day,dimension);if(!rows)continue;
  total+=day.marketShare.volume;
  for(const row of rows){const g=groups.get(row.id)||{id:row.id,name:row.name,volume:0};g.volume+=row.volume;groups.set(row.id,g);}
 }
 return [...groups.values()].sort((a,b)=>b.volume-a.volume||a.id.localeCompare(b.id)).map(g=>({...g,share:total?g.volume/total*100:0}));
}

export function shortSetName(name){
 const names={'Rookie Debut':'RD','Season Tip-Off':'STO','Run It Back: Origins':'RIBO','Fresh Threads':'FT','Base Set':'Base'};
 return name.split(' · ').map(part=>names[part]||part.replace(/^Series (?:20)?(\d{2})-\d{2}$/, 'S$1').replace(/^Series (\d+)$/, 'S$1')).join(' · ');
}
