# Gemini CLI — plugin do OrbitRing

Cota do **Google Gemini CLI** direto no ring:

| Ação | O que mostra |
| :- | :- |
| `Gemini · Pro` | o modelo **Pro** mais perto do limite |
| `Gemini · Flash` | o modelo **Flash / Flash-Lite** mais perto do limite |
| `Gemini · Uso` | o modelo mais perto do limite, entre todos |

Cada botão desenha o arco de progresso com a **porcentagem usada** (`34%`), verde abaixo de 60 %,
âmbar a partir de 60 % e vermelho acima de 85 %. O balão diz o modelo e quando a cota renova:

```
Gemini · Windows · Pro 34% · gemini-2.5-pro · renova em 5h10
Gemini CLI · não conectado (faça login com `gemini`)
```

Clicar em uma ação atualiza e abre uma notificação do Windows com Pro e Flash, por conta e local.

> **Antigravity é outro plugin.** A cota do Antigravity fica no plugin `antigravity-usage`. Este
> aqui é só para o Gemini CLI (login com conta Google). A pasta `~/.gemini` também é usada pelo
> Antigravity (`~/.gemini/antigravity/`), então ela existir não significa que o Gemini CLI está
> conectado: o que vale é o arquivo `~/.gemini/oauth_creds.json`.

## De onde os números vêm

As mesmas chamadas que o Gemini CLI faz para o `/stats` (API Code Assist):

1. **Token** — `~/.gemini/oauth_creds.json` (`access_token`, `refresh_token`, `expiry_date`).
   O token de acesso do Google vale 1 hora. Quando o guardado já venceu, o plugin obtém um
   novo **só em memória**, usando o `refresh_token` e o cliente OAuth público de "aplicativo
   instalado" do Gemini CLI (o mesmo que está no código aberto do CLI). Refresh tokens do Google
   não são rotativos: isso não altera nem invalida o que o CLI tem guardado. **O arquivo de
   credenciais nunca é gravado** — nada é escrito em `~/.gemini`. Se o Google recusar o
   refresh, o balão mostra `token expirado · abra o Gemini CLI` e o plugin não tenta de novo
   até o arquivo mudar.
2. **Projeto** — `POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist`, que
   devolve `cloudaicompanionProject` (guardado em memória por conta). `GOOGLE_CLOUD_PROJECT` /
   `GOOGLE_CLOUD_PROJECT_ID` são enviados como o CLI envia. O plugin nunca faz o cadastro
   (onboarding): sem projeto, o balão pede para abrir o Gemini CLI.
3. **Cota** — `POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota` com
   `{ "project": "<projeto>" }` → `buckets[] { modelId, tokenType, remainingFraction, resetTime }`.
   Usado % = `100 − remainingFraction × 100`. A fração pode vir como número ou texto; um bucket
   **sem fração é ignorado** (como o CLI faz) — ausente não é zero. Se nenhum modelo do grupo
   tem fração, o botão mostra `–` e `sem cota informada`.

No máximo **uma consulta de cota por conta por minuto**, cada chamada com limite de 5 s. Não há
snapshot local: o Gemini CLI não grava a cota em disco, então tudo aqui é ao vivo. Em uma falha
passageira da API os últimos números continuam por 15 minutos, com a idade (`lido há 5min`).

### Outros modos de login

Sem cota de assinatura para mostrar → `Gemini com chave de API · sem cota para mostrar`:

- `security.auth.selectedType` do `~/.gemini/settings.json` igual a `gemini-api-key` ou
  `vertex-ai` (também o antigo `selectedAuthType`);
- sem login do Google, mas com `GEMINI_API_KEY` / `GOOGLE_API_KEY` em `~/.gemini/.env` ou no
  ambiente do serviço (o ambiente só vale para o Windows, não para o WSL).

## Várias contas e vários locais (Windows + WSL)

- **Windows** — `%USERPROFILE%\.gemini`.
- **WSL** — os homes (`/home/*` e `/root`) de cada distro **em execução**, lidos por
  `\\wsl.localhost\<distro>\…`. **Só lê distros em execução**: a lista vem de
  `wsl.exe -l --running -q` e uma distro parada nunca é acessada (ler o compartilhamento dela a
  ligaria). Nada é executado dentro da distro. Se a distro parar depois de vista, os últimos
  números continuam no ring marcados com `WSL parado`.

Uma **conta** é o e-mail `active` de `~/.gemini/google_accounts.json`, usado apenas como hash
SHA-256 — o endereço nunca é exibido, registrado em log nem gravado. O balão mostra só o local
(`Windows`, `WSL`, `Windows + WSL`). A mesma conta no Windows e no WSL conta como uma só (uma
consulta por minuto, com o token que vence por último).

- **Uma conta**: as três ações mostram essa conta.
- **Duas ou mais**: as ações mostram a conta **mais perto do limite** e dizem qual é — ex.:
  `Gemini · WSL · Pro 90% · gemini-2.5-pro · renova em 5h10 · +1 conta`. A notificação lista
  todas. Além disso aparecem ações por conta para fixar uma conta no ring: `Gemini · Pro · WSL`,
  `Gemini · Flash · Windows`… (ids estáveis `pro.<id>` / `flash.<id>` / `worst.<id>`, com 8
  caracteres de hash). Uma conta que some mantém as ações por 30 dias, lendo "conta indisponível".

O plugin guarda em `~/.orbit/gemini-accounts.json` apenas o id curto e o nome de exibição.

## Limitações

- **O caminho ao vivo não foi verificado em uma conta real**: na máquina onde o plugin foi
  escrito o Gemini CLI não estava conectado. As chamadas, os campos e o tratamento da fração
  seguem o código aberto do Gemini CLI (`packages/core/src/code_assist/{server,oauth2,setup,types}.ts`
  e `config/config.ts`) e estão cobertos por testes com respostas simuladas.
- Credenciais guardadas no cofre do sistema (`GEMINI_FORCE_ENCRYPTED_FILE_STORAGE=true`) não são
  lidas — só o arquivo `oauth_creds.json`.
- Login por Vertex AI, chave de API, Cloud Shell ou credenciais padrão (ADC) não tem cota aqui.
- Com o WSL parado, a conta de lá só é atualizada enquanto o token lido antes ainda valer (ou
  enquanto houver um refresh token em memória).
- Diretórios de configuração personalizados (`GEMINI_CLI_HOME`) e proxy não são considerados.

## Testar

```bash
npm test -w packages/service -- gemini
```

Os testes (`gemini-usage.test.js`, mais `codex-locations.test.js` para a descoberta de locais)
usam pastas temporárias, relógio, HTTP e `wsl.exe` falsos — não tocam em `~/.gemini`, no WSL nem
na rede.

## Arquivos

| Arquivo | Papel |
| :- | :- |
| `index.js` | plugin: leitura das credenciais, token, projeto, cota, contas / locais, estados e notificação |
| `locations.js` | descoberta de locais: home do Windows + homes das distros WSL em execução (cópia do mesmo arquivo dos outros plugins) |
| `common.js` | utilitários (tempo limite, textos, notificação, HTTP, contas lembradas) — cópia idêntica à do plugin `codex-usage` |
| `manifest.json` | id `com.orbitring.gemini` e as ações `pro` / `flash` / `worst` |

## Instalar

Copie a pasta para `~/.orbit/plugins/gemini-usage/` e reinicie o serviço do OrbitRing.
