import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyGroups,shareSeries} from '../src/market-share.js';
const day=(date,volume,groups)=>({date,status:'complete',marketShare:{version:1,volume,sets:groups}});
test('share denominator is each day; small categories remain in Other',()=>{
 const days=[day('a',100,[{id:'a',name:'A',volume:60},{id:'b',name:'B',volume:30},{id:'c',name:'C',volume:10}]),day('b',200,[{id:'a',name:'A',volume:50},{id:'b',name:'B',volume:150}])];
 const series=shareSeries(days,days,'sets',1);
 assert.deepEqual(series.map(s=>s.name),['B','Other']);
 assert.deepEqual(series.map(s=>s.data.map(d=>d.value)),[[30,75],[70,25]]);
 assert.equal(dailyGroups(days[1],'sets')[0].share,25);
});
test('top categories follow visible range; missing and zero-sale days are gaps',()=>{
 const days=[day('a',100,[{id:'a',name:'A',volume:100}]),day('b',200,[{id:'b',name:'B',volume:200}]),{date:'c',status:'pending'},day('d',0,[])];
 const series=shareSeries(days,[days[0]],'sets',1);
 assert.equal(series[0].name,'A');
 assert.equal(series[0].data[2].value,null);
 assert.equal(series[0].data[3].value,null);
 assert.equal(dailyGroups(days[2],'sets'),null);
});
