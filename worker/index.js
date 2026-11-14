const assets = __ASSETS__;
const headers = {'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
export function validateData(data) {
  if(!data||typeof data!=='object')return false;
  if(data.schemaVersion!==1||data.startDate!=='2026-10-01'||!Array.isArray(data.days)||data.days.length>10000) return false;
  let previous='';let complete=0;let expected=new Date('2026-10-01T12:00:00Z');
  for(const day of data.days){
    if(!day||typeof day!=='object')return false;
    if(day.date!==expected.toISOString().slice(0,10))return false;
    expected.setUTCDate(expected.getUTCDate()+1);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day.date)||day.date<=previous||!['pending','complete'].includes(day.status))return false;
    previous=day.date;
    if(day.status==='complete'){
      complete++;
      for(const key of ['active','buyers','sellers','locked','unlocked'])if(!Number.isFinite(day[key])||day[key]<0)return false;
      for(const asset of ['moments','packs']){
        const row=day[asset];if(!row)return false;
        for(const key of ['volume','sales','average','median','highest','active','buyers','sellers'])if(!Number.isFinite(row[key])||row[key]<0)return false;
        if(!row.sources)return false;
        for(const key of ['listing','offer','legacy'])if(!Number.isFinite(row.sources[key]?.volume)||row.sources[key].volume<0||!Number.isInteger(row.sources[key]?.sales)||row.sources[key].sales<0)return false;
        if(day.activityScope==='monitored-topshot-events-v2')for(const source of Object.values(row.sources)){
          for(const key of ['median','average','highest'])if(!Number.isFinite(source[key])||source[key]<0)return false;
          if(source.highest<source.median||source.highest<source.average)return false;
        }
        const sourceSales=Object.values(row.sources).reduce((s,r)=>s+r.sales,0);
        const sourceVolume=Object.values(row.sources).reduce((s,r)=>s+r.volume,0);
        if(sourceSales!==row.sales||Math.abs(sourceVolume-row.volume)>.02)return false;
      }
    }
  }
  return complete===data.completedDays&&data.days.length===data.totalDays&&previous===data.throughDate&&!Number.isNaN(Date.parse(data.generatedAt));
}
async function secretMatches(provided, expected) {
  if(!expected||!provided)return false;
  const encoder=new TextEncoder();
  const [a,b]=await Promise.all([provided,expected].map(s=>crypto.subtle.digest('SHA-256',encoder.encode(s))));
  const x=new Uint8Array(a),y=new Uint8Array(b);let diff=0;
  for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
  return diff===0;
}
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/api/data'){
    if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{Allow:'POST',...headers}});
    if(!await secretMatches(request.headers.get('Authorization'),`Bearer ${env.DATA_WRITE_KEY||''}`)||!env.DATA_WRITE_KEY)return new Response('Unauthorized',{status:401,headers});
    if(!env.BUCKET)return new Response('Storage unavailable',{status:503,headers});
    if(Number(request.headers.get('Content-Length')||0)>2_000_000)return new Response('Too large',{status:413,headers});
    const body=await request.text();if(body.length>2_000_000)return new Response('Too large',{status:413,headers});
    let data;try{data=JSON.parse(body);}catch{return new Response('Invalid JSON',{status:400,headers});}
    if(!validateData(data))return new Response('Invalid dataset',{status:400,headers});
    const existing=await env.BUCKET.get('daily.json');
    if(existing){
      const old=await existing.json();
      if(Date.parse(old.generatedAt)>Date.parse(data.generatedAt)||old.throughDate>data.throughDate)return new Response('Stale dataset',{status:409,headers});
      const incoming=new Set(data.days.filter(d=>d.status==='complete').map(d=>d.date));
      if(old.days.some(d=>d.status==='complete'&&!incoming.has(d.date)))return new Response('Cannot remove completed dates',{status:409,headers});
    }
    await env.BUCKET.put('daily.json',body,{httpMetadata:{contentType:'application/json'}});
    return Response.json({ok:true,completedDays:data.completedDays,throughDate:data.throughDate},{headers});
  }
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers});
  if(path==='/data/daily.json'&&env.BUCKET){
    const stored=await env.BUCKET.get('daily.json');
    if(stored)return new Response(request.method==='HEAD'?null:stored.body,{headers:{...headers,'Content-Type':'application/json','Cache-Control':'public,max-age=60'}});
  }
  const file=assets[path==='/'?'/index.html':path];
  if(!file)return new Response('Not found',{status:404,headers});
  return new Response(request.method==='HEAD'?null:file.body,{headers:{...headers,'Content-Type':file.type,'Cache-Control':(path==='/'||path==='/index.html'||path.includes('/data/'))?'no-cache':'public,max-age=300'}});
 }
};
