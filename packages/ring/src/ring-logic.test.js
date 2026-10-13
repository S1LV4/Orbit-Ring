const { pol, hash, sideOf, arm, spring, targets, applyConfig, toggle, validateGroups, selectFromDelta, angleDiff, RAMP } = require("./ring-logic");

// ═══════════════════════════════════════════
// pol — polar to cartesian
// ═══════════════════════════════════════════

describe("pol", () => {
  test("0° returns [r, 0]", () => {
    const [x, y] = pol(100, 0);
    expect(x).toBeCloseTo(100, 5);
    expect(y).toBeCloseTo(0, 5);
  });

  test("90° returns [0, r]", () => {
    const [x, y] = pol(100, 90);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(100, 5);
  });

  test("180° returns [-r, 0]", () => {
    const [x, y] = pol(50, 180);
    expect(x).toBeCloseTo(-50, 5);
    expect(y).toBeCloseTo(0, 5);
  });

  test("270° returns [0, -r]", () => {
    const [x, y] = pol(75, 270);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(-75, 5);
  });

  test("r=0 returns origin", () => {
    const [x, y] = pol(0, 45);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
  });
});

// ═══════════════════════════════════════════
// hash — deterministic pseudo-random
// ═══════════════════════════════════════════

describe("hash", () => {
  test("returns value in [0, 1)", () => {
    for (let a = 0; a < 20; a++) {
      for (let b = 0; b < 20; b++) {
        const h = hash(a, b);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(1);
      }
    }
  });

  test("is deterministic", () => {
    expect(hash(3, 7)).toBe(hash(3, 7));
    expect(hash(0, 0)).toBe(hash(0, 0));
  });

  test("different inputs produce different values", () => {
    expect(hash(1, 2)).not.toBe(hash(2, 1));
    expect(hash(0, 0)).not.toBe(hash(1, 0));
  });
});

// ═══════════════════════════════════════════
// sideOf — anchor side from angle
// ═══════════════════════════════════════════

describe("sideOf", () => {
  test("0° (right) → 'l' (label left of button)", () => {
    expect(sideOf(0)).toBe("l");
  });

  test("180° (left) → 'r'", () => {
    expect(sideOf(180)).toBe("r");
  });

  test("-90° / 270° (top) → 't'", () => {
    expect(sideOf(-90)).toBe("t");
    expect(sideOf(270)).toBe("t");
  });

  test("90° (bottom) → 'b'", () => {
    expect(sideOf(90)).toBe("b");
  });
});

// ═══════════════════════════════════════════
// arm — spiral arm bezier
// ═══════════════════════════════════════════

describe("arm", () => {
  test("f=0 returns origin", () => {
    const [x, y] = arm(100, 50, 0);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(0, 5);
  });

  test("f=1 returns target point", () => {
    const [x, y] = arm(100, 50, 1);
    expect(x).toBeCloseTo(100, 5);
    expect(y).toBeCloseTo(50, 5);
  });

  test("f=0.5 returns point along curve with bezier bend", () => {
    const [x, y] = arm(100, 100, 0.5);
    // Bezier bend means the midpoint deviates from the straight line midpoint
    const straightMidX = 50, straightMidY = 50;
    const dist = Math.hypot(x - straightMidX, y - straightMidY);
    expect(dist).toBeGreaterThan(1); // offset due to bezier curvature
  });

  test("handles zero-length target", () => {
    const [x, y] = arm(0, 0, 0.5);
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
  });
});

// ═══════════════════════════════════════════
// spring — physics spring simulation
// ═══════════════════════════════════════════

describe("spring", () => {
  test("moves value toward target", () => {
    const obj = { x: 0, vx: 0 };
    spring(obj, "x", "vx", 100, 0.16, 0.7);
    expect(obj.x).toBeGreaterThan(0);
    expect(obj.x).toBeLessThan(100);
  });

  test("converges to target over many iterations", () => {
    const obj = { x: 0, vx: 0 };
    for (let i = 0; i < 200; i++) {
      spring(obj, "x", "vx", 100, 0.16, 0.7);
    }
    expect(obj.x).toBeCloseTo(100, 1);
  });

  test("velocity decays (damping)", () => {
    const obj = { x: 0, vx: 10 };
    spring(obj, "x", "vx", 0, 0, 0.7); // stiff=0 means no restoring force, just damping
    expect(Math.abs(obj.vx)).toBeLessThan(10);
  });

  test("handles negative targets", () => {
    const obj = { x: 0, vx: 0 };
    spring(obj, "x", "vx", -50, 0.16, 0.7);
    expect(obj.x).toBeLessThan(0);
  });
});

// ═══════════════════════════════════════════
// targets — ring layout computation
// ═══════════════════════════════════════════

const DEFAULT_GROUPS = [
  { id: "edit", name: "Edição", icon: "edit", actions: ["copy", "paste", "undo"] },
  { id: "nav", name: "Navegação", icon: "compass", actions: ["back", "forward", "refresh"] },
  { id: "win", name: "Janelas", icon: "layers", actions: ["minimize", "maximize", "close"] },
  { id: "media", name: "Mídia", icon: "music", actions: ["playpause", "volmute"] },
  { id: "cap", name: "Captura", icon: "aperture", actions: ["screenshot"] },
  { id: "sys", name: "Sistema", icon: "settings", actions: ["save", "explorer", "find"] },
];

describe("targets", () => {
  test("closed ring: all groups at origin with scale 0", () => {
    const T = targets(DEFAULT_GROUPS, false, null, null, 75, 130, 30);
    DEFAULT_GROUPS.forEach((g) => {
      expect(T[g.id].x).toBe(0);
      expect(T[g.id].y).toBe(0);
      expect(T[g.id].s).toBe(0);
    });
  });

  test("open ring: groups have non-zero positions", () => {
    const T = targets(DEFAULT_GROUPS, true, null, null, 75, 130, 30);
    DEFAULT_GROUPS.forEach((g) => {
      const t = T[g.id];
      expect(Math.hypot(t.x, t.y)).toBeGreaterThan(0);
      expect(t.s).toBe(1);
      expect(t.o).toBe(1);
    });
  });

  test("open with active group: active group full opacity, others dimmed", () => {
    const T = targets(DEFAULT_GROUPS, true, "edit", null, 75, 130, 30);
    expect(T["edit"].s).toBe(1);
    expect(T["edit"].o).toBe(1);
    expect(T["nav"].s).toBe(0.84);
    expect(T["nav"].o).toBe(0.4);
  });

  test("active group actions are at R2 radius", () => {
    const T = targets(DEFAULT_GROUPS, true, "edit", null, 75, 130, 30);
    ["copy", "paste", "undo"].forEach((aid) => {
      const dist = Math.hypot(T[aid].x, T[aid].y);
      expect(dist).toBeCloseTo(130, 0); // R2
      expect(T[aid].s).toBe(1);
      expect(T[aid].o).toBe(1);
    });
  });

  test("inactive group actions collapse to R1", () => {
    const T = targets(DEFAULT_GROUPS, true, "nav", null, 75, 130, 30);
    // edit actions should be at R1 (collapsed to group position)
    ["copy", "paste", "undo"].forEach((aid) => {
      const dist = Math.hypot(T[aid].x, T[aid].y);
      expect(dist).toBeCloseTo(75, 0); // R1
      expect(T[aid].s).toBe(0);
      expect(T[aid].o).toBe(0);
    });
  });

  test("hover on group increases its R1 slightly", () => {
    const T1 = targets(DEFAULT_GROUPS, true, null, null, 75, 130, 30);
    const T2 = targets(DEFAULT_GROUPS, true, null, "edit", 75, 130, 30);
    const d1 = Math.hypot(T1["edit"].x, T1["edit"].y);
    const d2 = Math.hypot(T2["edit"].x, T2["edit"].y);
    expect(d2).toBeLessThan(d1); // closer to center (R1-8)
  });

  test("all action IDs appear in targets", () => {
    const T = targets(DEFAULT_GROUPS, true, "edit", null, 75, 130, 30);
    const allActions = DEFAULT_GROUPS.flatMap((g) => g.actions);
    allActions.forEach((aid) => {
      expect(T[aid]).toBeDefined();
      expect(T[aid]).toHaveProperty("x");
      expect(T[aid]).toHaveProperty("y");
    });
  });

  test("empty groups array returns empty targets", () => {
    const T = targets([], false, null, null, 75, 130, 30);
    expect(Object.keys(T)).toHaveLength(0);
  });

  test("hover on action spreads siblings apart", () => {
    const T1 = targets(DEFAULT_GROUPS, true, "edit", null, 75, 130, 30);
    const T2 = targets(DEFAULT_GROUPS, true, "edit", "copy", 75, 130, 30);
    // When hovering "copy" (index 0), "paste" (index 1) and "undo" (index 2) should spread
    expect(T2["paste"].a).not.toBeCloseTo(T1["paste"].a, 2);
  });
});

// ═══════════════════════════════════════════
// applyConfig — pure state transformer
// ═══════════════════════════════════════════

describe("applyConfig", () => {
  test("applies groups", () => {
    const state = { groups: [], theme: "dark", accent: "#fff", speed: 1, liquid: true };
    const newGroups = [{ id: "test", name: "Test", icon: "edit", actions: ["copy"] }];
    const result = applyConfig({ groups: newGroups }, state);
    expect(result.groups).toBe(newGroups);
  });

  test("applies theme", () => {
    const state = { groups: [], theme: "dark", accent: "#fff", speed: 1, liquid: true };
    const result = applyConfig({ theme: "light" }, state);
    expect(result.theme).toBe("light");
  });

  test("applies accent", () => {
    const state = { groups: [], theme: "dark", accent: "#fff", speed: 1, liquid: true };
    const result = applyConfig({ accent: "#FF0000" }, state);
    expect(result.accent).toBe("#FF0000");
  });

  test("applies speed", () => {
    const state = { groups: [], theme: "dark", accent: "#fff", speed: 1, liquid: true };
    const result = applyConfig({ speed: 0.5 }, state);
    expect(result.speed).toBe(0.5);
  });

  test("applies liquid=false", () => {
    const state = { groups: [], theme: "dark", accent: "#fff", speed: 1, liquid: true };
    const result = applyConfig({ liquid: false }, state);
    expect(result.liquid).toBe(false);
  });

  test("ignores unknown fields", () => {
    const state = { groups: [], theme: "dark", accent: "#fff", speed: 1, liquid: true };
    const result = applyConfig({ unknownField: 123 }, state);
    expect(result).not.toHaveProperty("unknownField");
  });

  test("empty config changes nothing", () => {
    const state = { groups: [1], theme: "dark", accent: "#abc", speed: 1.5, liquid: false };
    const original = { ...state, groups: [...state.groups] };
    const result = applyConfig({}, state);
    expect(result.theme).toBe(original.theme);
    expect(result.speed).toBe(original.speed);
    expect(result.liquid).toBe(original.liquid);
  });
});

// ═══════════════════════════════════════════
// toggle — open/close state machine
// ═══════════════════════════════════════════

describe("toggle", () => {
  test("closed → open", () => {
    const result = toggle(false, null);
    expect(result.isOpen).toBe(true);
    expect(result.activeGroup).toBeNull();
    expect(result.hover).toBeNull();
  });

  test("open with no active group → closed", () => {
    const result = toggle(true, null);
    expect(result.isOpen).toBe(false);
    expect(result.activeGroup).toBeNull();
  });

  test("open with active group → open with no active group (back to group list)", () => {
    const result = toggle(true, "edit");
    expect(result.isOpen).toBe(true);
    expect(result.activeGroup).toBeNull();
    expect(result.hover).toBeNull();
  });
});

// ═══════════════════════════════════════════
// validateGroups — config validation
// ═══════════════════════════════════════════

describe("validateGroups", () => {
  const catalog = { copy: {}, paste: {}, undo: {} };

  test("valid groups produce no errors", () => {
    const groups = [{ id: "edit", name: "Edição", icon: "edit", actions: ["copy", "paste"] }];
    expect(validateGroups(groups, catalog)).toHaveLength(0);
  });

  test("missing id is an error", () => {
    const groups = [{ name: "Edição", icon: "edit", actions: ["copy"] }];
    const errors = validateGroups(groups, catalog);
    expect(errors.some((e) => e.includes("missing id"))).toBe(true);
  });

  test("missing name is an error", () => {
    const groups = [{ id: "edit", icon: "edit", actions: ["copy"] }];
    const errors = validateGroups(groups, catalog);
    expect(errors.some((e) => e.includes("missing name"))).toBe(true);
  });

  test("unknown action is an error", () => {
    const groups = [{ id: "edit", name: "Edição", icon: "edit", actions: ["nonexistent"] }];
    const errors = validateGroups(groups, catalog);
    expect(errors.some((e) => e.includes("unknown action"))).toBe(true);
  });

  test("missing actions array is an error", () => {
    const groups = [{ id: "edit", name: "Edição", icon: "edit" }];
    const errors = validateGroups(groups, catalog);
    expect(errors.some((e) => e.includes("missing actions array"))).toBe(true);
  });
});

// ═══════════════════════════════════════════
// RAMP constant
// ═══════════════════════════════════════════

describe("RAMP", () => {
  test("has expected length (10 chars)", () => {
    expect(RAMP.length).toBe(10);
  });

  test("starts with space (lowest density)", () => {
    expect(RAMP[0]).toBe(" ");
  });

  test("ends with @ (highest density)", () => {
    expect(RAMP[RAMP.length - 1]).toBe("@");
  });
});

// ═══════════════════════════════════════════
// angleDiff — shortest angular distance
// ═══════════════════════════════════════════

describe("angleDiff", () => {
  test("same angle → 0", () => {
    expect(angleDiff(45, 45)).toBeCloseTo(0);
  });

  test("opposite angles → 180", () => {
    expect(angleDiff(0, 180)).toBeCloseTo(180);
  });

  test("wraps around 360", () => {
    expect(angleDiff(350, 10)).toBeCloseTo(20);
    expect(angleDiff(10, 350)).toBeCloseTo(20);
  });

  test("negative angles", () => {
    expect(angleDiff(-90, 90)).toBeCloseTo(180);
    expect(angleDiff(-10, 10)).toBeCloseTo(20);
  });
});

// ═══════════════════════════════════════════
// selectFromDelta — delta-based group/action selection
// ═══════════════════════════════════════════

describe("selectFromDelta", () => {
  const GROUPS = [
    { id: "edit", name: "Edição", icon: "edit", actions: ["copy", "paste", "undo"] },
    { id: "nav", name: "Navegação", icon: "compass", actions: ["back", "forward", "refresh"] },
    { id: "win", name: "Janelas", icon: "layers", actions: ["minimize", "maximize", "close"] },
    { id: "media", name: "Mídia", icon: "music", actions: ["playpause", "volmute"] },
    { id: "cap", name: "Captura", icon: "aperture", actions: ["screenshot"] },
    { id: "sys", name: "Sistema", icon: "settings", actions: ["save", "explorer", "find"] },
  ];

  test("dead zone at center returns nulls", () => {
    const sel = selectFromDelta(0, 0, GROUPS, null, 75, 130);
    expect(sel.groupId).toBeNull();
    expect(sel.actionId).toBeNull();
  });

  test("small delta in dead zone returns nulls", () => {
    const sel = selectFromDelta(5, 5, GROUPS, null, 75, 130);
    expect(sel.groupId).toBeNull();
  });

  test("moving right selects a group", () => {
    const sel = selectFromDelta(50, 0, GROUPS, null, 75, 130);
    expect(sel.groupId).not.toBeNull();
    expect(sel.actionId).toBeNull();
  });

  test("moving up selects the top group (edit at -90°)", () => {
    // edit is at index 0, angle = (0/6)*360 - 90 = -90° (straight up)
    const sel = selectFromDelta(0, -50, GROUPS, null, 75, 130);
    expect(sel.groupId).toBe("edit");
  });

  test("with active group, small delta returns group only", () => {
    const sel = selectFromDelta(20, 0, GROUPS, "edit", 75, 130);
    expect(sel.groupId).toBe("edit");
    expect(sel.actionId).toBeNull();
  });

  test("with active group, large delta selects an action", () => {
    // edit group is at -90° (up). Its actions are spread around -90° with STEP=30
    // Moving straight up should select the middle action (paste at index 1)
    const sel = selectFromDelta(0, -80, GROUPS, "edit", 75, 130);
    expect(sel.groupId).toBe("edit");
    expect(sel.actionId).not.toBeNull();
    expect(["copy", "paste", "undo"]).toContain(sel.actionId);
  });

  test("different angles select different groups", () => {
    const up = selectFromDelta(0, -50, GROUPS, null, 75, 130);
    const down = selectFromDelta(0, 50, GROUPS, null, 75, 130);
    const right = selectFromDelta(50, 0, GROUPS, null, 75, 130);
    // These should select different groups
    const ids = new Set([up.groupId, down.groupId, right.groupId]);
    expect(ids.size).toBeGreaterThanOrEqual(2);
  });

  test("empty groups returns nulls", () => {
    const sel = selectFromDelta(50, 0, [], null, 75, 130);
    expect(sel.groupId).toBeNull();
  });
});
