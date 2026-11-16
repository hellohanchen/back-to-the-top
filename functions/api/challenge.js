export async function onRequestGet({env}) {
  const headers={'Access-Control-Allow-Origin':'*','Cache-Control':'public,max-age=30','Content-Type':'application/json'};
  if(!env.TRACKER)return Response.json({error:'Tracker storage is not configured'},{status:503,headers});
  const data=await env.TRACKER.get('latest','json');
  if(!data)return Response.json({error:'Waiting for the first successful collection'},{status:503,headers});
  return Response.json({...data,stale:Date.now()-Date.parse(data.generatedAt)>15*60*1000},{headers});
}
