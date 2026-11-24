import unittest
from collector.challenge import rank,build,final_time

def game(points=10):
    def p(i):return {'personId':i,'name':str(i),'played':'1','statistics':{'points':points,'reboundsTotal':3,'assists':4,'plusMinusPoints':-5}}
    return {'gameId':'0022600241','gameStatus':3,'homeTeam':{'teamTricode':'BOS','players':[p(1)]},'awayTeam':{'teamTricode':'NYK','players':[p(2)]}}

class ChallengeTests(unittest.TestCase):
    def test_ties_and_combination(self):
        rows=rank([game()],'PRA');self.assertEqual([r['rank'] for r in rows],[1,1]);self.assertEqual(rows[0]['value'],17)
    def test_negative_plusminus(self):self.assertEqual(rank([game()],'PMP')[0]['value'],-5)
    def test_exclude_dnp(self):
        g=game();g['homeTeam']['players'][0]['played']='0';self.assertEqual(len(rank([g],'PTS')),1)
    def test_missing_game_rejects_partial_data(self):
        with self.assertRaises(ValueError):build({'slots':[{'dates':['2026-11-15']}]},{},{'2026-11-15':['x']},'now')
    def test_single_game_not_multi_game_sum(self):
        rows=rank([game(10),game(11)],'PTS');self.assertEqual(rows[0]['value'],11)

    def test_nonfinite_rejected(self):
        with self.assertRaises(ValueError):rank([game(float('nan'))],'PTS')

    def test_upcoming_game_has_no_rankings(self):
        g=game();g['gameStatus']=1;self.assertEqual(rank([g],'PTS'),[])

    def test_assists_and_free_throws_use_distinct_live_boxscore_fields(self):
        g=game()
        g['homeTeam']['players'][0]['statistics'].update(assists=12,freeThrowsMade=2)
        g['awayTeam']['players'][0]['statistics'].update(assists=3,freeThrowsMade=9)
        self.assertEqual(rank([g],'AST')[0]['playerId'],1)
        self.assertEqual(rank([g],'AST')[0]['value'],12)
        self.assertEqual(rank([g],'FTM')[0]['playerId'],2)
        self.assertEqual(rank([g],'FTM')[0]['value'],9)

    def test_refresh_schedule_metadata(self):
        config={'title':'Wheel','source':'NBA','qualification':'Lock','slots':[{'dates':['2026-11-17'],'metric':'PTS'}]}
        live=game();live['gameStatus']=2
        future=game();future.update(gameId='0022600242',gameStatus=1,gameDateTimeUTC='2026-11-18T00:00:00Z')
        data=build(config,{'a':live,'b':future},{'2026-11-17':['a','b']},'now')
        self.assertEqual(data['slots'][0]['liveGames'],1)
        self.assertEqual(data['nextGameAt'],'2026-11-18T00:00:00Z')
        future['gameStatus']=3;live['gameStatus']=3
        data=build(config,{'a':live,'b':future},{'2026-11-17':['a','b']},'now')
        self.assertEqual(data['slots'][0]['liveGames'],0)
        self.assertIsNone(data['nextGameAt'])

    def test_games_cover_future_and_completed_days_and_wait_for_last_final(self):
        config={'title':'Wheel','source':'NBA','qualification':'Lock','slots':[{'dates':['2026-11-17','2026-11-18'],'metric':'PTS'}]}
        a=game();a.update(finalObservedAt='2026-11-18T03:00:00+00:00')
        b=game();b.update(gameId='0022600242',gameStatus=1,gameDateTimeUTC='2026-11-19T01:00:00Z')
        b['homeTeam']['score']=0;b['awayTeam']['score']=0
        def result():return build(config,{'a':a,'b':b},{'2026-11-17':['a'],'2026-11-18':['b']},'now')['slots'][0]
        self.assertIsNone(result()['completedAt'])
        self.assertEqual(len(result()['gameDetails']),2)
        self.assertEqual(result()['gameDetails'][1]['startAt'],'2026-11-19T01:00:00Z')
        b.update(gameStatus=3,finalObservedAt='2026-11-19T03:00:00+00:00')
        self.assertEqual(result()['completedAt'],b['finalObservedAt'])
        del b['finalObservedAt'];self.assertIsNone(result()['completedAt'])

    def test_historical_final_uses_nba_start_and_duration(self):
        g=game();g.update(gameTimeUTC='2026-11-17T01:00:00Z',duration=140)
        self.assertEqual(final_time(g),'2026-11-17T03:20:00+00:00')
        g['gameStatus']=2;self.assertIsNone(final_time(g))
        g.update(gameStatus=3,duration=None,finalObservedAt='2026-11-17T03:25:00+00:00')
        self.assertEqual(final_time(g),g['finalObservedAt'])

    def test_defensive_metrics_choose_correct_leaders(self):
        g=game()
        g['homeTeam']['players'][0]['statistics'].update(steals=5,blocks=1)
        g['awayTeam']['players'][0]['statistics'].update(steals=0,blocks=4)
        self.assertEqual(rank([g],'SB')[0]['playerId'],1)
        self.assertEqual(rank([g],'SB')[0]['value'],6)
        self.assertEqual(rank([g],'BLK')[0]['playerId'],2)
        self.assertEqual(rank([g],'BLK')[0]['value'],4)
        self.assertEqual(rank([g],'AR')[0]['value'],7)
