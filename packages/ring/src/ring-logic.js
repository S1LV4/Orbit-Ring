// ═══════════════════════════════════════════
// ring-logic.js — Pure functions extracted from ring.html for testability
// ═══════════════════════════════════════════

var RAMP = ' .:-=+*#%@';

// ── Geometry helpers ──

function pol(r, d) {
  var t = d * Math.PI / 180;
  return [r * Math.cos(t), r * Math.sin(t)];
}

function hash(a, b) {
  var x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function sideOf(a) {
  var t = a * Math.PI / 180, c = Math.cos(t);
  return c > 0.38 ? "l" : c < -0.38 ? "r" : (Math.sin(t) < 0 ? "t" : "b");
}

// Spiral arm bezier: f=0→origin, f=1→(tx,ty)
function arm(tx, ty, f) {
  var L = Math.hypot(tx, ty) || 1, bend = 0.42;
  var cx = tx / 2 + (-ty / L) * L * bend, cy = ty / 2 + (tx / L) * L * bend;
  var u = 1 - f;
  return [2 * u * f * cx + f * f * tx, 2 * u * f * cy + f * f * ty];
}

function spring(o, k, v, tgt, stiff, damp) {
  o[v] = (o[v] + (tgt - o[k]) * stiff) * damp;
  o[k] += o[v];
}

// ── Targets computation ──

function targets(groups, isOpen, activeGroup, hover, R1, R2, STEP) {
  var T = {};
  groups.forEach(function (g, gi) {
    var a = (gi / groups.length) * 360 - 90;
    g._a = a;
    var isAct = isOpen && activeGroup === g.id;
    var other = isOpen && activeGroup && !isAct;
    var hot = hover === g.id;
    var p = pol(R1 - (hot && !other ? 8 : 0), a);
    T[g.id] = isOpen
      ? { x: p[0], y: p[1], s: other ? 0.84 : 1, a: a, o: other ? 0.4 : 1 }
      : { x: 0, y: 0, s: 0, a: a, o: 0 };

    g.actions.forEach(function (aid, i) {
      var base = a + (i - (g.actions.length - 1) / 2) * STEP;
      var hj = isAct ? g.actions.indexOf(hover) : -1;
      var spread = hj >= 0 && i !== hj ? Math.sign(i - hj) * 4 : 0;
      var aa = base + spread;
      var ap = pol(R2 - (i === hj ? 12 : 0), aa);
      var bp = pol(R1, a);
      T[aid] = isAct
        ? { x: ap[0], y: ap[1], s: 1, a: aa, o: 1, d: i * 3 }
        : { x: bp[0], y: bp[1], s: 0, a: aa, o: 0 };
    });
  });
  return T;
}

// ── Config application ──

function applyConfig(cfg, state) {
  if (cfg.groups) {
    state.groups = cfg.groups;
  }
  if (cfg.theme) {
    state.theme = cfg.theme;
  }
  if (cfg.accent) {
    state.accent = cfg.accent;
  }
  if (cfg.speed != null) {
    state.speed = cfg.speed;
  }
  if (cfg.liquid != null) {
    state.liquid = cfg.liquid;
  }
  return state;
}

// ── Delta-based selection ──

// Given accumulated (dx, dy) from cursor delta, determine which group/action is hovered.
// Returns { groupId, actionId } or nulls.
function selectFromDelta(dx, dy, groups, activeGroup, R1, R2) {
  var dist = Math.hypot(dx, dy);
  if (dist < 15) return { groupId: null, actionId: null }; // dead zone at center

  var angle = Math.atan2(dy, dx) * 180 / Math.PI; // -180..180

  if (!activeGroup) {
    // Select group by angle
    var best = null, bestDiff = 999;
    groups.forEach(function (g, gi) {
      var ga = (gi / groups.length) * 360 - 90;
      var diff = angleDiff(angle, ga);
      if (diff < bestDiff) { bestDiff = diff; best = g.id; }
    });
    return { groupId: best, actionId: null };
  }

  // Active group: select action by angle
  var g = null;
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].id === activeGroup) { g = groups[i]; break; }
  }
  if (!g) return { groupId: activeGroup, actionId: null };

  // If distance hasn't reached action ring, stay on group (no action selected)
  if (dist < R1 * 0.8) return { groupId: activeGroup, actionId: null };

  var gi = groups.indexOf(g);
  var ga = (gi / groups.length) * 360 - 90;
  var STEP = 30;
  var bestAction = null, bestDiff2 = 999;
  g.actions.forEach(function (aid, ai) {
    var aa = ga + (ai - (g.actions.length - 1) / 2) * STEP;
    var diff = angleDiff(angle, aa);
    if (diff < bestDiff2) { bestDiff2 = diff; bestAction = aid; }
  });
  return { groupId: activeGroup, actionId: bestAction };
}

function angleDiff(a, b) {
  var d = ((a - b) % 360 + 540) % 360 - 180;
  return Math.abs(d);
}

// ── Toggle logic ──

function toggle(isOpen, activeGroup) {
  if (isOpen && activeGroup) {
    return { isOpen: true, activeGroup: null, hover: null };
  }
  return { isOpen: !isOpen, activeGroup: null, hover: null };
}

// ── Catalog validation ──

function validateGroups(groups, catalog) {
  var errors = [];
  groups.forEach(function (g) {
    if (!g.id) errors.push("Group missing id");
    if (!g.name) errors.push("Group '" + g.id + "' missing name");
    if (!g.icon) errors.push("Group '" + g.id + "' missing icon");
    if (!Array.isArray(g.actions)) {
      errors.push("Group '" + g.id + "' missing actions array");
    } else {
      g.actions.forEach(function (aid) {
        if (!catalog[aid]) errors.push("Group '" + g.id + "': unknown action '" + aid + "'");
      });
    }
  });
  return errors;
}

// ── Exports (CommonJS for Node test runners, no-op in browser) ──
if (typeof module !== "undefined" && module.exports) {
  module.exports = { pol, hash, sideOf, arm, spring, targets, applyConfig, toggle, validateGroups, selectFromDelta, angleDiff, RAMP };
}
