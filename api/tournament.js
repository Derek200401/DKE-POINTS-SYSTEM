const { getBlobErrorHint, readTournament } = require("../lib/players");
const { sendJson } = require("../lib/server");
const { validateTournament } = require("../lib/tournament");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed." });
  }
  try {
    const tournament = await readTournament();
    return sendJson(res, 200, { tournament: tournament ? validateTournament(tournament) : null });
  } catch (error) {
    console.error("Could not load tournament:", error);
    return sendJson(res, 503, { error: getBlobErrorHint(error) });
  }
};
