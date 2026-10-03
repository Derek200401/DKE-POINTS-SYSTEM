const POLL_INTERVAL = 5000;
const state = {
  tournament: null,
  isAdmin: false,
  loading: false,
  zoom: 1,
  seeds: [],
  leaderboardSeeds: null,
};

const elements = {
  adminControls: document.querySelector("#tournament-admin-controls"),
  content: document.querySelector("#tournament-content"),
  message: document.querySelector("#tournament-message"),
  updated: document.querySelector("#tournament-updated"),
  loginModal: document.querySelector("#tournament-login-modal"),
  loginForm: document.querySelector("#tournament-login-form"),
  loginMessage: document.querySelector("#tournament-login-message"),
  setupModal: document.querySelector("#tournament-setup-modal"),
  setupForm: document.querySelector("#tournament-setup-form"),
  setupMessage: document.querySelector("#setup-message"),
  seedList: document.querySelector("#setup-seed-list"),
  participantInput: document.querySelector("#setup-participants"),
  participantCount: document.querySelector("#setup-count"),
};

elements.content.addEventListener("pointerdown", (event) => {
  const viewport = event.target.closest(".bracket-viewport");
  if (!viewport || event.target.closest("button, input, select, textarea, a")) return;
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const scrollLeft = viewport.scrollLeft;
  const scrollTop = viewport.scrollTop;
  const move = (moveEvent) => {
    viewport.scrollLeft = scrollLeft - (moveEvent.clientX - startX);
    viewport.scrollTop = scrollTop - (moveEvent.clientY - startY);
  };
  const finish = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish, { once: true });
  window.addEventListener("pointercancel", finish, { once: true });
});

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
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result;
}

function showMessage(message, isError = false) {
  elements.message.textContent = message;
  elements.message.hidden = !message;
  elements.message.classList.toggle("is-error", isError);
}

function setAdminControls() {
  elements.adminControls.replaceChildren();
  if (state.isAdmin) {
    const label = document.createElement("span");
    label.className = "admin-label";
    label.textContent = "Admin";
    const signOut = document.createElement("button");
    signOut.type = "button";
    signOut.className = "button button-quiet";
    signOut.textContent = "Sign out";
    signOut.addEventListener("click", logout);
    elements.adminControls.append(label, signOut);
    if (!state.tournament || state.tournament.status === "completed") {
      const create = document.createElement("button");
      create.type = "button";
      create.className = "button button-primary";
      create.textContent = state.tournament ? "New tournament" : "Create tournament";
      create.addEventListener("click", openSetup);
      elements.adminControls.append(create);
    }
  } else {
    const signIn = document.createElement("button");
    signIn.type = "button";
    signIn.className = "button";
    signIn.textContent = "Admin sign in";
    signIn.addEventListener("click", () => {
      elements.loginMessage.textContent = "";
      elements.loginModal.showModal();
      document.querySelector("#tournament-admin-username").focus();
    });
    elements.adminControls.append(signIn);
  }
}

async function checkSession() {
  try {
    const result = await request("/api/admin/session");
    state.isAdmin = result.authenticated;
  } catch {
    state.isAdmin = false;
  }
  setAdminControls();
  render();
}

async function loadTournament() {
  if (state.loading) return;
  state.loading = true;
  try {
    const result = await request("/api/tournament");
    const previous = state.tournament;
    const next = result.tournament;
    const changed = previous?.id !== next?.id || previous?.updatedAt !== next?.updatedAt;
    state.tournament = result.tournament;
    elements.updated.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    showMessage("");
    if (changed) {
      setAdminControls();
      render();
    } else {
      refreshCountdowns();
    }
  } catch (error) {
    elements.updated.textContent = "Unable to load tournament";
    showMessage(error.message, true);
  } finally {
    state.loading = false;
  }
}

function refreshCountdowns() {
  document.querySelectorAll("[data-countdown-time]").forEach((element) => {
    const secondsLeft = Math.ceil((Date.parse(element.dataset.countdownTime) - Date.now()) / 1000);
    element.textContent = secondsLeft > 0
      ? `Starts in ${Math.floor(secondsLeft / 3600)}h ${Math.floor((secondsLeft % 3600) / 60)}m`
      : "Scheduled time passed";
  });
}

function nameFor(id) {
  return state.tournament?.participants.find((participant) => participant.id === id)?.name || "";
}

function sourceLabel(source) {
  if (!source) return "TBD";
  const parent = state.tournament.matches.find((match) => match.id === source.matchId);
  const label = parent ? `Match ${parent.round}.${parent.position}` : "previous match";
  return `${source.result === "loser" ? "Loser" : "Winner"} of ${label}`;
}

function entrantLabel(match, side) {
  const id = match[`${side}Id`];
  if (id) return nameFor(id) || "Participant";
  return sourceLabel(match[`source${side.slice(-1)}`]);
}

function formatName(format) {
  return ({
    single_elimination: "Single elimination",
    double_elimination: "Double elimination",
    round_robin: "Round robin",
    swiss: "Swiss system",
  })[format] || format;
}

function matchFormula(tournament) {
  const count = tournament.participants.length;
  let total;
  if (tournament.settings.poolPlay) {
    const poolMatches = tournament.settings.groups.reduce((sum, group) =>
      sum + group.participantIds.length * (group.participantIds.length - 1) / 2, 0);
    const playoffCount = tournament.settings.groups.length * tournament.settings.qualifiersPerGroup;
    total = poolMatches + Math.max(0, playoffCount - 1);
  } else if (tournament.format === "single_elimination") {
    total = count - 1;
  } else if (tournament.format === "double_elimination") {
    total = `${2 * count - 2}–${2 * count - 1}`;
  } else if (tournament.format === "round_robin") {
    total = count * (count - 1) / 2;
  } else {
    total = tournament.settings.swissRounds * Math.floor(count / 2);
  }
  const playoffParticipants = tournament.settings.poolPlay
    ? tournament.settings.groups.length * tournament.settings.qualifiersPerGroup
    : count;
  if (tournament.settings.consolation && playoffParticipants >= 4) {
    total = typeof total === "number" ? total + 1 : `${total} + 1`;
  }
  return String(total);
}

function getStandings() {
  const tournament = state.tournament;
  const standingsMatches = tournament.matches.filter((match) =>
    tournament.settings.poolPlay
      ? match.stage === "group_stage"
      : match.stage === tournament.format);
  const rows = new Map(tournament.participants.map((participant) => [participant.id, {
    participant,
    played: 0,
    wins: 0,
    losses: 0,
    scoreFor: 0,
    scoreAgainst: 0,
    opponents: [],
    headToHead: new Map(),
  }]));
  standingsMatches.filter((match) => match.state === "completed" && match.winnerId && match.player1Id && match.player2Id).forEach((match) => {
    const first = rows.get(match.player1Id);
    const second = rows.get(match.player2Id);
    if (!first || !second) return;
    first.played += 1;
    second.played += 1;
    first.scoreFor += match.score1 || 0;
    first.scoreAgainst += match.score2 || 0;
    second.scoreFor += match.score2 || 0;
    second.scoreAgainst += match.score1 || 0;
    first.opponents.push(second.participant.id);
    second.opponents.push(first.participant.id);
    if (match.winnerId === first.participant.id) {
      first.wins += 1;
      second.losses += 1;
      first.headToHead.set(second.participant.id, 1);
      second.headToHead.set(first.participant.id, -1);
    } else {
      second.wins += 1;
      first.losses += 1;
      first.headToHead.set(second.participant.id, -1);
      second.headToHead.set(first.participant.id, 1);
    }
  });
  standingsMatches.filter((match) => match.stage === "swiss" && match.state === "completed" && match.player1Id && !match.player2Id).forEach((match) => {
    const row = rows.get(match.player1Id);
    if (row) {
      row.played += 1;
      row.wins += 1;
    }
  });
  const allRows = [...rows.values()].map((row) => {
    const opponentWins = row.opponents.map((id) => rows.get(id)?.wins || 0).sort((a, b) => a - b);
    const trimmed = opponentWins.length >= 3 ? opponentWins.slice(1, -1) : opponentWins;
    return {
      ...row,
      differential: row.scoreFor - row.scoreAgainst,
      buchholz: opponentWins.reduce((sum, value) => sum + value, 0),
      medianBuchholz: trimmed.reduce((sum, value) => sum + value, 0),
    };
  });
  allRows.sort((a, b) => (tournament.settings.poolPlay
      ? a.participant.groupId.localeCompare(b.participant.groupId)
      : 0)
    || b.wins - a.wins
    || (b.headToHead.get(a.participant.id) || 0) - (a.headToHead.get(b.participant.id) || 0)
    || b.differential - a.differential
    || b.buchholz - a.buchholz
    || b.medianBuchholz - a.medianBuchholz
    || a.participant.seed - b.participant.seed);
  return allRows;
}

function buildStandings() {
  const panel = document.createElement("section");
  panel.className = "panel standings-panel";
  const heading = document.createElement("div");
  heading.className = "panel-heading";
  const title = document.createElement("h2");
  title.className = "panel-title";
  title.textContent = "Live standings";
  heading.append(title);
  const wrapper = document.createElement("div");
  wrapper.className = "table-wrap";
  const table = document.createElement("table");
  const columns = ["#", "Participant", ...(state.tournament.settings.poolPlay ? ["Group"] : []), "W-L", "Diff", "Buchholz", "Median-BH"];
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  columns.forEach((column) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = column;
    headerRow.append(th);
  });
  thead.append(headerRow);
  const body = document.createElement("tbody");
  const groupRanks = new Map();
  getStandings().forEach((row, index) => {
    const groupRank = (groupRanks.get(row.participant.groupId) || 0) + 1;
    groupRanks.set(row.participant.groupId, groupRank);
    const tr = document.createElement("tr");
    const values = [
      String(state.tournament.settings.poolPlay ? groupRank : index + 1),
      row.participant.name,
      ...(state.tournament.settings.poolPlay ? [state.tournament.settings.groups.find((group) => group.id === row.participant.groupId)?.name || "—"] : []),
      `${row.wins}-${row.losses}`,
      String(row.differential),
      String(row.buchholz),
      String(row.medianBuchholz),
    ];
    values.forEach((value, cellIndex) => {
      const td = document.createElement("td");
      td.textContent = value;
      if (cellIndex === 0) td.className = `rank-cell${index === 0 ? " is-first" : ""}`;
      tr.append(td);
    });
    body.append(tr);
  });
  table.append(body);
  wrapper.append(table);
  panel.append(heading, wrapper);
  return panel;
}

function makeScoreForm(match) {
  const form = document.createElement("form");
  form.className = "match-score-form";
  form.setAttribute("aria-label", `Record score for match ${match.round}.${match.position}`);
  const input1 = document.createElement("input");
  const input2 = document.createElement("input");
  [input1, input2].forEach((input) => {
    input.type = "number";
    input.min = "0";
    input.max = String(Math.ceil(match.bestOf / 2));
    input.step = "1";
    input.required = true;
    input.className = "match-score-input";
    input.setAttribute("aria-label", "Sets won");
  });
  input1.value = match.score1 ?? "";
  input2.value = match.score2 ?? "";
  const separator = document.createElement("span");
  separator.textContent = "–";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "button button-primary match-save";
  submit.textContent = match.state === "completed"
    ? "Override"
    : match.state === "disputed" ? "Resolve dispute" : "Save result";
  form.append(input1, separator, input2, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await updateMatch({
      action: "result",
      matchId: match.id,
      score1: Number(input1.value),
      score2: Number(input2.value),
    });
  });
  return form;
}

function makeScheduleForm(match) {
  const form = document.createElement("form");
  form.className = "match-schedule-form";
  const time = document.createElement("input");
  time.type = "datetime-local";
  time.className = "field-input match-time";
  time.setAttribute("aria-label", "Scheduled time");
  if (match.scheduledTime) {
    const date = new Date(match.scheduledTime);
    time.value = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  const station = document.createElement("select");
  station.className = "field-input match-station";
  station.setAttribute("aria-label", "Station");
  const noStation = document.createElement("option");
  noStation.value = "";
  noStation.textContent = "No station";
  station.append(noStation);
  state.tournament.settings.stations.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    station.append(option);
  });
  station.value = match.stationId || "";
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "button button-quiet";
  save.textContent = "Save schedule";
  form.append(time, station, save);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await updateMatch({
      action: "schedule",
      matchId: match.id,
      scheduledTime: time.value ? new Date(time.value).toISOString() : null,
      stationId: station.value || null,
    });
  });
  return form;
}

function makeMatchCard(match) {
  const card = document.createElement("article");
  card.className = `match-card${match.state === "completed" ? " is-complete" : ""}${match.state === "disputed" ? " is-disputed" : ""}`;
  const header = document.createElement("div");
  header.className = "match-card-heading";
  const label = document.createElement("span");
  label.textContent = `Match ${match.round}.${match.position}`;
  const status = document.createElement("span");
  status.className = "match-state";
  status.textContent = match.state.replace("_", " ");
  header.append(label, status);
  const players = document.createElement("div");
  players.className = "match-players";
  [[entrantLabel(match, "player1"), match.player1Id, match.score1], [entrantLabel(match, "player2"), match.player2Id, match.score2]].forEach(([name, id, score], index) => {
    const row = document.createElement("div");
    row.className = `match-player${id && id === match.winnerId ? " is-winner" : ""}`;
    const nameSpan = document.createElement("span");
    nameSpan.textContent = name || "TBD";
    const scoreSpan = document.createElement("strong");
    scoreSpan.textContent = score === null ? (match.state === "completed" && !id ? "BYE" : "–") : String(score);
    row.append(nameSpan, scoreSpan);
    players.append(row);
  });
  card.append(header, players);
  if (match.scheduledTime) {
    const scheduleText = document.createElement("p");
    scheduleText.className = "match-meta";
    const station = state.tournament.settings.stations.find((item) => item.id === match.stationId)?.name;
    const timeText = new Date(match.scheduledTime).toLocaleString();
    const secondsLeft = Math.ceil((Date.parse(match.scheduledTime) - Date.now()) / 1000);
    scheduleText.textContent = `${timeText}${station ? ` · ${station}` : ""}`;
    if (secondsLeft > 0) {
      scheduleText.classList.add("match-countdown");
      const timer = document.createElement("span");
      timer.dataset.countdownTime = match.scheduledTime;
      timer.textContent = `Starts in ${Math.floor(secondsLeft / 3600)}h ${Math.floor((secondsLeft % 3600) / 60)}m`;
      scheduleText.append(" · ", timer);
    } else if (match.state === "scheduled") {
      scheduleText.append(" · Scheduled time passed");
    }
    card.append(scheduleText);
  } else if (match.stationId) {
    const stationText = document.createElement("p");
    stationText.className = "match-meta";
    stationText.textContent = state.tournament.settings.stations.find((item) => item.id === match.stationId)?.name || "";
    card.append(stationText);
  }
  if (!state.isAdmin) return card;

  if (match.state === "scheduled" && match.player1Id && match.player2Id) {
    const start = document.createElement("button");
    start.type = "button";
    start.className = "button button-quiet match-start";
    start.textContent = "Start match";
    start.addEventListener("click", () => updateMatch({ action: "start", matchId: match.id }));
    card.append(start);
  }
  if (match.player1Id && match.player2Id) card.append(makeScoreForm(match));
  if (match.player1Id && match.player2Id && state.isAdmin && match.state !== "completed") {
    const force = document.createElement("div");
    force.className = "match-force-actions";
    [[match.player1Id, entrantLabel(match, "player1")], [match.player2Id, entrantLabel(match, "player2")]].forEach(([winnerId, name]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-quiet match-force";
      button.textContent = `Force ${name}`;
      button.addEventListener("click", () => updateMatch({ action: "force", matchId: match.id, winnerId }));
      force.append(button);
    });
    card.append(force);
  }
  if (match.player1Id && match.player2Id) card.append(makeScheduleForm(match));
  if (match.state === "completed") {
    const dispute = document.createElement("button");
    dispute.type = "button";
    dispute.className = "button button-quiet match-dispute";
    dispute.textContent = match.state === "disputed" ? "Disputed" : "Flag dispute";
    dispute.disabled = match.state === "disputed";
    dispute.addEventListener("click", () => updateMatch({ action: "dispute", matchId: match.id }));
    card.append(dispute);
  }
  return card;
}

function matchGroups(tournament) {
  if (tournament.format === "single_elimination" || tournament.format === "round_robin" || tournament.format === "swiss") {
    const groups = new Map();
    tournament.matches.forEach((match) => {
      const key = match.bracket === "placement"
        ? "3rd place"
        : match.stage === "group_stage"
          ? `${match.groupName || "Group"} · Round ${match.round}`
          : `${match.stage === "swiss" ? "Swiss " : ""}Round ${match.round}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(match);
    });
    return [...groups.entries()];
  }
  const labels = { winners: "Winners bracket", losers: "Losers bracket", finals: "Grand final", reset_final: "Grand final reset", placement: "3rd place", playoff: "Playoff" };
  const groups = new Map();
  tournament.matches.forEach((match) => {
    const key = `${labels[match.bracket] || match.bracket} · Round ${match.round}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(match);
  });
  return [...groups.entries()];
}

function renderBracket() {
  const tournament = state.tournament;
  const viewport = document.createElement("div");
  viewport.className = "bracket-viewport";
  const canvas = document.createElement("div");
  canvas.className = "bracket-canvas";
  canvas.style.setProperty("--bracket-zoom", String(state.zoom));
  matchGroups(tournament).forEach(([headingText, matches]) => {
    const column = document.createElement("section");
    column.className = "bracket-round";
    const heading = document.createElement("h3");
    heading.textContent = headingText;
    const cards = document.createElement("div");
    cards.className = "bracket-round-matches";
    matches.forEach((match) => cards.append(makeMatchCard(match)));
    column.append(heading, cards);
    canvas.append(column);
  });
  viewport.append(canvas);
  const controls = document.createElement("div");
  controls.className = "bracket-controls";
  const zoomOut = document.createElement("button");
  zoomOut.type = "button";
  zoomOut.className = "button button-quiet";
  zoomOut.textContent = "−";
  zoomOut.setAttribute("aria-label", "Zoom out");
  const range = document.createElement("input");
  range.type = "range";
  range.min = "0.65";
  range.max = "1.25";
  range.step = "0.05";
  range.value = String(state.zoom);
  range.setAttribute("aria-label", "Bracket zoom");
  const zoomIn = document.createElement("button");
  zoomIn.type = "button";
  zoomIn.className = "button button-quiet";
  zoomIn.textContent = "+";
  zoomIn.setAttribute("aria-label", "Zoom in");
  const setZoom = (value) => {
    state.zoom = Math.min(1.25, Math.max(0.65, value));
    range.value = String(state.zoom);
    canvas.style.setProperty("--bracket-zoom", String(state.zoom));
  };
  zoomOut.addEventListener("click", () => setZoom(state.zoom - 0.1));
  zoomIn.addEventListener("click", () => setZoom(state.zoom + 0.1));
  range.addEventListener("input", () => setZoom(Number(range.value)));
  controls.append(zoomOut, range, zoomIn);
  const section = document.createElement("section");
  section.className = "panel bracket-panel";
  const heading = document.createElement("div");
  heading.className = "panel-heading";
  const title = document.createElement("h2");
  title.className = "panel-title";
  title.textContent = "Bracket";
  heading.append(title, controls);
  section.append(heading, viewport);
  return section;
}

function render() {
  elements.content.replaceChildren();
  if (!state.tournament) {
    const empty = document.createElement("section");
    empty.className = "panel empty-state tournament-empty";
    const title = document.createElement("h2");
    title.textContent = "No tournament yet";
    const copy = document.createElement("p");
    copy.textContent = state.isAdmin
      ? "Create a tournament to publish a read-only bracket for everyone."
      : "An admin has not created a tournament yet.";
    empty.append(title, copy);
    elements.content.append(empty);
    return;
  }
  const tournament = state.tournament;
  const summary = document.createElement("section");
  summary.className = "tournament-summary";
  const titlePanel = document.createElement("article");
  titlePanel.className = "summary-card tournament-title-card";
  const title = document.createElement("strong");
  title.className = "summary-value";
  title.textContent = tournament.title;
  const subtitle = document.createElement("span");
  subtitle.className = "summary-label";
  subtitle.textContent = `${formatName(tournament.format)} · ${tournament.participants.length} participants · Best of ${tournament.settings.bestOf}`;
  titlePanel.append(title, subtitle);
  const statusPanel = document.createElement("article");
  statusPanel.className = "summary-card";
  const statusLabel = document.createElement("span");
  statusLabel.className = "summary-label";
  statusLabel.textContent = "Status";
  const status = document.createElement("strong");
  status.className = "summary-value tournament-status";
  status.textContent = tournament.status;
  statusPanel.append(statusLabel, status);
  const matchPanel = document.createElement("article");
  matchPanel.className = "summary-card";
  const matchesLabel = document.createElement("span");
  matchesLabel.className = "summary-label";
  matchesLabel.textContent = "Total matches";
  const matchesValue = document.createElement("strong");
  matchesValue.className = "summary-value";
  matchesValue.textContent = matchFormula(tournament);
  matchPanel.append(matchesLabel, matchesValue);
  summary.append(titlePanel, statusPanel, matchPanel);
  elements.content.append(summary);

  if (["round_robin", "swiss"].includes(tournament.format) || tournament.settings.poolPlay) elements.content.append(buildStandings());
  elements.content.append(renderBracket());
  if (state.isAdmin && tournament.status !== "completed") {
    const actions = document.createElement("div");
    actions.className = "tournament-admin-footer";
    const note = document.createElement("span");
    note.className = "field-hint";
    note.textContent = "Result overrides can invalidate and reset downstream matches when the winner changes.";
    const finish = document.createElement("button");
    finish.type = "button";
    finish.className = "button button-quiet";
    finish.textContent = "Finish tournament";
    finish.addEventListener("click", () => {
      if (window.confirm("Finish this tournament? This allows a new tournament to be created.")) {
        updateMatch({ action: "finish" });
      }
    });
    actions.append(note, finish);
    elements.content.append(actions);
  }
}

async function updateMatch(body) {
  try {
    const result = await request("/api/admin/tournament", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    state.tournament = result.tournament;
    showMessage("");
    setAdminControls();
    render();
  } catch (error) {
    showMessage(error.message, true);
  }
}

function openSetup() {
  elements.setupMessage.textContent = "";
  elements.setupForm.reset();
  elements.participantCount.value = "8";
  document.querySelector("#setup-pool-play").disabled = false;
  document.querySelector("#pool-settings").hidden = true;
  state.seeds = [];
  renderSeedList();
  elements.setupModal.showModal();
}

function syncSeedsFromInput() {
  state.seeds = elements.participantInput.value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  renderSeedList();
}

function renderSeedList() {
  elements.seedList.replaceChildren();
  state.seeds.forEach((name, index) => {
    const item = document.createElement("li");
    item.className = "seed-item";
    item.draggable = true;
    item.dataset.seedIndex = String(index);
    item.tabIndex = 0;
    const number = document.createElement("strong");
    number.textContent = `#${index + 1}`;
    const label = document.createElement("span");
    label.textContent = name;
    item.append(number, label);
    item.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", String(index));
      event.dataTransfer.effectAllowed = "move";
      item.classList.add("is-dragging");
    });
    item.addEventListener("dragend", () => item.classList.remove("is-dragging"));
    item.addEventListener("dragover", (event) => event.preventDefault());
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      const from = Number(event.dataTransfer.getData("text/plain"));
      const [moved] = state.seeds.splice(from, 1);
      state.seeds.splice(index, 0, moved);
      elements.participantInput.value = state.seeds.join("\n");
      renderSeedList();
    });
    item.addEventListener("keydown", (event) => {
      if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const target = Math.min(state.seeds.length - 1, Math.max(0, index + (event.key === "ArrowUp" ? -1 : 1)));
      [state.seeds[index], state.seeds[target]] = [state.seeds[target], state.seeds[index]];
      elements.participantInput.value = state.seeds.join("\n");
      renderSeedList();
      elements.seedList.children[target]?.focus();
    });
    elements.seedList.append(item);
  });
  elements.participantCount.value = String(state.seeds.length || 8);
}

async function loadLeaderboardSeeds() {
  try {
    const result = await request("/api/points");
    if (!result.players.length) throw new Error("There are no leaderboard participants to seed.");
    state.leaderboardSeeds = result.players.map((player) => player.ign);
    state.seeds = [...state.leaderboardSeeds];
    elements.participantInput.value = state.seeds.join("\n");
    elements.participantCount.value = String(state.seeds.length);
    renderSeedList();
  } catch (error) {
    elements.setupMessage.textContent = error.message;
  }
}

async function logout() {
  try {
    await request("/api/admin/logout", { method: "POST" });
    state.isAdmin = false;
    setAdminControls();
    render();
  } catch (error) {
    showMessage(error.message, true);
  }
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.loginMessage.textContent = "";
  const data = new FormData(elements.loginForm);
  const submit = elements.loginForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await request("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ username: data.get("username"), password: data.get("password") }),
    });
    elements.loginModal.close();
    elements.loginForm.reset();
    state.isAdmin = true;
    setAdminControls();
    render();
  } catch (error) {
    elements.loginMessage.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

elements.setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.setupMessage.textContent = "";
  syncSeedsFromInput();
  const count = Number(elements.participantCount.value);
  if (state.seeds.length !== count) {
    elements.setupMessage.textContent = `Enter exactly ${count} participant names.`;
    return;
  }
  const seedingType = document.querySelector("#setup-seeding").value;
  let participantNames = [...state.seeds];
  const submit = elements.setupForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    if (seedingType === "rank") {
      const leaderboard = await request("/api/points");
      const rankByName = new Map(leaderboard.players.map((player, index) => [player.ign.toLocaleLowerCase(), index]));
      if (participantNames.some((name) => !rankByName.has(name.toLocaleLowerCase()))) {
          throw new Error("Every participant must already exist on the leaderboard to seed by rank.");
      }
      participantNames.sort((first, second) => rankByName.get(first.toLocaleLowerCase()) - rankByName.get(second.toLocaleLowerCase()));
    }
    const result = await request("/api/admin/tournament", {
      method: "POST",
      body: JSON.stringify({
          title: document.querySelector("#setup-title-input").value,
          participants: participantNames,
          format: document.querySelector("#setup-format").value,
          seedingType,
        settings: {
          bestOf: Number(document.querySelector("#setup-best-of").value),
          consolation: document.querySelector("#setup-consolation").checked,
          poolPlay: document.querySelector("#setup-pool-play").checked,
          groupCount: Number(document.querySelector("#setup-group-count").value),
          qualifiersPerGroup: Number(document.querySelector("#setup-qualifiers").value),
          stations: document.querySelector("#setup-stations").value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean),
        },
      }),
    });
    state.tournament = result.tournament;
    elements.setupModal.close();
    setAdminControls();
    render();
    showMessage("Tournament created.");
  } catch (error) {
    elements.setupMessage.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

elements.participantInput.addEventListener("input", syncSeedsFromInput);
document.querySelector("#load-leaderboard-seeds").addEventListener("click", loadLeaderboardSeeds);
document.querySelector("#setup-seeding").addEventListener("change", async (event) => {
  if (event.target.value !== "rank") return;
  await loadLeaderboardSeeds();
});
document.querySelector("#setup-pool-play").addEventListener("change", (event) => {
  document.querySelector("#pool-settings").hidden = !event.target.checked;
});
document.querySelector("#setup-format").addEventListener("change", (event) => {
  const poolToggle = document.querySelector("#setup-pool-play");
  const supported = event.target.value === "single_elimination";
  poolToggle.disabled = !supported;
  if (!supported) {
    poolToggle.checked = false;
    document.querySelector("#pool-settings").hidden = true;
  }
});
document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});
[elements.loginModal, elements.setupModal].forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.close();
  });
});

checkSession();
loadTournament();
window.setInterval(loadTournament, POLL_INTERVAL);
