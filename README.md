# 🌐 CotacoesPro API & SDK Oficial

[![npm version](https://img.shields.io/npm/v/cotacoes-pro.svg?color=10b981)](https://www.npmjs.com/package/cotacoes-pro)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Edge Latency](https://img.shields.io/badge/Latency-%3C5ms%20(Sub--1s)-10b981.svg)](https://ponte.ozpro.com.br)
[![Cloudflare Workers](https://img.shields.io/badge/Runtime-Cloudflare%20Edge%20Anycast-F38020.svg)](https://workers.cloudflare.com)
[![Catálogo Total](https://img.shields.io/badge/Ativos%20Catalogados-170%20Ativos-8b5cf6.svg)](#-4-catálogo-geral-de-ativos-170-ativos-em-tempo-real)
[![Taxa de Entrega](https://img.shields.io/badge/Entrega-86.400%20req%2Fdia%20(1%20req%2Fs)-0ea5e9.svg)](#-2-arquitetura-de-vazão-86400-reqdia--1-reqs-contínuo)

API de Alta Frequência e SDK Oficial de **Cotações Globais em Tempo Real: 64 Moedas Fiduciárias, 48 Criptomoedas e Bitcoins, 32 Commodities Agropecuárias e Mineração, e 26 Indicadores Econômicos Oficiais**.

Projetada para aplicações corporativas, fintechs, e-commerces e planilhas com **cadência contínua garantida de 1 requisição por segundo (86.400 req/dia)** e entrega ultrarrápida na borda Cloudflare Anycast (<5ms de latência RAM).

---

## ⚡ 1. Destaques da Infraestrutura

* **170 Ativos Consolidados**: 64 moedas mundiais (Américas, Europa, Ásia, África, CPLP, Oriente Médio), 48 criptoativos (BTC, ETH, SOL, BNB, etc.), 32 commodities agropecuárias (Cepea/Esalq/B3) e 26 índices oficiais (Bacen, IBGE, FGV, B3, S&P, Nasdaq).
* **Cadência Contínua de 1 req/s (86.400 req/dia)**: Controle rígido de vazão por isolate na Cloudflare Edge com dupla janela (60s RPM e 86.400s diário).
* **Ranking de Mercado em Tempo Real**: Endpoint com as maiores altas (Top Gainers), maiores baixas (Top Losers) e ativos mais populares.
* **Simulador de Investimentos com IR Regressivo**: Cálculo financeiro comparativo entre Tesouro Selic, CDI 100%, Poupança e Inflação (IPCA), com alíquota regressiva oficial de IR.
* **Cotações Cruzadas Diretas REST**: `GET /api/cotacoes/:de/:para` (ex: `/USD/BRL`, `/EUR/USD`, `/BTC/BRL`).
* **Multi-Formato**: Saída nativa em **JSON**, **CSV** (integração direta com Excel e Google Sheets via `=IMPORTDATA`), **XML** e gráficos vetoriais **SVG**.
* **Micro-cache de Borda (3s)**: Respostas sub-1s (<5ms) com proteção de upstream.

---

## ⏱️ 2. Arquitetura de Vazão: 86.400 req/dia & 1 req/s Contínuo

$$\text{86.400 segundos por dia} \times 1\text{ requisição por segundo} = \mathbf{86.400\text{ requisições diárias}}$$

O plano **Starter 86.400** garante que robôs, bots de arbitragem, e-commerces e sistemas contábeis possam efetuar **1 requisição a cada 1 segundo ininterruptamente durante as 24 horas do dia**:

| Plano | Vazão (RPM / 60s) | Cota Diária (86.400s) | Cadência Efetiva | Finalidade Recomendada |
|---|---|---|---|---|
| 🟢 **Free / Sandbox** | 30 RPM | 500 req / dia | 0.5 req/s pico | Prototipagem e desenvolvimento |
| 🔵 **Starter 86.400** | **60 RPM (1 req/s)** | **86.400 req / dia** | **1 req/s contínuo 24/7** | E-commerce, checkouts e robôs de cotação |
| 🟣 **Pro** | 300 RPM (5 req/s) | 250.000 req / dia | 5 req/s contínuo | Fintechs, ERPs e portais de notícias |
| 🟠 **Business Enterprise** | 1.200 RPM (20 req/s) | 1.000.000 req / dia | 20 req/s contínuo | Bancos, corretoras e alto volume institucional |
| 🔴 **Master Admin** | 3.000 RPM (50 req/s) | Ilimitado (Infinity) | Vazão sem restrições | Gestão central de infraestrutura |

### Telemetria HTTP em 100% das Respostas
```http
x-cotacoes-plan: starter
x-cotacoes-ratelimit-limit: 60
x-cotacoes-ratelimit-remaining: 59
x-cotacoes-daily-limit: 86400
x-cotacoes-daily-remaining: 86399
x-cotacoes-daily-reset: 1794675600
x-cotacoes-window-daily: 86400s
x-cotacoes-cadence: 1 req/s contínuo 24/7
x-cotacoes-edge-delivery: sub-1s (Anycast RAM)
```

---

## 🔑 3. Autenticação (RFC 6750 Bearer & x-api-key)

```http
Authorization: Bearer cot_start_live_token123
```
*(ou cabeçalho `x-api-key: cot_start_live_token123`)*

---

## 📊 4. Catálogo Geral de Ativos (170 Ativos em Tempo Real)

### 🪙 A. 64 Moedas Fiduciárias Globais (Câmbio Comercial & Turismo)
Rota especializada: `GET /api/cotacoes/fiat` (suporta `?formato=csv`)

* **Américas (16)**: `USD` (Dólar Comercial), `USDTUR` (Dólar Turismo), `CAD` (Dólar Canadense), `MXN` (Peso Mexicano), `ARS` (Peso Argentino), `CLP` (Peso Chileno), `COP` (Peso Colombiano), `UYU` (Peso Uruguaio), `PYG` (Guarani Paraguaio), `PEN` (Sol Peruano), `BOB` (Boliviano), `CRC` (Colón Costa-Riquenho), `DOP` (Peso Dominicano), `GTQ` (Quetzal Guatemala), `HNL` (Lempira Honduras), `VEF` (Bolívar Venezuelano).
* **Europa (17)**: `EUR` (Euro Comercial), `EURTUR` (Euro Turismo), `GBP` (Libra Esterlina), `CHF` (Franco Suíço), `SEK` (Coroa Sueca), `NOK` (Coroa Norueguesa), `DKK` (Coroa Dinamarquesa), `PLN` (Zlóti Polonês), `CZK` (Coroa Tcheca), `HUF` (Florim Húngaro), `RON` (Leu Romeno), `RSD` (Dinar Sérvio), `RUB` (Rublo Russo), `ISK` (Coroa Islandesa), `BGN` (Lev Búlgaro), `ALL` (Lek Albanês), `BAM` (Marco da Bósnia).
* **Ásia & Oceania (16)**: `JPY` (Iene Japonês), `CNY` (Yuan Chinês), `INR` (Rúpia Indiana), `KRW` (Won Sul-Coreano), `SGD` (Dólar de Cingapura), `HKD` (Dólar de Hong Kong), `TWD` (Dólar de Taiwan), `THB` (Baht Tailandês), `PHP` (Peso Filipino), `AUD` (Dólar Australiano), `NZD` (Dólar Neozelandês), `IDR` (Rúpia Indonésia), `VND` (Dong Vietnamita), `MYR` (Ringgit Malásia), `PKR` (Rúpia Paquistanesa), `BDT` (Taka Bangladesh).
* **Oriente Médio (8)**: `ILS` (Novo Shekel Israelense), `AED` (Dirham dos Emirados), `SAR` (Riyal Saudita), `TRY` (Nova Lira Turca), `QAR` (Rial do Catar), `KWD` (Dinar do Kuwait - maior valor global), `BHD` (Dinar do Bahrein), `OMR` (Rial de Omã).
* **África & CPLP (7)**: `ZAR` (Rand Sul-Africano), `EGP` (Libra Egípcia), `KES` (Xelim Queniano), `AOA` (Kwanza Angolano), `MZN` (Metical Moçambicano), `CVE` (Escudo Cabo-Verdiano), `MAD` (Dirham Marroquino).

---

### ⚡ B. 48 Criptomoedas e Criptoativos
Rota especializada: `GET /api/cotacoes/crypto` (suporta `?formato=csv`)

* **Layer 1 & Principais**: `BTC` (Bitcoin), `ETH` (Ethereum), `SOL` (Solana), `BNB` (Binance Coin), `ADA` (Cardano), `AVAX` (Avalanche), `DOT` (Polkadot), `SUI` (Sui), `APT` (Aptos), `NEAR` (Near), `TON` (Toncoin), `ATOM` (Cosmos), `KAS` (Kaspa), `TRX` (Tron), `FTM` (Fantom), `ALGO` (Algorand), `SEI` (Sei), `TIA` (Celestia).
* **Pagamentos & Privacidade**: `LTC` (Litecoin), `BCH` (Bitcoin Cash), `XRP` (Ripple), `XLM` (Stellar), `HBAR` (Hedera), `XMR` (Monero).
* **DeFi, Oráculos & IA**: `LINK` (Chainlink), `UNI` (Uniswap), `AAVE` (Aave), `MKR` (Maker), `CRV` (Curve), `LDO` (Lido), `INJ` (Injective), `RUNE` (THORChain), `RENDER` (Render Token), `FET` (Artificial Superintelligence Alliance), `GRT` (The Graph), `STX` (Stacks Bitcoin L2).
* **Stablecoins Pegadas**: `USDT` (Tether USD), `USDC` (USD Coin), `DAI` (Dai Stablecoin).
* **Gaming & Metaverso**: `SAND` (The Sandbox), `MANA` (Decentraland).
* **Memecoins**: `DOGE` (Dogecoin), `SHIB` (Shiba Inu), `PEPE` (Pepe Coin), `WIF` (dogwifhat), `BONK` (Bonk), `BRETT` (Brett).

---

### 🌾 C. 32 Commodities Agropecuárias, Mineração, Metais & Energia
Rota especializada: `GET /api/cotacoes/agro` (suporta `?formato=csv`)

* **Grãos, Fibras & Hortifrúti (12)**: `SOJA` (Saca 60kg - Cepea), `MILHO` (Saca 60kg - Cepea), `TRIGO` (Tonelada - Cepea), `ARROZ` (Saca 50kg - Cepea), `ALGODAO` (Libra-peso - Cepea), `SORGO` (Saca 60kg - Cepea), `BATATA` (Saca 50kg - Ceagesp), `CEBOLA` (Saca 20kg - Ceagesp), `TOMATE` (Caixa 20kg - Ceagesp), `ETANOL` (Hidratado $m^3$ - Cepea), `ETANOL_ANIDRO` (Anidro $m^3$ - Cepea), `MANDIOCA` (Fécula Tonelada - Cepea).
* **Pecuária, Proteína & Avicultura (6)**: `BOI_GORDO` (Arroba 15kg - Cepea/B3), `BEZERRO` (Cabeça Nelore - Cepea), `SUINO` (Quilo vivo - Cepea), `FRANGO` (Quilo congelado - Cepea), `LEITE` (Litro cru - Cepea), `OVOS` (Caixa 30 dúzias - Cepea).
* **Café, Açúcar & Fertilizantes (4)**: `CAFE` (Arábica Tipo 6 saca 60kg - Cepea/B3), `CAFE_CONILON` (Conilon Tipo 7 saca 60kg - Cepea), `ACUCAR` (Cristal saca 50kg - Cepea), `UREIA` (Fertilizante Granulado Tonelada).
* **Metais Preciosos, Industriais & Mineração (7)**: `OURO_G` (Ouro 24K Grama - B3 Spot), `PRATA_G` (Prata 999 Grama), `PLATINA` (Onça Troy - NYMEX), `PALADIO` (Onça Troy - NYMEX), `COBRE` (Libra-peso - Comex), `MINERIO_FERRO` (Minério 62% Fe CFR Qingdao Tonelada), `LITIO` (Carbonato de Lítio Tonelada).
* **Energia & Combustíveis (3)**: `BRENT` (Petróleo Barril - ICE Londres), `WTI` (Petróleo Barril - NYMEX Nova York), `GAS_NATURAL` (Henry Hub MMBtu).

---

### 📈 D. 26 Indicadores Econômicos Oficiais, Juros & Bolsas
Rota especializada: `GET /api/cotacoes/indices` (suporta `?formato=csv`)

* **Taxas de Juros & Crédito**: `SELIC` (Taxa Selic Over % a.a. - Bacen - aceita alias `CELIC`), `SELIC_META` (Meta Copom), `CDI` (Taxa CDI Anualizada B3), `JUROS_REAIS` (Juros Reais ex-ante), `TR` (Taxa Referencial Diária), `TLP` (Taxa Longo Prazo BNDES), `TJLP` (Taxa Juros Longo Prazo).
* **Inflação & Custos**: `IPCA` (Inflação Oficial IBGE % acum. 12m), `IPCA15` (Prévia IPCA-15 IBGE), `IGPM` (Reajuste Aluguéis FGV), `IGPDI` (IGP-DI FGV), `INCC` (Custo Construção FGV), `IPCFIPE` (Inflação Fipe São Paulo).
* **Indicadores Sociais & Macroeconomia**: `POUPANCA` (Rendimento Poupança % a.m.), `SALARIO_MINIMO` (Salário Mínimo R$ 1.412), `PIB_BR` (Crescimento Anual PIB), `DIVIDA_PIB` (Dívida Bruta/PIB %), `RISCO_BRASIL` (CDS 5 Anos Brasil Pontos).
* **Bolsa de Valores B3**: `IBOVESPA` (Ibovespa Pontos), `IFIX` (Fundos Imobiliários), `SMLL` (Small Caps), `IDIV` (Dividendos), `BDRX` (BDRs Não Patrocinados).
* **Bolsas Globais**: `SP500` (S&P 500 EUA), `NASDAQ` (Nasdaq Composite EUA), `DOWJONES` (Dow Jones Industrial EUA).

---

## 🔌 5. Guia Completo de Endpoints Catalogados

### 1. Healthcheck do Cluster Anycast
```bash
curl -X GET "https://ponte.ozpro.com.br/api/cotacoes/health"
```

### 2. Ranking de Mercado (Top Gainers & Losers)
```bash
curl -X GET "https://ponte.ozpro.com.br/api/cotacoes/ranking"
```

### 3. Simulador de Investimentos (Selic vs CDI vs Poupança com IR)
```bash
# Simula R$ 10.000 investidos por 12 meses
curl -X GET "https://ponte.ozpro.com.br/api/cotacoes/simulador?valor=10000&meses=12"
```

### 4. Cotação Cruzada Direta REST
```bash
# Dólar para Real
curl -X GET "https://ponte.ozpro.com.br/api/cotacoes/USD/BRL"

# Euro para Dólar Americano
curl -X GET "https://ponte.ozpro.com.br/api/cotacoes/EUR/USD"

# Bitcoin para Real
curl -X GET "https://ponte.ozpro.com.br/api/cotacoes/BTC/BRL"
```

### 5. Catálogo Completo Estruturado
```bash
# JSON
curl -X GET "https://ponte.ozpro.com.br/api/cotacoes/catalogo"

# Exportar direto em CSV para Excel
curl -X GET "https://ponte.ozpro.com.br/api/cotacoes/catalogo?formato=csv"
```

### 6. Busca em Tempo Real
```bash
curl -X GET "https://ponte.ozpro.com.br/api/cotacoes/busca?q=ouro"
curl -X GET "https://ponte.ozpro.com.br/api/cotacoes/busca?q=celic"
```

### 7. Consulta Múltipla em Lote
```bash
curl -X GET "https://ponte.ozpro.com.br/api/cotacao/atual?pares=USD-BRL,BTC-BRL,SELIC,SOJA,OURO_G"
```

### 8. Conversor Universal com Cálculo Fiscal de IOF
```bash
curl -X GET "https://ponte.ozpro.com.br/api/cotacao/conversao?de=USD&para=BRL&valor=250&iof=4.38"
```

### 9. Gráficos Vetoriais SVG Anycast com Temas e Paletas
```html
<!-- Tema escuro padrão com paleta emerald -->
<img src="https://ponte.ozpro.com.br/api/cotacoes/BTC?formato=svg&periodo=30d" width="580" height="240" />

<!-- Tema claro com paleta azul para sites claros -->
<img src="https://ponte.ozpro.com.br/api/cotacoes/USD?formato=svg&tema=light&paleta=blue" width="580" height="240" />
```

---

## 📊 6. Integração com Google Sheets & Excel

Você pode sincronizar as cotações em tempo real nas suas planilhas usando a fórmula nativa:

### Google Sheets
Coloque na célula `A1`:
```excel
=IMPORTDATA("https://ponte.ozpro.com.br/api/cotacoes/fiat?formato=csv")
```

Para consultar o Dólar diretamente em uma célula:
```excel
=INDEX(IMPORTDATA("https://ponte.ozpro.com.br/api/cotacoes/USD?formato=csv"), 2, 4)
```

---

## 💻 7. Exemplos de Uso em Código

### 🔹 Node.js / TypeScript (SDK Oficial)
```javascript
import { CotacoesPro } from 'cotacoes-pro';

CotacoesPro.configure({ apiKey: 'cot_start_live_token123' });

// 1. Simular investimento de R$ 50.000 por 24 meses
const sim = await CotacoesPro.simularInvestimento({ valor: 50000, meses: 24 });
console.log('Lucro Líquido Selic:', sim.resultados.tesouroSelic.montanteLiquido);

// 2. Ranking de mercado
const rank = await CotacoesPro.getRanking();
console.log('Maiores altas:', rank.maioresAltas);

// 3. Cotação cruzada direta
const par = await CotacoesPro.par('EUR', 'USD');
console.log(`1 EUR = ${par.cotacao} USD`);

// 4. Exportar CSV
const csv = await CotacoesPro.exportarCsv('agro');
```

### 🔹 Python (requests)
```python
import requests

headers = { "Authorization": "Bearer cot_start_live_token123" }

# Ranking em tempo real
rank = requests.get("https://ponte.ozpro.com.br/api/cotacoes/ranking", headers=headers).json()
print("Top Gainers:", [a['codigo'] + ' (' + a['var24h'] + ')' for a in rank['maioresAltas']])

# Conversão com IOF
conv = requests.get("https://ponte.ozpro.com.br/api/cotacao/conversao?de=EUR&para=BRL&valor=1000&iof=4.38", headers=headers).json()
print(f"Total: R$ {conv['conversao']['totalFinalComIof']}")
```

---

## 🧪 8. Testes Nativos Automatizados

Execute a suíte nativa completa:
```bash
node test.js
```

Resultado:
```text
========================================
🎉 TODOS OS 193 TESTES PASSARAM COM 100% DE SUCESSO!
   Falhas: 0
========================================
```

---

## 📄 9. Licença
Distribuído sob licença **MIT** &copy; 2026 Clepta Tech.
