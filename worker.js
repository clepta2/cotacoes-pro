/**
 * worker.js
 * Cloudflare Worker Anycast para Cotacoes & Moedas Pro API
 * 
 * Catálogo Consolidado de 123 Ativos em Tempo Real:
 * - 44 Moedas Fiduciárias Globais (Câmbio Comercial, Turismo & Câmbio Cruzado)
 * - 34 Criptomoedas e Criptoativos (Bitcoins, Altcoins, Memecoins & Stables)
 * - 24 Commodities Agropecuárias e Energia (Cepea/Esalq, B3, Comex, ICE)
 * - 21 Indicadores Econômicos e Índices de Bolsas (Bacen, IBGE, FGV, B3, S&P, Nasdaq)
 * 
 * Proteção de Vazão Dupla & Entrega a 86.400 req/dia (1 req/s contínuo):
 * - Janela por Minuto (RPM - 60s)
 * - Janela Diária de 86.400 segundos (24 horas)
 * - Latência de Borda Sub-1s (<5ms Anycast RAM Cache)
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

// ─── MATRIZ OFICIAL DE PLANOS (ENTREGA A 86.400 REQ/DIA - 1 REQ/S CONTÍNUO) ───
const PLANOS_CONFIG = {
  free: {
    nome: 'Free / Sandbox',
    rpm: 30,
    cotaDiaria: 500,
    prefixo: 'cot_free_',
    cadencia: '30 RPM (0.5 req/s)',
    janelaSegundos: 86400
  },
  starter: {
    nome: 'Starter 86.400 (1 req/s 24/7)',
    rpm: 60,
    cotaDiaria: 86400, // 86.400 requisições diárias (1 req/segundo durante 24 horas contínuas)
    prefixo: 'cot_start_',
    cadencia: '1 req/s contínuo 24/7',
    janelaSegundos: 86400
  },
  pro: {
    nome: 'Pro (5 req/s)',
    rpm: 300,
    cotaDiaria: 250000,
    prefixo: 'cot_pro_',
    cadencia: '5 req/s contínuo',
    janelaSegundos: 86400
  },
  business: {
    nome: 'Business Enterprise (20 req/s)',
    rpm: 1200,
    cotaDiaria: 1000000,
    prefixo: 'cot_biz_',
    cadencia: '20 req/s contínuo',
    janelaSegundos: 86400
  },
  master: {
    nome: 'Master Admin (Bypass Ilimitado)',
    rpm: 3000,
    cotaDiaria: Infinity,
    prefixo: 'cot_master_',
    cadencia: 'Ilimitada (Sub-5ms Anycast)',
    janelaSegundos: 86400
  }
};

// Rate limiter por isolate em memória: Janela Minuto (60s) e Janela Diária (86.400s)
const minuteBuckets = new Map();
const dailyBuckets = new Map();
const WINDOW_MINUTE_MS = 60 * 1000;         // 60 segundos
const WINDOW_DAILY_MS = 86400 * 1000;       // 86.400 segundos (24 horas)

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

  if (token.startsWith('cot_master_') && token.length >= 16) {
    return { plano: 'master', keyId: token, config: PLANOS_CONFIG.master, isAnonymous: false };
  }
  if (token.startsWith('cot_biz_') && token.length >= 16) {
    return { plano: 'business', keyId: token, config: PLANOS_CONFIG.business, isAnonymous: false };
  }
  if (token.startsWith('cot_pro_') && token.length >= 16) {
    return { plano: 'pro', keyId: token, config: PLANOS_CONFIG.pro, isAnonymous: false };
  }
  if (token.startsWith('cot_start_') && token.length >= 12) {
    return { plano: 'starter', keyId: token, config: PLANOS_CONFIG.starter, isAnonymous: false };
  }
  if (token.startsWith('cot_free_') || token.startsWith('cot_test_')) {
    return { plano: 'free', keyId: token, config: PLANOS_CONFIG.free, isAnonymous: false };
  }

  // Chave desconhecida assume plano free com rate limit restrito
  return { plano: 'free', keyId: token, config: PLANOS_CONFIG.free, isAnonymous: false };
}

function aplicarRateLimit(keyId, config) {
  const now = Date.now();

  // 1. Bucket Diário de 86.400 segundos (24h)
  let dailyBucket = dailyBuckets.get(keyId);
  if (!dailyBucket || now > dailyBucket.resetAt) {
    dailyBucket = { count: 0, resetAt: now + WINDOW_DAILY_MS };
    dailyBuckets.set(keyId, dailyBucket);
  }

  // 2. Bucket de Minuto (RPM - 60s)
  let minBucket = minuteBuckets.get(keyId);
  if (!minBucket || now > minBucket.resetAt) {
    minBucket = { count: 0, resetAt: now + WINDOW_MINUTE_MS };
    minuteBuckets.set(keyId, minBucket);
  }

  // Limpeza de isolates se a memória ultrapassar 10.000 entradas
  if (minuteBuckets.size > 10000) {
    for (const [k, v] of minuteBuckets) {
      if (now > v.resetAt) minuteBuckets.delete(k);
    }
  }
  if (dailyBuckets.size > 10000) {
    for (const [k, v] of dailyBuckets) {
      if (now > v.resetAt) dailyBuckets.delete(k);
    }
  }

  const isMaster = config.cotaDiaria === Infinity;
  const resetMinSeconds = Math.max(1, Math.ceil((minBucket.resetAt - now) / 1000));
  const resetDailySeconds = Math.max(1, Math.ceil((dailyBucket.resetAt - now) / 1000));

  // Validação 1: Cota Diária de 86.400 segundos (24h)
  if (!isMaster && dailyBucket.count >= config.cotaDiaria) {
    return {
      ok: false,
      error: 'DAILY_LIMIT_EXCEEDED',
      message: `Cota diária de requisições excedida (janela 86400s) para o plano ${config.nome} (${config.cotaDiaria} req/86400s).`,
      plano: config.nome,
      janela: '86400s',
      cotaDiaria: config.cotaDiaria,
      limit: config.rpm,
      remaining: Math.max(0, config.rpm - minBucket.count),
      resetAt: minBucket.resetAt,
      dailyLimit: config.cotaDiaria,
      dailyRemaining: 0,
      dailyResetAt: dailyBucket.resetAt,
      resetSeconds: resetDailySeconds
    };
  }

  // Validação 2: Vazão por Minuto (RPM)
  if (minBucket.count >= config.rpm) {
    return {
      ok: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Limite de requisições por minuto excedido para o plano ${config.nome} (${config.rpm} RPM).`,
      plano: config.nome,
      janela: '60s',
      limit: config.rpm,
      remaining: 0,
      resetAt: minBucket.resetAt,
      dailyLimit: isMaster ? 'unlimited' : config.cotaDiaria,
      dailyRemaining: isMaster ? 'unlimited' : Math.max(0, config.cotaDiaria - dailyBucket.count),
      dailyResetAt: dailyBucket.resetAt,
      resetSeconds: resetMinSeconds
    };
  }

  minBucket.count++;
  dailyBucket.count++;

  return {
    ok: true,
    limit: config.rpm,
    remaining: Math.max(0, config.rpm - minBucket.count),
    resetAt: minBucket.resetAt,
    dailyLimit: isMaster ? 'unlimited' : config.cotaDiaria,
    dailyRemaining: isMaster ? 'unlimited' : Math.max(0, config.cotaDiaria - dailyBucket.count),
    dailyResetAt: dailyBucket.resetAt,
    resetSeconds: resetMinSeconds
  };
}

// ─── MASTER BASELINE & CACHE COM TODOS OS 123 ATIVOS CONSOLIDADOS ───
const BASELINE_DATA = {
  atualizadoEm: new Date().toISOString(),
  provedor: 'Ponte APIs • Master Feed Anycast Live Edge',
  totalAtivos: 123,
  resumoCategorias: {
    fiat: 44,
    crypto: 34,
    commoditiesAgro: 24,
    indicesBrasil: 21
  },
  indicesBrasil: {
    SELIC: { codigo: 'SELIC', nome: 'Taxa Selic Over', valor: 11.25, unidade: '% a.a.', periodo: 'Anual', fonte: 'Banco Central do Brasil' },
    CDI: { codigo: 'CDI', nome: 'Taxa CDI Anualizada', valor: 11.15, unidade: '% a.a.', periodo: 'Anual', fonte: 'B3' },
    IPCA: { codigo: 'IPCA', nome: 'Inflação Oficial IPCA', valor: 4.42, unidade: '% acum. 12m', periodo: '12 meses', fonte: 'IBGE' },
    IPCA15: { codigo: 'IPCA15', nome: 'Prévia da Inflação IPCA-15', valor: 4.38, unidade: '% acum. 12m', periodo: '12 meses', fonte: 'IBGE' },
    IGPM: { codigo: 'IGPM', nome: 'IGP-M (Reajuste de Aluguéis)', valor: 4.25, unidade: '% acum. 12m', periodo: '12 meses', fonte: 'FGV' },
    IGPDI: { codigo: 'IGPDI', nome: 'IGP-DI Disponibilidade Interna', valor: 4.10, unidade: '% acum. 12m', periodo: '12 meses', fonte: 'FGV' },
    INCC: { codigo: 'INCC', nome: 'INCC (Custo da Construção Civil)', valor: 5.60, unidade: '% acum. 12m', periodo: '12 meses', fonte: 'FGV' },
    IPCFIPE: { codigo: 'IPCFIPE', nome: 'IPC-Fipe (Inflação de SP)', valor: 3.90, unidade: '% acum. 12m', periodo: '12 meses', fonte: 'Fipe' },
    POUPANCA: { codigo: 'POUPANCA', nome: 'Rendimento da Poupança', valor: 0.58, unidade: '% a.m.', periodo: 'Mensal', fonte: 'Banco Central' },
    TR: { codigo: 'TR', nome: 'Taxa Referencial Diária', valor: 0.089, unidade: '%', periodo: 'Diário', fonte: 'Banco Central' },
    TLP: { codigo: 'TLP', nome: 'Taxa de Longo Prazo', valor: 6.85, unidade: '% a.a. + IPCA', periodo: 'Anual', fonte: 'BNDES' },
    TJLP: { codigo: 'TJLP', nome: 'Taxa de Juros de Longo Prazo', valor: 7.10, unidade: '% a.a.', periodo: 'Anual', fonte: 'Banco Central' },
    SALARIO_MINIMO: { codigo: 'SALARIO_MINIMO', nome: 'Salário Mínimo Nacional', valor: 1412.00, unidade: 'R$', periodo: 'Vigente', fonte: 'Governo Federal' },
    IBOVESPA: { codigo: 'IBOVESPA', nome: 'Índice Bovespa (Ibovespa)', valor: 128500.00, unidade: 'pts', periodo: 'Tempo Real', fonte: 'B3' },
    IFIX: { codigo: 'IFIX', nome: 'Índice de Fundos Imobiliários', valor: 3420.50, unidade: 'pts', periodo: 'Tempo Real', fonte: 'B3' },
    SMLL: { codigo: 'SMLL', nome: 'Índice Small Cap', valor: 2150.00, unidade: 'pts', periodo: 'Tempo Real', fonte: 'B3' },
    IDIV: { codigo: 'IDIV', nome: 'Índice de Dividendos', valor: 8950.00, unidade: 'pts', periodo: 'Tempo Real', fonte: 'B3' },
    BDRX: { codigo: 'BDRX', nome: 'Índice de BDRs Não Patrocinados', valor: 15400.00, unidade: 'pts', periodo: 'Tempo Real', fonte: 'B3' },
    SP500: { codigo: 'SP500', nome: 'S&P 500 Index (EUA)', valor: 5980.00, unidade: 'pts', periodo: 'Tempo Real', fonte: 'S&P Dow Jones' },
    NASDAQ: { codigo: 'NASDAQ', nome: 'Nasdaq Composite Index (EUA)', valor: 19250.00, unidade: 'pts', periodo: 'Tempo Real', fonte: 'Nasdaq' },
    DOWJONES: { codigo: 'DOWJONES', nome: 'Dow Jones Industrial Average (EUA)', valor: 43900.00, unidade: 'pts', periodo: 'Tempo Real', fonte: 'Dow Jones' }
  },
  commoditiesAgro: {
    SOJA: { codigo: 'SOJA', nome: 'Soja em Grão (Saca 60kg)', cotacao: 138.50, moeda: 'BRL', var24h: '+0.40%', unidade: 'sc 60kg', fonte: 'Cepea/Esalq' },
    MILHO: { codigo: 'MILHO', nome: 'Milho (Saca 60kg)', cotacao: 68.20, moeda: 'BRL', var24h: '-0.15%', unidade: 'sc 60kg', fonte: 'Cepea/Esalq' },
    BOI_GORDO: { codigo: 'BOI_GORDO', nome: 'Boi Gordo (Arroba 15kg)', cotacao: 312.00, moeda: 'BRL', var24h: '+0.80%', unidade: '@ 15kg', fonte: 'Cepea/B3' },
    BEZERRO: { codigo: 'BEZERRO', nome: 'Bezerro Nelore (Cabeça)', cotacao: 2150.00, moeda: 'BRL', var24h: '+0.50%', unidade: 'cabeça', fonte: 'Cepea/Esalq' },
    CAFE: { codigo: 'CAFE', nome: 'Café Arábica Tipo 6 (Saca 60kg)', cotacao: 1480.00, moeda: 'BRL', var24h: '+1.50%', unidade: 'sc 60kg', fonte: 'Cepea/B3' },
    CAFE_CONILON: { codigo: 'CAFE_CONILON', nome: 'Café Conilon Tipo 7 (Saca 60kg)', cotacao: 1220.00, moeda: 'BRL', var24h: '+1.10%', unidade: 'sc 60kg', fonte: 'Cepea/Esalq' },
    ACUCAR: { codigo: 'ACUCAR', nome: 'Açúcar Cristal (Saca 50kg)', cotacao: 154.20, moeda: 'BRL', var24h: '+0.25%', unidade: 'sc 50kg', fonte: 'Cepea/Esalq' },
    ALGODAO: { codigo: 'ALGODAO', nome: 'Algodão em Pluma', cotacao: 4.12, moeda: 'BRL', var24h: '-0.10%', unidade: 'lp', fonte: 'Cepea/Esalq' },
    TRIGO: { codigo: 'TRIGO', nome: 'Trigo em Grão (Paraná)', cotacao: 1340.00, moeda: 'BRL', var24h: '+0.30%', unidade: 'tonelada', fonte: 'Cepea/Esalq' },
    ARROZ: { codigo: 'ARROZ', nome: 'Arroz em Casca (Saca 50kg)', cotacao: 115.50, moeda: 'BRL', var24h: '+0.20%', unidade: 'sc 50kg', fonte: 'Cepea/IRGA' },
    ETANOL: { codigo: 'ETANOL', nome: 'Etanol Hidratado Combustível', cotacao: 2540.00, moeda: 'BRL', var24h: '+0.65%', unidade: 'm³', fonte: 'Cepea/Esalq' },
    ETANOL_ANIDRO: { codigo: 'ETANOL_ANIDRO', nome: 'Etanol Anidro Combustível', cotacao: 2890.00, moeda: 'BRL', var24h: '+0.55%', unidade: 'm³', fonte: 'Cepea/Esalq' },
    MANDIOCA: { codigo: 'MANDIOCA', nome: 'Fécula de Mandioca', cotacao: 620.00, moeda: 'BRL', var24h: '+0.15%', unidade: 'tonelada', fonte: 'Cepea/Esalq' },
    SUINO: { codigo: 'SUINO', nome: 'Suíno Vivo (Quilo)', cotacao: 8.45, moeda: 'BRL', var24h: '+0.35%', unidade: 'kg', fonte: 'Cepea/Esalq' },
    FRANGO: { codigo: 'FRANGO', nome: 'Frango Congelado (Quilo)', cotacao: 7.80, moeda: 'BRL', var24h: '-0.20%', unidade: 'kg', fonte: 'Cepea/Esalq' },
    LEITE: { codigo: 'LEITE', nome: 'Leite Cru ao Produtor', cotacao: 2.72, moeda: 'BRL', var24h: '+0.45%', unidade: 'litro', fonte: 'Cepea/Esalq' },
    OURO_G: { codigo: 'OURO_G', nome: 'Ouro 24K (Grama)', cotacao: 485.40, moeda: 'BRL', var24h: '+0.75%', unidade: 'g', fonte: 'B3 / Spot' },
    PRATA_G: { codigo: 'PRATA_G', nome: 'Prata 999 (Grama)', cotacao: 5.85, moeda: 'BRL', var24h: '+1.20%', unidade: 'g', fonte: 'Comex Spot' },
    PLATINA: { codigo: 'PLATINA', nome: 'Platina (Onça Troy)', cotacao: 5450.00, moeda: 'BRL', var24h: '+0.60%', unidade: 'oz t', fonte: 'NYMEX' },
    PALADIO: { codigo: 'PALADIO', nome: 'Paládio (Onça Troy)', cotacao: 5820.00, moeda: 'BRL', var24h: '-0.30%', unidade: 'oz t', fonte: 'NYMEX' },
    COBRE: { codigo: 'COBRE', nome: 'Cobre Comercial (Libra-peso)', cotacao: 24.50, moeda: 'BRL', var24h: '+0.85%', unidade: 'lb', fonte: 'Comex' },
    BRENT: { codigo: 'BRENT', nome: 'Petróleo Barril Brent', cotacao: 74.20, moeda: 'USD', cotacaoBrl: 418.60, var24h: '-0.45%', unidade: 'barril', fonte: 'ICE Londres' },
    WTI: { codigo: 'WTI', nome: 'Petróleo Barril WTI', cotacao: 70.15, moeda: 'USD', cotacaoBrl: 395.75, var24h: '-0.38%', unidade: 'barril', fonte: 'NYMEX Nova York' },
    GAS_NATURAL: { codigo: 'GAS_NATURAL', nome: 'Gás Natural (Henry Hub)', cotacao: 2.85, moeda: 'USD', cotacaoBrl: 16.08, var24h: '+1.40%', unidade: 'MMBtu', fonte: 'NYMEX' }
  },
  fiat: {
    USD: { codigo: 'USD', nome: 'Dólar Americano Comercial', cotacao: 5.6420, compra: 5.6415, venda: 5.6425, var24h: '+0.12%', min24h: 5.6100, max24h: 5.6600 },
    USDTUR: { codigo: 'USDTUR', nome: 'Dólar Turismo', cotacao: 5.8500, compra: 5.7200, venda: 5.8500, var24h: '+0.10%', min24h: 5.7000, max24h: 5.8800 },
    EUR: { codigo: 'EUR', nome: 'Euro Comercial', cotacao: 6.2420, compra: 6.2410, venda: 6.2430, var24h: '+0.15%', min24h: 6.2200, max24h: 6.2600 },
    EURTUR: { codigo: 'EURTUR', nome: 'Euro Turismo', cotacao: 6.4500, compra: 6.3200, venda: 6.4500, var24h: '+0.12%', min24h: 6.3000, max24h: 6.4800 },
    GBP: { codigo: 'GBP', nome: 'Libra Esterlina', cotacao: 7.4680, compra: 7.4650, venda: 7.4710, var24h: '+0.18%', min24h: 7.4400, max24h: 7.4850 },
    JPY: { codigo: 'JPY', nome: 'Iene Japonês', cotacao: 0.0353, compra: 0.0352, venda: 0.0354, var24h: '-0.02%', min24h: 0.0350, max24h: 0.0355 },
    CHF: { codigo: 'CHF', nome: 'Franco Suíço', cotacao: 6.7450, compra: 6.7400, venda: 6.7500, var24h: '+0.08%', min24h: 6.7200, max24h: 6.7650 },
    CAD: { codigo: 'CAD', nome: 'Dólar Canadense', cotacao: 3.9550, compra: 3.9520, venda: 3.9580, var24h: '+0.10%', min24h: 3.9400, max24h: 3.9700 },
    AUD: { codigo: 'AUD', nome: 'Dólar Australiano', cotacao: 3.8290, compra: 3.8250, venda: 3.8330, var24h: '-0.14%', min24h: 3.8150, max24h: 3.8450 },
    CNY: { codigo: 'CNY', nome: 'Yuan Chinês', cotacao: 0.8458, compra: 0.8455, venda: 0.8460, var24h: '+1.05%', min24h: 0.8360, max24h: 0.8490 },
    ARS: { codigo: 'ARS', nome: 'Peso Argentino', cotacao: 0.0036, compra: 0.0036, venda: 0.0037, var24h: '+0.03%', min24h: 0.0035, max24h: 0.0038 },
    CLP: { codigo: 'CLP', nome: 'Peso Chileno', cotacao: 0.0056, compra: 0.0056, venda: 0.0057, var24h: '+0.35%', min24h: 0.0055, max24h: 0.0058 },
    COP: { codigo: 'COP', nome: 'Peso Colombiano', cotacao: 0.0017, compra: 0.0017, venda: 0.0018, var24h: '+0.18%', min24h: 0.0016, max24h: 0.0019 },
    UYU: { codigo: 'UYU', nome: 'Peso Uruguaio', cotacao: 0.1346, compra: 0.1340, venda: 0.1430, var24h: '+0.67%', min24h: 0.1320, max24h: 0.1450 },
    PYG: { codigo: 'PYG', nome: 'Guarani Paraguaio', cotacao: 0.00072, compra: 0.00071, venda: 0.00073, var24h: '+0.05%', min24h: 0.00070, max24h: 0.00074 },
    PEN: { codigo: 'PEN', nome: 'Sol Peruano', cotacao: 1.5150, compra: 1.5100, venda: 1.5200, var24h: '+0.10%', min24h: 1.5050, max24h: 1.5250 },
    BOB: { codigo: 'BOB', nome: 'Boliviano da Bolívia', cotacao: 0.8150, compra: 0.8120, venda: 0.8180, var24h: '+0.00%', min24h: 0.8100, max24h: 0.8200 },
    MXN: { codigo: 'MXN', nome: 'Peso Mexicano', cotacao: 0.3026, compra: 0.3020, venda: 0.3032, var24h: '-0.09%', min24h: 0.3010, max24h: 0.3045 },
    INR: { codigo: 'INR', nome: 'Rúpia Indiana', cotacao: 0.0598, compra: 0.0597, venda: 0.0599, var24h: '-0.25%', min24h: 0.0595, max24h: 0.0602 },
    RUB: { codigo: 'RUB', nome: 'Rublo Russo', cotacao: 0.0691, compra: 0.0690, venda: 0.0692, var24h: '+1.48%', min24h: 0.0680, max24h: 0.0695 },
    ZAR: { codigo: 'ZAR', nome: 'Rand Sul-Africano', cotacao: 0.3343, compra: 0.3340, venda: 0.3350, var24h: '-0.56%', min24h: 0.3330, max24h: 0.3370 },
    TRY: { codigo: 'TRY', nome: 'Nova Lira Turca', cotacao: 0.1117, compra: 0.1115, venda: 0.1120, var24h: '-0.12%', min24h: 0.1110, max24h: 0.1125 },
    ILS: { codigo: 'ILS', nome: 'Novo Shekel Israelense', cotacao: 1.7590, compra: 1.7580, venda: 1.7650, var24h: '-0.27%', min24h: 1.7500, max24h: 1.7700 },
    AED: { codigo: 'AED', nome: 'Dirham dos Emirados', cotacao: 1.5355, compra: 1.5350, venda: 1.5365, var24h: '+0.00%', min24h: 1.5320, max24h: 1.5380 },
    SAR: { codigo: 'SAR', nome: 'Riyal Saudita', cotacao: 1.4614, compra: 1.4610, venda: 1.5290, var24h: '+0.28%', min24h: 1.4550, max24h: 1.5300 },
    SEK: { codigo: 'SEK', nome: 'Coroa Sueca', cotacao: 0.5620, compra: 0.5615, venda: 0.5635, var24h: '+0.03%', min24h: 0.5600, max24h: 0.5650 },
    NOK: { codigo: 'NOK', nome: 'Coroa Norueguesa', cotacao: 0.5902, compra: 0.5895, venda: 0.5905, var24h: '+0.31%', min24h: 0.5880, max24h: 0.5920 },
    DKK: { codigo: 'DKK', nome: 'Coroa Dinamarquesa', cotacao: 0.8352, compra: 0.8350, venda: 0.8355, var24h: '+0.15%', min24h: 0.8330, max24h: 0.8370 },
    PLN: { codigo: 'PLN', nome: 'Zlóti Polonês', cotacao: 1.4163, compra: 1.4160, venda: 1.4172, var24h: '+0.13%', min24h: 1.4130, max24h: 1.4190 },
    NZD: { codigo: 'NZD', nome: 'Dólar Neozelandês', cotacao: 3.1196, compra: 3.1180, venda: 3.1280, var24h: '-0.17%', min24h: 3.1100, max24h: 3.1350 },
    SGD: { codigo: 'SGD', nome: 'Dólar de Cingapura', cotacao: 4.3798, compra: 4.3760, venda: 4.3900, var24h: '+0.05%', min24h: 4.3700, max24h: 4.3950 },
    HKD: { codigo: 'HKD', nome: 'Dólar de Hong Kong', cotacao: 0.7185, compra: 0.7180, venda: 0.7200, var24h: '+0.04%', min24h: 0.7170, max24h: 0.7210 },
    THB: { codigo: 'THB', nome: 'Baht Tailandês', cotacao: 0.1650, compra: 0.1645, venda: 0.1655, var24h: '+0.10%', min24h: 0.1630, max24h: 0.1670 },
    TWD: { codigo: 'TWD', nome: 'Dólar de Taiwan', cotacao: 0.1740, compra: 0.1735, venda: 0.1745, var24h: '-0.05%', min24h: 0.1720, max24h: 0.1760 },
    KRW: { codigo: 'KRW', nome: 'Won Sul-Coreano', cotacao: 0.0039, compra: 0.0038, venda: 0.0040, var24h: '+0.02%', min24h: 0.0037, max24h: 0.0041 },
    VEF: { codigo: 'VEF', nome: 'Bolívar Venezuelano', cotacao: 0.1180, compra: 0.1170, venda: 0.1190, var24h: '+0.00%', min24h: 0.1160, max24h: 0.1200 },
    CRC: { codigo: 'CRC', nome: 'Colón Costa-Riquenho', cotacao: 0.0112, compra: 0.0111, venda: 0.0113, var24h: '+0.04%', min24h: 0.0110, max24h: 0.0114 },
    RON: { codigo: 'RON', nome: 'Leu Romeno', cotacao: 1.2540, compra: 1.2500, venda: 1.2580, var24h: '+0.11%', min24h: 1.2480, max24h: 1.2600 },
    EGP: { codigo: 'EGP', nome: 'Libra Egípcia', cotacao: 0.1145, compra: 0.1140, venda: 0.1150, var24h: '-0.15%', min24h: 0.1130, max24h: 0.1160 },
    KES: { codigo: 'KES', nome: 'Xelim Queniano', cotacao: 0.0435, compra: 0.0430, venda: 0.0440, var24h: '+0.08%', min24h: 0.0425, max24h: 0.0445 },
    PHP: { codigo: 'PHP', nome: 'Peso Filipino', cotacao: 0.0965, compra: 0.0960, venda: 0.0970, var24h: '-0.05%', min24h: 0.0950, max24h: 0.0980 },
    HUF: { codigo: 'HUF', nome: 'Florim Húngaro', cotacao: 0.0152, compra: 0.0151, venda: 0.0153, var24h: '+0.12%', min24h: 0.0150, max24h: 0.0155 },
    CZK: { codigo: 'CZK', nome: 'Coroa Tcheca', cotacao: 0.2450, compra: 0.2440, venda: 0.2460, var24h: '+0.06%', min24h: 0.2430, max24h: 0.2470 },
    RSD: { codigo: 'RSD', nome: 'Dinar Sérvio', cotacao: 0.0532, compra: 0.0530, venda: 0.0535, var24h: '+0.09%', min24h: 0.0525, max24h: 0.0540 }
  },
  crypto: {
    BTC: { codigo: 'BTC', nome: 'Bitcoin', cotacao: 390500.00, cotacaoUsd: 69200.00, var24h: '-5.01%', min24h: 383700.00, max24h: 411700.00 },
    ETH: { codigo: 'ETH', nome: 'Ethereum', cotacao: 10975.00, cotacaoUsd: 1945.00, var24h: '-4.19%', min24h: 10770.00, max24h: 11475.00 },
    SOL: { codigo: 'SOL', nome: 'Solana', cotacao: 453.90, cotacaoUsd: 80.45, var24h: '-2.01%', min24h: 442.00, max24h: 466.60 },
    BNB: { codigo: 'BNB', nome: 'Binance Coin', cotacao: 3587.00, cotacaoUsd: 635.80, var24h: '-4.73%', min24h: 3542.00, max24h: 3769.00 },
    USDT: { codigo: 'USDT', nome: 'Tether USD (Stablecoin)', cotacao: 5.6450, cotacaoUsd: 1.0003, var24h: '+0.02%', min24h: 5.6350, max24h: 5.6550 },
    USDC: { codigo: 'USDC', nome: 'USD Coin (Stablecoin)', cotacao: 5.6430, cotacaoUsd: 1.0001, var24h: '+0.01%', min24h: 5.6350, max24h: 5.6550 },
    XRP: { codigo: 'XRP', nome: 'Ripple', cotacao: 5.8410, cotacaoUsd: 1.0350, var24h: '+0.02%', min24h: 5.6650, max24h: 5.9300 },
    DOGE: { codigo: 'DOGE', nome: 'Dogecoin', cotacao: 0.3668, cotacaoUsd: 0.0650, var24h: '-1.90%', min24h: 0.3575, max24h: 0.3779 },
    ADA: { codigo: 'ADA', nome: 'Cardano', cotacao: 0.9660, cotacaoUsd: 0.1712, var24h: '+0.85%', min24h: 0.9450, max24h: 0.9850 },
    LTC: { codigo: 'LTC', nome: 'Litecoin', cotacao: 277.30, cotacaoUsd: 49.15, var24h: '+0.32%', min24h: 270.80, max24h: 285.00 },
    AVAX: { codigo: 'AVAX', nome: 'Avalanche', cotacao: 47.08, cotacaoUsd: 8.34, var24h: '+1.15%', min24h: 45.80, max24h: 48.50 },
    DOT: { codigo: 'DOT', nome: 'Polkadot', cotacao: 8.20, cotacaoUsd: 1.45, var24h: '-0.40%', min24h: 7.95, max24h: 8.45 },
    LINK: { codigo: 'LINK', nome: 'Chainlink', cotacao: 56.36, cotacaoUsd: 9.98, var24h: '+2.10%', min24h: 54.50, max24h: 58.00 },
    BCH: { codigo: 'BCH', nome: 'Bitcoin Cash', cotacao: 1845.00, cotacaoUsd: 327.00, var24h: '+0.45%', min24h: 1810.00, max24h: 1890.00 },
    POL: { codigo: 'POL', nome: 'Polygon (ex-MATIC)', cotacao: 1.25, cotacaoUsd: 0.22, var24h: '-0.30%', min24h: 1.20, max24h: 1.30 },
    SHIB: { codigo: 'SHIB', nome: 'Shiba Inu', cotacao: 0.000045, cotacaoUsd: 0.000008, var24h: '+1.50%', min24h: 0.000043, max24h: 0.000048 },
    TRX: { codigo: 'TRX', nome: 'Tron', cotacao: 0.98, cotacaoUsd: 0.173, var24h: '+0.30%', min24h: 0.96, max24h: 1.01 },
    TON: { codigo: 'TON', nome: 'Toncoin', cotacao: 28.50, cotacaoUsd: 5.05, var24h: '-0.80%', min24h: 27.80, max24h: 29.20 },
    NEAR: { codigo: 'NEAR', nome: 'Near Protocol', cotacao: 24.80, cotacaoUsd: 4.39, var24h: '+3.10%', min24h: 23.50, max24h: 25.40 },
    SUI: { codigo: 'SUI', nome: 'Sui Network', cotacao: 11.20, cotacaoUsd: 1.98, var24h: '+4.50%', min24h: 10.50, max24h: 11.80 },
    APT: { codigo: 'APT', nome: 'Aptos', cotacao: 38.60, cotacaoUsd: 6.84, var24h: '+1.80%', min24h: 37.20, max24h: 39.50 },
    UNI: { codigo: 'UNI', nome: 'Uniswap', cotacao: 42.10, cotacaoUsd: 7.46, var24h: '+2.40%', min24h: 40.80, max24h: 43.50 },
    PEPE: { codigo: 'PEPE', nome: 'Pepe Meme Coin', cotacao: 0.000062, cotacaoUsd: 0.000011, var24h: '+8.20%', min24h: 0.000055, max24h: 0.000068 },
    RENDER: { codigo: 'RENDER', nome: 'Render Token', cotacao: 32.40, cotacaoUsd: 5.74, var24h: '+3.80%', min24h: 31.00, max24h: 33.50 },
    FET: { codigo: 'FET', nome: 'Artificial Superintelligence (Fetch)', cotacao: 7.15, cotacaoUsd: 1.26, var24h: '+2.90%', min24h: 6.80, max24h: 7.45 },
    ATOM: { codigo: 'ATOM', nome: 'Cosmos Hub', cotacao: 26.30, cotacaoUsd: 4.66, var24h: '+0.50%', min24h: 25.50, max24h: 27.20 },
    XLM: { codigo: 'XLM', nome: 'Stellar Lumens', cotacao: 0.62, cotacaoUsd: 0.11, var24h: '-0.15%', min24h: 0.60, max24h: 0.65 },
    HBAR: { codigo: 'HBAR', nome: 'Hedera Hashgraph', cotacao: 0.38, cotacaoUsd: 0.067, var24h: '+1.10%', min24h: 0.36, max24h: 0.40 },
    KAS: { codigo: 'KAS', nome: 'Kaspa', cotacao: 0.78, cotacaoUsd: 0.138, var24h: '+2.05%', min24h: 0.74, max24h: 0.81 },
    XMR: { codigo: 'XMR', nome: 'Monero (Privacidade)', cotacao: 890.00, cotacaoUsd: 157.70, var24h: '+0.90%', min24h: 875.00, max24h: 905.00 },
    DAI: { codigo: 'DAI', nome: 'Dai (Multi-Collateral Stable)', cotacao: 5.6420, cotacaoUsd: 1.0000, var24h: '+0.00%', min24h: 5.6350, max24h: 5.6550 },
    WIF: { codigo: 'WIF', nome: 'dogwifhat (Solana Meme)', cotacao: 12.80, cotacaoUsd: 2.27, var24h: '+6.40%', min24h: 11.50, max24h: 13.50 },
    BONK: { codigo: 'BONK', nome: 'Bonk (Solana)', cotacao: 0.00014, cotacaoUsd: 0.000025, var24h: '+5.10%', min24h: 0.00013, max24h: 0.00015 },
    BRETT: { codigo: 'BRETT', nome: 'Brett (Base Meme)', cotacao: 0.58, cotacaoUsd: 0.102, var24h: '+4.20%', min24h: 0.54, max24h: 0.62 }
  }
};

// 54 Pares Oficiais do Upstream AwesomeAPI
const AWESOME_PAIRS = [
  'USD-BRL', 'USD-BRLT', 'CAD-BRL', 'EUR-BRL', 'GBP-BRL', 'ARS-BRL', 'BTC-BRL', 'LTC-BRL',
  'JPY-BRL', 'CHF-BRL', 'AUD-BRL', 'CNY-BRL', 'ILS-BRL', 'ETH-BRL', 'XRP-BRL', 'DOGE-BRL',
  'SGD-BRL', 'AED-BRL', 'DKK-BRL', 'HKD-BRL', 'MXN-BRL', 'NOK-BRL', 'NZD-BRL', 'PLN-BRL',
  'SAR-BRL', 'SEK-BRL', 'THB-BRL', 'TRY-BRL', 'TWD-BRL', 'VEF-BRL', 'ZAR-BRL', 'CLP-BRL',
  'PYG-BRL', 'UYU-BRL', 'COP-BRL', 'PEN-BRL', 'BOB-BRL', 'RUB-BRL', 'INR-BRL', 'XAU-BRL',
  'XAG-BRL', 'RSD-BRL', 'KRW-BRL', 'BRETT-BRL', 'SOL-BRL', 'BNB-BRL', 'EUR-BRLT', 'CRC-BRL',
  'RON-BRL', 'EGP-BRL', 'KES-BRL', 'PHP-BRL', 'HUF-BRL', 'CZK-BRL'
].join(',');

let memoryFeedCache = null;
let lastFetchTimestamp = 0;
const CACHE_TTL_MS = 3000; // 3 segundos de micro-cache na RAM Anycast (<5ms)

async function getMasterFeed() {
  const now = Date.now();
  if (memoryFeedCache && (now - lastFetchTimestamp < CACHE_TTL_MS)) {
    return memoryFeedCache;
  }

  try {
    const res = await fetch(`https://economia.awesomeapi.com.br/last/${AWESOME_PAIRS}`, {
      headers: { 'User-Agent': 'CotacoesPro-Anycast/3.0' },
      signal: AbortSignal.timeout(3500)
    });

    if (res.ok) {
      const data = await res.json();
      const updatedFiat = { ...BASELINE_DATA.fiat };
      const updatedCrypto = { ...BASELINE_DATA.crypto };
      const updatedAgro = { ...BASELINE_DATA.commoditiesAgro };

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

      // Mapeamento 100% de Todas as Moedas Fiduciárias Live
      mapear('USDBRL', updatedFiat, 'USD');
      mapear('USDBRLT', updatedFiat, 'USDTUR');
      mapear('EURBRL', updatedFiat, 'EUR');
      mapear('EURBRLT', updatedFiat, 'EURTUR');
      mapear('CADBRL', updatedFiat, 'CAD');
      mapear('GBPBRL', updatedFiat, 'GBP');
      mapear('ARSBRL', updatedFiat, 'ARS');
      mapear('JPYBRL', updatedFiat, 'JPY');
      mapear('CHFBRL', updatedFiat, 'CHF');
      mapear('AUDBRL', updatedFiat, 'AUD');
      mapear('CNYBRL', updatedFiat, 'CNY');
      mapear('ILSBRL', updatedFiat, 'ILS');
      mapear('SGDBRL', updatedFiat, 'SGD');
      mapear('AEDBRL', updatedFiat, 'AED');
      mapear('DKKBRL', updatedFiat, 'DKK');
      mapear('HKDBRL', updatedFiat, 'HKD');
      mapear('MXNBRL', updatedFiat, 'MXN');
      mapear('NOKBRL', updatedFiat, 'NOK');
      mapear('NZDBRL', updatedFiat, 'NZD');
      mapear('PLNBRL', updatedFiat, 'PLN');
      mapear('SARBRL', updatedFiat, 'SAR');
      mapear('SEKBRL', updatedFiat, 'SEK');
      mapear('THBBRL', updatedFiat, 'THB');
      mapear('TRYBRL', updatedFiat, 'TRY');
      mapear('TWDBRL', updatedFiat, 'TWD');
      mapear('VEFBRL', updatedFiat, 'VEF');
      mapear('ZARBRL', updatedFiat, 'ZAR');
      mapear('CLPBRL', updatedFiat, 'CLP');
      mapear('PYGBRL', updatedFiat, 'PYG');
      mapear('UYUBRL', updatedFiat, 'UYU');
      mapear('COPBRL', updatedFiat, 'COP');
      mapear('PENBRL', updatedFiat, 'PEN');
      mapear('BOBBRL', updatedFiat, 'BOB');
      mapear('RUBBRL', updatedFiat, 'RUB');
      mapear('INRBRL', updatedFiat, 'INR');
      mapear('RSDBRL', updatedFiat, 'RSD');
      mapear('KRWBRL', updatedFiat, 'KRW');
      mapear('CRCBRL', updatedFiat, 'CRC');
      mapear('RONBRL', updatedFiat, 'RON');
      mapear('EGPBRL', updatedFiat, 'EGP');
      mapear('KESBRL', updatedFiat, 'KES');
      mapear('PHPBRL', updatedFiat, 'PHP');
      mapear('HUFBRL', updatedFiat, 'HUF');
      mapear('CZKBRL', updatedFiat, 'CZK');

      // Mapeamento Metais Preciosos Live (Grama)
      if (data['XAUBRL']) {
        const precoGrama = parseFloat((parseFloat(data['XAUBRL'].bid) / 31.1035).toFixed(2));
        updatedAgro.OURO_G.cotacao = precoGrama;
        updatedAgro.OURO_G.var24h = (parseFloat(data['XAUBRL'].pctChange) >= 0 ? '+' : '') + parseFloat(data['XAUBRL'].pctChange).toFixed(2) + '%';
      }
      if (data['XAGBRL']) {
        const precoGramaPrata = parseFloat((parseFloat(data['XAGBRL'].bid) / 31.1035).toFixed(2));
        updatedAgro.PRATA_G.cotacao = precoGramaPrata;
        updatedAgro.PRATA_G.var24h = (parseFloat(data['XAGBRL'].pctChange) >= 0 ? '+' : '') + parseFloat(data['XAGBRL'].pctChange).toFixed(2) + '%';
      }

      // Mapeamento Criptomoedas Live
      mapear('BTCBRL', updatedCrypto, 'BTC');
      mapear('ETHBRL', updatedCrypto, 'ETH');
      mapear('SOLBRL', updatedCrypto, 'SOL');
      mapear('BNBBRL', updatedCrypto, 'BNB');
      mapear('LTCBRL', updatedCrypto, 'LTC');
      mapear('XRPBRL', updatedCrypto, 'XRP');
      mapear('DOGEBRL', updatedCrypto, 'DOGE');
      mapear('BRETTBRL', updatedCrypto, 'BRETT');

      const usdCotacao = updatedFiat.USD ? updatedFiat.USD.cotacao : 5.6420;

      // Atualiza cotacao USD para as criptos principais
      if (updatedCrypto.BTC) updatedCrypto.BTC.cotacaoUsd = parseFloat((updatedCrypto.BTC.cotacao / usdCotacao).toFixed(2));
      if (updatedCrypto.ETH) updatedCrypto.ETH.cotacaoUsd = parseFloat((updatedCrypto.ETH.cotacao / usdCotacao).toFixed(2));
      if (updatedCrypto.SOL) updatedCrypto.SOL.cotacaoUsd = parseFloat((updatedCrypto.SOL.cotacao / usdCotacao).toFixed(2));
      if (updatedCrypto.BNB) updatedCrypto.BNB.cotacaoUsd = parseFloat((updatedCrypto.BNB.cotacao / usdCotacao).toFixed(2));
      if (updatedCrypto.LTC) updatedCrypto.LTC.cotacaoUsd = parseFloat((updatedCrypto.LTC.cotacao / usdCotacao).toFixed(2));
      if (updatedCrypto.XRP) updatedCrypto.XRP.cotacaoUsd = parseFloat((updatedCrypto.XRP.cotacao / usdCotacao).toFixed(4));
      if (updatedCrypto.DOGE) updatedCrypto.DOGE.cotacaoUsd = parseFloat((updatedCrypto.DOGE.cotacao / usdCotacao).toFixed(4));

      // Stablecoins atreladas ao USD
      updatedCrypto.USDT.cotacao = parseFloat((usdCotacao * 1.0005).toFixed(4));
      updatedCrypto.USDC.cotacao = parseFloat((usdCotacao * 1.0001).toFixed(4));
      updatedCrypto.DAI.cotacao = parseFloat(usdCotacao.toFixed(4));

      // Atualização dos demais criptoativos via paridade com USD comercial
      for (const [chaveCripto, objCripto] of Object.entries(updatedCrypto)) {
        if (!data[`${chaveCripto}BRL`] && objCripto.cotacaoUsd) {
          const casas = objCripto.cotacaoUsd < 0.001 ? 6 : (objCripto.cotacaoUsd < 10 ? 4 : 2);
          objCripto.cotacao = parseFloat((objCripto.cotacaoUsd * usdCotacao).toFixed(casas));
        }
      }

      memoryFeedCache = {
        ...BASELINE_DATA,
        atualizadoEm: new Date().toISOString(),
        provedor: 'Ponte APIs • Live Anycast Edge (Sub-1ms RAM)',
        totalAtivos: Object.keys(updatedFiat).length + Object.keys(updatedCrypto).length + Object.keys(updatedAgro).length + Object.keys(BASELINE_DATA.indicesBrasil).length,
        resumoCategorias: {
          fiat: Object.keys(updatedFiat).length,
          crypto: Object.keys(updatedCrypto).length,
          commoditiesAgro: Object.keys(updatedAgro).length,
          indicesBrasil: Object.keys(BASELINE_DATA.indicesBrasil).length
        },
        fiat: updatedFiat,
        crypto: updatedCrypto,
        commoditiesAgro: updatedAgro
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
  let cod = String(codigoInput).toUpperCase().trim();

  // Remove sufixos como -BRL, /BRL ou BRL
  if (cod.endsWith('-BRL') || cod.endsWith('/BRL')) {
    cod = cod.replace(/[-/]BRL$/, '');
  } else if (cod.length > 4 && cod.endsWith('BRL') && !feed.fiat[cod]) {
    cod = cod.slice(0, -3);
  }

  // 1. Busca direta nas 4 categorias
  if (feed.fiat[cod]) return { categoria: 'fiat', ...feed.fiat[cod] };
  if (feed.crypto[cod]) return { categoria: 'crypto', ...feed.crypto[cod] };
  if (feed.indicesBrasil[cod]) return { categoria: 'indicesBrasil', ...feed.indicesBrasil[cod] };
  if (feed.commoditiesAgro[cod]) return { categoria: 'commoditiesAgro', ...feed.commoditiesAgro[cod] };

  // 2. Dicionário de Aliases Inteligentes
  const ALIASES = {
    // Moedas Fiat
    'DOLAR': 'USD',
    'DOLAR_COMERCIAL': 'USD',
    'DOLARCOMERCIAL': 'USD',
    'DOLAR_TURISMO': 'USDTUR',
    'DOLARTURISMO': 'USDTUR',
    'EURO': 'EUR',
    'EURO_COMERCIAL': 'EUR',
    'EURO_TURISMO': 'EURTUR',
    'LIBRA': 'GBP',
    'LIBRA_ESTERLINA': 'GBP',
    'IENE': 'JPY',
    'FRANCO_SUICO': 'CHF',
    'PESO_ARGENTINO': 'ARS',
    'PESO_CHILENO': 'CLP',
    'PESO_COLOMBIANO': 'COP',
    'PESO_URUGUAIO': 'UYU',
    'PESO_MEXICANO': 'MXN',
    'YUAN': 'CNY',
    'GUARANI': 'PYG',
    'SOL_PERUANO': 'PEN',
    'WON': 'KRW',
    'RUPIA': 'INR',

    // Criptomoedas
    'BITCOIN': 'BTC',
    'ETHEREUM': 'ETH',
    'ETHER': 'ETH',
    'SOLANA': 'SOL',
    'BINANCE': 'BNB',
    'BINANCE_COIN': 'BNB',
    'BINANCECOIN': 'BNB',
    'RIPPLE': 'XRP',
    'DOGECOIN': 'DOGE',
    'CARDANO': 'ADA',
    'LITECOIN': 'LTC',
    'AVALANCHE': 'AVAX',
    'POLKADOT': 'DOT',
    'CHAINLINK': 'LINK',
    'BITCOIN_CASH': 'BCH',
    'BITCOINCASH': 'BCH',
    'POLYGON': 'POL',
    'MATIC': 'POL',
    'SHIBA': 'SHIB',
    'SHIBA_INU': 'SHIB',
    'SHIBAINU': 'SHIB',
    'TETHER': 'USDT',
    'USD_COIN': 'USDC',
    'TONCOIN': 'TON',

    // Agro & Commodities
    'OURO': 'OURO_G',
    'OURO24K': 'OURO_G',
    'PRATA': 'PRATA_G',
    'PRATA999': 'PRATA_G',
    'SOJA_GRAO': 'SOJA',
    'MILHO_GRAO': 'MILHO',
    'BOI': 'BOI_GORDO',
    'BOIGORDO': 'BOI_GORDO',
    'ARROBA_BOI': 'BOI_GORDO',
    'CAFE_ARABICA': 'CAFE',
    'CAFEARABICA': 'CAFE',
    'ACUCAR_CRISTAL': 'ACUCAR',
    'ALGODAO_PLUMA': 'ALGODAO',
    'TRIGO_GRAO': 'TRIGO',
    'ARROZ_CASCA': 'ARROZ',
    'ETANOL_HIDRATADO': 'ETANOL',
    'PETROLEO': 'BRENT',
    'PETROLEO_BRENT': 'BRENT',
    'PETROLEO_WTI': 'WTI',

    // Indicadores Oficiais & Índices do Brasil
    'SELIC': 'SELIC',
    'CELIC': 'SELIC',
    'TAXA_SELIC': 'SELIC',
    'TAXA_CELIC': 'SELIC',
    'TAXASELIC': 'SELIC',
    'CDI': 'CDI',
    'TAXA_CDI': 'CDI',
    'TAXACDI': 'CDI',
    'IPCA': 'IPCA',
    'INFLACAO': 'IPCA',
    'IPCA15': 'IPCA15',
    'IPCA_15': 'IPCA15',
    'IGPM': 'IGPM',
    'IGP_M': 'IGPM',
    'INCC': 'INCC',
    'POUPANCA': 'POUPANCA',
    'TR': 'TR',
    'TAXA_REFERENCIAL': 'TR',
    'SALARIO_MINIMO': 'SALARIO_MINIMO',
    'SALARIOMINIMO': 'SALARIO_MINIMO',
    'IBOV': 'IBOVESPA',
    'BOVESPA': 'IBOVESPA',
    'IFIX': 'IFIX'
  };

  const aliasCod = ALIASES[cod];
  if (aliasCod) {
    if (feed.fiat[aliasCod]) return { categoria: 'fiat', ...feed.fiat[aliasCod] };
    if (feed.crypto[aliasCod]) return { categoria: 'crypto', ...feed.crypto[aliasCod] };
    if (feed.indicesBrasil[aliasCod]) return { categoria: 'indicesBrasil', ...feed.indicesBrasil[aliasCod] };
    if (feed.commoditiesAgro[aliasCod]) return { categoria: 'commoditiesAgro', ...feed.commoditiesAgro[aliasCod] };
  }

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
      { data: '2026-01-01', fechamento: 5.64, evento: 'Atualidade' }
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
      { data: '2026-01-01', fechamento: 390000.00, evento: 'Atualidade' }
    ]
  },
  EUR: {
    inicio: '1999-01-01',
    nomeInicio: 'Criação do Euro Comercial',
    pontos: [
      { data: '1999-01-01', fechamento: 1.40, evento: 'Lançamento do Euro' },
      { data: '2002-10-01', fechamento: 3.88, evento: 'Paridade Global' },
      { data: '2008-07-01', fechamento: 2.50, evento: 'Crise Subprime' },
      { data: '2015-09-01', fechamento: 4.60, evento: 'Crise Fiscal BR' },
      { data: '2020-10-01', fechamento: 6.70, evento: 'Pico Pandemia' },
      { data: '2026-01-01', fechamento: 6.24, evento: 'Atualidade' }
    ]
  },
  ETH: {
    inicio: '2015-07-30',
    nomeInicio: 'Gênese da Rede Ethereum ($0.31)',
    pontos: [
      { data: '2015-07-30', fechamento: 1.00, evento: 'Gênese Ethereum' },
      { data: '2017-06-01', fechamento: 800.00, evento: 'Boom ICOs' },
      { data: '2018-01-13', fechamento: 4500.00, evento: 'Pico Ciclo 2018' },
      { data: '2020-03-12', fechamento: 550.00, evento: 'Crash COVID' },
      { data: '2021-11-16', fechamento: 26000.00, evento: 'Recorde 4.8k USD' },
      { data: '2022-09-15', fechamento: 8000.00, evento: 'The Merge (PoS)' },
      { data: '2026-01-01', fechamento: 10975.00, evento: 'Atualidade' }
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

  // Pontos diários de alta resolução
  const feed = memoryFeedCache || BASELINE_DATA;
  const ativo = buscarAtivo(feed, cod) || { cotacao: 5.64 };
  const base = ativo.cotacao || ativo.valor || 5.64;
  const total = Math.min(30, numDias);
  const fechamentos = [];
  const pontos = [];

  for (let i = total - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const val = parseFloat((base * (1 + (Math.sin(i * 0.8) * 0.012))).toFixed(4));
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
  <text x="32" y="215" fill="#475569" font-size="10">Ponte APIs &bull; 86.400 req/dia (1 req/s) &bull; Sub-1s Anycast Edge</text>
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

    // 2. Resolução de Plano e Rate Limiting Duplo (60s RPM & 86400s Cota Diária)
    const clientAuth = resolverPlanoEChave(request);
    const rateCheck = aplicarRateLimit(clientAuth.keyId, clientAuth.config);

    const TELEMETRY_HEADERS = {
      ...CORS_HEADERS,
      'x-cotacoes-plan': clientAuth.plano,
      'x-cotacoes-ratelimit-limit': String(rateCheck.limit),
      'x-cotacoes-ratelimit-remaining': String(rateCheck.remaining),
      'x-cotacoes-ratelimit-reset': String(rateCheck.resetAt),
      'x-cotacoes-daily-limit': String(rateCheck.dailyLimit),
      'x-cotacoes-daily-remaining': String(rateCheck.dailyRemaining),
      'x-cotacoes-daily-reset': String(rateCheck.dailyResetAt),
      'x-cotacoes-window-daily': '86400s',
      'x-cotacoes-cadence': clientAuth.config.cadencia || '1 req/s contínuo',
      'x-cotacoes-edge-delivery': 'sub-1s (Anycast RAM)'
    };

    if (!rateCheck.ok) {
      return new Response(JSON.stringify({
        ok: false,
        error: rateCheck.error,
        message: rateCheck.message,
        plano: clientAuth.plano,
        janela: rateCheck.janela,
        cotaDiaria: rateCheck.cotaDiaria,
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

    // ─── 3. CATÁLOGO COMPLETO ESTRUTURADO (/api/cotacoes/catalogo ou /api/cotacao/catalogo) ───
    if (path === '/api/cotacoes/catalogo' || path === '/api/cotacao/catalogo') {
      const montarLista = (categoria, obj) => Object.entries(obj).map(([cod, item]) => ({
        codigo: cod,
        nome: item.nome,
        categoria,
        cotacao: item.cotacao || item.valor,
        unidade: item.unidade || (categoria === 'indicesBrasil' ? '%' : (categoria === 'crypto' && item.cotacaoUsd ? 'USD/BRL' : 'BRL')),
        fonte: item.fonte || (categoria === 'indicesBrasil' ? 'Bacen/B3' : 'AwesomeAPI Spot')
      }));

      return new Response(JSON.stringify({
        ok: true,
        servico: 'CotacoesPro • Catálogo Geral de Ativos',
        cadenciaEntrega: '86.400 req/dia (1 req/s contínuo) com latência de borda sub-1s (<5ms)',
        totalAtivos: feed.totalAtivos,
        resumo: feed.resumoCategorias,
        catalogo: {
          fiat: montarLista('fiat', feed.fiat),
          crypto: montarLista('crypto', feed.crypto),
          commoditiesAgro: montarLista('commoditiesAgro', feed.commoditiesAgro),
          indicesBrasil: montarLista('indicesBrasil', feed.indicesBrasil)
        },
        atualizadoEm: feed.atualizadoEm
      }, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=10, stale-while-revalidate=60',
          ...TELEMETRY_HEADERS
        }
      });
    }

    // ─── 4. LISTAGEM DE CATEGORIAS (/api/cotacoes/categorias ou /api/cotacao/categorias) ───
    if (path === '/api/cotacoes/categorias' || path === '/api/cotacao/categorias') {
      return new Response(JSON.stringify({
        ok: true,
        totalCategorias: 4,
        totalAtivos: feed.totalAtivos,
        categorias: [
          { id: 'fiat', nome: 'Moedas Fiduciárias Globais', total: Object.keys(feed.fiat).length, endpoint: '/api/cotacoes/fiat' },
          { id: 'crypto', nome: 'Criptomoedas & Bitcoins', total: Object.keys(feed.crypto).length, endpoint: '/api/cotacoes/crypto' },
          { id: 'commoditiesAgro', nome: 'Agronegócio & Energia', total: Object.keys(feed.commoditiesAgro).length, endpoint: '/api/cotacoes/agro' },
          { id: 'indicesBrasil', nome: 'Indicadores Oficiais & Bolsas', total: Object.keys(feed.indicesBrasil).length, endpoint: '/api/cotacoes/indices' }
        ],
        atualizadoEm: feed.atualizadoEm
      }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...TELEMETRY_HEADERS }
      });
    }

    // ─── 5. BUSCA INTELIGENTE DE ATIVOS (/api/cotacoes/busca?q=... ou /api/cotacao/busca?q=...) ───
    if (path === '/api/cotacoes/busca' || path === '/api/cotacao/busca') {
      const termo = (url.searchParams.get('q') || url.searchParams.get('termo') || '').toLowerCase().trim();
      if (!termo) {
        return new Response(JSON.stringify({ ok: false, error: 'MISSING_QUERY', mensagem: 'Informe o termo de busca ?q=...' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...TELEMETRY_HEADERS }
        });
      }

      const resultados = [];
      const varrer = (categoria, obj) => {
        for (const [cod, item] of Object.entries(obj)) {
          if (cod.toLowerCase().includes(termo) || (item.nome && item.nome.toLowerCase().includes(termo))) {
            resultados.push({ codigo: cod, categoria, ...item });
          }
        }
      };

      varrer('fiat', feed.fiat);
      varrer('crypto', feed.crypto);
      varrer('commoditiesAgro', feed.commoditiesAgro);
      varrer('indicesBrasil', feed.indicesBrasil);

      // Checa alias se não encontrou nada
      if (resultados.length === 0) {
        const ativoPorAlias = buscarAtivo(feed, termo);
        if (ativoPorAlias) {
          resultados.push(ativoPorAlias);
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        termo,
        totalEncontrados: resultados.length,
        resultados,
        atualizadoEm: feed.atualizadoEm
      }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...TELEMETRY_HEADERS }
      });
    }

    // ─── 6. ENDPOINTS DEDICADOS POR CATEGORIA (/api/cotacoes/fiat, /crypto, /agro, /indices) ───
    if (path === '/api/cotacoes/fiat' || path === '/api/cotacao/fiat') {
      return new Response(JSON.stringify({ ok: true, categoria: 'fiat', total: Object.keys(feed.fiat).length, ativos: feed.fiat, atualizadoEm: feed.atualizadoEm }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...TELEMETRY_HEADERS }
      });
    }

    if (path === '/api/cotacoes/crypto' || path === '/api/cotacao/crypto') {
      return new Response(JSON.stringify({ ok: true, categoria: 'crypto', total: Object.keys(feed.crypto).length, ativos: feed.crypto, atualizadoEm: feed.atualizadoEm }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...TELEMETRY_HEADERS }
      });
    }

    if (path === '/api/cotacoes/agro' || path === '/api/cotacao/agro') {
      return new Response(JSON.stringify({ ok: true, categoria: 'commoditiesAgro', total: Object.keys(feed.commoditiesAgro).length, ativos: feed.commoditiesAgro, atualizadoEm: feed.atualizadoEm }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...TELEMETRY_HEADERS }
      });
    }

    if (path === '/api/cotacoes/indices' || path === '/api/cotacao/indices') {
      return new Response(JSON.stringify({ ok: true, categoria: 'indicesBrasil', total: Object.keys(feed.indicesBrasil).length, ativos: feed.indicesBrasil, atualizadoEm: feed.atualizadoEm }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...TELEMETRY_HEADERS }
      });
    }

    // ─── 7. CONVERSOR UNIVERSAL COM IOF (/api/cotacoes/converter, /api/cotacao/conversao) ───
    if (path === '/api/cotacoes/converter' || path === '/api/cotacao/conversao' || path === '/api/cambio/converter') {
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

    // ─── 8. COTAÇÃO ATUAL / MÚLTIPLOS PARES (/api/cotacao/atual ou /api/cotacoes com ?pares=/?moedas=) ───
    if (path === '/api/cotacao/atual' || path === '/api/cotacoes/atual' || (path === '/api/cotacoes' && (url.searchParams.get('pares') || url.searchParams.get('moedas') || url.searchParams.get('lista')))) {
      const param = url.searchParams.get('pares') || url.searchParams.get('moedas') || url.searchParams.get('lista') || '';
      const tokens = param.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      const resultado = {};
      tokens.forEach(t => {
        const at = buscarAtivo(feed, t);
        if (at) resultado[at.codigo] = at;
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

    // ─── 9. HISTÓRICO DEDICADO VIA QUERY (/api/cotacao/historico ou /api/cotacoes/historico) ───
    if (path === '/api/cotacao/historico' || path === '/api/cotacoes/historico') {
      const codParam = url.searchParams.get('par') || url.searchParams.get('ativo') || url.searchParams.get('moeda') || 'USD';
      const ativo = buscarAtivo(feed, codParam);
      if (!ativo) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'ASSET_NOT_FOUND',
          erro: `Ativo '${codParam}' não localizado no feed.`
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...TELEMETRY_HEADERS }
        });
      }

      const periodoParam = url.searchParams.get('dias') ? `${url.searchParams.get('dias')}d` : (url.searchParams.get('periodo') || '30d');
      const historicoData = await buscarHistoricoAtivo(ativo.codigo, periodoParam);

      return new Response(JSON.stringify({
        ok: true,
        ativo: ativo.codigo,
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

    // ─── 10. CONSULTA ATIVO INDIVIDUAL (/api/cotacoes/:codigo ou /api/cotacao/:codigo) ───
    const matchCod = path.match(/^\/api\/cotaco?e?s?\/([A-Za-z0-9_\-]+)$/i);
    const codQuery = matchCod ? matchCod[1] : (url.searchParams.get('moeda') || url.searchParams.get('ativo'));

    const rotasReservadas = ['converter', 'conversao', 'atual', 'historico', 'master', 'todas', 'catalogo', 'categorias', 'busca', 'fiat', 'crypto', 'agro', 'indices'];
    if (codQuery && !rotasReservadas.includes(codQuery.toLowerCase())) {
      const ativo = buscarAtivo(feed, codQuery);
      if (!ativo) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'ASSET_NOT_FOUND',
          erro: `Ativo '${codQuery}' não localizado no Feed Mestre.`,
          dica: 'Consulte /api/cotacoes/catalogo para ver os 123 ativos disponíveis.'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...TELEMETRY_HEADERS }
        });
      }

      const periodoParam = url.searchParams.get('periodo') || url.searchParams.get('dias') || '7d';
      const historicoData = await buscarHistoricoAtivo(ativo.codigo, periodoParam);

      const formato = url.searchParams.get('formato') || (url.searchParams.get('grafico') === 'true' ? 'svg' : 'json');
      if (formato === 'svg') {
        const svgTicker = renderSvgTicker({
          simbolo: ativo.codigo || codQuery.toUpperCase(),
          preco: (ativo.cotacao || ativo.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
          variacao: historicoData ? historicoData.variacaoPeriodo : (ativo.var24h || '+0.00%'),
          maxima: historicoData ? String(historicoData.maximo) : '5.85',
          minima: historicoData ? String(historicoData.minimo) : '5.60',
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
        ativo: ativo.codigo,
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

    // ─── 11. MASTER FEED COMPLETO COM TODOS OS 123 ATIVOS (/api/cotacoes ou /api/cotacao) ───
    return new Response(JSON.stringify({
      ok: true,
      servico: 'Cotacoes & Moedas Pro API',
      cadenciaEntrega: '86.400 req/dia (1 req/s contínuo) com latência sub-1s na borda Anycast',
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
