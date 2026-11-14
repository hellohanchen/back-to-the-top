import sys,json,gzip,hashlib,base64
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,str(Path.cwd()))
from collector.scan import Flow,aggregate,resolve_offer_currency,USD,atomic_json
flow=Flow('.cache/flow',16)
def cached(path,cache=True):
 p=flow.cache/(hashlib.sha256(path.encode()).hexdigest()+'.json.gz')
 with gzip.open(p,'rt') as f:return json.load(f)
flow.get=cached
highest = {}
for p in sorted(Path('public/data/days').glob('*.json')):
 d=json.loads(p.read_text())
 jobs=[(k,h,min(h+249,d['endHeight'])) for k in ('listing','offer','legacy') for h in range(d['startHeight'],d['endHeight']+1,250)]
 events=[]
 with ThreadPoolExecutor(12) as pool:
  for batch in pool.map(flow.events,jobs):events.extend(batch)
 for e in events:
  if e['kind']=='offer' and e['data'].get('purchased') and e['data'].get('paymentVaultType') not in USD:
   e['data']['resolvedPaymentVaultType']=resolve_offer_currency(e,cached('/transaction_results/'+e['tx'])['events'])
 result=aggregate(events)
 assert result['moments']['highest']==d['moments']['highest'],p
 highest[d['date']]=result['moments']['highestSale']
 print(p.stem,flush=True)
atomic_json(Path('public/data/top-sales.json'),highest)
