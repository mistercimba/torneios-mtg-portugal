/**
 * Torneios MTG Portugal — disparador da sincronização (Google Apps Script).
 *
 * Pede ao GitHub Actions que corra o workflow «Sincronizar calendário e publicar»:
 *  - de 30 em 30 minutos;
 *  - sempre que um evento do calendário «Torneios MTG» é criado, alterado ou apagado.
 *
 * Segurança:
 *  - O token do GitHub fica só nas Propriedades do script (GITHUB_TOKEN), nunca neste código.
 *  - O token deve ser fine-grained, só para este repositório e só com «Actions: Read and write».
 *  - Este script não conhece o endereço secreto iCal nem lê o conteúdo dos eventos:
 *    o activador do calendário só diz «houve uma alteração».
 *  - Se algo falhar, a execução fica marcada como falhada e a Google envia por email
 *    o resumo de falhas dos activadores. O site continua no ar com os últimos dados.
 */

const REPO = 'mistercimba/torneios-mtg-portugal';
const WORKFLOW = 'publicar.yml';
const CALENDAR_ID = 'c1716b898c2fef32e8e52f3fdd25043448c3c0a48df006c81d767d0d50a78b85@group.calendar.google.com';
// Várias alterações seguidas no calendário dão um só pedido a cada 3 minutos;
// o que ficar para trás é apanhado pela execução de 30 em 30 minutos.
const INTERVALO_MINIMO_SEGUNDOS = 180;

/** Executar UMA vez depois de colar o código e guardar o token: cria os activadores e testa. */
function instalar() {
  if (!PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN')) {
    throw new Error('Falta o token: Definições do projecto → Propriedades do script → GITHUB_TOKEN.');
  }
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('aCada30Minutos').timeBased().everyMinutes(30).create();
  ScriptApp.newTrigger('aoAlterarCalendario').forUserCalendar(CALENDAR_ID).onEventUpdated().create();
  console.log('Activadores criados: de 30 em 30 minutos e ao alterar o calendário «Torneios MTG».');
  pedirSincronizacao('instalação', true);
}

/** Para testar à mão (botão Executar). */
function testar() { pedirSincronizacao('teste manual', true); }

/** Remove os activadores (para desligar tudo sem apagar o projecto). */
function desinstalar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  console.log('Activadores removidos.');
}

function aCada30Minutos() { pedirSincronizacao('de 30 em 30 minutos', true); }
function aoAlterarCalendario() { pedirSincronizacao('calendário alterado', false); }

/**
 * Chama a API do GitHub («Create a workflow dispatch event») para o ramo main.
 * @param {string} origem texto para o registo de execuções
 * @param {boolean} ignorarIntervalo true para não aplicar o intervalo mínimo
 */
function pedirSincronizacao(origem, ignorarIntervalo) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('Falta o token: Definições do projecto → Propriedades do script → GITHUB_TOKEN.');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) { console.log('Outro pedido em curso; ignorado (' + origem + ').'); return; }
  try {
    const cache = CacheService.getScriptCache();
    if (!ignorarIntervalo && cache.get('ultimo-pedido')) {
      console.log('Pedido recente há menos de 3 minutos; ignorado (' + origem + ').');
      return;
    }
    const resposta = UrlFetchApp.fetch(
      'https://api.github.com/repos/' + REPO + '/actions/workflows/' + WORKFLOW + '/dispatches',
      {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        payload: JSON.stringify({ ref: 'main' }),
      }
    );
    const codigo = resposta.getResponseCode();
    if (codigo === 204) {
      cache.put('ultimo-pedido', String(Date.now()), INTERVALO_MINIMO_SEGUNDOS);
      console.log('Sincronização pedida ao GitHub (' + origem + ').');
      return;
    }
    // Nunca registar o token; a resposta do GitHub não o contém.
    const motivo = {
      401: 'Token inválido, revogado ou expirado — gerar um novo e substituir GITHUB_TOKEN.',
      403: 'Token sem a permissão «Actions: Read and write» neste repositório (ou limite da API atingido).',
      404: 'Repositório ou workflow não encontrado — o token tem acesso a «torneios-mtg-portugal»?',
      422: 'O GitHub recusou o pedido (ramo main ou workflow_dispatch em falta).',
    }[codigo] || ('Resposta inesperada do GitHub: ' + codigo);
    throw new Error(motivo + ' (' + origem + ')');
  } finally {
    lock.releaseLock();
  }
}
