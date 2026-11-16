import test from 'node:test';import assert from 'node:assert/strict';
import {onRequestGet} from '../functions/api/challenge.js';
test('no binding returns explicit unavailable',async()=>{assert.equal((await onRequestGet({env:{}})).status,503)});
test('empty store returns unavailable',async()=>{assert.equal((await onRequestGet({env:{TRACKER:{get:async()=>null}}})).status,503)});
test('stored data is public with stale marker',async()=>{const r=await onRequestGet({env:{TRACKER:{get:async()=>({generatedAt:'2020-01-01T00:00:00Z',slots:[]})}}});assert.equal(r.headers.get('Access-Control-Allow-Origin'),'*');assert.equal((await r.json()).stale,true)});
