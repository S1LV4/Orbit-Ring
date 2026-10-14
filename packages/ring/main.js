"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/main.ts
var import_electron = require("electron");

// ../shared/locales/pt-BR/app.json
var app_default = {
  nav: {
    ring: "Ring",
    bindings: "Bot\xF5es",
    devices: "Dispositivos",
    profiles: "Perfis",
    plugins: "Plugins",
    settings: "Configura\xE7\xF5es"
  },
  status: {
    connected: "conectado",
    connecting: "conectando...",
    offline: "offline"
  },
  deviceCount: {
    one: "{count} dispositivo",
    other: "{count} dispositivos"
  },
  credit: {
    developedBy: "desenvolvido por",
    openSource: "c\xF3digo aberto \xB7 github"
  },
  settings: {
    title: "Configura\xE7\xF5es",
    autostart: "Iniciar com o sistema",
    tray: "Minimizar para a bandeja",
    notify: "Notifica\xE7\xF5es",
    language: "Idioma",
    languageSystem: "Sistema"
  },
  splash: {
    loading: "carregando...",
    ready: "pronto"
  },
  languageName: "Portugu\xEAs (Brasil)"
};

// ../shared/locales/pt-BR/bindings.json
var bindings_default = {
  title: "Atribui\xE7\xE3o de bot\xF5es",
  identify: "Identificar",
  identifying: "pressione um bot\xE3o...",
  noAction: "Nenhuma a\xE7\xE3o",
  actionFor: "A\xE7\xE3o para: {button}",
  customShortcut: "Atalho personalizado",
  customPlaceholder: "ex.: ctrl+shift+p",
  customHint: "pressione a combina\xE7\xE3o de teclas desejada",
  removeAction: "remover a\xE7\xE3o",
  selectButton: "Selecione um bot\xE3o para configurar",
  selectHint: 'ou clique em "Identificar" e pressione um bot\xE3o do mouse',
  buttons: {
    side1: { label: "Bot\xE3o lateral 1", description: "Polegar / Voltar" },
    side2: { label: "Bot\xE3o lateral 2", description: "Avan\xE7ar" },
    side3: { label: "Bot\xE3o lateral 3", description: "Extra" },
    side4: { label: "Bot\xE3o lateral 4", description: "Extra" },
    dpi: { label: "Bot\xE3o de DPI", description: "Geralmente em cima" },
    scroll_left: { label: "Rolagem \xE0 esquerda", description: "Inclina\xE7\xE3o da roda" },
    scroll_right: { label: "Rolagem \xE0 direita", description: "Inclina\xE7\xE3o da roda" }
  },
  categories: {
    navigate: "Navega\xE7\xE3o",
    system: "Sistema",
    window: "Janela",
    media: "M\xEDdia",
    shortcuts: "Atalhos"
  },
  presets: {
    back: "Voltar",
    forward: "Avan\xE7ar",
    newTab: "Nova aba",
    closeTab: "Fechar aba",
    reopenTab: "Reabrir aba",
    showDesktop: "Mostrar \xE1rea de trabalho",
    taskView: "Vis\xE3o de tarefas",
    screenshot: "Captura de tela",
    lockScreen: "Bloquear tela",
    openTerminal: "Abrir terminal",
    minimize: "Minimizar",
    maximize: "Maximizar",
    close: "Fechar",
    desktopLeft: "\xC1rea de trabalho \xE0 esquerda",
    desktopRight: "\xC1rea de trabalho \xE0 direita",
    playPause: "Reproduzir / Pausar",
    next: "Pr\xF3xima",
    previous: "Anterior",
    volumeUp: "Volume +",
    volumeDown: "Volume -",
    mute: "Mudo",
    copy: "Copiar",
    paste: "Colar",
    undo: "Desfazer",
    redo: "Refazer",
    save: "Salvar",
    find: "Pesquisar"
  }
};

// ../shared/locales/pt-BR/catalog.json
var catalog_default = {
  actions: {
    copy: "Copiar",
    paste: "Colar",
    undo: "Desfazer",
    redo: "Refazer",
    cut: "Recortar",
    save: "Salvar",
    find: "Pesquisar",
    saveas: "Salvar como",
    print: "Imprimir",
    screenshot: "Screenshot",
    terminal: "Terminal",
    playpause: "Play/Pause",
    desktop: "Desktop",
    back: "Voltar",
    forward: "Avan\xE7ar",
    refresh: "Atualizar",
    lock: "Bloquear",
    explorer: "Explorador",
    next: "Pr\xF3xima",
    prev: "Anterior",
    volup: "Volume +",
    volmute: "Mudo",
    maximize: "Maximizar",
    minimize: "Minimizar",
    close: "Fechar",
    agent_claude: "Claude Code",
    agent_codex: "Codex CLI",
    agent_cursor: "Cursor",
    agent_gemini: "Gemini CLI",
    agent_copilot: "GitHub Copilot",
    agent_approve: "Aprovar",
    agent_decline: "Recusar",
    agent_status: "Status"
  },
  categories: {
    edit: "Edi\xE7\xE3o",
    nav: "Navega\xE7\xE3o",
    windows: "Janelas",
    media: "M\xEDdia",
    system: "Sistema",
    agents: "Agentes IA",
    plugins: "Plugins",
    misc: "Outros"
  },
  groupIcons: {
    edit: "Edi\xE7\xE3o",
    compass: "Navega\xE7\xE3o",
    layers: "Janelas",
    music: "M\xEDdia",
    aperture: "Captura",
    settings: "Sistema",
    discord: "Discord",
    brain: "IA"
  },
  defaultGroups: {
    edit: "Edi\xE7\xE3o",
    nav: "Navega\xE7\xE3o",
    win: "Janelas",
    media: "M\xEDdia",
    cap: "Captura",
    sys: "Sistema"
  },
  pluginCategory: "Plugin \xB7 {name}",
  unavailable: "Indispon\xEDvel"
};

// ../shared/locales/pt-BR/devices.json
var devices_default = {
  title: "Dispositivos detectados",
  empty: "Nenhum mouse detectado",
  emptyHint: "conecte um mouse (USB, Bluetooth ou wireless) \u2014 o servi\xE7o ir\xE1 detect\xE1-lo automaticamente",
  generic: "Gen\xE9rico",
  connected: "conectado",
  lastEvent: "\xDAltimo evento"
};

// ../shared/locales/pt-BR/editor.json
var editor_default = {
  themes: {
    green: "Verde",
    orange: "Laranja",
    blue: "Azul",
    negative: "Negativo",
    white: "Branco"
  },
  toolbar: {
    label: "Apar\xEAncia e hist\xF3rico do ring",
    theme: "Tema",
    liquidTip: "Faz os bot\xF5es do ring se fundirem como gotas ao abrir e fechar",
    liquid: "Efeito l\xEDquido",
    asciiTip: "Mostra a cena de caracteres (buraco negro e estrelas) atr\xE1s do ring",
    ascii: "Efeito ASCII",
    undo: "Desfazer",
    undoTip: "Desfazer (Ctrl+Z)",
    redo: "Refazer",
    redoTip: "Refazer (Ctrl+Shift+Z)",
    newGroup: "Novo grupo",
    newGroupTip: "Criar um novo grupo",
    newGroupHiddenTip: "O ring mostra at\xE9 {max} grupos: um novo grupo fica salvo, mas oculto.",
    themeOption: "Tema {name}"
  },
  toast: {
    close: "Fechar aviso"
  },
  preview: {
    title: "Preview do ring"
  },
  menu: {
    icons: "\xCDcones"
  },
  copySuffix: "{name} (c\xF3pia)",
  library: {
    search: "Buscar a\xE7\xE3o\u2026",
    searchLabel: "Buscar a\xE7\xE3o na biblioteca",
    clear: "Limpar busca",
    noResults: "Nenhum resultado",
    noResultsFor: "Nada encontrado para \u201C{query}\u201D.",
    selectGroup: "Selecione um grupo para adicionar a\xE7\xF5es",
    removeFrom: "Remover de \u201C{group}\u201D",
    full: "\u201C{group}\u201D est\xE1 cheio ({max}/{max}). Remova uma a\xE7\xE3o para adicionar outra.",
    addTo: "Adicionar a \u201C{group}\u201D",
    alsoIn: "Tamb\xE9m em ",
    in: "Em ",
    inCategory: {
      one: "{count} a\xE7\xE3o desta categoria no grupo selecionado",
      other: "{count} a\xE7\xF5es desta categoria no grupo selecionado"
    }
  },
  picker: {
    search: "Buscar a\xE7\xE3o",
    placeholder: "Buscar a\xE7\xE3o\u2026",
    list: "A\xE7\xF5es",
    noResults: "Nenhum resultado para \u201C{query}\u201D.",
    current: "atual",
    inGroup: "j\xE1 no grupo",
    navigate: "navegar",
    choose: "escolher",
    close: "fechar",
    replaceTitle: "Trocar \u201C{action}\u201D por\u2026",
    addTitle: "Adicionar a \u201C{group}\u201D"
  },
  inspector: {
    selectGroup: "Selecione um grupo na lista acima ou clique nele no preview para editar.",
    createFirst: "Crie um grupo para come\xE7ar a montar o ring.",
    name: "Nome",
    namePlaceholder: "Nome do grupo",
    deleteGroup: "Excluir grupo",
    deleteGroupNamed: "Excluir grupo {name}",
    icon: "\xCDcone",
    actions: "A\xE7\xF5es do grupo",
    limitReached: "Limite atingido: remova uma a\xE7\xE3o para adicionar outra.",
    limit: "At\xE9 {max} a\xE7\xF5es por grupo",
    emptyStart: "Nenhuma a\xE7\xE3o ainda. Escolha na",
    library: "Biblioteca de a\xE7\xF5es",
    emptyMiddle: "ou clique no",
    emptyEnd: "do preview.",
    emptyHint: "Um grupo vazio n\xE3o aparece no ring real.",
    actionsOf: "A\xE7\xF5es de {name}",
    actionPosition: "{label}, posi\xE7\xE3o {position} de {total}",
    actionPositionUnavailable: "{label} (indispon\xEDvel), posi\xE7\xE3o {position} de {total}",
    unavailableTip: "Esta a\xE7\xE3o n\xE3o existe mais no cat\xE1logo (plugin removido ou desativado). Ela n\xE3o funciona no ring; voc\xEA pode remov\xEA-la.",
    unavailable: "indispon\xEDvel",
    remove: "Remover {label}",
    removeTip: "Remover do grupo"
  },
  groups: {
    nameLabel: "Nome do grupo",
    none: "Nenhum grupo ainda.",
    createFirst: "Criar o primeiro grupo",
    list: "Grupos do ring",
    row: "{name}, {count} de {max} a\xE7\xF5es",
    rowHidden: "{name}, {count} de {max} a\xE7\xF5es, oculto",
    unnamed: "Sem nome",
    hiddenTip: "O ring mostra no m\xE1ximo {max} grupos. Este fica salvo, mas s\xF3 aparece se voc\xEA mov\xEA-lo para as {max} primeiras posi\xE7\xF5es.",
    hidden: "oculto",
    emptyTip: "Grupo vazio: n\xE3o aparece no ring real at\xE9 receber uma a\xE7\xE3o.",
    empty: "vazio",
    countTip: "{count} de {max} a\xE7\xF5es",
    options: "Op\xE7\xF5es do grupo {name}",
    moreOptions: "Mais op\xE7\xF5es"
  },
  main: {
    unnamed: "Sem nome",
    quoted: "\u201C{name}\u201D",
    undo: "Desfazer",
    newGroupName: "Novo grupo",
    fallbackGroupName: "Grupo",
    newGroupHidden: "O ring mostra at\xE9 {max} grupos \u2014 {name} fica salvo, mas oculto.",
    groupDeleted: "Grupo {name} exclu\xEDdo",
    duplicateHidden: "O ring mostra at\xE9 {max} grupos \u2014 os que passam disso ficam ocultos.",
    groupFull: "{name} j\xE1 tem {max} a\xE7\xF5es \u2014 remova uma para adicionar outra.",
    alreadyIn: "{action} j\xE1 est\xE1 em {group}.",
    selectFirst: "Selecione um grupo primeiro.",
    actionRemoved: "{action} removida de {group}",
    rename: "Renomear",
    changeIcon: "Trocar \xEDcone",
    duplicate: "Duplicar",
    moveUp: "Mover para cima",
    moveLeft: "Mover para a esquerda",
    moveDown: "Mover para baixo",
    moveRight: "Mover para a direita",
    delete: "Excluir",
    replace: "Trocar por\u2026",
    moveTo: "Mover para",
    noteFull: "cheio",
    noteDuplicate: "j\xE1 cont\xE9m",
    remove: "Remover",
    actionMenuTitle: "{action} \xB7 {group}",
    hint: "Clique num grupo para editar \xB7 arraste para reordenar \xB7 solte no centro para remover \xB7 bot\xE3o direito para mais op\xE7\xF5es",
    panel: "Grupos e a\xE7\xF5es",
    groups: "Grupos",
    overLimit: "O ring mostra s\xF3 os {max} primeiros grupos; os demais ficam ocultos.",
    limit: "O ring mostra at\xE9 {max} grupos",
    newGroup: "Novo grupo",
    selectedGroup: "Grupo selecionado",
    noneSelected: "nenhum",
    library: "Biblioteca de a\xE7\xF5es",
    available: "A\xE7\xF5es dispon\xEDveis",
    clickToAdd: "Clique para adicionar a",
    groupFullBadge: " \xB7 grupo cheio",
    selectToAdd: "Selecione um grupo para adicionar a\xE7\xF5es."
  }
};

// ../shared/locales/pt-BR/plugins.json
var plugins_default = {
  title: "Plugins",
  tabs: {
    catalog: "Cat\xE1logo",
    installed: "Instalados"
  },
  by: "por",
  installedBadge: "instalado",
  installedVersion: "Instalada: v{version}",
  working: "Aguarde\u2026",
  update: "Atualizar",
  install: "Instalar",
  loaded: "carregado",
  error: "erro",
  actionCount: {
    one: "{count} a\xE7\xE3o",
    other: "{count} a\xE7\xF5es"
  },
  enabled: "Ativado",
  disabled: "Desativado",
  confirmDelete: "Apagar a pasta deste plugin?",
  uninstall: "Desinstalar",
  cancel: "Cancelar",
  closeDetails: "Fechar detalhes",
  folderTip: "~/.orbit/plugins/ \u2014 copie a pasta de um plugin para c\xE1 para instal\xE1-lo manualmente",
  folder: "Pasta de plugins",
  emptyCatalog: "O cat\xE1logo est\xE1 vazio",
  emptyCatalogHint: "copie a pasta de um plugin para ~/.orbit/plugins/ para instal\xE1-lo manualmente",
  emptyInstalled: "Nenhum plugin instalado",
  emptyInstalledHint: "escolha um no cat\xE1logo ou copie a pasta de um plugin para ~/.orbit/plugins/",
  authorHintStart: "criando um plugin? uma pasta com um",
  authorHintFields: "(id, name, version, author, actions) \xB7",
  authorHintEnd: "mostra o link e a foto do seu perfil",
  updateTo: "Atualizar para v{version}"
};

// ../shared/locales/pt-BR/profiles.json
var profiles_default = {
  title: "Perfis por aplicativo",
  new: "Novo perfil",
  create: "Criar perfil",
  namePlaceholder: "Nome (ex.: VS Code)",
  processPlaceholder: "Processo (ex.: code.exe)",
  createButton: "Criar",
  cancel: "Cancelar",
  default: "Perfil padr\xE3o",
  defaultHint: "usado quando nenhum perfil de aplicativo corresponde",
  actionCount: {
    one: "{count} a\xE7\xE3o",
    other: "{count} a\xE7\xF5es"
  },
  empty: "Nenhum perfil de aplicativo criado",
  emptyHint: "crie perfis para ter a\xE7\xF5es diferentes em cada aplicativo"
};

// ../shared/locales/pt-BR/ring.json
var ring_default = {
  addAction: "Adicionar a\xE7\xE3o",
  attentionGroup: "Claude \xB7 confirma\xE7\xE3o",
  attention: "Aten\xE7\xE3o"
};

// ../shared/locales/pt-BR/tray.json
var tray_default = {
  openConfig: "Abrir configura\xE7\xF5es",
  quit: "Sair",
  checkUpdates: "Procurar atualiza\xE7\xF5es",
  checkingUpdates: "Procurando atualiza\xE7\xF5es\u2026",
  downloadingUpdate: "Baixando a vers\xE3o {version}\u2026 {percent}%",
  restartToUpdate: "Reiniciar para atualizar para {version}"
};

// ../shared/locales/en-US/app.json
var app_default2 = {
  nav: {
    ring: "Ring",
    bindings: "Buttons",
    devices: "Devices",
    profiles: "Profiles",
    plugins: "Plugins",
    settings: "Settings"
  },
  status: {
    connected: "connected",
    connecting: "connecting...",
    offline: "offline"
  },
  deviceCount: {
    one: "{count} device",
    other: "{count} devices"
  },
  credit: {
    developedBy: "developed by",
    openSource: "open source \xB7 github"
  },
  settings: {
    title: "Settings",
    autostart: "Start with system",
    tray: "Minimize to tray",
    notify: "Notifications",
    language: "Language",
    languageSystem: "System"
  },
  splash: {
    loading: "loading...",
    ready: "ready"
  },
  languageName: "English"
};

// ../shared/locales/en-US/bindings.json
var bindings_default2 = {
  title: "Button bindings",
  identify: "Identify",
  identifying: "press a button...",
  noAction: "No action",
  actionFor: "Action for: {button}",
  customShortcut: "Custom shortcut",
  customPlaceholder: "e.g. ctrl+shift+p",
  customHint: "press the key combination you want",
  removeAction: "remove action",
  selectButton: "Select a button to configure",
  selectHint: 'or click "Identify" and press a button on your mouse',
  buttons: {
    side1: {
      label: "Side button 1",
      description: "Thumb / Back"
    },
    side2: {
      label: "Side button 2",
      description: "Forward"
    },
    side3: {
      label: "Side button 3",
      description: "Extra"
    },
    side4: {
      label: "Side button 4",
      description: "Extra"
    },
    dpi: {
      label: "DPI button",
      description: "Usually on top"
    },
    scroll_left: {
      label: "Scroll left",
      description: "Scroll tilt"
    },
    scroll_right: {
      label: "Scroll right",
      description: "Scroll tilt"
    }
  },
  categories: {
    navigate: "Navigate",
    system: "System",
    window: "Window",
    media: "Media",
    shortcuts: "Shortcuts"
  },
  presets: {
    back: "Back",
    forward: "Forward",
    newTab: "New tab",
    closeTab: "Close tab",
    reopenTab: "Reopen tab",
    showDesktop: "Show desktop",
    taskView: "Task view",
    screenshot: "Screenshot",
    lockScreen: "Lock screen",
    openTerminal: "Open terminal",
    minimize: "Minimize",
    maximize: "Maximize",
    close: "Close",
    desktopLeft: "Desktop left",
    desktopRight: "Desktop right",
    playPause: "Play / Pause",
    next: "Next",
    previous: "Previous",
    volumeUp: "Volume +",
    volumeDown: "Volume -",
    mute: "Mute",
    copy: "Copy",
    paste: "Paste",
    undo: "Undo",
    redo: "Redo",
    save: "Save",
    find: "Find"
  }
};

// ../shared/locales/en-US/catalog.json
var catalog_default2 = {
  actions: {
    copy: "Copy",
    paste: "Paste",
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    save: "Save",
    find: "Find",
    saveas: "Save as",
    print: "Print",
    screenshot: "Screenshot",
    terminal: "Terminal",
    playpause: "Play/Pause",
    desktop: "Desktop",
    back: "Back",
    forward: "Forward",
    refresh: "Refresh",
    lock: "Lock",
    explorer: "Explorer",
    next: "Next",
    prev: "Previous",
    volup: "Volume +",
    volmute: "Mute",
    maximize: "Maximize",
    minimize: "Minimize",
    close: "Close",
    agent_claude: "Claude Code",
    agent_codex: "Codex CLI",
    agent_cursor: "Cursor",
    agent_gemini: "Gemini CLI",
    agent_copilot: "GitHub Copilot",
    agent_approve: "Approve",
    agent_decline: "Decline",
    agent_status: "Status"
  },
  categories: {
    edit: "Editing",
    nav: "Navigation",
    windows: "Windows",
    media: "Media",
    system: "System",
    agents: "AI agents",
    plugins: "Plugins",
    misc: "Other"
  },
  groupIcons: {
    edit: "Editing",
    compass: "Navigation",
    layers: "Windows",
    music: "Media",
    aperture: "Capture",
    settings: "System",
    discord: "Discord",
    brain: "AI"
  },
  defaultGroups: {
    edit: "Editing",
    nav: "Navigation",
    win: "Windows",
    media: "Media",
    cap: "Capture",
    sys: "System"
  },
  pluginCategory: "Plugin \xB7 {name}",
  unavailable: "Unavailable"
};

// ../shared/locales/en-US/devices.json
var devices_default2 = {
  title: "Detected devices",
  empty: "No mouse detected",
  emptyHint: "connect a mouse (USB, Bluetooth or wireless) \u2014 the service will detect it automatically",
  generic: "Generic",
  connected: "connected",
  lastEvent: "Last event"
};

// ../shared/locales/en-US/editor.json
var editor_default2 = {
  themes: {
    green: "Green",
    orange: "Orange",
    blue: "Blue",
    negative: "Negative",
    white: "White"
  },
  toolbar: {
    label: "Ring appearance and history",
    theme: "Theme",
    liquidTip: "Makes the ring buttons merge like droplets when opening and closing",
    liquid: "Liquid effect",
    asciiTip: "Shows the character scene (black hole and stars) behind the ring",
    ascii: "ASCII effect",
    undo: "Undo",
    undoTip: "Undo (Ctrl+Z)",
    redo: "Redo",
    redoTip: "Redo (Ctrl+Shift+Z)",
    newGroup: "New group",
    newGroupTip: "Create a new group",
    newGroupHiddenTip: "The ring shows up to {max} groups: a new group is saved, but hidden.",
    themeOption: "Theme {name}"
  },
  toast: {
    close: "Close notice"
  },
  preview: {
    title: "Ring preview"
  },
  menu: {
    icons: "Icons"
  },
  copySuffix: "{name} (copy)",
  library: {
    search: "Search actions\u2026",
    searchLabel: "Search the action library",
    clear: "Clear search",
    noResults: "No results",
    noResultsFor: "Nothing found for \u201C{query}\u201D.",
    selectGroup: "Select a group to add actions",
    removeFrom: "Remove from \u201C{group}\u201D",
    full: "\u201C{group}\u201D is full ({max}/{max}). Remove an action to add another.",
    addTo: "Add to \u201C{group}\u201D",
    alsoIn: "Also in ",
    in: "In ",
    inCategory: {
      one: "{count} action from this category in the selected group",
      other: "{count} actions from this category in the selected group"
    }
  },
  picker: {
    search: "Search actions",
    placeholder: "Search actions\u2026",
    list: "Actions",
    noResults: "No results for \u201C{query}\u201D.",
    current: "current",
    inGroup: "already in group",
    navigate: "navigate",
    choose: "choose",
    close: "close",
    replaceTitle: "Replace \u201C{action}\u201D with\u2026",
    addTitle: "Add to \u201C{group}\u201D"
  },
  inspector: {
    selectGroup: "Select a group in the list above, or click it in the preview, to edit it.",
    createFirst: "Create a group to start building the ring.",
    name: "Name",
    namePlaceholder: "Group name",
    deleteGroup: "Delete group",
    deleteGroupNamed: "Delete group {name}",
    icon: "Icon",
    actions: "Group actions",
    limitReached: "Limit reached: remove an action to add another.",
    limit: "Up to {max} actions per group",
    emptyStart: "No actions yet. Pick one from the",
    library: "Action library",
    emptyMiddle: "or click the",
    emptyEnd: "in the preview.",
    emptyHint: "An empty group does not appear in the real ring.",
    actionsOf: "Actions of {name}",
    actionPosition: "{label}, position {position} of {total}",
    actionPositionUnavailable: "{label} (unavailable), position {position} of {total}",
    unavailableTip: "This action is no longer in the catalog (plugin removed or disabled). It does not work in the ring; you can remove it.",
    unavailable: "unavailable",
    remove: "Remove {label}",
    removeTip: "Remove from group"
  },
  groups: {
    nameLabel: "Group name",
    none: "No groups yet.",
    createFirst: "Create the first group",
    list: "Ring groups",
    row: "{name}, {count} of {max} actions",
    rowHidden: "{name}, {count} of {max} actions, hidden",
    unnamed: "Untitled",
    hiddenTip: "The ring shows at most {max} groups. This one is saved, but only appears if you move it into the first {max} positions.",
    hidden: "hidden",
    emptyTip: "Empty group: it does not appear in the real ring until it gets an action.",
    empty: "empty",
    countTip: "{count} of {max} actions",
    options: "Options for group {name}",
    moreOptions: "More options"
  },
  main: {
    unnamed: "Untitled",
    quoted: "\u201C{name}\u201D",
    undo: "Undo",
    newGroupName: "New group",
    fallbackGroupName: "Group",
    newGroupHidden: "The ring shows up to {max} groups \u2014 {name} is saved, but hidden.",
    groupDeleted: "Group {name} deleted",
    duplicateHidden: "The ring shows up to {max} groups \u2014 the extra ones are hidden.",
    groupFull: "{name} already has {max} actions \u2014 remove one to add another.",
    alreadyIn: "{action} is already in {group}.",
    selectFirst: "Select a group first.",
    actionRemoved: "{action} removed from {group}",
    rename: "Rename",
    changeIcon: "Change icon",
    duplicate: "Duplicate",
    moveUp: "Move up",
    moveLeft: "Move left",
    moveDown: "Move down",
    moveRight: "Move right",
    delete: "Delete",
    replace: "Replace with\u2026",
    moveTo: "Move to",
    noteFull: "full",
    noteDuplicate: "already has it",
    remove: "Remove",
    actionMenuTitle: "{action} \xB7 {group}",
    hint: "Click a group to edit \xB7 drag to reorder \xB7 drop on the center to remove \xB7 right-click for more options",
    panel: "Groups and actions",
    groups: "Groups",
    overLimit: "The ring only shows the first {max} groups; the rest are hidden.",
    limit: "The ring shows up to {max} groups",
    newGroup: "New group",
    selectedGroup: "Selected group",
    noneSelected: "none",
    library: "Action library",
    available: "Available actions",
    clickToAdd: "Click to add to",
    groupFullBadge: " \xB7 group full",
    selectToAdd: "Select a group to add actions."
  }
};

// ../shared/locales/en-US/plugins.json
var plugins_default2 = {
  title: "Plugins",
  tabs: {
    catalog: "Catalog",
    installed: "Installed"
  },
  by: "by",
  installedBadge: "installed",
  installedVersion: "Installed: v{version}",
  working: "Working\u2026",
  update: "Update",
  install: "Install",
  loaded: "loaded",
  error: "error",
  actionCount: {
    one: "{count} action",
    other: "{count} actions"
  },
  enabled: "Enabled",
  disabled: "Disabled",
  confirmDelete: "Delete this plugin's folder?",
  uninstall: "Uninstall",
  cancel: "Cancel",
  closeDetails: "Close details",
  folderTip: "~/.orbit/plugins/ \u2014 copy a plugin folder here to install it by hand",
  folder: "Plugins folder",
  emptyCatalog: "The catalog is empty",
  emptyCatalogHint: "copy a plugin folder to ~/.orbit/plugins/ to install it by hand",
  emptyInstalled: "No plugins installed",
  emptyInstalledHint: "pick one from the catalog, or copy a plugin folder to ~/.orbit/plugins/",
  authorHintStart: "writing a plugin? a folder with a",
  authorHintFields: "(id, name, version, author, actions) \xB7",
  authorHintEnd: "shows your profile link and picture",
  updateTo: "Update to v{version}"
};

// ../shared/locales/en-US/profiles.json
var profiles_default2 = {
  title: "App profiles",
  new: "New profile",
  create: "Create profile",
  namePlaceholder: "Name (e.g. VS Code)",
  processPlaceholder: "Process (e.g. code.exe)",
  createButton: "Create",
  cancel: "Cancel",
  default: "Default profile",
  defaultHint: "used when no app profile matches",
  actionCount: {
    one: "{count} action",
    other: "{count} actions"
  },
  empty: "No app profiles yet",
  emptyHint: "create profiles to have different actions per app"
};

// ../shared/locales/en-US/ring.json
var ring_default2 = {
  addAction: "Add action",
  attentionGroup: "Claude \xB7 approval",
  attention: "Attention"
};

// ../shared/locales/en-US/tray.json
var tray_default2 = {
  openConfig: "Open settings",
  quit: "Quit",
  checkUpdates: "Check for updates",
  checkingUpdates: "Checking for updates\u2026",
  downloadingUpdate: "Downloading version {version}\u2026 {percent}%",
  restartToUpdate: "Restart to update to {version}"
};

// ../shared/locales/es-ES/app.json
var app_default3 = {
  nav: {
    ring: "Ring",
    bindings: "Botones",
    devices: "Dispositivos",
    profiles: "Perfiles",
    plugins: "Plugins",
    settings: "Ajustes"
  },
  status: {
    connected: "conectado",
    connecting: "conectando...",
    offline: "sin conexi\xF3n"
  },
  deviceCount: {
    one: "{count} dispositivo",
    other: "{count} dispositivos"
  },
  credit: {
    developedBy: "desarrollado por",
    openSource: "c\xF3digo abierto \xB7 github"
  },
  settings: {
    title: "Ajustes",
    autostart: "Iniciar con el sistema",
    tray: "Minimizar a la bandeja",
    notify: "Notificaciones",
    language: "Idioma",
    languageSystem: "Sistema"
  },
  splash: {
    loading: "cargando...",
    ready: "listo"
  },
  languageName: "Espa\xF1ol"
};

// ../shared/locales/es-ES/bindings.json
var bindings_default3 = {
  title: "Asignaci\xF3n de botones",
  identify: "Identificar",
  identifying: "pulsa un bot\xF3n...",
  noAction: "Sin acci\xF3n",
  actionFor: "Acci\xF3n para: {button}",
  customShortcut: "Atajo personalizado",
  customPlaceholder: "p. ej. ctrl+shift+p",
  customHint: "pulsa la combinaci\xF3n de teclas que quieras",
  removeAction: "quitar acci\xF3n",
  selectButton: "Selecciona un bot\xF3n para configurarlo",
  selectHint: 'o haz clic en "Identificar" y pulsa un bot\xF3n del rat\xF3n',
  buttons: {
    side1: {
      label: "Bot\xF3n lateral 1",
      description: "Pulgar / Atr\xE1s"
    },
    side2: {
      label: "Bot\xF3n lateral 2",
      description: "Adelante"
    },
    side3: {
      label: "Bot\xF3n lateral 3",
      description: "Extra"
    },
    side4: {
      label: "Bot\xF3n lateral 4",
      description: "Extra"
    },
    dpi: {
      label: "Bot\xF3n de DPI",
      description: "Normalmente arriba"
    },
    scroll_left: {
      label: "Desplazar a la izquierda",
      description: "Inclinaci\xF3n de la rueda"
    },
    scroll_right: {
      label: "Desplazar a la derecha",
      description: "Inclinaci\xF3n de la rueda"
    }
  },
  categories: {
    navigate: "Navegaci\xF3n",
    system: "Sistema",
    window: "Ventana",
    media: "Multimedia",
    shortcuts: "Atajos"
  },
  presets: {
    back: "Atr\xE1s",
    forward: "Adelante",
    newTab: "Nueva pesta\xF1a",
    closeTab: "Cerrar pesta\xF1a",
    reopenTab: "Reabrir pesta\xF1a",
    showDesktop: "Mostrar escritorio",
    taskView: "Vista de tareas",
    screenshot: "Captura de pantalla",
    lockScreen: "Bloquear pantalla",
    openTerminal: "Abrir terminal",
    minimize: "Minimizar",
    maximize: "Maximizar",
    close: "Cerrar",
    desktopLeft: "Escritorio a la izquierda",
    desktopRight: "Escritorio a la derecha",
    playPause: "Reproducir / Pausar",
    next: "Siguiente",
    previous: "Anterior",
    volumeUp: "Volumen +",
    volumeDown: "Volumen -",
    mute: "Silencio",
    copy: "Copiar",
    paste: "Pegar",
    undo: "Deshacer",
    redo: "Rehacer",
    save: "Guardar",
    find: "Buscar"
  }
};

// ../shared/locales/es-ES/catalog.json
var catalog_default3 = {
  actions: {
    copy: "Copiar",
    paste: "Pegar",
    undo: "Deshacer",
    redo: "Rehacer",
    cut: "Cortar",
    save: "Guardar",
    find: "Buscar",
    saveas: "Guardar como",
    print: "Imprimir",
    screenshot: "Captura",
    terminal: "Terminal",
    playpause: "Play/Pausa",
    desktop: "Escritorio",
    back: "Atr\xE1s",
    forward: "Adelante",
    refresh: "Actualizar",
    lock: "Bloquear",
    explorer: "Explorador",
    next: "Siguiente",
    prev: "Anterior",
    volup: "Volumen +",
    volmute: "Silencio",
    maximize: "Maximizar",
    minimize: "Minimizar",
    close: "Cerrar",
    agent_claude: "Claude Code",
    agent_codex: "Codex CLI",
    agent_cursor: "Cursor",
    agent_gemini: "Gemini CLI",
    agent_copilot: "GitHub Copilot",
    agent_approve: "Aprobar",
    agent_decline: "Rechazar",
    agent_status: "Estado"
  },
  categories: {
    edit: "Edici\xF3n",
    nav: "Navegaci\xF3n",
    windows: "Ventanas",
    media: "Multimedia",
    system: "Sistema",
    agents: "Agentes de IA",
    plugins: "Plugins",
    misc: "Otros"
  },
  groupIcons: {
    edit: "Edici\xF3n",
    compass: "Navegaci\xF3n",
    layers: "Ventanas",
    music: "Multimedia",
    aperture: "Captura",
    settings: "Sistema",
    discord: "Discord",
    brain: "IA"
  },
  defaultGroups: {
    edit: "Edici\xF3n",
    nav: "Navegaci\xF3n",
    win: "Ventanas",
    media: "Multimedia",
    cap: "Captura",
    sys: "Sistema"
  },
  pluginCategory: "Plugin \xB7 {name}",
  unavailable: "No disponible"
};

// ../shared/locales/es-ES/devices.json
var devices_default3 = {
  title: "Dispositivos detectados",
  empty: "No se detect\xF3 ning\xFAn rat\xF3n",
  emptyHint: "conecta un rat\xF3n (USB, Bluetooth o inal\xE1mbrico) \u2014 el servicio lo detectar\xE1 autom\xE1ticamente",
  generic: "Gen\xE9rico",
  connected: "conectado",
  lastEvent: "\xDAltimo evento"
};

// ../shared/locales/es-ES/editor.json
var editor_default3 = {
  themes: {
    green: "Verde",
    orange: "Naranja",
    blue: "Azul",
    negative: "Negativo",
    white: "Blanco"
  },
  toolbar: {
    label: "Apariencia e historial del ring",
    theme: "Tema",
    liquidTip: "Hace que los botones del ring se fundan como gotas al abrir y cerrar",
    liquid: "Efecto l\xEDquido",
    asciiTip: "Muestra la escena de caracteres (agujero negro y estrellas) detr\xE1s del ring",
    ascii: "Efecto ASCII",
    undo: "Deshacer",
    undoTip: "Deshacer (Ctrl+Z)",
    redo: "Rehacer",
    redoTip: "Rehacer (Ctrl+Shift+Z)",
    newGroup: "Nuevo grupo",
    newGroupTip: "Crear un grupo nuevo",
    newGroupHiddenTip: "El ring muestra hasta {max} grupos: un grupo nuevo se guarda, pero queda oculto.",
    themeOption: "Tema {name}"
  },
  toast: {
    close: "Cerrar aviso"
  },
  preview: {
    title: "Vista previa del ring"
  },
  menu: {
    icons: "Iconos"
  },
  copySuffix: "{name} (copia)",
  library: {
    search: "Buscar acci\xF3n\u2026",
    searchLabel: "Buscar en la biblioteca de acciones",
    clear: "Borrar b\xFAsqueda",
    noResults: "Sin resultados",
    noResultsFor: "No se encontr\xF3 nada para \u201C{query}\u201D.",
    selectGroup: "Selecciona un grupo para a\xF1adir acciones",
    removeFrom: "Quitar de \u201C{group}\u201D",
    full: "\u201C{group}\u201D est\xE1 lleno ({max}/{max}). Quita una acci\xF3n para a\xF1adir otra.",
    addTo: "A\xF1adir a \u201C{group}\u201D",
    alsoIn: "Tambi\xE9n en ",
    in: "En ",
    inCategory: {
      one: "{count} acci\xF3n de esta categor\xEDa en el grupo seleccionado",
      other: "{count} acciones de esta categor\xEDa en el grupo seleccionado"
    }
  },
  picker: {
    search: "Buscar acci\xF3n",
    placeholder: "Buscar acci\xF3n\u2026",
    list: "Acciones",
    noResults: "Sin resultados para \u201C{query}\u201D.",
    current: "actual",
    inGroup: "ya en el grupo",
    navigate: "navegar",
    choose: "elegir",
    close: "cerrar",
    replaceTitle: "Cambiar \u201C{action}\u201D por\u2026",
    addTitle: "A\xF1adir a \u201C{group}\u201D"
  },
  inspector: {
    selectGroup: "Selecciona un grupo en la lista de arriba o haz clic en \xE9l en la vista previa para editarlo.",
    createFirst: "Crea un grupo para empezar a armar el ring.",
    name: "Nombre",
    namePlaceholder: "Nombre del grupo",
    deleteGroup: "Eliminar grupo",
    deleteGroupNamed: "Eliminar grupo {name}",
    icon: "Icono",
    actions: "Acciones del grupo",
    limitReached: "L\xEDmite alcanzado: quita una acci\xF3n para a\xF1adir otra.",
    limit: "Hasta {max} acciones por grupo",
    emptyStart: "Todav\xEDa no hay acciones. Elige en la",
    library: "Biblioteca de acciones",
    emptyMiddle: "o haz clic en el",
    emptyEnd: "de la vista previa.",
    emptyHint: "Un grupo vac\xEDo no aparece en el ring real.",
    actionsOf: "Acciones de {name}",
    actionPosition: "{label}, posici\xF3n {position} de {total}",
    actionPositionUnavailable: "{label} (no disponible), posici\xF3n {position} de {total}",
    unavailableTip: "Esta acci\xF3n ya no est\xE1 en el cat\xE1logo (plugin eliminado o desactivado). No funciona en el ring; puedes quitarla.",
    unavailable: "no disponible",
    remove: "Quitar {label}",
    removeTip: "Quitar del grupo"
  },
  groups: {
    nameLabel: "Nombre del grupo",
    none: "Todav\xEDa no hay grupos.",
    createFirst: "Crear el primer grupo",
    list: "Grupos del ring",
    row: "{name}, {count} de {max} acciones",
    rowHidden: "{name}, {count} de {max} acciones, oculto",
    unnamed: "Sin nombre",
    hiddenTip: "El ring muestra como m\xE1ximo {max} grupos. Este se guarda, pero solo aparece si lo mueves a las primeras {max} posiciones.",
    hidden: "oculto",
    emptyTip: "Grupo vac\xEDo: no aparece en el ring real hasta que tenga una acci\xF3n.",
    empty: "vac\xEDo",
    countTip: "{count} de {max} acciones",
    options: "Opciones del grupo {name}",
    moreOptions: "M\xE1s opciones"
  },
  main: {
    unnamed: "Sin nombre",
    quoted: "\u201C{name}\u201D",
    undo: "Deshacer",
    newGroupName: "Nuevo grupo",
    fallbackGroupName: "Grupo",
    newGroupHidden: "El ring muestra hasta {max} grupos \u2014 {name} se guarda, pero queda oculto.",
    groupDeleted: "Grupo {name} eliminado",
    duplicateHidden: "El ring muestra hasta {max} grupos \u2014 los que sobran quedan ocultos.",
    groupFull: "{name} ya tiene {max} acciones \u2014 quita una para a\xF1adir otra.",
    alreadyIn: "{action} ya est\xE1 en {group}.",
    selectFirst: "Selecciona un grupo primero.",
    actionRemoved: "{action} quitada de {group}",
    rename: "Renombrar",
    changeIcon: "Cambiar icono",
    duplicate: "Duplicar",
    moveUp: "Mover arriba",
    moveLeft: "Mover a la izquierda",
    moveDown: "Mover abajo",
    moveRight: "Mover a la derecha",
    delete: "Eliminar",
    replace: "Cambiar por\u2026",
    moveTo: "Mover a",
    noteFull: "lleno",
    noteDuplicate: "ya la tiene",
    remove: "Quitar",
    actionMenuTitle: "{action} \xB7 {group}",
    hint: "Haz clic en un grupo para editarlo \xB7 arrastra para reordenar \xB7 suelta en el centro para quitar \xB7 clic derecho para m\xE1s opciones",
    panel: "Grupos y acciones",
    groups: "Grupos",
    overLimit: "El ring solo muestra los primeros {max} grupos; los dem\xE1s quedan ocultos.",
    limit: "El ring muestra hasta {max} grupos",
    newGroup: "Nuevo grupo",
    selectedGroup: "Grupo seleccionado",
    noneSelected: "ninguno",
    library: "Biblioteca de acciones",
    available: "Acciones disponibles",
    clickToAdd: "Haz clic para a\xF1adir a",
    groupFullBadge: " \xB7 grupo lleno",
    selectToAdd: "Selecciona un grupo para a\xF1adir acciones."
  }
};

// ../shared/locales/es-ES/plugins.json
var plugins_default3 = {
  title: "Plugins",
  tabs: {
    catalog: "Cat\xE1logo",
    installed: "Instalados"
  },
  by: "por",
  installedBadge: "instalado",
  installedVersion: "Instalada: v{version}",
  working: "Espera\u2026",
  update: "Actualizar",
  install: "Instalar",
  loaded: "cargado",
  error: "error",
  actionCount: {
    one: "{count} acci\xF3n",
    other: "{count} acciones"
  },
  enabled: "Activado",
  disabled: "Desactivado",
  confirmDelete: "\xBFBorrar la carpeta de este plugin?",
  uninstall: "Desinstalar",
  cancel: "Cancelar",
  closeDetails: "Cerrar detalles",
  folderTip: "~/.orbit/plugins/ \u2014 copia aqu\xED la carpeta de un plugin para instalarlo manualmente",
  folder: "Carpeta de plugins",
  emptyCatalog: "El cat\xE1logo est\xE1 vac\xEDo",
  emptyCatalogHint: "copia la carpeta de un plugin en ~/.orbit/plugins/ para instalarlo manualmente",
  emptyInstalled: "No hay plugins instalados",
  emptyInstalledHint: "elige uno del cat\xE1logo o copia la carpeta de un plugin en ~/.orbit/plugins/",
  authorHintStart: "\xBFcreando un plugin? una carpeta con un",
  authorHintFields: "(id, name, version, author, actions) \xB7",
  authorHintEnd: "muestra el enlace y la foto de tu perfil",
  updateTo: "Actualizar a v{version}"
};

// ../shared/locales/es-ES/profiles.json
var profiles_default3 = {
  title: "Perfiles por aplicaci\xF3n",
  new: "Nuevo perfil",
  create: "Crear perfil",
  namePlaceholder: "Nombre (p. ej. VS Code)",
  processPlaceholder: "Proceso (p. ej. code.exe)",
  createButton: "Crear",
  cancel: "Cancelar",
  default: "Perfil predeterminado",
  defaultHint: "se usa cuando ning\xFAn perfil de aplicaci\xF3n coincide",
  actionCount: {
    one: "{count} acci\xF3n",
    other: "{count} acciones"
  },
  empty: "No hay perfiles de aplicaci\xF3n",
  emptyHint: "crea perfiles para tener acciones distintas en cada aplicaci\xF3n"
};

// ../shared/locales/es-ES/ring.json
var ring_default3 = {
  addAction: "A\xF1adir acci\xF3n",
  attentionGroup: "Claude \xB7 confirmaci\xF3n",
  attention: "Atenci\xF3n"
};

// ../shared/locales/es-ES/tray.json
var tray_default3 = {
  openConfig: "Abrir ajustes",
  quit: "Salir",
  checkUpdates: "Buscar actualizaciones",
  checkingUpdates: "Buscando actualizaciones\u2026",
  downloadingUpdate: "Descargando la versi\xF3n {version}\u2026 {percent}%",
  restartToUpdate: "Reiniciar para actualizar a {version}"
};

// ../shared/src/i18n.ts
var ptBR = { app: app_default, bindings: bindings_default, catalog: catalog_default, devices: devices_default, editor: editor_default, plugins: plugins_default, profiles: profiles_default, ring: ring_default, tray: tray_default };
var enUS = { app: app_default2, bindings: bindings_default2, catalog: catalog_default2, devices: devices_default2, editor: editor_default2, plugins: plugins_default2, profiles: profiles_default2, ring: ring_default2, tray: tray_default2 };
var esES = { app: app_default3, bindings: bindings_default3, catalog: catalog_default3, devices: devices_default3, editor: editor_default3, plugins: plugins_default3, profiles: profiles_default3, ring: ring_default3, tray: tray_default3 };
var DEFAULT_LOCALE = "en-US";
var MESSAGES = { "en-US": enUS, "pt-BR": ptBR, "es-ES": esES };
var LOCALES = Object.keys(MESSAGES);
function resolveLocale(preferred) {
  const list = (Array.isArray(preferred) ? preferred : [preferred]).filter((p) => !!p);
  for (const p of list) {
    const exact = LOCALES.find((l) => l.toLowerCase() === p.toLowerCase());
    if (exact) return exact;
    const lang = p.toLowerCase().split(/[-_]/)[0];
    const byLang = LOCALES.find((l) => l.toLowerCase().split("-")[0] === lang);
    if (byLang) return byLang;
  }
  return DEFAULT_LOCALE;
}
var SYSTEM_LOCALE = "system";
function isLocaleSetting(v) {
  return v === SYSTEM_LOCALE || typeof v === "string" && LOCALES.includes(v);
}
function localeFor(setting, system) {
  return isLocaleSetting(setting) && setting !== SYSTEM_LOCALE ? setting : resolveLocale(system);
}
function lookup(messages, key) {
  let v = messages;
  for (const part of key.split(".")) {
    if (!v || typeof v !== "object") return void 0;
    v = v[part];
  }
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof v.other === "string") return v;
  return void 0;
}
function createTranslator(locale, messages = MESSAGES) {
  const plural = new Intl.PluralRules(locale);
  const find = (key) => lookup(messages[locale], key) ?? lookup(messages[DEFAULT_LOCALE], key);
  const format = (key, params) => {
    const v = find(key);
    if (v === void 0) return key;
    const text = typeof v === "string" ? v : typeof params?.count === "number" ? v[plural.select(params.count)] ?? v.other : v.other;
    return params ? text.replace(/\{(\w+)\}/g, (m, name) => name in params ? String(params[name]) : m) : text;
  };
  const t2 = ((key, params) => format(key, params));
  t2.dyn = format;
  t2.has = (key) => find(key) !== void 0;
  t2.locale = locale;
  return t2;
}

// src/main.ts
var import_ws = require("ws");
var import_child_process = require("child_process");
var path = __toESM(require("path"));
var import_electron_updater = require("electron-updater");

// src/updater.ts
var SIX_HOURS = 6 * 60 * 60 * 1e3;
var message = (e) => e instanceof Error ? e.message : String(e);
function startUpdater(opts) {
  let status = { state: opts.enabled ? "idle" : "disabled" };
  const current = () => status;
  const set = (next) => {
    status = next;
    opts.onStatus(next);
  };
  set(status);
  if (!opts.enabled) {
    return { check: async () => {
    }, install: () => {
    }, stop: () => {
    }, status: () => status };
  }
  const { updater } = opts;
  const timers = opts.timers ?? { setInterval, clearInterval: (id) => clearInterval(id) };
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on("checking-for-update", () => set({ state: "checking" }));
  updater.on("update-not-available", () => set({ state: "none" }));
  updater.on("update-available", (info) => set({ state: "downloading", version: String(info?.version ?? ""), percent: 0 }));
  updater.on("download-progress", (p) => {
    const version = status.state === "downloading" ? status.version : "";
    set({ state: "downloading", version, percent: Math.round(Number(p?.percent) || 0) });
  });
  updater.on("update-downloaded", (info) => set({ state: "ready", version: String(info?.version ?? "") }));
  updater.on("error", (e) => {
    if (status.state !== "ready") set({ state: "error", message: message(e) });
  });
  const check = async () => {
    if (status.state === "downloading" || status.state === "ready") return;
    try {
      await updater.checkForUpdates();
    } catch (e) {
      if (current().state !== "ready") set({ state: "error", message: message(e) });
    }
  };
  const timer = timers.setInterval(() => {
    void check();
  }, opts.intervalMs ?? SIX_HOURS);
  void check();
  return {
    check,
    install: () => {
      if (status.state === "ready") updater.quitAndInstall(true, true);
    },
    stop: () => timers.clearInterval(timer),
    status: () => status
  };
}
function updateMenuItem(status) {
  switch (status.state) {
    case "disabled":
      return null;
    case "checking":
      return { key: "tray.checkingUpdates", enabled: false, action: null };
    case "downloading":
      return { key: "tray.downloadingUpdate", params: { version: status.version, percent: status.percent }, enabled: false, action: null };
    case "ready":
      return { key: "tray.restartToUpdate", params: { version: status.version }, enabled: true, action: "install" };
    default:
      return { key: "tray.checkUpdates", enabled: true, action: "check" };
  }
}

// src/main.ts
import_electron.app.disableHardwareAcceleration();
var localeSetting = SYSTEM_LOCALE;
var translator = null;
function t(key, params) {
  translator ??= createTranslator(localeFor(localeSetting, import_electron.app.getPreferredSystemLanguages()));
  return translator(key, params);
}
var ring = null;
var configWindow = null;
var tray = null;
var ws = null;
var svcProcess = null;
var ringSize = 640;
var lastRingConfig = null;
var lastPluginActions = null;
var lastPluginStates = null;
function sendRingState() {
  if (!ring || ring.isDestroyed()) return;
  const wc = ring.webContents;
  if (lastPluginActions) wc.send("ring-config", { pluginActions: lastPluginActions });
  if (lastRingConfig) wc.send("ring-config", ringConfigForRenderer());
  if (lastPluginStates) wc.send("ring-config", { pluginStates: lastPluginStates });
  wc.send("ring-config", { locale: localeSetting });
}
var ATTENTION_GROUP_ID = "__attention";
var attentionItems = [];
function ringConfigForRenderer() {
  const cfg = lastRingConfig;
  if (!cfg || !Array.isArray(cfg.groups)) return cfg;
  const groups = cfg.groups.filter((g) => g?.id !== ATTENTION_GROUP_ID);
  const item = attentionItems.find((i) => i.pluginId && Array.isArray(i.actionIds) && i.actionIds.length > 0);
  if (!item) return groups.length === cfg.groups.length ? cfg : { ...cfg, groups };
  let actions = item.actionIds.map((a) => `plugin:${item.pluginId}:${a}`);
  if (lastPluginActions) {
    const known = new Set(lastPluginActions.map((a) => a.id));
    actions = actions.filter((a) => known.has(a));
  }
  if (actions.length === 0) return cfg;
  const group = { id: ATTENTION_GROUP_ID, name: t("ring.attentionGroup"), icon: "brain", actions };
  return { ...cfg, groups: [group, ...groups] };
}
var CUE_W = 300;
var CUE_H = 84;
var CUE_FOLLOW_MS = 2e3;
var CUE_FADE_MS = 180;
var cue = null;
var cueLoaded = false;
var cueShown = false;
var cueFollowTimer = null;
var cueHideTimer = null;
var cueLastPos = { x: NaN, y: NaN };
var cueAnnounce = false;
function createCueWindow() {
  cue = new import_electron.BrowserWindow({
    width: CUE_W,
    height: CUE_H,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  cueLoaded = false;
  cue.setIgnoreMouseEvents(true);
  cue.setAlwaysOnTop(true, "screen-saver");
  cue.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  cue.loadFile(path.join(__dirname, "src", "cue.html"));
  cue.webContents.on("did-finish-load", () => {
    cueLoaded = true;
    updateCue();
  });
  cue.on("closed", () => {
    cue = null;
    cueLoaded = false;
    cueShown = false;
    stopCueFollow();
  });
}
function positionCue() {
  if (!cue || cue.isDestroyed()) return;
  const wa = import_electron.screen.getPrimaryDisplay().workArea;
  const x = Math.round(wa.x + wa.width - CUE_W);
  const y = Math.round(wa.y + (wa.height - CUE_H) / 2);
  if (x === cueLastPos.x && y === cueLastPos.y) return;
  cueLastPos = { x, y };
  cue.setBounds({ x, y, width: CUE_W, height: CUE_H });
}
function stopCueFollow() {
  if (cueFollowTimer) {
    clearInterval(cueFollowTimer);
    cueFollowTimer = null;
  }
}
function cueScript(code) {
  if (!cue || cue.isDestroyed() || !cueLoaded) return;
  cue.webContents.executeJavaScript(code).catch(() => {
  });
}
function updateCue() {
  const item = attentionItems[0];
  const wanted = !!item && !(ring && !ring.isDestroyed() && ring.isVisible());
  if (!wanted) {
    stopCueFollow();
    if (!cue || cue.isDestroyed() || !cueShown) return;
    cueShown = false;
    cueScript("window.cueHide && window.cueHide()");
    if (cueHideTimer) clearTimeout(cueHideTimer);
    cueHideTimer = setTimeout(() => {
      cueHideTimer = null;
      if (cue && !cue.isDestroyed() && !cueShown) cue.hide();
    }, CUE_FADE_MS);
    return;
  }
  if (!cue || cue.isDestroyed()) {
    createCueWindow();
    return;
  }
  if (!cueLoaded) return;
  if (cueHideTimer) {
    clearTimeout(cueHideTimer);
    cueHideTimer = null;
  }
  const data = {
    title: item.title || t("ring.attention"),
    text: item.text || "",
    count: attentionItems.length,
    accent: lastRingConfig?.accent,
    announce: cueAnnounce
  };
  cueAnnounce = false;
  cueScript(`window.cueShow && window.cueShow(${JSON.stringify(data)})`);
  cueLastPos = { x: NaN, y: NaN };
  positionCue();
  if (!cueShown) {
    cueShown = true;
    cue.showInactive();
    cue.setAlwaysOnTop(true, "screen-saver");
  }
  if (!cueFollowTimer) cueFollowTimer = setInterval(positionCue, CUE_FOLLOW_MS);
}
function setAttention(items) {
  const next = (Array.isArray(items) ? items : []).filter(
    (i) => i && typeof i.id === "string" && typeof i.title === "string"
  );
  const before = new Set(attentionItems.map((i) => `${i.pluginId}
${i.id}`));
  const hasNew = next.some((i) => !before.has(`${i.pluginId}
${i.id}`));
  attentionItems = next;
  if (hasNew) cueAnnounce = true;
  updateCue();
}
var IS_PACKAGED = import_electron.app.isPackaged;
var RESOURCES = IS_PACKAGED ? process.resourcesPath : path.join(__dirname, "..");
var ASSETS = IS_PACKAGED ? path.join(RESOURCES, "app.asar", "assets") : path.join(__dirname, "..", "assets");
var CONFIG_FILE = IS_PACKAGED ? path.join(RESOURCES, "ui", "index.html") : null;
var CONFIG_URL = `http://localhost:${Number(process.env.ORBIT_UI_PORT) || 9120}`;
var SERVICE_PATH = IS_PACKAGED ? path.join(RESOURCES, "service", "index.js") : path.join(__dirname, "..", "service", "dist", "index.js");
function releaseWin32State() {
  try {
    const cleanupCode = `
      try {
        const koffi = require('koffi');
        const u32 = koffi.load('user32.dll');
        u32.func('ClipCursor', 'int', ['void *'])(null);
        u32.func('BlockInput', 'int', ['int'])(0);
      } catch {}
      process.exit(0);
    `;
    const cleanupExe = IS_PACKAGED ? process.execPath : "node";
    const cleanupEnv = { ...process.env };
    if (IS_PACKAGED) {
      cleanupEnv.ELECTRON_RUN_AS_NODE = "1";
      cleanupEnv.NODE_PATH = path.join(RESOURCES, "app.asar.unpacked", "node_modules") + path.delimiter + path.join(RESOURCES, "app.asar", "node_modules");
    }
    const cp = (0, import_child_process.spawn)(cleanupExe, ["-e", cleanupCode], {
      stdio: "ignore",
      windowsHide: true,
      env: cleanupEnv
    });
    cp.on("exit", () => console.log("[orbitring] Win32 state cleanup done"));
  } catch (e) {
    console.error("[orbitring] Failed to run Win32 cleanup:", e);
  }
}
function startService() {
  console.log("[orbitring] Starting service:", SERVICE_PATH);
  const nodeExe = IS_PACKAGED ? process.execPath : "node";
  const env = { ...process.env };
  if (IS_PACKAGED) {
    env.ELECTRON_RUN_AS_NODE = "1";
    env.NODE_PATH = path.join(RESOURCES, "app.asar.unpacked", "node_modules") + path.delimiter + path.join(RESOURCES, "app.asar", "node_modules");
    env.ORBIT_PLUGIN_CATALOG = path.join(RESOURCES, "plugins");
  }
  svcProcess = (0, import_child_process.spawn)(nodeExe, [SERVICE_PATH], {
    stdio: "inherit",
    windowsHide: true,
    env
  });
  svcProcess.on("exit", (code) => {
    console.log(`[orbitring] Service exited: ${code}`);
    releaseWin32State();
    if (code !== 0) setTimeout(startService, 2e3);
  });
}
function createRingWindow() {
  ring = new import_electron.BrowserWindow({
    width: ringSize,
    height: ringSize,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    focusable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js")
    }
  });
  ring.loadFile(path.join(__dirname, "src", "ring.html"), { query: { v: Date.now().toString() } });
  ring.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  ring.on("ready-to-show", () => {
    console.log("[ring] Window ready");
  });
  ring.webContents.on("did-finish-load", sendRingState);
  ring.on("show", updateCue);
  ring.on("hide", () => {
    setTimeout(updateCue, 450);
  });
}
function createConfigWindow() {
  if (configWindow) {
    configWindow.focus();
    return;
  }
  const appIcon = import_electron.nativeImage.createFromPath(path.join(ASSETS, "app-icon.png"));
  configWindow = new import_electron.BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 720,
    minHeight: 480,
    icon: appIcon,
    frame: false,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0A0A0B",
      symbolColor: "#71717A",
      height: 36
    },
    backgroundColor: "#0A0A0B",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });
  if (CONFIG_FILE) {
    configWindow.loadFile(CONFIG_FILE);
  } else {
    configWindow.loadURL(CONFIG_URL);
  }
  configWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) import_electron.shell.openExternal(url).catch(() => {
    });
    return { action: "deny" };
  });
  configWindow.webContents.on("did-fail-load", (_e, code, desc) => {
    console.error("[orbitring] Config window failed to load:", code, desc);
  });
  configWindow.webContents.on("console-message", (e) => {
    const msg = e.message;
    if (msg.includes("Error") || msg.includes("error") || msg.includes("Failed")) {
      console.error("[orbitring] Console:", msg);
    }
  });
  configWindow.once("ready-to-show", () => {
    configWindow?.maximize();
    configWindow?.show();
  });
  configWindow.webContents.on("console-message", (e) => {
    console.log(`[ui:${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });
  configWindow.on("closed", () => {
    configWindow = null;
  });
}
var updates = null;
var updateStatus = { state: "disabled" };
function buildTrayMenu() {
  if (!tray) return;
  const item = updateMenuItem(updateStatus);
  const updateEntries = item ? [{
    label: t(item.key, item.params),
    enabled: item.enabled,
    click: () => {
      if (item.action === "install") updates?.install();
      else if (item.action === "check") void updates?.check();
    }
  }] : [];
  tray.setContextMenu(import_electron.Menu.buildFromTemplate([
    {
      label: t("tray.openConfig"),
      click: () => createConfigWindow()
    },
    ...updateEntries,
    { type: "separator" },
    {
      label: t("tray.quit"),
      click: () => {
        import_electron.app.quit();
      }
    }
  ]));
}
function createTray() {
  const icon = import_electron.nativeImage.createFromPath(path.join(ASSETS, "tray-icon.png"));
  tray = new import_electron.Tray(icon);
  tray.setToolTip("OrbitRing");
  buildTrayMenu();
  tray.on("double-click", () => createConfigWindow());
}
function startUpdates() {
  updates = startUpdater({
    updater: import_electron_updater.autoUpdater,
    enabled: IS_PACKAGED,
    onStatus: (status) => {
      updateStatus = status;
      if (status.state === "error") console.warn("[orbitring] Update check failed:", status.message);
      buildTrayMenu();
    }
  });
}
var RING_CONTENT_RADIUS = 190;
function showRing(cursorX, cursorY) {
  if (!ring) return;
  if (ring.isVisible()) return;
  const cursor = cursorX != null ? { x: cursorX, y: cursorY } : import_electron.screen.getCursorScreenPoint();
  const display = import_electron.screen.getDisplayNearestPoint(cursor);
  const size = ringSize;
  const b = display.bounds;
  const reach = Math.min(RING_CONTENT_RADIUS, Math.floor(Math.min(b.width, b.height) / 2));
  const centerX = Math.round(Math.max(b.x + reach, Math.min(cursor.x, b.x + b.width - reach)));
  const centerY = Math.round(Math.max(b.y + reach, Math.min(cursor.y, b.y + b.height - reach)));
  const x = centerX - size / 2;
  const y = centerY - size / 2;
  ring.setBounds({ x, y, width: size, height: size });
  if ((centerX !== cursor.x || centerY !== cursor.y) && ws?.readyState === import_ws.WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "move_cursor_lock", x: centerX, y: centerY }));
  }
  const inset = {
    l: Math.max(0, b.x - x),
    t: Math.max(0, b.y - y),
    r: Math.max(0, x + size - (b.x + b.width)),
    b: Math.max(0, y + size - (b.y + b.height))
  };
  sendRingState();
  ring.webContents.send("ring-show", { cx: centerX - x, cy: centerY - y, inset });
  ring.showInactive();
  ring.moveTop();
}
function hideRing() {
  if (ring && ring.isVisible()) {
    ring.webContents.send("ring-hide");
    ring.hide();
  }
  if (ws?.readyState === import_ws.WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "unlock_cursor" }));
  }
}
function connectService() {
  ws = new import_ws.WebSocket("ws://localhost:9119");
  ws.on("open", () => {
    console.log("[ring] Connected to service");
    ws?.send(JSON.stringify({ type: "get_plugins" }));
    ws?.send(JSON.stringify({ type: "get_plugin_states" }));
    ws?.send(JSON.stringify({ type: "get_attention" }));
  });
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "button_event" && msg.button === "side2") {
        console.log("[ring] side2", msg.action, "visible:", ring?.isVisible());
        if (msg.action === "press") {
          if (ring && ring.isVisible()) {
            console.log("[ring] Sending ring-release");
            ring.webContents.send("ring-release");
          } else {
            console.log("[ring] Showing ring at", msg.x, msg.y);
            showRing(msg.x, msg.y);
          }
        }
      } else if (msg.type === "ring_move") {
        if (ring && ring.isVisible()) {
          ring.webContents.send("ring-move", { dx: msg.dx, dy: msg.dy });
        }
      } else if (msg.type === "ring_config") {
        const r = msg.ring;
        lastRingConfig = r;
        ringSize = 640;
        if (ring) {
          ring.webContents.send("ring-config", ringConfigForRenderer());
        }
      } else if (msg.type === "locale") {
        localeSetting = String(msg.locale);
        translator = null;
        buildTrayMenu();
        if (ring && !ring.isDestroyed()) ring.webContents.send("ring-config", { locale: localeSetting });
      } else if (msg.type === "plugins") {
        const pluginActions = (msg.plugins || []).flatMap(
          (p) => (p.actions || []).map((a) => ({ id: `plugin:${p.id}:${a.id}`, name: a.name, icon: a.icon, iconActive: a.iconActive, keepIcon: a.keepIcon === true, image: typeof a.image === "string" ? a.image : void 0 }))
        );
        lastPluginActions = pluginActions;
        if (ring && pluginActions.length) {
          ring.webContents.send("ring-config", { pluginActions });
          if (lastPluginStates) ring.webContents.send("ring-config", { pluginStates: lastPluginStates });
        }
      } else if (msg.type === "attention") {
        setAttention(msg.items);
      } else if (msg.type === "plugin_states") {
        lastPluginStates = msg.states || {};
        if (ring) {
          ring.webContents.send("ring-config", { pluginStates: lastPluginStates });
        }
      }
    } catch (e) {
      console.error("[ring] message error:", e);
    }
  });
  ws.on("close", () => {
    console.log("[ring] Disconnected, retrying in 2s...");
    if (attentionItems.length) setAttention([]);
    setTimeout(connectService, 2e3);
  });
  ws.on("error", () => {
    ws?.close();
  });
}
import_electron.ipcMain.on("execute-action", (_event, action) => {
  console.log("[ring] execute-action received:", JSON.stringify(action).slice(0, 100));
  hideRing();
  setTimeout(() => {
    if (ws?.readyState === import_ws.WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "test_action", action }));
      console.log("[ring] Action sent to service");
    } else {
      console.log("[ring] WebSocket not open, action lost! readyState:", ws?.readyState);
    }
  }, 100);
});
import_electron.ipcMain.on("close-ring", () => {
  hideRing();
});
import_electron.ipcMain.on("hide-ring", () => {
  if (ring) ring.hide();
});
var IS_FIRST_INSTANCE = !IS_PACKAGED || import_electron.app.requestSingleInstanceLock();
if (!IS_FIRST_INSTANCE) import_electron.app.quit();
import_electron.app.on("second-instance", () => createConfigWindow());
import_electron.app.whenReady().then(() => {
  if (!IS_FIRST_INSTANCE) return;
  if (IS_PACKAGED) {
    startService();
  }
  createRingWindow();
  createTray();
  startUpdates();
  createConfigWindow();
  setTimeout(connectService, IS_PACKAGED ? 1500 : 500);
});
import_electron.app.on("window-all-closed", () => {
});
import_electron.app.on("before-quit", () => {
  updates?.stop();
  stopCueFollow();
  if (cue && !cue.isDestroyed()) cue.destroy();
  releaseWin32State();
  if (svcProcess) svcProcess.kill();
});
