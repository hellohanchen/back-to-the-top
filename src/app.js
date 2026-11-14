import * as echarts from 'echarts/core';
import {BarChart,LineChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent,DataZoomComponent,MarkLineComponent} from 'echarts/components';
import {SVGRenderer} from 'echarts/renderers';
import {lastClosedDay} from './model.js';
echarts.use([BarChart,LineChart,GridComponent,TooltipComponent,LegendComponent,DataZoomComponent,MarkLineComponent,SVGRenderer]);
const $=id=>document.getElementById(id), colors=['#9caf6a','#599d90','#9b9caa'];
const money=n=>n==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const num=n=>n==null?'—':new Intl.NumberFormat('en-US').format(n);
const charts=Object.fromEntries(['volume','price','users'].map(k=>[k,echarts.init($(k+'-chart'),null,{renderer:'svg'})]));
let data;
const source=(d,a,s)=>d?.status==='complete'?d[a]?.sources?.[s]:null;
function strip(id,items,dark=false){$(id).innerHTML=items.map(([label,value],i)=>`<div><div class="daily-label"><i style="background:${dark?['#d7f58a','#80ac96','#c5c0dd'][i]:colors[i]}"></i>${label}</div><div class="daily-value">${value}</div></div>`).join('');}
function plot(key,series,isMoney,dark=false){
 const dates=data.days.map(d=>d.date),selected=$('report-date').value;
 const previousZoom=charts[key].getOption()?.dataZoom?.[0];
 charts[key].setOption({animation:false,color:dark?['#d7f58a','#80ac96','#c5c0dd']:colors,textStyle:{fontFamily:'DM Sans, sans-serif'},legend:{top:0,textStyle:{color:dark?'#c3d1b9':'#68735f'},icon:'circle'},tooltip:{trigger:'axis',confine:true,valueFormatter:v=>isMoney?money(v):num(v)},grid:{left:12,right:12,top:45,bottom:60,containLabel:true},xAxis:{type:'category',data:dates,axisLabel:{color:dark?'#bdc9b2':'#77816d',formatter:v=>v.slice(5)},axisLine:{show:false},axisTick:{show:false}},yAxis:{type:'value',axisLabel:{color:dark?'#bdc9b2':'#77816d',formatter:v=>(isMoney?'$':'')+new Intl.NumberFormat('en',{notation:'compact'}).format(v)},splitLine:{lineStyle:{color:dark?'#45513e':'#e9ece3',type:'dashed'}}},dataZoom:[{type:'slider',bottom:5,height:20,start:previousZoom?.start??0,end:previousZoom?.end??100,showDetail:false,brushSelect:false},{type:'inside'}],series:series.map((s,i)=>({...s,showSymbol:false,connectNulls:false,barMaxWidth:12,lineStyle:{width:2},markLine:i?undefined:{silent:true,symbol:'none',label:{show:false},lineStyle:{color:dark?'#ecf5e0':'#69775e',type:'dashed',opacity:.6},data:[{xAxis:selected}]}}))},true);
}
function render(){
 if(!data)return;const selected=$('report-date').value,d=data.days.find(x=>x.date===selected);
 const done=d?.status==='complete';
 $('previous').disabled=selected<=data.startDate;$('next').disabled=selected>=data.throughDate;
 const needs=done&&(!source(d,'moments','listing')?.hasOwnProperty('median')||d.activityScope!=='monitored-topshot-events-v2');
 $('notice').hidden=done&&!needs&&data.throughDate>=lastClosedDay();
 $('notice').textContent=!done?'Daily report pending.':needs?'Expanded daily statistics are being refreshed.':`Latest completed day: ${data.throughDate} (EST).`;
 const vols=[['Moments · Offers','moments','offer'],['Moments · Listings','moments','listing'],['Packs · Listings','packs','listing']];
 strip('volume-values',vols.map(([label,a,s])=>[label,money(source(d,a,s)?.volume)]),true);
 plot('volume',vols.map(([name,a,s])=>({name,type:'bar',data:data.days.map(x=>source(x,a,s)?.volume??null)})),true,true);
 $('market-values').innerHTML=['offer','listing'].map(s=>{const v=source(d,'moments',s);return `<tr><td>${s==='offer'?'Offers':'Listings'}</td><td>${num(v?.sales)}</td>${['median','average','highest'].map(k=>`<td>${money(v?.sales?v[k]:null)}</td>`).join('')}</tr>`;}).join('');
 const m=$('price-metric').value;
 plot('price',['offer','listing'].map(s=>({name:s==='offer'?'Offers':'Listings',type:m==='sales'?'bar':'line',data:data.days.map(x=>{const v=source(x,'moments',s);return m==='sales'?v?.sales??null:v?.sales?v[m]??null:null;})})),m!=='sales');
 const roles=[['Active users','active'],['Buyers','buyers'],['Sellers','sellers']];
 strip('activity-values',roles.map(([label,k])=>[label,num(done&&(k!=='active'||d.activityScope==='monitored-topshot-events-v2')?d[k]:null)]));
 plot('users',roles.map(([name,k])=>({name,type:'line',data:data.days.map(x=>x.status==='complete'&&(k!=='active'||x.activityScope==='monitored-topshot-events-v2')?x[k]:null)})),false);
 $('updated').textContent=`REPORT / ${selected} · EST`;
}
$('report-date').addEventListener('change',()=>{if(!data)return;$('report-date').value=[data.startDate,$('report-date').value||data.throughDate,data.throughDate].sort()[1];render();});
for(const [id,step] of [['previous',-1],['next',1]])$(id).onclick=()=>{const i=data.days.findIndex(d=>d.date===$('report-date').value);if(data.days[i+step]){$('report-date').value=data.days[i+step].date;render();}};
$('price-metric').onchange=render;
$('methodology').onclick=()=>$('methods').showModal();$('close-methods').onclick=()=>$('methods').close();
new ResizeObserver(()=>Object.values(charts).forEach(c=>c.resize())).observe(document.querySelector('.shell'));
async function load(){try{const r=await fetch('/data/daily.json',{cache:'no-cache'});if(!r.ok)throw Error('Data unavailable');data=await r.json();$('report-date').min=data.startDate;$('report-date').max=data.throughDate;$('report-date').value=data.latestCompleteDate||data.throughDate;render();}catch(e){$('notice').hidden=false;$('notice').textContent='Daily data could not be loaded. Please refresh.';console.error(e);}

}
load();
