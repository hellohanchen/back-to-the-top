export function monthCells(month, days) {
 const [year,m]=month.split('-').map(Number);
 const first=new Date(Date.UTC(year,m-1,1));
 const count=new Date(Date.UTC(year,m,0)).getUTCDate();
 const rows=new Map(days.map(d=>[d.date,d]));
 return [...Array(first.getUTCDay()).fill(null),...Array.from({length:count},(_,i)=>{const date=`${month}-${String(i+1).padStart(2,'0')}`;return {date,day:i+1,row:rows.get(date)};})];
}
