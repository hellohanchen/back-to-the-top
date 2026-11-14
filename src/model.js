export function values(day, asset) {
  if (day.status !== 'complete') return null;
  if (asset !== 'all') return day[asset];
  const volume = day.moments.volume + day.packs.volume;
  const sales = day.moments.sales + day.packs.sales;
  return { volume, sales, average: sales ? volume / sales : 0, active: day.active, buyers: day.buyers, sellers: day.sellers,
    sources: Object.fromEntries(['listing','offer','legacy'].map(k => [k, {
      volume: day.moments.sources[k].volume + day.packs.sources[k].volume,
      sales: day.moments.sources[k].sales + day.packs.sources[k].sales,
    }])) };
}
export function summarize(days, asset) {
  const rows = days.map(d => values(d, asset)).filter(Boolean);
  const volume = rows.reduce((s,r) => s+r.volume,0);
  const sales = rows.reduce((s,r) => s+r.sales,0);
  return { count: rows.length, volume, sales, average: sales ? volume / sales : 0,
    active: rows.length ? rows.reduce((s,r) => s+r.active,0) / rows.length : null };
}
export function subtractDays(day, n) {
  const d = new Date(day+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()-n);
  return d.toISOString().slice(0,10);
}
export function csvFor(days, asset) {
  const header = ['date_EST','asset','status','volume_usd','sales','active_addresses','buyers','sellers','average_usd','moments_locked','moments_unlocked'];
  return [header.join(','), ...days.map(d => { const v=values(d,asset); return [d.date,asset,d.status,v?.volume??'',v?.sales??'',v?.active??'',v?.buyers??'',v?.sellers??'',v?.average?.toFixed(2)??'',d.locked??'',d.unlocked??''].join(','); })].join('\n');
}

export function lastClosedDay(now=new Date()) {
  const est=new Date(now.getTime()-5*60*60*1000);
  return subtractDays(est.toISOString().slice(0,10),1);
}
