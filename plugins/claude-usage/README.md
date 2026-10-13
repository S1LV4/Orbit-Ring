# Claude Code — plugin do OrbitRing

Duas coisas no ring:

1. **Uso do Claude Code** — ações `Claude · Sessão (5h)` e `Claude · Semana` (arco de progresso + %).
2. **Pedidos de confirmação** — quando o Claude Code pede permissão para usar uma ferramenta,
   aparece um aviso ao lado do cursor ("Claude pede confirmação · abra o ring") e o ring abre com
   um grupo temporário no topo com **Claude · Aprovar** e **Claude · Recusar**.

## Várias contas e vários locais (Windows + WSL)

O plugin procura o login do Claude Code em todos os lugares da máquina:

- **Windows** — `%USERPROFILE%.claude.credentials.json` e `%USERPROFILE%.claude.json`.
- **WSL** — os homes (`/home/*` e `/root`) de cada distro **em execução**, lidos por
  `\wsl.localhost<distro>…`. **Só lê distros em execução**: a lista vem de
  `wsl.exe -l --running -q` e uma distro parada nunca é acessada (ler o compartilhamento dela a
  ligaria). Nada é executado dentro da distro. Se a distro parar depois de vista, os últimos
  números continuam no ring marcados com "WSL parado".

Uma **conta** é o `oauthAccount.accountUuid` (+ organização) do `.claude.json`. A mesma conta
logada no Windows e no WSL conta como uma só (uma consulta por minuto, com o token que vence por
último; se um token for recusado, o do outro local é tentado antes de dizer "sessão expirada").

- **Uma conta**: tudo igual a antes.
- **Duas ou mais**: `Claude · Sessão (5h)` e `Claude · Semana` mostram a conta **mais perto do
  limite** e dizem qual é — ex.: `Claude · WSL (Max 5x) · Sessão 49% · renova em 3h40 · +1 conta`.
  A notificação ao clicar lista todas as contas com as duas faixas. Além disso aparecem ações
  por conta para fixar uma conta específica no ring: `Claude · Sessão · WSL`,
  `Claude · Semana · Windows`… (ids estáveis `session.<id>` / `week.<id>`, onde `<id>` são 8
  caracteres de um SHA-256 da conta). Uma conta que some (ex.: WSL parado ao iniciar) mantém
  as ações por 30 dias, lendo "conta indisponível".

O plugin nunca renova nem grava tokens, não mostra o domínio do e-mail nem ids de organização,
e guarda em `~/.orbit/claude-accounts.json` apenas o id curto e o nome de exibição das contas.

Limitações: o token de um local onde o Claude Code não é aberto há horas expira, e só o próprio
Claude Code o renova; com o WSL parado a conta de lá só é atualizada enquanto o token lido antes
ainda valer; `CLAUDE_CONFIG_DIR` personalizado não é procurado.

## Como funciona

```
Claude Code ──(hook PermissionRequest, stdin JSON)──► hook/orbit-permission-hook.js
      ▲                                                    │ POST http://127.0.0.1:9123/permission
      │ stdout: allow / deny  (ou nada = prompt normal)    ▼   header x-orbit-token
      └──────────────────────────────────────────── plugin (permission.js) ──► aviso no cursor + ring
```

- O plugin sobe um servidor HTTP **só em 127.0.0.1** (porta 9123) e guarda um token aleatório em
  `~/.orbit/claude-hook-token`. Sem o token certo: 401. Requisições com header `Origin`
  (navegador): 403.
- O pedido fica na fila até você escolher no ring. **Aprovar/Recusar respondem sempre o pedido
  mais antigo**; com mais de um na fila, o botão Aprovar mostra a contagem.
- Sem resposta em 60 s, se o OrbitRing estiver fechado ou em qualquer erro, o hook não imprime
  nada e o Claude Code mostra o prompt normal no terminal — o hook nunca trava o Claude Code.
- Se você responder no terminal, o pedido some do ring sozinho.
- `AskUserQuestion` e `ExitPlanMode` não passam pelo ring (precisam de uma resposta digitada).

## Instalar o hook no Claude Code

Use a cópia instalada do plugin (`~/.orbit/plugins/claude-usage`), que é o caminho que fica
gravado nas configurações:

```bash
# 1. ver o que seria alterado (não grava nada)
node ~/.orbit/plugins/claude-usage/hook/install-hook.js

# 2. aplicar (faz backup de ~/.claude/settings.json antes)
node ~/.orbit/plugins/claude-usage/hook/install-hook.js --yes
```

Depois abra uma **nova sessão** do Claude Code (dá para conferir com `/hooks`).

O instalador é idempotente, só mexe na entrada cujo comando contém `orbit-permission-hook.js`
e preserva todo o resto do arquivo. O que ele grava:

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "node \"C:/Users/<você>/.orbit/plugins/claude-usage/hook/orbit-permission-hook.js\"", "timeout": 75 }
        ]
      }
    ]
  }
}
```

Opções: `--settings <arquivo>` (outro settings.json, ex.: `.claude/settings.local.json` de um
projeto) e `--timeout <segundos>`.

### Desinstalar

```bash
node ~/.orbit/plugins/claude-usage/hook/install-hook.js --uninstall         # simulação
node ~/.orbit/plugins/claude-usage/hook/install-hook.js --uninstall --yes   # remove
```

## Testar

### Manual (sem precisar do Claude Code nem do hook instalado)

Com o OrbitRing aberto:

```bash
node ~/.orbit/plugins/claude-usage/hook/simulate-request.js                    # Bash: npm test
node ~/.orbit/plugins/claude-usage/hook/simulate-request.js Edit src/app.ts    # Edit: src/app.ts
node ~/.orbit/plugins/claude-usage/hook/simulate-request.js --health           # só checa o serviço
```

O aviso aparece ao lado do cursor (com um bipe). Abra o ring (botão lateral): o grupo
"Claude · confirmação" está no topo — escolha **Aprovar** ou **Recusar** e o script imprime
`Decisão: APROVADO (allow)` / `RECUSADO (deny)`. Sem resposta em 60 s: `SEM RESPOSTA (ask)`.
Rode dois ao mesmo tempo (dois terminais) para ver a fila e a contagem.

### Automático

```bash
npm test -w packages/service -- claude-permission
```

(`claude-locations` e `claude-accounts` cobrem a descoberta de locais e as várias contas.)

Cobre: pedido → aprovar → `allow`; pedido → recusar → `deny`; timeout → `ask`; fila (mais antigo
primeiro + contagem); token ausente/errado → 401; header `Origin` → 403; cliente que desconecta;
o hook de ponta a ponta (processo real); e o instalador em um `settings.json` temporário.

## Configuração (variáveis de ambiente)

| Variável | Padrão | Quem lê |
| :- | :- | :- |
| `ORBIT_CLAUDE_PORT` | `9123` | plugin e hook (o hook também lê `~/.orbit/claude-hook-port`, que o plugin grava) |
| `ORBIT_CLAUDE_TIMEOUT_MS` | `60000` | plugin — quanto esperar pela decisão antes de devolver `ask` |
| `ORBIT_CLAUDE_HOOK_TIMEOUT_MS` | `70000` | hook — limite próprio do hook |
| `ORBIT_HOME` | `~/.orbit` | plugin e hook — pasta do token (usada nos testes) |

Se a porta estiver ocupada, o plugin registra o problema no log e segue funcionando (uso do
Claude normal; os botões Aprovar/Recusar mostram "aprovações indisponíveis").

## Arquivos

| Arquivo | Papel |
| :- | :- |
| `index.js` | plugin: uso do Claude (contas / locais) + ações `approve` / `decline` + aviso (`host.attention`) |
| `locations.js` | descoberta de locais: home do Windows + homes das distros WSL em execução |
| `permission.js` | servidor HTTP local e fila de pedidos |
| `hook/orbit-permission-hook.js` | hook `PermissionRequest` do Claude Code (sem dependências) |
| `hook/install-hook.js` | instala / remove o hook nas configurações do Claude Code |
| `hook/simulate-request.js` | envia um pedido falso para testar aviso + ring |
