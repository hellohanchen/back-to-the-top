"""Provision or publish the tracker through the configured Cloudflare GitHub secret."""
import argparse,json,os,time,urllib.request,urllib.error,subprocess
from pathlib import Path
ACCOUNT='27818ba6b2d932ab7e07af03c9e94427'
PROJECT='back-to-the-top'
TITLE='back-to-the-top-challenge'
BASE=f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}'


def api(path,method='GET',data=None,raw=False):
    token=os.environ['CLOUDFLARE_API_TOKEN']
    body=data if raw else (json.dumps(data).encode() if data is not None else None)
    request=urllib.request.Request(BASE+path,data=body,method=method,headers={
        'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(request,timeout=30) as r:
            result=json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'Cloudflare request failed: HTTP {e.code}; check Pages Edit and Workers KV Storage Edit permissions') from None
    if not result.get('success'):raise RuntimeError('Cloudflare API did not confirm success')
    return result['result']


def namespace():
    for page in range(1,21):
        items=api(f'/storage/kv/namespaces?per_page=100&page={page}')
        for item in items:
            if item['title']==TITLE:return item['id']
        if len(items)<100:return None
    raise RuntimeError('Namespace listing exceeded safety bound')


def validate_snapshot(body, config):
    data=json.loads(body)
    expected=config['slots']
    slots=data.get('slots', [])
    if data.get('schemaVersion')!=1 or len(body)>=1_000_000 or not expected or len(slots)!=len(expected):
        raise ValueError('Invalid tracker snapshot size, schema or slot count')
    for actual, configured in zip(slots, expected):
        for key in ('id', 'dates', 'metric'):
            if actual.get(key)!=configured[key]:
                raise ValueError(f'Tracker snapshot does not match current wheel: {key}')
    return data


def main():
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['setup','publish']);a=p.parse_args()
    ns=namespace()
    if a.mode=='setup':
        if ns is None:ns=api('/storage/kv/namespaces','POST',{'title':TITLE})['id']
        project=api(f'/pages/projects/{PROJECT}')
        production=project['deployment_configs']['production']
        bindings={**production.get('kv_namespaces',{}),'TRACKER':{'namespace_id':ns}}
        api(f'/pages/projects/{PROJECT}','PATCH',{'deployment_configs':{'production':{'kv_namespaces':bindings}}})
        print('Tracker KV namespace and production Pages binding configured')
        return
    if ns is None:raise RuntimeError('Run storage setup before publishing')
    body=Path('.cache/challenge/latest.json').read_bytes()
    data=validate_snapshot(body,json.loads(Path('collector/wheel.json').read_text()))
    api(f'/storage/kv/namespaces/{ns}/values/latest','PUT',body,raw=True)
    for attempt in range(18):
        url=f'https://back-to-the-top.pages.dev/api/challenge?verify={time.time_ns()}'
        try:
            response=subprocess.run(['curl','--fail','--silent','--show-error','--max-time','20',url],capture_output=True,text=True,check=True)
            hosted=json.loads(response.stdout)
            hosted.pop('stale',None)
            if hosted==data:
                print('Published and anonymously verified all tracker snapshot fields');return
        except (urllib.error.URLError,ValueError,subprocess.CalledProcessError):pass
        time.sleep(10)
    raise RuntimeError('Published snapshot was not verified at the public endpoint')


if __name__=='__main__':main()
