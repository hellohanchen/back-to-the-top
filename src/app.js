import * as echarts from 'echarts/core';
import {BarChart,LineChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent,DataZoomComponent} from 'echarts/components';
import {SVGRenderer} from 'echarts/renderers';
import {labelIndices} from './labels.js';
import {monthCells} from './calendar.js';
import {windowDates} from './range.js';
echarts.use([BarChart,LineChart,GridComponent,TooltipComponent,LegendComponent,DataZoomComponent,SVGRenderer]);
const $=id=>document.getElementById(id);
const charts=Object.fromEntries(['volume','sales','median','average','highest','users'].map(k=>[k,echarts.init($(k+'-chart'),null,{renderer:'svg'})]));
const plots={};
let data, syncing=false;
let visible=[];
const source=(d,a,s)=>d?.status==='complete'?d[a]?.sources?.[s]:null;
const format=(v,money=false)=>v==null?'—':new Intl.NumberFormat('en-US',{maximumFractionDigits:money?2:0,...(money?{style:'currency',currency:'USD'}:{})}).format(v);
function labels(key,series,i,money){
 const values=key==='volume'?series[0].data.map((_,j)=>series.reduce((total,row)=>total+(row.data[j]??0),0)):series[i].data;
 const lo=data.days.findIndex(d=>d.date===visible[0]?.date),hi=data.days.findIndex(d=>d.date===visible.at(-1)?.date);
 const shown=labelIndices(values,lo,hi);
 return {show:true,position:series[i].type==='line'&&i===1?'bottom':'top',fontSize:10,color:'#535b69',formatter:p=>(key==='volume'&&i!==series.length-1)||!shown.has(p.dataIndex)?'':format(values[p.dataIndex],money)};
}
function plot(key,days,series,money=false){
 plots[key]={series,money};
 charts[key].setOption({animation:false,color:['#2168ff','#00b6a2','#ff9a3d'],textStyle:{fontFamily:'Inter, sans-serif'},legend:{selectedMode:false,top:0,left:0,itemWidth:9,itemHeight:9,icon:'roundRect',textStyle:{color:'#565d6a',fontSize:11}},tooltip:{trigger:'axis',confine:true,valueFormatter:v=>format(v,money)},grid:{left:8,right:12,top:64,bottom:52,containLabel:true},xAxis:{type:'category',data:days.map(d=>d.date),axisLabel:{color:'#747983',fontSize:10,formatter:v=>v.slice(5)},axisLine:{lineStyle:{color:'#e5e7eb'}},axisTick:{show:false}},yAxis:{type:'value',max:v=>v.max*1.2,minInterval:money?undefined:1,axisLabel:{color:'#747983',fontSize:10,formatter:v=>(money?'$':'')+new Intl.NumberFormat('en',{notation:'compact'}).format(v)},splitLine:{lineStyle:{color:'#eceef2',type:'dashed'}}},dataZoom:[{type:'slider',startValue:visible[0]?.date,endValue:visible.at(-1)?.date,bottom:4,height:22,showDetail:false,brushSelect:true}],series:series.map((s,i)=>({...s,label:labels(key,series,i,money),labelLayout:{moveOverlap:'shiftY'},showSymbol:true,symbolSize:5,connectNulls:false,barMaxWidth:48,lineStyle:{width:2.5},emphasis:{focus:'series'}}))},true);
 $(key+'-chart').dataset.start=visible[0]?.date||'';$(key+'-chart').dataset.end=visible.at(-1)?.date||'';$(key+'-chart').dataset.days=visible.length;
}
function render(){
 if(!data)return;
 visible=windowDates(data.days,$('range').value,$('start').value,$('end').value);
 const days=data.days;
 $('custom').hidden=$('range').value!=='custom';
 $('range-label').textContent=visible.length?`${visible[0].date} — ${visible.at(-1).date}`:'No data in range';
 const channels=[['Moments · Offers','moments','offer'],['Moments · Listings','moments','listing'],['Packs · Listings','packs','listing']];
 plot('volume',days,channels.map(([name,a,s])=>({name,type:'bar',stack:'volume',data:days.map(d=>source(d,a,s)?.volume??null)})),true);
 for(const metric of ['sales','median','average','highest'])plot(metric,days,['offer','listing'].map(s=>({name:s==='offer'?'Offers':'Listings',type:metric==='sales'?'bar':'line',data:days.map(d=>{const v=source(d,'moments',s);return metric==='sales'?v?.sales??null:v?.sales?v[metric]??null:null;})})),metric!=='sales');
 plot('users',days,[['Active users','active'],['Buyers','buyers'],['Sellers','sellers']].map(([name,key])=>({name,type:'line',data:days.map(d=>d.status==='complete'&&(key!=='active'||d.activityScope==='monitored-topshot-events-v2')?d[key]:null)})));
 const completed=data.activityCoverage?.completedDays??0;
 $('notice').hidden=completed===data.totalDays;
 $('notice').textContent=`Active users history: ${completed} / ${data.totalDays} days refreshed`;
 if(!$('calendar-month').value)$('calendar-month').value=data.throughDate.slice(0,7);
 renderCalendar();
 $('updated').textContent=`Updated ${data.generatedAt.slice(0,10)} · Daily observations · EST (UTC−5)`;
}
function renderCalendar(){
 const target=$('calendar');target.replaceChildren();
 for(const cell of monthCells($('calendar-month').value,data.days)){
  const el=document.createElement('div');el.className='calendar-day';
  if(!cell){el.classList.add('empty');target.append(el);continue;}
  const date=document.createElement('time');date.dateTime=cell.date;date.textContent=cell.day;el.append(date);
  const sale=cell.row?.moments?.highestSale;
  if(sale&&/^\d+$/.test(sale.momentId)){
   const a=document.createElement('a');a.href=`https://nbatopshot.com/moment/${sale.momentId}`;a.target='_blank';a.rel='noopener noreferrer';
   a.setAttribute('aria-label',`${cell.date}: Moment ${sale.momentId}, ${format(sale.price,true)}. Open NBA Top Shot`);
   const img=document.createElement('img');img.src=`https://assets.nbatopshot.com/media/${sale.momentId}/image?width=256&format=webp`;img.alt=`Moment #${sale.momentId}`;img.loading='lazy';img.onerror=()=>{img.hidden=true;};
   const value=document.createElement('strong');value.textContent=format(sale.price,true);
   const id=document.createElement('span');id.className='moment-id';id.textContent=`#${sale.momentId} ↗`;
   a.append(img,value,id);el.append(a);
  }else{const empty=document.createElement('span');empty.className='calendar-missing';empty.textContent=cell.date>data.throughDate?'—':cell.row?.moments?.sales===0?'No sales':'Pending';el.append(empty);}
  target.append(el);
 }
}
$('calendar-month').addEventListener('change',()=>{if(data&&/^\d{4}-\d{2}$/.test($('calendar-month').value))renderCalendar();});
for(const [key,chart] of Object.entries(charts))chart.on('datazoom',event=>{
 if(syncing||!data)return;
 syncing=true;
 const z=event.batch?.[0]??event;
 const option=chart.getOption().dataZoom[0];
 const start=z.start??option.start,end=z.end??option.end;
 const lo=Math.round(start/100*(data.days.length-1)),hi=Math.round(end/100*(data.days.length-1));
 visible=data.days.slice(lo,hi+1);
 for(const [other,c] of Object.entries(charts))if(other!==key)c.dispatchAction({type:'dataZoom',start,end},{silent:true});
 for(const [k,c] of Object.entries(charts)){const {series,money}=plots[k];c.setOption({series:series.map((_,i)=>({label:labels(k,series,i,money)}))});}
 $('range').value='custom';$('custom').hidden=false;
 $('start').value=data.days[lo].date;$('end').value=data.days[hi].date;
 $('range-label').textContent=`${data.days[lo].date} — ${data.days[hi].date}`;
 for(const k of Object.keys(charts)){const el=$(k+'-chart');el.dataset.start=data.days[lo].date;el.dataset.end=data.days[hi].date;el.dataset.days=hi-lo+1;}
 syncing=false;
});
for(const id of ['range','start','end'])$(id).addEventListener('change',render);
new ResizeObserver(()=>Object.values(charts).forEach(c=>c.resize())).observe($('main'));
async function load(){try{const r=await fetch('/data/daily.json',{cache:'no-cache'});if(!r.ok)throw Error('Data unavailable');data=await r.json();for(const id of ['start','end']){$(id).min=data.startDate;$(id).max=data.throughDate;} $('start').value=data.startDate;$('end').value=data.throughDate;render();}catch(e){$('notice').hidden=false;$('notice').textContent='Daily data could not be loaded. Please refresh.';console.error(e);}

}
load();
