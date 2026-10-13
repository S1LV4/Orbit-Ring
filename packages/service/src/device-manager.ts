import { EventEmitter } from "events";
import HID from "node-hid";
import type { DeviceInfo } from "@orbitring/shared";
import { startMouseHook, stopMouseHook, lockCursor, unlockCursor, moveCursorLock, type MouseMoveCallback } from "./win32-mouse-hook";

export class DeviceManager extends EventEmitter {
  private devices: Map<string, DeviceInfo> = new Map();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  identifyMode = false;

  start() {
    this.scan();
    this.pollTimer = setInterval(() => this.scan(), 5000);

    if (process.platform === "win32") {
      startMouseHook((event) => {
        if (this.identifyMode && event.action === "press") {
          this.identifyMode = false;
        }

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

  lockCursor(onMove: MouseMoveCallback) {
    lockCursor(onMove);
  }

  moveCursorLock(x: number, y: number) {
    moveCursorLock(x, y);
  }

  unlockCursor() {
    unlockCursor();
  }

  getDevices(): DeviceInfo[] {
    return Array.from(this.devices.values());
  }

  private scan() {
    const hidDevices = HID.devices();

    const mice = hidDevices.filter(
      (d) => d.usagePage === 1 && d.usage === 2 && d.path
    );

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
        `[orbit] Found ${this.devices.size} mouse device(s):`,
        Array.from(this.devices.values())
          .map((d) => d.name)
          .join(", ")
      );
      this.emit("devices_changed");
    }
  }
}
