const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeResultImage, VisionError } = require("../lib/vision");

const originalFetch = global.fetch;
const originalApiKey = process.env.VYCEAI_API_KEY;
const originalModel = process.env.VYCEAI_MODEL;

function restoreEnvironment() {
  global.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.VYCEAI_API_KEY;
  else process.env.VYCEAI_API_KEY = originalApiKey;
  if (originalModel === undefined) delete process.env.VYCEAI_MODEL;
  else process.env.VYCEAI_MODEL = originalModel;
}

test("sends a vision request and maps Victory to the left team", async () => {
  process.env.VYCEAI_API_KEY = "test-only-not-a-real-key";
  delete process.env.VYCEAI_MODEL;
  let requestUrl;
  let requestOptions;
  global.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              readable: true,
              result: "Victory",
              teams: [
                { side: "left", players: [{ ign: "Alpha", rating: 8.4 }] },
                { side: "right", players: [{ ign: "Bravo", rating: 6.2 }] },
              ],
              warnings: [],
            }),
          },
        }],
      }),
    };
  };

  try {
    const result = await analyzeResultImage("data:image/jpeg;base64,/9j/2Q==");
    assert.equal(requestUrl, "https://vyceai.com/v1/chat/completions");
    assert.equal(requestOptions.method, "POST");
    assert.equal(requestOptions.headers.Authorization, "Bearer test-only-not-a-real-key");
    const requestBody = JSON.parse(requestOptions.body);
    assert.equal(requestBody.model, "deepseek-v4-flash");
    assert.equal(requestBody.messages[1].content[1].image_url.url, "data:image/jpeg;base64,/9j/2Q==");
    assert.equal(result.winnerSide, "left");
    assert.deepEqual(result.teams.flatMap((team) => team.players).map((player) => player.ign), ["Alpha", "Bravo"]);
  } finally {
    restoreEnvironment();
  }
});

test("refuses incomplete or ambiguous image extraction", async () => {
  process.env.VYCEAI_API_KEY = "test-only-not-a-real-key";
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            readable: false,
            result: "Victory",
            teams: [],
            warnings: ["The ratings are blurry."],
          }),
        },
      }],
    }),
  });

  try {
    await assert.rejects(
      analyzeResultImage("data:image/jpeg;base64,/9j/2Q=="),
      (error) => error instanceof VisionError && error.status === 422,
    );
  } finally {
    restoreEnvironment();
  }
});

test("reports missing server-side AI credentials without making a request", async () => {
  delete process.env.VYCEAI_API_KEY;
  let requested = false;
  global.fetch = async () => {
    requested = true;
    throw new Error("Unexpected network request");
  };

  try {
    await assert.rejects(
      analyzeResultImage("data:image/jpeg;base64,/9j/2Q=="),
      (error) => error instanceof VisionError && error.status === 503,
    );
    assert.equal(requested, false);
  } finally {
    restoreEnvironment();
  }
});
