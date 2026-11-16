import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyGroups,shareSeries,rangeGroups,shortSetName} from '../src/market-share.js';
const day=(date,volume,groups)=>({date,status:'complete',marketShare:{version:1,volume,sets:groups}});
test('named area series keep identity when daily leaders change; others preserves denominator',()=>{
 const days=[day('a',100,[{id:'a',name:'A',volume:60},{id:'b',name:'B',volume:30},{id:'c',name:'C',volume:10}]),day('b',200,[{id:'a',name:'A',volume:50},{id:'b',name:'B',volume:150}])];
 const series=shareSeries(days,days,'sets',1);
 assert.deepEqual(series.map(s=>s.name),['B','Others']);
 assert.deepEqual(series.map(s=>s.data.map(d=>d.value)),[[30,75],[70,25]]);
 assert.ok(series.every(s=>s.type==='line'&&s.areaStyle.opacity>0));
 assert.equal(dailyGroups(days[1],'sets')[0].share,25);
});
test('only five daily leaders plus Others are nonzero; missing and zero days are gaps',()=>{
 const groups=Array.from({length:8},(_,i)=>({id:String(i),name:String(i),volume:i+1}));
 const days=[day('a',36,groups),{date:'b',status:'pending'},day('c',0,[])];
 const series=shareSeries(days,days,'sets');
 assert.equal(series.length,6);
 assert.deepEqual(series.slice(0,5).map(s=>s.name),['7','6','5','4','3']);
 assert.ok(Math.abs(series.reduce((sum,s)=>sum+s.data[0].value,0)-100)<1e-10);
 assert.equal(series[5].data[0].volume,6);
 assert.ok(series.every(s=>s.data[1].value===null&&s.data[2].value===null));
});

test('range ranking weights revenue rather than averaging daily percentages and follows selected dates',()=>{
 const days=[day('a',100,[{id:'a',name:'A',volume:100}]),day('b',300,[{id:'b',name:'B',volume:300}])];
 assert.deepEqual(rangeGroups(days,'sets').map(g=>[g.name,g.share]),[['B',75],['A',25]]);
 assert.deepEqual(shareSeries(days,[days[0]],'sets',1).map(s=>s.name),['A','Others']);
 assert.deepEqual(rangeGroups([{status:'pending'}],'sets'),[]);
});

test('set legend abbreviations preserve series identity and unknown names',()=>{
 assert.equal(shortSetName('Rookie Debut · Series 2026-27'),'RD · S26');
 assert.equal(shortSetName('Rookie Debut · Series 26-27'),'RD · S26');
 assert.equal(shortSetName('Fresh Threads · Series 3'),'FT · S3');
 assert.equal(shortSetName('Unknown · Summer 2021'),'Unknown · Summer 2021');
 assert.equal(shortSetName('Others'),'Others');
});
