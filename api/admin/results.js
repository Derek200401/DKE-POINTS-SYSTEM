const crypto = require("node:crypto");
const {
  getConfig,
  hasSameOrigin,
  isAuthenticated,
  readJson,
  sendJson,
} = require("../../lib/server");
const {
  getBlobErrorHint,
  readPlayerStore,
  writePlayerStore,
} = require("../../lib/players");
const { calculateAwards, normalizedIgn, validatePointsTotal } = require("../../lib/results");
const { analyzeResultImage, VisionError } = require("../../lib/vision");

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = 3000000;

function readImageDataUrl(value) {
  if (typeof value !== "string") throw Object.assign(new Error("Choose a result image to scan."), { status: 400 });
  const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw Object.assign(new Error("Upload a JPEG, PNG, or WebP image."), { status: 400 });
  const image = Buffer.from(match[2], "base64");
  if (!image.length || image.length > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error("The processed image must be no larger than 2 MB."), { status: 413 });
  }
  const isJpeg = match[1] === "jpeg" && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
  const isPng = match[1] === "png" && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp = match[1] === "webp"
    && image.toString("ascii", 0, 4) === "RIFF"
    && image.toString("ascii", 8, 12) === "WEBP";
  if (!isJpeg && !isPng && !isWebp) {
    throw Object.assign(new Error("The uploaded file is not a valid supported image."), { status: 400 });
  }
  return { image, dataUrl: value };
}

function validateSubmissionHash(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) {
    throw Object.assign(new Error("The scanned image reference is invalid. Scan the image again."), { status: 400 });
  }
  return value.toLowerCase();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }
  if (!hasSameOrigin(req)) {
    return sendJson(res, 403, { error: "Request origin could not be verified." });
  }
  let config;
  try {
    config = getConfig();
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Admin sign-in is not set up correctly." });
  }
  if (!isAuthenticated(req, config.sessionSecret)) {
    return sendJson(res, 401, { error: "Sign in as an admin to submit game results." });
  }

  try {
    const body = await readJson(req, MAX_REQUEST_BYTES);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return sendJson(res, 400, { error: "The request must be a JSON object." });
    }

    if (body.action === "analyze") {
      const { image, dataUrl } = readImageDataUrl(body.image);
      const extraction = await analyzeResultImage(dataUrl);
      const participants = extraction.teams.flatMap((team) => team.players);
      return sendJson(res, 200, {
        imageHash: crypto.createHash("sha256").update(image).digest("hex"),
        result: extraction.result,
        winnerSide: extraction.winnerSide,
        warnings: extraction.warnings,
        participants,
      });
    }

    if (body.action !== "preview" && body.action !== "apply") {
      return sendJson(res, 400, { error: "Choose analyze, preview, or apply." });
    }
    const awards = calculateAwards(body);
    if (body.action === "preview") return sendJson(res, 200, { awards });

    const imageHash = validateSubmissionHash(body.imageHash);
    const store = await readPlayerStore();
    if (store.appliedSubmissions.some((submission) => submission.hash === imageHash)) {
      return sendJson(res, 409, { error: "This exact screenshot has already been applied to the leaderboard." });
    }

    const playerByIgn = new Map(store.players.map((player) => [normalizedIgn(player.ign), player]));
    const totals = new Map();
    for (const award of awards) {
      const existing = playerByIgn.get(normalizedIgn(award.ign));
      const current = totals.has(award.ign) ? totals.get(award.ign) : existing?.points || 0;
      const next = current + award.points;
      if (!validatePointsTotal(next)) {
        return sendJson(res, 400, { error: `Adding ${award.points} points to ${award.ign} would exceed the 1,000,000-point limit.` });
      }
      totals.set(award.ign, next);
    }

    const updatedPlayers = [];
    for (const award of awards) {
      const key = normalizedIgn(award.ign);
      let player = playerByIgn.get(key);
      if (!player) {
        player = { id: crypto.randomUUID(), ign: award.ign, points: 0 };
        store.players.push(player);
        playerByIgn.set(key, player);
      }
      player.points = totals.get(award.ign);
      updatedPlayers.push(player);
    }
    store.appliedSubmissions.push({ hash: imageHash, appliedAt: new Date().toISOString() });
    await writePlayerStore(store.players, store.appliedSubmissions);
    return sendJson(res, 200, { awards, players: updatedPlayers });
  } catch (error) {
    if (error.status === 400 || error.status === 413 || error.status === 422) {
      return sendJson(res, error.status, { error: error.message });
    }
    if (error instanceof VisionError) {
      return sendJson(res, error.status || 502, { error: error.message });
    }
    console.error("Could not process game result:", error);
    return sendJson(res, 503, { error: getBlobErrorHint(error) });
  }
};

module.exports.config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: "3mb" } },
};
