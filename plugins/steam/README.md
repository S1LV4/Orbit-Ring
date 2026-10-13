# Steam

Plugin do OrbitRing que coloca o Steam no ring: o jogo em execução, o download em andamento e os
jogos jogados recentemente — cada um com a **capa do jogo** no botão.

Só funciona no **Windows** por enquanto (o jogo em execução é lido do registro do Windows). No
Linux e no macOS todas as ações mostram "Steam: só no Windows por enquanto".

## Ações

Fixas (`plugin:com.orbitring.steam:<id>`):

| id | Nome | O que mostra | Clique |
| --- | --- | --- | --- |
| `playing` | Steam · Jogando | ativo + "Enshrouded · 1h12" enquanto um jogo roda; senão "nada em execução" | abre a biblioteca (`steam://open/games`) |
| `downloads` | Steam · Downloads | anel de progresso + "42%" + "ARC Raiders · 42% · 4,2 GB de 10,0 GB"; senão "nada baixando" | abre a página de downloads (`steam://open/downloads`) |
| `library` | Steam · Biblioteca | — | `steam://open/games` |
| `store` | Steam · Loja | — | `steam://store` |
| `friends` | Steam · Amigos | — | `steam://open/friends` |
| `big_picture` | Steam · Big Picture | — | `steam://open/bigpicture` |
| `status_online` / `status_away` / `status_invisible` / `status_offline` | Steam · Ficar online / ausente / invisível / offline | — (o status atual não é lido) | `steam://friends/status/<status>` |

Dinâmicas: uma por jogo instalado jogado recentemente — os **8 mais recentes**, do mais novo para o
mais antigo. O id é `game.<appid>` (ex.: `game.550`), estável entre reinícios; o nome é o nome do
jogo e a imagem é a capa.

- jogo em execução: ativo, "em execução · 1h12" (o clique não faz nada além de avisar);
- jogo atualizando: "atualizando 42%";
- caso contrário: "Left 4 Dead 2 · jogado há 3 dias". O clique inicia o jogo
  (`steam://rungameid/<appid>`).

Um jogo que sai da lista dos 8 deixa de ter botão; se um ring ainda apontar para ele, o botão
aparece como "indisponível" até o jogo voltar à lista.

## De onde vêm os dados

Tudo é lido localmente, somente leitura — o plugin nunca escreve na pasta do Steam nem no registro.

| Dado | Fonte |
| --- | --- |
| Steam instalado? | registro `HKCU\Software\Valve\Steam` valor `SteamPath` + existência de `steam.exe` |
| Jogo em execução | registro, valor `RunningAppID` (a cada 15 s; a cada 5 s enquanto um jogo roda). Conferido com `ActiveProcess\pid` para ignorar um valor velho de um Steam fechado |
| Tempo da sessão | hora de início do processo do jogo (uma consulta por sessão, pela pasta de instalação do jogo). Sem isso: desde que o plugin viu o jogo começar; se o jogo já estava rodando, só "em execução" |
| Bibliotecas | `<Steam>\steamapps\libraryfolders.vdf` (ou `<Steam>\config\libraryfolders.vdf`) — inclui bibliotecas em outros discos |
| Jogos, última vez jogado, download | `<biblioteca>\steamapps\appmanifest_<appid>.acf` (`name`, `LastPlayed`, `StateFlags`, `BytesToDownload`, `BytesDownloaded`), relidos a cada 60 s (5 s durante um download) |
| Capas | cache do próprio cliente: `<Steam>\appcache\librarycache\<appid>\` (inclusive nas subpastas com nome em hash dos clientes novos). Preferência: `library_600x900.jpg`, `library_capsule.jpg`, `header.jpg`, `library_header.jpg` |
| Capa que não existe localmente | um arquivo público da CDN da Valve: `https://cdn.cloudflare.steamstatic.com/steam/apps/<appid>/library_600x900.jpg` (ou `header.jpg`). A única coisa enviada é o **appid público** na URL — sem chave, sem cookie, sem conta |

A miniatura do botão é gerada pelo serviço do OrbitRing (`host.makeThumbnail`, 96 px); o plugin
nunca embute arquivos de imagem por conta própria. Se o serviço não tiver essa função (versão
antiga, ou biblioteca de imagens indisponível), os jogos aparecem com o logo do Steam e o nome no
balão — todo o resto funciona igual.

## O que NÃO é lido

- Nenhum login, nenhuma chave, nada da Steam Web API, nada da sua conta.
- `ActiveProcess\ActiveUser`, `AutoLoginUser` e os demais valores do registro: cada valor é
  consultado individualmente (`reg query … /v <nome>`), só os três citados acima.
- A pasta `userdata\` (incluindo `localconfig.vdf`), `config\loginusers.vdf`, amigos, conquistas,
  tempo total de jogo. "Jogado há…" vem do `LastPlayed` dos `appmanifest`, que só existe para jogos
  **instalados**.
- O status atual de amigos (online/ausente…): o Steam não o expõe localmente; as ações de status
  só enviam o comando.

## Cache

`~/.orbit/plugin-data/steam/` (no Windows: `C:\Users\<você>\.orbit\plugin-data\steam\`):

- `<appid>_library_600x900.jpg` / `<appid>_header.jpg` — capas baixadas da CDN (só para jogos sem
  capa local);
- `cdn.json` — quando cada appid foi tentado pela última vez.

Regras: no máximo uma tentativa por jogo a cada 24 h (deu certo ou não), no máximo 2 downloads ao
mesmo tempo, 8 s e 2 MB por arquivo, apenas JPEG. Pode apagar a pasta quando quiser. As miniaturas
em si ficam só na memória.

## Limitações

- Apenas Windows.
- Só jogos **instalados** e já jogados entram na lista; jogos desinstalados e atalhos de jogos que
  não são do Steam não têm `appmanifest`. Um jogo não-Steam em execução aparece em `playing` como
  "jogo · em execução".
- Não dá para trazer a janela do jogo para a frente com segurança; `playing` abre a biblioteca.
- A lista muda de ordem conforme você joga (o mais recente vem primeiro).
- O estado de download vem dos `StateFlags` do `appmanifest`, que o Steam grava com alguns segundos
  de atraso; durante "preparando" o total ainda é 0 e o botão mostra "…".
- Os comandos `steam://` são os documentados em
  <https://developer.valvesoftware.com/wiki/Steam_browser_protocol>; a própria página avisa que
  alguns podem deixar de funcionar entre versões do cliente. Se o Steam estiver fechado, qualquer
  clique o abre.
- A imagem da ação fixa `playing` não muda para a capa do jogo: o serviço só aceita imagens
  dinâmicas em ações dinâmicas. A capa aparece no botão `game.<appid>` do jogo, que fica ativo.

## Instalação

Copie esta pasta para `~/.orbit/plugins/steam/` e reinicie o serviço do OrbitRing.

## Testes

`npm test -w packages/service` (arquivo `packages/service/src/steam-plugin.test.js`): herméticos —
registro, pastas, HTTP, host, relógio e o "abridor" de links são injetados; nenhum link `steam://`
é aberto.

## Marca

O logo do Steam vem do Simple Icons (ver `packages/shared/src/BRAND-ICONS.md`). Steam e o logo do
Steam são marcas da Valve Corporation; este plugin não é afiliado à Valve nem endossado por ela.
