import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monthCells} from '../src/calendar.js';
test('calendar aligns Sunday-start November and Thursday-start October',()=>{assert.equal(monthCells('2026-11',[])[0].date,'2026-11-01');const oct=monthCells('2026-10',[]);assert.deepEqual(oct.slice(0,4),[null,null,null,null]);assert.equal(oct.at(-1).date,'2026-10-31');});
test('leap days and missing days preserve exact sale identity',()=>{const row={date:'2028-02-29',moments:{highestSale:{momentId:'42'}}};const cells=monthCells('2028-02',[row]);assert.equal(cells.at(-1).row,row);assert.equal(cells.filter(Boolean).length,29);assert.equal(cells.find(x=>x?.day===1).row,undefined);});
