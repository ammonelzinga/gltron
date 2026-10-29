import test from 'node:test';
import assert from 'node:assert/strict';
import { balancedGroups, completeTournamentMatch, createTournament, normalizeTournamentConfig } from '../src/tournament.js';

const players = count => Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, joinedAt: index, role: 'player' }));

test('balances seven entrants into four and three', () => {
  assert.deepEqual(balancedGroups(players(7).map(player => player.id), 4).map(group => group.length), [4, 3]);
});
test('avoids one-player heats for five entrants', () => {
  assert.deepEqual(balancedGroups(players(5).map(player => player.id), 4).map(group => group.length), [3, 2]);
});

test('runs the requested 7 -> 4 -> 2 -> champion progression', () => {
  let tournament = createTournament(players(7), { playersPerHeat: 4, advancePerHeat: 2, finalPlayers: 2, pointsToWin: 3, seeding: 'join' });
  assert.deepEqual(tournament.rounds[0].matches.map(match => match.playerIds.length), [4, 3]);
  for (const match of tournament.rounds[0].matches) {
    const scores = Object.fromEntries(match.playerIds.map((id, index) => [id, match.playerIds.length - index + 2]));
    tournament = completeTournamentMatch(tournament, match.id, scores);
  }
  assert.equal(tournament.activePlayerIds.length, 4);
  const semifinal = tournament.rounds[1].matches[0];
  tournament = completeTournamentMatch(tournament, semifinal.id, Object.fromEntries(semifinal.playerIds.map((id, index) => [id, 6 - index])));
  assert.equal(tournament.activePlayerIds.length, 2);
  assert.equal(tournament.rounds[2].isFinal, true);
  const final = tournament.rounds[2].matches[0];
  tournament = completeTournamentMatch(tournament, final.id, { [final.playerIds[0]]: 3, [final.playerIds[1]]: 1 });
  assert.equal(tournament.status, 'complete');
  assert.equal(tournament.championId, final.playerIds[0]);
});

test('requires ties at the advancement cutoff to be resolved', () => {
  const tournament = createTournament(players(4), { playersPerHeat: 4, advancePerHeat: 2, finalPlayers: 2, pointsToWin: 3, seeding: 'join' });
  const match = tournament.rounds[0].matches[0];
  assert.throws(() => completeTournamentMatch(tournament, match.id, { p1: 4, p2: 3, p3: 3, p4: 1 }), /Resolve the tie/);
});

test('clamps invalid tournament settings', () => {
  assert.deepEqual(normalizeTournamentConfig({ playersPerHeat: 20, advancePerHeat: 20, finalPlayers: 1 }).playersPerHeat, 6);
  assert.equal(normalizeTournamentConfig({ playersPerHeat: 3, advancePerHeat: 9 }).advancePerHeat, 2);
});

test('queues arenas above the parallel limit and promotes the next heat', () => {
  let tournament = createTournament(players(12), { playersPerHeat: 4, advancePerHeat: 2, finalPlayers: 2, maxParallel: 2, pointsToWin: 3, seeding: 'join' });
  assert.deepEqual(tournament.rounds[0].matches.map(match => match.status), ['ready', 'ready', 'queued']);
  const first = tournament.rounds[0].matches[0];
  tournament = completeTournamentMatch(tournament, first.id, Object.fromEntries(first.playerIds.map((id, index) => [id, 6 - index])));
  assert.deepEqual(tournament.rounds[0].matches.map(match => match.status), ['complete', 'ready', 'ready']);
});

test('adds and resolves a third-place match beside the championship', () => {
  let tournament = createTournament(players(8), { playersPerHeat: 4, advancePerHeat: 2, finalPlayers: 2, maxParallel: 2, pointsToWin: 3, thirdPlaceMatch: true, seeding: 'join' });
  while (!tournament.rounds.at(-1).isFinal) {
    const round = tournament.rounds.at(-1);
    for (const match of round.matches) {
      tournament = completeTournamentMatch(tournament, match.id, Object.fromEntries(match.playerIds.map((id, index) => [id, 8 - index])));
    }
  }
  const finalRound = tournament.rounds.at(-1);
  assert.deepEqual(finalRound.matches.map(match => match.label), ['Championship', 'Third Place']);
  for (const match of finalRound.matches) {
    tournament = completeTournamentMatch(tournament, match.id, Object.fromEntries(match.playerIds.map((id, index) => [id, 5 - index])));
  }
  assert.equal(tournament.status, 'complete');
  assert.ok(tournament.championId);
});
