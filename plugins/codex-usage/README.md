# Codex — plugin do OrbitRing

Uso do **OpenAI Codex CLI** direto no ring, como o medidor do Claude:

| Ação | O que mostra |
| :- | :- |
| `Codex · Sessão (5h)` | janela primária do limite (5 horas) |
| `Codex · Semana` | janela secundária (7 dias) |

Cada botão desenha o arco de progresso com a **porcentagem usada** (`67%`), verde abaixo de 60 %,
âmbar a partir de 60 % e vermelho acima de 85 %. O balão diz de onde vem o número:

```
Codex · Windows + WSL (Team) · Sessão 67% · renova em 2h10
Codex · WSL (Team) · Semana 10% · renova em 19h15 · lido há 6 dias
Codex · WSL (Team) · Sessão 0% · sem uso desde 07/10 05:34
```

Clicar em uma ação atualiza e abre uma notificação do Windows com as duas janelas, o plano, os
créditos (quando a conta tem) e de onde o dado veio, por conta e local.

## De onde os números vêm

O plugin é **somente leitura**: nunca grava nada em `~/.codex` e **nunca renova o token** do
Codex (os refresh tokens da OpenAI são rotativos — renovar sem gravar derrubaria o login do
Codex). O `refresh_token` nem é lido para uso; a única requisição que o plugin faz é a de uso
abaixo.

1. **Ao vivo** — o mesmo endpoint que o Codex usa no `/status`:
   `GET https://chatgpt.com/backend-api/wham/usage`, com `Authorization: Bearer <access_token>`
   e `ChatGPT-Account-Id: <account_id>` lidos de `~/.codex/auth.json`.
   Só é chamado quando o `access_token` guardado é um JWT cujo `exp` ainda está no futuro (o
   JWT é decodificado localmente, sem verificação). No máximo **uma chamada por conta por
   minuto**, com limite de 5 s. Se o servidor responder 401/403, o plugin para de chamar com
   aquele arquivo até o `auth.json` mudar (ou seja, até o próprio Codex renovar o token).
2. **Snapshot local** — o objeto `rate_limits` mais recente que o Codex gravou nos logs de
   sessão `~/.codex/sessions/AAAA/MM/DD/rollout-*.jsonl` (e `archived_sessions/`). O plugin
   olha só os 8 arquivos mais novos e lê apenas os últimos 256 KB de cada um, com cache por
   data de modificação. Esse dado é **tão recente quanto a última vez que o Codex rodou ali**,
   por isso o balão mostra a idade (`lido há 6 dias`). Se o `resets_at` da janela já passou, a
   janela renovou desde então: o botão mostra **0 %** e `sem uso desde <quando foi lido>`, e não
   a porcentagem velha. Um snapshot mais antigo que a própria janela aparece sem cor.

Vale sempre o dado mais novo dos dois. Uma janela ainda não usada vem do servidor como "0 %,
renova daqui a uma janela inteira"; nesse caso o balão mostra só `0%`, sem contagem.

## Várias contas e vários locais (Windows + WSL)

O plugin procura o Codex em todos os lugares da máquina:

- **Windows** — `%USERPROFILE%\.codex`.
- **WSL** — os homes (`/home/*` e `/root`) de cada distro **em execução**, lidos por
  `\\wsl.localhost\<distro>\…`. **Só lê distros em execução**: a lista vem de
  `wsl.exe -l --running -q` e uma distro parada nunca é acessada (ler o compartilhamento dela a
  ligaria). Nada é executado dentro da distro. Se a distro parar depois de vista, os últimos
  números continuam no ring marcados com `WSL parado`.

Uma **conta** é o `tokens.account_id` do `auth.json`. A mesma conta logada no Windows e no WSL
conta como uma só (`Windows + WSL`): uma consulta ao vivo por minuto, com o token que vence por
último, e o snapshot mais recente entre os dois locais.

- **Uma conta**: as duas ações mostram essa conta.
- **Duas ou mais**: `Sessão` e `Semana` mostram a conta **mais perto do limite** e dizem qual é
  — ex.: `Codex · WSL (Team) · Sessão 80% · renova em 4h00 · +1 conta`. A notificação lista
  todas. Além disso aparecem ações por conta para fixar uma conta no ring:
  `Codex · Sessão · WSL`, `Codex · Semana · Windows`… (ids estáveis `session.<id>` /
  `week.<id>`, onde `<id>` são os 8 primeiros caracteres do SHA-256 do id da conta). Uma conta
  que some (ex.: WSL parado ao iniciar) mantém as ações por 30 dias, lendo "conta indisponível".
- **Login por chave de API** (`OPENAI_API_KEY` no `auth.json`, sem tokens): não existe cota de
  assinatura para mostrar → `Codex com chave de API · sem cota para mostrar`.
- **Sem login**: `Codex · não conectado (faça login com \`codex\`)`.

O id da conta, tokens e e-mail nunca são exibidos, registrados em log nem gravados. O plugin
guarda em `~/.orbit/codex-accounts.json` apenas o id curto e o nome de exibição ("Windows",
"WSL") das contas.

## Limitações

- O dado ao vivo depende de um `access_token` ainda válido. O Codex o renova sozinho quando é
  usado; em um local onde o Codex não roda há muitos dias o token expira e sobra o snapshot local
  (com a idade no balão). Abrir o Codex resolve.
- O snapshot local não diz de qual conta é: ele é atribuído à conta logada hoje naquele local.
  Se você trocou de conta ali e ainda não rodou o Codex, o snapshot é da conta anterior.
- Os bancos SQLite do Codex (`state_*.sqlite`, `logs_*.sqlite`) não são lidos — o plugin não tem
  dependências.
- `CODEX_HOME` personalizado e `chatgpt_base_url` do `config.toml` não são considerados.
- Limites adicionais (`additional_rate_limits`, revisão de código) não são mostrados; só o
  limite principal `codex`, que é o que o `/status` mostra primeiro.

## Testar

```bash
npm test -w packages/service -- codex
```

Os testes (`codex-usage.test.js`, `codex-locations.test.js`) usam pastas temporárias, relógio,
HTTP e `wsl.exe` falsos — não tocam em `~/.codex`, no WSL nem na rede. Entre outras coisas eles
garantem que nenhuma requisição vai para um endpoint de token.

## Arquivos

| Arquivo | Papel |
| :- | :- |
| `index.js` | plugin: leitura do `auth.json` e dos rollouts, consulta ao vivo, contas / locais, estados e notificação |
| `locations.js` | descoberta de locais: home do Windows + homes das distros WSL em execução (cópia do mesmo arquivo dos outros plugins) |
| `common.js` | utilitários (tempo limite, textos, notificação, HTTP, contas lembradas) — cópia idêntica à do plugin `gemini-usage` |
| `manifest.json` | id `com.orbitring.codex` e as ações `session` / `week` |

## Instalar

Copie a pasta para `~/.orbit/plugins/codex-usage/` e reinicie o serviço do OrbitRing.
