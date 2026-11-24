# Torneios MTG Portugal — guia de manutenção

Site: https://mistercimba.github.io/torneios-mtg-portugal/
Tudo o que aparece no site vem de três sítios: o **Google Calendar «Torneios MTG»**, as **listas oficiais dos RCQs** (Google Docs) e a **ficha das lojas** (`site/data/stores.json`). Não é preciso mexer no código para o dia-a-dia.

## 1. Acrescentar ou mudar um torneio

1. No Google Calendar «Torneios MTG», cria ou edita o evento seguindo o **template do calendário** (título, data/hora, localização e os campos da descrição: `TIPO`, `FORMATO`, `LOJA`, `LOCALIDADE`, `PRECO`, `CHECKIN`, `JUIZ`, `LIGACAO`, `PREMIOS`…).
2. Regras rápidas:
   - **Hora de início = início do check-in** (ex.: check-in 09h30–10h00 → evento às 09:30). A hora de fim é só um espaço no calendário.
   - **Portugal:** localização com a morada completa (sugestão do Google Maps). **Internacionais:** «Cidade, País» em português (ex.: «Lille, França»).
   - Usa sempre o **mesmo nome para a mesma loja**.
   - Não sabes um valor? Escreve «A confirmar» ou apaga a linha. Nunca inventes.
   - Pré-releases são sempre Sealed (não é preciso `FORMATO`). Os RCQs ganham a round e o «Qualifica para» sozinhos pela data.
3. **Publicar** (passo 3 abaixo). Os torneios acrescentados nos últimos 7 dias aparecem com a etiqueta «Novo».

**Esconder sem apagar:** escreve `SITE: Não` na descrição, ou marca o evento como Privado. **Apagar:** apaga no Calendar (fica 30 dias no lixo).

## 2. Vencedores dos RCQs

Escreve os vencedores nas listas oficiais «RCQs 26/27 R2/R3 STANDARD» (Google Docs), na secção «Vencedores», como já fazes. O site lê-as em cada publicação e mostra-os na página Vencedores e na página da loja. O relatório da publicação diz se as listas e o calendário batem certo.

**Época nova:** acrescentar o documento da lista em `config/site.json` → `rcqLists`, e a janela da round (datas, formato, RC para que apura) em `milestones`.

## 3. Publicar o site (manual)

1. GitHub → repositório `mistercimba/torneios-mtg-portugal` → **Actions**.
2. **«Sincronizar calendário e publicar»** → **Run workflow** → **Run workflow**.
3. Em ~2 minutos fica a verde e o site está actualizado (o rodapé mostra «Última actualização»).

O site também publica sozinho sempre que há alterações ao código. Não há publicação automática por horário (decisão de 24/11/2026).

**Ver o relatório:** abre a execução → resumo. Mostra quantos eventos foram lidos, avisos sobre campos em falta, prémios tirados do texto original e a comparação com as listas dos RCQs.

## 4. Acrescentar ou corrigir uma loja

Edita `site/data/stores.json` no GitHub (ícone do lápis → «Commit changes»). Publica sozinho.

```json
{
  "nome": "Nome da loja",
  "aliases": ["Outro nome usado no calendário"],
  "localidade": "Igual à LOCALIDADE do calendário",
  "morada": "Rua…, código postal Localidade",
  "instagram": "conta_da_loja",
  "facebook": "",
  "site": "https://…"
}
```

A morada e o Instagram aparecem no detalhe do torneio, no «Mapa», no ficheiro de calendário e na página da loja. Se o calendário tiver a morada, vale a do calendário.

## 5. Se alguma coisa falhar

- **Execução a vermelho:** o site anterior **fica no ar**, nada se perde. Abre a execução para ver o passo que falhou:
  - «Ler o Google Calendar (só leitura)» → o endereço secreto mudou ou o Google falhou (tentar outra vez mais tarde); ou o calendário veio com muito menos eventos do que o costume (protecção contra esvaziamento — ex.: calendário errado). Se a descida for de propósito: **Run workflow** com a opção «Publicar mesmo que o nº de eventos caia mais de 50%».
  - «Testes (importador e segurança)» → uma alteração ao código partiu alguma coisa; pedir ao Claude para ver.
  - «Verificar que só vão dados públicos» → apareceu algo privado nos ficheiros do site; não publica até ser corrigido.
- **Um torneio não aparece:** confirma que não está Privado nem com `SITE: Não`, que tem `TIPO`, e que publicaste depois de o criar. O relatório da execução lista avisos por evento.
- **O telemóvel mostra a versão antiga:** recarregar a página (ou fechar e abrir a app).

## 6. Segurança

- O calendário lê-se por um **endereço secreto iCal**, guardado só no segredo `CALENDAR_ICS_URL` do GitHub (Settings → Secrets and variables → Actions). **Nunca o escrevas no código, em documentos ou em mensagens.**
- Se achares que o endereço foi exposto: Google Calendar → definições do calendário «Torneios MTG» → **Integrar calendário** → **Repor** o endereço secreto → copiar o novo para o segredo `CALENDAR_ICS_URL` no GitHub → **Run workflow**.
- Só os campos públicos chegam ao site (o resto da descrição, notas de revisão e IDs do Google ficam de fora). Cada publicação verifica que o endereço secreto não aparece em nenhum ficheiro.

## 7. Onde está cada coisa (para quem mexer no código)

| O quê | Onde |
|---|---|
| Página, estilos, lógica | `site/index.html`, `site/assets/styles.css`, `site/assets/app.js` |
| Leitura do calendário e geração dos dados | `scripts/build-data.mjs`, `scripts/lib/` |
| Janelas das rounds, listas dos RCQs | `config/site.json` |
| Ficha das lojas | `site/data/stores.json` |
| Testes (`npm test`) | `test/` |
| Publicação | `.github/workflows/publicar.yml` |
