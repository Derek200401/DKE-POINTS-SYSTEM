const POLL_INTERVAL = 4000;
const MAX_POINTS = 1000000;

const state = {
  players: [],
  isAdmin: false,
  editingPlayer: null,
  loading: false,
};

const elements = {
  adminControls: document.querySelector("#admin-controls"),
  loginModal: document.querySelector("#login-modal"),
  loginForm: document.querySelector("#login-form"),
  loginMessage: document.querySelector("#login-message"),
  playerModal: document.querySelector("#player-modal"),
  playerForm: document.querySelector("#player-form"),
  playerMessage: document.querySelector("#player-message"),
  playerModalTitle: document.querySelector("#player-modal-title"),
  playerModalDescription: document.querySelector("#player-modal-description"),
  playerSubmit: document.querySelector("#player-submit"),
  leaderboardBody: document.querySelector("#leaderboard-body"),
  emptyState: document.querySelector("#empty-state"),
  noResults: document.querySelector("#no-results"),
  search: document.querySelector("#search-input"),
  liveIndicator: document.querySelector(".connection-state"),
  liveLabel: document.querySelector("#live-label"),
  lastUpdated: document.querySelector("#last-updated"),
  actionsHeading: document.querySelector("#actions-heading"),
  addResultButton: document.querySelector("#add-result-button"),
  uploadResultModal: document.querySelector("#result-upload-modal"),
  uploadResultForm: document.querySelector("#result-upload-form"),
  resultImage: document.querySelector("#result-image"),
  resultImagePreview: document.querySelector("#result-image-preview"),
  uploadResultMessage: document.querySelector("#result-upload-message"),
  scanResultSubmit: document.querySelector("#result-scan-submit"),
  reviewResultModal: document.querySelector("#result-review-modal"),
  reviewResultForm: document.querySelector("#result-review-form"),
  reviewWinnerSide: document.querySelector("#result-winner-side"),
  reviewPlayerList: document.querySelector("#result-review-list"),
  reviewResultWarning: document.querySelector("#result-review-warning"),
  reviewResultMessage: document.querySelector("#result-review-message"),
  approveResultSubmit: document.querySelector("#result-approve-submit"),
};

let scannedSubmission = null;
let previewTimer = null;
let previewGeneration = 0;
let resultPreviewUrl = null;

function makeElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function setLive(isLive, label) {
  elements.liveIndicator.classList.toggle("is-error", !isLive);
  elements.liveLabel.textContent = label;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The server returned an unreadable response.");
  }
  if (!response.ok)
    throw new Error(result.error || "The request could not be completed.");
  return result;
}

function getFilteredPlayers() {
  const query = elements.search.value.trim().toLocaleLowerCase();
  if (!query) return state.players;
  return state.players.filter((player) =>
    player.ign.toLocaleLowerCase().includes(query),
  );
}

function renderStats() {
  document.querySelector("#player-count").textContent = String(state.players.length);
  document.querySelector("#total-points").textContent = state.players
    .reduce((sum, player) => sum + player.points, 0)
    .toLocaleString();
  const leader = state.players[0];
  document.querySelector("#leader-name").textContent = leader
    ? leader.ign
    : "No players yet";
}

function renderLeaderboard() {
  const players = getFilteredPlayers();
  elements.leaderboardBody.replaceChildren();
  elements.emptyState.hidden = state.players.length > 0;
  elements.noResults.hidden = state.players.length === 0 || players.length > 0;
  elements.actionsHeading.hidden = !state.isAdmin;
  document.querySelector("#add-player-button").hidden = !state.isAdmin;
  elements.addResultButton.hidden = !state.isAdmin;

  players.forEach((player) => {
    const row = document.createElement("tr");
    const rank = makeElement(
      "td",
      `rank-cell${player === state.players[0] ? " is-first" : ""}`,
      String(state.players.indexOf(player) + 1),
    );
    const playerCell = document.createElement("td");
    const identity = makeElement("div", "player-cell");
    const initials = player.ign.trim().slice(0, 2) || "?";
    identity.append(
      makeElement("span", "player-avatar", initials),
      makeElement("span", "", player.ign),
    );
    playerCell.append(identity);
    const points = document.createElement("td");
    points.className = "points-cell";
    points.append(
      document.createTextNode(player.points.toLocaleString()),
      makeElement("span", "", "PTS"),
    );
    row.append(rank, playerCell, points);

    if (state.isAdmin) {
      const action = makeElement("td", "actions-cell");
      const editButton = makeElement("button", "icon-button", "Edit");
      editButton.setAttribute("aria-label", `Edit points for ${player.ign}`);
      editButton.type = "button";
      editButton.addEventListener("click", () => openPlayerModal(player));
      action.append(editButton);
      row.append(action);
    }
    elements.leaderboardBody.append(row);
  });
  renderStats();
}

function renderAdminControls() {
  elements.adminControls.replaceChildren();
  if (state.isAdmin) {
    const status = makeElement("span", "admin-label", "Admin");
    const logout = makeElement("button", "button button-quiet", "Sign out");
    logout.type = "button";
    logout.addEventListener("click", signOut);
    elements.adminControls.append(status, logout);
  } else {
    const login = makeElement("button", "button", "Admin sign in");
    login.id = "admin-login-button";
    login.type = "button";
    login.addEventListener("click", () => {
      elements.loginMessage.textContent = "";
      elements.loginModal.showModal();
      document.querySelector("#admin-username").focus();
    });
    elements.adminControls.append(login);
  }
}

async function loadPlayers() {
  if (state.loading) return;
  state.loading = true;
  try {
    const result = await request("/api/points");
    state.players = result.players;
    renderLeaderboard();
    setLive(true, "Live");
    elements.lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch (error) {
    setLive(false, "Connection issue");
    elements.lastUpdated.textContent = error.message;
  } finally {
    state.loading = false;
  }
}

async function checkAdminSession() {
  try {
    const result = await request("/api/admin/session");
    state.isAdmin = result.authenticated;
    renderAdminControls();
    renderLeaderboard();
  } catch {
    state.isAdmin = false;
    renderAdminControls();
  }
}

function openPlayerModal(player = null) {
  state.editingPlayer = player;
  elements.playerForm.reset();
  elements.playerMessage.textContent = "";
  elements.playerModalTitle.textContent = player ? "Edit player points" : "Add player";
  elements.playerModalDescription.textContent = player
    ? `Set the new total for ${player.ign}.`
    : "Add an IGN to the leaderboard and set their starting points.";
  document.querySelector("#player-ign").value = player ? player.ign : "";
  document.querySelector("#player-ign").readOnly = Boolean(player);
  document.querySelector("#player-points").value = player ? player.points : 0;
  elements.playerSubmit.textContent = player ? "Save points" : "Add player";
  elements.playerModal.showModal();
  document.querySelector(player ? "#player-points" : "#player-ign").focus();
}

async function signOut() {
  try {
    await request("/api/admin/logout", { method: "POST" });
    state.isAdmin = false;
    renderAdminControls();
    renderLeaderboard();
  } catch (error) {
    elements.lastUpdated.textContent = error.message;
  }
}

function openResultUpload() {
  if (resultPreviewUrl) URL.revokeObjectURL(resultPreviewUrl);
  resultPreviewUrl = null;
  elements.uploadResultForm.reset();
  elements.uploadResultMessage.textContent = "";
  elements.resultImagePreview.hidden = true;
  elements.resultImagePreview.removeAttribute("src");
  scannedSubmission = null;
  elements.uploadResultModal.showModal();
  elements.resultImage.focus();
}

async function prepareResultImage(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP screenshot.");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 12 MB.");
  }

  let bitmap;
  let source;
  let objectUrl;
  try {
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(file);
      source = bitmap;
    } else {
      objectUrl = URL.createObjectURL(file);
      source = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("The selected image could not be opened."));
        image.src = objectUrl;
      });
    }
    const sourceLongestEdge = Math.max(source.width, source.height);
    const scale = Math.min(1.75, 3600 / sourceLongestEdge);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare the screenshot.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.filter = "contrast(1.18) brightness(1.04)";
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    context.filter = "none";

    for (const quality of [0.94, 0.9, 0.86, 0.82, 0.78, 0.72]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= 2750000) return dataUrl;
    }
    throw new Error("This screenshot is too large to scan. Choose a smaller image.");
  } finally {
    if (bitmap) bitmap.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function addReviewPlayer(player = {}) {
  const sideValue = player.side || "left";
  const sideCount = [...elements.reviewPlayerList.querySelectorAll(".result-review-side")]
    .filter((side) => side.value === sideValue).length;
  if (sideCount >= 5) {
    elements.reviewResultMessage.textContent = `There are already five ${sideValue === "left" ? "blue-team" : "red-team"} players. Remove a row before adding another.`;
    return;
  }
  elements.reviewResultMessage.textContent = "";
  const row = document.createElement("div");
  row.className = "result-review-row";

  const side = document.createElement("select");
  side.className = "field-input result-review-side";
  side.setAttribute("aria-label", "Team side");
  [["left", "Left / blue"], ["right", "Right / red"]].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    side.append(option);
  });
  side.value = player.side || "left";

  const ign = document.createElement("input");
  ign.className = "field-input result-review-ign";
  ign.type = "text";
  ign.maxLength = 40;
  ign.required = true;
  ign.autocomplete = "off";
  ign.setAttribute("aria-label", "Player IGN");
  ign.value = player.ign || "";
  ign.placeholder = "Exact IGN";

  const rating = document.createElement("input");
  rating.className = "field-input result-review-rating";
  rating.type = "number";
  rating.min = "0";
  rating.max = "30";
  rating.step = "0.1";
  rating.required = true;
  rating.setAttribute("aria-label", "Performance rating");
  rating.value = player.rating ?? "";

  const award = document.createElement("span");
  award.className = "result-review-award";
  award.textContent = "Checking points…";

  const remove = document.createElement("button");
  remove.className = "icon-button result-review-remove";
  remove.type = "button";
  remove.textContent = "×";
  remove.setAttribute("aria-label", "Remove participant");
  remove.addEventListener("click", () => {
    row.remove();
    scheduleResultPreview();
  });

  row.append(side, ign, rating, award, remove);
  elements.reviewPlayerList.append(row);
}

function getReviewInput() {
  return {
    winnerSide: elements.reviewWinnerSide.value,
    players: [...elements.reviewPlayerList.querySelectorAll(".result-review-row")].map((row) => {
      const rating = row.querySelector(".result-review-rating").value.trim();
      return {
        side: row.querySelector(".result-review-side").value,
        ign: row.querySelector(".result-review-ign").value,
        rating: rating ? Number(rating) : null,
      };
    }),
  };
}

function scheduleResultPreview() {
  window.clearTimeout(previewTimer);
  const generation = ++previewGeneration;
  const sides = [...elements.reviewPlayerList.querySelectorAll(".result-review-side")];
  const blueCount = sides.filter((side) => side.value === "left").length;
  const redCount = sides.filter((side) => side.value === "right").length;
  elements.reviewResultWarning.textContent =
    `AI detected the ${elements.reviewWinnerSide.value === "left" ? "blue/left" : "red/right"} team as the winner. Roster: Blue ${blueCount}/5 · Red ${redCount}/5.`;
  elements.approveResultSubmit.disabled = true;
  elements.reviewResultMessage.textContent = "";
  elements.reviewPlayerList.querySelectorAll(".result-review-award").forEach((element) => {
    element.textContent = "Checking points…";
  });

  previewTimer = window.setTimeout(async () => {
    try {
      const result = await request("/api/admin/results", {
        method: "POST",
        body: JSON.stringify({ action: "preview", ...getReviewInput() }),
      });
      if (generation !== previewGeneration) return;
      const rows = [...elements.reviewPlayerList.querySelectorAll(".result-review-row")];
      result.awards.forEach((award, index) => {
        rows[index].querySelector(".result-review-award").textContent = `${award.medal} · ${award.points} pts`;
      });
      elements.approveResultSubmit.disabled = !scannedSubmission;
    } catch (error) {
      if (generation !== previewGeneration) return;
      elements.reviewResultMessage.textContent = error.message;
    }
  }, 200);
}

elements.addResultButton.addEventListener("click", openResultUpload);
elements.resultImage.addEventListener("change", () => {
  const file = elements.resultImage.files[0];
  if (!file) {
    elements.resultImagePreview.hidden = true;
    return;
  }
  if (resultPreviewUrl) URL.revokeObjectURL(resultPreviewUrl);
  resultPreviewUrl = URL.createObjectURL(file);
  elements.resultImagePreview.src = resultPreviewUrl;
  elements.resultImagePreview.hidden = false;
});

elements.uploadResultForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.uploadResultMessage.textContent = "";
  const file = elements.resultImage.files[0];
  if (!file) {
    elements.uploadResultMessage.textContent = "Choose a result screenshot first.";
    return;
  }
  elements.scanResultSubmit.disabled = true;
  elements.scanResultSubmit.textContent = "Enhancing image…";
  try {
    const image = await prepareResultImage(file);
    elements.scanResultSubmit.textContent = "Scanning with AI…";
    const result = await request("/api/admin/results", {
      method: "POST",
      body: JSON.stringify({ action: "analyze", image }),
    });
    scannedSubmission = { imageHash: result.imageHash };
    elements.reviewWinnerSide.value = result.winnerSide;
    elements.reviewPlayerList.replaceChildren();
    result.participants.forEach(addReviewPlayer);
    elements.reviewResultWarning.textContent = [
      `AI detected ${result.result.toUpperCase()} — ${result.winnerSide === "left" ? "blue team wins" : "red team wins"}. Roster: Blue 5/5 · Red 5/5.`,
      ...(result.warnings || []),
    ].join(" ");
    elements.reviewResultMessage.textContent = "";
    elements.uploadResultModal.close();
    elements.reviewResultModal.showModal();
    scheduleResultPreview();
  } catch (error) {
    elements.uploadResultMessage.textContent = error.message;
  } finally {
    elements.scanResultSubmit.disabled = false;
    elements.scanResultSubmit.textContent = "Scan screenshot";
  }
});

elements.reviewWinnerSide.addEventListener("change", scheduleResultPreview);
elements.reviewPlayerList.addEventListener("input", scheduleResultPreview);
elements.reviewPlayerList.addEventListener("change", scheduleResultPreview);
document.querySelector("#add-left-result-player").addEventListener("click", () => {
  addReviewPlayer({ side: "left" });
  scheduleResultPreview();
});
document.querySelector("#add-right-result-player").addEventListener("click", () => {
  addReviewPlayer({ side: "right" });
  scheduleResultPreview();
});
elements.reviewPlayerList.addEventListener("change", (event) => {
  if (!event.target.matches(".result-review-side")) return;
  const sideCount = [...elements.reviewPlayerList.querySelectorAll(".result-review-side")]
    .filter((side) => side.value === event.target.value).length;
  if (sideCount > 5) {
    event.target.value = event.target.value === "left" ? "right" : "left";
    elements.reviewResultMessage.textContent = "Each team must contain exactly five players.";
    scheduleResultPreview();
  }
});
elements.reviewResultForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!scannedSubmission) return;
  elements.approveResultSubmit.disabled = true;
  elements.approveResultSubmit.textContent = "Applying points…";
  elements.reviewResultMessage.textContent = "";
  let applied = false;
  try {
    await request("/api/admin/results", {
      method: "POST",
      body: JSON.stringify({
        action: "apply",
        imageHash: scannedSubmission.imageHash,
        ...getReviewInput(),
      }),
    });
    scannedSubmission = null;
    applied = true;
    elements.reviewResultModal.close();
    await loadPlayers();
  } catch (error) {
    elements.reviewResultMessage.textContent = error.message;
  } finally {
    elements.approveResultSubmit.textContent = "Approve & add points";
    if (applied) {
      elements.approveResultSubmit.disabled = true;
    } else {
      elements.approveResultSubmit.disabled = !scannedSubmission;
    }
  }
});

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.loginMessage.textContent = "";
  const form = new FormData(elements.loginForm);
  const submit = elements.loginForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await request("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
      }),
    });
    elements.loginModal.close();
    elements.loginForm.reset();
    state.isAdmin = true;
    renderAdminControls();
    renderLeaderboard();
  } catch (error) {
    elements.loginMessage.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

elements.playerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.playerMessage.textContent = "";
  const ign = document.querySelector("#player-ign").value.trim();
  const points = Number(document.querySelector("#player-points").value);
  if (!ign || ign.length > 40) {
    elements.playerMessage.textContent =
      "Enter an IGN between 1 and 40 characters.";
    return;
  }
  if (!Number.isInteger(points) || points < 0 || points > MAX_POINTS) {
    elements.playerMessage.textContent = `Points must be a whole number from 0 to ${MAX_POINTS.toLocaleString()}.`;
    return;
  }

  const submit = elements.playerSubmit;
  submit.disabled = true;
  try {
    if (state.editingPlayer) {
      await request("/api/admin/players", {
        method: "PATCH",
        body: JSON.stringify({ id: state.editingPlayer.id, points }),
      });
    } else {
      await request("/api/admin/players", {
        method: "POST",
        body: JSON.stringify({ ign, points }),
      });
    }
    elements.playerModal.close();
    await loadPlayers();
  } catch (error) {
    elements.playerMessage.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

document.querySelector("#add-player-button").addEventListener("click", () => openPlayerModal());
elements.search.addEventListener("input", renderLeaderboard);
document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});
elements.loginModal.addEventListener("click", (event) => {
  if (event.target === elements.loginModal) elements.loginModal.close();
});
elements.playerModal.addEventListener("click", (event) => {
  if (event.target === elements.playerModal) elements.playerModal.close();
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
  ) {
    event.preventDefault();
    elements.search.focus();
  }
});

renderAdminControls();
renderLeaderboard();
loadPlayers();
checkAdminSession();
window.setInterval(loadPlayers, POLL_INTERVAL);
