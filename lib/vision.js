const API_URL = "https://vyceai.com/v1/chat/completions";
const MODEL = "deepseek-v4.1";

const EXTRACTION_PROMPT = [
  "Please scan this Mobile Legends scoreboard image and list the IGN (In-Game Name) and rating score for all 10 players.",
  "",
  "Use this exact text layout in the formatted_response field:",
  "Here are the rating scores for each player based on the end-of-game scoreboard:",
  "",
  "Winning Team (Left or Right, whichever side actually won):",
  "1. [IGN]: [Rating Score]",
  "2. [IGN]: [Rating Score]",
  "3. [IGN]: [Rating Score]",
  "4. [IGN]: [Rating Score]",
  "5. [IGN]: [Rating Score]",
  "",
  "Losing Team (the opposite physical side):",
  "1. [IGN]: [Rating Score]",
  "2. [IGN]: [Rating Score]",
  "3. [IGN]: [Rating Score]",
  "4. [IGN]: [Rating Score]",
  "5. [IGN]: [Rating Score]",
  "",
  "Notes:",
  "- Capture all special symbols, non-standard fonts, and characters in the IGNs accurately.",
  "- Add (MVP) next to the player with the highest score on the winning team, wherever that player appears in the five-player list.",
  "- Winning Team may be on the LEFT or the RIGHT. Determine the winning physical side from the screenshot; never assume that the left team won or that the right team lost.",
  "- Keep physical sides exact: left is the left/blue roster shown in the image; right is the right/red roster shown in the image. Do not swap the rosters to make the winner appear on the left.",
  "- Read the Victory/Defeat result banner and inspect the visible team-side winner indicators independently. Return result as the banner text (victory or defeat) and winner_side as the physical side (left or right) that actually won. Do not derive winner_side from result alone or from kills. If the winning side cannot be determined confidently from the screenshot, set readable=false and explain in warnings.",
  "- Include all five players on each physical side. If even one IGN, rating, team side, winner side, or result banner is unclear, set readable=false and explain in warnings. Never guess, autocorrect, normalize, or omit text.",
  "- Copy every IGN character exactly, including capitalization, spaces, punctuation, decorative glyphs, and symbols.",
  "- The rating is the one-decimal performance score shown below each player's medal, not K/D/A, gold, hero level, or the medal icon.",
  "- Inspect the scoreboard closely as if zooming into the player rows. Prioritize the small IGN text and one-decimal ratings; use the image detail rather than guessing from context.",
  "- Image enhancement cannot restore details that are not visible. If text is still unclear after close inspection, set readable=false instead of inventing or autocorrecting it.",
  "- Return ONLY a valid JSON object with readable, result, winner_side, formatted_response, teams, and warnings fields. Set winner_side to left or right. Include exactly two teams with side values left and right and five players on each; each player must contain their exact ign and numeric rating.",
  "- In formatted_response, label the actual winner's physical side as Winning Team (Left) or Winning Team (Right), label the other side as Losing Team, and include (MVP) next to the highest-rated player on the winning team.",
  "- Do not invent or calculate points. The website's server calculates official medal points from validated ratings, and the admin reviews the IGN, rating, and calculated points before approving them.",
].join("\n");

class VisionError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

function parseModelContent(content) {
  const text = Array.isArray(content)
    ? content.map((part) => typeof part?.text === "string" ? part.text : "").join("\n")
    : typeof content === "string"
      ? content
      : "";
  if (!text.trim()) {
    throw new VisionError(
      "VyceAI returned an empty result. Try a clearer screenshot.",
      422,
    );
  }
  try {
    const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      return JSON.parse(normalized);
    } catch (directParseError) {
      const start = normalized.indexOf("{");
      if (start < 0) throw directParseError;
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let index = start; index < normalized.length; index += 1) {
        const character = normalized[index];
        if (inString) {
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === "\"") inString = false;
          continue;
        }
        if (character === "\"") inString = true;
        else if (character === "{") depth += 1;
        else if (character === "}") {
          depth -= 1;
          if (depth === 0) {
            return JSON.parse(normalized.slice(start, index + 1));
          }
        }
      }
      throw directParseError;
    }
  } catch {
    throw new VisionError(
      "VyceAI returned text that did not contain a valid player-data JSON response. Try scanning again; if it repeats, check the Vercel Function Logs.",
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
      "The AI could not identify the Victory or Defeat label. Upload the full results screenshot.",
      422,
    );
  }
  if (!["left", "right"].includes(extraction.winner_side)) {
    throw new VisionError(
      "The AI could not determine which physical side won. Check the result screen and scan again.",
      422,
    );
  }
  if (!Array.isArray(extraction.teams) || extraction.teams.length !== 2) {
    throw new VisionError(
      "The AI did not return both complete five-player teams. Upload the full results screenshot.",
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
        "The AI could not separate the blue and red teams. Upload the full screenshot.",
        422,
      );
    }
    if (team.players.length !== 5) {
      throw new VisionError(
        `The AI read ${team.players.length} players for the ${team.side === "left" ? "blue" : "red"} team; exactly five are required. Try a clearer, uncropped screenshot.`,
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
      "The AI could not identify both the blue and red teams. Upload the full screenshot.",
      422,
    );
  }

  const warnings = Array.isArray(extraction.warnings)
    ? extraction.warnings.filter((warning) => typeof warning === "string").slice(0, 5)
    : [];
  return {
    result,
    winnerSide: extraction.winner_side,
    teams: [
      { side: "left", players: teamsBySide.get("left") },
      { side: "right", players: teamsBySide.get("right") },
    ],
    warnings,
  };
}

async function analyzeResultImage(imageDataUrl) {
  const apiKey = process.env.VYCEAI_API_KEY;
  if (!apiKey) {
    throw new VisionError(
      "AI result scanning is not configured. Add VYCEAI_API_KEY to the Vercel environment and redeploy.",
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
  let responseBody;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: EXTRACTION_PROMPT },
            {
              type: "image_url",
              image_url: {
                url: `data:image/${imageMatch[1]};base64,${imageMatch[2]}`,
              },
            },
          ],
        }],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(45000),
    });
    responseBody = await response.json().catch(() => null);
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new VisionError(
        "The VyceAI scan timed out. Try again with a smaller or clearer image.",
        504,
      );
    }
    console.error("VyceAI request failed before a response was received:", {
      errorName: error.name,
      message: error.message || String(error),
    });
    throw new VisionError(
      "Could not connect to VyceAI. Check Vercel Function Logs and try again.",
      502,
    );
  }

  if (!response.ok) {
    const providerMessage = responseBody?.error?.message || responseBody?.error || "No error details returned.";
    console.error("VyceAI returned an error:", {
      model: MODEL,
      status: response.status,
      message: typeof providerMessage === "string" ? providerMessage : JSON.stringify(providerMessage),
    });
    if (response.status === 401 || response.status === 403) {
      throw new VisionError("VyceAI rejected its API key. Check VYCEAI_API_KEY in Vercel.", 502);
    }
    if (response.status === 404) {
      throw new VisionError(`VyceAI could not find the "${MODEL}" model. Check model access in your VyceAI account.`, 502);
    }
    if (response.status === 429) {
      throw new VisionError("VyceAI is rate-limited or the account quota is exhausted. Check VyceAI usage and try again later.", 503);
    }
    throw new VisionError(
      `VyceAI rejected the scan request (HTTP ${response.status}). Check Function Logs and verify the model and account access.`,
      502,
    );
  }

  const extraction = parseModelContent(responseBody?.choices?.[0]?.message?.content);
  return validateExtraction(extraction);
}

module.exports = { analyzeResultImage, validateExtraction, VisionError };
