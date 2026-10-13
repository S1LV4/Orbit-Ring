# PowerToys — plugin do OrbitRing

Aciona os utilitários do [Microsoft PowerToys](https://github.com/microsoft/PowerToys) direto no ring: Color Picker, Always On Top, editor do FancyZones, Régua de Tela, Extrator de Texto, Peek e outros.

O plugin **verifica se o PowerToys está instalado** em quem o ativa. Sem o PowerToys ele continua carregando, mas cada ação explica o que falta em vez de falhar em silêncio.

## Requisitos

- Windows 10/11.
- PowerToys instalado (`winget install Microsoft.PowerToys`). Testado com a versão **0.101.2362.0**; os nomes dos eventos vêm de `src/common/interop/shared_constants.h` dessa versão.
- O módulo correspondente a cada ação precisa estar **ativado nas configurações do PowerToys**. O plugin nunca ativa módulos por conta própria.
- Windows PowerShell 5.1 (já vem com o Windows) — usado pelo processo auxiliar descrito abaixo.

## Instalação

Copie esta pasta para `%USERPROFILE%\.orbit\plugins\powertoys\` (arquivos `manifest.json`, `index.js`, `actions.js`, `detect.js`, `helper.js`) e reinicie o serviço do OrbitRing. As ações aparecem no editor do ring com o prefixo "PowerToys ·".

## Como funciona a verificação da instalação

Feita ao carregar o plugin, repetida em segundo plano e antes de cada clique. É somente leitura.

1. Procura a pasta de instalação:
   - nas chaves de desinstalação do registro (`HKCU`, `HKLM` e `HKLM\WOW6432Node` em `...\CurrentVersion\Uninstall`) cujo `DisplayName` começa com "PowerToys", lendo `InstallLocation`;
   - em `%LOCALAPPDATA%\PowerToys` (instalador por usuário);
   - em `%ProgramFiles%\PowerToys` (instalador para a máquina).
2. Só considera instalado se `PowerToys.exe` existir de fato em uma dessas pastas (uma entrada de registro órfã não conta).
3. Lê a versão (registro ou `settings.json`), verifica se o processo `PowerToys.exe` está em execução e lê o mapa `enabled` de `%LOCALAPPDATA%\Microsoft\PowerToys\settings.json` para saber quais módulos estão ativados.

Frequência: registro e pastas a cada 5 minutos; processos e arquivos de configuração a cada 1 minuto; o mapa de módulos é relido a cada clique. Quando o plugin diz "não instalado", um clique refaz a verificação completa (no máximo a cada 10 s), então instalar o PowerToys não exige reiniciar o OrbitRing.

| Situação | O que o botão mostra | O que o clique faz |
| --- | --- | --- |
| Fora do Windows | `PowerToys só existe no Windows` | nada |
| PowerToys não instalado | `PowerToys não instalado · instale com: winget install Microsoft.PowerToys` | uma notificação com a mesma dica |
| Módulo desativado | `<utilitário> · desativado no PowerToys` | notificação pedindo para ativar o módulo nas configurações do PowerToys |
| PowerToys instalado, mas parado | `<utilitário> · PowerToys parado` | inicia o `PowerToys.exe`, espera até 10 s o módulo ficar pronto e aciona; se não der, avisa "PowerToys não está em execução" |
| Tudo certo | `<utilitário> · <atalho configurado>` | aciona o utilitário |

Se o PowerToys estiver configurado para "sempre executar como administrador", o plugin não o inicia sozinho (isso abriria um pedido de elevação) e um PowerToys elevado pode recusar o acionamento; nesses casos aparece um aviso.

## Ações

Id no ring: `plugin:com.orbitring.powertoys:<id>`.

| Id | Ação | Módulo que precisa estar ativado |
| --- | --- | --- |
| `color_picker` | Abre o seletor de cores | Color Picker |
| `always_on_top` | Fixa/solta a janela ativa no topo | Always On Top |
| `awake` | Mostra se o Awake está mantendo o PC acordado; o clique abre a página do Awake | Awake |
| `fancyzones_editor` | Abre o editor de layouts | FancyZones |
| `measure_tool` | Abre a Régua de Tela | Screen Ruler (Measure Tool) |
| `text_extractor` | OCR de uma área da tela | Text Extractor |
| `peek` | Pré-visualiza o arquivo selecionado no Explorador | Peek |
| `shortcut_guide` | Mostra o guia de atalhos | Shortcut Guide |
| `find_my_mouse` | Destaca o ponteiro | Find My Mouse |
| `mouse_highlighter` | Liga/desliga o realce de cliques | Mouse Highlighter |
| `mouse_crosshairs` | Liga/desliga a mira do ponteiro | Mouse Pointer Crosshairs |
| `mouse_jump` | Abre a miniatura das telas para saltar o ponteiro | Mouse Jump |
| `crop_and_lock_thumbnail` | Recorta a janela ativa em miniatura ao vivo | Crop And Lock |
| `crop_and_lock_reparent` | Recorta a janela ativa mantendo-a interativa | Crop And Lock |
| `command_palette` | Abre a Paleta de Comandos | Command Palette |
| `powertoys_run` | Abre o PowerToys Run | PowerToys Run |
| `advanced_paste` | Abre a Colagem Avançada | Advanced Paste |
| `workspaces` | Abre o editor de Workspaces | Workspaces |
| `zoomit` | Ativa o zoom do ZoomIt | ZoomIt |
| `zoomit_draw` | Ativa o modo de desenho do ZoomIt | ZoomIt |
| `light_switch` | Alterna tema claro/escuro | Light Switch |
| `settings` | Abre as configurações do PowerToys | — |

## Como os utilitários são acionados

Da mesma forma que o próprio PowerToys faz no painel de Acesso Rápido e no plugin do PowerToys Run: sinalizando um **evento nomeado do Windows** que cada módulo escuta (`Local\ShowColorPickerEvent-…`, `Local\AlwaysOnTopPinEvent-…` etc.). As páginas de configuração são abertas com `PowerToys.exe --open-settings=<página>`. Nenhum atalho de teclado é simulado.

O Node não tem API para eventos nomeados, então o plugin mantém **um único processo PowerShell oculto**:

- é iniciado só no primeiro clique, fica ativo por 5 minutos sem uso e depois encerra; volta sob demanda e é encerrado quando o plugin é descarregado;
- recebe pedidos por linha de texto e responde por linha; o script é fixo e nunca avalia o que recebe;
- só recebe nomes de evento que estão na tabela de `actions.js`, e o script confere o formato do nome de novo;
- roda com `-NoProfile -NonInteractive`, sem alterar política de execução.

Com o processo já ativo, um acionamento leva menos de 1 ms; o primeiro clique depois de um período ocioso paga a inicialização do PowerShell (cerca de meio segundo).

## Limitações

- **Awake não é alternado pelo plugin.** O Awake não tem evento de acionamento e roda em instância única; a única forma de mudar o modo é reescrever o `settings.json` dele, e este plugin não altera configurações do PowerToys. O botão mostra o estado (lido do arquivo) e o clique abre a página do Awake.
- **Realçador do Mouse, Mira do Ponteiro e Light Switch** são alternados, mas o PowerToys não expõe o estado atual, então o botão não indica ligado/desligado.
- **Always On Top, Crop And Lock, Colagem Avançada e Peek agem sobre a janela ativa.** O ring abre sem tomar o foco, então a janela em que você estava continua sendo a ativa; o plugin espera mais 150 ms antes de acionar essas ações.
- **Peek** só é acionado quando a janela ativa é do Explorador de Arquivos (ou a área de trabalho), como o atalho original; caso contrário aparece um aviso.
- Nomes de eventos podem mudar entre versões do PowerToys. Se um evento não existir, a ação avisa e não faz mais nada.
- Uma pasta de instalação personalizada com acentos no caminho pode não ser lida do registro; as pastas padrão continuam sendo verificadas.
- Não incluídos: Hosts, Registry Preview, Variáveis de Ambiente, Keyboard Manager, PowerDisplay, Mouse Without Borders (têm evento, mas não fazem sentido em um menu radial), layouts do FancyZones e abertura de um workspace específico pela linha de comando, e os utilitários de menu de contexto (Image Resizer, PowerRename, File Locksmith), que dependem de arquivos selecionados.
