# Torneios MTG Portugal

Agenda pública de torneios de Magic: The Gathering em Portugal, gerada automaticamente a partir do Google Calendar «Torneios MTG».

## Como funciona

```
Google Calendar «Torneios MTG»
        │  endereço secreto iCal (só leitura)
        ▼
GitHub Actions — a cada 30 min, num push, ou à mão
  1. testes do importador
  2. scripts/build-data.mjs  →  site/data/events.json  (+ build/review.md)
  3. publica a pasta site/ no GitHub Pages
        ▼
Site estático (HTML + CSS + JS, sem servidor nem base de dados)
```

- **Custo:** 0 € (GitHub Pages + GitHub Actions num repositório público).
- **O calendário nunca é alterado.** O site só lê o ICS.
- **Sem dependências npm.** Só Node 22.
- **Protecção:** se o calendário devolver 0 eventos, ou menos de metade dos da última publicação, a publicação é cancelada e o site mantém a versão anterior.

## Segurança e privacidade

- **Endereço secreto iCal:** existe só no segredo `CALENDAR_ICS_URL` do GitHub. Não está no código, nos ficheiros públicos, nem no histórico do git. Só o passo «Ler o Google Calendar» o recebe; o GitHub mascara-o nos logs e o script nunca o escreve (as mensagens de erro passam por `redact()` e um erro de rede não mostra a causa original).
- **Só dados públicos:** o `events.json` é construído a partir de uma lista explícita de campos (`PUBLIC_FIELDS` em `scripts/build-data.mjs`). Não inclui a descrição crua, o texto de REVER (só um aviso neutro), nem os IDs internos do Google (são substituídos por um hash).
- **Eventos não publicados:** marcados como *Privado* ou *Confidencial* no Google Calendar, com `SITE: Não`, ou cancelados.
- **Verificação final:** antes de cada publicação, `scripts/check-public.mjs` percorre a pasta `site/` e cancela a publicação se encontrar o segredo, um endereço iCal privado ou um campo fora da lista pública.
- **Dados reais fora do repositório:** o `events.json` é gerado no GitHub Actions (não é guardado no git) e os testes usam uma fixture inventada (`test/fixtures/exemplo.ics`). Uma cópia real pode ficar em `test/fixtures/private/`, que é ignorada pelo git.
- **Logs públicos:** num repositório público, os logs e o resumo do Actions são públicos. O relatório de revisão só contém títulos, datas e nomes de campos.
- **Permissões mínimas:** o workflow só tem leitura do repositório; apenas o passo de deploy pode escrever no Pages.
- **Se o endereço secreto for exposto por engano:** no Google Calendar, *Integrar calendário → Repor* o endereço secreto, e actualiza o segredo no GitHub.

## Estrutura

| Caminho | O quê |
|---|---|
| `site/index.html`, `site/assets/` | Interface (base visual da POC v10.3) |
| `site/data/events.json` | Gerado pelo Actions (não está no git) |
| `site/data/winners.json` | Vencedores (manual, por agora) |
| `config/site.json` | Datas de início/fim das rounds de RCQ (marcos na agenda) |
| `scripts/lib/normalize.mjs` | Regras de leitura da descrição, tipos e âmbito |
| `scripts/lib/places.mjs` | Tabela localidade → distrito |
| `scripts/check-public.mjs` | Verificação anti-fuga antes de publicar |
| `test/` | Testes do importador, de segurança e de interface, com fixture inventada |
| `test/ui/harness.mjs` | Mini-cliente do Chrome (sem dependências) para os testes de interface |

## Configuração inicial (uma vez)

1. Criar o repositório no GitHub (público) e enviar este código para o ramo `main`.
2. No Google Calendar: **Definições do calendário «Torneios MTG» → Integrar calendário → Endereço secreto no formato iCal** → copiar. (Não muda nada no calendário.)
3. No GitHub: **Settings → Secrets and variables → Actions → New repository secret**
   - Nome: `CALENDAR_ICS_URL`
   - Valor: o endereço copiado.
4. No GitHub: **Settings → Pages → Source: GitHub Actions**.
5. **Actions → Sincronizar calendário e publicar → Run workflow.** O endereço do site aparece no fim da execução.

Enquanto o segredo não existir, o workflow corre os testes e termina sem publicar nada.

## Manutenção do dia-a-dia

- **Adicionar/alterar torneios:** só no Google Calendar, com o template. O site actualiza em ≤ 30 min (ou corre o workflow à mão).
- **Rever dados:** cada execução mostra o relatório de revisão no resumo do workflow: localidades em falta, eventos com REVER, links reparados, rounds atribuídas pela data, duplicados…
- **Esconder um evento do site sem o apagar:** marcá-lo como *Privado* no Google Calendar, ou escrever `SITE: Não` na descrição.
- **Nova localidade sem distrito:** acrescentar uma linha em `scripts/lib/places.mjs`.
- **Nova round de RCQ:** acrescentar as datas em `config/site.json`.
- **Novo TIPO:** funciona logo com estilo genérico; para lhe dar cor/etiqueta própria, acrescentar ao `TYPE_CATALOG` em `scripts/lib/normalize.mjs` e a cor em `site/assets/app.js`.

## Desenvolvimento local

Os testes de interface abrem o site num Chrome headless (larguras de 320 px a 1280 px, modo claro e escuro, data fixa de 23/11/2026). Correm no GitHub Actions e localmente se houver Chrome instalado; caso contrário são ignorados (`CHROME_PATH` permite indicar outro executável).

```bash
node --test test/*.test.mjs
node scripts/build-data.mjs --input test/fixtures/exemplo.ics        # dados inventados
python3 -m http.server 8000 -d site                                  # abrir http://localhost:8000
```

Nota: o GitHub desactiva workflows agendados em repositórios sem commits durante 60 dias (avisa por email antes). Basta reactivar em **Actions**; uma solução automática está na lista de tarefas.
