const {
  getConfig,
  hasSameOrigin,
  isAuthenticated,
  readJson,
  reportServerError,
  sendJson,
} = require("../../lib/server");
const { getBlobErrorHint, readTournament, writeTournament } = require("../../lib/players");
const { createTournament, updateMatch, validateTournament } = require("../../lib/tournament");

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
    return sendJson(res, 401, { error: "Sign in as an admin to manage tournaments." });
  }

  try {
    const body = await readJson(req);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return sendJson(res, 400, { error: "The request must be a JSON object." });
    }
    if (req.method === "POST") {
      const existing = await readTournament();
      if (existing && existing.status !== "completed") {
        return sendJson(res, 409, { error: "Finish the current tournament before creating another." });
      }
      const tournament = createTournament(body);
      await writeTournament(tournament);
      return sendJson(res, 201, { tournament });
    }
    const saved = await readTournament();
    if (!saved) return sendJson(res, 404, { error: "There is no tournament to update." });
    const tournament = validateTournament(saved);
    updateMatch(tournament, body);
    await writeTournament(tournament);
    return sendJson(res, 200, { tournament });
  } catch (error) {
    if (error.status === 400 || error.status === 413) {
      return sendJson(res, error.status, {
        error: error.status === 413
          ? "The request is too large."
          : error instanceof SyntaxError
            ? "The request must contain valid JSON."
            : error.message,
      });
    }
    console.error("Could not save tournament:", error);
    return sendJson(res, 503, { error: getBlobErrorHint(error) });
  }
};
