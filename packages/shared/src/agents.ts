/**
 * AI coding agent catalog — detection, metadata, and activity tracking.
 */

export type AgentCategory =
  | "cli"
  | "editor"
  | "desktop"
  | "ide";

export interface AgentDef {
  id: string;
  name: string;
  icon: string;
  category: AgentCategory;
  /** Process names to look for on the system */
  processNames: string[];
  /** Data store paths relative to home dir (use forward slashes, expanded at runtime) */
  storePaths: string[];
  /** Environment variable overrides for store paths */
  envOverrides?: string[];
  /** Whether this agent reports token-level usage */
  reportsTokens: boolean;
}

export type AgentEnvironment = "windows" | "linux" | "wsl";

export interface AgentStatus {
  id: string;
  name: string;
  icon: string;
  category: AgentCategory;
  running: boolean;
  installed: boolean;
  /** Where the agent was detected */
  environments: AgentEnvironment[];
  /** WSL distro name (if found in WSL) */
  wslDistro?: string;
  /** Last detected activity timestamp (ms since epoch) */
  lastActive?: number;
}

/** Full agent catalog */
export const AGENT_CATALOG: AgentDef[] = [
  // ── CLI Agents ──
  {
    id: "claude-code",
    name: "Claude Code",
    icon: "claude",
    category: "cli",
    processNames: ["claude"],
    storePaths: [".claude/projects"],
    reportsTokens: true,
  },
  {
    id: "codex",
    name: "Codex CLI",
    icon: "openai",
    category: "cli",
    processNames: ["codex"],
    storePaths: [".codex/sessions", ".codex/archived_sessions"],
    reportsTokens: true,
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    icon: "gemini",
    category: "cli",
    processNames: ["gemini"],
    storePaths: [".gemini/tmp"],
    envOverrides: ["GEMINI_CLI_HOME"],
    reportsTokens: true,
  },
  {
    id: "grok",
    name: "Grok Build",
    icon: "grok",
    category: "cli",
    processNames: ["grok"],
    storePaths: [".grok/sessions"],
    reportsTokens: true,
  },
  {
    id: "kimi-cli",
    name: "Kimi CLI",
    icon: "kimi",
    category: "cli",
    processNames: ["kimi"],
    storePaths: [".kimi/sessions"],
    reportsTokens: true,
  },
  {
    id: "amp",
    name: "Amp",
    icon: "amp",
    category: "cli",
    processNames: ["amp"],
    storePaths: [".local/share/amp/threads"],
    reportsTokens: true,
  },
  {
    id: "opencode",
    name: "OpenCode",
    icon: "opencode",
    category: "cli",
    processNames: ["opencode"],
    storePaths: [".local/share/opencode/opencode.db"],
    reportsTokens: true,
  },
  {
    id: "kilo-cli",
    name: "Kilo CLI",
    icon: "kilocode",
    category: "cli",
    processNames: ["kilo"],
    storePaths: [".local/share/kilo/kilo.db"],
    reportsTokens: true,
  },
  {
    id: "devin-cli",
    name: "Devin CLI",
    icon: "devin",
    category: "cli",
    processNames: ["devin"],
    storePaths: [".local/share/devin/cli/sessions.db"],
    reportsTokens: true,
  },
  {
    id: "goose",
    name: "Goose",
    icon: "goose",
    category: "cli",
    processNames: ["goose"],
    storePaths: [
      "AppData/Local/goose/sessions/sessions.db",
      ".local/share/goose/sessions/sessions.db",
    ],
    envOverrides: ["GOOSE_PATH_ROOT"],
    reportsTokens: true,
  },
  {
    id: "hermes",
    name: "Hermes",
    icon: "hermes",
    category: "cli",
    processNames: ["hermes"],
    storePaths: [".hermes/state.db", "AppData/Local/hermes/state.db"],
    envOverrides: ["HERMES_HOME"],
    reportsTokens: true,
  },
  {
    id: "qwen",
    name: "Qwen Code",
    icon: "qwen",
    category: "cli",
    processNames: ["qwen"],
    storePaths: [".qwen/projects"],
    reportsTokens: true,
  },
  {
    id: "junie",
    name: "Junie",
    icon: "junie",
    category: "cli",
    processNames: ["junie"],
    storePaths: [".junie/sessions"],
    reportsTokens: true,
  },
  {
    id: "augment",
    name: "Augment",
    icon: "augment",
    category: "cli",
    processNames: ["augment"],
    storePaths: [".augment/sessions"],
    reportsTokens: true,
  },
  {
    id: "dsh",
    name: "DeepSeek Harness",
    icon: "deepseek",
    category: "cli",
    processNames: ["dsh"],
    storePaths: [".dsh/sessions"],
    envOverrides: ["DSH_HOME"],
    reportsTokens: true,
  },
  {
    id: "mux",
    name: "Mux",
    icon: "mux",
    category: "cli",
    processNames: ["mux"],
    storePaths: [".mux/sessions"],
    reportsTokens: true,
  },
  {
    id: "codebuff",
    name: "Codebuff",
    icon: "codebuff",
    category: "cli",
    processNames: ["codebuff"],
    storePaths: [".config/manicode"],
    envOverrides: ["CODEBUFF_DATA_DIR"],
    reportsTokens: true,
  },
  {
    id: "jcode",
    name: "JCode",
    icon: "jcode",
    category: "cli",
    processNames: ["jcode"],
    storePaths: [".jcode/sessions"],
    envOverrides: ["JCODE_HOME"],
    reportsTokens: true,
  },
  {
    id: "fx",
    name: "FX",
    icon: "fx",
    category: "cli",
    processNames: ["fx"],
    storePaths: [".fx/sessions"],
    reportsTokens: true,
  },
  {
    id: "pi",
    name: "Pi",
    icon: "pi",
    category: "cli",
    processNames: ["pi"],
    storePaths: [".pi/agent/sessions"],
    reportsTokens: true,
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    icon: "openclaw",
    category: "cli",
    processNames: ["openclaw"],
    storePaths: [".openclaw/agents"],
    reportsTokens: true,
  },
  {
    id: "unsloth",
    name: "Unsloth",
    icon: "unsloth",
    category: "cli",
    processNames: ["unsloth"],
    storePaths: [".unsloth/studio/studio.db"],
    envOverrides: ["UNSLOTH_STUDIO_HOME"],
    reportsTokens: true,
  },

  // ── Editor Extensions ──
  {
    id: "roo-code",
    name: "Roo Code",
    icon: "roocode",
    category: "editor",
    processNames: [],
    storePaths: [
      "AppData/Roaming/Code/User/globalStorage/rooveterinaryinc.roo-cline/tasks",
      ".config/Code/User/globalStorage/rooveterinaryinc.roo-cline/tasks",
    ],
    reportsTokens: true,
  },
  {
    id: "kilo-code",
    name: "Kilo Code",
    icon: "kilocode",
    category: "editor",
    processNames: [],
    storePaths: [
      "AppData/Roaming/Code/User/globalStorage/kilocode.kilo-code/tasks",
      ".config/Code/User/globalStorage/kilocode.kilo-code/tasks",
    ],
    reportsTokens: true,
  },
  {
    id: "cline",
    name: "Cline",
    icon: "cline",
    category: "editor",
    processNames: [],
    storePaths: [
      "AppData/Roaming/Code/User/globalStorage/saoudrizwan.claude-dev/tasks",
      ".config/Code/User/globalStorage/saoudrizwan.claude-dev/tasks",
      ".cline/data/sessions",
    ],
    envOverrides: ["CLINE_SESSION_DATA_DIR", "CLINE_DATA_DIR", "CLINE_DIR"],
    reportsTokens: true,
  },
  {
    id: "codebuddy",
    name: "CodeBuddy",
    icon: "tencent",
    category: "editor",
    processNames: [],
    storePaths: [".codebuddy"],
    reportsTokens: true,
  },
  {
    id: "cherry-studio",
    name: "Cherry Studio",
    icon: "cherrystudio",
    category: "editor",
    processNames: ["CherryStudio"],
    storePaths: [
      "AppData/Roaming/CherryStudio/.claude/projects",
      ".config/CherryStudio/.claude/projects",
    ],
    reportsTokens: true,
  },
  {
    id: "command-code",
    name: "Command Code",
    icon: "commandcode",
    category: "editor",
    processNames: ["commandcode"],
    storePaths: [".commandcode/projects"],
    reportsTokens: true,
  },
  {
    id: "zcode",
    name: "ZCode",
    icon: "zcode",
    category: "editor",
    processNames: ["zcode"],
    storePaths: [".zcode/projects", ".zcode/cli/db/db.sqlite"],
    reportsTokens: true,
  },

  // ── IDE / Desktop Apps ──
  {
    id: "cursor",
    name: "Cursor",
    icon: "cursor",
    category: "ide",
    processNames: ["Cursor", "Cursor.exe"],
    storePaths: [
      "AppData/Roaming/Cursor/User",
      ".config/Cursor/User",
    ],
    reportsTokens: false,
  },
  {
    id: "kiro",
    name: "Kiro",
    icon: "kiro",
    category: "ide",
    processNames: ["kiro", "Kiro.exe"],
    storePaths: [".kiro/sessions/cli"],
    reportsTokens: true,
  },
  {
    id: "zed",
    name: "Zed",
    icon: "zed",
    category: "ide",
    processNames: ["zed", "Zed.exe"],
    storePaths: [
      "AppData/Local/Zed/threads/threads.db",
      ".local/share/zed/threads/threads.db",
    ],
    reportsTokens: true,
  },
  {
    id: "trae",
    name: "Trae",
    icon: "trae",
    category: "ide",
    processNames: ["Trae", "Trae.exe"],
    storePaths: [],
    reportsTokens: false,
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    icon: "github",
    category: "ide",
    processNames: [],
    storePaths: [
      "AppData/Roaming/Code/User/workspaceStorage",
      ".config/Code/User/workspaceStorage",
      ".copilot/data.db",
    ],
    reportsTokens: true,
  },
  {
    id: "lm-studio",
    name: "LM Studio",
    icon: "lmstudio",
    category: "desktop",
    processNames: ["LM Studio", "LM Studio.exe"],
    storePaths: [".lmstudio/server-logs"],
    envOverrides: ["LM_STUDIO_HOME"],
    reportsTokens: true,
  },
  {
    id: "devin-desktop",
    name: "Devin Desktop",
    icon: "devin",
    category: "desktop",
    processNames: ["Devin", "Devin.exe"],
    storePaths: [
      "AppData/Roaming/Devin/User/acp-events",
      ".config/devin/User/acp-events",
    ],
    reportsTokens: true,
  },
  {
    id: "antigravity",
    name: "Antigravity",
    icon: "antigravity",
    category: "ide",
    processNames: ["antigravity"],
    storePaths: [".gemini/antigravity-cli/conversations", ".gemini/antigravity-ide/conversations"],
    envOverrides: ["GEMINI_CLI_HOME"],
    reportsTokens: true,
  },
  {
    id: "warp",
    name: "Warp",
    icon: "warp",
    category: "desktop",
    processNames: ["Warp", "Warp.exe"],
    storePaths: [],
    reportsTokens: false,
  },
  {
    id: "micode",
    name: "MiMo Code",
    icon: "xiaomimimo",
    category: "ide",
    processNames: ["micode"],
    storePaths: ["AppData/Local/mimocode", ".local/share/mimocode"],
    reportsTokens: true,
  },
  {
    id: "minimax-code",
    name: "MiniMax Code",
    icon: "minimax",
    category: "cli",
    processNames: ["mcode"],
    storePaths: [],
    reportsTokens: false,
  },
];

/**
 * Activity detection patterns for JSONL transcript files.
 * Used to determine if an agent is currently working.
 */
export interface ActivityPattern {
  agentId: string;
  /** File extension to scan (e.g. ".jsonl") */
  fileExt: string;
  /** How many bytes from file tail to read */
  tailBytes: number;
  /** JSON field that indicates the record type */
  typeField: string;
  /** Values that mean "agent is working" */
  workingValues: string[];
  /** Values that mean "agent finished" */
  finishedValues: string[];
  /** Grace period in seconds before declaring idle */
  gracePeriod: number;
}

export const ACTIVITY_PATTERNS: ActivityPattern[] = [
  {
    agentId: "claude-code",
    fileExt: ".jsonl",
    tailBytes: 131072, // 128KB
    typeField: "type",
    workingValues: ["user", "tool_use"],
    finishedValues: ["end_turn"],
    gracePeriod: 90,
  },
  {
    agentId: "codex",
    fileExt: ".jsonl",
    tailBytes: 131072,
    typeField: "payload.type",
    workingValues: ["task_started", "function_call", "custom_tool_call", "local_shell_call"],
    finishedValues: ["task_complete", "turn_aborted"],
    gracePeriod: 90,
  },
  {
    agentId: "kiro",
    fileExt: ".jsonl",
    tailBytes: 131072,
    typeField: "payload.type",
    workingValues: ["turn_start", "tool_result", "assistant", "tool_call", "sub_agent_start"],
    finishedValues: ["turn_end", "pending_interaction"],
    gracePeriod: 90,
  },
  {
    agentId: "zcode",
    fileExt: ".jsonl",
    tailBytes: 2097152, // 2MB
    typeField: "type",
    workingValues: ["turn.started", "tool.call.started", "model.request"],
    finishedValues: ["turn.completed", "turn.failed", "turn.cancelled"],
    gracePeriod: 90,
  },
];
