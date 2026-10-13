import {
  Mouse,
  Usb,
  Bluetooth,
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
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <CircleDot className="w-5 h-5 text-zinc-400" />
        Dispositivos Detectados
      </h2>

      {devices.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <Mouse className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum mouse detectado</p>
          <p className="text-xs mt-1">
            Conecte um mouse USB e o serviço detectará automaticamente
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {devices.map((device) => (
            <div
              key={device.id}
              className="p-4 bg-zinc-900 rounded-xl border border-zinc-800 flex items-center gap-4"
            >
              <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
                <Mouse className="w-5 h-5 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium truncate">{device.name}</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {device.manufacturer || "Genérico"} &middot;{" "}
                  VID:{device.vendorId.toString(16).padStart(4, "0")}{" "}
                  PID:{device.productId.toString(16).padStart(4, "0")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Usb className="w-4 h-4 text-zinc-600" />
                <span className="text-xs px-2 py-1 bg-emerald-950 text-emerald-400 rounded-full">
                  Conectado
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Live event log */}
      {lastEvent && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-2 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Último Evento
          </h3>
          <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 font-mono text-xs">
            <span className="text-violet-400">{lastEvent.button}</span>
            <span className="text-zinc-500"> → </span>
            <span className={lastEvent.action === "press" ? "text-emerald-400" : "text-zinc-500"}>
              {lastEvent.action}
            </span>
            <span className="text-zinc-600 ml-2">
              {new Date(lastEvent.timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
