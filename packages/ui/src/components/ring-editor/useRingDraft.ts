import { useCallback, useEffect, useRef, useState } from "react";
import type { RingGroup, RingSettings, RingTheme } from "@orbitring/shared";

const SAVE_DEBOUNCE_MS = 200;
const HISTORY_LIMIT = 100;
const COALESCE_WINDOW_MS = 1200;
const ECHO_TTL_MS = 10_000;

const DEFAULTS = { theme: "dark" as RingTheme, size: 320, accent: "#C6F432", speed: 1, liquid: true };

export function normalizeSettings(s: Partial<RingSettings> | null | undefined): RingSettings {
  const src = (s ?? {}) as Partial<RingSettings>;
  const groups: RingGroup[] = Array.isArray(src.groups)
    ? src.groups
        .filter((g): g is RingGroup => !!g && typeof g === "object" && g.id != null)
        .map((g) => ({
          ...g,
          id: String(g.id),
          name: typeof g.name === "string" ? g.name : String(g.id),
          icon: typeof g.icon === "string" ? g.icon : "settings",
          actions: Array.isArray(g.actions) ? g.actions.filter((a): a is string => typeof a === "string") : [],
        }))
    : [];
  return {
    ...src,
    groups,
    theme: src.theme ?? DEFAULTS.theme,
    size: typeof src.size === "number" ? src.size : DEFAULTS.size,
    accent: typeof src.accent === "string" && src.accent ? src.accent : DEFAULTS.accent,
    speed: typeof src.speed === "number" ? src.speed : DEFAULTS.speed,
    liquid: typeof src.liquid === "boolean" ? src.liquid : DEFAULTS.liquid,
    ascii: src.ascii !== false,
  };
}

export function settingsKey(s: RingSettings): string {
  return JSON.stringify([
    s.groups.map((g) => [g.id, g.name, g.icon, g.actions]),
    s.theme,
    s.size,
    s.accent,
    s.speed,
    s.liquid,
    s.ascii !== false,
  ]);
}

export interface UpdateOptions {
  coalesce?: string;
}

export interface RingDraftApi {
  draft: RingSettings;
  update: (recipe: (d: RingSettings) => RingSettings, opts?: UpdateOptions) => boolean;
  undo: () => RingSettings | null;
  redo: () => RingSettings | null;
  canUndo: boolean;
  canRedo: boolean;
  flush: () => void;
  breakCoalescing: () => void;
  externalVersion: number;
}

export function useRingDraft(settings: RingSettings, onSave: (s: RingSettings) => void): RingDraftApi {
  const [draft, setDraft] = useState<RingSettings>(() => normalizeSettings(settings));
  const draftRef = useRef(draft);
  const pastRef = useRef<RingSettings[]>([]);
  const futureRef = useRef<RingSettings[]>([]);
  const [counts, setCounts] = useState({ past: 0, future: 0 });
  const [externalVersion, setExternalVersion] = useState(0);

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const pendingEchoesRef = useRef<{ key: string; t: number }[]>([]);
  const coalesceRef = useRef<{ key: string; t: number } | null>(null);
  const seenKeyRef = useRef<string>(settingsKey(draft));

  const syncCounts = useCallback(() => {
    setCounts({ past: pastRef.current.length, future: futureRef.current.length });
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const d = draftRef.current;
    const now = Date.now();
    pendingEchoesRef.current = pendingEchoesRef.current
      .filter((p) => now - p.t < ECHO_TTL_MS)
      .concat({ key: settingsKey(d), t: now })
      .slice(-50);
    onSaveRef.current(d);
  }, []);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [flush]);

  const commit = useCallback(
    (next: RingSettings) => {
      draftRef.current = next;
      setDraft(next);
      syncCounts();
      scheduleSave();
    },
    [scheduleSave, syncCounts],
  );

  const update = useCallback(
    (recipe: (d: RingSettings) => RingSettings, opts?: UpdateOptions) => {
      const prev = draftRef.current;
      const next = recipe(prev);
      if (next === prev || settingsKey(next) === settingsKey(prev)) return false;
      const now = Date.now();
      const c = coalesceRef.current;
      const merge = !!opts?.coalesce && !!c && c.key === opts.coalesce && now - c.t < COALESCE_WINDOW_MS;
      if (!merge) {
        pastRef.current.push(prev);
        if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
      }
      futureRef.current = [];
      coalesceRef.current = opts?.coalesce ? { key: opts.coalesce, t: now } : null;
      commit(next);
      return true;
    },
    [commit],
  );

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return null;
    futureRef.current.push(draftRef.current);
    coalesceRef.current = null;
    commit(prev);
    return prev;
  }, [commit]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return null;
    pastRef.current.push(draftRef.current);
    coalesceRef.current = null;
    commit(next);
    return next;
  }, [commit]);

  const breakCoalescing = useCallback(() => {
    coalesceRef.current = null;
  }, []);

  useEffect(() => {
    const incoming = normalizeSettings(settings);
    const key = settingsKey(incoming);
    if (key === seenKeyRef.current) return;
    seenKeyRef.current = key;

    if (key === settingsKey(draftRef.current)) {
      const i = pendingEchoesRef.current.findIndex((p) => p.key === key);
      if (i >= 0) pendingEchoesRef.current = pendingEchoesRef.current.slice(i + 1);
      return;
    }
    const now = Date.now();
    const pending = pendingEchoesRef.current.filter((p) => now - p.t < ECHO_TTL_MS);
    const i = pending.findIndex((p) => p.key === key);
    if (i >= 0) {
      pendingEchoesRef.current = pending.slice(i + 1);
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    dirtyRef.current = false;
    pendingEchoesRef.current = [];
    pastRef.current = [];
    futureRef.current = [];
    coalesceRef.current = null;
    draftRef.current = incoming;
    setDraft(incoming);
    syncCounts();
    setExternalVersion((v) => v + 1);
  }, [settings, syncCounts]);

  useEffect(() => {
    const onHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("blur", onHide);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", onHide);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [flush]);

  return {
    draft,
    update,
    undo,
    redo,
    canUndo: counts.past > 0,
    canRedo: counts.future > 0,
    flush,
    breakCoalescing,
    externalVersion,
  };
}
