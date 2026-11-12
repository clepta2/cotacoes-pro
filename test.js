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

console.log(`\n========================================`);
console.log(`🎉 TODOS OS ${passCount} TESTES PASSARAM COM 100% DE SUCESSO!`);
console.log(`   Falhas: ${failCount}`);
console.log(`========================================\n`);
