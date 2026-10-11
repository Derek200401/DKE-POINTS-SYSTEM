const {
  createSessionCookie,
  constantTimeEqual,
  getConfig,
  hasSameOrigin,
  readJson,
  sendJson
} = require("../../lib/server");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }
  if (!hasSameOrigin(req)) return sendJson(res, 403, { error: "Request origin could not be verified." });
  try {
    const config = getConfig();
    const body = await readJson(req);
    if (!body || typeof body !== "object" || typeof body.username !== "string" || typeof body.password !== "string") {
      return sendJson(res, 400, { error: "Enter a username and password." });
    }
    if (!constantTimeEqual(body.username, config.adminUsername) || !constantTimeEqual(body.password, config.adminPassword)) {
      return sendJson(res, 401, { error: "Incorrect username or password." });
    }
    res.setHeader("Set-Cookie", createSessionCookie(config.sessionSecret, req));
    return sendJson(res, 200, { authenticated: true });
  } catch (error) {
    if (error.status === 400 || error.status === 413) {
      return sendJson(res, error.status, { error: error.status === 413 ? "Request body is too large." : "Request body must be valid JSON." });
    }
    console.error(error);
    return sendJson(res, 500, { error: "Admin sign-in is not configured correctly." });
  }
};
