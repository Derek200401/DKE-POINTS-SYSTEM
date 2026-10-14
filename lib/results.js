const MAX_POINTS = 1000000;

function inputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function normalizedIgn(ign) {
  return ign.normalize("NFKC").trim().toLowerCase();
}

function validateParticipants(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.players)) {
    throw inputError("Result participants are required.");
  }
  if (!["left", "right"].includes(input.winnerSide)) {
    throw inputError("Choose which team won.");
  }
  if (input.players.length < 2 || input.players.length > 10) {
    throw inputError("A result must include participants from both teams.");
  }

  const seen = new Set();
  const counts = { left: 0, right: 0 };
  const players = input.players.map((player) => {
    if (!player || typeof player !== "object" || Array.isArray(player)) {
      throw inputError("Each result participant must be valid.");
    }
    const ign = typeof player.ign === "string" ? player.ign.trim() : "";
    if (!ign || ign.length > 40 || /[\u0000-\u001f\u007f]/.test(ign)) {
      throw inputError("Each IGN must contain 1 to 40 valid characters.");
    }
    const key = normalizedIgn(ign);
    if (seen.has(key)) throw inputError(`The IGN "${ign}" appears more than once.`);
    seen.add(key);

    if (!["left", "right"].includes(player.side)) {
      throw inputError(`Choose a valid team for ${ign}.`);
    }
    counts[player.side] += 1;
    if (counts[player.side] > 5) {
      throw inputError("Each team can have no more than five participants.");
    }
    if (
      typeof player.rating !== "number" ||
      !Number.isFinite(player.rating) ||
      player.rating < 0 ||
      player.rating > 30 ||
      Math.abs(player.rating * 10 - Math.round(player.rating * 10)) > 1e-7
    ) {
      throw inputError(`Enter a valid one-decimal rating from 0.0 to 30.0 for ${ign}.`);
    }
    return { ign, side: player.side, rating: player.rating };
  });

  if (!counts.left || !counts.right) {
    throw inputError("At least one participant is required on each team.");
  }
  return { winnerSide: input.winnerSide, players };
}

function medalFor(player, maxRating, isWinner) {
  const isHighest = player.rating === maxRating;
  if (isWinner && isHighest) {
    return player.rating >= 10.1
      ? { medal: "Supreme MVP", points: 12 }
      : { medal: "MVP Gold", points: 12 };
  }
  if (!isWinner && isHighest && player.rating >= 6.6) {
    return { medal: "MVP Loss", points: 10 };
  }
  if (player.rating >= 10.1 && isWinner) return { medal: "Supreme", points: 7 };
  if (player.rating >= 7.1 && player.rating <= 10) {
    return { medal: "Gold", points: isWinner ? 7 : 5 };
  }
  if (player.rating >= 4.1 && player.rating <= 7) {
    return { medal: "Silver", points: isWinner ? 5 : 3 };
  }
  if (player.rating >= 3 && player.rating <= 4) {
    return { medal: "Bronze", points: isWinner ? 3 : 2 };
  }
  return { medal: "No medal", points: 0 };
}

function calculateAwards(input) {
  const result = validateParticipants(input);
  const highestRatings = {
    left: Math.max(...result.players.filter((player) => player.side === "left").map((player) => player.rating)),
    right: Math.max(...result.players.filter((player) => player.side === "right").map((player) => player.rating)),
  };

  return result.players.map((player) => {
    const isWinner = player.side === result.winnerSide;
    const award = medalFor(player, highestRatings[player.side], isWinner);
    return { ...player, ...award };
  });
}

function validatePointsTotal(points) {
  return Number.isInteger(points) && points >= 0 && points <= MAX_POINTS;
}

module.exports = { calculateAwards, normalizedIgn, validatePointsTotal };
