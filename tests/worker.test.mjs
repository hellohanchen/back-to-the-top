import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['worker/index.js'],bundle:true,write:false,format:'esm',define:{__ASSETS__:'{}'}});
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const valid={schemaVersion:1,startDate:'2026-10-01',generatedAt:'2026-10-02T07:00:00Z',throughDate:'2026-10-01',days:[{date:'2026-10-01',status:'pending'}],totalDays:1,completedDays:0};
function store(){let data;return {async get(){return data?{json:async()=>JSON.parse(data),body:data}:null;},async put(k,v){data=v;}};}
const request=(data,key='secret')=>new Request('https://example.test/api/data',{method:'POST',headers:{Authorization:'Bearer '+key},body:JSON.stringify(data)});
test('write endpoint rejects unauthorized callers',async()=>{const env={DATA_WRITE_KEY:'secret',BUCKET:store()};assert.equal((await worker.fetch(request(valid,'bad'),env)).status,401);assert.equal((await worker.fetch(request(valid),{BUCKET:store()})).status,401);});
test('invalid dataset cannot overwrite storage',async()=>{assert.equal((await worker.fetch(request({...valid,completedDays:4}),{DATA_WRITE_KEY:'secret',BUCKET:store()})).status,400);});
test('successful update is readable and older writes fail',async()=>{const env={DATA_WRITE_KEY:'secret',BUCKET:store()};assert.equal((await worker.fetch(request(valid),env)).status,200);assert.deepEqual(await (await worker.fetch(new Request('https://example.test/data/daily.json'),env)).json(),valid);assert.equal((await worker.fetch(request({...valid,generatedAt:'2026-10-02T06:00:00Z'}),env)).status,409);});

test('malformed rows and date gaps are rejected',async()=>{const env={DATA_WRITE_KEY:'secret',BUCKET:store()};for(const data of [null,{...valid,days:[null]},{...valid,days:[{date:'2026-10-02',status:'pending'}],throughDate:'2026-10-02'}])assert.equal((await worker.fetch(request(data),env)).status,400);});

test('expanded channel statistics reject nonfinite and inconsistent prices',async()=>{
 const source={sales:1,volume:5,median:5,average:5,highest:5};
 const row={volume:15,sales:3,average:5,median:5,highest:5,active:1,buyers:1,sellers:1,sources:{listing:{...source},offer:{...source},legacy:{...source}}};
 const day={date:'2026-10-01',status:'complete',activityScope:'monitored-topshot-events-v2',active:1,buyers:1,sellers:1,locked:0,unlocked:0,moments:structuredClone(row),packs:structuredClone(row)};
 const data={...valid,days:[day],completedDays:1};
 const env={DATA_WRITE_KEY:'secret',BUCKET:store()};
 assert.equal((await worker.fetch(request(data),env)).status,200);
 day.moments.sources.offer.median=null;
 assert.equal((await worker.fetch(request(data),env)).status,400);
 day.moments.sources.offer.median=9;
 assert.equal((await worker.fetch(request(data),env)).status,400);
});
