const MODEL = "gemini-2.5-flash";

const EXTRACTION_PROMPT = [
  "Please scan this Mobile Legends scoreboard image and list the IGN (In-Game Name) and rating score for all 10 players.",
  "",
  "Use this exact text layout in the formatted_response field:",
  "Here are the rating scores for each player based on the end-of-game scoreboard:",
  "",
  "Winning Team (Left):",
  "1. [IGN]: [Rating Score]",
  "2. [IGN]: [Rating Score]",
  "3. [IGN]: [Rating Score]",
  "4. [IGN]: [Rating Score]",
  "5. [IGN]: [Rating Score]",
  "",
  "Losing Team (Right):",
  "1. [IGN]: [Rating Score]",
  "2. [IGN]: [Rating Score]",
  "3. [IGN]: [Rating Score]",
  "4. [IGN]: [Rating Score]",
  "5. [IGN]: [Rating Score]",
  "",
  "Notes:",
  "- Capture all special symbols, non-standard fonts, and characters in the IGNs accurately.",
  "- Add (MVP) next to the player with the highest score on the winning team, wherever that player appears in the five-player list.",
  "- The headings above describe a VICTORY screenshot. For a DEFEAT screenshot, the RIGHT/RED team is the winning team and the LEFT/BLUE team is losing. Never change or swap the actual left/right team sides.",
  "- VICTORY means the LEFT/BLUE team won. DEFEAT means the RIGHT/RED team won. Read the large result banner; never infer the winner from kills or score.",
  "- Include all five players on each physical side. If even one IGN, rating, team side, or result banner is unclear, set readable=false and explain in warnings. Never guess, autocorrect, normalize, or omit text.",
  "- Copy every IGN character exactly, including capitalization, spaces, punctuation, decorative glyphs, and symbols.",
  "- The rating is the one-decimal performance score shown below each player's medal, not K/D/A, gold, hero level, or the medal icon.",
  "- Return the formatted summary plus the same data in the required JSON fields. The server calculates and validates points independently.",
].join("\n");

class VisionError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

function parseModelContent(content) {
  const text = typeof content === "string" ? content : "";
  if (!text.trim()) {
    throw new VisionError(
      "Gemini returned an empty result. Try a clearer screenshot.",
      422,
    );
  }
  try {
    return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    throw new VisionError(
      "Gemini's response could not be read. Try scanning the screenshot again.",
      422,
    );
  }
}

function validateExtraction(extraction) {
  if (
    !extraction ||
    typeof extraction !== "object" ||
    extraction.readable !== true
  ) {
    throw new VisionError(
      "The screenshot was not clear enough to read all player names and ratings. Upload a clear, uncropped results screenshot.",
      422,
    );
  }
  const result = String(extraction.result || "").toLowerCase();
  if (!["victory", "defeat"].includes(result)) {
    throw new VisionError(
      "Gemini could not identify the Victory or Defeat label. Upload the full results screenshot.",
      422,
    );
  }
  if (!Array.isArray(extraction.teams) || extraction.teams.length !== 2) {
    throw new VisionError(
      "Gemini did not return both complete five-player teams. Upload the full results screenshot.",
      422,
    );
  }

  const teamsBySide = new Map();
  for (const team of extraction.teams) {
    if (
      !team ||
      !["left", "right"].includes(team.side) ||
      teamsBySide.has(team.side) ||
      !Array.isArray(team.players)
    ) {
      throw new VisionError(
        "Gemini could not separate the blue and red teams. Upload the full screenshot.",
        422,
      );
    }
    if (team.players.length !== 5) {
      throw new VisionError(
        `Gemini read ${team.players.length} players for the ${team.side === "left" ? "blue" : "red"} team; exactly five are required. Try a clearer, uncropped screenshot.`,
        422,
      );
    }
    teamsBySide.set(team.side, team.players.map((player) => ({
      ign: player?.ign,
      rating: typeof player?.rating === "string" ? Number(player.rating) : player?.rating,
      side: team.side,
    })));
  }
  if (!teamsBySide.has("left") || !teamsBySide.has("right")) {
    throw new VisionError(
      "Gemini could not identify both the blue and red teams. Upload the full screenshot.",
      422,
    );
  }

  const warnings = Array.isArray(extraction.warnings)
    ? extraction.warnings.filter((warning) => typeof warning === "string").slice(0, 5)
    : [];
  return {
    result,
    winnerSide: result === "victory" ? "left" : "right",
    teams: [
      { side: "left", players: teamsBySide.get("left") },
      { side: "right", players: teamsBySide.get("right") },
    ],
    warnings,
  };
}

async function analyzeResultImage(imageDataUrl) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new VisionError(
      "AI result scanning is not configured. Add GEMINI_API_KEY to the Vercel environment and redeploy.",
      503,
    );
  }
  const imageMatch = imageDataUrl.match(
    /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (!imageMatch) {
    throw new VisionError("Upload a valid JPEG, PNG, or WebP screenshot.", 400);
  }

  let response;
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const client = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: 45000 },
    });
    response = await client.models.generateContent({
      model: process.env.GEMINI_MODEL || MODEL,
      contents: [{
        role: "user",
        parts: [
          { text: EXTRACTION_PROMPT },
          {
            inlineData: {
              mimeType: `image/${imageMatch[1]}`,
              data: imageMatch[2],
            },
            mediaResolution: "MEDIA_RESOLUTION_HIGH",
          },
        ],
      }],
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            readable: { type: "BOOLEAN" },
            result: { type: "STRING", enum: ["victory", "defeat"] },
            formatted_response: { type: "STRING" },
            teams: {
              type: "ARRAY",
              minItems: 2,
              maxItems: 2,
              items: {
                type: "OBJECT",
                properties: {
                  side: { type: "STRING", enum: ["left", "right"] },
                  players: {
                    type: "ARRAY",
                    minItems: 5,
                    maxItems: 5,
                    items: {
                      type: "OBJECT",
                      properties: {
                        ign: { type: "STRING" },
                        rating: { type: "NUMBER" },
                      },
                      required: ["ign", "rating"],
                      propertyOrdering: ["ign", "rating"],
                    },
                  },
                },
                required: ["side", "players"],
                propertyOrdering: ["side", "players"],
              },
            },
            warnings: { type: "ARRAY", items: { type: "STRING" } },
          },
          required: ["readable", "result", "formatted_response", "teams", "warnings"],
          propertyOrdering: ["readable", "result", "formatted_response", "teams", "warnings"],
        },
      },
    });
  } catch (error) {
    if (error instanceof VisionError) throw error;
    const status = Number(error.status || error.statusCode);
    if (error.name === "TimeoutError" || error.name === "AbortError" || status === 504) {
      throw new VisionError(
        "The Gemini scan timed out. Try again with a smaller or clearer image.",
        504,
      );
    }
    console.error("Could not complete Gemini image analysis:", error.message || error);
    if (status === 400 || status === 404) {
      throw new VisionError(
        "Gemini could not process this request. Check the configured Gemini model and try again.",
        502,
      );
    }
    if (status === 401 || status === 403) {
      throw new VisionError(
        "Gemini rejected the API key. Check GEMINI_API_KEY in Vercel.",
        502,
      );
    }
    if (status === 429) {
      throw new VisionError(
        "Gemini is rate-limited. Wait a moment and try again.",
        503,
      );
    }
    throw new VisionError(
      "Could not complete the Gemini scan. Check Vercel Function Logs and try again.",
      502,
    );
  }

  const extraction = parseModelContent(response.text);
  return validateExtraction(extraction);
}

module.exports = { analyzeResultImage, validateExtraction, VisionError };
