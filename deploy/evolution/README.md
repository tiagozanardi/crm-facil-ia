# Evolution API na Google Cloud (Always Free) — runbook

> Objetivo: deixar a Evolution API **sempre no ar, com HTTPS e custo R$ 0**, para o CRM
> conectar o WhatsApp. Este runbook é o passo a passo operacional da Fase 11
> ([plano completo](../../docs/features/11-integracao-evolution-api.md)).

---

## 0. Resumo em 1 minuto

| O quê | Onde roda | Custo |
|---|---|---|
| Evolution API v2.3.7 (WhatsApp) | VM `e2-micro` na Google Cloud | R$ 0 (Always Free) |
| Banco da Evolution | Postgres 16 no mesmo VM (Docker) | R$ 0 |
| HTTPS + TLS | Caddy 2 no mesmo VM + subdomínio DuckDNS | R$ 0 |
| Backend do CRM + webhook | Vercel (já existe) | R$ 0 no Hobby |
| Banco do CRM | Supabase (já existe) | R$ 0 |

**Tempo total:** ~40 minutos, sendo ~25 de tarefas suas e ~15 de automação.

---

## 1. Divisão de trabalho (quem faz o quê)

| # | Etapa | Quem | Tempo | Precisa de você porque… |
|---|---|---|---|---|
| A | Conta Google Cloud, faturamento, projeto e VM | 🧑 **você** | 15 min | exige seu cartão, sua identidade e aceite de termos |
| B | Subdomínio gratuito no DuckDNS | 🧑 **você** | 5 min | exige login na sua conta DuckDNS |
| C | Rodar o `bootstrap.sh` (4 comandos) | 🧑 **você** | 15 min | é a sua VM; você cola os comandos no SSH do navegador |
| D | Verificação técnica (HTTPS, auth, containers) | 🤖 **eu** | 2 min | eu chamo a API pública daqui, com a chave do `.env` local |
| E | Variáveis de ambiente no CRM (Vercel) | 🧑 **você** | 5 min | eu não tenho login no seu painel Vercel |
| F | Criar a instância `crm-malas-slz` + QR Code | 🤖 **eu** + 🧑 (escaneia) | 5 min | o QR precisa do celular com o chip na mão |
| G | Implementar a Onda 1 (webhook, envio, tela de conexão) | 🤖 **eu** | sessões | é código do repo |
| H | Teste ponta a ponta com o número do piloto | 🤖 + 🧑 | 30 min | precisa enviar mensagens reais |

**O que eu NÃO consigo fazer:** criar/autenticar a conta Google, aceitar cobrança, comprar/ativar o chip,
escanear o QR, e mexer no painel da Vercel. Tudo o resto (arquivos, scripts, código, testes de API,
diagnóstico) é comigo.

> **Modo turbo (opcional):** se você quiser, eu gero um par de chaves SSH e você cola a pública no campo
> "Chaves SSH" da VM no console. Aí eu consigo operar a VM diretamente (logs, restart, ajustes) em vez de
> te pedir para colar saídas. Dá para remover a chave no fim da configuração.

---

## 2. Arquitetura na VM

```
Internet
   │  443 (HTTPS) e 80 (ACME)
   ▼
[Caddy]  ── rede interna Docker ──▶ [evolution-api:8080]
                                        │
                                        ├──▶ [postgres:5432]   (sessão + config)
                                        └──▶ volume /evolution/instances
```

- Só **80** e **443** ficam expostos; a porta **8080 não é publicada**.
- Sem Redis (cache em memória) para economizar RAM.
- Sessão do WhatsApp salva no Postgres (`DATABASE_SAVE_DATA_INSTANCE=true`): reiniciar o container
  **não** pede QR de novo.
- Webhook é configurado **por instância**, via API, com header secreto — não é global.

---

## 3. Decisões já fixadas (e o porquê)

| Decisão | Valor | Por quê |
|---|---|---|
| Região | `us-east1` (zona `us-east1-b`) | é uma das 3 regiões do Always Free e a mais próxima do Brasil |
| Máquina | `e2-micro` (2 vCPU compartilhadas, 1 GB) | é o tipo coberto pelo nível gratuito |
| Disco | 30 GB, disco permanente **padrão** | limite do Always Free |
| Sistema | Ubuntu 24.04 LTS | suporte longo, Docker trivial |
| Versão da Evolution | **v2.3.7** (fixa) | última estável **sem ativação de licença** (2.4+ exige) e posterior à 2.3.5, onde o CVE-2026-91997 foi reportado; 8080 fechada e `/manager` bloqueado como defesa extra |
| Banco da Evolution | Postgres local em Docker | não depende do Supabase nem de free tier que pausa |
| Cache | memória (`CACHE_LOCAL_ENABLED=true`) | ~80 MB de RAM a menos |
| TLS | Caddy + Let's Encrypt | certificado automático e renovação sozinha |
| DNS | DuckDNS | subdomínio grátis, sem cartão e sem comprar domínio |
| Interface `/manager` | bloqueada no Caddy | não é usada pelo CRM e amplia a superfície de ataque |

---

## 4. Fase A — conta, projeto e VM (🧑 você, ~15 min)

### A1. Conta e faturamento

1. Acesse <https://console.cloud.google.com> e entre com sua conta Google.
2. Se for conta nova, aceite o teste gratuito (US$ 300 por 90 dias) — **não é necessário** para o
   `e2-micro`, mas o cartão é obrigatório para verificação.
3. Em **Faturamento**, confira se existe uma conta de faturamento ativa vinculada ao projeto.
   O `e2-micro` + 30 GB + 1 GB de egress/mês ficam em **R$ 0** mesmo depois do teste.

### A2. Projeto

1. No topo, clique no seletor de projeto → **Novo projeto**.
2. Nome: `crm-facil-ia` → **Criar** (anote o ID, algo como `crm-facil-ia-482913`).
3. Com o projeto selecionado, vá em **Faturamento → Orçamentos e alertas → Criar orçamento**:
   - Nome: `alerta-custo-zero`
   - Escopo: **Projeto** → `crm-facil-ia`
   - Valor: **R$ 1**
   - Alertas: 50%, 90%, 100% (padrão)
   - **Concluir**.
   > O alerta não bloqueia gastos, só avisa por e-mail. Serve para detectar qualquer cobrança inesperada.

### A3. VM

1. Menu → **Compute Engine → Instâncias de VM**. Se pedir para ativar a API, clique em **Ativar**
   (leva ~1 min).
2. Clique em **Criar instância** e preencha **exatamente**:

| Campo | Valor |
|---|---|
| Nome | `evolution-api` |
| Região | `us-east1` (Carolina do Sul) |
| Zona | `us-east1-b` |
| Série | `E2` |
| Tipo de máquina | `e2-micro` (2 vCPU, 1 GB) — deve aparecer "elegível para o nível gratuito" |
| Disco de inicialização → SO | `Ubuntu 24.04 LTS` |
| Tipo de disco | `Disco permanente padrão` |
| Tamanho | `30 GB` |
| Firewall | marcar **Permitir tráfego HTTP** e **Permitir tráfego HTTPS** |
| Conta de serviço | `Nenhuma conta de serviço` (menos privilégios) |

3. **Criar** e aguarde ~1 min. Anote o **IP externo** (algo como `34.xx.xx.xx`).
4. (Opcional, segurança) Em **VPC network → Firewall**, edite `default-allow-ssh` e troque a origem
   `0.0.0.0/0` por `35.235.240.0/20` (faixa do IAP). O botão **SSH** do console continua funcionando.
   > Só faça isso se for usar o SSH do navegador; se travar, é reversível no mesmo lugar.

### A4. Abrir o terminal

Na lista de VMs, clique em **SSH** na linha da `evolution-api`. Abre um terminal no navegador.
Na primeira vez pode levar ~30 s.

---

## 5. Fase B — DuckDNS (🧑 você, ~5 min)

1. Acesse <https://www.duckdns.org> e entre com GitHub/Google.
2. Crie o subdomínio `crm-evo-malas` (só letras minúsculas, números e hífen).
3. Copie o **token** que aparece no topo da página (você vai colar no comando da Fase C).
4. (Opcional) No campo `current ip`, coloque o IP da VM e clique em **update ip**.
   O `bootstrap.sh` também atualiza sozinho e instala um cron de 5 em 5 minutos.

Domínio final: `crm-evo-malas.duckdns.org` (pode trocar o nome, desde que use o mesmo nos comandos).

---

## 6. Fase C — bootstrap (🧑 você cola 4 comandos, ~15 min)

No terminal SSH da VM:

```bash
sudo apt-get update && sudo apt-get install -y git
sudo git clone https://github.com/tiagozanardi/crm-facil-ia.git /opt/crm-facil-ia
cd /opt/crm-facil-ia/deploy/evolution
sudo DOMAIN=crm-evo-malas.duckdns.org DUCKDNS_TOKEN=COLE_SEU_TOKEN_AQUI bash bootstrap.sh
```

O script faz, em ordem:

1. instala pacotes básicos, ajusta o fuso para `America/Sao_Paulo`;
2. cria 2 GB de swap (a VM tem 1 GB de RAM);
3. instala Docker + Compose;
4. copia `docker-compose.yml`, `Caddyfile` e gera o `.env` com **segredos aleatórios**
   (senha do Postgres com 48 caracteres e API key com 64);
5. libera 22/80/443 no UFW;
6. aponta o DuckDNS e instala o cron de atualização;
7. baixa as imagens e sobe `postgres`, `evolution-api` e `caddy`;
8. espera o HTTPS responder e imprime a URL + API key;
9. instala o backup diário (03:30, retenção de 7 dias).

**Saída esperada no final** (o `Status` pode demorar até 3 min no primeiro boot):

```
============================================================
 Evolution API — instalação concluída
============================================================
 URL........: https://crm-evo-malas.duckdns.org
 IP público.: 34.xx.xx.xx
 Pasta......: /opt/evolution
 API key....: 5f0c... (64 caracteres)
 Status.....: HTTPS respondendo
```

> Guarde essa API key. Ela também está em `/opt/evolution/.env` (permissão 600).
> **Não** mande a chave no chat: coloque no `.env` local do CRM (arquivo ignorado pelo Git).

Se o status não ficar pronto, o próprio script imprime o comando de log. Veja a seção 11.

---

## 7. Fase D — verificação (🤖 eu)

Com a URL e a chave no `.env` local (`EVOLUTION_API_URL` / `EVOLUTION_API_KEY`), eu rodo:

```powershell
pwsh -File scripts/check-evolution.ps1
```

O script confere sem imprimir a chave:

1. endpoint raiz (TLS, versão `2.3.7`);
2. autenticação por `apikey` e lista de instâncias (deve vir `[]` antes da primeira).

Também verifico por dentro da VM (você cola, se necessário):

```bash
cd /opt/evolution
docker compose ps          # 3 serviços "running" (postgres "healthy")
free -h                    # swap de 2 GB disponível
df -h /                    # disco com folga
```

---

## 8. Fase E — variáveis no CRM (🧑 você, ~5 min)

No painel da Vercel → projeto do CRM → **Settings → Environment Variables**, adicione
(Production e Preview) e depois faça **Redeploy**:

| Variável | Valor |
|---|---|
| `EVOLUTION_ENABLED` | `false` por enquanto (vira `true` quando a Onda 1 estiver deployada) |
| `EVOLUTION_API_URL` | `https://crm-evo-malas.duckdns.org` |
| `EVOLUTION_API_KEY` | a API key gerada no bootstrap |
| `EVOLUTION_WEBHOOK_SECRET` | qualquer segredo forte (ex.: `openssl rand -hex 24`) — o mesmo vai no webhook |
| `EVOLUTION_INSTANCE_PREFIX` | `crm` (nomes ficam `crm-malas-slz`) |
| `API_AUTH_TOKEN` | token das rotas de escrita (gera na Onda 1/3) |

As mesmas variáveis vão no `.env` local (o arquivo é gitignored).

---

## 9. Fase F — criar a instância e conectar o WhatsApp (🤖 eu + 🧑)

Depois da Onda 1 no ar:

1. Eu chamo `POST /api/whatsapp/instance` → cria `crm-malas-slz` na Evolution, configura o webhook
   (`https://<crm>/api/webhooks/evolution`, header secreto, eventos `MESSAGES_UPSERT`,
   `CONNECTION_UPDATE`, `QRCODE_UPDATED`, `MESSAGES_UPDATE`, `SEND_MESSAGE`).
2. O CRM mostra o QR Code na tela **Configurações → Conexão WhatsApp**.
3. 🧑 Você abre o WhatsApp do **chip dedicado** → Configurações → **Dispositivos conectados** →
   Conectar dispositivo → escaneia.
4. Status vira `CONNECTED` e o número aparece na tela.
5. 🧑 Você manda uma mensagem de outro celular para o chip; em até 5 s ela aparece no CRM.

> O chip continua funcionando normalmente no celular (é um dispositivo vinculado, como o WhatsApp Web).
> Responder pelo celular é o gatilho para a IA pausar 24h.

---

## 10. Operação do dia a dia

```bash
cd /opt/evolution

docker compose ps                       # status
docker compose logs -f --tail=100 evolution-api   # logs ao vivo
docker compose restart evolution-api    # reiniciar sem perder sessão
docker compose pull && docker compose up -d       # atualizar (mude a tag antes, de propósito)
docker system df                        # espaço usado por imagens/volumes
docker image prune -f                   # limpar imagens antigas
```

**Backup:** roda sozinho às 03:30 em `/var/backups/evolution` (7 dias).
Restaurar (com a Evolution parada):

```bash
cd /opt/evolution
docker compose stop evolution-api
docker exec -i evolution_postgres pg_restore -U evolution -d evolution --clean --if-exists < /var/backups/evolution/ARQUIVO.dump
docker compose start evolution-api
```

**Monitoramento grátis:** crie um monitor HTTP no [UptimeRobot](https://uptimerobot.com) para
`https://crm-evo-malas.duckdns.org/` a cada 5 min, com alerta por e-mail. Ele avisa se a VM cair.

**Trocar a senha do Postgres:** não faça no `.env` sem recriar o volume — o Postgres guarda a senha
antiga. O caminho seguro é `docker compose down`, editar `.env` e subir de novo só se o volume for novo.

---

## 11. Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `docker compose ps` mostra `restarting` | erro de config/banco | `docker compose logs --tail=200 evolution-api` |
| Caddy responde `502` | Evolution ainda subindo (1–3 min) ou caiu | espere e veja o log da `evolution-api` |
| Erro de certificado / `ACME` | DNS não aponta para a VM | `getent hosts SEU-DOMINIO`; atualize o DuckDNS e `docker compose restart caddy` |
| `EACCES`/`password authentication failed` no Postgres | senha do `.env` diferente da do volume | recriar o volume (`docker compose down -v`) **apenas** se não houver sessão para preservar |
| Container morre com código `137` | falta de memória | `free -h`; confirme o swap; `docker stats`; reduza limites se necessário |
| `prisma migrate` falha no boot | Postgres ainda não saudável | o `depends_on: condition: service_healthy` já cobre; se persistir, veja o log do Postgres |
| Porta 80 não responde | firewall do GCP sem HTTP | confira os checkboxes HTTP/HTTPS na VM |
| VM reiniciou e o IP mudou | IP efêmero | o cron do DuckDNS corrige em até 5 min |

---

## 12. Custos e limites do nível gratuito

**Coberto (R$ 0):**
- 1 × `e2-micro` por mês nas regiões `us-west1`, `us-central1` ou `us-east1`;
- 30 GB de disco permanente padrão;
- 1 GB de egress de rede por mês saindo da América do Norte (nossos webhooks são texto: ~100 MB/mês);
- firewall e VPC (gratuitos); snapshots **não** estão inclusos e custam por GB.

**Pode gerar cobrança (evite):**
- sair da `e2-micro` ou das 3 regiões gratuitas;
- disco acima de 30 GB ou tipo SSD/balanceado;
- IP estático reservado e não usado;
- snapshots automáticos;
- egress acima de 1 GB/mês (mídia grande, backup para fora da VM).

**Fora da VM:** Vercel Hobby é para uso pessoal; quando o CRM virar produto comercial, o plano Pro
(US$ 20/mês) é o adequado.

---

## 13. Segurança

- [x] Porta 8080 não publicada (só Caddy fala com a Evolution).
- [x] `/manager` e `/docs` bloqueados no Caddy.
- [x] API key de 64 caracteres gerada por `openssl`.
- [x] `.env` com permissão 600; nenhum segredo no Git.
- [x] UFW liberando só 22, 80 e 443.
- [x] SSH pelo console/IAP (opcionalmente restrito à faixa do IAP).
- [x] Backup diário do banco.
- [ ] Rotacionar a API key se ela vazar (`/opt/evolution/.env` + env do CRM).
- [ ] Ativar 2FA na conta Google que administra a VM.

---

## 14. Limitações e quando sair daqui

- **1 GB de RAM:** suficiente para texto e para 1 loja (1 a 5 atendentes). Áudio/transcrição e mídia
  pesada pedem upgrade de máquina.
- **v2.3.7 não fala a API oficial (Meta Cloud API).** Se um dia o WhatsApp oficial for necessário,
  o caminho é subir para 2.4.x e ativar a **licença community gratuita** (login único no navegador).
- **Sem alta disponibilidade:** é 1 VM. Se cair, cai o atendimento. O UptimeRobot avisa e o Docker
  reinicia os containers sozinho; para HA de verdade, o caminho é VPS paga ou PaaS.
- **WhatsApp não oficial:** risco de ban existe (ver seção 12 do plano). Número dedicado e volume
  baixo são a mitigação.
