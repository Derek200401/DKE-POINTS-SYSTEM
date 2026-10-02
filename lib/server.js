const crypto = require("node:crypto");

const COOKIE_NAME = "dke_admin";
const SESSION_SECONDS = 60 * 60 * 12;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function getConfig() {
  const config = {
    adminUsername: process.env.ADMIN_USERNAME,
    adminPassword: process.env.ADMIN_PASSWORD,
    sessionSecret: process.env.ADMIN_SESSION_SECRET,
  };
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length)
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  if (config.sessionSecret.length < 32) {
    throw new Error(
      "ADMIN_SESSION_SECRET must contain at least 32 characters.",
    );
  }
  return config;
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    error.status = 400;
    throw error;
  }
}

function hasSameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function signSession(expiration, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${expiration}`)
    .digest("hex");
}

function isSecureRequest(req) {
  const forwardedProtocol = req.headers["x-forwarded-proto"];
  if (forwardedProtocol)
    return forwardedProtocol.split(",")[0].trim().toLowerCase() === "https";
  const host = req.headers.host || "";
  return !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
}

function createSessionCookie(secret, req) {
  const expiration = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const signature = signSession(expiration, secret);
  const secure = isSecureRequest(req) ? "; Secure" : "";
  return `${COOKIE_NAME}=${expiration}.${signature}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`;
}

function clearSessionCookie(req) {
  const secure = isSecureRequest(req) ? "; Secure" : "";
  return `${COOKIE_NAME}=; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=0`;
}

function isAuthenticated(req, secret) {
  const cookieHeader = req.headers.cookie || "";
  const cookie = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return false;
  const token = cookie.slice(COOKIE_NAME.length + 1);
  const [expirationText, signature] = token.split(".");
  const expiration = Number(expirationText);
  if (
    !Number.isSafeInteger(expiration) ||
    expiration <= Math.floor(Date.now() / 1000) ||
    !signature
  )
    return false;
  return constantTimeEqual(signature, signSession(expiration, secret));
}

async function readJson(req) {
  if (req.body !== undefined) {
    if (typeof req.body === "object" && req.body !== null) return req.body;
    if (typeof req.body === "string") return parseJson(req.body);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  if (!body) {
    const error = new Error("Request body is empty.");
    error.status = 400;
    throw error;
  }
  return parseJson(body);
}

function validatePoints(points) {
  return Number.isInteger(points) && points >= 0 && points <= 1000000;
}

function validateIgn(ign) {
  return (
    typeof ign === "string" &&
    ign.trim().length > 0 &&
    ign.trim().length <= 40 &&
    !/[\u0000-\u001f\u007f]/.test(ign)
  );
}

function reportServerError(
  res,
  error,
  message = "Could not save that change. Try again.",
) {
  console.error(error);
  sendJson(res, 500, { error: message });
}

module.exports = {
  COOKIE_NAME,
  constantTimeEqual,
  createSessionCookie,
  clearSessionCookie,
  getConfig,
  hasSameOrigin,
  isAuthenticated,
  readJson,
  reportServerError,
  sendJson,
  validateIgn,
  validatePoints,
};
