const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateAwards } = require("../lib/results");
const { analyzeResultImage, validateExtraction, VisionError } = require("../lib/vision");

function players(prefix, side, ratings = [8.4, 7.2, 6.5, 4.2, 3.1]) {
  return ratings.map((rating, index) => ({
    ign: `${prefix}-${index + 1}`,
    rating,
    side,
  }));
}

function extraction(result = "victory") {
  return {
    readable: true,
    result,
    formatted_response: "Here are the rating scores for each player based on the end-of-game scoreboard:",
    teams: [
      { side: "right", players: players("Red", "right") },
      { side: "left", players: players("Blue", "left") },
    ],
    warnings: [],
  };
}

test("maps Victory to blue/left and returns exactly five players on each side", () => {
  const result = validateExtraction(extraction("Victory"));
  assert.equal(result.winnerSide, "left");
  assert.deepEqual(result.teams.map((team) => [team.side, team.players.length]), [
    ["left", 5],
    ["right", 5],
  ]);
  assert.equal(result.teams[0].players[0].ign, "Blue-1");
  assert.equal(calculateAwards({
    winnerSide: result.winnerSide,
    players: result.teams.flatMap((team) => team.players),
  }).length, 10);
});

test("maps Defeat to red/right", () => {
  const result = validateExtraction(extraction("Defeat"));
  assert.equal(result.winnerSide, "right");
});

test("uses the Gemini Interactions API image request and returns all ten extracted players", async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;
  const originalFetch = global.fetch;
  process.env.GEMINI_API_KEY = "test-only-not-a-real-key";
  delete process.env.GEMINI_MODEL;
  let apiUrl;
  let apiRequest;
  global.fetch = async (request) => {
    apiUrl = String(request.url || request);
    apiRequest = request;
    return new Response(JSON.stringify({
      id: "test-interaction",
      status: "completed",
      model: "gemini-3.8-flash",
      steps: [{
        type: "model_output",
        content: [{ type: "text", text: JSON.stringify(extraction("Victory")) }],
      }],
      object: "interaction",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await analyzeResultImage("data:image/jpeg;base64,/9j/2Q==");
    assert.match(apiUrl, /\/interactions$/);
    assert.equal(apiRequest.headers.get("x-goog-api-key"), "test-only-not-a-real-key");
    const body = JSON.parse(await apiRequest.text());
    assert.equal(body.model, "gemini-3.8-flash");
    assert.equal(body.store, false);
    assert.equal(body.input[1].type, "image");
    assert.equal(body.input[1].mime_type, "image/jpeg");
    assert.equal(body.input[1].data, "/9j/2Q==");
    assert.equal(body.response_format.mime_type, "application/json");
    assert.match(body.input[0].text, /Capture all special symbols/);
    assert.match(body.input[0].text, /Add \(MVP\) next to the player with the highest score/);
    assert.equal(body.response_format.schema.properties.teams.items.properties.players.minItems, 5);
    assert.equal(body.response_format.schema.properties.teams.items.properties.players.maxItems, 5);
    assert.equal(result.winnerSide, "left");
    assert.equal(result.teams.reduce((total, team) => total + team.players.length, 0), 10);
  } finally {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
    global.fetch = originalFetch;
  }
});

test("rejects an extraction unless both teams have exactly five players", () => {
  const incomplete = extraction();
  incomplete.teams[0].players.pop();
  assert.throws(
    () => validateExtraction(incomplete),
    (error) => error instanceof VisionError && error.status === 422 && /exactly five/.test(error.message),
  );
});

test("rejects screenshots with unreadable player data", () => {
  const unreadable = extraction();
  unreadable.readable = false;
  assert.throws(
    () => validateExtraction(unreadable),
    (error) => error instanceof VisionError && error.status === 422,
  );
});

test("rejects malformed names and duplicate IGN values before awards are shown", () => {
  const malformed = extraction();
  malformed.teams[1].players[0].ign = "";
  const validated = validateExtraction(malformed);
  assert.throws(
    () => calculateAwards({
      winnerSide: validated.winnerSide,
      players: validated.teams.flatMap((team) => team.players),
    }),
    /valid characters/,
  );

  const duplicate = extraction();
  duplicate.teams[1].players[0].ign = duplicate.teams[0].players[0].ign;
  const duplicateValidated = validateExtraction(duplicate);
  assert.throws(
    () => calculateAwards({
      winnerSide: duplicateValidated.winnerSide,
      players: duplicateValidated.teams.flatMap((team) => team.players),
    }),
    /appears more than once/,
  );
});

test("reports missing Gemini credentials without making an API call", async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalFetch = global.fetch;
  delete process.env.GEMINI_API_KEY;
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
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    global.fetch = originalFetch;
  }
});
