export function windowDates(days, preset = '7', start, end) {
  if (!days.length) return [];
  const last = days.at(-1).date;
  if (preset !== 'custom') return preset === 'all' ? days : days.slice(-Number(preset));
  const lo = start || days[0].date, hi = end || last;
  return days.filter(d => d.date >= (lo < hi ? lo : hi) && d.date <= (lo < hi ? hi : lo));
}
