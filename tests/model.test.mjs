import test from 'node:test';
import assert from 'node:assert/strict';
import {values,summarize,subtractDays,csvFor} from '../src/model.js';
const segment={volume:20,sales:2,active:3,buyers:1,sellers:2,average:10,sources:{listing:{volume:20,sales:2},offer:{volume:0,sales:0},legacy:{volume:0,sales:0}}};
const day={date:'2026-10-01',status:'complete',moments:segment,packs:segment,active:4,buyers:1,sellers:2,locked:3,unlocked:1};
test('combined counts use the union, not the sum',()=>{assert.equal(values(day,'all').active,4);assert.equal(values(day,'all').buyers,1);assert.equal(values(day,'all').volume,40);});
test('missing days never become zero observations',()=>{const pending={date:'2026-10-02',status:'pending'};assert.equal(values(pending,'all'),null);assert.equal(summarize([day,pending],'all').active,4);assert.match(csvFor([pending],'all'),/pending,,,,,,,,/);});
test('calendar arithmetic crosses months without local DST',()=>{assert.equal(subtractDays('2026-11-01',1),'2026-10-31');});
