const FORMAT_VALUES = ["single_elimination", "double_elimination", "round_robin", "swiss"];
const BEST_OF_VALUES = [1, 3, 5];
const MAX_PARTICIPANTS = 256;

function inputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function addPoolPlayRound(tournament, round) {
  tournament.settings.groups.forEach((group) => {
    const participants = tournament.participants.filter((participant) => group.participantIds.includes(participant.id));
    const games = roundRobinPairs(participants)[round - 1] || [];
    games.forEach(([player1Id, player2Id], position) => {
      const match = makeMatch(tournament, {
        stage: "group_stage",
        groupId: group.id,
        round,
        position: position + 1,
        player1Id,
        player2Id,
      });
      match.groupName = group.name;
      tournament.matches.push(match);
    });
  });
}

function addPoolPlay(tournament) {
  const groupCount = Math.max(2, Math.min(tournament.settings.groupCount, Math.floor(tournament.participants.length / 2)));
  const groups = Array.from({ length: groupCount }, (_, index) => ({
    id: `group-${index + 1}`,
    name: `Group ${index + 1}`,
    participantIds: [],
  }));
  tournament.settings.groups = groups;
  tournament.participants.forEach((participant, index) => {
    const cycle = Math.floor(index / groupCount);
    const groupIndex = cycle % 2 === 0 ? index % groupCount : groupCount - 1 - (index % groupCount);
    participant.groupId = groups[groupIndex].id;
    groups[groupIndex].participantIds.push(participant.id);
  });
  tournament.settings.poolPlayRounds = Math.max(...groups.map((group) =>
    roundRobinPairs(tournament.participants.filter((participant) => group.participantIds.includes(participant.id))).length));
  addPoolPlayRound(tournament, 1);
}

function createId() {
  return require("node:crypto").randomUUID();
}

function makeMatch(tournament, options) {
  return {
    id: createId(),
    stage: options.stage || "playoff",
    bracket: options.bracket || "main",
    groupId: options.groupId || null,
    round: options.round,
    position: options.position,
    player1Id: options.player1Id || null,
    player2Id: options.player2Id || null,
    source1: options.source1 || null,
    source2: options.source2 || null,
    score1: null,
    score2: null,
    winnerId: null,
    state: "scheduled",
    bestOf: tournament.settings.bestOf,
    scheduledTime: null,
    stationId: null,
  };
}

function seededOrder(size) {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const nextSize = seeds.length * 2;
    seeds = seeds.flatMap((seed) => [seed, nextSize + 1 - seed]);
  }
  return seeds;
}

function completeBye(match, participantId) {
  if (!participantId) return;
  match.winnerId = participantId;
  match.state = "completed";
  match.isBye = true;
}

function resolveEntrant(tournament, match, side, visiting = new Set()) {
  const playerId = match[`${side}Id`];
  if (playerId) return playerId;
  const source = match[`source${side.slice(-1)}`];
  if (!source || visiting.has(match.id)) return null;
  visiting.add(match.id);
  const sourceMatch = tournament.matches.find((item) => item.id === source.matchId);
  if (!sourceMatch) return null;
  return source.result === "loser"
    ? sourceMatch.winnerId === sourceMatch.player1Id
      ? sourceMatch.player2Id
      : sourceMatch.winnerId === sourceMatch.player2Id
        ? sourceMatch.player1Id
        : null
    : sourceMatch.winnerId;
}

function resolveSource(tournament, source) {
  if (!source) return null;
  const match = tournament.matches.find((item) => item.id === source.matchId);
  if (!match || !match.winnerId) return null;
  if (source.result !== "loser") return match.winnerId;
  if (match.winnerId === match.player1Id) return match.player2Id;
  if (match.winnerId === match.player2Id) return match.player1Id;
  return null;
}

function materializeMatch(tournament, match) {
  if (match.source1) match.player1Id = resolveSource(tournament, match.source1);
  if (match.source2) match.player2Id = resolveSource(tournament, match.source2);
  if (match.state !== "scheduled") return;
  const sourceIsReady = (source) => !source || tournament.matches.some((item) => item.id === source.matchId && item.state === "completed");
  if (!sourceIsReady(match.source1) || !sourceIsReady(match.source2)) return;
  if (match.player1Id && match.player2Id) return;
  if (match.player1Id || match.player2Id) completeBye(match, match.player1Id || match.player2Id);
}

function addEliminationBracket(tournament, bracket, entrants) {
  const size = 2 ** Math.ceil(Math.log2(entrants.length));
  const order = seededOrder(size);
  const slots = order.map((seed) => entrants[seed - 1]?.id || null);
  let previous = [];
  const roundCount = Math.log2(size);
  for (let round = 1; round <= roundCount; round += 1) {
    const matchCount = size / 2 ** round;
    const current = [];
    for (let position = 0; position < matchCount; position += 1) {
      const match = makeMatch(tournament, {
        bracket,
        round,
        position: position + 1,
        player1Id: round === 1 ? slots[position * 2] : null,
        player2Id: round === 1 ? slots[position * 2 + 1] : null,
        source1: round === 1 ? null : { matchId: previous[position * 2], result: "winner" },
        source2: round === 1 ? null : { matchId: previous[position * 2 + 1], result: "winner" },
      });
      tournament.matches.push(match);
      current.push(match.id);
      if (round === 1 && Boolean(match.player1Id) !== Boolean(match.player2Id)) {
        completeBye(match, match.player1Id || match.player2Id);
      }
    }
    previous = current;
  }
  return { rounds: roundCount, finalId: previous[0] };
}

function addDoubleElimination(tournament) {
  const winners = addEliminationBracket(tournament, "winners", tournament.participants);
  const winnerRounds = [];
  for (let round = 1; round <= winners.rounds; round += 1) {
    winnerRounds.push(tournament.matches.filter((match) => match.bracket === "winners" && match.round === round));
  }
  let lowerSources = [];
  let lowerRound = 1;
  const firstLosers = winnerRounds[0].map((match) => ({ matchId: match.id, result: "loser" }));
  for (let i = 0; i < firstLosers.length; i += 2) {
    const match = makeMatch(tournament, {
      bracket: "losers",
      round: lowerRound,
      position: i / 2 + 1,
      source1: firstLosers[i],
      source2: firstLosers[i + 1] || null,
    });
    tournament.matches.push(match);
    if (!firstLosers[i + 1]) materializeMatch(tournament, match);
    lowerSources.push(match.id);
  }

  for (let round = 2; round <= winners.rounds; round += 1) {
    const drops = winnerRounds[round - 1].map((match) => ({ matchId: match.id, result: "loser" }));
    const crossMatches = [];
    for (let index = 0; index < drops.length; index += 1) {
      const match = makeMatch(tournament, {
        bracket: "losers",
        round: lowerRound + 1,
        position: index + 1,
        source1: lowerSources[index] ? { matchId: lowerSources[index], result: "winner" } : null,
        source2: drops[index] || null,
      });
      tournament.matches.push(match);
      crossMatches.push(match.id);
    }
    lowerRound += 1;
    if (round < winners.rounds) {
      const reduced = [];
      for (let index = 0; index < crossMatches.length; index += 2) {
        const match = makeMatch(tournament, {
          bracket: "losers",
          round: lowerRound + 1,
          position: index / 2 + 1,
          source1: { matchId: crossMatches[index], result: "winner" },
          source2: crossMatches[index + 1]
            ? { matchId: crossMatches[index + 1], result: "winner" }
            : null,
        });
        tournament.matches.push(match);
        reduced.push(match.id);
      }
      lowerSources = reduced;
      lowerRound += 1;
    } else {
      lowerSources = crossMatches;
    }
  }

  const final = makeMatch(tournament, {
    bracket: "finals",
    round: lowerRound + 1,
    position: 1,
    source1: { matchId: winners.finalId, result: "winner" },
    source2: lowerSources.length
      ? { matchId: lowerSources[0], result: "winner" }
      : null,
  });
  tournament.matches.push(final);
  tournament.settings.grandFinalId = final.id;
  if (tournament.settings.consolation && tournament.participants.length >= 4) {
    const semifinalRound = winners.rounds - 1;
    const semifinals = winnerRounds[semifinalRound - 1] || [];
    if (semifinals.length === 2) {
      const thirdPlace = makeMatch(tournament, {
        bracket: "placement",
        round: 1,
        position: 1,
        source1: { matchId: semifinals[0].id, result: "loser" },
        source2: { matchId: semifinals[1].id, result: "loser" },
      });
      tournament.matches.push(thirdPlace);
    }
  }
  refreshTournament(tournament);
}

function roundRobinPairs(participants) {
  const slots = participants.map((participant) => participant.id);
  if (slots.length % 2) slots.push(null);
  const rounds = [];
  for (let round = 0; round < slots.length - 1; round += 1) {
    const games = [];
    for (let i = 0; i < slots.length / 2; i += 1) {
      const first = slots[i];
      const second = slots[slots.length - 1 - i];
      if (first && second) games.push([first, second]);
    }
    rounds.push(games);
    slots.splice(1, 0, slots.pop());
  }
  return rounds;
}

function addRoundRobinRound(tournament, round) {
  const games = roundRobinPairs(tournament.participants)[round - 1] || [];
  games.forEach(([player1Id, player2Id], position) => {
    tournament.matches.push(makeMatch(tournament, {
      stage: "round_robin",
      round,
      position: position + 1,
      player1Id,
      player2Id,
    }));
  });
}

function standingsFor(tournament, participantIds = null, groupId = null) {
  const participants = participantIds
    ? tournament.participants.filter((participant) => participantIds.includes(participant.id))
    : tournament.participants;
  const table = new Map(participants.map((participant) => [participant.id, {
    participant,
    played: 0,
    wins: 0,
    losses: 0,
    scoreFor: 0,
    scoreAgainst: 0,
    opponents: [],
    headToHead: new Map(),
  }]));
  tournament.matches.filter((match) => match.state === "completed" && match.winnerId && match.player1Id && match.player2Id
    && (!groupId || match.groupId === groupId)).forEach((match) => {
    const first = table.get(match.player1Id);
    const second = table.get(match.player2Id);
    if (!first || !second) return;
    first.played += 1;
    second.played += 1;
    first.scoreFor += match.score1;
    first.scoreAgainst += match.score2;
    second.scoreFor += match.score2;
    second.scoreAgainst += match.score1;
    first.opponents.push(second.participant.id);
    second.opponents.push(first.participant.id);
    if (match.winnerId === first.participant.id) {
      first.wins += 1;
      second.losses += 1;
      first.headToHead.set(second.participant.id, 1);
      second.headToHead.set(first.participant.id, -1);
    } else {
      second.wins += 1;
      first.losses += 1;
      first.headToHead.set(second.participant.id, -1);
      second.headToHead.set(first.participant.id, 1);
    }
  });
  tournament.matches.filter((match) => match.stage === "swiss" && match.state === "completed" && match.player1Id && !match.player2Id
    && (!groupId || match.groupId === groupId)).forEach((match) => {
    const row = table.get(match.player1Id);
    if (row) {
      row.played += 1;
      row.wins += 1;
    }
  });
  const rows = [...table.values()].map((row) => ({
    ...row,
    differential: row.scoreFor - row.scoreAgainst,
    buchholz: row.opponents.reduce((sum, id) => sum + (table.get(id)?.wins || 0), 0),
    medianBuchholz: medianBuchholz(row.opponents, table),
  }));
  rows.sort((a, b) => b.wins - a.wins
    || (b.headToHead.get(a.participant.id) || 0) - (a.headToHead.get(b.participant.id) || 0)
    || b.differential - a.differential
    || b.buchholz - a.buchholz
    || b.medianBuchholz - a.medianBuchholz
    || a.participant.seed - b.participant.seed);
  return rows;
}

function medianBuchholz(opponents, table) {
  const scores = opponents.map((id) => table.get(id)?.wins || 0).sort((a, b) => a - b);
  if (scores.length < 3) return scores.reduce((sum, score) => sum + score, 0);
  return scores.slice(1, -1).reduce((sum, score) => sum + score, 0);
}

function resetDescendants(tournament, matchId) {
  const descendants = new Set([matchId]);
  let changed = true;
  while (changed) {
    changed = false;
    tournament.matches.forEach((candidate) => {
      if (candidate.id !== matchId
        && !descendants.has(candidate.id)
        && [candidate.source1, candidate.source2].some((source) => source && descendants.has(source.matchId))) {
        descendants.add(candidate.id);
        changed = true;
      }
    });
  }
  tournament.matches.filter((candidate) => candidate.id !== matchId && descendants.has(candidate.id)).forEach((candidate) => {
    candidate.state = "scheduled";
    candidate.score1 = null;
    candidate.score2 = null;
    candidate.winnerId = null;
    delete candidate.completedAt;
    if (candidate.source1) candidate.player1Id = null;
    if (candidate.source2) candidate.player2Id = null;
  });
}

function addSwissRound(tournament, round) {
  const byeRecipients = new Set(tournament.matches.filter((match) => match.stage === "swiss" && match.state === "completed" && match.player2Id === null).map((match) => match.player1Id));
  const rows = standingsFor(tournament);
  if (rows.length % 2) {
    const eligible = [...rows].reverse().find((row) => !byeRecipients.has(row.participant.id)) || rows[rows.length - 1];
    const match = makeMatch(tournament, {
      stage: "swiss",
      round,
      position: 1,
      player1Id: eligible.participant.id,
    });
    tournament.matches.push(match);
    completeBye(match, eligible.participant.id);
    rows.splice(rows.findIndex((row) => row.participant.id === eligible.participant.id), 1);
  }
  rows.sort((a, b) => b.wins - a.wins || b.differential - a.differential || a.participant.seed - b.participant.seed);
  let position = 1;
  while (rows.length) {
    const first = rows.shift();
    let opponentIndex = rows.findIndex((row) => !first.opponents.includes(row.participant.id));
    if (opponentIndex < 0) opponentIndex = 0;
    const [second] = rows.splice(opponentIndex, 1);
    tournament.matches.push(makeMatch(tournament, {
      stage: "swiss",
      round,
      position: position++,
      player1Id: first.participant.id,
      player2Id: second.participant.id,
    }));
  }
}

function refreshTournament(tournament) {
  tournament.matches.forEach((match) => materializeMatch(tournament, match));
  if (tournament.settings.poolPlay) {
    const groupMatches = tournament.matches.filter((match) => match.stage === "group_stage");
    const currentRound = Math.max(0, ...groupMatches.map((match) => match.round));
    const currentGroupMatches = groupMatches.filter((match) => match.round === currentRound);
    if (currentGroupMatches.length && currentGroupMatches.every((match) => match.state === "completed")
      && currentRound < tournament.settings.poolPlayRounds) {
      addPoolPlayRound(tournament, currentRound + 1);
    } else if (groupMatches.length && currentRound === tournament.settings.poolPlayRounds
      && groupMatches.every((match) => match.state === "completed")
      && !tournament.settings.playoffGenerated) {
      const qualifiers = [];
      const groupCount = tournament.settings.qualifiersPerGroup;
      tournament.settings.groups.forEach((group) => {
        const ranked = standingsFor(tournament, group.participantIds, group.id);
        ranked.slice(0, groupCount).forEach((row, index) => {
          qualifiers.push({ participant: row.participant, groupRank: index + 1 });
        });
      });
      const seededQualifiers = [];
      for (let rank = 1; rank <= groupCount; rank += 1) {
        const rankGroup = qualifiers.filter((qualifier) => qualifier.groupRank === rank);
        if (rank % 2 === 0) rankGroup.reverse();
        seededQualifiers.push(...rankGroup.map((qualifier) => qualifier.participant));
      }
      const bracket = addEliminationBracket(tournament, "playoff", seededQualifiers);
      if (tournament.settings.consolation && seededQualifiers.length >= 4) {
        const semifinalRound = bracket.rounds - 1;
        const semifinals = tournament.matches.filter((match) => match.bracket === "playoff" && match.round === semifinalRound);
        if (semifinals.length === 2) tournament.matches.push(makeMatch(tournament, {
          bracket: "placement",
          round: 1,
          position: 1,
          source1: { matchId: semifinals[0].id, result: "loser" },
          source2: { matchId: semifinals[1].id, result: "loser" },
        }));
      }
      tournament.settings.playoffGenerated = true;
    }
  }
  if (tournament.format === "round_robin" && tournament.status === "active") {
    const currentRound = Math.max(0, ...tournament.matches.filter((match) => match.stage === "round_robin").map((match) => match.round));
    const current = tournament.matches.filter((match) => match.stage === "round_robin" && match.round === currentRound);
    if (currentRound < tournament.settings.roundRobinRounds && current.length && current.every((match) => match.state === "completed")) {
      addRoundRobinRound(tournament, currentRound + 1);
    }
  }
  if (tournament.format === "swiss" && tournament.status === "active") {
    const swissMatches = tournament.matches.filter((match) => match.stage === "swiss");
    const currentRound = Math.max(0, ...swissMatches.map((match) => match.round));
    const current = swissMatches.filter((match) => match.round === currentRound);
    const maxRounds = tournament.settings.swissRounds;
    if (currentRound < maxRounds && current.length && current.every((match) => match.state === "completed")) {
      addSwissRound(tournament, currentRound + 1);
    }
  }
  const grandFinal = tournament.matches.find((match) => match.id === tournament.settings.grandFinalId);
  const resetFinal = tournament.matches.find((match) => match.bracket === "reset_final");
  if (grandFinal?.state === "completed" && tournament.format === "double_elimination" && grandFinal.winnerId === grandFinal.player2Id && !resetFinal) {
    const reset = makeMatch(tournament, {
      bracket: "reset_final",
      round: grandFinal.round + 1,
      position: 1,
      player1Id: grandFinal.player1Id,
      player2Id: grandFinal.player2Id,
    });
    tournament.matches.push(reset);
  } else if (resetFinal && (!grandFinal || grandFinal.state !== "completed" || grandFinal.winnerId !== grandFinal.player2Id)) {
    tournament.matches = tournament.matches.filter((match) => match.id !== resetFinal.id);
  }
  const stats = new Map(tournament.participants.map((participant) => [participant.id, { wins: 0, losses: 0 }]));
  tournament.matches.filter((match) => match.state === "completed" && match.winnerId && match.player1Id && match.player2Id).forEach((match) => {
    const winner = stats.get(match.winnerId);
    const loserId = match.winnerId === match.player1Id ? match.player2Id : match.player1Id;
    const loser = stats.get(loserId);
    if (winner) winner.wins += 1;
    if (loser) loser.losses += 1;
  });
  tournament.matches.filter((match) => match.stage === "swiss" && match.state === "completed" && match.player1Id && !match.player2Id).forEach((match) => {
    const winner = stats.get(match.player1Id);
    if (winner) winner.wins += 1;
  });
  tournament.participants.forEach((participant) => {
    participant.stats = stats.get(participant.id);
  });
}

function createTournament(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw inputError("Tournament details are required.");
  const settingsInput = body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)
    ? body.settings
    : {};
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const names = Array.isArray(body.participants) ? body.participants : [];
  if (!title || title.length > 80) throw inputError("Enter a tournament title of 1 to 80 characters.");
  if (names.length < 2 || names.length > MAX_PARTICIPANTS) throw inputError(`Enter between 2 and ${MAX_PARTICIPANTS} participants.`);
  if (!FORMAT_VALUES.includes(body.format)) throw inputError("Choose a supported tournament format.");
  if (body.seedingType !== undefined && !["manual", "rank"].includes(body.seedingType)) {
    throw inputError("Choose manual or leaderboard-rank seeding.");
  }
  const bestOf = Number(settingsInput.bestOf);
  if (!BEST_OF_VALUES.includes(bestOf)) throw inputError("Choose Single Game, Best-of-3, or Best-of-5.");
  const participants = names.map((name, index) => {
    const label = typeof name === "string" ? name.trim() : "";
    if (!label || label.length > 40 || /[\u0000-\u001f\u007f]/.test(label)) throw inputError(`Participant ${index + 1} must have a name between 1 and 40 characters.`);
    if (names.some((other, otherIndex) => otherIndex !== index && typeof other === "string" && other.trim().toLocaleLowerCase() === label.toLocaleLowerCase())) {
      throw inputError(`Participant "${label}" appears more than once.`);
    }
    return { id: createId(), name: label, seed: index + 1, rank: index + 1, avatar: null, stats: { wins: 0, losses: 0 } };
  });
  const stations = (Array.isArray(settingsInput.stations) ? settingsInput.stations : []).map((name) => ({
    id: createId(),
    name: String(name).trim().slice(0, 40),
    status: "available",
  })).filter((station) => station.name);
  const tournament = {
    id: createId(),
    title,
    format: body.format,
    status: "active",
    seedingType: body.seedingType === "manual" ? "manual" : "rank",
    currentStage: body.format,
    settings: {
      bestOf,
      consolation: Boolean(settingsInput.consolation),
      swissRounds: Math.max(1, Math.ceil(Math.log2(participants.length))),
      roundRobinRounds: participants.length % 2 ? participants.length : participants.length - 1,
      stations,
      grandFinalId: null,
      predictionsEnabled: false,
      poolPlay: Boolean(settingsInput.poolPlay),
      groupCount: Number(settingsInput.groupCount) || 2,
      qualifiersPerGroup: Number(settingsInput.qualifiersPerGroup) || 2,
      poolPlayRounds: 0,
      playoffGenerated: false,
    },
    participants,
    matches: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (tournament.settings.poolPlay) {
    if (tournament.format !== "single_elimination") {
      throw inputError("Pool play playoff currently supports single elimination only.");
    }
    const groupCount = tournament.settings.groupCount;
    const qualifiers = tournament.settings.qualifiersPerGroup;
    if (!Number.isInteger(groupCount) || groupCount < 2 || groupCount > Math.floor(participants.length / 2)) {
      throw inputError("Choose a valid pool count so every group has at least two participants.");
    }
    if (!Number.isInteger(qualifiers) || qualifiers < 1 || qualifiers >= Math.floor(participants.length / groupCount)) {
      throw inputError("Each pool must qualify at least one but fewer than the smallest pool size.");
    }
    if (groupCount * qualifiers < 2) throw inputError("Pool play must qualify at least two participants.");
    addPoolPlay(tournament);
  } else if (tournament.format === "single_elimination") {
    const bracket = addEliminationBracket(tournament, "main", participants);
    if (tournament.settings.consolation && participants.length >= 4) {
      const semifinals = tournament.matches.filter((match) => match.bracket === "main" && match.round === bracket.rounds - 1);
      if (semifinals.length === 2) tournament.matches.push(makeMatch(tournament, {
        bracket: "placement",
        round: 1,
        position: 1,
        source1: { matchId: semifinals[0].id, result: "loser" },
        source2: { matchId: semifinals[1].id, result: "loser" },
      }));
    }
    refreshTournament(tournament);
  } else if (tournament.format === "double_elimination") {
    addDoubleElimination(tournament);
  } else if (tournament.format === "round_robin") {
    addRoundRobinRound(tournament, 1);
    refreshTournament(tournament);
  } else {
    addSwissRound(tournament, 1);
  }
  return tournament;
}

function updateMatch(tournament, body) {
  if (body.action === "finish") {
    if (!["completed", "active"].includes(tournament.status)) throw inputError("This tournament cannot be finished.");
    tournament.status = "completed";
    tournament.updatedAt = new Date().toISOString();
    return tournament;
  }
  const match = tournament.matches.find((item) => item.id === body.matchId);
  if (!match) throw inputError("That match no longer exists.");
  if (body.action === "start") {
    if (match.state !== "scheduled" || !resolveEntrant(tournament, match, "player1") || !resolveEntrant(tournament, match, "player2")) {
      throw inputError("Only a ready match can be started.");
    }
    match.state = "in_progress";
    match.startedAt = new Date().toISOString();
    tournament.updatedAt = new Date().toISOString();
    return tournament;
  }
  if (body.action === "schedule") {
    if (body.scheduledTime !== null && (!Number.isFinite(Date.parse(body.scheduledTime)))) throw inputError("Enter a valid match date and time.");
    if (body.stationId && !tournament.settings.stations.some((station) => station.id === body.stationId)) throw inputError("Choose a valid station.");
    const assignedStation = tournament.settings.stations.find((station) => station.id === body.stationId);
    const stationConflict = assignedStation && tournament.matches.some((candidate) =>
      candidate.id !== match.id
      && candidate.stationId === assignedStation.id
      && candidate.state !== "completed"
      && candidate.state !== "disputed");
    if (stationConflict) throw inputError("That station is already assigned to another active match.");
    const previousStation = tournament.settings.stations.find((station) => station.id === match.stationId);
    if (previousStation) previousStation.status = "available";
    match.scheduledTime = body.scheduledTime || null;
    match.stationId = body.stationId || null;
    if (assignedStation) assignedStation.status = "in_use";
    tournament.updatedAt = new Date().toISOString();
    return tournament;
  }
  if (body.action === "dispute") {
    if (!["completed", "disputed"].includes(match.state)) throw inputError("Only a completed match can be disputed.");
    resetDescendants(tournament, match.id);
    match.provisionalWinnerId = match.winnerId;
    match.winnerId = null;
    match.state = "disputed";
    tournament.updatedAt = new Date().toISOString();
    refreshTournament(tournament);
    return tournament;
  }
  if (body.action === "force") {
    const player1Id = resolveEntrant(tournament, match, "player1");
    const player2Id = resolveEntrant(tournament, match, "player2");
    if (!player1Id || !player2Id || ![player1Id, player2Id].includes(body.winnerId)) {
      throw inputError("Choose one of the participants in this match as the winner.");
    }
    const needed = Math.ceil(match.bestOf / 2);
    return updateMatch(tournament, {
      action: "result",
      matchId: match.id,
      score1: body.winnerId === player1Id ? needed : 0,
      score2: body.winnerId === player2Id ? needed : 0,
    });
  }
  if (body.action !== "result") throw inputError("Choose a supported match action.");
  const player1Id = resolveEntrant(tournament, match, "player1");
  const player2Id = resolveEntrant(tournament, match, "player2");
  if (!player1Id || !player2Id) throw inputError("Both participants must be known before recording a result.");
  const score1 = body.score1;
  const score2 = body.score2;
  const needed = Math.ceil(match.bestOf / 2);
  if (!Number.isInteger(score1) || !Number.isInteger(score2) || score1 < 0 || score2 < 0 || score1 > needed || score2 > needed || score1 === score2 || Math.max(score1, score2) !== needed) {
    throw inputError(`Enter a completed score where one player reaches ${needed} set${needed === 1 ? "" : "s"} and the scores are not tied.`);
  }
  const winnerId = score1 > score2 ? player1Id : player2Id;
  if (match.winnerId && match.winnerId !== winnerId) {
    resetDescendants(tournament, match.id);
  }
  match.player1Id = player1Id;
  match.player2Id = player2Id;
  match.score1 = score1;
  match.score2 = score2;
  match.winnerId = winnerId;
  delete match.provisionalWinnerId;
  match.state = "completed";
  match.completedAt = new Date().toISOString();
  const assignedStation = tournament.settings.stations.find((station) => station.id === match.stationId);
  if (assignedStation) assignedStation.status = "available";
  tournament.updatedAt = new Date().toISOString();
  refreshTournament(tournament);
  return tournament;
}

function validateTournament(tournament) {
  if (!tournament || typeof tournament !== "object" || !Array.isArray(tournament.participants) || !Array.isArray(tournament.matches) || tournament.participants.length > MAX_PARTICIPANTS) {
    throw new Error("The saved tournament data is invalid.");
  }
  return tournament;
}

module.exports = { createTournament, refreshTournament, standingsFor, updateMatch, validateTournament };
