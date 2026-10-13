import { EventEmitter } from "events";
import HID from "node-hid";
import type { DeviceInfo } from "@m-ring/shared";
import { startMouseHook, stopMouseHook } from "./win32-mouse-hook";

/**
 * Manages mouse device discovery and button event capture.
 *
 * - Uses node-hid for device ENUMERATION (listing connected mice)
 * - Uses Win32 Low-Level Mouse Hook for CAPTURING button events
 *   (node-hid can't read mice on Windows — OS holds exclusive lock)
 */
export class DeviceManager extends EventEmitter {
  private devices: Map<string, DeviceInfo> = new Map();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  identifyMode = false;

  start() {
    this.scan();
    // Re-scan for new devices every 5 seconds
    this.pollTimer = setInterval(() => this.scan(), 5000);

    // Start the Win32 mouse hook for button capture
    if (process.platform === "win32") {
      startMouseHook((event) => {
        if (this.identifyMode && event.action === "press") {
          this.identifyMode = false;
        }

        // Use first device id or "unknown"
        const deviceId =
          this.devices.size > 0
            ? this.devices.values().next().value!.id
            : "unknown";

        this.emit("button", deviceId, event.button, event.action, event.x, event.y);
      });
    }
  }

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    stopMouseHook();
  }

  getDevices(): DeviceInfo[] {
    return Array.from(this.devices.values());
  }

  private scan() {
    const hidDevices = HID.devices();

    // Filter for mouse-like devices (usage page 1 = Generic Desktop, usage 2 = Mouse)
    const mice = hidDevices.filter(
      (d) => d.usagePage === 1 && d.usage === 2 && d.path
    );

    // Deduplicate by vendorId:productId (a wireless mouse shows multiple HID interfaces)
    const seen = new Set<string>();
    const uniqueMice = mice.filter((m) => {
      const key = `${m.vendorId}:${m.productId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const prevCount = this.devices.size;
    this.devices.clear();

    for (const mouse of uniqueMice) {
      if (!mouse.path) continue;

      const info: DeviceInfo = {
        id: `${mouse.vendorId}:${mouse.productId}`,
        name: mouse.product || `Mouse ${mouse.vendorId}:${mouse.productId}`,
        vendorId: mouse.vendorId,
        productId: mouse.productId,
        manufacturer: mouse.manufacturer || undefined,
        path: mouse.path,
      };

      this.devices.set(info.id, info);
    }

    if (this.devices.size !== prevCount) {
      console.log(
        `[m-ring] Found ${this.devices.size} mouse device(s):`,
        Array.from(this.devices.values())
          .map((d) => d.name)
          .join(", ")
      );
      this.emit("devices_changed");
    }
  }
}
