import * as echarts from 'echarts/core';
import {BarChart,LineChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent,DataZoomComponent} from 'echarts/components';
import {SVGRenderer} from 'echarts/renderers';
import {labelIndices} from './labels.js';
import {monthCells} from './calendar.js';
import {dailyGroups,shareSeries,rangeGroups,shortSetName} from './market-share.js';
import {windowDates} from './range.js';
echarts.use([BarChart,LineChart,GridComponent,TooltipComponent,LegendComponent,DataZoomComponent,SVGRenderer]);
const $=id=>document.getElementById(id);
const charts=Object.fromEntries(['volume','sales','sets','players','median','average','highest','users'].map(k=>[k,echarts.init($(k+'-chart'),null,{renderer:'svg'})]));
const plots={};
const mobile=window.matchMedia('(max-width:700px)');
let data, syncing=false;
let visible=[];
const source=(d,a,s)=>d?.status==='complete'?d[a]?.sources?.[s]:null;
const format=(v,money=false)=>v==null?'—':new Intl.NumberFormat('en-US',{maximumFractionDigits:money?2:0,...(money?{style:'currency',currency:'USD'}:{})}).format(v);
function labels(key,series,i,money){
 if(key==='sets'||key==='players')return {show:false};
 const values=(key==='volume'||key==='sales')?series[0].data.map((_,j)=>series.reduce((total,row)=>total+(row.data[j]??0),0)):series[i].data;
 const lo=data.days.findIndex(d=>d.date===visible[0]?.date),hi=data.days.findIndex(d=>d.date===visible.at(-1)?.date);
 const shown=labelIndices(values,lo,hi,mobile.matches?Math.max(2,Math.floor($(key+'-chart').clientWidth/64)):15);
 return {show:true,position:'top',distance:9,fontSize:10,color:key==='volume'?'#e6e8eb':'#a4adbb',formatter:p=>((key==='volume'||key==='sales')&&i!==series.length-1)||!shown.has(p.dataIndex)?'':(mobile.matches?new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1,...(money?{style:'currency',currency:'USD'}:{})}).format(values[p.dataIndex]):format(values[p.dataIndex],money))};
}
function plot(key,days,series,money=false){
 plots[key]={series,money};
 const share=key==='sets'||key==='players';
 charts[key].setOption({animation:false,color:share?['#3b82f6','#8b5cf6','#14b8a6','#f59e0b','#ec4899','#06b6d4','#84cc16','#f97316','#64748b']:key==='users'?['#3b82f6','#14b8a6','#a78bfa']:['#8b5cf6','#3b82f6','#14b8a6'],textStyle:{fontFamily:'Inter, sans-serif'},legend:{orient:share?'vertical':'horizontal',formatter:share?shortSetName:undefined,type:share?'scroll':'plain',pageTextStyle:{color:'#9ba6b7'},selectedMode:false,top:share?52:0,left:share?undefined:0,right:share?0:undefined,bottom:share?56:undefined,itemWidth:9,itemHeight:9,icon:'roundRect',textStyle:{color:'#9ba6b7',fontSize:share&&mobile.matches?10:11,width:share?80:undefined,overflow:'truncate'}},tooltip:{renderMode:'richText',formatter:share?(items=>[items[0]?.axisValue,...items.filter(p=>p.value>0).map(p=>(p.data.groupName||p.seriesName)+': '+p.value.toFixed(2)+'% · '+format(p.data.volume,true))].join('\n')):undefined,trigger:'axis',confine:true,backgroundColor:'#1b222d',borderColor:'#343e4c',textStyle:{color:'#e6e8eb',fontSize:12},valueFormatter:v=>format(v,money)},grid:{left:8,right:share?110:12,top:share?16:64,bottom:52,containLabel:true},xAxis:{type:'category',boundaryGap:!share,data:days.map(d=>d.date),axisLabel:{color:'#8591a3',fontSize:10,formatter:v=>v.slice(5)},axisLine:{lineStyle:{color:'#29313d'}},axisTick:{show:false}},yAxis:{type:'value',interval:share?25:undefined,max:share?100:v=>v.max*1.2,minInterval:share?20:money?undefined:1,axisLabel:{color:'#8591a3',fontSize:10,formatter:v=>share?v+'%':(money?'$':'')+new Intl.NumberFormat('en',{notation:'compact'}).format(v)},splitLine:{lineStyle:{color:'#232a34',type:'solid'}}},dataZoom:[{type:'slider',startValue:visible[0]?.date,endValue:visible.at(-1)?.date,bottom:4,height:22,showDetail:false,brushSelect:true,borderColor:'#303947',backgroundColor:'#10141a',fillerColor:'rgba(59,130,246,.14)',handleStyle:{color:'#65758c',borderColor:'#8594a9'},dataBackground:{lineStyle:{color:'#3b4655'},areaStyle:{color:'#222b38'}},selectedDataBackground:{lineStyle:{color:'#598cce'},areaStyle:{color:'#263c59'}}}],series:series.map((s,i)=>({...s,label:labels(key,series,i,money),labelLayout:{moveOverlap:'shiftY',hideOverlap:true},showSymbol:!share,symbolSize:5,connectNulls:false,barMaxWidth:32,lineStyle:{width:share?1:2},emphasis:{focus:'series'}}))},true);
 $(key+'-chart').dataset.start=visible[0]?.date||'';$(key+'-chart').dataset.end=visible.at(-1)?.date||'';$(key+'-chart').dataset.days=visible.length;
}
function render(){
 if(!data)return;
 visible=windowDates(data.days,$('range').value,$('start').value,$('end').value);
 const days=data.days;
 $('custom').hidden=$('range').value!=='custom';
 document.querySelectorAll('[data-range]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.range===$('range').value)));
 $('range-label').textContent=visible.length?`${visible[0].date} — ${visible.at(-1).date}`:'No data in range';
 const channels=[['Moments · Offers','moments','offer'],['Moments · Listings','moments','listing'],['Packs · Listings','packs','listing']];
 plot('volume',days,channels.map(([name,a,s])=>({name,type:'bar',stack:'volume',data:days.map(d=>source(d,a,s)?.volume??null)})),true);
 for(const metric of ['sales','median','average','highest'])plot(metric,days,['offer','listing'].map(s=>({name:s==='offer'?'Offers':'Listings',type:metric==='sales'?'bar':'line',stack:metric==='sales'?'sales':undefined,data:days.map(d=>{const v=source(d,'moments',s);return metric==='sales'?v?.sales??null:v?.sales?v[metric]??null:null;})})),metric!=='sales');
 plot('users',days,[['Active users','active'],['Buyers','buyers'],['Sellers','sellers']].map(([name,key])=>({name,type:'line',data:days.map(d=>d.status==='complete'&&(key!=='active'||d.activityScope==='monitored-topshot-events-v2')?d[key]:null)})));
 renderShares();
 const completed=data.activityCoverage?.completedDays??0;
 $('notice').hidden=completed===data.totalDays;
 $('notice').textContent=`Active users history: ${completed} / ${data.totalDays} days refreshed`;
 if(!$('calendar-month').value)$('calendar-month').value=data.throughDate.slice(0,7);
 renderCalendar();
 $('updated').textContent=`Updated ${data.generatedAt.slice(0,10)} · Daily observations · EST (UTC−5)`;
}
function renderShareTable(key){
 const day=visible.find(d=>d.date===$(key+'-day').value),body=$(key+'-rows');
 body.replaceChildren();
 const groups=dailyGroups(day,key);
 if(!groups?.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=3;cell.textContent=groups?'No sales':'Pending';row.append(cell);body.append(row);return;}
 for(const group of groups){
  const row=document.createElement('tr');
  for(const value of [group.name,format(group.volume,true),group.share.toFixed(2)+'%']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
  body.append(row);
 }
}
function renderPlayerRanking(){
 const groups=rangeGroups(visible,'players').slice(0,10);
 charts.players.setOption({animation:false,textStyle:{fontFamily:'Inter, sans-serif'},grid:{left:8,right:48,top:12,bottom:30,containLabel:true},
 tooltip:{trigger:'item',renderMode:'richText',confine:true,formatter:p=>p.name+'\n'+p.value.toFixed(2)+'% · '+format(p.data.volume,true)},
 xAxis:{type:'value',axisLabel:{color:'#8591a3',formatter:v=>v+'%'},splitLine:{lineStyle:{color:'#232a34'}}},
 yAxis:{type:'category',inverse:true,data:groups.map(g=>g.name),axisTick:{show:false},axisLine:{show:false},axisLabel:{color:'#c8d0dc',fontSize:11,width:mobile.matches?105:180,overflow:'truncate'}},
 series:[{type:'bar',barMaxWidth:18,itemStyle:{color:'#3b82f6',borderRadius:[0,3,3,0]},label:{show:true,position:'right',color:'#a4adbb',fontSize:11,formatter:p=>p.value.toFixed(1)+'%'},data:groups.map(g=>({value:g.share,volume:g.volume}))}]},true);
 $('players-chart').setAttribute('aria-label','Top 10 players by Moment revenue in selected range: '+groups.map(g=>g.name+' '+g.share.toFixed(1)+'%').join(', '));
 $('players-context').textContent=groups.length?'Selected range · Top 10 · '+groups.reduce((sum,g)=>sum+g.share,0).toFixed(1)+'% combined':'No sales in selected range';
}
function renderShares(){
 for(const key of ['sets','players']){
  if(key==='sets')plot(key,data.days,shareSeries(data.days,visible,key));
  else renderPlayerRanking();
  const select=$(key+'-day'),old=select.value;select.replaceChildren();
  for(const day of visible){const option=document.createElement('option');option.value=day.date;option.textContent=day.date;select.append(option);}
  select.value=visible.some(d=>d.date===old)?old:visible.at(-1)?.date||'';
  renderShareTable(key);
 }
}
for(const key of ['sets','players'])$(key+'-day').addEventListener('change',()=>renderShareTable(key));
function renderCalendar(){
 const target=$('calendar');target.replaceChildren();
 const cells=mobile.matches?data.days.slice(-7).map(row=>({date:row.date,day:row.date.slice(5),row})):monthCells($('calendar-month').value,data.days);
 for(const cell of cells){
  const el=document.createElement('div');el.className='calendar-day';
  if(!cell){el.classList.add('empty');target.append(el);continue;}
  const date=document.createElement('time');date.dateTime=cell.date;date.textContent=cell.day;el.append(date);
  const sale=cell.row?.moments?.highestSale;
  if(sale&&/^\d+$/.test(sale.momentId)){
   const a=document.createElement('a');a.href=`https://nbatopshot.com/moment/${sale.momentId}`;a.target='_blank';a.rel='noopener noreferrer';
   a.setAttribute('aria-label',`${cell.date}: ${sale.playerName||'Top Moment'}, ${format(sale.price,true)}. Open NBA Top Shot in a new window`);
   const img=document.createElement('img');img.src=`https://assets.nbatopshot.com/media/${sale.momentId}/image?width=256&format=webp`;img.alt=sale.playerName||'Top Moment';img.loading='lazy';img.draggable=false;img.onerror=()=>{img.hidden=true;};
   const value=document.createElement('strong');value.textContent=format(sale.price,true);
   a.append(img);
   if(sale.playerName){const name=document.createElement('span');name.className='player-name';name.textContent=sale.playerName;if(Number.isInteger(sale.serialNumber)&&Number.isInteger(sale.editionSize)&&sale.serialNumber>0&&sale.editionSize>=sale.serialNumber){const serial=document.createElement('span');serial.className='moment-serial';serial.textContent=` ${sale.serialNumber}/${sale.editionSize}`;name.append(serial);}a.append(name);}
   if(sale.serialNumber&&sale.editionSize)a.setAttribute('aria-label',`${cell.date}: ${sale.playerName||'Top Moment'}, ${sale.serialNumber}/${sale.editionSize}, ${format(sale.price,true)}. Open NBA Top Shot in a new window`);
   a.append(value);el.append(a);
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
 for(const [k,c] of Object.entries(charts)){if(!plots[k])continue;const {series,money}=plots[k];c.setOption({series:series.map((_,i)=>({label:labels(k,series,i,money)}))});}
 $('range').value='custom';$('custom').hidden=false;
 document.querySelectorAll('[data-range]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.range==='custom')));
 $('start').value=data.days[lo].date;$('end').value=data.days[hi].date;
 $('range-label').textContent=`${data.days[lo].date} — ${data.days[hi].date}`;
 for(const k of Object.keys(charts)){const el=$(k+'-chart');el.dataset.start=data.days[lo].date;el.dataset.end=data.days[hi].date;el.dataset.days=hi-lo+1;}
 renderShares();
 syncing=false;
});
document.querySelectorAll('[data-range]').forEach(b=>b.addEventListener('click',()=>{$('range').value=b.dataset.range;render();}));
for(const id of ['range','start','end'])$(id).addEventListener('change',render);
new ResizeObserver(()=>{for(const [k,c] of Object.entries(charts)){c.resize();if(data&&plots[k]){const {series,money}=plots[k];c.setOption({series:series.map((_,i)=>({label:labels(k,series,i,money)}))});}}}).observe($('main'));
mobile.addEventListener('change',()=>{if(data)renderCalendar();});
async function load(){try{const r=await fetch('./data/daily.json',{cache:'no-cache'});if(!r.ok)throw Error('Data unavailable');data=await r.json();for(const id of ['start','end']){$(id).min=data.startDate;$(id).max=data.throughDate;} $('start').value=data.startDate;$('end').value=data.throughDate;render();}catch(e){$('notice').hidden=false;$('notice').textContent='Daily data could not be loaded. Please refresh.';console.error(e);}

}
load();
