import test from 'node:test';import assert from 'node:assert/strict';
import {visibleRows,marketUrl,gameLabel} from '../public/challenge-view.js';
const slot={games:2,finishedGames:1,officialPlayers:[],expectedQualifiers:1,rankings:Array.from({length:20},(_,i)=>({rank:i+1,name:String(i)}))};
test('confirmed slots show only official results',()=>{assert.deepEqual(visibleRows({...slot,finishedGames:2,officialPlayers:['2','8']}).map(r=>r.name),['2','8']);});
test('live limits use expected count times three with floor five',()=>{assert.equal(visibleRows(slot).length,5);assert.equal(visibleRows({...slot,expectedQualifiers:3}).length,9);});
test('all tied qualifiers retained and bold flag follows rank',()=>{const rows=visibleRows({...slot,rankings:slot.rankings.map((r,i)=>({...r,rank:i<12?1:i+1}))});assert.equal(rows.length,12);assert.ok(rows.every(r=>r.qualified));});
test('market URL preserves accented player names',()=>assert.equal(marketUrl('Luka Dončić'),'https://nbatopshot.com/search?players=Luka+Don%C4%8Di%C4%87'));
test('live score includes period clock and overtime; final hides score',()=>{const r={gameStatus:2,game:{home:'LAL',away:'PHX',homeScore:100,awayScore:89,period:4,clock:'PT05M32.00S'}};assert.equal(gameLabel(r),'LAL 100 - 89 PHX Q4 5:32');assert.equal(gameLabel({...r,gameStatus:3}),'');assert.match(gameLabel({...r,game:{...r.game,period:5}}),/OT1/);});

import {confirmationState,slotView,gameStatusLabel} from '../public/challenge-view.js';
test('automatic confirmation waits 24 hours after every game is final',()=>{
 const completedAt='2026-11-18T04:00:00Z',s={...slot,finishedGames:2,completedAt};
 assert.equal(confirmationState(s,Date.parse(completedAt)+86400000-1),'');
 assert.equal(confirmationState(s,Date.parse(completedAt)+86400000),'automatic');
 assert.equal(confirmationState({...s,finishedGames:1},Date.parse(completedAt)+172800000),'');
 assert.equal(confirmationState({...s,completedAt:null}), '');
 assert.equal(confirmationState({...s,officialPlayers:['3']}),'official');
 const tied={...s,rankings:[{name:'A',rank:1},{name:'B',rank:1},{name:'C',rank:3}]};
 assert.deepEqual(visibleRows(tied,Date.parse(completedAt)+86400000).map(r=>r.name),['A','B']);
});
test('upcoming defaults to games and started slots retain user selection',()=>{
 const future={...slot,finishedGames:0,liveGames:0,rankings:[]};
 assert.equal(slotView(future),'games');assert.equal(slotView(slot),'leaderboard');assert.equal(slotView(slot,'games'),'games');
});
test('scoreboard states include live overtime, finals and schedule exceptions',()=>{
 assert.equal(gameStatusLabel({status:2,period:5,clock:'PT02M03.00S'}),'OT1 · 2:03');
 assert.equal(gameStatusLabel({status:3}),'Final');
 assert.equal(gameStatusLabel({status:1,statusText:'Postponed'}),'Postponed');
});

import {compactGameLabel} from '../public/challenge-view.js';
test('compact games use EST dates and single-line live and final scores',()=>{
 const g={home:'LAL',away:'LAC',status:1,startAt:'2026-11-20T01:00:00Z'};
 assert.equal(compactGameLabel(g),'LAL - LAC, 11/19 8:00 EST');
 assert.equal(compactGameLabel({...g,status:2,homeScore:111,awayScore:99,period:4,clock:'PT05M43.00S'}),'LAL 111 - 99 LAC Q4 5:43');
 assert.equal(compactGameLabel({...g,status:3,homeScore:111,awayScore:99}),'LAL 111 - 99 LAC Final');
 assert.match(compactGameLabel({...g,statusText:'Postponed'}),/Postponed$/);
 assert.equal(compactGameLabel({...g,startAt:null,date:'2026-11-19'}),'LAL - LAC, 2026-11-19');
});
