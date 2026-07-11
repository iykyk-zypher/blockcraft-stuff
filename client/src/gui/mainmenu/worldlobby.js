/*
  World Lobby — handles the world browser, creation modal, and invite code UI.
  Communicates with the server via Socket.IO:
    getWorlds       → server sends back list of public worlds
    createWorld     → server creates a world, responds with worldCreated
    joinWorld       → player joins a specific world by ID
*/

import { g } from "../../globals";

// ── Helpers ──────────────────────────────────────────────────────────────────

function gameModeBadge(mode) {
  const colors = { survival: "#e67e22", creative: "#2980b9" };
  return `<span class="world-badge" style="background:${colors[mode] || "#555"}">${mode}</span>`;
}

function worldTypeBadge(type) {
  return `<span class="world-badge world-badge-type">${type}</span>`;
}

function playerCountColor(count, max) {
  if (count >= max) return "#e74c3c";
  if (count >= max * 0.75) return "#e67e22";
  return "#2ecc71";
}

// ── Render world list ─────────────────────────────────────────────────────────

export function renderWorldList(worlds) {
  const container = document.getElementById("world-cards-container");
  container.innerHTML = "";

  if (!worlds || worlds.length === 0) {
    container.innerHTML = `
      <div class="world-empty">
        <p>No public worlds yet.</p>
        <p>Be the first to create one!</p>
      </div>`;
    return;
  }

  worlds.forEach((w) => {
    const card = document.createElement("div");
    card.className = "world-card";
    card.dataset.worldId = w.id;

    const max = w.gameMode === "survival" ? 8 : 10;
    const pColor = playerCountColor(w.playerCount, max);

    card.innerHTML = `
      <div class="world-card-header">
        <span class="world-card-name">${escapeHtml(w.name)}</span>
        <span class="world-card-players" style="color:${pColor}">${w.playerCount}/${max}</span>
      </div>
      <div class="world-card-badges">
        ${gameModeBadge(w.gameMode)}
        ${worldTypeBadge(w.worldType)}
      </div>
      <button class="world-join-btn" data-world-id="${w.id}" ${w.playerCount >= max ? "disabled" : ""}>
        ${w.playerCount >= max ? "Full" : "Join"}
      </button>`;

    container.appendChild(card);
  });

  // Attach join button listeners
  container.querySelectorAll(".world-join-btn:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", () => {
      const worldId = btn.dataset.worldId;
      joinWorld(worldId);
    });
  });
}

// ── Show/hide lobby ───────────────────────────────────────────────────────────

export function showWorldLobby() {
  $("#menu").hide();
  $("#server-select").hide();
  $("#world-lobby").show();
  refreshWorldList();
}

export function hideWorldLobby() {
  $("#world-lobby").hide();
}

// ── Refresh world list ────────────────────────────────────────────────────────

export function refreshWorldList() {
  const container = document.getElementById("world-cards-container");
  container.innerHTML = `<div class="world-loading">Loading worlds...</div>`;
  g.socket.emit("getWorlds");
}

// ── Join a world ──────────────────────────────────────────────────────────────

export function joinWorld(worldId) {
  g.pendingWorldId = worldId;
  g.socket.emit("joinWorld", { worldId });
}

// ── Create world modal ────────────────────────────────────────────────────────

export function openCreateModal() {
  document.getElementById("world-create-modal").style.display = "flex";
  // Reset form
  document.getElementById("world-name-input").value = "";
  setSelected("mode-btn", "survival");
  setSelected("type-btn", "normal");
  document.getElementById("world-visibility").checked = false;
}

export function closeCreateModal() {
  document.getElementById("world-create-modal").style.display = "none";
}

function setSelected(cls, value) {
  document.querySelectorAll(`.${cls}`).forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.value === value);
  });
}

function getSelected(cls) {
  const btn = document.querySelector(`.${cls}.selected`);
  return btn ? btn.dataset.value : null;
}

// ── Invite code popup ─────────────────────────────────────────────────────────

export function showInviteCode(code, worldId) {
  document.getElementById("invite-code-display").textContent = code;
  document.getElementById("world-invite-modal").style.display = "flex";

  document.getElementById("invite-join-btn").onclick = () => {
    document.getElementById("world-invite-modal").style.display = "none";
    joinWorld(worldId);
  };

  // Copy to clipboard
  document.getElementById("invite-copy-btn").onclick = () => {
    navigator.clipboard.writeText(code).then(() => {
      document.getElementById("invite-copy-btn").textContent = "Copied!";
      setTimeout(() => {
        document.getElementById("invite-copy-btn").textContent = "Copy";
      }, 2000);
    });
  };
}

// ── Init all event listeners ──────────────────────────────────────────────────

export function initWorldLobby() {
  // Refresh button
  document.getElementById("world-refresh-btn").addEventListener("click", refreshWorldList);

  // Create world button
  document.getElementById("world-create-btn").addEventListener("click", openCreateModal);

  // Join by invite code
  document.getElementById("join-invite-btn").addEventListener("click", () => {
    const code = document.getElementById("join-code-input").value.trim().toUpperCase();
    if (code.length === 6) {
      g.socket.emit("joinWorldByCode", { code });
    }
  });

  // Modal close
  document.getElementById("modal-close-btn").addEventListener("click", closeCreateModal);

  // Mode toggle buttons
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => setSelected("mode-btn", btn.dataset.value));
  });

  // Type toggle buttons
  document.querySelectorAll(".type-btn").forEach((btn) => {
    btn.addEventListener("click", () => setSelected("type-btn", btn.dataset.value));
  });

  // Submit world creation
  document.getElementById("world-submit-btn").addEventListener("click", () => {
    const name = document.getElementById("world-name-input").value.trim();
    if (!name) {
      document.getElementById("world-name-input").style.borderColor = "#e74c3c";
      return;
    }

    const config = {
      name,
      isPrivate: document.getElementById("world-visibility").checked,
      gameMode: getSelected("mode-btn") || "survival",
      worldType: getSelected("type-btn") || "normal",
    };

    document.getElementById("world-submit-btn").textContent = "Creating...";
    document.getElementById("world-submit-btn").disabled = true;
    g.socket.emit("createWorld", config);
  });

  // Socket: receive world list
  g.socket.on("worldList", (worlds) => {
    renderWorldList(worlds);
  });

  // Socket: world created (private → show invite code, else join)
  g.socket.on("worldCreated", ({ worldId, code, isPrivate }) => {
    closeCreateModal();
    document.getElementById("world-submit-btn").textContent = "Create & Join";
    document.getElementById("world-submit-btn").disabled = false;

    if (isPrivate) {
      showInviteCode(code, worldId);
    } else {
      joinWorld(worldId);
    }
  });

  // Socket: error creating world (e.g. already own one)
  g.socket.on("createWorldError", ({ message }) => {
    document.getElementById("world-submit-btn").textContent = "Create & Join";
    document.getElementById("world-submit-btn").disabled = false;
    document.getElementById("world-error-msg").textContent = message;
    document.getElementById("world-error-msg").style.display = "block";
    setTimeout(() => {
      document.getElementById("world-error-msg").style.display = "none";
    }, 4000);
  });

  // Socket: join world error (full, not found, etc.)
  g.socket.on("joinWorldError", ({ message }) => {
    alert(message);
  });
}

// ── Utility ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
