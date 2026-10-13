# Antigravity — plugin do OrbitRing

Mostra no ring quanto da cota do **Google Antigravity** já foi usada, do mesmo jeito que o
medidor de uso do Claude: arco de progresso + porcentagem no botão, detalhes no balão.

## Ações

| Ação | O que mostra |
| :- | :- |
| `Antigravity · Gemini` | grupo dos modelos Gemini — a janela mais apertada (5h ou semana) |
| `Antigravity · Claude e GPT` | grupo dos modelos Claude e GPT, no mesmo formato |
| `Antigravity · Uso` | a janela mais apertada entre todos os grupos (para quem quer um botão só) |

- O número é o **uso** (100 − restante). Cores: verde < 60 %, âmbar ≥ 60 %, vermelho > 85 %.
- Balão: `Antigravity · Windows · Gemini · 5h 42% (renova em 2h10) · semana 18% (renova em 4d 2h) · plano Pro`.
  O trecho depois de "Antigravity" diz **de onde veio o número**: `Windows` (app de desktop),
  `WSL (CLI)` (o `agy` dentro do WSL) ou `Windows + WSL (CLI)` quando é a mesma conta Google.
- **Clicar** em qualquer ação força uma atualização e mostra uma notificação do Windows com
  todos os grupos, janelas e horários de renovação.
- Atualiza sozinho a cada 60 s.

### Mais de uma conta

Se o app de desktop e o CLI estiverem em contas Google diferentes, as três ações fixas mostram
a conta mais perto do limite, com `+1 conta` no balão, e o plugin passa a oferecer ações por
conta (`Antigravity · Uso · WSL (CLI)`, …) para fixar uma específica no ring. A conta é
identificada por um hash curto — o e-mail nunca é exibido nem gravado.

## De onde vêm os dados

O Antigravity **não tem API oficial de uso**. O plugin usa duas fontes, ambas não oficiais —
uma atualização do Antigravity pode quebrá-las:

### 1. App de desktop no Windows — só funciona com o Antigravity aberto

Enquanto o app está aberto, o *language server* local dele (`language_server_windows_x64.exe`)
responde em `127.0.0.1`. O plugin:

1. acha o processo e lê na linha de comando o `--csrf_token` (um único PowerShell oculto por
   varredura, no máximo a cada 30–60 s enquanto o app está fechado);
2. testa as portas em que o processo escuta (https e depois http);
3. chama **somente** `RetrieveUserQuotaSummary` (Antigravity 2.x: grupos com janelas de 5h e
   semanal) e `GetUserStatus` (versões antigas: cota por modelo + nome do plano).

Nas versões antigas (como a 1.19.x) só existe a cota **por modelo**; o plugin junta os modelos
nos dois grupos pelo nome (Gemini × o resto), mostra o modelo mais usado de cada grupo e avisa
no balão com `por modelo`.

Nada é escrito nas pastas do Antigravity; nada além dessas duas chamadas de leitura é enviado;
o certificado autoassinado só é aceito para `127.0.0.1`.

### 2. Antigravity CLI (`agy`) no WSL

Só distros **em execução** são consultadas (`wsl.exe -l --running -q`) — uma distro parada
nunca é acessada (ler o caminho dela a ligaria) e nenhum comando é executado dentro do WSL.
Tudo é leitura pelo compartilhamento `\\wsl.localhost\<distro>\…`.

- **CLI em execução:** o plugin procura o processo em `/proc/<pid>/cmdline`. Um *language
  server* que mostre token e porta na linha de comando é consultado como no desktop. O `agy`
  em si não mostra nenhum dos dois (as ferramentas que o consultam usam `ss`/`lsof` dentro do
  Linux, e a partir do CLI 1.2.2 ele recusa a chamada sem token), então um `agy` rodando serve
  apenas de sinal de que o CLI está em uso.
- **Cota do CLI (caso normal):** a mesma consulta que o `agy -p /usage` faz — a chamada de
  leitura `retrieveUserQuotaSummary` da API Code Assist do Google
  (`daily-cloudcode-pa.googleapis.com`, com `cloudcode-pa.googleapis.com` de reserva), usando o
  login do próprio CLI (`~/.gemini/antigravity-cli/antigravity-oauth-token`).
  - O arquivo do token é **apenas lido**, nunca alterado.
  - Se o token guardado ainda vale, ele é usado. Se expirou, o plugin obtém um novo **em
    memória** com o refresh padrão do Google (que não troca o refresh token, então o login do
    CLI continua intacto). Para isso ele precisa do cliente OAuth do Antigravity, que é lido
    dos arquivos do Antigravity instalados nesta máquina (app de desktop do Windows). Sem o app
    de desktop instalado não há renovação: aparece `token expirado · abra o agy no WSL`.
  - Frequência: no máximo uma rodada por conta por minuto; com o CLI parado, uma a cada
    10 minutos. A primeira rodada faz 2–3 chamadas (renovação, `loadCodeAssist` para o plano,
    cota); depois é 1 chamada por rodada. Nenhum endpoint de geração é chamado, nunca.
  - Se a mesma conta já respondeu pelo app de desktop, a nuvem nem é consultada.

Para desligar: `ORBIT_ANTIGRAVITY_CLOUD=0` (nenhuma chamada à API do Google) ou
`ORBIT_ANTIGRAVITY_REFRESH=0` (usa só o token guardado, sem renovar).

## Estados

| No botão | Balão | Quando |
| :- | :- | :- |
| `…` | `Antigravity · carregando uso…` | antes da primeira leitura |
| `42%` colorido | `Antigravity · Windows · Gemini · 5h 42% …` | dados ao vivo |
| `42%` sem cor | `Antigravity fechado · último valor há 2 h · Windows · …` | fonte indisponível, último valor conhecido |
| `–` | `Antigravity fechado · abra para ver o uso` | app fechado e nada guardado |
| `–` | `Antigravity · uso indisponível (motivo)` | o servidor local não respondeu, recusou o token etc. |

Outros avisos de valor antigo: `WSL parado`, `token expirado · abra o agy no WSL`. Uma janela
cujo horário de renovação já passou aparece como `renovado` (0 %).

## O que fica guardado

`~/.orbit/plugin-data/antigravity-usage.json` — só para mostrar o último valor depois que a
fonte some (ou depois de reiniciar o OrbitRing):

- porcentagens e horários de renovação por grupo/janela, nome do modelo (dados por modelo);
- nome do plano, de onde veio (`Windows`, `WSL (CLI)`), identificador do local;
- um identificador de 8 caracteres por conta (hash) e a hora da leitura.

**Nunca** são gravados nem registrados em log: token CSRF, tokens OAuth, segredo do cliente,
e-mail. Valores com mais de 8 dias deixam de ser exibidos; contas somem após 30 dias.

## Limitações conhecidas

- Sem o app aberto (ou sem o CLI/login no WSL) só há o último valor.
- O servidor do Google às vezes informa 100 % restante independentemente do uso; uma janela
  ainda não aberta aparece como 0 % com a renovação "andando" (sempre daqui a 5h / 7d).
- Em janelas sem identificação (dados por modelo), o nome `5h`/`semana` é deduzido da distância
  até a renovação.
- Quando o servidor omite a fração restante: em `GetUserStatus`, "sem fração + renovação no
  futuro" é tratado como esgotado (é como o próprio Antigravity mostra); no resumo por grupos a
  janela aparece como `?`.
- CLI rodando no WSL: a porta local dele não pode ser descoberta sem executar comandos no WSL,
  então o número do CLI vem sempre da API (até 1 min de atraso).
- É tudo engenharia reversa de interfaces internas: pode parar de funcionar em uma atualização.

## Arquivos

| Arquivo | Papel |
| :- | :- |
| `index.js` | plugin: ciclo de atualização, contas, estados, cache, notificação |
| `quota.js` | interpretação das respostas (todas as formas conhecidas) e formatação |
| `desktop.js` | descoberta do language server no Windows e chamadas locais |
| `cli.js` | WSL: varredura de `/proc`, leitura do login do `agy`, API Code Assist |
| `locations.js` | locais (Windows + distros WSL em execução) — cópia do plugin do Claude |

## Testar

```bash
npm test -w packages/service -- antigravity
```

Os testes são herméticos: processos, portas, HTTP, WSL e a API do Google são injetados; nada
toca o Antigravity, o WSL, `~/.orbit` ou a rede de verdade (há um servidor HTTPS falso com
certificado autoassinado gerado no próprio teste).
