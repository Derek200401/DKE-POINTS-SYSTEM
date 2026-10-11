const { getConfig, isAuthenticated, sendJson } = require("../../lib/server");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed." });
  }
  try {
    const { sessionSecret } = getConfig();
    return sendJson(res, 200, { authenticated: isAuthenticated(req, sessionSecret) });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Admin sign-in is not configured." });
  }
};
