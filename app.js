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
};

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
