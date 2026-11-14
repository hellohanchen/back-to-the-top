import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, GraphicComponent, AriaComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { values, summarize, subtractDays, csvFor, lastClosedDay } from './model.js';
echarts.use([BarChart,LineChart,PieChart,GridComponent,TooltipComponent,GraphicComponent,AriaComponent,SVGRenderer]);
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:n<100?2:0}).format(n);
const number = n => new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n);
const compact = n => new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(n);
const shortDate = s => new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'2-digit',timeZone:'UTC'});
let data, asset='all', metric='volume', range='30', showAll=false;
const charts = Object.fromEntries(['volume','channel','users','price','locks'].map(k => [k,echarts.init($(k+'-chart'),null,{renderer:'svg'})]));
const palette={olive:'#768b54',muted:'#b8c3ad',lime:'#d7f58a',mint:'#80ac96',ink:'#263628'};
const tooltip={trigger:'axis',backgroundColor:'#fff',borderColor:'#e5e8df',textStyle:{color:'#253426',fontFamily:'DM Sans',fontSize:11},padding:[12,15],extraCssText:'box-shadow:0 8px 30px #0001;border-radius:7px;',confine:true};
function base(days, dark=false) {
  return {animation:!matchMedia('(prefers-reduced-motion: reduce)').matches,animationDuration:350,
    textStyle:{fontFamily:'DM Sans, sans-serif'},aria:{enabled:true,label:{description:'Daily on-chain statistics for the selected period. Pending dates are gaps. Exact values are available in the daily ledger and CSV export.'}},tooltip,
    grid:{left:9,right:8,top:22,bottom:8,containLabel:true},
    xAxis:{type:'category',data:days.map(d=>d.date),boundaryGap:true,axisLine:{show:false},axisTick:{show:false},
      axisLabel:{color:dark?'#a1b09a':'#929b87',fontSize:9,margin:16,hideOverlap:true,formatter:v=>shortDate(v),interval:Math.max(0,Math.floor(days.length/6)-1)}},
    yAxis:{type:'value',splitNumber:3,axisLine:{show:false},axisTick:{show:false},axisLabel:{color:dark?'#99a990':'#929b87',fontSize:9,margin:12,formatter:compact},splitLine:{lineStyle:{color:dark?'#3c4b3b':'#edf0e8',type:'dashed'}}}};
}
function selectedDays() {return data.days.filter(d=>d.date >= $('date-from').value && d.date <= $('date-to').value);}
function line(name, points, color, dashed=false) {return {name,type:'line',data:points,smooth:false,connectNulls:false,showSymbol:false,symbolSize:5,lineStyle:{width:2,color,type:dashed?'dashed':'solid'},itemStyle:{color},emphasis:{focus:'series'}};}
function render() {
  if(!data)return;
  const days=selectedDays(),summary=summarize(days,asset),completed=days.filter(d=>d.status==='complete');
  const pending=days.length-completed.length;
  const stale=data.throughDate<lastClosedDay();
  $('notice').hidden=!pending&&!stale;
  $('notice').textContent=`Backfill in progress · ${completed.length} of ${days.length} selected days complete. Uncollected days remain gaps.`;
  if(!pending&&stale)$('notice').textContent=`Update delayed · latest dataset ends ${data.throughDate} (fixed EST).`;
  $('k-volume').textContent=summary.count?money(summary.volume):'—';
  $('k-sales').textContent=summary.count?number(summary.sales):'—';
  $('k-active').textContent=summary.count?number(summary.active):'—';
  $('k-average').textContent=summary.count?money(summary.average):'—';
  $('sales-foot').textContent=`${completed.length} completed ${completed.length===1?'day':'days'}`;
  $('hero-total').textContent=summary.count?(metric==='volume'?money(summary.volume):number(summary.sales)):'—';
  $('period-label').textContent=days.length?`${shortDate(days[0].date)} — ${shortDate(days.at(-1).date)}`:'';
  const volume=base(days,true);
  volume.yAxis.axisLabel.formatter=v=>metric==='volume'?'$'+compact(v):compact(v);
  volume.tooltip={...tooltip,valueFormatter:v=>v==null?'Pending':metric==='volume'?money(v):number(v)};
  volume.series=['moments','packs'].filter(a=>asset==='all'||a===asset).map((a,i)=>({name:a==='moments'?'Moments':'Packs',type:'bar',stack:'total',barMaxWidth:24,data:days.map(d=>d.status==='complete'?d[a][metric]:null),itemStyle:{color:a==='moments'?palette.lime:palette.mint,borderRadius:[2,2,0,0]},emphasis:{focus:'series'}}));
  if(!completed.length)volume.graphic={type:'text',left:'center',top:'middle',style:{text:'Awaiting complete daily data',fill:'#b4c0ad',font:'12px sans-serif'}};
  charts.volume.setOption(volume,true);
  const channels=['listing','offer','legacy'].map((key,i)=>({name:['Listings','Offers','Legacy market'][i],value:completed.reduce((s,d)=>s+values(d,asset).sources[key].volume,0),itemStyle:{color:[palette.ink,'#b2cc8b','#e8ecd9'][i]}}));
  charts.channel.setOption({animationDuration:350,aria:{enabled:true,label:{description:'Daily on-chain statistics for the selected period. Pending dates are gaps. Exact values are available in the daily ledger and CSV export.'}},tooltip:{...tooltip,trigger:'item',formatter:p=>`${p.name}: ${money(p.value)} (${p.percent}%)`},graphic:[{type:'text',left:'center',top:'41%',style:{text:summary.count?number(summary.sales):'—',fill:palette.ink,font:'600 29px Manrope, sans-serif'}},{type:'text',left:'center',top:'59%',style:{text:'COMPLETED SALES',fill:'#8c9680',font:'8px DM Sans, sans-serif'}}],series:[{type:'pie',radius:['69%','84%'],center:['50%','52%'],padAngle:2,label:{show:false},itemStyle:{borderRadius:3},data:channels,emptyCircleStyle:{color:'#eef0e8'},emphasis:{scaleSize:4}}]},true);
  $('channel-legend').replaceChildren(...channels.map(c=>{const row=document.createElement('div');row.className='channel-row';row.innerHTML=`<i style="background:${c.itemStyle.color}"></i><span>${c.name}</span><span class="amount">${summary.count?money(c.value):'—'}</span><span class="share">${summary.count?(summary.volume?(c.value/summary.volume*100).toFixed(0):0)+'%':'—'}</span>`;return row;}));
  const users=base(days);users.tooltip={...tooltip,valueFormatter:v=>v==null?'Pending':number(v)};
  users.series=[line('Buyers',days.map(d=>values(d,asset)?.buyers??null),palette.olive),line('Sellers',days.map(d=>values(d,asset)?.sellers??null),palette.muted)];
  users.series[0].areaStyle={color:'#c4d3ae',opacity:.16};charts.users.setOption(users,true);
  const price=base(days);price.yAxis.axisLabel.formatter=v=>'$'+compact(v);price.tooltip={...tooltip,valueFormatter:v=>v==null?'Pending':money(v)};
  price.series=[line('Median',days.map(d=>d.status==='complete'?d.moments.median:null),palette.olive),line('Average',days.map(d=>d.status==='complete'?d.moments.average:null),palette.muted,true)];charts.price.setOption(price,true);
  $('locked-total').textContent=summary.count?compact(completed.reduce((s,d)=>s+d.locked,0)):'—';$('unlocked-total').textContent=summary.count?compact(completed.reduce((s,d)=>s+d.unlocked,0)):'—';
  const locks=base(days);locks.tooltip={...tooltip,valueFormatter:v=>v==null?'Pending':number(v)};
  locks.series=['locked','unlocked'].map((k,i)=>({name:i?'Unlocks':'Locks',type:'bar',barMaxWidth:12,data:days.map(d=>d.status==='complete'?d[k]:null),itemStyle:{color:i?palette.muted:palette.olive,borderRadius:[2,2,0,0]}}));charts.locks.setOption(locks,true);
  const visible=days.toReversed?days.toReversed():[...days].reverse();
  $('ledger-body').replaceChildren(...(showAll?visible:visible.slice(0,7)).map(d=>{const v=values(d,asset),row=document.createElement('tr');row.innerHTML=`<td>${shortDate(d.date)}, ${d.date.slice(0,4)}</td><td>${v?money(v.volume):'—'}</td><td>${v?number(v.sales):'—'}</td><td>${v?number(v.active):'—'}</td><td>${v?money(v.average):'—'}</td><td><span class="row-status ${v?'':'pending'}">${v?'COMPLETE':'PENDING'}</span></td>`;return row;}));
  $('ledger-count').textContent=`${days.length} DAYS`;$('show-more').hidden=showAll||days.length<=7;
}
function setRange(value) {
  range=value;const end=data.throughDate;$('date-to').value=end;$('date-from').value=value==='all'?data.startDate:[data.startDate,subtractDays(end,Number(value)-1)].sort().at(-1);
  document.querySelectorAll('[data-range]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.range===value)));showAll=false;render();
}
document.querySelectorAll('[data-asset]').forEach(b=>b.addEventListener('click',()=>{asset=b.dataset.asset;document.querySelectorAll('[data-asset]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();}));
document.querySelectorAll('[data-range]').forEach(b=>b.addEventListener('click',()=>{if(data)setRange(b.dataset.range);}));
document.querySelectorAll('[data-metric]').forEach(b=>b.addEventListener('click',()=>{metric=b.dataset.metric;document.querySelectorAll('[data-metric]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();}));
['date-from','date-to'].forEach(id=>$(id).addEventListener('change',()=>{if(!data)return;const input=$(id);if(!input.value)return;input.value=[data.startDate,input.value,data.throughDate].sort()[1];if($('date-from').value>$('date-to').value){$(id==='date-from'?'date-to':'date-from').value=input.value;}document.querySelectorAll('[data-range]').forEach(b=>b.setAttribute('aria-pressed','false'));showAll=false;render();}));
$('show-more').addEventListener('click',()=>{showAll=true;render();});
$('download').addEventListener('click',()=>{if(!data)return;const blob=new Blob([csvFor(selectedDays(),asset)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`back-to-the-top_${asset}_${$('date-from').value}_${$('date-to').value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('methodology').addEventListener('click',()=>$('methods').showModal());$('close-methods').addEventListener('click',()=>$('methods').close());$('methods').addEventListener('click',e=>{if(e.target===$('methods')){const r=$('methods').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('methods').close();}});
new ResizeObserver(()=>Object.values(charts).forEach(c=>c.resize())).observe(document.querySelector('.shell'));
async function load(){try{const response=await fetch('./data/daily.json',{cache:'no-cache'});if(!response.ok)throw new Error('Data unavailable');data=await response.json();if(!Array.isArray(data.days)||data.schemaVersion!==1)throw new Error('Unsupported data');for(const id of ['date-from','date-to']){$(id).max=data.throughDate;$(id).min=data.startDate;}$('sync-status').textContent=data.throughDate<lastClosedDay()?'UPDATE DELAYED':data.completedDays===data.totalDays?'DAILY DATA / UPDATED':`BACKFILL / ${data.completedDays} OF ${data.totalDays}`;$('asof-date').textContent=`${data.latestCompleteDate?shortDate(data.latestCompleteDate)+' close':'Awaiting first daily close'} · EST / UTC−5`;setRange(range);}catch(error){$('sync-status').textContent='DATA UNAVAILABLE';$('notice').hidden=false;$('notice').textContent='Daily data could not be loaded. Please refresh to try again.';console.error(error);}}
load();
