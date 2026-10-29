const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value)));

export function normalizeTournamentConfig(input = {}) {
  const playersPerHeat = clamp(input.playersPerHeat || 4, 2, 6);
  const advancePerHeat = clamp(input.advancePerHeat || 2, 1, playersPerHeat - 1);
  const finalPlayers = clamp(input.finalPlayers || 2, 2, 6);
  return {
    maxEntrants: clamp(input.maxEntrants || 32, 2, 128),
    playersPerHeat,
    advancePerHeat,
    finalPlayers,
    pointsToWin: clamp(input.pointsToWin || 5, 1, 99),
    maxParallel: clamp(input.maxParallel || 1, 1, 4),
    seeding: ['join', 'random', 'manual'].includes(input.seeding) ? input.seeding : 'random',
    allowSpectators: input.allowSpectators !== false,
    thirdPlaceMatch: Boolean(input.thirdPlaceMatch)
  };
}
export function seedEntrants(players, method = 'random', manualOrder = [], random = Math.random) {
  const entrants = players.filter(player => player.role !== 'organizer');
  if (method === 'manual') {
    const positions = new Map(manualOrder.map((id, index) => [id, index]));
    return [...entrants].sort((a, b) => (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.joinedAt - b.joinedAt);
  }
  if (method === 'join') return [...entrants].sort((a, b) => a.joinedAt - b.joinedAt);
  const shuffled = [...entrants];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const next = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[next]] = [shuffled[next], shuffled[index]];
  }
  return shuffled;
}

export function balancedGroups(ids, maximumSize) {
  if (ids.length <= maximumSize) return [ids.slice()];
  const groupCount = Math.ceil(ids.length / maximumSize);
  const baseSize = Math.floor(ids.length / groupCount);
  const largerGroups = ids.length % groupCount;
  const groups = [];
  let cursor = 0;
  for (let index = 0; index < groupCount; index++) {
    const size = baseSize + (index < largerGroups ? 1 : 0);
    groups.push(ids.slice(cursor, cursor + size)); cursor += size;
  }
  return groups;
}

export function createRound(playerIds, configInput, roundIndex = 0) {
  const config = normalizeTournamentConfig(configInput);
  const isFinal = playerIds.length <= config.finalPlayers;
  const groups = isFinal ? [playerIds.slice()] : balancedGroups(playerIds, config.playersPerHeat);
  const label = isFinal ? 'Championship' : `Round ${roundIndex + 1}`;
  return {
    id: `round-${roundIndex + 1}`,
    index: roundIndex,
    label,
    isFinal,
    status: 'active',
    matches: groups.map((ids, matchIndex) => ({
      id: `r${roundIndex + 1}-m${matchIndex + 1}`,
      label: isFinal ? 'Championship' : `Heat ${matchIndex + 1}`,
      arena: (matchIndex % config.maxParallel) + 1,
      playerIds: ids,
      advanceCount: isFinal ? 1 : Math.min(config.advancePerHeat, ids.length - 1),
      pointsToWin: config.pointsToWin,
      status: matchIndex < config.maxParallel ? 'ready' : 'queued',
      scores: Object.fromEntries(ids.map(id => [id, 0])),
      placements: [],
      winners: []
    }))
  };
}

export function createTournament(players, configInput, manualOrder = [], random = Math.random) {
  const config = normalizeTournamentConfig(configInput);
  const seeded = seedEntrants(players, config.seeding, manualOrder, random);
  if (seeded.length < 2) throw new Error('A tournament needs at least two entrants.');
  const firstRound = createRound(seeded.map(player => player.id), config, 0);
  return {
    config,
    status: 'running',
    startedAt: Date.now(),
    seededPlayerIds: seeded.map(player => player.id),
    activePlayerIds: seeded.map(player => player.id),
    eliminatedPlayerIds: [],
    championId: null,
    runnerUpId: null,
    rounds: [firstRound]
  };
}

export function rankMatch(match, scoresInput) {
  const scores = Object.fromEntries(match.playerIds.map(id => [id, clamp(scoresInput[id] ?? 0, 0, 999)]));
  const placements = [...match.playerIds].sort((a, b) => scores[b] - scores[a]);
  const cutoff = match.advanceCount;
  if (placements.length > cutoff && scores[placements[cutoff - 1]] === scores[placements[cutoff]]) {
    throw new Error('Resolve the tie at the advancement cutoff before completing this match.');
  }
  if (Math.max(...Object.values(scores)) < match.pointsToWin) {
    throw new Error(`At least one player must reach ${match.pointsToWin} points.`);
  }
  return { scores, placements, winners: placements.slice(0, cutoff) };
}

export function completeTournamentMatch(tournamentInput, matchId, scores) {
  const tournament = structuredClone(tournamentInput);
  const round = tournament.rounds.find(item => item.matches.some(match => match.id === matchId));
  if (!round || round.status !== 'active') throw new Error('That match is not active.');
  const match = round.matches.find(item => item.id === matchId);
  if (match.status === 'complete') throw new Error('That match is already complete.');
  Object.assign(match, rankMatch(match, scores), { status: 'complete', completedAt: Date.now() });

  const readyCount = round.matches.filter(item => item.status === 'ready' || item.status === 'playing').length;
  if (readyCount < tournament.config.maxParallel) {
    const nextQueued = round.matches.find(item => item.status === 'queued');
    if (nextQueued) nextQueued.status = 'ready';
  }
  if (round.matches.some(item => item.status !== 'complete')) return tournament;

  round.status = 'complete'; round.completedAt = Date.now();
  const advancing = round.matches.flatMap(item => item.winners);
  const eliminated = round.matches.flatMap(item => item.placements.filter(id => !item.winners.includes(id)));
  tournament.eliminatedPlayerIds.push(...eliminated);
  if (round.isFinal) {
    tournament.status = 'complete'; tournament.completedAt = Date.now();
    tournament.championId = round.matches[0].placements[0];
    tournament.runnerUpId = round.matches[0].placements[1] || null;
    tournament.activePlayerIds = [tournament.championId];
    return tournament;
  }
  tournament.activePlayerIds = advancing;
  const nextRound = createRound(advancing, tournament.config, tournament.rounds.length);
  if (nextRound.isFinal && tournament.config.thirdPlaceMatch) {
    const consolationPlayers = round.matches
      .flatMap(item => item.placements.slice(item.advanceCount))
      .slice(0, 2);
    if (consolationPlayers.length === 2) {
      nextRound.matches.push({
        id: `${nextRound.id}-third`, label: 'Third Place', arena: Math.min(2, tournament.config.maxParallel),
        playerIds: consolationPlayers, advanceCount: 1, pointsToWin: tournament.config.pointsToWin,
        status: tournament.config.maxParallel > 1 ? 'ready' : 'queued',
        scores: Object.fromEntries(consolationPlayers.map(id => [id, 0])), placements: [], winners: [], isPlacement: true
      });
    }
  }
  tournament.rounds.push(nextRound);
  return tournament;
}

export function tournamentProgress(tournament) {
  const matches = tournament?.rounds?.flatMap(round => round.matches) || [];
  return {
    completed: matches.filter(match => match.status === 'complete').length,
    total: matches.length,
    currentRound: tournament?.rounds?.find(round => round.status === 'active') || null
  };
}
