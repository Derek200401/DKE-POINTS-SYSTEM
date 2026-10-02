const { clearSessionCookie, hasSameOrigin, sendJson } = require("../../lib/server");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }
  if (!hasSameOrigin(req)) return sendJson(res, 403, { error: "Request origin could not be verified." });
  res.setHeader("Set-Cookie", clearSessionCookie(req));
  return sendJson(res, 200, { authenticated: false });
};
