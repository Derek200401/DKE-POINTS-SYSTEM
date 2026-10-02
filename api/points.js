const { reportServerError, sendJson } = require("../lib/server");
const { readPlayers } = require("../lib/players");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed." });
  }
  try {
    const players = (await readPlayers()).sort(
      (first, second) => second.points - first.points || first.ign.localeCompare(second.ign),
    );
    return sendJson(res, 200, { players });
  } catch (error) {
    return reportServerError(res, error, "Could not load the players. Check that Vercel Blob is connected.");
  }
};
