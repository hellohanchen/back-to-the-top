import test from 'node:test';import assert from 'node:assert/strict';
import {visibleRows,marketUrl,gameLabel} from '../public/challenge-view.js';
const slot={games:2,finishedGames:1,officialPlayers:[],expectedQualifiers:1,rankings:Array.from({length:20},(_,i)=>({rank:i+1,name:String(i)}))};
test('confirmed slots show only official results',()=>{assert.deepEqual(visibleRows({...slot,finishedGames:2,officialPlayers:['2','8']}).map(r=>r.name),['2','8']);});
test('live limits use expected count times three with floor five',()=>{assert.equal(visibleRows(slot).length,5);assert.equal(visibleRows({...slot,expectedQualifiers:3}).length,9);});
test('all tied qualifiers retained and bold flag follows rank',()=>{const rows=visibleRows({...slot,rankings:slot.rankings.map((r,i)=>({...r,rank:i<12?1:i+1}))});assert.equal(rows.length,12);assert.ok(rows.every(r=>r.qualified));});
test('market URL preserves accented player names',()=>assert.equal(marketUrl('Luka Dončić'),'https://nbatopshot.com/search?players=Luka+Don%C4%8Di%C4%87'));
test('live score includes period clock and overtime; final hides score',()=>{const r={gameStatus:2,game:{home:'LAL',away:'PHX',homeScore:100,awayScore:89,period:4,clock:'PT05M32.00S'}};assert.equal(gameLabel(r),'LAL 100 - 89 PHX Q4 5:32');assert.equal(gameLabel({...r,gameStatus:3}),'');assert.match(gameLabel({...r,game:{...r.game,period:5}}),/OT1/);});
