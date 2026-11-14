import * as echarts from 'echarts/core';
import {BarChart,LineChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent} from 'echarts/components';
import {SVGRenderer} from 'echarts/renderers';
import {windowDates} from './range.js';
echarts.use([BarChart,LineChart,GridComponent,TooltipComponent,LegendComponent,SVGRenderer]);
const $=id=>document.getElementById(id);
const charts=Object.fromEntries(['volume','sales','median','average','highest','users'].map(k=>[k,echarts.init($(k+'-chart'),null,{renderer:'svg'})]));
let data;
const source=(d,a,s)=>d?.status==='complete'?d[a]?.sources?.[s]:null;
const format=(v,money=false)=>v==null?'—':new Intl.NumberFormat('en-US',{maximumFractionDigits:money?2:0,...(money?{style:'currency',currency:'USD'}:{})}).format(v);
function plot(key,days,series,money=false){
 charts[key].setOption({animation:false,color:['#2168ff','#00b6a2','#ff9a3d'],textStyle:{fontFamily:'Inter, sans-serif'},legend:{top:0,left:0,itemWidth:9,itemHeight:9,icon:'roundRect',textStyle:{color:'#565d6a',fontSize:11}},tooltip:{trigger:'axis',confine:true,valueFormatter:v=>format(v,money)},grid:{left:8,right:12,top:52,bottom:10,containLabel:true},xAxis:{type:'category',data:days.map(d=>d.date),axisLabel:{color:'#747983',fontSize:10,formatter:v=>v.slice(5)},axisLine:{lineStyle:{color:'#e5e7eb'}},axisTick:{show:false}},yAxis:{type:'value',minInterval:money?undefined:1,axisLabel:{color:'#747983',fontSize:10,formatter:v=>(money?'$':'')+new Intl.NumberFormat('en',{notation:'compact'}).format(v)},splitLine:{lineStyle:{color:'#eceef2',type:'dashed'}}},series:series.map(s=>({...s,showSymbol:days.length<15,symbolSize:5,connectNulls:false,barMaxWidth:48,lineStyle:{width:2.5},emphasis:{focus:'series'}}))},true);
 $(key+'-chart').dataset.start=days[0]?.date||'';$(key+'-chart').dataset.end=days.at(-1)?.date||'';$(key+'-chart').dataset.days=days.length;
}
function render(){
 if(!data)return;
 const days=windowDates(data.days,$('range').value,$('start').value,$('end').value);
 $('custom').hidden=$('range').value!=='custom';
 $('range-label').textContent=days.length?`${days[0].date} — ${days.at(-1).date}`:'No data in range';
 const channels=[['Moments · Offers','moments','offer'],['Moments · Listings','moments','listing'],['Packs · Listings','packs','listing']];
 plot('volume',days,channels.map(([name,a,s])=>({name,type:'bar',stack:'volume',data:days.map(d=>source(d,a,s)?.volume??null)})),true);
 for(const metric of ['sales','median','average','highest'])plot(metric,days,['offer','listing'].map(s=>({name:s==='offer'?'Offers':'Listings',type:metric==='sales'?'bar':'line',data:days.map(d=>{const v=source(d,'moments',s);return metric==='sales'?v?.sales??null:v?.sales?v[metric]??null:null;})})),metric!=='sales');
 plot('users',days,[['Active users','active'],['Buyers','buyers'],['Sellers','sellers']].map(([name,key])=>({name,type:'line',data:days.map(d=>d.status==='complete'&&(key!=='active'||d.activityScope==='monitored-topshot-events-v2')?d[key]:null)})));
 const completed=data.activityCoverage?.completedDays??0;
 $('notice').hidden=completed===data.totalDays;
 $('notice').textContent=`Active users history: ${completed} / ${data.totalDays} days refreshed`;
 $('updated').textContent=`Updated ${data.generatedAt.slice(0,10)} · Daily observations · EST (UTC−5)`;
}
for(const id of ['range','start','end'])$(id).addEventListener('change',render);
new ResizeObserver(()=>Object.values(charts).forEach(c=>c.resize())).observe($('main'));
async function load(){try{const r=await fetch('/data/daily.json',{cache:'no-cache'});if(!r.ok)throw Error('Data unavailable');data=await r.json();for(const id of ['start','end']){$(id).min=data.startDate;$(id).max=data.throughDate;} $('start').value=data.startDate;$('end').value=data.throughDate;render();}catch(e){$('notice').hidden=false;$('notice').textContent='Daily data could not be loaded. Please refresh.';console.error(e);}

}
load();
