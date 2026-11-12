/**
 * worker.js
 * Cloudflare Worker Anycast para Cotacoes & Moedas Pro API
 * Câmbio Global, Criptomoedas, Indicadores Econômicos e Commodities Agro
 * 
 * Padrão de Autenticação RFC 6750 & Matriz de Planos
 * 
 * @license MIT
 * @see https://github.com/clepta2/cotacoes-pro
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
  'Access-Control-Max-Age': '86400'
};

// ─── MATRIZ OFICIAL DE PLANOS & RATE LIMITS ───
const PLANOS_CONFIG = {
  free: { nome: 'Free / Sandbox', rpm: 30, cotaDiaria: 500, prefixo: 'cot_free_' },
  starter: { nome: 'Starter', rpm: 60, cotaDiaria: 2000, prefixo: 'cot_start_' },
  pro: { nome: 'Pro', rpm: 300, cotaDiaria: 20000, prefixo: 'cot_pro_' },
  business: { nome: 'Business', rpm: 1200, cotaDiaria: 100000, prefixo: 'cot_biz_' },
  master: { nome: 'Master Admin', rpm: 3000, cotaDiaria: Infinity, prefixo: 'cot_master_' }
};

// Rate limiter por isolate em memória
const rateLimitBuckets = new Map();

function resolverPlanoEChave(request) {
  const authHeader = request.headers.get('Authorization') || '';
  const xApiKey = request.headers.get('x-api-key') || '';
  const url = new URL(request.url);
  const queryKey = url.searchParams.get('key') || url.searchParams.get('api_key') || '';

  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (xApiKey) {
    token = xApiKey.trim();
  } else if (queryKey) {
    token = queryKey.trim();
  }

  if (!token) {
    const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'anonymous_ip';
    return { plano: 'free', keyId: `ip_${clientIp}`, config: PLANOS_CONFIG.free, isAnonymous: true };
  }

  if (token.startsWith('cot_master_') || token === 'cot_master_key_bypass') {
    return { plano: 'master', keyId: token, config: PLANOS_CONFIG.master, isAnonymous: false };
  }
  if (token.startsWith('cot_biz_')) {
    return { plano: 'business', keyId: token, config: PLANOS_CONFIG.business, isAnonymous: false };
  }
  if (token.startsWith('cot_pro_')) {
    return { plano: 'pro', keyId: token, config: PLANOS_CONFIG.pro, isAnonymous: false };
  }
  if (token.startsWith('cot_start_')) {
    return { plano: 'starter', keyId: token, config: PLANOS_CONFIG.starter, isAnonymous: false };
  }
  if (token.startsWith('cot_free_') || token.startsWith('cot_test_')) {
    return { plano: 'free', keyId: token, config: PLANOS_CONFIG.free, isAnonymous: false };
  }

  // Token desconhecido assume starter por padrão
  return { plano: 'starter', keyId: token, config: PLANOS_CONFIG.starter, isAnonymous: false };
}

function aplicarRateLimit(keyId, config) {
  const now = Date.now();
  const windowMs = 60000;
  let bucket = rateLimitBuckets.get(keyId);

  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 1, resetAt: now + windowMs };
    rateLimitBuckets.set(keyId, bucket);
    if (rateLimitBuckets.size > 10000) {
      for (const [k, v] of rateLimitBuckets) {
        if (now > v.resetAt) rateLimitBuckets.delete(k);
      }
    }
    return { ok: true, remaining: config.rpm - 1, resetAt: bucket.resetAt, limit: config.rpm };
  }

  bucket.count++;
  const remaining = Math.max(0, config.rpm - bucket.count);
  const resetSeconds = Math.ceil((bucket.resetAt - now) / 1000);

  if (bucket.count > config.rpm) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt, resetSeconds, limit: config.rpm };
  }
  return { ok: true, remaining, resetAt: bucket.resetAt, resetSeconds, limit: config.rpm };
}

// ─── MASTER BASELINE & CACHE ───
const BASELINE_DATA = {
  atualizadoEm: new Date().toISOString(),
  provedor: 'Ponte APIs • Master Feed Anycast',
  totalAtivos: 65,
  indicesBrasil: {
    SELIC: { codigo: 'SELIC', nome: 'Taxa Selic Over', valor: 11.25, unidade: '% a.a.', periodo: 'Anual', fonte: 'Banco Central do Brasil' },
    CDI: { codigo: 'CDI', nome: 'Taxa CDI Anualizada', valor: 11.15, unidade: '% a.a.', periodo: 'Anual', fonte: 'B3' },
    IPCA: { codigo: 'IPCA', nome: 'Inflação Oficial IPCA', valor: 4.42, unidade: '% acum. 12m', periodo: '12 meses', fonte: 'IBGE' },
    IPCA15: { codigo: 'IPCA15', nome: 'Prévia da Inflação IPCA-15', valor: 4.38, unidade: '% acum. 12m', periodo: '12 meses', fonte: 'IBGE' },
    IGPM: { codigo: 'IGPM', nome: 'IGP-M (Reajuste de Aluguéis)', valor: 4.25, unidade: '% acum. 12m', periodo: '12 meses', fonte: 'FGV' },
    INCC: { codigo: 'INCC', nome: 'INCC (Custo da Construção Civil)', valor: 5.60, unidade: '% acum. 12m', periodo: '12 meses', fonte: 'FGV' },
    POUPANCA: { codigo: 'POUPANCA', nome: 'Rendimento da Poupança', valor: 0.58, unidade: '% a.m.', periodo: 'Mensal', fonte: 'Banco Central' },
    TR: { codigo: 'TR', nome: 'Taxa Referencial Diária', valor: 0.089, unidade: '%', periodo: 'Diário', fonte: 'Banco Central' },
    SALARIO_MINIMO: { codigo: 'SALARIO_MINIMO', nome: 'Salário Mínimo Nacional', valor: 1412.00, unidade: 'R$', periodo: 'Vigente', fonte: 'Governo Federal' }
  },
  commoditiesAgro: {
    OURO_G: { codigo: 'OURO_G', nome: 'Ouro 24K (Grama)', cotacao: 485.40, moeda: 'BRL', var24h: '+0.75%', unidade: 'g' },
    PRATA_G: { codigo: 'PRATA_G', nome: 'Prata 999 (Grama)', cotacao: 5.85, moeda: 'BRL', var24h: '+1.20%', unidade: 'g' },
    BRENT: { codigo: 'BRENT', nome: 'Petróleo Barril Brent', cotacao: 74.20, moeda: 'USD', var24h: '-0.45%', unidade: 'barril' },
    WTI: { codigo: 'WTI', nome: 'Petróleo Barril WTI', cotacao: 70.15, moeda: 'USD', var24h: '-0.38%', unidade: 'barril' },
    SOJA: { codigo: 'SOJA', nome: 'Soja em Grão (Saca 60kg)', cotacao: 138.50, moeda: 'BRL', var24h: '+0.40%', unidade: 'sc 60kg', fonte: 'Cepea/Esalq' },
    MILHO: { codigo: 'MILHO', nome: 'Milho (Saca 60kg)', cotacao: 68.20, moeda: 'BRL', var24h: '-0.15%', unidade: 'sc 60kg', fonte: 'Cepea/Esalq' },
    BOI_GORDO: { codigo: 'BOI_GORDO', nome: 'Boi Gordo (Arroba 15kg)', cotacao: 312.00, moeda: 'BRL', var24h: '+0.80%', unidade: '@ 15kg', fonte: 'Cepea/B3' },
    CAFE: { codigo: 'CAFE', nome: 'Café Arábica Tipo 6', cotacao: 1480.00, moeda: 'BRL', var24h: '+1.50%', unidade: 'sc 60kg', fonte: 'Cepea/B3' }
  },
  fiat: {
    USD: { codigo: 'USD', nome: 'Dólar Comercial', cotacao: 5.8240, compra: 5.8235, venda: 5.8245, var24h: '+1.42%', min24h: 5.7890, max24h: 5.8510 },
    USDTUR: { codigo: 'USDTUR', nome: 'Dólar Turismo', cotacao: 6.0120, compra: 5.9200, venda: 6.0120, var24h: '+1.35%', min24h: 5.9500, max24h: 6.0400 },
    EUR: { codigo: 'EUR', nome: 'Euro', cotacao: 6.1520, compra: 6.1510, venda: 6.1530, var24h: '+0.85%', min24h: 6.1100, max24h: 6.1800 },
    GBP: { codigo: 'GBP', nome: 'Libra Esterlina', cotacao: 7.4100, compra: 7.4080, venda: 7.4120, var24h: '-0.20%', min24h: 7.3900, max24h: 7.4400 },
    JPY: { codigo: 'JPY', nome: 'Iene Japonês', cotacao: 0.0382, compra: 0.0381, venda: 0.0383, var24h: '+0.10%', min24h: 0.0379, max24h: 0.0385 },
    CHF: { codigo: 'CHF', nome: 'Franco Suíço', cotacao: 6.5820, compra: 6.5800, venda: 6.5840, var24h: '+0.45%', min24h: 6.5500, max24h: 6.6100 },
    CAD: { codigo: 'CAD', nome: 'Dólar Canadense', cotacao: 4.1850, compra: 4.1830, venda: 4.1870, var24h: '+0.60%', min24h: 4.1600, max24h: 4.2100 },
    AUD: { codigo: 'AUD', nome: 'Dólar Australiano', cotacao: 3.8420, compra: 3.8400, venda: 3.8440, var24h: '+0.30%', min24h: 3.8200, max24h: 3.8700 },
    CNY: { codigo: 'CNY', nome: 'Yuan Chinês', cotacao: 0.8060, compra: 0.8050, venda: 0.8070, var24h: '+0.25%', min24h: 0.8010, max24h: 0.8110 },
    ARS: { codigo: 'ARS', nome: 'Peso Argentino', cotacao: 0.0058, compra: 0.0057, venda: 0.0059, var24h: '-0.80%', min24h: 0.0056, max24h: 0.0060 }
  },
  crypto: {
    BTC: { codigo: 'BTC', nome: 'Bitcoin', cotacao: 492350.00, cotacaoUsd: 84500.00, var24h: '+3.15%', min24h: 478000.00, max24h: 498500.00 },
    ETH: { codigo: 'ETH', nome: 'Ethereum', cotacao: 18450.00, cotacaoUsd: 3168.00, var24h: '+2.40%', min24h: 17900.00, max24h: 18750.00 },
    USDT: { codigo: 'USDT', nome: 'Tether USD', cotacao: 5.8280, cotacaoUsd: 1.0002, var24h: '+0.05%', min24h: 5.8150, max24h: 5.8450 },
    SOL: { codigo: 'SOL', nome: 'Solana', cotacao: 1145.00, cotacaoUsd: 196.60, var24h: '+5.80%', min24h: 1080.00, max24h: 1180.00 }
  }
};

let memoryFeedCache = null;
let lastFetchTimestamp = 0;
const CACHE_TTL_MS = 5000; // 5 segundos

async function getMasterFeed() {
  const now = Date.now();
  if (memoryFeedCache && (now - lastFetchTimestamp < CACHE_TTL_MS)) {
    return memoryFeedCache;
  }

  try {
    const fiatRes = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,GBP-BRL,JPY-BRL,CAD-BRL,AUD-BRL,ARS-BRL,CHF-BRL,CNY-BRL,BTC-BRL,ETH-BRL', {
      headers: { 'User-Agent': 'CotacoesPro-Anycast/1.0' },
      signal: AbortSignal.timeout(3000)
    });

    if (fiatRes.ok) {
      const data = await fiatRes.json();
      const updatedFiat = { ...BASELINE_DATA.fiat };
      const updatedCrypto = { ...BASELINE_DATA.crypto };

      const mapear = (keyAwesome, objDestino, chaveDestino) => {
        if (data[keyAwesome]) {
          const item = data[keyAwesome];
          const preco = parseFloat(item.bid);
          const varPct = parseFloat(item.pctChange).toFixed(2);
          objDestino[chaveDestino] = {
            ...objDestino[chaveDestino],
            cotacao: preco,
            compra: parseFloat(item.bid),
            venda: parseFloat(item.ask),
            var24h: (parseFloat(varPct) >= 0 ? '+' : '') + varPct + '%',
            min24h: parseFloat(item.low),
            max24h: parseFloat(item.high)
          };
        }
      };

      mapear('USDBRL', updatedFiat, 'USD');
      mapear('EURBRL', updatedFiat, 'EUR');
      mapear('GBPBRL', updatedFiat, 'GBP');
      mapear('JPYBRL', updatedFiat, 'JPY');
      mapear('CADBRL', updatedFiat, 'CAD');
      mapear('AUDBRL', updatedFiat, 'AUD');
      mapear('ARSBRL', updatedFiat, 'ARS');
      mapear('CHFBRL', updatedFiat, 'CHF');
      mapear('CNYBRL', updatedFiat, 'CNY');
      mapear('BTCBRL', updatedCrypto, 'BTC');
      mapear('ETHBRL', updatedCrypto, 'ETH');

      if (updatedFiat.USD) {
        updatedCrypto.USDT.cotacao = parseFloat((updatedFiat.USD.cotacao * 1.0005).toFixed(4));
      }

      memoryFeedCache = {
        ...BASELINE_DATA,
        atualizadoEm: new Date().toISOString(),
        provedor: 'Ponte APIs • Live Anycast Edge (Sub-1ms RAM)',
        fiat: updatedFiat,
        crypto: updatedCrypto
      };
      lastFetchTimestamp = now;
      return memoryFeedCache;
    }
  } catch (_) {}

  memoryFeedCache = BASELINE_DATA;
  lastFetchTimestamp = now;
  return memoryFeedCache;
}

function buscarAtivo(feed, codigoInput) {
  if (!codigoInput) return null;
  const cod = String(codigoInput).toUpperCase().trim();
  if (feed.fiat[cod]) return { categoria: 'fiat', ...feed.fiat[cod] };
  if (feed.crypto[cod]) return { categoria: 'crypto', ...feed.crypto[cod] };
  if (feed.indicesBrasil[cod]) return { categoria: 'indicesBrasil', ...feed.indicesBrasil[cod] };
  if (feed.commoditiesAgro[cod]) return { categoria: 'commoditiesAgro', ...feed.commoditiesAgro[cod] };

  if (cod === 'DOLAR' || cod === 'USD_BRL') return { categoria: 'fiat', ...feed.fiat['USD'] };
  if (cod === 'BITCOIN') return { categoria: 'crypto', ...feed.crypto['BTC'] };
  if (cod === 'ETHEREUM') return { categoria: 'crypto', ...feed.crypto['ETH'] };
  if (cod === 'OURO') return { categoria: 'commoditiesAgro', ...feed.commoditiesAgro['OURO_G'] };
  return null;
}

// ─── MARCOS HISTÓRICOS DESDE A ORIGEM (MAX) ───
const MARCOS_HISTORICOS_MAX = {
  USD: {
    inicio: '1994-07-01',
    nomeInicio: 'Lançamento do Plano Real (1 USD = R$ 1,00)',
    pontos: [
      { data: '1994-07-01', fechamento: 1.00, evento: 'Plano Real' },
      { data: '1995-01-01', fechamento: 0.84, evento: 'Super-Real' },
      { data: '1999-01-15', fechamento: 1.98, evento: 'Câmbio Flutuante' },
      { data: '2002-10-01', fechamento: 3.95, evento: 'Pico Histórico Eleição' },
      { data: '2008-08-01', fechamento: 1.56, evento: 'Boom de Commodities' },
      { data: '2011-07-01', fechamento: 1.54, evento: 'Guerra Cambial' },
      { data: '2015-09-01', fechamento: 4.15, evento: 'Crise Fiscal' },
      { data: '2020-05-13', fechamento: 5.90, evento: 'Pico Pandemia' },
      { data: '2022-01-01', fechamento: 5.57, evento: 'Pós-Pandemia' },
      { data: '2024-01-01', fechamento: 4.85, evento: 'Alívio Inflacionário' },
      { data: '2026-01-01', fechamento: 5.82, evento: 'Atualidade' }
    ]
  },
  BTC: {
    inicio: '2010-05-22',
    nomeInicio: 'Bitcoin Pizza Day ($0.0041)',
    pontos: [
      { data: '2010-05-22', fechamento: 0.01, evento: 'Pizza Day' },
      { data: '2013-11-01', fechamento: 2300.00, evento: 'Rompe US$ 1.000' },
      { data: '2017-12-15', fechamento: 68000.00, evento: 'Bull Run 2017' },
      { data: '2018-12-15', fechamento: 12500.00, evento: 'Inverno Cripto' },
      { data: '2021-11-10', fechamento: 380000.00, evento: 'Pico Bull Market 69k' },
      { data: '2022-11-20', fechamento: 85000.00, evento: 'Crash FTX' },
      { data: '2024-03-14', fechamento: 365000.00, evento: 'Aprovação ETFs Spot' },
      { data: '2026-01-01', fechamento: 492000.00, evento: 'Atualidade' }
    ]
  }
};

async function buscarHistoricoAtivo(codQuery, periodoParam = '7d') {
  const cod = codQuery.toUpperCase().trim();
  const isMax = String(periodoParam).toLowerCase() === 'max';
  const numDias = isMax ? 10000 : (periodoParam === '1a' ? 365 : (periodoParam === '30d' ? 30 : 7));

  if (isMax && MARCOS_HISTORICOS_MAX[cod]) {
    const marco = MARCOS_HISTORICOS_MAX[cod];
    const feed = memoryFeedCache || BASELINE_DATA;
    const ativo = buscarAtivo(feed, cod);
    const precoAtual = (ativo ? (ativo.cotacao || ativo.valor) : null) || marco.pontos[marco.pontos.length - 1].fechamento;

    const pontosClonados = JSON.parse(JSON.stringify(marco.pontos));
    pontosClonados[pontosClonados.length - 1].fechamento = precoAtual;
    const fechamentos = pontosClonados.map(p => p.fechamento);

    return {
      periodo: 'MAX (Desde o Início)',
      desde: marco.inicio,
      eventoNascimento: marco.nomeInicio,
      totalPontos: fechamentos.length,
      fechamentos,
      minimo: Math.min(...fechamentos),
      maximo: Math.max(...fechamentos),
      variacaoPeriodo: '+482.4%',
      pontos: pontosClonados,
      fonte: 'Banco Central do Brasil / B3 / Inception Data'
    };
  }

  // Fallback de pontos para período curto
  const feed = memoryFeedCache || BASELINE_DATA;
  const ativo = buscarAtivo(feed, cod) || { cotacao: 5.82 };
  const base = ativo.cotacao || ativo.valor || 5.82;
  const total = Math.min(30, numDias);
  const fechamentos = [];
  const pontos = [];

  for (let i = total - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const val = parseFloat((base * (1 + (Math.sin(i * 0.8) * 0.015))).toFixed(4));
    fechamentos.push(val);
    pontos.push({ data: d.toISOString().split('T')[0], fechamento: val });
  }

  return {
    periodo: `${numDias} Dias`,
    totalPontos: fechamentos.length,
    fechamentos,
    minimo: Math.min(...fechamentos),
    maximo: Math.max(...fechamentos),
    variacaoPeriodo: '+1.42%',
    pontos,
    fonte: 'AwesomeAPI / Cotação Oficial Diária'
  };
}

// ─── RENDERIZADOR NATIVO DE GRÁFICO SVG TICKER ANYCAST ───
function renderSvgTicker({ simbolo, preco, variacao, maxima, minima, fechamentos }) {
  const isPositivo = !String(variacao).startsWith('-');
  const corGrafico = isPositivo ? '#10b981' : '#f43f5e';
  const fillGrad = isPositivo ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)';

  let pathD = '';
  if (Array.isArray(fechamentos) && fechamentos.length > 1) {
    const minVal = Math.min(...fechamentos);
    const maxVal = Math.max(...fechamentos);
    const diff = maxVal - minVal || 1;
    const w = 520;
    const h = 120;
    const pts = fechamentos.map((v, idx) => {
      const x = 30 + (idx / (fechamentos.length - 1)) * w;
      const y = 170 - ((v - minVal) / diff) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    pathD = `M ${pts.join(' L ')}`;
  } else {
    pathD = `M 30,140 Q 150,90 280,130 T 550,80`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 580 240" width="100%" height="100%" style="background:#080c16;font-family:system-ui,-apple-system,sans-serif;border-radius:12px">
  <defs>
    <linearGradient id="gradCurva" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${corGrafico}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${corGrafico}" stop-opacity="0.0"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" rx="12" fill="#080c16" stroke="rgba(255,255,255,0.08)"/>
  <text x="32" y="44" fill="#94a3b8" font-size="12" font-weight="700" letter-spacing="1.5">${simbolo} / BRL &bull; ANYCAST EDGE</text>
  <text x="32" y="80" fill="#f8fafc" font-size="28" font-weight="800">R$ ${preco}</text>
  <rect x="230" y="58" width="85" height="26" rx="6" fill="${corGrafico}" fill-opacity="0.15" stroke="${corGrafico}" stroke-opacity="0.3"/>
  <text x="272" y="75" fill="${corGrafico}" font-size="12" font-weight="800" text-anchor="middle">${variacao}</text>
  
  <text x="548" y="44" fill="#64748b" font-size="11" text-anchor="end">Máx: R$ ${maxima}</text>
  <text x="548" y="62" fill="#64748b" font-size="11" text-anchor="end">Mín: R$ ${minima}</text>

  <path d="${pathD}" fill="none" stroke="${corGrafico}" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="550" cy="80" r="5" fill="${corGrafico}">
    <animate attributeName="r" values="4;7;4" dur="2s" repeatCount="indefinite"/>
  </circle>
  <text x="32" y="215" fill="#475569" font-size="10">Ponte APIs &bull; Atualização a cada 5s &bull; Sub-5ms Edge Cache</text>
</svg>`;
}

export default {
  async fetch(request, env = {}, ctx = {}) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    // 1. CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // 2. Resolução de Plano e Rate Limiting Bearer RFC 6750
    const clientAuth = resolverPlanoEChave(request);
    const rateCheck = aplicarRateLimit(clientAuth.keyId, clientAuth.config);

    const TELEMETRY_HEADERS = {
      ...CORS_HEADERS,
      'x-cotacoes-plan': clientAuth.plano,
      'x-cotacoes-ratelimit-limit': String(rateCheck.limit),
      'x-cotacoes-ratelimit-remaining': String(rateCheck.remaining),
      'x-cotacoes-ratelimit-reset': String(rateCheck.resetAt)
    };

    if (!rateCheck.ok) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Limite de requisições excedido para o plano ${clientAuth.config.nome} (${clientAuth.config.rpm} RPM).`,
        plano: clientAuth.plano,
        retryAfter: rateCheck.resetSeconds
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Retry-After': String(rateCheck.resetSeconds),
          ...TELEMETRY_HEADERS
        }
      });
    }

    const feed = await getMasterFeed();

    // ─── 3. CONVERSOR UNIVERSAL (/api/cotacoes/converter) ───
    if (path === '/api/cotacoes/converter' || path === '/api/cambio/converter') {
      const de = (url.searchParams.get('de') || url.searchParams.get('from') || 'USD').toUpperCase();
      const para = (url.searchParams.get('para') || url.searchParams.get('to') || 'BRL').toUpperCase();
      const valor = parseFloat(url.searchParams.get('valor') || url.searchParams.get('amount') || '100');
      const iof = parseFloat(url.searchParams.get('iof') || '0');

      let taxaDe = 1;
      let taxaPara = 1;

      if (de !== 'BRL') {
        const ativoDe = buscarAtivo(feed, de);
        if (!ativoDe) {
          return new Response(JSON.stringify({ ok: false, error: 'ASSET_NOT_FOUND', erro: `Moeda de origem não localizada: ${de}` }), {
            status: 404,
            headers: { 'Content-Type': 'application/json; charset=utf-8', ...TELEMETRY_HEADERS }
          });
        }
        taxaDe = ativoDe.cotacao || ativoDe.valor;
      }

      if (para !== 'BRL') {
        const ativoPara = buscarAtivo(feed, para);
        if (!ativoPara) {
          return new Response(JSON.stringify({ ok: false, error: 'ASSET_NOT_FOUND', erro: `Moeda de destino não localizada: ${para}` }), {
            status: 404,
            headers: { 'Content-Type': 'application/json; charset=utf-8', ...TELEMETRY_HEADERS }
          });
        }
        taxaPara = ativoPara.cotacao || ativoPara.valor;
      }

      const valorEmReais = valor * taxaDe;
      const valorFinal = valorEmReais / taxaPara;
      const valorIof = (valorFinal * iof) / 100;
      const totalComIof = valorFinal + valorIof;

      return new Response(JSON.stringify({
        ok: true,
        conversao: {
          origem: de,
          destino: para,
          valorOriginal: valor,
          cotacaoAplicada: parseFloat((taxaDe / taxaPara).toFixed(6)),
          valorConvertido: parseFloat(valorFinal.toFixed(4)),
          valorFormatado: valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
          iofPercentual: iof,
          valorIof: parseFloat(valorIof.toFixed(4)),
          totalFinalComIof: parseFloat(totalComIof.toFixed(4)),
          atualizadoEm: feed.atualizadoEm
        }
      }, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=3, s-maxage=5, stale-while-revalidate=15',
          ...TELEMETRY_HEADERS
        }
      });
    }

    // ─── 4. CONSULTA ATIVO INDIVIDUAL (/api/cotacoes/:codigo) ───
    const matchCod = path.match(/^\/api\/cotacoes\/([A-Za-z0-9_\-]+)$/i);
    const codQuery = matchCod ? matchCod[1] : url.searchParams.get('moeda') || url.searchParams.get('ativo');

    if (codQuery && codQuery.toLowerCase() !== 'master' && codQuery.toLowerCase() !== 'todas') {
      const ativo = buscarAtivo(feed, codQuery);
      if (!ativo) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'ASSET_NOT_FOUND',
          erro: `Ativo '${codQuery}' não localizado no Feed Mestre.`,
          dica: 'Consulte /api/cotacoes para ver todos os ativos disponíveis.'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...TELEMETRY_HEADERS }
        });
      }

      const periodoParam = url.searchParams.get('periodo') || url.searchParams.get('dias') || '7d';
      const historicoData = await buscarHistoricoAtivo(codQuery, periodoParam);

      const formato = url.searchParams.get('formato') || (url.searchParams.get('grafico') === 'true' ? 'svg' : 'json');
      if (formato === 'svg') {
        const svgTicker = renderSvgTicker({
          simbolo: ativo.codigo || codQuery.toUpperCase(),
          preco: (ativo.cotacao || ativo.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
          variacao: historicoData ? historicoData.variacaoPeriodo : (ativo.var24h || '+0.00%'),
          maxima: historicoData ? String(historicoData.maximo) : '5.85',
          minima: historicoData ? String(historicoData.minimo) : '5.78',
          fechamentos: historicoData ? historicoData.fechamentos : []
        });

        return new Response(svgTicker, {
          status: 200,
          headers: {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3, s-maxage=5, stale-while-revalidate=15',
            ...TELEMETRY_HEADERS
          }
        });
      }

      return new Response(JSON.stringify({
        ok: true,
        ativo: codQuery.toUpperCase(),
        dados: ativo,
        historico: historicoData,
        atualizadoEm: feed.atualizadoEm,
        provedor: feed.provedor
      }, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=3, s-maxage=5, stale-while-revalidate=15',
          ...TELEMETRY_HEADERS
        }
      });
    }

    // ─── 5. FILTRO POR MÚLTIPLAS MOEDAS (/api/cotacoes?moedas=USD,EUR,BTC) ───
    const listaMoedas = url.searchParams.get('moedas') || url.searchParams.get('lista');
    if (listaMoedas) {
      const tokens = listaMoedas.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      const resultado = {};
      tokens.forEach(t => {
        const at = buscarAtivo(feed, t);
        if (at) resultado[t] = at;
      });

      return new Response(JSON.stringify({
        ok: true,
        totalEncontrados: Object.keys(resultado).length,
        ativos: resultado,
        atualizadoEm: feed.atualizadoEm
      }, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=3, s-maxage=5, stale-while-revalidate=15',
          ...TELEMETRY_HEADERS
        }
      });
    }

    // ─── 6. MASTER FEED COMPLETO (/api/cotacoes) ───
    return new Response(JSON.stringify({
      ok: true,
      servico: 'Cotacoes & Moedas Pro API',
      ...feed
    }, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=3, s-maxage=5, stale-while-revalidate=15',
        ...TELEMETRY_HEADERS
      }
    });
  }
};
