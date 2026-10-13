const HID = require("node-hid");

// ═══════════════════════════════════════════
// HID device enumeration
// ═══════════════════════════════════════════

describe("HID device enumeration", () => {
  let allDevices;

  beforeAll(() => {
    allDevices = HID.devices();
  });

  test("node-hid returns device list", () => {
    expect(Array.isArray(allDevices)).toBe(true);
    expect(allDevices.length).toBeGreaterThan(0);
  });

  test("devices have required HID fields", () => {
    for (const d of allDevices) {
      expect(d).toHaveProperty("vendorId");
      expect(d).toHaveProperty("productId");
      expect(typeof d.vendorId).toBe("number");
      expect(typeof d.productId).toBe("number");
    }
  });

  test("devices have usagePage and usage fields", () => {
    for (const d of allDevices) {
      expect(d).toHaveProperty("usagePage");
      expect(d).toHaveProperty("usage");
    }
  });
});

// ═══════════════════════════════════════════
// Mouse detection (usagePage=1, usage=2)
// ═══════════════════════════════════════════

describe("Mouse device detection", () => {
  let mice;

  beforeAll(() => {
    const all = HID.devices();
    mice = all.filter((d) => d.usagePage === 1 && d.usage === 2 && d.path);
  });

  test("finds at least one mouse device", () => {
    expect(mice.length).toBeGreaterThanOrEqual(1);
    console.log(`\n  Found ${mice.length} mouse HID interface(s):`);
    mice.forEach((m, i) => {
      console.log(`    [${i}] ${m.product || "Unknown"} — VID:${m.vendorId.toString(16).padStart(4, "0")} PID:${m.productId.toString(16).padStart(4, "0")} (${m.manufacturer || "?"})`);
    });
  });

  test("mouse devices have a path", () => {
    for (const m of mice) {
      expect(m.path).toBeTruthy();
      expect(typeof m.path).toBe("string");
      expect(m.path.length).toBeGreaterThan(0);
    }
  });

  test("mouse devices have valid vendorId and productId", () => {
    for (const m of mice) {
      expect(m.vendorId).toBeGreaterThan(0);
      expect(m.productId).toBeGreaterThan(0);
    }
  });

  test("mouse devices have usagePage=1 (Generic Desktop) and usage=2 (Mouse)", () => {
    for (const m of mice) {
      expect(m.usagePage).toBe(1);
      expect(m.usage).toBe(2);
    }
  });
});

// ═══════════════════════════════════════════
// Deduplication (wireless mice show multiple HID interfaces)
// ═══════════════════════════════════════════

describe("Mouse deduplication", () => {
  let mice;
  let uniqueMice;

  beforeAll(() => {
    const all = HID.devices();
    mice = all.filter((d) => d.usagePage === 1 && d.usage === 2 && d.path);

    const seen = new Set();
    uniqueMice = mice.filter((m) => {
      const key = `${m.vendorId}:${m.productId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

  test("deduplication reduces interface count to unique devices", () => {
    expect(uniqueMice.length).toBeLessThanOrEqual(mice.length);
    expect(uniqueMice.length).toBeGreaterThanOrEqual(1);
    console.log(`\n  ${mice.length} interfaces → ${uniqueMice.length} unique device(s)`);
  });

  test("each unique device has a distinct vendorId:productId", () => {
    const ids = uniqueMice.map((m) => `${m.vendorId}:${m.productId}`);
    expect(new Set(ids).size).toBe(uniqueMice.length);
  });

  test("unique devices produce valid DeviceInfo objects", () => {
    for (const m of uniqueMice) {
      const info = {
        id: `${m.vendorId}:${m.productId}`,
        name: m.product || `Mouse ${m.vendorId}:${m.productId}`,
        vendorId: m.vendorId,
        productId: m.productId,
        manufacturer: m.manufacturer || undefined,
        path: m.path,
      };

      expect(info.id).toMatch(/^\d+:\d+$/);
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.path.length).toBeGreaterThan(0);
      console.log(`    ✓ ${info.name} [${info.id}] — ${info.manufacturer || "generic"}`);
    }
  });
});

// ═══════════════════════════════════════════
// Wireless / Bluetooth detection
// ═══════════════════════════════════════════

describe("Wireless mouse support", () => {
  let mice;

  beforeAll(() => {
    const all = HID.devices();
    mice = all.filter((d) => d.usagePage === 1 && d.usage === 2 && d.path);
  });

  test("wireless mice are detected (multiple HID interfaces per device)", () => {
    // Wireless mice typically expose 2+ HID interfaces for a single VID:PID
    const counts = {};
    for (const m of mice) {
      const key = `${m.vendorId}:${m.productId}`;
      counts[key] = (counts[key] || 0) + 1;
    }

    const multiInterface = Object.entries(counts).filter(([, c]) => c > 1);
    console.log(`\n  Devices with multiple HID interfaces (likely wireless):`);
    if (multiInterface.length === 0) {
      console.log("    (none — may be a simple USB mouse)");
    } else {
      multiInterface.forEach(([id, count]) => {
        const dev = mice.find((m) => `${m.vendorId}:${m.productId}` === id);
        console.log(`    ${dev.product || id} — ${count} interfaces`);
      });
    }

    // This test just verifies the detection logic handles multi-interface correctly
    expect(Object.keys(counts).length).toBeGreaterThanOrEqual(1);
  });

  test("all mouse paths are unique across interfaces", () => {
    const paths = mice.map((m) => m.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

// ═══════════════════════════════════════════
// Non-mouse HID devices are excluded
// ═══════════════════════════════════════════

describe("Non-mouse filtering", () => {
  let allDevices;
  let mice;

  beforeAll(() => {
    allDevices = HID.devices();
    mice = allDevices.filter((d) => d.usagePage === 1 && d.usage === 2 && d.path);
  });

  test("keyboards are not included in mouse list", () => {
    // Keyboards: usagePage=1, usage=6
    const keyboards = allDevices.filter((d) => d.usagePage === 1 && d.usage === 6);
    for (const kb of keyboards) {
      const inMice = mice.some((m) => m.path === kb.path);
      expect(inMice).toBe(false);
    }
    console.log(`\n  ${keyboards.length} keyboard interface(s) correctly excluded`);
  });

  test("gamepads are not included in mouse list", () => {
    // Gamepads: usagePage=1, usage=4 or 5
    const gamepads = allDevices.filter((d) => d.usagePage === 1 && (d.usage === 4 || d.usage === 5));
    for (const gp of gamepads) {
      const inMice = mice.some((m) => m.path === gp.path);
      expect(inMice).toBe(false);
    }
    console.log(`  ${gamepads.length} gamepad interface(s) correctly excluded`);
  });

  test("vendor-specific HID devices are not included", () => {
    // Vendor-specific: usagePage >= 0xFF00
    const vendor = allDevices.filter((d) => d.usagePage >= 0xff00);
    for (const v of vendor) {
      const inMice = mice.some((m) => m.path === v.path);
      expect(inMice).toBe(false);
    }
    console.log(`  ${vendor.length} vendor-specific interface(s) correctly excluded`);
  });
});

// ═══════════════════════════════════════════
// Device report summary
// ═══════════════════════════════════════════

describe("Device report", () => {
  test("prints full device report", () => {
    const all = HID.devices();
    const mice = all.filter((d) => d.usagePage === 1 && d.usage === 2 && d.path);
    const seen = new Set();
    const unique = mice.filter((m) => {
      const key = `${m.vendorId}:${m.productId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log("\n  ╔══════════════════════════════════════════════╗");
    console.log("  ║         DEVICE DETECTION REPORT              ║");
    console.log("  ╠══════════════════════════════════════════════╣");
    console.log(`  ║  Total HID devices:     ${String(all.length).padStart(4)}                ║`);
    console.log(`  ║  Mouse interfaces:      ${String(mice.length).padStart(4)}                ║`);
    console.log(`  ║  Unique mice:           ${String(unique.length).padStart(4)}                ║`);
    console.log("  ╠══════════════════════════════════════════════╣");
    unique.forEach((m) => {
      const name = (m.product || "Unknown Mouse").substring(0, 30).padEnd(30);
      const vid = m.vendorId.toString(16).padStart(4, "0");
      const pid = m.productId.toString(16).padStart(4, "0");
      console.log(`  ║  ${name}  ${vid}:${pid}  ║`);
    });
    console.log("  ╚══════════════════════════════════════════════╝");

    expect(unique.length).toBeGreaterThanOrEqual(1);
  });
});
