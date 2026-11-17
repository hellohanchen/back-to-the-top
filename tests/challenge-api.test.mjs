import test from 'node:test';import assert from 'node:assert/strict';
import {onRequestGet} from '../functions/api/challenge.js';
test('no binding returns explicit unavailable',async()=>{assert.equal((await onRequestGet({env:{}})).status,503)});
test('empty store returns unavailable',async()=>{assert.equal((await onRequestGet({env:{TRACKER:{get:async()=>null}}})).status,503)});
test('stored data is public with stale marker',async()=>{const r=await onRequestGet({env:{TRACKER:{get:async()=>({generatedAt:'2020-01-01T00:00:00Z',slots:[]})}}});assert.equal(r.headers.get('Access-Control-Allow-Origin'),'*');assert.equal((await r.json()).stale,true)});

import {refreshState} from '../public/challenge-view.js';
test('overnight final snapshot stays current until the next game window',()=>{
 const data={generatedAt:'2026-11-17T04:30:00Z',nextGameAt:'2026-11-18T00:00:00Z',slots:[{games:8,finishedGames:8,liveGames:0},{games:5,finishedGames:0,liveGames:0}]};
 assert.deepEqual(refreshState(data,Date.parse('2026-11-17T05:02:00Z')),{stale:false,label:'Waiting for next game'});
 assert.equal(refreshState(data,Date.parse('2026-11-17T23:50:00Z')).stale,true);
 assert.equal(refreshState({...data,slots:[{games:8,finishedGames:7,liveGames:1}]},Date.parse('2026-11-17T05:02:00Z')).stale,true);
 assert.deepEqual(refreshState({...data,nextGameAt:null,slots:[{games:8,finishedGames:8,liveGames:0}]},Date.parse('2026-11-19T05:00:00Z')),{stale:false,label:'Games complete'});
});
test('API does not mark an idle final snapshot stale',async()=>{
 const data={generatedAt:'2020-01-01T00:00:00Z',nextGameAt:null,slots:[{games:8,finishedGames:8,liveGames:0}]};
 const r=await onRequestGet({env:{TRACKER:{get:async()=>data}}});assert.equal((await r.json()).stale,false);
});
