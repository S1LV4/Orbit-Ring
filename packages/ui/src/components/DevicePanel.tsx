import {
  Mouse,
  Usb,
  CircleDot,
  Zap,
} from "lucide-react";

interface DevicePanelProps {
  devices: any[];
  lastEvent: any;
}

export function DevicePanel({ devices, lastEvent }: DevicePanelProps) {
  return (
    <div className="p-6">
      <h2 className="text-base font-semibold mb-5 flex items-center gap-2 text-[#FAFAFA]">
        <CircleDot className="w-4 h-4 text-[#71717A]" />
        Detected Devices
      </h2>

      {devices.length === 0 ? (
        <div className="text-center py-16 text-[#71717A]">
          <Mouse className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">Nenhum mouse detectado</p>
          <p className="text-[10px] font-mono mt-2 text-[#33333B]">
            conecte um mouse (USB, Bluetooth ou wireless) — o serviço irá detectá-lo automaticamente
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {devices.map((device) => (
            <div
              key={device.id}
              className="p-4 orbit-card flex items-center gap-4"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: "color-mix(in srgb, var(--accent) 15%, #17171B)" }}
              >
                <Mouse className="w-4 h-4" style={{ color: "var(--accent)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-[#FAFAFA] truncate">{device.name}</h3>
                <p className="text-[10px] font-mono text-[#71717A] mt-0.5">
                  {device.manufacturer || "Generic"} &middot;{" "}
                  VID:{device.vendorId.toString(16).padStart(4, "0")}{" "}
                  PID:{device.productId.toString(16).padStart(4, "0")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Usb className="w-3.5 h-3.5 text-[#33333B]" />
                <span className="orbit-pill text-[10px]" style={{ color: "var(--accent)", borderColor: "color-mix(in srgb, var(--accent) 30%, #2A2A30)" }}>
                  connected
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {lastEvent && (
        <div className="mt-6">
          <h3 className="text-[10px] font-mono uppercase tracking-widest text-[#71717A] mb-2 flex items-center gap-2">
            <Zap className="w-3 h-3" />
            Last Event
          </h3>
          <div className="p-3 orbit-card font-mono text-xs">
            <span style={{ color: "var(--accent)" }}>{lastEvent.button}</span>
            <span className="text-[#33333B]"> {"->"} </span>
            <span className={lastEvent.action === "press" ? "text-[#FAFAFA]" : "text-[#71717A]"}>
              {lastEvent.action}
            </span>
            <span className="text-[#33333B] ml-2">
              {new Date(lastEvent.timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
