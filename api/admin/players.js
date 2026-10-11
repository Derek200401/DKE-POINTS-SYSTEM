const crypto = require("node:crypto");
const {
  getConfig,
  hasSameOrigin,
  isAuthenticated,
  readJson,
  reportServerError,
  sendJson,
  validateIgn,
  validatePoints,
} = require("../../lib/server");
const { getBlobErrorHint, readPlayers, writePlayers } = require("../../lib/players");

module.exports = async function handler(req, res) {
  if (!["POST", "PATCH"].includes(req.method)) {
    res.setHeader("Allow", "POST, PATCH");
    return sendJson(res, 405, { error: "Method not allowed." });
  }
  if (!hasSameOrigin(req)) return sendJson(res, 403, { error: "Request origin could not be verified." });

  let config;
  try {
    config = getConfig();
  } catch (error) {
    return reportServerError(res, error, "Admin sign-in is not set up correctly.");
  }
  if (!isAuthenticated(req, config.sessionSecret)) {
    return sendJson(res, 401, { error: "Sign in as an admin to change points." });
  }

  try {
    const body = await readJson(req);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return sendJson(res, 400, { error: "The request must be a JSON object." });
    }
    const players = await readPlayers();

    if (req.method === "POST") {
      if (!validateIgn(body.ign)) {
        return sendJson(res, 400, { error: "Enter an IGN between 1 and 40 characters." });
      }
      if (!validatePoints(body.points)) {
        return sendJson(res, 400, { error: "Points must be a whole number from 0 to 1,000,000." });
      }
      const ign = body.ign.trim();
      if (players.some((player) => player.ign.toLocaleLowerCase() === ign.toLocaleLowerCase())) {
        return sendJson(res, 409, { error: "That IGN is already on the list." });
      }
      const player = { id: crypto.randomUUID(), ign, points: body.points };
      players.push(player);
      await writePlayers(players);
      return sendJson(res, 201, { player });
    }

    if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) {
      return sendJson(res, 400, { error: "Select a valid player." });
    }
    if (!validatePoints(body.points)) {
      return sendJson(res, 400, { error: "Points must be a whole number from 0 to 1,000,000." });
    }
    const player = players.find((item) => item.id === body.id);
    if (!player) return sendJson(res, 404, { error: "That player is no longer on the list." });
    player.points = body.points;
    await writePlayers(players);
    return sendJson(res, 200, { player });
  } catch (error) {
    if (error.status === 400 || error.status === 413) {
      return sendJson(res, error.status, {
        error: error.status === 413 ? "The request is too large." : "The request must contain valid JSON.",
      });
    }
    console.error("Could not save scrim player points:", error);
    return sendJson(res, 503, { error: getBlobErrorHint(error) });
  }
};
