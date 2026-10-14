const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateAwards } = require("../lib/results");
const {
  analyzeResultImage,
  validateExtraction,
  VisionError,
} = require("../lib/vision");

function players(prefix, side, ratings = [8.4, 7.2, 6.5, 4.2, 3.1]) {
  return ratings.map((rating, index) => ({
    ign: `${prefix}-${index + 1}`,
    rating,
    side,
  }));
}

function extraction(result = "victory", winnerSide = result.toLowerCase() === "victory" ? "left" : "right") {
  return {
    readable: true,
    result,
    winner_side: winnerSide,
    formatted_response:
      "Here are the rating scores for each player based on the end-of-game scoreboard:",
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
  assert.deepEqual(
    result.teams.map((team) => [team.side, team.players.length]),
    [
      ["left", 5],
      ["right", 5],
    ],
  );
  assert.equal(result.teams[0].players[0].ign, "Blue-1");
  assert.equal(
    calculateAwards({
      winnerSide: result.winnerSide,
      players: result.teams.flatMap((team) => team.players),
    }).length,
    10,
  );
});

test("maps Defeat to red/right", () => {
  const result = validateExtraction(extraction("Defeat"));
  assert.equal(result.winnerSide, "right");
});

test("accepts the winning team on the right without swapping the physical team sides", () => {
  const result = validateExtraction(extraction("Victory", "right"));
  assert.equal(result.winnerSide, "right");
  assert.deepEqual(
    result.teams.map((team) => [team.side, team.players[0].ign]),
    [
      ["left", "Blue-1"],
      ["right", "Red-1"],
    ],
  );
});

test("uses the VyceAI OpenAI-compatible vision request and returns all ten extracted players", async () => {
  const originalKey = process.env.VYCEAI_API_KEY;
  const originalFetch = global.fetch;
  process.env.VYCEAI_API_KEY = "test-only-not-a-real-key";
  let apiUrl;
  let apiRequest;
  global.fetch = async (url, options) => {
    apiUrl = String(url);
    apiRequest = options;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: { content: JSON.stringify(extraction("Victory")) },
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  try {
    const result = await analyzeResultImage("data:image/jpeg;base64,/9j/2Q==");
    assert.equal(apiUrl, "https://vyceai.com/v1/chat/completions");
    assert.equal(
      apiRequest.headers.Authorization,
      "Bearer test-only-not-a-real-key",
    );
    const body = JSON.parse(apiRequest.body);
    assert.equal(body.model, "deepseek-v4.1");
    assert.equal(body.messages[0].content[1].type, "image_url");
    assert.equal(
      body.messages[0].content[1].image_url.url,
      "data:image/jpeg;base64,/9j/2Q==",
    );
    assert.equal(body.response_format.type, "json_object");
    assert.match(
      body.messages[0].content[0].text,
      /Capture all special symbols/,
    );
    assert.match(
      body.messages[0].content[0].text,
      /Add \(MVP\) next to the player with the highest score/,
    );
    assert.match(
      body.messages[0].content[0].text,
      /Do not invent or calculate points/,
    );
    assert.match(
      body.messages[0].content[0].text,
      /winner_side as the physical side \(left or right\)/,
    );
    assert.equal(result.winnerSide, "left");
    assert.equal(
      result.teams.reduce((total, team) => total + team.players.length, 0),
      10,
    );
  } finally {
    if (originalKey === undefined) delete process.env.VYCEAI_API_KEY;
    else process.env.VYCEAI_API_KEY = originalKey;
    global.fetch = originalFetch;
  }
});

test("parses JSON wrapped in text and returned as multimodal text parts", async () => {
  const originalKey = process.env.VYCEAI_API_KEY;
  const originalFetch = global.fetch;
  process.env.VYCEAI_API_KEY = "test-only-not-a-real-key";
  const expectedExtraction = extraction("Victory", "right");
  global.fetch = async () =>
    new Response(JSON.stringify({
      choices: [{
        message: {
          content: [
            { type: "text", text: "Extracted scoreboard:\n```json\n" },
            { type: "text", text: `${JSON.stringify(expectedExtraction)}\n\`\`\`` },
          ],
        },
      }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const result = await analyzeResultImage("data:image/jpeg;base64,/9j/2Q==");
    assert.equal(result.winnerSide, "right");
    assert.equal(result.teams[0].players[0].ign, "Blue-1");
    assert.equal(result.teams[1].players[0].ign, "Red-1");
  } finally {
    if (originalKey === undefined) delete process.env.VYCEAI_API_KEY;
    else process.env.VYCEAI_API_KEY = originalKey;
    global.fetch = originalFetch;
  }
});

test("returns a clear error when VyceAI does not return a JSON player roster", async () => {
  const originalKey = process.env.VYCEAI_API_KEY;
  const originalFetch = global.fetch;
  process.env.VYCEAI_API_KEY = "test-only-not-a-real-key";
  global.fetch = async () =>
    new Response(JSON.stringify({
      choices: [{ message: { content: "I cannot read the names clearly." } }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    await assert.rejects(
      analyzeResultImage("data:image/jpeg;base64,/9j/2Q=="),
      (error) =>
        error instanceof VisionError &&
        /did not contain a valid player-data JSON response/.test(error.message),
    );
  } finally {
    if (originalKey === undefined) delete process.env.VYCEAI_API_KEY;
    else process.env.VYCEAI_API_KEY = originalKey;
    global.fetch = originalFetch;
  }
});

test("reports VyceAI model access errors", async () => {
  const originalKey = process.env.VYCEAI_API_KEY;
  const originalFetch = global.fetch;
  process.env.VYCEAI_API_KEY = "test-only-not-a-real-key";
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          message: "Model is unavailable.",
        },
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );

  try {
    await assert.rejects(
      analyzeResultImage("data:image/jpeg;base64,/9j/2Q=="),
      (error) =>
        error instanceof VisionError && /deepseek-v4\.1/.test(error.message),
    );
  } finally {
    if (originalKey === undefined) delete process.env.VYCEAI_API_KEY;
    else process.env.VYCEAI_API_KEY = originalKey;
    global.fetch = originalFetch;
  }
});

test("rejects an extraction unless both teams have exactly five players", () => {
  const incomplete = extraction();
  incomplete.teams[0].players.pop();
  assert.throws(
    () => validateExtraction(incomplete),
    (error) =>
      error instanceof VisionError &&
      error.status === 422 &&
      /exactly five/.test(error.message),
  );
});

test("rejects an extraction without an explicit physical winning side", () => {
  const missingWinnerSide = extraction();
  delete missingWinnerSide.winner_side;
  assert.throws(
    () => validateExtraction(missingWinnerSide),
    (error) =>
      error instanceof VisionError &&
      error.status === 422 &&
      /which physical side won/.test(error.message),
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
    () =>
      calculateAwards({
        winnerSide: validated.winnerSide,
        players: validated.teams.flatMap((team) => team.players),
      }),
    /valid characters/,
  );

  const duplicate = extraction();
  duplicate.teams[1].players[0].ign = duplicate.teams[0].players[0].ign;
  const duplicateValidated = validateExtraction(duplicate);
  assert.throws(
    () =>
      calculateAwards({
        winnerSide: duplicateValidated.winnerSide,
        players: duplicateValidated.teams.flatMap((team) => team.players),
      }),
    /appears more than once/,
  );
});

test("reports missing VyceAI credentials without making an API call", async () => {
  const originalKey = process.env.VYCEAI_API_KEY;
  const originalFetch = global.fetch;
  delete process.env.VYCEAI_API_KEY;
  let requested = false;
  global.fetch = async () => {
    requested = true;
    throw new Error("Unexpected network request");
  };
  try {
    await assert.rejects(
      analyzeResultImage("data:image/jpeg;base64,/9j/2Q=="),
      (error) =>
        error instanceof VisionError &&
        error.status === 503 &&
        /VYCEAI_API_KEY/.test(error.message),
    );
    assert.equal(requested, false);
  } finally {
    if (originalKey === undefined) delete process.env.VYCEAI_API_KEY;
    else process.env.VYCEAI_API_KEY = originalKey;
    global.fetch = originalFetch;
  }
});
