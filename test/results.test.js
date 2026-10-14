const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateAwards } = require("../lib/results");

function awardByName(awards, ign) {
  return awards.find((award) => award.ign === ign);
}

test("calculates winning-team medals and both Supreme awards", () => {
  const awards = calculateAwards({
    winnerSide: "left",
    players: [
      { ign: "Top", side: "left", rating: 10.2 },
      { ign: "Supreme", side: "left", rating: 10.1 },
      { ign: "Gold", side: "left", rating: 10 },
      { ign: "Silver", side: "left", rating: 7 },
      { ign: "Bronze", side: "left", rating: 3 },
      { ign: "Opponent", side: "right", rating: 4 },
      { ign: "Opponent 2", side: "right", rating: 4 },
      { ign: "Opponent 3", side: "right", rating: 4 },
      { ign: "Opponent 4", side: "right", rating: 4 },
      { ign: "Opponent 5", side: "right", rating: 4 },
    ],
  });

  assert.deepEqual(
    awards.slice(0, 5).map(({ medal, points }) => [medal, points]),
    [
      ["Supreme MVP", 12],
      ["Supreme", 7],
      ["Gold", 7],
      ["Silver", 5],
      ["Bronze", 3],
    ],
  );
});

test("calculates losing-team medals, MVP Loss, and zero-point ratings", () => {
  const awards = calculateAwards({
    winnerSide: "right",
    players: [
      { ign: "Loss MVP", side: "left", rating: 9.9 },
      { ign: "Gold", side: "left", rating: 7.1 },
      { ign: "Silver", side: "left", rating: 7 },
      { ign: "Bronze", side: "left", rating: 4 },
      { ign: "Low", side: "left", rating: 2.9 },
      { ign: "Winner", side: "right", rating: 8.4 },
      { ign: "Winner 2", side: "right", rating: 8 },
      { ign: "Winner 3", side: "right", rating: 7 },
      { ign: "Winner 4", side: "right", rating: 6 },
      { ign: "Winner 5", side: "right", rating: 5 },
    ],
  });

  assert.deepEqual(
    awards.slice(0, 5).map(({ medal, points }) => [medal, points]),
    [
      ["MVP Loss", 10],
      ["Gold", 5],
      ["Silver", 3],
      ["Bronze", 2],
      ["No medal", 0],
    ],
  );
});

test("awards MVP to each player tied for the team's highest rating", () => {
  const awards = calculateAwards({
    winnerSide: "left",
    players: [
      { ign: "One", side: "left", rating: 8.4 },
      { ign: "Two", side: "left", rating: 8.4 },
      { ign: "Third", side: "left", rating: 7.1 },
      { ign: "Fourth", side: "left", rating: 5 },
      { ign: "Fifth", side: "left", rating: 4 },
      { ign: "Other", side: "right", rating: 6.6 },
      { ign: "Other 2", side: "right", rating: 5 },
      { ign: "Other 3", side: "right", rating: 4 },
      { ign: "Other 4", side: "right", rating: 3 },
      { ign: "Other 5", side: "right", rating: 2 },
    ],
  });

  assert.equal(awardByName(awards, "One").points, 12);
  assert.equal(awardByName(awards, "Two").points, 12);
  assert.equal(awardByName(awards, "Other").points, 10);
});

test("rejects ambiguous ratings and duplicate IGN values", () => {
  assert.throws(
    () =>
      calculateAwards({
        winnerSide: "left",
        players: [
          { ign: "One", side: "left", rating: 4.05 },
          { ign: "One 2", side: "left", rating: 4 },
          { ign: "One 3", side: "left", rating: 4 },
          { ign: "One 4", side: "left", rating: 4 },
          { ign: "One 5", side: "left", rating: 4 },
          { ign: "Two", side: "right", rating: 4.1 },
          { ign: "Two 2", side: "right", rating: 4 },
          { ign: "Two 3", side: "right", rating: 4 },
          { ign: "Two 4", side: "right", rating: 4 },
          { ign: "Two 5", side: "right", rating: 4 },
        ],
      }),
    /one-decimal rating/,
  );

  assert.throws(
    () =>
      calculateAwards({
        winnerSide: "left",
        players: [
          { ign: "Same", side: "left", rating: 4 },
          { ign: " same ", side: "left", rating: 4 },
          { ign: "Three", side: "left", rating: 4 },
          { ign: "Four", side: "left", rating: 4 },
          { ign: "Five", side: "left", rating: 4 },
          { ign: "Red 1", side: "right", rating: 4 },
          { ign: "Red 2", side: "right", rating: 4 },
          { ign: "Red 3", side: "right", rating: 4 },
          { ign: "Red 4", side: "right", rating: 4 },
          { ign: "Red 5", side: "right", rating: 4 },
        ],
      }),
    /appears more than once/,
  );
});

test("requires exactly five players on each team before calculating awards", () => {
  const players = [
    { ign: "Blue 1", side: "left", rating: 8 },
    { ign: "Blue 2", side: "left", rating: 7 },
    { ign: "Blue 3", side: "left", rating: 6 },
    { ign: "Blue 4", side: "left", rating: 5 },
    { ign: "Blue 5", side: "left", rating: 4 },
    { ign: "Red 1", side: "right", rating: 8 },
    { ign: "Red 2", side: "right", rating: 7 },
    { ign: "Red 3", side: "right", rating: 6 },
    { ign: "Red 4", side: "right", rating: 5 },
  ];
  assert.throws(
    () => calculateAwards({ winnerSide: "left", players }),
    /exactly five blue-team and five red-team players/,
  );
});
