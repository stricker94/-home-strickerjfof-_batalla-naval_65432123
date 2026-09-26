/**
 * Batalla Naval — Empresas
 * PvP hot-seat · vs CPU · partida rápida · separación · guardado · stats
 */
(function () {
  "use strict";

  // ——— Constantes ———
  const PREFS_KEY = "batalla-naval-prefs-v2";
  const SAVE_KEY = "batalla-naval-save-v2";
  const MUTE_KEY = "batalla-naval-muted";
  const MUSIC_KEY = "batalla-naval-music";

  const COLS_ALL = "ABCDEFGHIJ".split("");

  const COMPANY_COLORS = {
    apple: "#a8b0b8",
    microsoft: "#00a4ef",
    amazon: "#ff9900",
    google: "#4285f4",
    nvidia: "#76b900",
    aramco: "#00a3e0",
    tesla: "#e31937",
  };

  const FLEET_NORMAL = [
    { id: "apple", name: "Apple", length: 5 },
    { id: "microsoft", name: "Microsoft", length: 4 },
    { id: "amazon", name: "Amazon", length: 4 },
    { id: "google", name: "Google", length: 3 },
    { id: "nvidia", name: "NVIDIA", length: 3 },
    { id: "aramco", name: "Saudi Aramco", length: 3 },
    { id: "tesla", name: "Tesla", length: 2 },
  ];

  // Rapida 8x8: mismas 7 empresas, longitudes reducidas (total 18 casillas)
  const FLEET_RAPIDA = [
    { id: "apple", name: "Apple", length: 4 },
    { id: "microsoft", name: "Microsoft", length: 3 },
    { id: "amazon", name: "Amazon", length: 3 },
    { id: "google", name: "Google", length: 2 },
    { id: "nvidia", name: "NVIDIA", length: 2 },
    { id: "aramco", name: "Saudi Aramco", length: 2 },
    { id: "tesla", name: "Tesla", length: 2 },
  ];

  const prefs = {
    name1: "",
    name2: "",
    cpuName: "",
    mode: "pvp",
    difficulty: "easy",
    boardMode: "normal",
    spacing: false,
    theme: "cyan",
    mute: false,
    music: false,
    largeText: false,
  };

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        Object.keys(prefs).forEach(function (k) {
          if (p[k] !== undefined) prefs[k] = p[k];
        });
      }
      if (localStorage.getItem(MUTE_KEY) === "1") prefs.mute = true;
      if (localStorage.getItem(MUTE_KEY) === "0") prefs.mute = false;
      if (localStorage.getItem(MUSIC_KEY) === "1") prefs.music = true;
      if (localStorage.getItem(MUSIC_KEY) === "0") prefs.music = false;
    } catch (e) {}
    sanitizePrefs();
  }

  // Evita valores corruptos/antiguos en localStorage (se usan en selectores CSS)
  function sanitizePrefs() {
    if (["pvp", "cpu"].indexOf(prefs.mode) < 0) prefs.mode = "pvp";
    if (["easy", "medium", "hard"].indexOf(prefs.difficulty) < 0) prefs.difficulty = "easy";
    if (["normal", "rapida"].indexOf(prefs.boardMode) < 0) prefs.boardMode = "normal";
    if (["cyan", "teal", "azure"].indexOf(prefs.theme) < 0) prefs.theme = "cyan";
    prefs.name1 = typeof prefs.name1 === "string" ? prefs.name1.slice(0, 20) : "";
    prefs.name2 = typeof prefs.name2 === "string" ? prefs.name2.slice(0, 20) : "";
    prefs.cpuName = typeof prefs.cpuName === "string" ? prefs.cpuName.slice(0, 20) : "";
    ["spacing", "mute", "music", "largeText"].forEach(function (k) { prefs[k] = !!prefs[k]; });
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      localStorage.setItem(MUTE_KEY, prefs.mute ? "1" : "0");
      localStorage.setItem(MUSIC_KEY, prefs.music ? "1" : "0");
    } catch (e) {}
  }

  function emptyStats() {
    return { shots: 0, hits: 0, shipsSunk: 0, turns: 0 };
  }

  function createPlayer(name, isCpu) {
    return {
      name: name,
      isCpu: !!isCpu,
      board: null,
      ships: [],
      shots: {},
      stats: emptyStats(),
    };
  }

  const state = {
    phase: "start",
    mode: "pvp",
    difficulty: "easy",
    boardSize: 10,
    boardMode: "normal",
    spacing: false,
    fleetTemplate: FLEET_NORMAL,
    players: [createPlayer("Jugador 1"), createPlayer("Jugador 2")],
    placing: {
      playerIndex: 0,
      selectedShipId: null,
      orientation: "H",
      ships: [],
      occupied: {},
    },
    handoff: { nextAction: null, title: "", message: "" },
    battle: {
      attacker: 0,
      awaitingHandoff: false,
      lastResult: null,
      lastShot: null,
      inputLocked: false,
    },
    winner: null,
    turnCount: 0,
  };

  let placePreview = { cells: null, valid: false };
  let lastHover = null;
  let theaterTimer = null;
  let cpuTimer = null;
  // Timers de flujo de juego (cambio de turno, victoria, inicio de batalla)
  let flowTimers = [];

  function later(fn, ms) {
    var id = setTimeout(function () {
      flowTimers = flowTimers.filter(function (t) { return t !== id; });
      fn();
    }, ms);
    flowTimers.push(id);
    return id;
  }

  function clearGameTimers() {
    clearTimeout(cpuTimer);
    cpuTimer = null;
    flowTimers.forEach(function (t) { clearTimeout(t); });
    flowTimers = [];
  }

  const $ = function (sel) { return document.querySelector(sel); };
  const screens = {
    start: $("#screen-start"),
    handoff: $("#screen-handoff"),
    placement: $("#screen-placement"),
    battle: $("#screen-battle"),
    win: $("#screen-win"),
  };

  function boardSize() { return state.boardSize; }
  function cols() { return COLS_ALL.slice(0, boardSize()); }
  function fleetTemplate() { return state.fleetTemplate; }
  function companyColor(id) { return COMPANY_COLORS[id] || "#67e8f9"; }

  function showScreen(name) {
    var changed = !screens[name].classList.contains("active");
    Object.values(screens).forEach(function (el) { el.classList.remove("active"); });
    screens[name].classList.add("active");
    state.phase = name === "placement" ? "place" : name;
    showHud(true);
    var menuBtn = $("#btn-menu");
    if (menuBtn) menuBtn.hidden = name === "start";
    if (changed) window.scrollTo(0, 0);
  }

  function showHud(visible) {
    const hud = $("#hud-controls");
    if (!hud) return;
    if (visible) hud.removeAttribute("hidden");
    else hud.setAttribute("hidden", "");
  }

  function toast(msg, ms) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove("show"); }, ms || 2200);
  }

  function key(r, c) { return r + "," + c; }

  function cloneFleet() {
    return fleetTemplate().map(function (s) {
      return { id: s.id, name: s.name, length: s.length, cells: [], hits: 0, sunk: false };
    });
  }

  function emptyBoard() {
    var n = boardSize();
    return Array.from({ length: n }, function () {
      return Array.from({ length: n }, function () { return null; });
    });
  }

  function opponentOf(i) { return i === 0 ? 1 : 0; }
  function playerLabel(i) { return state.players[i].name; }
  function isCpuMode() { return state.mode === "cpu"; }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ——— Audio ———
  let audioCtx = null;
  let musicNodes = null;
  let musicPlaying = false;

  function ensureAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(function () {});
    }
    return audioCtx;
  }

  function setMuted(value) {
    prefs.mute = !!value;
    savePrefs();
    updateMuteButton();
  }

  function updateMuteButton() {
    var btn = $("#btn-mute");
    if (!btn) return;
    btn.classList.toggle("is-muted", prefs.mute);
    btn.setAttribute("aria-pressed", prefs.mute ? "true" : "false");
    btn.setAttribute("aria-label", prefs.mute ? "Activar efectos" : "Silenciar efectos");
    var icon = btn.querySelector(".mute-icon");
    var label = btn.querySelector(".mute-label");
    if (icon) icon.textContent = prefs.mute ? "🔇" : "🔊";
    if (label) label.textContent = prefs.mute ? "Silencio" : "Sonido";
  }

  function tone(ctx, freq, start, dur, type, gainPeak, dest) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gainPeak, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(dest || ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  function noiseBurst(ctx, start, dur, gainPeak, bandFreq) {
    var sampleRate = ctx.sampleRate;
    var len = Math.max(1, Math.floor(sampleRate * dur));
    var buffer = ctx.createBuffer(1, len, sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    var filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = bandFreq || 600;
    filter.Q.value = 0.8;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gainPeak, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(start);
    src.stop(start + dur + 0.02);
  }

  var SFX = {
    miss: function () {
      var ctx = ensureAudio();
      if (!ctx) return;
      var t = ctx.currentTime;
      noiseBurst(ctx, t, 0.28, 0.22, 480);
      tone(ctx, 220, t, 0.18, "sine", 0.08);
      tone(ctx, 160, t + 0.05, 0.2, "sine", 0.05);
    },
    hit: function () {
      var ctx = ensureAudio();
      if (!ctx) return;
      var t = ctx.currentTime;
      tone(ctx, 420, t, 0.08, "square", 0.12);
      tone(ctx, 180, t + 0.04, 0.14, "sawtooth", 0.1);
      noiseBurst(ctx, t, 0.12, 0.18, 1200);
    },
    sunk: function () {
      var ctx = ensureAudio();
      if (!ctx) return;
      var t = ctx.currentTime;
      tone(ctx, 196, t, 0.22, "triangle", 0.14);
      tone(ctx, 247, t + 0.12, 0.22, "triangle", 0.13);
      tone(ctx, 294, t + 0.24, 0.28, "triangle", 0.14);
      tone(ctx, 147, t + 0.4, 0.35, "sine", 0.12);
      noiseBurst(ctx, t, 0.2, 0.12, 400);
    },
    win: function () {
      var ctx = ensureAudio();
      if (!ctx) return;
      var t = ctx.currentTime;
      [262, 330, 392, 523].forEach(function (f, i) {
        tone(ctx, f, t + i * 0.12, 0.22, "triangle", 0.11);
      });
      tone(ctx, 659, t + 0.5, 0.35, "sine", 0.1);
    },
    place: function () {
      var ctx = ensureAudio();
      if (!ctx) return;
      var t = ctx.currentTime;
      tone(ctx, 520, t, 0.06, "sine", 0.05);
      tone(ctx, 680, t + 0.04, 0.07, "sine", 0.04);
    },
    click: function () {
      var ctx = ensureAudio();
      if (!ctx) return;
      tone(ctx, 880, ctx.currentTime, 0.04, "sine", 0.035);
    },
  };

  function playSfx(name) {
    if (prefs.mute) return;
    var fn = SFX[name];
    if (fn) {
      try { fn(); } catch (e) {}
    }
  }

  function stopMusicHard() {
    if (musicNodes) {
      try {
        musicNodes.oscs.forEach(function (o) {
          try { o.stop(); } catch (e) {}
        });
        if (musicNodes.lfo) {
          try { musicNodes.lfo.stop(); } catch (e) {}
        }
      } catch (e) {}
      musicNodes = null;
    }
    musicPlaying = false;
  }

  function startMusic() {
    var ctx = ensureAudio();
    if (!ctx || !prefs.music) return;
    stopMusicHard();
    var master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    master.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 1.2);

    var filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    filter.Q.value = 0.7;
    filter.connect(master);

    var freqs = [110, 146.83, 164.81, 196];
    var oscs = freqs.map(function (f, i) {
      var osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? "sine" : "triangle";
      osc.frequency.value = f;
      var g = ctx.createGain();
      g.gain.value = 0.18 - i * 0.03;
      osc.connect(g);
      g.connect(filter);
      osc.start();
      return osc;
    });

    var lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.08;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 40;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    musicNodes = { oscs: oscs, lfo: lfo, gain: master };
    musicPlaying = true;
    updateMusicButton();
  }

  function setMusic(on) {
    prefs.music = !!on;
    savePrefs();
    if (prefs.music) {
      ensureAudio();
      startMusic();
    } else {
      stopMusicHard();
      updateMusicButton();
    }
  }

  function updateMusicButton() {
    var btn = $("#btn-music");
    if (!btn) return;
    btn.setAttribute("aria-pressed", prefs.music ? "true" : "false");
    var label = btn.querySelector(".hud-label");
    if (label) label.textContent = prefs.music ? "Música on" : "Música";
  }

  // ——— Animaciones ———
  function findEnemyCell(r, c) {
    return document.querySelector('#enemy-board .cell[data-r="' + r + '"][data-c="' + c + '"]');
  }
  function findOwnCell(r, c) {
    return document.querySelector('#own-board .cell[data-r="' + r + '"][data-c="' + c + '"]');
  }

  function animateCell(el, className, ms) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    setTimeout(function () { el.classList.remove(className); }, ms || 600);
  }

  function clearTheater() {
    clearTimeout(theaterTimer);
    var overlay = $("#theater-overlay");
    if (overlay) {
      overlay.classList.remove("show");
      overlay.hidden = true;
    }
    document.querySelectorAll(".board-panel.theater-focus").forEach(function (p) {
      p.classList.remove("theater-focus");
    });
    document.querySelectorAll(".cell.theater-ship").forEach(function (c) {
      c.classList.remove("theater-ship");
    });
  }

  function showSunkBanner(text) {
    var el = $("#sunk-banner");
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(showSunkBanner._t);
    showSunkBanner._t = setTimeout(function () {
      el.classList.remove("show");
      el.hidden = true;
    }, 1100);
  }

  function playTheaterMode(shipCells, onEnemyBoard) {
    clearTheater();
    var overlay = $("#theater-overlay");
    if (overlay) {
      overlay.hidden = false;
      overlay.classList.add("show");
    }
    var boardSel = onEnemyBoard ? "#enemy-board" : "#own-board";
    var boardEl = document.querySelector(boardSel);
    var panel = boardEl && boardEl.closest(".board-panel");
    if (panel) panel.classList.add("theater-focus");

    (shipCells || []).forEach(function (cell) {
      var el = onEnemyBoard ? findEnemyCell(cell.r, cell.c) : findOwnCell(cell.r, cell.c);
      if (el) {
        el.classList.add("theater-ship");
        animateCell(el, "anim-sunk-glow", 900);
      }
    });
    theaterTimer = setTimeout(clearTheater, 1100);
  }

  function spawnWinConfetti() {
    var card = document.querySelector(".win-card");
    if (!card) return;
    card.classList.add("celebrate");
    var layer = card.querySelector(".win-confetti");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "win-confetti";
      layer.setAttribute("aria-hidden", "true");
      card.prepend(layer);
    }
    layer.innerHTML = "";
    var colors = ["#22d3ee", "#fbbf24", "#f43f5e", "#34d399", "#a78bfa", "#f8fafc"];
    for (var i = 0; i < 18; i++) {
      var s = document.createElement("span");
      s.style.left = 8 + Math.random() * 84 + "%";
      s.style.background = colors[i % colors.length];
      s.style.animationDelay = Math.random() * 0.15 + "s";
      s.style.transform = "rotate(" + Math.floor(Math.random() * 60) + "deg)";
      layer.appendChild(s);
    }
    setTimeout(function () {
      card.classList.remove("celebrate");
      layer.innerHTML = "";
    }, 900);
  }

  // ——— Colocacion ———
  function getShipCells(r, c, length, orientation) {
    var cells = [];
    for (var i = 0; i < length; i++) {
      cells.push({
        r: orientation === "H" ? r : r + i,
        c: orientation === "H" ? c + i : c,
      });
    }
    return cells;
  }

  function canPlace(cells, occupied, ignoreShipId) {
    var n = boardSize();
    var i, j, r, c, occ, rr, cc;
    for (i = 0; i < cells.length; i++) {
      r = cells[i].r;
      c = cells[i].c;
      if (r < 0 || r >= n || c < 0 || c >= n) return false;
      occ = occupied[key(r, c)];
      if (occ && occ !== ignoreShipId) return false;
    }
    if (!state.spacing) return true;

    // Separacion: sin tocar incluyendo diagonales
    for (i = 0; i < cells.length; i++) {
      r = cells[i].r;
      c = cells[i].c;
      for (rr = r - 1; rr <= r + 1; rr++) {
        for (cc = c - 1; cc <= c + 1; cc++) {
          if (rr === r && cc === c) continue;
          if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
          var isSelf = false;
          for (j = 0; j < cells.length; j++) {
            if (cells[j].r === rr && cells[j].c === cc) {
              isSelf = true;
              break;
            }
          }
          if (isSelf) continue;
          occ = occupied[key(rr, cc)];
          if (occ && occ !== ignoreShipId) return false;
        }
      }
    }
    return true;
  }

  function placeShipOnPlacing(shipId, r, c) {
    var ship = state.placing.ships.find(function (s) { return s.id === shipId; });
    if (!ship || ship.cells.length) return false;
    var cells = getShipCells(r, c, ship.length, state.placing.orientation);
    if (!canPlace(cells, state.placing.occupied, null)) return false;
    ship.cells = cells;
    cells.forEach(function (cell) {
      state.placing.occupied[key(cell.r, cell.c)] = shipId;
    });
    return true;
  }

  function removeShipFromPlacing(shipId) {
    var ship = state.placing.ships.find(function (s) { return s.id === shipId; });
    if (!ship || !ship.cells.length) return;
    ship.cells.forEach(function (cell) {
      delete state.placing.occupied[key(cell.r, cell.c)];
    });
    ship.cells = [];
  }

  function allShipsPlaced() {
    return state.placing.ships.every(function (s) {
      return s.cells.length === s.length;
    });
  }

  function randomPlaceAll() {
    var attempts = 0;
    while (attempts < 200) {
      attempts++;
      state.placing.ships.forEach(function (s) { removeShipFromPlacing(s.id); });
      var order = state.placing.ships.slice().sort(function (a, b) {
        return b.length - a.length;
      });
      var ok = true;
      for (var si = 0; si < order.length; si++) {
        var ship = order[si];
        var placed = false;
        for (var attempt = 0; attempt < 500 && !placed; attempt++) {
          var orientation = Math.random() < 0.5 ? "H" : "V";
          var n = boardSize();
          var maxR = orientation === "H" ? n : n - ship.length + 1;
          var maxC = orientation === "H" ? n - ship.length + 1 : n;
          if (maxR < 1 || maxC < 1) break;
          var r = Math.floor(Math.random() * maxR);
          var c = Math.floor(Math.random() * maxC);
          state.placing.orientation = orientation;
          placed = placeShipOnPlacing(ship.id, r, c);
        }
        if (!placed) { ok = false; break; }
      }
      if (ok) {
        state.placing.orientation = "H";
        state.placing.selectedShipId = null;
        return true;
      }
    }
    state.placing.ships.forEach(function (s) { removeShipFromPlacing(s.id); });
    state.placing.orientation = "H";
    state.placing.selectedShipId = state.placing.ships[0] ? state.placing.ships[0].id : null;
    toast("No se pudo colocar al azar; prueba sin separación o reintenta");
    return false;
  }

  function commitPlacement(playerIndex) {
    var board = emptyBoard();
    var ships = state.placing.ships.map(function (s) {
      return {
        id: s.id,
        name: s.name,
        length: s.length,
        cells: s.cells.map(function (cell) { return { r: cell.r, c: cell.c }; }),
        hits: 0,
        sunk: false,
      };
    });
    ships.forEach(function (ship) {
      ship.cells.forEach(function (cell) {
        board[cell.r][cell.c] = ship.id;
      });
    });
    state.players[playerIndex].board = board;
    state.players[playerIndex].ships = ships;
    state.players[playerIndex].shots = {};
    if (!state.players[playerIndex].stats) {
      state.players[playerIndex].stats = emptyStats();
    }
  }

  function placeFleetRandomForPlayer(playerIndex) {
    state.placing = {
      playerIndex: playerIndex,
      selectedShipId: null,
      orientation: "H",
      ships: cloneFleet(),
      occupied: {},
    };
    if (!randomPlaceAll()) {
      var was = state.spacing;
      state.spacing = false;
      randomPlaceAll();
      state.spacing = was;
    }
    commitPlacement(playerIndex);
  }

  // ——— Disparos ———
  function fireShot(attackerIndex, r, c) {
    var defender = opponentOf(attackerIndex);
    var shotKey = key(r, c);
    var attackerShots = state.players[attackerIndex].shots;

    if (attackerShots[shotKey]) {
      return { ok: false, reason: "already" };
    }

    var shipId = state.players[defender].board[r][c];
    var stats = state.players[attackerIndex].stats;
    // Un disparo por turno: se cuentan aquí para que reanudar no duplique turnos
    stats.shots += 1;
    stats.turns += 1;
    state.turnCount += 1;

    if (!shipId) {
      attackerShots[shotKey] = "miss";
      return { ok: true, result: "miss", cell: { r: r, c: c } };
    }

    attackerShots[shotKey] = "hit";
    stats.hits += 1;
    var ship = state.players[defender].ships.find(function (s) { return s.id === shipId; });
    ship.hits += 1;

    if (ship.hits >= ship.length) {
      ship.sunk = true;
      stats.shipsSunk += 1;
      ship.cells.forEach(function (cell) {
        attackerShots[key(cell.r, cell.c)] = "sunk";
      });
      var allSunk = state.players[defender].ships.every(function (s) { return s.sunk; });
      return {
        ok: true,
        result: "sunk",
        shipName: ship.name,
        shipId: ship.id,
        cell: { r: r, c: c },
        cells: ship.cells.slice(),
        win: allSunk,
      };
    }

    return {
      ok: true,
      result: "hit",
      shipName: ship.name,
      shipId: shipId,
      cell: { r: r, c: c },
    };
  }

  // ——— CPU ———
  // La IA no guarda memoria propia: decide solo con lo que vería un jugador
  // humano (sus disparos: agua / tocado / hundido y qué barcos siguen a flote).
  // Así funciona igual tras reanudar una partida guardada y nunca hace trampa.
  function neighbors4(r, c) {
    var n = boardSize();
    return [
      { r: r - 1, c: c },
      { r: r + 1, c: c },
      { r: r, c: c - 1 },
      { r: r, c: c + 1 },
    ].filter(function (p) {
      return p.r >= 0 && p.r < n && p.c >= 0 && p.c < n;
    });
  }

  function inBoard(r, c) {
    var n = boardSize();
    return r >= 0 && r < n && c >= 0 && c < n;
  }

  function pickRandom(list) {
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  // Casillas que, por las reglas, no pueden contener barco (separación activa)
  function spacingBlocked(shots) {
    var blocked = {};
    if (!state.spacing) return blocked;
    Object.keys(shots).forEach(function (k) {
      if (shots[k] !== "sunk") return;
      var parts = k.split(",");
      var r = +parts[0];
      var c = +parts[1];
      for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
          if (inBoard(r + dr, c + dc)) blocked[key(r + dr, c + dc)] = true;
        }
      }
    });
    return blocked;
  }

  function cpuView(attackerIndex) {
    var shots = state.players[attackerIndex].shots;
    var blocked = spacingBlocked(shots);
    var n = boardSize();
    var open = [];
    var hits = [];
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        var s = shots[key(r, c)];
        if (!s) {
          if (!blocked[key(r, c)]) open.push({ r: r, c: c });
        } else if (s === "hit") {
          hits.push({ r: r, c: c });
        }
      }
    }
    if (!open.length) {
      // Salvaguarda: nunca quedarse sin disparo
      for (var r2 = 0; r2 < n; r2++) {
        for (var c2 = 0; c2 < n; c2++) {
          if (!shots[key(r2, c2)]) open.push({ r: r2, c: c2 });
        }
      }
    }
    var remaining = state.players[opponentOf(attackerIndex)].ships
      .filter(function (s) { return !s.sunk; })
      .map(function (s) { return s.length; });
    return { shots: shots, blocked: blocked, open: open, hits: hits, remaining: remaining };
  }

  function isOpen(view, r, c) {
    return inBoard(r, c) && !view.shots[key(r, c)] && !view.blocked[key(r, c)];
  }

  function isHitCell(view, r, c) {
    return inBoard(r, c) && view.shots[key(r, c)] === "hit";
  }

  // Candidatos alrededor de impactos pendientes (barcos tocados sin hundir)
  function targetCandidates(view, followLines) {
    var seen = {};
    var out = [];
    function add(r, c) {
      if (!isOpen(view, r, c) || seen[key(r, c)]) return;
      seen[key(r, c)] = true;
      out.push({ r: r, c: c });
    }
    if (followLines) {
      // Si hay dos impactos alineados, dispara en los extremos de la línea
      view.hits.forEach(function (h) {
        [[0, 1], [1, 0]].forEach(function (d) {
          if (!isHitCell(view, h.r + d[0], h.c + d[1]) && !isHitCell(view, h.r - d[0], h.c - d[1])) return;
          [1, -1].forEach(function (sign) {
            var r = h.r;
            var c = h.c;
            while (isHitCell(view, r, c)) {
              r += d[0] * sign;
              c += d[1] * sign;
            }
            add(r, c);
          });
        });
      });
      if (out.length) return out;
    }
    view.hits.forEach(function (h) {
      neighbors4(h.r, h.c).forEach(function (p) { add(p.r, p.c); });
    });
    return out;
  }

  // Mapa de probabilidad: cuántas posiciones posibles de barcos a flote cubren
  // cada casilla. Las posiciones que pasan por impactos pendientes pesan más.
  function densityMap(view) {
    var n = boardSize();
    var map = {};
    view.remaining.forEach(function (len) {
      ["H", "V"].forEach(function (o) {
        for (var r = 0; r < n; r++) {
          for (var c = 0; c < n; c++) {
            var cells = getShipCells(r, c, len, o);
            var ok = true;
            var hitsCovered = 0;
            for (var i = 0; i < cells.length; i++) {
              var cr = cells[i].r;
              var cc = cells[i].c;
              if (!inBoard(cr, cc)) { ok = false; break; }
              var s = view.shots[key(cr, cc)];
              if (s === "miss" || s === "sunk" || view.blocked[key(cr, cc)]) { ok = false; break; }
              if (s === "hit") hitsCovered++;
            }
            if (!ok) continue;
            var w = 1 + hitsCovered * 20;
            cells.forEach(function (p) {
              var k = key(p.r, p.c);
              map[k] = (map[k] || 0) + w;
            });
          }
        }
      });
    });
    return map;
  }

  function bestByDensity(list, view) {
    var map = densityMap(view);
    var best = null;
    var bestScore = -Infinity;
    list.forEach(function (cell) {
      var sc = (map[key(cell.r, cell.c)] || 0) + Math.random() * 0.5;
      if (sc > bestScore) {
        bestScore = sc;
        best = cell;
      }
    });
    return best;
  }

  function chooseCpuShot(attackerIndex) {
    var view = cpuView(attackerIndex);
    if (!view.open.length) return null;

    if (state.difficulty === "easy") {
      // Casi aleatorio: a veces remata alrededor de un tocado
      if (view.hits.length && Math.random() < 0.25) {
        var near = targetCandidates(view, false);
        if (near.length) return pickRandom(near);
      }
      return pickRandom(view.open);
    }

    if (state.difficulty === "medium") {
      var cands = targetCandidates(view, false);
      return cands.length ? pickRandom(cands) : pickRandom(view.open);
    }

    // Difícil: sigue líneas de impactos y usa el mapa de probabilidad
    var hardCands = targetCandidates(view, true);
    return bestByDensity(hardCands.length ? hardCands : view.open, view);
  }

  // ——— Guardar / reanudar ———
  function serializeState() {
    return {
      v: 2,
      mode: state.mode,
      difficulty: state.difficulty,
      boardSize: state.boardSize,
      boardMode: state.boardMode,
      spacing: state.spacing,
      phase: state.phase,
      players: state.players.map(function (p) {
        return {
          name: p.name,
          isCpu: p.isCpu,
          board: p.board,
          ships: p.ships,
          shots: p.shots,
          stats: p.stats,
        };
      }),
      placing: state.phase === "place" ? state.placing : null,
      battle: {
        attacker: state.battle.attacker,
        lastResult: state.battle.lastResult,
        lastShot: state.battle.lastShot,
      },
      winner: state.winner,
      turnCount: state.turnCount,
    };
  }

  function saveGame() {
    try {
      if (state.phase === "place" || state.phase === "battle") {
        localStorage.setItem(SAVE_KEY, JSON.stringify(serializeState()));
      }
    } catch (e) {}
  }

  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    updateContinueUI();
  }

  function isValidBoard(board, n) {
    return (
      Array.isArray(board) &&
      board.length === n &&
      board.every(function (row) { return Array.isArray(row) && row.length === n; })
    );
  }

  function isValidShipList(ships) {
    return (
      Array.isArray(ships) &&
      ships.length > 0 &&
      ships.every(function (s) {
        return (
          s && typeof s.id === "string" && typeof s.length === "number" && Array.isArray(s.cells) &&
          s.cells.every(function (c) {
            return c && c.r >= 0 && c.r < 10 && c.c >= 0 && c.c < 10;
          })
        );
      })
    );
  }

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || data.v !== 2) return null;
      if (data.mode !== "pvp" && data.mode !== "cpu") return null;
      if (data.boardSize !== 8 && data.boardSize !== 10) return null;
      if (!Array.isArray(data.players) || data.players.length !== 2) return null;
      if (data.phase === "place") {
        if (!data.placing || !isValidShipList(data.placing.ships)) return null;
        if (data.placing.playerIndex !== 0 && data.placing.playerIndex !== 1) return null;
      } else if (data.phase === "battle") {
        var okPlayers = data.players.every(function (p) {
          if (!p || !isValidBoard(p.board, data.boardSize) || !isValidShipList(p.ships)) return false;
          var ids = p.ships.map(function (s) { return s.id; });
          return p.board.every(function (row) {
            return row.every(function (id) { return id === null || ids.indexOf(id) >= 0; });
          });
        });
        if (!okPlayers) return null;
      } else {
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  }

  function hasValidSave() { return !!loadSave(); }

  function applySave(data) {
    clearGameTimers();
    clearTheater();
    state.mode = data.mode;
    state.difficulty = data.difficulty || "easy";
    state.boardSize = data.boardSize || 10;
    state.boardMode = data.boardMode || "normal";
    state.spacing = !!data.spacing;
    state.fleetTemplate = state.boardMode === "rapida" ? FLEET_RAPIDA : FLEET_NORMAL;
    state.players = data.players.map(function (p) {
      var stats = emptyStats();
      if (p.stats) {
        Object.keys(stats).forEach(function (k) {
          if (typeof p.stats[k] === "number") stats[k] = p.stats[k];
        });
      }
      return {
        name: p.name || "Jugador",
        isCpu: !!p.isCpu,
        board: p.board,
        ships: p.ships || [],
        shots: p.shots || {},
        stats: stats,
      };
    });
    state.winner = null;
    state.turnCount = data.turnCount || 0;
    state.battle.awaitingHandoff = false;
    state.battle.inputLocked = false;
    state.battle.attacker = data.battle && data.battle.attacker === 1 ? 1 : 0;
    state.battle.lastResult = null;
    var ls = data.battle && data.battle.lastShot;
    state.battle.lastShot =
      ls && (ls.by === 0 || ls.by === 1) && inBoard(ls.r, ls.c) &&
      ["miss", "hit", "sunk"].indexOf(ls.result) >= 0
        ? ls
        : null;

    if (data.phase === "place") {
      state.placing = data.placing;
      delete state.placing.confirmed;
      if (typeof state.placing.occupied !== "object" || !state.placing.occupied) {
        state.placing.occupied = {};
      }
      var resumePlacement = function () {
        placePreview = { cells: null, valid: false };
        lastHover = null;
        showScreen("placement");
        $("#placement-title").textContent = playerLabel(state.placing.playerIndex) + ": coloca tu flota";
        $("#placement-subtitle").textContent = "Selecciona un barco, gira (R) y haz clic en el tablero.";
        updatePlacementHint();
        renderPlacement();
      };
      if (isCpuMode()) {
        resumePlacement();
      } else {
        // PvP: pantalla de privacidad antes de mostrar una flota
        showHandoff(
          "Partida reanudada",
          "Le toca colocar su flota a <strong>" +
            escapeHtml(playerLabel(state.placing.playerIndex)) +
            "</strong>.<br>Pulsa <strong>Listo</strong> cuando tenga el dispositivo.",
          resumePlacement
        );
      }
    } else {
      var attacker = state.battle.attacker;
      if (isCpuMode()) {
        showBattleFor(attacker);
        if (state.players[attacker].isCpu) scheduleCpuTurn();
      } else {
        showHandoff(
          "Partida reanudada",
          "Es el turno de <strong>" +
            escapeHtml(playerLabel(attacker)) +
            "</strong>.<br>Pulsa <strong>Listo</strong> cuando tenga el dispositivo.",
          function () { showBattleFor(attacker); }
        );
      }
    }
  }

  function updateContinueUI() {
    var row = $("#continue-row");
    var form = $("#start-form");
    if (!row) return;
    if (hasValidSave()) {
      row.hidden = false;
      if (form) form.style.display = "none";
    } else {
      row.hidden = true;
      if (form) form.style.display = "";
    }
  }

  // ——— Render ———
  function renderFleetPreview() {
    var mode =
      (document.querySelector('input[name="board-size"]:checked') || {}).value ||
      prefs.boardMode;
    var fleet = mode === "rapida" ? FLEET_RAPIDA : FLEET_NORMAL;
    var ul = $("#fleet-preview-list");
    var title = $("#fleet-preview-title");
    if (title) {
      title.textContent =
        mode === "rapida" ? "Flota rápida 8×8 (ambos)" : "La flota (ambos jugadores)";
    }
    ul.innerHTML = fleet
      .map(function (s) {
        return (
          '<li><span><span class="chip" style="background:' +
          companyColor(s.id) +
          '"></span>' +
          escapeHtml(s.name) +
          '</span><span class="len">' +
          s.length +
          " casillas</span></li>"
        );
      })
      .join("");
  }

  function buildBoard(container, options) {
    var mode = options.mode;
    var occupied = options.occupied;
    var shots = options.shots;
    var interactive = options.interactive;
    var onCellClick = options.onCellClick;
    var onCellHover = options.onCellHover;
    var onCellLeave = options.onCellLeave;
    var markCell = options.markCell;
    var shipNames = {};
    fleetTemplate().forEach(function (s) { shipNames[s.id] = s.name; });
    var n = boardSize();
    var letters = cols();

    // Conserva el foco del teclado al reconstruir el tablero
    var active = document.activeElement;
    var focusR = null;
    var focusC = null;
    if (active && container.contains(active) && active.dataset && active.dataset.r !== undefined) {
      focusR = active.dataset.r;
      focusC = active.dataset.c;
    }

    container.innerHTML = "";
    container.style.setProperty("--board-n", String(n));
    container.style.setProperty(
      "--cell",
      "min(36px, " + (mode === "place" ? "7.2vw" : n <= 8 ? "7vw" : "6.2vw") + ")"
    );

    var corner = document.createElement("div");
    corner.className = "corner";
    container.appendChild(corner);

    letters.forEach(function (letter) {
      var lab = document.createElement("div");
      lab.className = "label";
      lab.textContent = letter;
      container.appendChild(lab);
    });

    for (var r = 0; r < n; r++) {
      var rowLab = document.createElement("div");
      rowLab.className = "label";
      rowLab.textContent = String(r + 1);
      container.appendChild(rowLab);

      for (var c = 0; c < n; c++) {
        var cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", letters[c] + (r + 1));

        var k = key(r, c);

        if (mode === "place") {
          if (occupied && occupied[k]) {
            cell.classList.add("ship");
            cell.style.setProperty("--ship-color", companyColor(occupied[k]));
            cell.title = "Clic para quitar y recolocar";
          }
        }

        var shotState = shots && shots[k];
        var stateText = { miss: "agua", hit: "tocado", sunk: "hundido" }[shotState] || "";

        if (mode === "own") {
          if (occupied && occupied[k]) {
            cell.classList.add("ship");
            cell.style.setProperty("--ship-color", companyColor(occupied[k]));
          }
          if (shotState === "miss") cell.classList.add("miss");
          if (shotState === "hit" || shotState === "sunk") {
            cell.classList.add("hit");
            if (shotState === "sunk") cell.classList.add("sunk");
          }
          if (markCell && markCell.r === r && markCell.c === c) {
            cell.classList.add("last-shot");
            stateText += (stateText ? ", " : "") + "último disparo rival";
          }
          var ownParts = [letters[c] + (r + 1)];
          if (occupied && occupied[k]) ownParts.push(shipNames[occupied[k]] || "barco");
          if (stateText) ownParts.push(stateText);
          cell.setAttribute("aria-label", ownParts.join(", "));
        }

        if (mode === "enemy") {
          if (shotState === "miss") cell.classList.add("miss");
          if (shotState === "hit") cell.classList.add("hit");
          if (shotState === "sunk") cell.classList.add("hit", "sunk");
          cell.setAttribute("aria-label", letters[c] + (r + 1) + ", " + (stateText || "sin disparar"));
        }

        if (interactive && !(shots && shots[k])) {
          cell.classList.add("interactive");
          cell.tabIndex = 0;
          (function (rr, cc) {
            if (onCellClick) {
              cell.addEventListener("click", function () { onCellClick(rr, cc); });
              cell.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onCellClick(rr, cc);
                }
              });
            }
            if (onCellHover) {
              cell.addEventListener("mouseenter", function () { onCellHover(rr, cc); });
              cell.addEventListener("focus", function () { onCellHover(rr, cc); });
            }
          })(r, c);
          if (onCellLeave) {
            cell.addEventListener("mouseleave", function () { onCellLeave(); });
          }
        } else {
          if (onCellHover) {
            (function (rr, cc) {
              cell.addEventListener("mouseenter", function () { onCellHover(rr, cc); });
            })(r, c);
          }
          if (onCellLeave) {
            cell.addEventListener("mouseleave", function () { onCellLeave(); });
          }
        }

        container.appendChild(cell);
      }
    }

    if (focusR !== null) {
      var again = container.querySelector('.cell[data-r="' + focusR + '"][data-c="' + focusC + '"]');
      if (again && again.tabIndex >= 0) again.focus();
    }
  }

  function updatePlacementHint() {
    var hint = $("#placement-hint");
    if (!hint) return;
    hint.textContent =
      (state.spacing
        ? "Selecciona un barco, gira (R o clic derecho) y haz clic. Sin solapar ni tocar (incluye diagonales)."
        : "Selecciona un barco, gira (R o clic derecho) y haz clic en el tablero. No se pueden solapar.") +
      " Haz clic en un barco colocado para moverlo.";
  }

  function startPlacement(playerIndex) {
    state.placing = {
      playerIndex: playerIndex,
      selectedShipId: fleetTemplate()[0].id,
      orientation: "H",
      ships: cloneFleet(),
      occupied: {},
    };
    placePreview = { cells: null, valid: false };
    lastHover = null;
    showScreen("placement");
    $("#placement-title").textContent = playerLabel(playerIndex) + ": coloca tu flota";
    $("#placement-subtitle").textContent =
      "Selecciona un barco, gira (R) y haz clic en el tablero.";
    updatePlacementHint();
    renderPlacement();
    saveGame();
  }

  function renderPlacement() {
    var list = $("#ship-list");
    list.innerHTML = "";

    state.placing.ships.forEach(function (ship) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ship-item";
      btn.setAttribute("role", "listitem");
      var placed = ship.cells.length > 0;
      if (placed) {
        btn.classList.add("placed");
        btn.title = "Quitar del tablero para recolocar";
        btn.setAttribute("aria-label", ship.name + " (colocado): quitar para recolocar");
      }
      if (state.placing.selectedShipId === ship.id && !placed) {
        btn.classList.add("selected");
        btn.setAttribute("aria-pressed", "true");
      }

      var dots = Array.from({ length: ship.length })
        .map(function () {
          return (
            '<span class="ship-cell-dot" style="background:' +
            companyColor(ship.id) +
            '"></span>'
          );
        })
        .join("");

      btn.innerHTML =
        '<span class="ship-name-row"><span class="ship-chip" style="background:' +
        companyColor(ship.id) +
        '"></span><span class="ship-name">' +
        escapeHtml(ship.name) +
        '</span></span><span class="ship-cells">' +
        dots +
        "</span>";

      btn.addEventListener("click", function () {
        playSfx("click");
        if (ship.cells.length) {
          pickUpShip(ship.id);
          return;
        }
        if (placementLocked()) return;
        state.placing.selectedShipId = ship.id;
        placePreview = lastHover ? computePreview(lastHover.r, lastHover.c) : { cells: null, valid: false };
        renderPlacement();
      });
      list.appendChild(btn);
    });

    renderPlacementBoardOnly();
    $("#btn-confirm-placement").disabled = !allShipsPlaced();
  }

  // Reconstruye el tablero de colocación (solo cuando cambia la flota colocada)
  function renderPlacementBoardOnly() {
    buildBoard($("#placement-board"), {
      mode: "place",
      occupied: state.placing.occupied,
      interactive: true,
      onCellClick: onPlaceClick,
      onCellHover: onPlaceHover,
      onCellLeave: function () {
        lastHover = null;
        placePreview = { cells: null, valid: false };
        paintPlacementPreview();
      },
    });
    paintPlacementPreview();
  }

  // Actualiza solo las clases de vista previa sin recrear el DOM. Recrear las
  // casillas en cada mouseenter provocaba parpadeo, pérdida de foco y, en
  // pantallas táctiles, que el primer toque no colocara el barco.
  function paintPlacementPreview() {
    var board = $("#placement-board");
    if (!board) return;
    board.querySelectorAll(".cell.ship-preview").forEach(function (el) {
      el.classList.remove("ship-preview", "invalid");
    });
    if (!placePreview.cells) return;
    placePreview.cells.forEach(function (p) {
      var el = board.querySelector('.cell[data-r="' + p.r + '"][data-c="' + p.c + '"]');
      if (!el) return;
      el.classList.add("ship-preview");
      if (!placePreview.valid) el.classList.add("invalid");
    });
  }

  function computePreview(r, c) {
    var id = state.placing.selectedShipId;
    var ship = id && state.placing.ships.find(function (s) { return s.id === id; });
    if (!ship || ship.cells.length) return { cells: null, valid: false };
    var cells = getShipCells(r, c, ship.length, state.placing.orientation);
    return { cells: cells, valid: canPlace(cells, state.placing.occupied, null) };
  }

  // Tras confirmar la flota ya no se puede tocar la colocación
  function placementLocked() {
    return state.phase !== "place" || !!state.placing.confirmed;
  }

  function onPlaceHover(r, c) {
    if (placementLocked()) return;
    lastHover = { r: r, c: c };
    placePreview = computePreview(r, c);
    paintPlacementPreview();
  }

  function shipOrientation(ship) {
    if (ship.cells.length > 1 && ship.cells[1].r !== ship.cells[0].r) return "V";
    return "H";
  }

  // Quita un barco ya colocado y lo deja seleccionado para recolocarlo
  function pickUpShip(shipId) {
    if (placementLocked()) return;
    var ship = state.placing.ships.find(function (s) { return s.id === shipId; });
    if (!ship || !ship.cells.length) return;
    state.placing.orientation = shipOrientation(ship);
    removeShipFromPlacing(shipId);
    state.placing.selectedShipId = shipId;
    placePreview = lastHover ? computePreview(lastHover.r, lastHover.c) : { cells: null, valid: false };
    renderPlacement();
    saveGame();
    toast(ship.name + " quitado: colócalo de nuevo", 1600);
  }

  function onPlaceClick(r, c) {
    if (placementLocked()) return;
    var occupant = state.placing.occupied[key(r, c)];
    if (occupant) {
      pickUpShip(occupant);
      return;
    }
    var id = state.placing.selectedShipId;
    if (!id) {
      toast("Selecciona un barco de la lista");
      return;
    }
    var ship = state.placing.ships.find(function (s) { return s.id === id; });
    if (!ship || ship.cells.length) return;
    if (!placeShipOnPlacing(id, r, c)) {
      toast(
        state.spacing
          ? "No cabe: gira, deja espacio o elige otra casilla"
          : "No cabe ahí: gira o elige otra casilla"
      );
      return;
    }
    playSfx("place");
    var next = state.placing.ships.find(function (s) { return !s.cells.length; });
    state.placing.selectedShipId = next ? next.id : null;
    placePreview = computePreview(r, c);
    renderPlacement();
    saveGame();
  }

  function toggleOrientation() {
    if (placementLocked()) return;
    state.placing.orientation = state.placing.orientation === "H" ? "V" : "H";
    toast(
      state.placing.orientation === "H" ? "Orientación: horizontal" : "Orientación: vertical",
      1200
    );
    // Recalcula la vista previa en la casilla donde está el cursor
    placePreview = lastHover ? computePreview(lastHover.r, lastHover.c) : { cells: null, valid: false };
    paintPlacementPreview();
  }

  function showHandoff(title, message, nextAction) {
    state.handoff = { title: title, message: message, nextAction: nextAction };
    $("#handoff-title").textContent = title;
    $("#handoff-msg").innerHTML = message;
    showScreen("handoff");
  }

  // ——— Batalla ———
  function fleetStatusHtml(ships, showHits) {
    return ships
      .map(function (s) {
        return (
          '<li class="' +
          (s.sunk ? "sunk-ship" : "") +
          '"><span class="status-left"><span class="ship-chip" style="background:' +
          companyColor(s.id) +
          '"></span><span>' +
          escapeHtml(s.name) +
          '</span></span><span class="status-tag">' +
          (s.sunk ? "Hundido" : showHits ? s.hits + "/" + s.length : "En juego") +
          "</span></li>"
        );
      })
      .join("");
  }

  function renderPvpBoards(attackerIndex) {
    var defender = opponentOf(attackerIndex);
    var ownOccupied = {};
    state.players[attackerIndex].ships.forEach(function (ship) {
      ship.cells.forEach(function (cell) {
        ownOccupied[key(cell.r, cell.c)] = ship.id;
      });
    });
    var canShoot =
      !state.battle.awaitingHandoff &&
      !state.battle.inputLocked &&
      !state.players[attackerIndex].isCpu;

    buildBoard($("#own-board"), {
      mode: "own",
      occupied: ownOccupied,
      shots: state.players[defender].shots,
      interactive: false,
      markCell: lastEnemyShotOn(attackerIndex),
    });
    buildBoard($("#enemy-board"), {
      mode: "enemy",
      shots: state.players[attackerIndex].shots,
      interactive: canShoot,
      onCellClick: onFireClick,
    });
    $("#own-fleet-status").innerHTML = fleetStatusHtml(state.players[attackerIndex].ships, true);
    $("#enemy-fleet-status").innerHTML = fleetStatusHtml(state.players[defender].ships, false);
  }

  function renderCpuHumanView(canShoot) {
    var human = 0;
    var cpu = 1;
    var ownOccupied = {};
    state.players[human].ships.forEach(function (ship) {
      ship.cells.forEach(function (cell) {
        ownOccupied[key(cell.r, cell.c)] = ship.id;
      });
    });
    buildBoard($("#own-board"), {
      mode: "own",
      occupied: ownOccupied,
      shots: state.players[cpu].shots,
      interactive: false,
      markCell: lastEnemyShotOn(human),
    });
    buildBoard($("#enemy-board"), {
      mode: "enemy",
      shots: state.players[human].shots,
      interactive: !!canShoot,
      onCellClick: onFireClick,
    });
    $("#own-fleet-status").innerHTML = fleetStatusHtml(state.players[human].ships, true);
    $("#enemy-fleet-status").innerHTML = fleetStatusHtml(state.players[cpu].ships, false);
  }

  function startBattle() {
    state.battle.attacker = 0;
    state.battle.awaitingHandoff = false;
    state.battle.inputLocked = false;
    state.battle.lastResult = null;
    state.battle.lastShot = null;
    state.turnCount = 0;
    showBattleFor(0);
    saveGame();
  }

  function showBattleFor(attackerIndex) {
    state.battle.attacker = attackerIndex;
    state.battle.inputLocked = !!state.players[attackerIndex].isCpu;
    showScreen("battle");

    var attacker = state.players[attackerIndex];
    $("#battle-title").textContent = "Turno de " + attacker.name;
    $("#turn-badge").textContent = attacker.name;

    var log = $("#battle-log");
    log.className = "battle-log";

    if (isCpuMode()) {
      var human = 0;
      var cpu = 1;
      $("#battle-subtitle").textContent = attacker.isCpu
        ? "La CPU está disparando…"
        : "Haz clic en el tablero enemigo para disparar.";
      $("#enemy-board-label").textContent = "Tablero de " + state.players[cpu].name;
      $("#own-board-label").textContent = "Tu flota (" + state.players[human].name + ")";
      $("#own-fleet-label").textContent = "Tu flota";
      $("#enemy-fleet-label").textContent = "Flota de " + state.players[cpu].name;
      var cpuNote = attacker.isCpu ? null : opponentShotNote(attackerIndex);
      log.textContent = attacker.isCpu
        ? "Esperando disparo de la CPU…"
        : cpuNote
          ? cpuNote + " Tu turno: elige una casilla."
          : "Elige una casilla para atacar.";
      renderCpuHumanView(!attacker.isCpu);
    } else {
      var defender = state.players[opponentOf(attackerIndex)];
      $("#battle-subtitle").textContent =
        "Haz clic en una casilla del tablero enemigo para disparar.";
      $("#enemy-board-label").textContent = "Tablero de " + defender.name;
      $("#own-board-label").textContent = "Tu flota (" + attacker.name + ")";
      $("#own-fleet-label").textContent = "Tu flota";
      $("#enemy-fleet-label").textContent = "Flota de " + defender.name;
      var pvpNote = opponentShotNote(attackerIndex);
      log.textContent = pvpNote
        ? pvpNote + " Tu turno: elige una casilla."
        : "Elige una casilla para atacar.";
      renderPvpBoards(attackerIndex);
    }
  }

  function coordLabel(r, c) {
    return cols()[c] + (r + 1);
  }

  // Resumen del último disparo del rival, visto por quien juega ahora
  function opponentShotNote(viewerIndex) {
    var ls = state.battle.lastShot;
    if (!ls || ls.by === viewerIndex) return null;
    var who = state.players[ls.by].name;
    var where = coordLabel(ls.r, ls.c);
    if (ls.result === "miss") return who + " disparó a " + where + ": agua.";
    if (ls.result === "sunk") return who + " disparó a " + where + " y hundió tu " + ls.shipName + ".";
    return who + " disparó a " + where + " y tocó tu " + ls.shipName + ".";
  }

  // Casilla del tablero propio donde cayó el último disparo del rival
  function lastEnemyShotOn(viewerIndex) {
    var ls = state.battle.lastShot;
    if (!ls || ls.by === viewerIndex) return null;
    return { r: ls.r, c: ls.c };
  }

  function applyShotFeedback(attacker, result) {
    var letters = cols();
    var r = result.cell.r;
    var c = result.cell.c;
    state.battle.lastShot = {
      by: attacker,
      r: r,
      c: c,
      result: result.result,
      shipName: result.shipName || null,
    };
    var coord = letters[c] + (r + 1);
    var log = $("#battle-log");
    log.className = "battle-log";

    var msg = "";
    if (result.result === "miss") {
      msg = "¡Agua! (" + coord + ")";
      log.classList.add("miss-msg");
      playSfx("miss");
    } else if (result.result === "hit") {
      msg = "¡Tocado! (" + coord + ")";
      log.classList.add("hit-msg");
      playSfx("hit");
    } else if (result.result === "sunk") {
      msg = "¡Hundido! Destruiste a " + result.shipName + " (" + coord + ")";
      log.classList.add("sunk-msg");
      playSfx("sunk");
      var sunkText =
        isCpuMode() && state.players[attacker].isCpu
          ? "¡" + state.players[attacker].name + " hundió tu " + result.shipName + "!"
          : "¡Hundiste " + result.shipName + "!";
      showSunkBanner(sunkText);
      toast(sunkText, 2800);
    }

    if (state.players[attacker].isCpu) {
      msg = state.players[attacker].name + ": " + msg;
      log.classList.add("cpu-msg");
    }

    log.textContent = msg;
    state.battle.lastResult = msg;

    if (isCpuMode()) {
      renderCpuHumanView(false);
      // Animations: human shots on enemy board; CPU shots on own board
      if (attacker === 0) {
        if (result.result === "miss") animateCell(findEnemyCell(r, c), "anim-splash", 550);
        else if (result.result === "hit") animateCell(findEnemyCell(r, c), "anim-boom", 450);
        else if (result.result === "sunk") playTheaterMode(result.cells, true);
      } else {
        if (result.result === "miss") animateCell(findOwnCell(r, c), "anim-splash", 550);
        else if (result.result === "hit") animateCell(findOwnCell(r, c), "anim-boom", 450);
        else if (result.result === "sunk") playTheaterMode(result.cells, false);
      }
    } else {
      renderPvpBoards(attacker);
      if (result.result === "miss") animateCell(findEnemyCell(r, c), "anim-splash", 550);
      else if (result.result === "hit") animateCell(findEnemyCell(r, c), "anim-boom", 450);
      else if (result.result === "sunk") playTheaterMode(result.cells, true);
    }
  }

  function afterShot(attacker, result) {
    if (result.win) {
      state.winner = attacker;
      clearSave();
      later(function () { showWin(); }, 1000);
      return;
    }

    // Se guarda ya con el turno del rival: si se recarga la página antes de
    // pasar el dispositivo, el mismo jugador no puede volver a disparar.
    var next = opponentOf(attacker);
    state.battle.attacker = next;
    state.battle.lastResult = null;
    saveGame();

    if (isCpuMode()) {
      state.battle.awaitingHandoff = false;
      later(function () {
        clearTheater();
        showBattleFor(next);
        if (state.players[next].isCpu) scheduleCpuTurn();
      }, result.result === "sunk" ? 1200 : 750);
      return;
    }

    state.battle.awaitingHandoff = true;
    var nextP = next;
    later(function () {
      clearTheater();
      showHandoff(
        "Pasa el dispositivo",
        "Turno terminado.<br><br>Entrega el dispositivo a <strong>" +
          escapeHtml(playerLabel(nextP)) +
          "</strong>.<br>Cuando esté listo/a, pulsa <strong>Listo</strong>.",
        function () {
          state.battle.awaitingHandoff = false;
          showBattleFor(nextP);
        }
      );
    }, result.result === "sunk" ? 1200 : 1100);
  }

  function onFireClick(r, c) {
    if (state.phase !== "battle" || state.battle.awaitingHandoff || state.battle.inputLocked) return;
    var attacker = state.battle.attacker;
    if (state.players[attacker].isCpu) return;

    clearTheater();
    ensureAudio();
    var result = fireShot(attacker, r, c);
    if (!result.ok) {
      if (result.reason === "already") toast("Ya disparaste ahí");
      return;
    }

    state.battle.inputLocked = true;
    applyShotFeedback(attacker, result);
    afterShot(attacker, result);
  }

  function scheduleCpuTurn() {
    clearTimeout(cpuTimer);
    state.battle.inputLocked = true;
    var delay = 650 + Math.random() * 450;
    cpuTimer = setTimeout(function () {
      if (state.phase !== "battle") return;
      var attacker = state.battle.attacker;
      if (!state.players[attacker].isCpu) return;

      var target = chooseCpuShot(attacker);
      if (!target) return;
      var result = fireShot(attacker, target.r, target.c);
      if (!result.ok) return;

      applyShotFeedback(attacker, result);
      afterShot(attacker, result);
    }, delay);
  }

  function showWin() {
    clearTheater();
    var w = state.players[state.winner];
    var cpuWon = isCpuMode() && w.isCpu;
    $("#win-title").textContent = cpuWon ? "Derrota" : "¡Victoria!";
    $(".win-trophy").textContent = cpuWon ? "⚓" : "🏆";
    $("#win-msg").innerHTML = cpuWon
      ? "<strong>" + escapeHtml(w.name) + "</strong> hundió toda tu flota. ¡Pide la revancha!"
      : "<strong>" + escapeHtml(w.name) + "</strong> hundió toda la flota enemiga.";

    function block(p) {
      var st = p.stats || emptyStats();
      var prec = st.shots > 0 ? Math.round((st.hits / st.shots) * 1000) / 10 : 0;
      return (
        '<div class="stat-block"><h4>' +
        escapeHtml(p.name) +
        "</h4><dl>" +
        "<dt>Disparos</dt><dd>" + st.shots + "</dd>" +
        "<dt>Aciertos</dt><dd>" + st.hits + "</dd>" +
        "<dt>Precisión</dt><dd>" + prec + "%</dd>" +
        "<dt>Barcos hundidos</dt><dd>" + st.shipsSunk + "</dd>" +
        "<dt>Turnos</dt><dd>" + st.turns + "</dd>" +
        "</dl></div>"
      );
    }

    var statsEl = $("#win-stats");
    statsEl.innerHTML = block(state.players[0]) + block(state.players[1]);

    showScreen("win");
    if (cpuWon) {
      playSfx("sunk");
    } else {
      playSfx("win");
      spawnWinConfetti();
    }
  }

  // ——— Flujo ———
  function readStartOptions() {
    var mode =
      (document.querySelector('input[name="game-mode"]:checked') || {}).value || "pvp";
    var diff =
      (document.querySelector('input[name="cpu-diff"]:checked') || {}).value || "easy";
    var board =
      (document.querySelector('input[name="board-size"]:checked') || {}).value || "normal";
    var theme =
      (document.querySelector('input[name="theme"]:checked') || {}).value || "cyan";
    var spacing = $("#opt-spacing").checked;
    var n1 = $("#name-p1").value.trim();
    var n2 = $("#name-p2").value.trim();

    prefs.mode = mode;
    prefs.difficulty = diff;
    prefs.boardMode = board;
    prefs.theme = theme;
    prefs.spacing = spacing;
    prefs.name1 = n1;
    // El nombre del Jugador 2 y el de la CPU se recuerdan por separado
    if (mode === "cpu") prefs.cpuName = n2;
    else prefs.name2 = n2;
    savePrefs();
    applyTheme(theme);

    return {
      mode: mode,
      difficulty: diff,
      boardMode: board,
      spacing: spacing,
      name1: n1 || "Jugador 1",
      name2: mode === "cpu" ? n2 || "CPU" : n2 || "Jugador 2",
    };
  }

  function beginGame(opts) {
    clearGameTimers();
    clearTheater();
    clearSave();

    state.mode = opts.mode;
    state.difficulty = opts.difficulty;
    state.boardMode = opts.boardMode;
    state.boardSize = opts.boardMode === "rapida" ? 8 : 10;
    state.spacing = !!opts.spacing;
    state.fleetTemplate = opts.boardMode === "rapida" ? FLEET_RAPIDA : FLEET_NORMAL;
    state.winner = null;
    state.turnCount = 0;

    state.players[0] = createPlayer(opts.name1, false);
    state.players[1] = createPlayer(opts.name2, opts.mode === "cpu");

    if (opts.mode === "cpu") {
      startPlacement(0);
    } else {
      showHandoff(
        "Pasa el dispositivo",
        "Es el turno de colocar la flota de <strong>" +
          escapeHtml(state.players[0].name) +
          "</strong>.<br>El otro jugador no debe mirar.<br><br>Pulsa <strong>Listo</strong> para continuar.",
        function () { startPlacement(0); }
      );
    }
  }

  function onConfirmPlacement() {
    if (state.phase !== "place" || state.placing.confirmed || !allShipsPlaced()) return;
    $("#btn-confirm-placement").disabled = true;
    var idx = state.placing.playerIndex;
    commitPlacement(idx);
    saveGame();
    state.placing.confirmed = true;

    if (isCpuMode()) {
      var humanPlacing = state.placing;
      placeFleetRandomForPlayer(1);
      state.placing = humanPlacing;
      toast("La CPU colocó su flota");
      later(function () { startBattle(); }, 400);
      return;
    }

    if (idx === 0) {
      showHandoff(
        "Pasa el dispositivo",
        "Flota de <strong>" +
          escapeHtml(state.players[0].name) +
          "</strong> lista.<br><br>Entrega el dispositivo a <strong>" +
          escapeHtml(state.players[1].name) +
          "</strong> para que coloque sus barcos.<br>Pulsa <strong>Listo</strong> cuando esté preparado/a.",
        function () { startPlacement(1); }
      );
    } else {
      showHandoff(
        "¡A la batalla!",
        "Ambas flotas están listas.<br><br>Empieza <strong>" +
          escapeHtml(state.players[0].name) +
          "</strong>.<br>Pasa el dispositivo y pulsa <strong>Listo</strong>.",
        function () { startBattle(); }
      );
    }
  }

  function resetToStart() {
    clearGameTimers();
    clearTheater();
    showScreen("start");
    state.phase = "start";
    updateContinueUI();
    applyStartFormFromPrefs();
    renderFleetPreview();
  }

  function applyTheme(theme) {
    document.body.setAttribute("data-theme", theme || "cyan");
  }

  function applyLargeText(on) {
    document.body.classList.toggle("large-text", !!on);
    var btn = $("#btn-large-text");
    if (btn) btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function applyStartFormFromPrefs() {
    var modeInput = document.querySelector(
      'input[name="game-mode"][value="' + prefs.mode + '"]'
    );
    if (modeInput) modeInput.checked = true;
    var diffInput = document.querySelector(
      'input[name="cpu-diff"][value="' + prefs.difficulty + '"]'
    );
    if (diffInput) diffInput.checked = true;
    var boardInput = document.querySelector(
      'input[name="board-size"][value="' + prefs.boardMode + '"]'
    );
    if (boardInput) boardInput.checked = true;
    var themeInput = document.querySelector(
      'input[name="theme"][value="' + prefs.theme + '"]'
    );
    if (themeInput) themeInput.checked = true;
    $("#opt-spacing").checked = !!prefs.spacing;
    $("#name-p1").value = prefs.name1 || "";
    $("#name-p2").value = (prefs.mode === "cpu" ? prefs.cpuName : prefs.name2) || "";
    applyTheme(prefs.theme);
    updateModeUI();
    renderFleetPreview();
  }

  function updateModeUI() {
    var mode =
      (document.querySelector('input[name="game-mode"]:checked') || {}).value || "pvp";
    var wrap = $("#cpu-difficulty-wrap");
    var labelP2 = $("#label-p2");
    if (wrap) wrap.hidden = mode !== "cpu";
    if (labelP2) {
      var input = $("#name-p2");
      if (mode === "cpu") {
        labelP2.firstChild.textContent = "Nombre CPU (opcional) ";
        if (input) input.placeholder = "CPU";
      } else {
        labelP2.firstChild.textContent = "Jugador 2 ";
        if (input) input.placeholder = "Capitán 2";
      }
    }
  }

  function toggleFullscreen() {
    var doc = document;
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      var el = doc.documentElement;
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) req.call(el);
    } else {
      var exit = doc.exitFullscreen || doc.webkitExitFullscreen;
      if (exit) exit.call(doc);
    }
  }

  function bindEvents() {
    $("#start-form").addEventListener("submit", function (e) {
      e.preventDefault();
      ensureAudio();
      if (prefs.music) startMusic();
      playSfx("click");
      beginGame(readStartOptions());
    });

    document.querySelectorAll('input[name="game-mode"]').forEach(function (el) {
      el.addEventListener("change", function () {
        // Guarda el nombre del modo anterior y carga el del nuevo
        var input = $("#name-p2");
        var current = input.value.trim();
        if (prefs.mode === "cpu") prefs.cpuName = current;
        else prefs.name2 = current;
        prefs.mode = el.value;
        input.value = (prefs.mode === "cpu" ? prefs.cpuName : prefs.name2) || "";
        updateModeUI();
        savePrefs();
      });
    });

    document.querySelectorAll('input[name="board-size"]').forEach(function (el) {
      el.addEventListener("change", function () {
        prefs.boardMode = el.value;
        savePrefs();
        renderFleetPreview();
      });
    });

    document.querySelectorAll('input[name="theme"]').forEach(function (el) {
      el.addEventListener("change", function () {
        prefs.theme = el.value;
        applyTheme(el.value);
        savePrefs();
      });
    });

    document.querySelectorAll('input[name="cpu-diff"]').forEach(function (el) {
      el.addEventListener("change", function () {
        prefs.difficulty = el.value;
        savePrefs();
      });
    });

    $("#opt-spacing").addEventListener("change", function () {
      prefs.spacing = $("#opt-spacing").checked;
      savePrefs();
    });

    $("#btn-continue").addEventListener("click", function () {
      ensureAudio();
      if (prefs.music) startMusic();
      playSfx("click");
      var data = loadSave();
      if (!data) {
        toast("No hay partida guardada");
        updateContinueUI();
        return;
      }
      try {
        applySave(data);
      } catch (e) {
        clearSave();
        resetToStart();
        toast("La partida guardada estaba dañada; empieza una nueva");
      }
    });

    $("#btn-new-game").addEventListener("click", function () {
      playSfx("click");
      clearSave();
      updateContinueUI();
      applyStartFormFromPrefs();
    });

    $("#btn-mute").addEventListener("click", function () {
      setMuted(!prefs.mute);
      if (!prefs.mute) {
        ensureAudio();
        playSfx("click");
      }
    });

    $("#btn-music").addEventListener("click", function () {
      ensureAudio();
      setMusic(!prefs.music);
      if (prefs.music) playSfx("click");
    });

    $("#btn-large-text").addEventListener("click", function () {
      prefs.largeText = !prefs.largeText;
      applyLargeText(prefs.largeText);
      savePrefs();
      playSfx("click");
    });

    $("#btn-fullscreen").addEventListener("click", function () {
      playSfx("click");
      toggleFullscreen();
    });

    $("#btn-handoff-ready").addEventListener("click", function () {
      playSfx("click");
      var fn = state.handoff.nextAction;
      state.handoff.nextAction = null;
      if (typeof fn === "function") fn();
    });

    $("#btn-rotate").addEventListener("click", function () {
      if (state.phase === "place") {
        playSfx("click");
        toggleOrientation();
      }
    });

    $("#btn-random").addEventListener("click", function () {
      if (placementLocked()) return;
      playSfx("place");
      var ok = randomPlaceAll();
      placePreview = { cells: null, valid: false };
      renderPlacement();
      saveGame();
      if (ok) toast("Flota colocada al azar");
    });

    $("#btn-confirm-placement").addEventListener("click", function () {
      playSfx("click");
      onConfirmPlacement();
    });

    $("#btn-rematch").addEventListener("click", function () {
      playSfx("click");
      beginGame({
        mode: state.mode,
        difficulty: state.difficulty,
        boardMode: state.boardMode,
        spacing: state.spacing,
        name1: state.players[0].name,
        name2: state.players[1].name,
      });
    });

    $("#btn-menu").addEventListener("click", function () {
      playSfx("click");
      if (state.winner !== null && state.phase === "battle") {
        // La partida ya terminó: mostrar el resultado en vez de perderlo
        clearGameTimers();
        showWin();
        return;
      }
      var wasPlaying = state.phase === "place" || state.phase === "battle" || state.phase === "handoff";
      resetToStart();
      if (wasPlaying && hasValidSave()) toast("Partida guardada: pulsa Continuar para seguir");
    });

    $("#placement-board").addEventListener("contextmenu", function (e) {
      if (state.phase !== "place") return;
      e.preventDefault();
      toggleOrientation();
    });

    document.addEventListener("visibilitychange", function () {
      if (!audioCtx) return;
      if (document.hidden) {
        audioCtx.suspend().catch(function () {});
      } else if (prefs.music || !prefs.mute) {
        audioCtx.resume().catch(function () {});
      }
    });

    $("#btn-home").addEventListener("click", function () {
      playSfx("click");
      clearSave();
      resetToStart();
    });

    // Flechas: moverse entre casillas de un tablero con el teclado
    document.addEventListener("keydown", function (e) {
      var dirs = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      var d = dirs[e.key];
      var el = e.target;
      if (!d || !el || !el.classList || !el.classList.contains("cell")) return;
      var board = el.closest(".board");
      if (!board) return;
      e.preventDefault();
      var n = boardSize();
      var r = +el.dataset.r;
      var c = +el.dataset.c;
      for (var step = 0; step < n; step++) {
        r += d[0];
        c += d[1];
        if (r < 0 || r >= n || c < 0 || c >= n) return;
        var next = board.querySelector('.cell[data-r="' + r + '"][data-c="' + c + '"]');
        if (next && next.tabIndex >= 0) {
          next.focus();
          if (state.phase === "place") onPlaceHover(r, c);
          return;
        }
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "r" || e.key === "R") {
        if (state.phase === "place" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat) {
          var tag = (e.target && e.target.tagName) || "";
          if (tag === "INPUT" || tag === "TEXTAREA") return;
          e.preventDefault();
          toggleOrientation();
        }
      }
      if (e.key === "Escape") clearTheater();
    });
  }

  function init() {
    loadPrefs();
    applyTheme(prefs.theme);
    applyLargeText(prefs.largeText);
    updateMuteButton();
    updateMusicButton();
    applyStartFormFromPrefs();
    renderFleetPreview();
    bindEvents();
    updateContinueUI();
    showScreen("start");
    showHud(true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
