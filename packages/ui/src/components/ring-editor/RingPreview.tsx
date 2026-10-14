import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RingGroup } from "@orbitring/shared";
import type { RingPluginAction } from "./catalog";
import { t } from "../../i18n";

export const RING_SIZE = 640;
const READY_TIMEOUT_MS = 1500;
const MIN_SCALE = 0.35;

export interface RingPreviewConfig {
  groups: RingGroup[];
  accent: string;
  theme: string;
  liquid: boolean;
  ascii: boolean;
  edit: true;
  selected: string | null;
  pluginActions: RingPluginAction[];
}

export type RingMessage =
  | { type: "ready" }
  | { type: "select"; groupId: string | null; actionId: string | null }
  | { type: "add-action"; groupId: string; x: number; y: number }
  | { type: "context"; groupId: string; actionId: string | null; x: number; y: number }
  | { type: "reorder-groups"; ids: string[] }
  | { type: "reorder-actions"; groupId: string; actions: string[] }
  | { type: "move-action"; fromGroupId: string; toGroupId: string; actionId: string }
  | { type: "remove-action"; groupId: string; actionId: string }
  | { type: "remove-group"; groupId: string }
  | { type: "undo" }
  | { type: "redo" };

const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const strOrNull = (v: unknown): string | null => (str(v) ? v : null);
const strArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function parseRingMessage(d: unknown): RingMessage | null {
  if (!d || typeof d !== "object") return null;
  const m = d as Record<string, unknown>;
  if (m.source !== "orbit-ring") return null;
  switch (m.type) {
    case "ready":
    case "undo":
    case "redo":
      return { type: m.type };
    case "select":
      return { type: "select", groupId: strOrNull(m.groupId), actionId: strOrNull(m.actionId) };
    case "add-action":
      return str(m.groupId) && num(m.x) && num(m.y) ? { type: "add-action", groupId: m.groupId, x: m.x, y: m.y } : null;
    case "context":
      return str(m.groupId) && num(m.x) && num(m.y)
        ? { type: "context", groupId: m.groupId, actionId: strOrNull(m.actionId), x: m.x, y: m.y }
        : null;
    case "reorder-groups":
      return strArray(m.ids) ? { type: "reorder-groups", ids: m.ids } : null;
    case "reorder-actions":
      return str(m.groupId) && strArray(m.actions)
        ? { type: "reorder-actions", groupId: m.groupId, actions: m.actions }
        : null;
    case "move-action":
      return str(m.fromGroupId) && str(m.toGroupId) && str(m.actionId)
        ? { type: "move-action", fromGroupId: m.fromGroupId, toGroupId: m.toGroupId, actionId: m.actionId }
        : null;
    case "remove-action":
      return str(m.groupId) && str(m.actionId)
        ? { type: "remove-action", groupId: m.groupId, actionId: m.actionId }
        : null;
    case "remove-group":
      return str(m.groupId) ? { type: "remove-group", groupId: m.groupId } : null;
    default:
      return null;
  }
}

interface LegacyRingWindow {
  applyConfig?: (cfg: unknown) => void;
  setTheme?: (theme: string, animate: boolean) => void;
}

interface RingPreviewProps {
  cfg: RingPreviewConfig;
  onMessage: (msg: RingMessage) => void;
}

export function RingPreview({ cfg, onMessage }: RingPreviewProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  scaleRef.current = scale;

  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const readyRef = useRef(false);
  const legacyRef = useRef(false);
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const fit = () => {
      const s = Math.min(1, el.clientWidth / RING_SIZE, el.clientHeight / RING_SIZE);
      const next = Math.max(MIN_SCALE, Math.round(s * 1000) / 1000);
      setScale((p) => (p === next ? p : next));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const applyLegacy = useCallback(() => {
    try {
      const w = iframeRef.current?.contentWindow as (Window & LegacyRingWindow) | null | undefined;
      if (!w) return;
      const c = cfgRef.current;
      w.applyConfig?.(c);
      w.setTheme?.(c.theme, false);
    } catch {
    }
  }, []);

  const post = useCallback(() => {
    const w = iframeRef.current?.contentWindow;
    if (!w) return;
    try {
      w.postMessage({ target: "orbit-ring", type: "config", cfg: cfgRef.current }, "*");
    } catch {
    }
    if (legacyRef.current) applyLegacy();
  }, [applyLegacy]);

  useEffect(() => {
    post();
  }, [cfg, post]);

  useEffect(() => {
    const onWindowMessage = (e: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || e.source !== frame.contentWindow) return;
      const msg = parseRingMessage(e.data);
      if (!msg) return;
      if (msg.type === "ready") {
        readyRef.current = true;
        legacyRef.current = false;
        if (readyTimer.current) clearTimeout(readyTimer.current);
        post();
        return;
      }
      if (msg.type === "add-action" || msg.type === "context") {
        const r = frame.getBoundingClientRect();
        const s = scaleRef.current;
        onMessageRef.current({ ...msg, x: r.left + msg.x * s, y: r.top + msg.y * s });
        return;
      }
      onMessageRef.current(msg);
    };
    window.addEventListener("message", onWindowMessage);
    return () => {
      window.removeEventListener("message", onWindowMessage);
      if (readyTimer.current) clearTimeout(readyTimer.current);
    };
  }, [post]);

  const onLoad = useCallback(() => {
    post();
    if (readyTimer.current) clearTimeout(readyTimer.current);
    readyTimer.current = setTimeout(() => {
      if (readyRef.current) return;
      legacyRef.current = true;
      applyLegacy();
    }, READY_TIMEOUT_MS);
  }, [applyLegacy, post]);

  const box = Math.round(RING_SIZE * scale);
  return (
    <div ref={areaRef} className="flex h-full w-full items-center justify-center overflow-hidden">
      <div className="relative shrink-0" style={{ width: box, height: box }} data-testid="ring-preview" data-scale={scale}>
        <iframe
          ref={iframeRef}
          src="./ring/ring.html"
          title={t("editor.preview.title")}
          onLoad={onLoad}
          className="absolute left-0 top-0 border-0"
          style={{
            width: RING_SIZE,
            height: RING_SIZE,
            transform: scale === 1 ? undefined : `scale(${scale})`,
            transformOrigin: "top left",
            background: "transparent",
          }}
        />
      </div>
    </div>
  );
}
