import {test} from 'node:test';
import assert from 'node:assert/strict';
import {windowDates} from '../src/range.js';
const days=Array.from({length:44},(_,i)=>({date:new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10)}));
test('last seven observations include both endpoints across month boundary',()=>{assert.equal(windowDates(days).length,7);assert.equal(windowDates(days)[0].date,'2026-11-07');assert.equal(windowDates(days).at(-1).date,'2026-11-13');});
test('custom ranges are inclusive, reversible and bounded by available data',()=>{assert.equal(windowDates(days,'custom','2026-11-03','2026-10-30').length,5);assert.equal(windowDates(days,'custom','2026-01-01','2026-10-02').length,2);assert.deepEqual(windowDates(days,'custom','2027-01-01','2027-01-02'),[]);});
test('all history and shorter datasets preserve original daily observations',()=>{assert.deepEqual(windowDates(days,'all'),days);assert.deepEqual(windowDates(days.slice(0,2)),days.slice(0,2));assert.deepEqual(windowDates([]),[]);});
