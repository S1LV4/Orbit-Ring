const E = {
  COLOR_PICKER: "Local\\ShowColorPickerEvent-8c46be2a-3e05-4186-b56b-4ae986ef2525",
  ALWAYS_ON_TOP_PIN: "Local\\AlwaysOnTopPinEvent-892e0aa2-cfa8-4cc4-b196-ddeb32314ce8",
  FANCYZONES_EDITOR: "Local\\FancyZones-ToggleEditorEvent-1e174338-06a3-472b-874d-073b21c62f14",
  MEASURE_TOOL: "Local\\MeasureToolEvent-3d46745f-09b3-4671-a577-236be7abd199",
  TEXT_EXTRACTOR: "Local\\PowerOCREvent-dc864e06-e1af-4ecc-9078-f98bee745e3a",
  PEEK: "Local\\ShowPeekEvent",
  SHORTCUT_GUIDE: "Local\\ShortcutGuide-TriggerEvent-d4275ad3-2531-4d19-9252-c0becbd9b496",
  FIND_MY_MOUSE: "Local\\FindMyMouseTriggerEvent-5a9dc5f4-1c74-4f2f-a66f-1b9b6a2f9b23",
  MOUSE_HIGHLIGHTER: "Local\\MouseHighlighterTriggerEvent-1e3c9c3d-3fdf-4f9a-9a52-31c9b3c3a8f4",
  MOUSE_CROSSHAIRS: "Local\\MouseCrosshairsTriggerEvent-0d4c7f92-0a5c-4f5c-b64b-8a2a2f7e0b21",
  MOUSE_JUMP: "Local\\MouseJumpEvent-aa0be051-3396-4976-b7ba-1a9cc7d236a5",
  CROP_THUMBNAIL: "Local\\PowerToysCropAndLockThumbnailEvent-1637be50-da72-46b2-9220-b32b206b2434",
  CROP_REPARENT: "Local\\PowerToysCropAndLockReparentEvent-6060860a-76a1-44e8-8d0e-6355785e9c36",
  CMDPAL: "Local\\PowerToysCmdPal-ShowEvent-62336fcd-8611-4023-9b30-091a6af4cc5a",
  POWERTOYS_RUN: "Local\\PowerToysRunInvokeEvent-30f26ad7-d36d-4c0e-ab02-68bb5ff3c4ab",
  ADVANCED_PASTE: "Local\\PowerToys_AdvancedPaste_ShowUI",
  WORKSPACES_EDITOR: "Local\\Workspaces-LaunchEditorEvent-a55ff427-cf62-4994-a2cd-9f72139296bf",
  ZOOMIT_ZOOM: "Local\\PowerToysZoomIt-ZoomEvent-1e4190d7-94bc-4ad5-adc0-9a8fd07cb393",
  ZOOMIT_DRAW: "Local\\PowerToysZoomIt-DrawEvent-56338997-404d-4549-bd9a-d132b6766975",
  LIGHT_SWITCH: "Local\\PowerToys-LightSwitch-ToggleEvent-d8dc2f29-8c94-4ca1-8c5f-3e2b1e3c4f5a",
};

const ACTIONS = {
  color_picker: { module: "ColorPicker", label: "Color Picker", kind: "event", event: E.COLOR_PICKER, hotkey: ["ColorPicker", "properties", "ActivationShortcut"] },
  always_on_top: { module: "AlwaysOnTop", label: "Always On Top", kind: "event", event: E.ALWAYS_ON_TOP_PIN, foreground: true, hotkey: ["AlwaysOnTop", "properties", "hotkey", "value"] },
  awake: { module: "Awake", label: "Awake", kind: "settings", window: "Awake", stateful: true },
  fancyzones_editor: { module: "FancyZones", label: "Editor do FancyZones", kind: "event", event: E.FANCYZONES_EDITOR, hotkey: ["FancyZones", "properties", "fancyzones_editor_hotkey", "value"] },
  measure_tool: { module: "Measure Tool", label: "Régua de Tela", kind: "event", event: E.MEASURE_TOOL, hotkey: ["Measure Tool", "properties", "ActivationShortcut"] },
  text_extractor: { module: "TextExtractor", label: "Extrator de Texto", kind: "event", event: E.TEXT_EXTRACTOR, hotkey: ["TextExtractor", "properties", "ActivationShortcut"] },
  peek: { module: "Peek", label: "Peek", kind: "event", event: E.PEEK, foreground: true, guard: "explorer", hotkey: ["Peek", "properties", "ActivationShortcut"] },
  shortcut_guide: { module: "Shortcut Guide", label: "Guia de Atalhos", kind: "event", event: E.SHORTCUT_GUIDE, hotkey: ["Shortcut Guide", "properties", "open_shortcutguide"] },
  find_my_mouse: { module: "FindMyMouse", label: "Localizar Mouse", kind: "event", event: E.FIND_MY_MOUSE, hotkey: ["FindMyMouse", "properties", "activation_shortcut"] },
  mouse_highlighter: { module: "MouseHighlighter", label: "Realçador do Mouse", kind: "event", event: E.MOUSE_HIGHLIGHTER, hotkey: ["MouseHighlighter", "properties", "activation_shortcut"] },
  mouse_crosshairs: { module: "MousePointerCrosshairs", label: "Mira do Ponteiro", kind: "event", event: E.MOUSE_CROSSHAIRS, hotkey: ["MousePointerCrosshairs", "properties", "activation_shortcut"] },
  mouse_jump: { module: "MouseJump", label: "Mouse Jump", kind: "event", event: E.MOUSE_JUMP, hotkey: ["MouseJump", "properties", "activation_shortcut"] },
  crop_and_lock_thumbnail: { module: "CropAndLock", label: "Crop And Lock (miniatura)", kind: "event", event: E.CROP_THUMBNAIL, foreground: true, hotkey: ["CropAndLock", "properties", "thumbnail-hotkey", "value"] },
  crop_and_lock_reparent: { module: "CropAndLock", label: "Crop And Lock (recortar janela)", kind: "event", event: E.CROP_REPARENT, foreground: true, hotkey: ["CropAndLock", "properties", "reparent-hotkey", "value"] },
  command_palette: { module: "CmdPal", label: "Paleta de Comandos", kind: "event", event: E.CMDPAL },
  powertoys_run: { module: "PowerToys Run", label: "PowerToys Run", kind: "event", event: E.POWERTOYS_RUN, hotkey: ["PowerToys Run", "properties", "open_powerlauncher"] },
  advanced_paste: { module: "AdvancedPaste", label: "Colagem Avançada", kind: "event", event: E.ADVANCED_PASTE, foreground: true, hotkey: ["AdvancedPaste", "properties", "advanced-paste-ui-hotkey"] },
  workspaces: { module: "Workspaces", label: "Editor de Workspaces", kind: "event", event: E.WORKSPACES_EDITOR, hotkey: ["Workspaces", "properties", "hotkey", "value"] },
  zoomit: { module: "ZoomIt", label: "ZoomIt (zoom)", kind: "event", event: E.ZOOMIT_ZOOM },
  zoomit_draw: { module: "ZoomIt", label: "ZoomIt (desenhar)", kind: "event", event: E.ZOOMIT_DRAW },
  light_switch: { module: "LightSwitch", label: "Light Switch", kind: "event", event: E.LIGHT_SWITCH, hotkey: ["LightSwitch", "properties", "toggle-theme-hotkey", "value"] },
  settings: { module: null, label: "Configurações", kind: "settings", window: "Dashboard" },
};

const SETTINGS_WINDOWS = new Set(["Dashboard", "Awake"]);

const KNOWN_EVENTS = new Set(Object.values(E));
const EVENT_SHAPE = /^Local\\[A-Za-z0-9_-]{1,120}$/;

function isKnownEvent(name) {
  return typeof name === "string" && KNOWN_EVENTS.has(name) && EVENT_SHAPE.test(name);
}

module.exports = { ACTIONS, EVENTS: E, SETTINGS_WINDOWS, EVENT_SHAPE, isKnownEvent };
