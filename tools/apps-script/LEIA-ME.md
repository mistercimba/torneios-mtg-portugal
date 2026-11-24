# Sincronização automática com Google Apps Script — instalação (≈ 5 minutos)

Um pequeno script na tua conta Google pede ao GitHub para publicar o site **de 30 em 30 minutos** e **sempre que alteras o calendário «Torneios MTG»**. O agendamento do próprio GitHub continua como reserva. Nada muda no site, no workflow ou no calendário.

Ficheiros: `Codigo.gs` (o script) e `appsscript.json` (permissões mínimas).

> **Nunca partilhes o token com ninguém, nem com o Claude.** Só o colas no passo 3, dentro do Apps Script.

## 1. Criar o token no GitHub (2 min)

1. GitHub → foto (canto superior direito) → **Settings** → **Developer settings** (fundo da barra lateral) → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Preencher:
   - **Token name:** `Torneios MTG — Apps Script`
   - **Expiration:** *Custom* → **24/11/2027** (1 ano)
   - **Resource owner:** `mistercimba`
   - **Repository access:** *Only select repositories* → `mistercimba/torneios-mtg-portugal`
   - **Permissions → Repository permissions → Actions:** *Read and write* (o «Metadata: Read-only» é acrescentado sozinho). **Não dar mais nenhuma permissão.**
3. **Generate token** e copiar o token (começa por `github_pat_…`). Só é mostrado uma vez.

## 2. Criar o projecto no Apps Script (2 min)

1. Abrir https://script.google.com (com a conta Google que tem o calendário «Torneios MTG») → **Novo projecto**.
2. Clicar em «Projecto sem título» e dar o nome `Torneios MTG — sincronização`.
3. ⚙️ **Definições do projecto** (barra da esquerda) → marcar **«Mostrar ficheiro de manifesto "appsscript.json" no editor»**.
4. **Editor** (`< >`):
   - abrir `appsscript.json`, apagar tudo e colar o conteúdo de `appsscript.json`;
   - abrir `Código.gs`, apagar tudo e colar o conteúdo de `Codigo.gs`;
   - **Guardar** (ícone da disquete ou Ctrl+S).

## 3. Guardar o token (30 s)

⚙️ **Definições do projecto** → **Propriedades do script** → **Adicionar propriedade do script**:
- **Propriedade:** `GITHUB_TOKEN`
- **Valor:** o token copiado no passo 1

→ **Guardar propriedades do script**.

## 4. Instalar (1 min)

1. **Editor** → na barra de cima, escolher a função **`instalar`** → **Executar**.
2. A Google pede autorização:
   - escolher a tua conta;
   - aparece «A Google não validou esta app» (é normal: o script é teu e só tu o usas) → **Avançadas** → **Aceder a Torneios MTG — sincronização (não seguro)**;
   - confirmar as permissões. Devem ser só três:
     - **Ver os teus calendários** (só para saber que houve alterações; o script não lê nem envia o conteúdo dos eventos);
     - **Ligar a um serviço externo** (para falar com o GitHub);
     - **Permitir que esta aplicação seja executada quando não está presente** (os activadores).
3. No **Registo de execução** deve aparecer:
   - `Activadores criados: de 30 em 30 minutos e ao alterar o calendário «Torneios MTG».`
   - `Sincronização pedida ao GitHub (instalação).`

## 5. Confirmar

- GitHub → **Actions**: aparece uma execução nova «Sincronizar calendário e publicar», iniciada por ti (`workflow_dispatch`), que deve ficar a verde.
- Apps Script → ⏰ **Activadores**: dois activadores (`aCada30Minutos` e `aoAlterarCalendario`).
- Opcional: mudar algo pequeno num evento futuro do calendário → em ~2–5 minutos aparece outra execução no Actions. (O endereço iCal do Google pode demorar alguns minutos a reflectir a alteração; nesse caso, a execução seguinte de 30 em 30 minutos apanha-a.)

## Manutenção

- **Renovar o token (antes de 24/11/2027):** repetir o passo 1 (ou «Regenerate token») e substituir o valor de `GITHUB_TOKEN` no passo 3. Não é preciso executar `instalar` outra vez.
- **Se falhar:** a Google envia um email com o resumo das falhas. A mensagem diz a causa (token expirado, sem permissão, etc.). O site continua no ar com os últimos dados.
- **Desligar:** executar a função `desinstalar` (remove os activadores) e revogar o token no GitHub.
- **Se o token vazar:** GitHub → Settings → Developer settings → Fine-grained tokens → **Revoke**. O token só permite disparar/cancelar publicações e apagar logs do Actions; não lê nem altera código, segredos ou definições.

## Limites (conta Google gratuita)

Uso previsto: ~50–100 pedidos/dia (limite 20 000) e poucos segundos de execução (limite 90 min/dia). Custo: 0 €.
