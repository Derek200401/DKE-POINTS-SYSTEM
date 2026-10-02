const DATA_PATH = "dke-scrim-points/players.json";

async function getBlobSdk() {
  try {
    return await import("@vercel/blob");
  } catch (error) {
    throw new Error(`Vercel Blob is not available. Run npm install before deploying. ${error.message}`);
  }
}

function validatePlayerList(players) {
  if (!Array.isArray(players)) throw new Error("The saved player list is not valid.");
  for (const player of players) {
    if (
      !player ||
      typeof player.id !== "string" ||
      typeof player.ign !== "string" ||
      !Number.isInteger(player.points) ||
      player.points < 0 ||
      player.points > 1000000
    ) {
      throw new Error("The saved player list contains invalid data.");
    }
  }
  return players;
}

async function readPlayers() {
  const { get } = await getBlobSdk();
  const result = await get(DATA_PATH, { access: "private" });
  if (!result) return [];
  const contents = await new Response(result.stream).text();
  return validatePlayerList(JSON.parse(contents));
}

async function writePlayers(players) {
  const { put } = await getBlobSdk();
  await put(DATA_PATH, JSON.stringify(validatePlayerList(players)), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json",
  });
}

module.exports = { readPlayers, writePlayers };
