"""Manually verify NBA live feeds on a cloud runner; never publish market data."""
from datetime import datetime, timezone
from importlib.metadata import version
import json
from pathlib import Path

from nba_api.live.nba.endpoints import scoreboard, boxscore, playbyplay


def main():
    output = Path('nba-probe-results')
    output.mkdir(exist_ok=True)
    board = scoreboard.ScoreBoard(timeout=30).get_dict()
    games = board['scoreboard']['games']
    assert isinstance(games, list) and len(games) <= 20
    summary = {'checkedAt': datetime.now(timezone.utc).isoformat(),
               'nbaApiVersion': version('nba_api'),
               'gameDate': board['scoreboard']['gameDate'],
               'scheduledGames': len(games), 'checkedGames': []}
    (output / 'scoreboard.json').write_text(json.dumps(board))
    for game in games:
        if game['gameStatus'] not in (2, 3):
            continue
        gid = game['gameId']
        assert len(gid) == 10 and gid.isdigit()
        box = boxscore.BoxScore(game_id=gid, timeout=30).get_dict()
        actions = playbyplay.PlayByPlay(game_id=gid, timeout=30).get_dict()
        assert box['game']['gameId'] == gid == actions['game']['gameId']
        players = box['game']['homeTeam']['players'] + box['game']['awayTeam']['players']
        assert players and isinstance(actions['game']['actions'], list)
        for player in players:
            if str(player.get('played')) != '1':
                continue
            for key in ('points', 'reboundsTotal', 'assists', 'steals', 'fieldGoalsMade', 'plusMinusPoints'):
                assert isinstance(player['statistics'][key], (int, float)), (gid, key)
        for label, data in [('boxscore', box), ('playbyplay', actions)]:
            (output / f'{label}-{gid}.json').write_text(json.dumps(data))
        summary['checkedGames'].append({'gameId': gid, 'status': box['game']['gameStatus'],
                                        'players': len(players), 'actions': len(actions['game']['actions'])})
    assert summary['checkedGames'], 'No started games available; live-feed verification is inconclusive'
    (output / 'summary.json').write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
