"""Daily Moment revenue by Set and player; reconcile to the chain totals before writing."""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
import json
from pathlib import Path
import subprocess
import time
import unicodedata
import re

from collector.scan import Flow, USD, asset_for, resolve_offer_currency, atomic_json, build_dataset, decode

METADATA_URL = 'https://api.production.atlas.dapperlabs.com/public/atlas.v1.NFTService/GetNFTs'
VERSION = 1


def sale_rows(events, flow):
    rows = []
    for event in events:
        kind, fields = event['kind'], event['data']
        if kind not in ('listing', 'offer', 'legacy') or asset_for(event) != 'moments':
            continue
        if kind != 'legacy' and fields.get('purchased') is not True:
            continue
        vault = fields.get('resolvedPaymentVaultType') or fields.get('salePaymentVaultType') or fields.get('paymentVaultType')
        if kind == 'offer' and vault not in USD:
            vault = resolve_offer_currency(event, flow.get('/transaction_results/'+event['tx'])['events'])
        if kind != 'legacy' and vault not in USD:
            continue
        price = fields.get('salePrice') if kind == 'listing' else fields.get('offerAmount') if kind == 'offer' else fields.get('price')
        moment = fields.get('nftID') or fields.get('nftId') or fields.get('id')
        if moment is None or price is None or not Decimal(price).is_finite() or Decimal(price) < 0:
            raise ValueError('Invalid sale identity or price')
        rows.append({'momentId': str(moment), 'price': price, 'source': kind})
    return rows


def extract_sales(day, flow):
    jobs = [(kind, h, min(h+249, day['endHeight'])) for kind in ('listing', 'offer', 'legacy')
            for h in range(day['startHeight'], day['endHeight']+1, 250)]
    with ThreadPoolExecutor(flow.workers) as pool:
        events = [event for batch in pool.map(flow.events, jobs) for event in batch]
    return sale_rows(events, flow)


def compact_metadata(nft):
    edition = nft.get('edition') or {}
    group = edition.get('set') or {}
    player = (edition.get('editionTemplate') or {}).get('metadata') or {}
    return {'setId': str(group.get('id') or edition.get('setId') or ''),
            'setName': group.get('name') or '',
            'seriesName': 'Series '+str(edition['seriesId']) if edition.get('seriesId') else '',
            'playerId': player.get('FullName') or '',
            'playerName': player.get('FullName') or ''}


def fetch_metadata(ids):
    body = json.dumps({'product': 'nba', 'nftIds': ids})
    for attempt in range(5):
        try:
            response = subprocess.run(['curl', '-fsSL', '--max-time', '60', METADATA_URL,
                '-H', 'Content-Type: application/json', '-H', 'Connect-Protocol-Version: 1',
                '-H', 'User-Agent: BackToTheTop/1.0 (github.com/hellohanchen/back-to-the-top)',
                '--data-binary', '@-'], input=body, text=True, capture_output=True, check=True)
            payload = json.loads(response.stdout)
            if not isinstance(payload.get('nfts'), list):
                raise ValueError('Invalid NFT response')
            found = {str(nft['id']): compact_metadata(nft) for nft in payload['nfts']}
            if set(found)-set(ids):
                raise ValueError('Unexpected NFT metadata identity')
            return {mid: found.get(mid, {}) for mid in ids}
        except (subprocess.SubprocessError, ValueError, KeyError) as error:
            if attempt == 4:
                detail = str(error) if not isinstance(error, subprocess.CalledProcessError) else error.stderr.strip()
                raise RuntimeError('Public Top Shot metadata lookup failed; no partial day published: '+detail) from None
            time.sleep(2**attempt)



def chain_metadata(pairs):
    expressions = []
    for play, group in pairs:
        if not str(play).isdigit() or not str(group).isdigit():
            raise ValueError('Invalid chain identity')
        expressions.append(f'[TopShot.getPlayMetaDataByField(playID: {play}, field: "FullName") ?? "", TopShot.getSetName(setID: {group}) ?? "", (TopShot.getSetSeries(setID: {group}) ?? 0).toString()]')
    script = 'import TopShot from 0x0b2a3299cc857e29\naccess(all) fun main(): [[String]] { return ['+', '.join(expressions)+'] }'
    body = json.dumps({'script': base64.b64encode(script.encode()).decode(), 'arguments': []})
    response = subprocess.run(['curl', '-fsSL', '--retry', '3', '--max-time', '60',
        'https://rest-mainnet.onflow.org/v1/scripts?block_height=sealed', '-H', 'Content-Type: application/json',
        '--data-binary', '@-'], input=body, text=True, capture_output=True, check=True)
    rows = decode(json.loads(base64.b64decode(json.loads(response.stdout))))
    if len(rows) != len(pairs):
        raise ValueError('Incomplete chain metadata')
    return {str(play)+':'+str(group): {'setId': str(group), 'setName': values[1],
            'seriesName': 'Series '+values[2], 'playerId': values[0], 'playerName': values[0]}
            for (play, group), values in zip(pairs, rows)}


def index_day(day, flow):
    jobs = [(kind, h, min(h+249, day['endHeight'])) for kind in ('moment_minted', 'moment_destroyed')
            for h in range(day['startHeight'], day['endHeight']+1, 250)]
    result = {}
    with ThreadPoolExecutor(flow.workers) as pool:
        for batch in pool.map(flow.events, jobs):
            for event in batch:
                fields = event['data']
                mid = fields.get('momentID') or fields.get('id')
                if mid and fields.get('playID') and fields.get('setID'):
                    result[str(mid)] = [fields['playID'], fields['setID']]
    return result


def canonical_players(metadata, cache):
    path = cache/'player-aliases.json'
    aliases = json.loads(path.read_text()) if path.exists() else {}
    def rpc(method, body):
        response = subprocess.run(['curl', '-fsSL', '--retry', '3', '--max-time', '60',
            'https://api.production.atlas.dapperlabs.com/public/atlas.v1.PlayerService/'+method,
            '-H', 'Content-Type: application/json', '-H', 'Connect-Protocol-Version: 1',
            '-H', 'User-Agent: BackToTheTop/1.0 (github.com/hellohanchen/back-to-the-top)',
            '--data-binary', '@-'], input=json.dumps(body), text=True, capture_output=True, check=True)
        return json.loads(response.stdout)
    def normalized(name):
        return ''.join(c for c in unicodedata.normalize('NFKD', name).casefold() if not unicodedata.combining(c))
    names = {m['playerName'] for m in metadata.values() if m.get('playerName')}
    missing = names-aliases.keys()
    if missing:
        players = rpc('GetAllPlayers', {'product':'nba'})['players']
        by_name = {normalized(p['playerName']): p['playerName'] for p in players}
        by_id = {p['playerId']: p['playerName'] for p in players if p.get('playerId')}
        for name in sorted(missing):
            canonical = by_name.get(normalized(name))
            if not canonical:
                try:
                    player = rpc('GetPlayer', {'product':'nba', 'playerName':name}).get('player', {}).get('player', {})
                    canonical = by_id.get(player.get('playerId'))
                except subprocess.CalledProcessError:
                    # A historic name with no current player record is retained, never discarded.
                    canonical = None
            aliases[name] = canonical or name
        atomic_json(path, aliases)
    return {mid: {**info, 'playerName': aliases.get(info.get('playerName'), ''),
                  'playerId': aliases.get(info.get('playerName'), '')} for mid, info in metadata.items()}

def canonical_sets(metadata, cache):
    path = cache/'series.json'
    if path.exists():
        series = json.loads(path.read_text())
    else:
        response = subprocess.run(['curl', '-fsSL', '--retry', '3', '--max-time', '60',
            'https://api.production.atlas.dapperlabs.com/public/atlas.v1.SeriesService/GetAllSeries',
            '-H', 'Content-Type: application/json', '-H', 'Connect-Protocol-Version: 1',
            '-H', 'User-Agent: BackToTheTop/1.0 (github.com/hellohanchen/back-to-the-top)',
            '--data', '{"product":"nba"}'], text=True, capture_output=True, check=True)
        series = {str(row['id']): row['name'] for row in json.loads(response.stdout)['series']}
        atomic_json(path, series)
    for info in metadata.values():
        match = re.fullmatch(r'Series (\d+)', info.get('seriesName', ''))
        if match:
            info['seriesName'] = series.get(match[1], 'Set #'+info.get('setId', ''))
    return metadata


def summarize(rows, metadata, expected):
    total = sum((Decimal(str(r['price'])) for r in rows), Decimal(0))
    if len(rows) != expected['sales'] or total != Decimal(str(expected['volume'])):
        raise ValueError('Sales do not reconcile with published daily totals')
    for source in ('offer', 'listing', 'legacy'):
        subset = [r for r in rows if r['source'] == source]
        target = expected['sources'][source]
        if len(subset) != target['sales'] or sum((Decimal(str(r['price'])) for r in subset), Decimal(0)) != Decimal(str(target['volume'])):
            raise ValueError('Channel does not reconcile: '+source)
    grouped = {'sets': {}, 'players': {}}
    unresolved = {'sets': 0, 'players': 0}
    for row in rows:
        info = metadata.get(row['momentId'], {})
        for dimension, id_key, name_key in [('sets', 'setId', 'setName'), ('players', 'playerId', 'playerName')]:
            known = bool(info.get(id_key) and info.get(name_key))
            key = info[id_key] if known else 'unknown'
            if not known:
                unresolved[dimension] += 1
            label = info.get(name_key) if known else 'Unattributed'
            if dimension == 'sets' and known and info.get('seriesName'):
                label += ' · '+info['seriesName']
            entry = grouped[dimension].setdefault(key, {'id': key, 'name': label, 'volume': Decimal(0), 'sales': 0})
            entry['volume'] += Decimal(str(row['price']))
            entry['sales'] += 1
    result = {'version': VERSION, 'denominator': 'moments-usd-all-channels', 'volume': float(total),
              'sales': len(rows), 'quality': {'unattributedSetSales': unresolved['sets'], 'unattributedPlayerSales': unresolved['players']}}
    for dimension, groups in grouped.items():
        result[dimension] = [{**v, 'volume': float(v['volume'])}
                             for v in sorted(groups.values(), key=lambda v: (-v['volume'], v['id']))]
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=Path('public/data'))
    parser.add_argument('--cache', type=Path, default=Path('.cache/market-share'))
    parser.add_argument('--flow-cache', default='.cache/flow')
    parser.add_argument('--sales-dir', type=Path)
    parser.add_argument('--refresh-groups', action='store_true')
    args = parser.parse_args()
    path = args.cache/'metadata.json'
    metadata = json.loads(path.read_text()) if path.exists() else {}
    flow = Flow(args.flow_cache, 12)
    identities_path = args.cache/'chain-identities.json'
    identities = json.loads(identities_path.read_text()) if identities_path.exists() else {}
    pair_path = args.cache/'pairs.json'
    pair_meta = json.loads(pair_path.read_text()) if pair_path.exists() else {}
    for day_path in sorted((args.output/'days').glob('*.json')):
        day = json.loads(day_path.read_text())
        if day.get('status') != 'complete' or (not args.refresh_groups and day.get('marketShare', {}).get('version') == VERSION):
            continue
        sales_path = (args.sales_dir or args.cache/'sales')/day_path.name
        rows = json.loads(sales_path.read_text()) if sales_path.exists() else extract_sales(day, flow)
        atomic_json(sales_path, rows)
        ids = {r['momentId'] for r in rows}
        if not args.sales_dir:
            identities.update(index_day(day, flow))
            atomic_json(identities_path, identities)
        needed = {':'.join(map(str, identities[mid])): identities[mid] for mid in ids if mid in identities and mid not in metadata}
        missing_pairs = [value for key, value in needed.items() if key not in pair_meta]
        for start in range(0, len(missing_pairs), 100):
            pair_meta.update(chain_metadata(missing_pairs[start:start+100]))
            atomic_json(pair_path, pair_meta)
        for mid in ids:
            if mid not in metadata and mid in identities:
                metadata[mid] = pair_meta[':'.join(map(str, identities[mid]))]
        missing = sorted(ids-metadata.keys())
        batches = [missing[start:start+100] for start in range(0, len(missing), 100)]
        with ThreadPoolExecutor(3) as pool:
            for batch in pool.map(fetch_metadata, batches):
                metadata.update(batch)
                atomic_json(path, metadata)
        canonical = canonical_sets(canonical_players({mid: metadata[mid] for mid in ids}, args.cache), args.cache)
        day['marketShare'] = summarize(rows, canonical, day['moments'])
        atomic_json(day_path, day)
        print(day['date'], 'reconciled', len(rows), 'sales;', len(metadata), 'metadata cached', flush=True)
    build_dataset(args.output)


if __name__ == '__main__':
    main()
