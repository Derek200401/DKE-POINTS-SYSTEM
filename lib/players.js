const DATA_PATH = "dke-scrim-points/players.json";
const TOURNAMENT_PATH = "dke-scrim-points/tournament.json";

function getBlobErrorHint(error) {
  const message = String(error?.message || "");
  const status = error?.statusCode || error?.status;

  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    return "Vercel Blob credentials are missing. In Vercel, open Storage, connect the private Blob store to this project and Production, then redeploy.";
  }
  if (
    status === 401 ||
    status === 403 ||
    /unauthori[sz]ed|forbidden|invalid token|permission denied/i.test(message)
  ) {
    return "Vercel Blob rejected this deployment's access. Check that the private Blob store is connected to this project and Production, then redeploy.";
  }
  if (
    /ERR_MODULE_NOT_FOUND|Cannot find package ['"]@vercel\/blob/i.test(message)
  ) {
    return "The @vercel/blob package is missing from this deployment. Confirm the latest commit includes package.json, then redeploy.";
  }

  console.error("Vercel Blob request failed:", error);
  return `Vercel Blob request failed${status ? ` (HTTP ${status})` : ""}. Check the Function Logs in Vercel for the full error.`;
}

async function getBlobSdk() {
  try {
    return await import("@vercel/blob");
  } catch (error) {
    error.code = error.code || "ERR_MODULE_NOT_FOUND";
    throw error;
  }
}

function validatePlayerList(players) {
  if (!Array.isArray(players))
    throw new Error("The saved player list is not valid.");
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

function validateAppliedSubmissions(submissions) {
  if (!Array.isArray(submissions)) {
    throw new Error("The saved result history is not valid.");
  }
  for (const submission of submissions) {
    if (
      !submission ||
      typeof submission.hash !== "string" ||
      !/^[a-f0-9]{64}$/i.test(submission.hash) ||
      typeof submission.appliedAt !== "string"
    ) {
      throw new Error("The saved result history contains invalid data.");
    }
  }
  return submissions;
}

async function readPlayerStore() {
  const { get } = await getBlobSdk();
  const result = await get(DATA_PATH, { access: "private", useCache: false });
  if (!result) return { players: [], appliedSubmissions: [] };
  const contents = await new Response(result.stream).text();
  const saved = JSON.parse(contents);
  if (Array.isArray(saved)) {
    return { players: validatePlayerList(saved), appliedSubmissions: [] };
  }
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
    throw new Error("The saved player data is not valid.");
  }
  return {
    players: validatePlayerList(saved.players),
    appliedSubmissions: validateAppliedSubmissions(saved.appliedSubmissions || []),
  };
}

async function writePlayerStore(players, appliedSubmissions) {
  const { put } = await getBlobSdk();
  const data = {
    players: validatePlayerList(players),
    appliedSubmissions: validateAppliedSubmissions(appliedSubmissions),
  };
  await put(DATA_PATH, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json",
  });
}

async function readPlayers() {
  return (await readPlayerStore()).players;
}

async function writePlayers(players) {
  const { appliedSubmissions } = await readPlayerStore();
  await writePlayerStore(players, appliedSubmissions);
}

async function readTournament() {
  const { get } = await getBlobSdk();
  const result = await get(TOURNAMENT_PATH, { access: "private", useCache: false });
  if (!result) return null;
  const contents = await new Response(result.stream).text();
  return JSON.parse(contents);
}

async function writeTournament(tournament) {
  const { put } = await getBlobSdk();
  await put(TOURNAMENT_PATH, JSON.stringify(tournament), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
    contentType: "application/json",
  });
}

module.exports = {
  getBlobErrorHint,
  readPlayerStore,
  readPlayers,
  readTournament,
  writePlayerStore,
  writePlayers,
  writeTournament,
};
