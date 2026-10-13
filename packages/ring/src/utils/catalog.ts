/** Default actions for the 8 ring slots */
export interface RingAction {
  type: string;
  key?: string;
  modifiers?: string[];
  action?: string;
  label?: string;
}

export const DEFAULT_ACTIONS: RingAction[] = [
  { type: "keystroke", key: "c", modifiers: ["ctrl"], label: "Ctrl+C" },
  { type: "keystroke", key: "v", modifiers: ["ctrl"], label: "Ctrl+V" },
  { type: "keystroke", key: "z", modifiers: ["ctrl"], label: "Ctrl+Z" },
  { type: "keystroke", key: "s", modifiers: ["ctrl"], label: "Ctrl+S" },
  { type: "system", action: "screenshot" },
  { type: "system", action: "open_terminal" },
  { type: "system", action: "media_play_pause" },
  { type: "system", action: "show_desktop" },
];

/** SVG path data for each action slot icon */
export const ACTION_ICONS: string[] = [
  // Copy
  '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
  // Paste
  '<path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  // Undo
  '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>',
  // Save
  '<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  // Screenshot
  '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>',
  // Terminal
  '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
  // Play/Pause
  '<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16"/>',
  // Desktop
  '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
];

/** Labels for each action slot */
export const ACTION_LABELS: string[] = [
  "Copiar",
  "Colar",
  "Desfazer",
  "Salvar",
  "Screenshot",
  "Terminal",
  "Play/Pause",
  "Desktop",
];

/** Precomputed button centers on a circle with R=90 from (160,160) */
export const BUTTON_CENTERS: { x: number; y: number }[] = [
  { x: 160, y: 70 },
  { x: 223, y: 97 },
  { x: 250, y: 160 },
  { x: 223, y: 223 },
  { x: 160, y: 250 },
  { x: 97, y: 223 },
  { x: 70, y: 160 },
  { x: 97, y: 97 },
];
