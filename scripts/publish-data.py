"""Publish only aggregated public-chain metrics, then verify the hosted snapshot."""
import json
import os
from pathlib import Path
import sys
import urllib.request


def publish(config):
    origin = config['SITE_URL'].rstrip('/')
    if origin != 'https://back-to-the-top-han.han110656.chatgpt.site':
        raise ValueError('Unexpected publishing destination')
    body = Path('public/data/daily.json').read_bytes()
    data = json.loads(body)
    headers = {'Content-Type':'application/json','Authorization':'Bearer '+config['DATA_WRITE_KEY'],
               'OAI-Sites-Authorization':'Bearer '+config['SITES_SERVICE_TOKEN']}
    request = urllib.request.Request(origin+'/api/data',data=body,headers=headers,method='POST')
    with urllib.request.urlopen(request,timeout=60) as response:
        receipt=json.load(response)
    request=urllib.request.Request(origin+'/data/daily.json?verify='+data['generatedAt'],headers={'OAI-Sites-Authorization':headers['OAI-Sites-Authorization']})
    with urllib.request.urlopen(request,timeout=60) as response:
        hosted=json.load(response)
    if hosted != data:
        raise RuntimeError('Hosted data differs from the published snapshot')
    print(f"Verified hosted data: {receipt['completedDays']} complete days through {receipt['throughDate']}")

if __name__=='__main__':
    if '--stdin-credentials' in sys.argv:
        import termios
        if sys.stdin.isatty():
            settings=termios.tcgetattr(sys.stdin);settings[3]&=~termios.ECHO;termios.tcsetattr(sys.stdin,termios.TCSANOW,settings)
        print('Ready for publishing credentials on stdin (hidden)',flush=True)
        config=json.loads(sys.stdin.readline())
    else:
        config={k:os.environ[k] for k in ('SITE_URL','DATA_WRITE_KEY','SITES_SERVICE_TOKEN')}
    publish(config)
