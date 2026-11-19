"""NBA statistics for explicitly configured Wheel slots; no official eligibility inference."""
import argparse
from datetime import datetime, timezone, timedelta
import json
import math
from pathlib import Path
import time

METRICS = {'STL': ('steals',), 'PRA': ('points','reboundsTotal','assists'),
           'FGM': ('fieldGoalsMade',), 'PTS': ('points',), 'PMP': ('plusMinusPoints',),
           'AR': ('assists','reboundsTotal'), 'AST': ('assists',), 'FTM': ('freeThrowsMade',)}


def rank(games, metric):
    rows=[]
    for game in games:
        if game['gameStatus'] not in (2,3):
            continue
        for side in ('homeTeam','awayTeam'):
            for p in game[side]['players']:
                if str(p.get('played')) != '1':
                    continue
                values=[p['statistics'][k] for k in METRICS[metric]]
                if any(not isinstance(v,(int,float)) or not math.isfinite(v) for v in values):
                    raise ValueError('Invalid statistics')
                rows.append({'playerId':p['personId'],'name':p['name'], 'team':game[side]['teamTricode'],
                             'gameId':game['gameId'],'value':sum(values),'gameStatus':game['gameStatus'],
                             'game':{'home':game['homeTeam']['teamTricode'],'away':game['awayTeam']['teamTricode'],
                                     'homeScore':game['homeTeam'].get('score'),'awayScore':game['awayTeam'].get('score'),
                                     'period':game.get('period'),'clock':game.get('gameClock'),'statusText':game.get('gameStatusText')}})
    rows.sort(key=lambda p:(-p['value'],p['playerId'],p['gameId']))
    last=None
    for i,row in enumerate(rows):
        if row['value']!=last:
            position=i+1
        last=row['value'];row['rank']=position
    return rows


def final_time(game):
    if game['gameStatus']!=3:return None
    # NBA's start time plus elapsed game duration also covers historical finals.
    duration=game.get('duration')
    if isinstance(duration,(int,float)) and math.isfinite(duration) and duration>0:
        try:
            start=datetime.fromisoformat(game['gameTimeUTC'].replace('Z','+00:00'))
            if start.tzinfo is not None:return (start+timedelta(minutes=duration)).astimezone(timezone.utc).isoformat()
        except (KeyError,ValueError,TypeError):pass
    return game.get('finalObservedAt')


def build(config, games, date_ids, now):
    slots=[]
    for definition in config['slots']:
        ids=[gid for date in definition['dates'] for gid in date_ids.get(date,[])]
        if not ids:
            raise ValueError('No scheduled games found for configured slot')
        missing=[gid for gid in ids if gid not in games]
        if missing:
            raise ValueError('Incomplete game coverage')
        selected=[games[gid] for gid in ids]
        expected=definition.get('expectedQualifiers',1)
        if not isinstance(expected,int) or expected<1:raise ValueError('Invalid qualifier count')
        rows=rank(selected,definition['metric'])
        qualifiers=sum(r['rank']<=expected for r in rows)
        rows=rows[:max(expected*3,5,qualifiers,len(definition.get('officialPlayers',[])))]
        completed=[final_time(g) for g in selected]
        completed_at=max(completed) if all(completed) and all(g['gameStatus']==3 for g in selected) else None
        game_rows=[{'id':g['gameId'],'date':date,'startAt':g.get('gameDateTimeUTC') or g.get('gameTimeUTC'),
                    'status':g['gameStatus'],'statusText':g.get('gameStatusText'),
                    'home':g['homeTeam']['teamTricode'],'away':g['awayTeam']['teamTricode'],
                    'homeScore':g['homeTeam'].get('score'),'awayScore':g['awayTeam'].get('score'),
                    'period':g.get('period'),'clock':g.get('gameClock')}
                   for date in definition['dates'] for gid in date_ids.get(date,[]) for g in [games[gid]]]
        slots.append({**definition,'completedAt':completed_at,'gameDetails':game_rows,'expectedQualifiers':expected,'games':len(ids),'finishedGames':sum(g['gameStatus']==3 for g in selected),
                      'liveGames':sum(g['gameStatus']==2 for g in selected),
                      'rankings':rows})
    return {'schemaVersion':1,'generatedAt':now,'title':config['title'],'source':config['source'],
            'qualification':config['qualification'],'aggregation':config.get('aggregation','Highest single-game value. Weekend aggregation is provisional pending full official rules.'),
            'throughDate':max(d for s in config['slots'] for d in s['dates']),'slots':slots,
            'nextGameAt':min((g['gameDateTimeUTC'] for g in games.values() if g['gameStatus']==1 and g.get('gameDateTimeUTC')),default=None)}


def main():
    import requests
    from nba_api.live.nba.endpoints import boxscore
    from nba_api.live.nba.library.http import STATS_HEADERS
    parser=argparse.ArgumentParser();parser.add_argument('--output',default='.cache/challenge/latest.json');args=parser.parse_args()
    config=json.loads(Path('collector/wheel.json').read_text())
    schedule=requests.get('https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json',headers=STATS_HEADERS,timeout=30)
    schedule.raise_for_status()
    wanted={d for s in config['slots'] for d in s['dates']};date_ids={};games={}
    cache=Path('.cache/challenge/games');cache.mkdir(parents=True,exist_ok=True)
    for date in schedule.json()['leagueSchedule']['gameDates']:
        key=datetime.strptime(date['gameDate'][:10],'%m/%d/%Y').date().isoformat()
        if key not in wanted:continue
        date_ids[key]=[g['gameId'] for g in date['games']]
        for item in date['games']:
            gid=item['gameId']
            if len(gid)!=10 or not gid.isdigit():raise ValueError('Invalid game ID')
            if item['gameStatus']==1:
                games[gid]={**item,'homeTeam':{**item['homeTeam'],'players':[]},'awayTeam':{**item['awayTeam'],'players':[]}}
                continue
            cached=cache/f'{gid}.json';game=None;previous=None
            # Finished games are rechecked daily for NBA statistical corrections.
            if cached.exists():
                previous=json.loads(cached.read_text())
                if previous['gameStatus']==3:
                    previous.setdefault('finalObservedAt',datetime.fromtimestamp(cached.stat().st_mtime,timezone.utc).isoformat())
                    if time.time()-cached.stat().st_mtime<86400:game=previous
            if game is None:
                game=boxscore.BoxScore(game_id=gid,timeout=30).get_dict()['game']
                if game['gameId']!=gid:raise ValueError('Wrong game returned')
                if game['gameStatus']==3:
                    game['finalObservedAt']=(previous or {}).get('finalObservedAt') or datetime.now(timezone.utc).isoformat()
                cached.write_text(json.dumps(game))
            game['gameDateTimeUTC']=item.get('gameDateTimeUTC') or game.get('gameTimeUTC')
            games[gid]=game
    now=datetime.now(timezone.utc).isoformat()
    result=build(config,games,date_ids,now)
    out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True)
    temporary=out.with_suffix('.tmp');temporary.write_text(json.dumps(result,ensure_ascii=False));temporary.replace(out)
    print(f"Built {len(result['slots'])} slots from {len(games)} games at {now}")


if __name__=='__main__':main()
