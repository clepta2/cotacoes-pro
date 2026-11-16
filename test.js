import { CotacoesPro } from './cotacoes-pro.js';
import worker from './worker.js';

console.log('🧪 Iniciando Bateria de Testes do CotacoesPro API & SDK Oficial...\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    passCount++;
    console.log(`  ✅ ${message}`);
  } else {
    failCount++;
    console.error(`  ❌ FALHA: ${message}`);
    throw new Error(message);
  }
}

// ─── 1. RESOLUÇÃO DE AUTENTICAÇÃO RFC 6750 & MATRIZ DE PLANOS ───
console.log('--- 1. Padrão de Autenticação RFC 6750 & Resolução de Nível ---');

// 1.1 Requisição anônima (sem chave) deve assumir plano Free
const resFree = await worker.fetch(new Request('https://api.test/api/cotacoes/USD'), {});
assert(resFree.status === 200, 'Requisição anônima responde HTTP 200');
assert(resFree.headers.get('x-cotacoes-plan') === 'free', 'Requisição anônima recebe plano free');
assert(resFree.headers.get('x-cotacoes-ratelimit-limit') === '30', 'Plano free tem limite de 30 RPM');

// 1.2 Requisição com chave Starter
const resStarter = await worker.fetch(new Request('https://api.test/api/cotacoes/USD', {
  headers: { 'Authorization': 'Bearer cot_start_live_sandbox123' }
}), {});
assert(resStarter.headers.get('x-cotacoes-plan') === 'starter', 'Token cot_start_ resolve plano starter');
assert(resStarter.headers.get('x-cotacoes-ratelimit-limit') === '60', 'Plano starter tem 60 RPM');

// 1.3 Requisição com chave Pro via x-api-key
const resPro = await worker.fetch(new Request('https://api.test/api/cotacoes/USD', {
  headers: { 'x-api-key': 'cot_pro_live_sandbox456' }
}), {});
assert(resPro.headers.get('x-cotacoes-plan') === 'pro', 'Header x-api-key cot_pro_ resolve plano pro');
assert(resPro.headers.get('x-cotacoes-ratelimit-limit') === '300', 'Plano pro tem 300 RPM');

// 1.4 Requisição com chave Business
const resBiz = await worker.fetch(new Request('https://api.test/api/cotacoes/USD', {
  headers: { 'Authorization': 'Bearer cot_biz_enterprise789' }
}), {});
assert(resBiz.headers.get('x-cotacoes-plan') === 'business', 'Token cot_biz_ resolve plano business');
assert(resBiz.headers.get('x-cotacoes-ratelimit-limit') === '1200', 'Plano business tem 1200 RPM');

// 1.5 Requisição com chave Master Admin
const resMaster = await worker.fetch(new Request('https://api.test/api/cotacoes/USD', {
  headers: { 'Authorization': 'Bearer cot_master_admin_root' }
}), {});
assert(resMaster.headers.get('x-cotacoes-plan') === 'master', 'Token cot_master_ resolve plano master');
assert(resMaster.headers.get('x-cotacoes-ratelimit-limit') === '3000', 'Plano master tem 3000 RPM');

// ─── 2. TESTE DE RATE LIMITING DINÂMICO & HTTP 429 ───
console.log('\n--- 2. Rate Limiting Dinâmico & Bloqueio HTTP 429 ---');

const testKey = 'cot_free_overflow_test_key';
let atingiu429 = false;
let retryAfterHeader = null;

// Esgota as 30 requisições do plano free
for (let i = 0; i < 35; i++) {
  const r = await worker.fetch(new Request('https://api.test/api/cotacoes/USD', {
    headers: { 'Authorization': `Bearer ${testKey}` }
  }), {});
  if (r.status === 429) {
    atingiu429 = true;
    retryAfterHeader = r.headers.get('Retry-After');
    const body429 = await r.json();
    assert(body429.error === 'RATE_LIMIT_EXCEEDED', 'Retorno de erro estruturado RATE_LIMIT_EXCEEDED');
    assert(body429.plano === 'free', 'Identifica o plano no erro 429');
    break;
  }
}
assert(atingiu429 === true, 'Rate limiter bloqueia após ultrapassar RPM do plano com HTTP 429');
assert(retryAfterHeader !== null, `Cabeçalho Retry-After presente (${retryAfterHeader}s)`);

// ─── 3. MASTER FEED & CONSULTA DE ATIVOS ───
console.log('\n--- 3. Master Feed Consolidado & Ativos Múltiplos ---');

const resFeed = await worker.fetch(new Request('https://api.test/api/cotacoes'), {});
const feedData = await resFeed.json();
assert(feedData.ok === true, 'Master feed retorna ok: true');
assert(feedData.totalAtivos >= 60, 'Master feed possui mais de 60 ativos consolidados');
assert(feedData.fiat.USD !== undefined, 'Dólar comercial presente');
assert(feedData.crypto.BTC !== undefined, 'Bitcoin presente');
assert(feedData.indicesBrasil.SELIC !== undefined, 'Taxa Selic presente');
assert(feedData.commoditiesAgro.SOJA !== undefined, 'Soja presente');

// ─── 4. CONSULTA INDIVIDUAL & HISTÓRICO ───
console.log('\n--- 4. Consulta Individual & Histórico de Preços ---');

const resUsd = await worker.fetch(new Request('https://api.test/api/cotacoes/USD?periodo=30d'), {});
const usdData = await resUsd.json();
assert(usdData.ok === true, 'Consulta de USD retorna ok');
assert(usdData.dados.cotacao > 0, `Cotação USD válida: R$ ${usdData.dados.cotacao}`);
assert(usdData.historico !== undefined, 'Histórico de 30 dias retornado');
assert(usdData.historico.fechamentos.length > 0, 'Histórico possui série de fechamentos');

// 4.1 Histórico MAX desde o Plano Real (1994)
const resMax = await worker.fetch(new Request('https://api.test/api/cotacoes/USD?periodo=max'), {});
const maxData = await resMax.json();
assert(maxData.historico.desde === '1994-07-01', 'USD MAX inicia em 1994 (Plano Real)');
assert(maxData.historico.totalPontos >= 10, 'USD MAX contém marcos históricos consolidados');

// ─── 5. CONVERSOR UNIVERSAL COM IOF ───
console.log('\n--- 5. Conversor Universal de Câmbio ---');

const resConv = await worker.fetch(new Request('https://api.test/api/cotacoes/converter?de=USD&para=BRL&valor=100&iof=4.38'), {});
const convData = await resConv.json();
assert(convData.ok === true, 'Conversor retorna ok: true');
assert(convData.conversao.valorOriginal === 100, 'Valor original preservado');
assert(convData.conversao.iofPercentual === 4.38, 'IOF percentual aplicado');
assert(convData.conversao.valorConvertido > 0, `Valor convertido: R$ ${convData.conversao.valorConvertido}`);
assert(convData.conversao.totalFinalComIof > convData.conversao.valorConvertido, 'Total final inclui IOF');

// ─── 6. RENDERIZAÇÃO VETORIAL SVG TICKER ANYCAST ───
console.log('\n--- 6. Gráficos Vetoriais SVG Anycast (<5ms) ---');

const resSvg = await worker.fetch(new Request('https://api.test/api/cotacoes/USD?formato=svg'), {});
assert(resSvg.status === 200, 'Rota SVG retorna HTTP 200');
assert(resSvg.headers.get('Content-Type').includes('image/svg+xml'), 'Content-Type é image/svg+xml');
const svgText = await resSvg.text();
assert(svgText.includes('<svg') && svgText.includes('</svg>'), 'Payload é um SVG válido');
assert(svgText.includes('USD'), 'SVG contém o símbolo USD');

// ─── 7. TRATAMENTO TIPADO DE ERROS ───
console.log('\n--- 7. Tratamento Tipado de Erros (404 Not Found) ---');

const resInvalido = await worker.fetch(new Request('https://api.test/api/cotacoes/MOEDA_INEXISTENTE'), {});
assert(resInvalido.status === 404, 'Ativo inexistente retorna HTTP 404');
const errData = await resInvalido.json();
assert(errData.error === 'ASSET_NOT_FOUND', 'Erro tipado ASSET_NOT_FOUND');

// ─── 8. SDK CLIENTE OFICIAL ───
console.log('\n--- 8. Validação do SDK Cliente Oficial (CotacoesPro) ---');

CotacoesPro.configure({
  baseUrl: 'https://api.test',
  apiKey: 'cot_pro_live_sdk_test'
});
assert(CotacoesPro.baseUrl === 'https://api.test', 'Configuração de baseUrl no SDK');
assert(CotacoesPro.apiKey === 'cot_pro_live_sdk_test', 'Configuração de apiKey no SDK');
assert(typeof CotacoesPro.consultar === 'function', 'Método CotacoesPro.consultar disponível');
assert(typeof CotacoesPro.converter === 'function', 'Método CotacoesPro.converter disponível');
assert(typeof CotacoesPro.getMasterFeed === 'function', 'Método CotacoesPro.getMasterFeed disponível');


// ─── 9. TELEMETRIA & PROTEÇÃO DIÁRIA DE 86.400s (24 HORAS) ───
console.log('\n--- 9. Telemetria & Proteção Diária de 86.400s (24 Horas) ---');

const resTelemetria = await worker.fetch(new Request('https://api.test/api/cotacoes/USD'), {});
assert(resTelemetria.headers.get('x-cotacoes-window-daily') === '86400s', 'Header x-cotacoes-window-daily é 86400s');
assert(resTelemetria.headers.get('x-cotacoes-daily-limit') === '500', 'Plano free possui cota diária de 500 req/86400s');
assert(Number(resTelemetria.headers.get('x-cotacoes-daily-remaining')) <= 500, 'Header x-cotacoes-daily-remaining presente');
assert(resTelemetria.headers.get('x-cotacoes-daily-reset') !== null, 'Header x-cotacoes-daily-reset com timestamp presente');

// 9.1 Teste de estouro da cota diária (86400s)
const chaveTesteDiario = 'cot_free_daily_overflow_key';
// Configura requisições até exceder o limite diário
for (let i = 0; i < 505; i++) {
  const r = await worker.fetch(new Request('https://api.test/api/cotacoes/USD', {
    headers: { 'Authorization': `Bearer ${chaveTesteDiario}` }
  }), {});
  if (r.status === 429) {
    const b = await r.json();
    if (b.error === 'DAILY_LIMIT_EXCEEDED') {
      assert(b.error === 'DAILY_LIMIT_EXCEEDED', 'Bloqueio diário dispara DAILY_LIMIT_EXCEEDED');
      assert(b.janela === '86400s', 'Erro identifica a janela de 86400s');
      assert(r.headers.get('Retry-After') !== null, 'Header Retry-After para janela diária configurado');
      break;
    }
  }
}

// ─── 10. VALIDAÇÃO DAS 28 MOEDAS FIDUCIÁRIAS (FIAT) ───
console.log('\n--- 10. Catálogo Completo de Moedas Fiduciárias (28 Moedas) ---');

const moedasObrigatorias = [
  'USD', 'USDTUR', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY', 'ARS',
  'CLP', 'COP', 'UYU', 'MXN', 'INR', 'RUB', 'ZAR', 'TRY', 'ILS', 'AED',
  'SAR', 'SEK', 'NOK', 'DKK', 'PLN', 'NZD', 'SGD', 'HKD'
];

for (const m of moedasObrigatorias) {
  assert(feedData.fiat[m] !== undefined, `Moeda fiduciária configurada: ${m} (${feedData.fiat[m]?.nome || ''})`);
}

// ─── 11. VALIDAÇÃO DAS 16 CRIPTOMOEDAS (BITCOINS & ALTCOINS) ───
console.log('\n--- 11. Catálogo Completo de Criptoativos (16 Criptomoedas) ---');

const criptosObrigatorias = [
  'BTC', 'ETH', 'SOL', 'BNB', 'USDT', 'USDC', 'XRP', 'DOGE',
  'ADA', 'LTC', 'AVAX', 'DOT', 'LINK', 'BCH', 'POL', 'SHIB'
];

for (const c of criptosObrigatorias) {
  assert(feedData.crypto[c] !== undefined, `Criptomoeda configurada: ${c} (${feedData.crypto[c]?.nome || ''})`);
}

// ─── 12. VALIDAÇÃO DE COMMODITIES DO AGRONEGÓCIO & GLOBAIS ───
console.log('\n--- 12. Commodities do Agronegócio Brasileiro & Mercado Global ---');

const agroObrigatorio = [
  'SOJA', 'MILHO', 'BOI_GORDO', 'CAFE', 'ACUCAR', 'ALGODAO',
  'TRIGO', 'ETANOL', 'OURO_G', 'PRATA_G', 'BRENT', 'WTI'
];

for (const a of agroObrigatorio) {
  assert(feedData.commoditiesAgro[a] !== undefined, `Ativo Agro/Commodity configurado: ${a} (${feedData.commoditiesAgro[a]?.nome || ''})`);
}

// ─── 13. VALIDAÇÃO DE INDICADORES ECONÔMICOS DO BRASIL ───
console.log('\n--- 13. Indicadores Econômicos Oficiais (Bacen, IBGE, FGV, B3) ---');

const indicesObrigatorios = [
  'SELIC', 'CDI', 'IPCA', 'IPCA15', 'IGPM', 'INCC',
  'POUPANCA', 'TR', 'SALARIO_MINIMO', 'IBOVESPA', 'IFIX'
];

for (const ind of indicesObrigatorios) {
  assert(feedData.indicesBrasil[ind] !== undefined, `Indicador econômico configurado: ${ind} (${feedData.indicesBrasil[ind]?.nome || ''})`);
}

// ─── 14. RESOLUÇÃO DE ALIASES INTELIGENTES (CELIC, BITCOIN, DOLAR, ETC.) ───
console.log('\n--- 14. Aliases Inteligentes & Tolerância de Grafia ---');

const resCelic = await worker.fetch(new Request('https://api.test/api/cotacoes/CELIC'), {});
assert(resCelic.status === 200, 'Alias CELIC responde HTTP 200');
const dataCelic = await resCelic.json();
assert(dataCelic.ativo === 'SELIC', 'Alias CELIC mapeado com precisão para SELIC');

const resBitcoin = await worker.fetch(new Request('https://api.test/api/cotacoes/BITCOIN'), {});
const dataBitcoin = await resBitcoin.json();
assert(dataBitcoin.ativo === 'BTC', 'Alias BITCOIN mapeado para BTC');

const resDolar = await worker.fetch(new Request('https://api.test/api/cotacoes/DOLAR'), {});
const dataDolar = await resDolar.json();
assert(dataDolar.ativo === 'USD', 'Alias DOLAR mapeado para USD');

const resBoi = await worker.fetch(new Request('https://api.test/api/cotacoes/BOI'), {});
const dataBoi = await resBoi.json();
assert(dataBoi.ativo === 'BOI_GORDO', 'Alias BOI mapeado para BOI_GORDO');

// ─── 15. ENDPOINTS SINGULARES COMPATÍVEIS COM A VITRINE DO MARKETPLACE ───
console.log('\n--- 15. Compatibilidade Total com Endpoints da Vitrine ---');

// 15.1 GET /api/cotacao/atual?pares=USD-BRL,EUR-BRL,BTC-BRL
const resAtual = await worker.fetch(new Request('https://api.test/api/cotacao/atual?pares=USD-BRL,EUR-BRL,BTC-BRL'), {});
assert(resAtual.status === 200, 'Rota /api/cotacao/atual responde HTTP 200');
const dataAtual = await resAtual.json();
assert(dataAtual.totalEncontrados === 3, 'Retornou os 3 pares solicitados');
assert(dataAtual.ativos.USD !== undefined, 'Dólar presente no retorno de pares');
assert(dataAtual.ativos.BTC !== undefined, 'Bitcoin presente no retorno de pares');

// 15.2 GET /api/cotacao/historico?par=USD-BRL&dias=30
const resHist = await worker.fetch(new Request('https://api.test/api/cotacao/historico?par=USD-BRL&dias=30'), {});
assert(resHist.status === 200, 'Rota /api/cotacao/historico responde HTTP 200');
const dataHist = await resHist.json();
assert(dataHist.ativo === 'USD', 'Histórico aponta para USD');
assert(dataHist.historico.totalPontos === 30, 'Histórico contém 30 dias de dados');

// 15.3 GET /api/cotacao/conversao?de=USD&para=BRL&valor=100
const resConvSingular = await worker.fetch(new Request('https://api.test/api/cotacao/conversao?de=USD&para=BRL&valor=100'), {});
assert(resConvSingular.status === 200, 'Rota /api/cotacao/conversao responde HTTP 200');
const dataConvSingular = await resConvSingular.json();
assert(dataConvSingular.conversao.valorConvertido > 0, 'Conversão efetuada com sucesso');

// ─── 16. CATÁLOGO GERAL ESTRUTURADO DE 170 ATIVOS (/api/cotacoes/catalogo) ───
console.log('\n--- 16. Catálogo Geral Estruturado (170 Ativos) ---');

const resCat = await worker.fetch(new Request('https://api.test/api/cotacoes/catalogo'), {});
assert(resCat.status === 200, 'Rota /api/cotacoes/catalogo responde HTTP 200');
const dataCat = await resCat.json();
assert(dataCat.ok === true, 'Catálogo retorna ok: true');
assert(dataCat.totalAtivos === 170, 'Catálogo consolida exatamente 170 ativos');
assert(dataCat.catalogo.fiat.length === 64, 'Catálogo possui 64 moedas fiduciárias');
assert(dataCat.catalogo.crypto.length === 48, 'Catálogo possui 48 criptomoedas');
assert(dataCat.catalogo.commoditiesAgro.length === 32, 'Catálogo possui 32 commodities agropecuárias');
assert(dataCat.catalogo.indicesBrasil.length === 26, 'Catálogo possui 26 indicadores e índices');

// ─── 17. LISTAGEM DE CATEGORIAS E ROTAS DEDICADAS ───
console.log('\n--- 17. Listagem de Categorias & Rotas Especializadas ---');

const resCategorias = await worker.fetch(new Request('https://api.test/api/cotacoes/categorias'), {});
assert(resCategorias.status === 200, 'Rota /api/cotacoes/categorias responde HTTP 200');
const dataCategorias = await resCategorias.json();
assert(dataCategorias.totalCategorias >= 4, 'Macro-categorias disponíveis');

const resCatFiat = await worker.fetch(new Request('https://api.test/api/cotacoes/fiat'), {});
assert(resCatFiat.status === 200, 'Rota /api/cotacoes/fiat responde HTTP 200');
const dataCatFiat = await resCatFiat.json();
assert(dataCatFiat.total === 64, 'Rota fiat retorna 64 moedas');

const resCatCrypto = await worker.fetch(new Request('https://api.test/api/cotacoes/crypto'), {});
assert(resCatCrypto.status === 200, 'Rota /api/cotacoes/crypto responde HTTP 200');
const dataCatCrypto = await resCatCrypto.json();
assert(dataCatCrypto.total === 48, 'Rota crypto retorna 48 criptoativos');

const resCatAgro = await worker.fetch(new Request('https://api.test/api/cotacoes/agro'), {});
assert(resCatAgro.status === 200, 'Rota /api/cotacoes/agro responde HTTP 200');
const dataCatAgro = await resCatAgro.json();
assert(dataCatAgro.total === 32, 'Rota agro retorna 32 commodities');

const resCatIndices = await worker.fetch(new Request('https://api.test/api/cotacoes/indices'), {});
assert(resCatIndices.status === 200, 'Rota /api/cotacoes/indices responde HTTP 200');
const dataCatIndices = await resCatIndices.json();
assert(dataCatIndices.total === 26, 'Rota indices retorna 26 indicadores');

// ─── 18. BUSCA INTELIGENTE DE ATIVOS (/api/cotacoes/busca?q=...) ───
console.log('\n--- 18. Busca Inteligente de Ativos (?q=...) ---');

const resBuscaDolar = await worker.fetch(new Request('https://api.test/api/cotacoes/busca?q=dolar'), {});
assert(resBuscaDolar.status === 200, 'Busca por dolar responde HTTP 200');
const dataBuscaDolar = await resBuscaDolar.json();
assert(dataBuscaDolar.totalEncontrados >= 1, 'Localizou ativo na busca por dolar');

const resBuscaSoja = await worker.fetch(new Request('https://api.test/api/cotacoes/busca?q=soja'), {});
const dataBuscaSoja = await resBuscaSoja.json();
assert(dataBuscaSoja.totalEncontrados >= 1, 'Localizou commodity na busca por soja');

const resBuscaCelic = await worker.fetch(new Request('https://api.test/api/cotacoes/busca?q=celic'), {});
const dataBuscaCelic = await resBuscaCelic.json();
assert(dataBuscaCelic.totalEncontrados >= 1, 'Localizou indicador via alias celic');

// ─── 19. PLANO STARTER 86.400 REQ/DIA (1 REQ/S 24/7) ───
console.log('\n--- 19. Validação do Plano Starter 86.400 req/dia (1 req/s) ---');

const resStarterCheck = await worker.fetch(new Request('https://api.test/api/cotacoes/USD', {
  headers: { 'Authorization': 'Bearer cot_start_live_token' }
}), {});
assert(resStarterCheck.headers.get('x-cotacoes-daily-limit') === '86400', 'Plano starter possui cota diária de 86.400 requisições');
assert(resStarterCheck.headers.get('x-cotacoes-window-daily') === '86400s', 'Janela diária oficial de 86.400 segundos');
assert(resStarterCheck.headers.get('x-cotacoes-cadence') === '1 req/s contínuo 24/7', 'Cadência do plano starter é 1 req/s contínuo 24/7');

// ─── 20. VALIDAÇÃO DOS NOVOS MÉTODOS DO SDK CotacoesPro ───
console.log('\n--- 20. Novos Métodos do SDK Oficial CotacoesPro ---');

assert(typeof CotacoesPro.getCatalogo === 'function', 'Método CotacoesPro.getCatalogo disponível');
assert(typeof CotacoesPro.getCategorias === 'function', 'Método CotacoesPro.getCategorias disponível');
assert(typeof CotacoesPro.buscar === 'function', 'Método CotacoesPro.buscar disponível');
assert(typeof CotacoesPro.getByCategoria === 'function', 'Método CotacoesPro.getByCategoria disponível');
assert(typeof CotacoesPro.getSvgTickerUrl === 'function', 'Método CotacoesPro.getSvgTickerUrl disponível');
assert(typeof CotacoesPro.getHealth === 'function', 'Método CotacoesPro.getHealth disponível');
assert(typeof CotacoesPro.getRanking === 'function', 'Método CotacoesPro.getRanking disponível');
assert(typeof CotacoesPro.simularInvestimento === 'function', 'Método CotacoesPro.simularInvestimento disponível');
assert(typeof CotacoesPro.par === 'function', 'Método CotacoesPro.par disponível');
assert(typeof CotacoesPro.exportarCsv === 'function', 'Método CotacoesPro.exportarCsv disponível');

// ─── 21. HEALTHCHECK E TELEMETRIA DO CLUSTER (/api/cotacoes/health) ───
console.log('\n--- 21. Healthcheck & Telemetria do Cluster Anycast ---');

const masterHeader = { 'Authorization': 'Bearer cot_master_full_test_suite' };

const resHealth = await worker.fetch(new Request('https://api.test/api/cotacoes/health', { headers: masterHeader }), {});
assert(resHealth.status === 200, 'Rota /api/cotacoes/health responde HTTP 200');
const dataHealth = await resHealth.json();
assert(dataHealth.status === 'HEALTHY', 'Status do cluster é HEALTHY');
assert(dataHealth.totalAtivos === 170, 'Healthcheck reporta 170 ativos ativos');
assert(dataHealth.latenciaBordaMs < 10, 'Latência de borda é sub-1s (<10ms)');

// ─── 22. RANKING DE MERCADO EM TEMPO REAL (/api/cotacoes/ranking) ───
console.log('\n--- 22. Ranking de Mercado em Tempo Real ---');

const resRank = await worker.fetch(new Request('https://api.test/api/cotacoes/ranking', { headers: masterHeader }), {});
assert(resRank.status === 200, 'Rota /api/cotacoes/ranking responde HTTP 200');
const dataRank = await resRank.json();
assert(dataRank.ok === true, 'Ranking retorna ok: true');
assert(Array.isArray(dataRank.maioresAltas) && dataRank.maioresAltas.length > 0, 'Possui lista de maiores altas');
assert(Array.isArray(dataRank.maioresBaixas) && dataRank.maioresBaixas.length > 0, 'Possui lista de maiores baixas');
assert(Array.isArray(dataRank.maisPopulares) && dataRank.maisPopulares.length > 0, 'Possui lista de ativos populares');

// ─── 23. SIMULADOR DE INVESTIMENTOS & IR REGRESSIVO (/api/cotacoes/simulador) ───
console.log('\n--- 23. Simulador de Investimentos & Renda Fixa ---');

const resSim = await worker.fetch(new Request('https://api.test/api/cotacoes/simulador?valor=10000&meses=12', { headers: masterHeader }), {});
assert(resSim.status === 200, 'Rota /api/cotacoes/simulador responde HTTP 200');
const dataSim = await resSim.json();
assert(dataSim.ok === true, 'Simulador retorna ok: true');
assert(dataSim.resultados.tesouroSelic.montanteLiquido > 10000, 'Selic gera lucro líquido positivo');
assert(dataSim.resultados.tesouroSelic.aliquotaIr === '20.0%', 'Alíquota de 12 meses é 20%');
assert(dataSim.resultados.poupanca.aliquotaIr === 'Isento', 'Poupança é isenta de IR');
assert(dataSim.resultados.ganhoRealSelicSobrePoupanca !== undefined, 'Calcula ganho real sobre a poupança');

// ─── 24. COTAÇÃO CRUZADA DIRETA REST (/api/cotacoes/:de/:para) ───
console.log('\n--- 24. Cotação Cruzada Direta REST ---');

const resCruzado = await worker.fetch(new Request('https://api.test/api/cotacoes/USD/BRL', { headers: masterHeader }), {});
assert(resCruzado.status === 200, 'Rota /api/cotacoes/USD/BRL responde HTTP 200');
const dataCruzado = await resCruzado.json();
assert(dataCruzado.par === 'USD/BRL', 'Par identificado como USD/BRL');
assert(dataCruzado.cotacao > 0, `Cotação USD/BRL válida: ${dataCruzado.cotacao}`);

const resCruzadoEurUsd = await worker.fetch(new Request('https://api.test/api/cotacoes/EUR/USD', { headers: masterHeader }), {});
assert(resCruzadoEurUsd.status === 200, 'Rota /api/cotacoes/EUR/USD responde HTTP 200');
const dataEurUsd = await resCruzadoEurUsd.json();
assert(dataEurUsd.par === 'EUR/USD', 'Par EUR/USD calculado');
assert(dataEurUsd.cotacao > 0, `Taxa EUR/USD válida: ${dataEurUsd.cotacao}`);

// ─── 25. FORMATOS DE EXPORTAÇÃO ALTERNATIVOS (CSV & XML) ───
console.log('\n--- 25. Exportação Multi-Formato (CSV & XML) ---');

const resCsv = await worker.fetch(new Request('https://api.test/api/cotacoes/catalogo?formato=csv', { headers: masterHeader }), {});
assert(resCsv.status === 200, 'Exportação CSV responde HTTP 200');
assert(resCsv.headers.get('Content-Type').includes('text/csv'), 'Content-Type é text/csv');
const textCsv = await resCsv.text();
assert(textCsv.includes('codigo,nome,categoria,cotacao'), 'CSV contém cabeçalho padrão');
assert(textCsv.includes('USD') && textCsv.includes('BTC'), 'CSV lista USD e BTC');

const resXml = await worker.fetch(new Request('https://api.test/api/cotacoes/catalogo?formato=xml', { headers: masterHeader }), {});
assert(resXml.status === 200, 'Exportação XML responde HTTP 200');
assert(resXml.headers.get('Content-Type').includes('application/xml'), 'Content-Type é application/xml');
const textXml = await resXml.text();
assert(textXml.includes('<?xml') && textXml.includes('<catalogoCotacoes'), 'XML formatado corretamente');

// ─── 26. GRÁFICOS SVG COM TEMAS & PALETAS CUSTOMIZADAS ───
console.log('\n--- 26. Gráficos SVG Anycast com Temas & Paletas ---');

const resSvgLight = await worker.fetch(new Request('https://api.test/api/cotacoes/USD?formato=svg&tema=light&paleta=blue', { headers: masterHeader }), {});
assert(resSvgLight.status === 200, 'SVG tema light responde HTTP 200');
const textSvgLight = await resSvgLight.text();
assert(textSvgLight.includes('#3b82f6'), 'SVG aplicou paleta blue (#3b82f6)');
assert(textSvgLight.includes('#ffffff'), 'SVG aplicou background branco (#ffffff)');

console.log(`\n========================================`);
console.log(`🎉 TODOS OS ${passCount} TESTES PASSARAM COM 100% DE SUCESSO!`);
console.log(`   Falhas: ${failCount}`);
console.log(`========================================\n`);
