# 🌐 CotacoesPro API & SDK Oficial

[![npm version](https://img.shields.io/npm/v/cotacoes-pro.svg?color=10b981)](https://www.npmjs.com/package/cotacoes-pro)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Edge Latency](https://img.shields.io/badge/Latency-%3C5ms%20(Sub--1s)-10b981.svg)](https://ponte.ozpro.com.br)
[![Cloudflare Workers](https://img.shields.io/badge/Runtime-Cloudflare%20Edge%20Anycast-F38020.svg)](https://workers.cloudflare.com)
[![Catálogo Total](https://img.shields.io/badge/Ativos%20Catalogados-123%20Ativos-8b5cf6.svg)](#-4-catálogo-geral-de-ativos-123-ativos-em-tempo-real)
[![Taxa de Entrega](https://img.shields.io/badge/Entrega-86.400%20req%2Fdia%20(1%20req%2Fs)-0ea5e9.svg)](#-2-arquitetura-de-vazão-86400-reqdia--1-reqs-contínuo)

API de Alta Frequência e SDK Oficial de **Cotações Globais em Tempo Real, Câmbio de 44 Moedas Fiduciárias, 34 Criptomoedas e Bitcoins, 24 Commodities Agropecuárias e 21 Indicadores Econômicos Oficiais**.

Projetada para atender aplicações críticas com **cadência contínua de 1 requisição por segundo (86.400 req/dia)** e entrega ultrarrápida na borda Cloudflare Anycast (<5ms de latência RAM).

---

## ⚡ 1. Destaques da Infraestrutura

* **123 Ativos em Tempo Real**: 44 moedas mundiais, 34 criptoativos, 24 commodities agro e 21 índices oficiais do Bacen, IBGE, FGV e B3.
* **Cadência de 1 req/s (86.400 req/dia)**: Proteção por isolate na borda Cloudflare com monitoramento duplo de janela (60s RPM e 86.400s diário).
* **Endpoints Catalogados & Descoberta Ativa**: Rotas dedicadas de catálogo (`/catalogo`), busca em tempo real (`/busca?q=...`) e filtros por categoria (`/fiat`, `/crypto`, `/agro`, `/indices`).
* **Micro-cache de Borda (3s)**: Respostas imediatas em RAM (<5ms) com proteção de upstream contra falhas de rede externa.
* **Conversor Universal com IOF**: Conversão cruzada entre quaisquer moedas com alíquota fiscal personalizada.
* **Gráficos Anycast Vetoriais SVG**: Mini-gráficos e badges gerados diretamente pela borda para tags `<img>` sem JavaScript no frontend.

---

## ⏱️ 2. Arquitetura de Vazão: 86.400 req/dia & 1 req/s Contínuo

A API foi projetada com base nos **86.400 segundos do dia**. A cadência do plano Starter entrega **1 requisição garantida a cada 1 segundo 24 horas por dia, 7 dias por semana**:

$$\text{86.400 segundos / dia} \times 1\text{ req/s} = \mathbf{86.400\text{ requisições por dia}}$$

### Matriz Oficial de Planos

| Plano | Vazão por Minuto | Cota Diária (86.400s) | Cadência Efetiva | Finalidade Recomendada |
|---|---|---|---|---|
| 🟢 **Free / Sandbox** | 30 RPM | 500 req / dia | Testes & Dev | Prototipagem e desenvolvimento local |
| 🔵 **Starter 86.400** | **60 RPM (1 req/s)** | **86.400 req / dia** | **1 req/s contínuo 24/7** | E-commerce, checkouts e robôs de cotação |
| 🟣 **Pro** | 300 RPM (5 req/s) | 250.000 req / dia | 5 req/s contínuo | Fintechs, ERPs e portais de notícias |
| 🟠 **Business Enterprise** | 1.200 RPM (20 req/s) | 1.000.000 req / dia | 20 req/s contínuo | Bancos, corretoras e alto volume institucional |
| 🔴 **Master Admin** | 3.000 RPM (50 req/s) | Ilimitado (Infinity) | Vazão sem restrições | Gestão central de infraestrutura |

### Cabeçalhos de Telemetria Retornados em 100% das Respostas
```http
x-cotacoes-plan: starter
x-cotacoes-ratelimit-limit: 60
x-cotacoes-ratelimit-remaining: 59
x-cotacoes-ratelimit-reset: 1794589200
x-cotacoes-daily-limit: 86400
x-cotacoes-daily-remaining: 86399
x-cotacoes-daily-reset: 1794675600
x-cotacoes-window-daily: 86400s
x-cotacoes-cadence: 1 req/s contínuo 24/7
x-cotacoes-edge-delivery: sub-1s (Anycast RAM)
```

---

## 🔑 3. Padrão de Autenticação (RFC 6750 Bearer & x-api-key)

A autenticação é compatível com o padrão **RFC 6750 Bearer Token**, com o cabeçalho `x-api-key` ou via parâmetro na query string:

```http
Authorization: Bearer cot_start_live_token123
```
*(ou cabeçalho `x-api-key: cot_start_live_token123`)*

---

## 📊 4. Catálogo Geral de Ativos (123 Ativos em Tempo Real)

### 🪙 A. 44 Moedas Fiduciárias Globais (Câmbio Comercial & Turismo)
Rota especializada: `GET /api/cotacoes/fiat`

| Código | Nome da Moeda | País / Bloco | Tipo |
|---|---|---|---|
| `USD` | Dólar Americano Comercial | Estados Unidos | Comercial |
| `USDTUR` | Dólar Americano Turismo | Estados Unidos | Turismo |
| `EUR` | Euro Comercial | União Europeia | Comercial |
| `EURTUR` | Euro Turismo | União Europeia | Turismo |
| `GBP` | Libra Esterlina | Reino Unido | Comercial |
| `JPY` | Iene Japonês | Japão | Comercial |
| `CHF` | Franco Suíço | Suíça | Comercial |
| `CAD` | Dólar Canadense | Canadá | Comercial |
| `AUD` | Dólar Australiano | Austrália | Comercial |
| `CNY` | Yuan Renminbi | China | Comercial |
| `ARS` | Peso Argentino | Argentina | América Latina |
| `CLP` | Peso Chileno | Chile | América Latina |
| `COP` | Peso Colombiano | Colômbia | América Latina |
| `UYU` | Peso Uruguaio | Uruguai | América Latina |
| `PYG` | Guarani Paraguaio | Paraguai | América Latina |
| `PEN` | Sol Peruano | Peru | América Latina |
| `BOB` | Boliviano | Bolívia | América Latina |
| `MXN` | Peso Mexicano | México | América Latina |
| `CRC` | Colón Costa-Riquenho | Costa Rica | América Latina |
| `VEF` | Bolívar Venezuelano | Venezuela | América Latina |
| `INR` | Rúpia Indiana | Índia | Ásia |
| `RUB` | Rublo Russo | Rússia | Europa/Ásia |
| `ZAR` | Rand Sul-Africano | África do Sul | África |
| `TRY` | Nova Lira Turca | Turquia | Europa/Ásia |
| `ILS` | Novo Shekel Israelense | Israel | Oriente Médio |
| `AED` | Dirham dos Emirados | Emirados Árabes | Oriente Médio |
| `SAR` | Riyal Saudita | Arábia Saudita | Oriente Médio |
| `SEK` | Coroa Sueca | Suécia | Escandinávia |
| `NOK` | Coroa Norueguesa | Noruega | Escandinávia |
| `DKK` | Coroa Dinamarquesa | Dinamarca | Escandinávia |
| `PLN` | Zlóti Polonês | Polônia | Leste Europeu |
| `NZD` | Dólar Neozelandês | Nova Zelândia | Oceania |
| `SGD` | Dólar de Cingapura | Cingapura | Sudeste Asiático |
| `HKD` | Dólar de Hong Kong | Hong Kong | Ásia |
| `THB` | Baht Tailandês | Tailândia | Sudeste Asiático |
| `TWD` | Dólar de Taiwan | Taiwan | Ásia |
| `KRW` | Won Sul-Coreano | Coreia do Sul | Ásia |
| `RON` | Leu Romeno | Romênia | Leste Europeu |
| `EGP` | Libra Egípcia | Egito | África/Oriente Médio |
| `KES` | Xelim Queniano | Quênia | África Oriental |
| `PHP` | Peso Filipino | Filipinas | Sudeste Asiático |
| `HUF` | Florim Húngaro | Hungria | Leste Europeu |
| `CZK` | Coroa Tcheca | República Tcheca | Europa Central |
| `RSD` | Dinar Sérvio | Sérvia | Leste Europeu |

---

### ⚡ B. 34 Criptomoedas e Criptoativos (Bitcoins, Altcoins & Stables)
Rota especializada: `GET /api/cotacoes/crypto`

| Código | Nome do Criptoativo | Categoria | Paridade Spot |
|---|---|---|---|
| `BTC` | Bitcoin | Criptomoeda Líder (PoW) | BRL & USD |
| `ETH` | Ethereum | Smart Contracts (PoS) | BRL & USD |
| `SOL` | Solana | High-Speed Layer 1 | BRL & USD |
| `BNB` | Binance Coin | Ecossistema BNB Chain | BRL & USD |
| `USDT` | Tether USD | Stablecoin Centralizada (USD) | BRL & USD |
| `USDC` | USD Coin (Circle) | Stablecoin Regulada (USD) | BRL & USD |
| `DAI` | Dai Stablecoin (MakerDAO) | Stablecoin Descentralizada | BRL & USD |
| `XRP` | Ripple | Pagamentos Transfronteiriços | BRL & USD |
| `DOGE` | Dogecoin | Memecoin Líder (PoW) | BRL & USD |
| `ADA` | Cardano | Proof-of-Stake L1 | BRL & USD |
| `LTC` | Litecoin | Pagamentos P2P | BRL & USD |
| `AVAX` | Avalanche | Consenso Subnet L1 | BRL & USD |
| `DOT` | Polkadot | Interoperabilidade Multichain | BRL & USD |
| `LINK` | Chainlink | Oráculo Descentralizado | BRL & USD |
| `BCH` | Bitcoin Cash | Fork Bitcoin On-Chain P2P | BRL & USD |
| `POL` | Polygon (ex-MATIC) | Ethereum Scaling L2 | BRL & USD |
| `SHIB` | Shiba Inu | Memecoin & Ecossistema Shib | BRL & USD |
| `TRX` | Tron | Transferência de USDT | BRL & USD |
| `TON` | Toncoin (Telegram Open Net) | Layer 1 Integrada | BRL & USD |
| `NEAR` | Near Protocol | Sharding L1 | BRL & USD |
| `SUI` | Sui Network | Move Language L1 | BRL & USD |
| `APT` | Aptos | Move Language L1 | BRL & USD |
| `UNI` | Uniswap | DEX Líder DeFi | BRL & USD |
| `PEPE` | Pepe Coin | Memecoin Ethereum | BRL & USD |
| `RENDER`| Render Token | Computação GPU Distribuída | BRL & USD |
| `FET` | Artificial Superintelligence | Inteligência Artificial (Fetch) | BRL & USD |
| `ATOM` | Cosmos Hub | Internet das Blockchains | BRL & USD |
| `XLM` | Stellar Lumens | Remessas Globais | BRL & USD |
| `HBAR` | Hedera Hashgraph | Consenso Hashgraph | BRL & USD |
| `KAS` | Kaspa | BlockDAG GHOSTDAG | BRL & USD |
| `XMR` | Monero | Privacidade & Anonimato | BRL & USD |
| `WIF` | dogwifhat | Memecoin Solana | BRL & USD |
| `BONK` | Bonk | Memecoin da Comunidade Solana | BRL & USD |
| `BRETT`| Brett | Memecoin Base Network | BRL & USD |

---

### 🌾 C. 24 Commodities Agropecuárias, Metais e Energia
Rota especializada: `GET /api/cotacoes/agro`

| Código | Produto / Commodity | Unidade Padrão | Fonte Oficial |
|---|---|---|---|
| `SOJA` | Soja em Grão | Saca 60kg | Cepea/Esalq |
| `MILHO` | Milho Amarelo Tipo 1 | Saca 60kg | Cepea/Esalq |
| `BOI_GORDO` | Arroba do Boi Gordo | Arroba (15kg) | Cepea/B3 |
| `BEZERRO` | Bezerro Nelore | Cabeça | Cepea/Esalq |
| `CAFE` | Café Arábica Tipo 6 | Saca 60kg | Cepea/B3 |
| `CAFE_CONILON` | Café Conilon Tipo 7 | Saca 60kg | Cepea/Esalq |
| `ACUCAR` | Açúcar Cristal Branco | Saca 50kg | Cepea/Esalq |
| `ALGODAO` | Algodão em Pluma | Libra-peso (lb) | Cepea/Esalq |
| `TRIGO` | Trigo em Grão (Paraná) | Tonelada | Cepea/Esalq |
| `ARROZ` | Arroz em Casca | Saca 50kg | Cepea/IRGA |
| `ETANOL` | Etanol Hidratado Combustível | Metro Cúbico ($m^3$) | Cepea/Esalq |
| `ETANOL_ANIDRO`| Etanol Anidro | Metro Cúbico ($m^3$) | Cepea/Esalq |
| `MANDIOCA` | Fécula de Mandioca | Tonelada | Cepea/Esalq |
| `SUINO` | Suíno Vivo | Quilo (kg) | Cepea/Esalq |
| `FRANGO` | Frango Congelado | Quilo (kg) | Cepea/Esalq |
| `LEITE` | Leite Cru ao Produtor | Litro | Cepea/Esalq |
| `OURO_G` | Ouro 24K Puro | Grama (g) | B3 Spot / Comex |
| `PRATA_G` | Prata 999 | Grama (g) | Comex Spot |
| `PLATINA` | Platina Comercial | Onça Troy ($oz\,t$) | NYMEX Nova York |
| `PALADIO` | Paládio Puro | Onça Troy ($oz\,t$) | NYMEX Nova York |
| `COBRE` | Cobre Comercial | Libra-peso (lb) | Comex Nova York |
| `BRENT` | Petróleo Barril Brent | Barril (159L) | ICE Londres |
| `WTI` | Petróleo Barril WTI | Barril (159L) | NYMEX Nova York |
| `GAS_NATURAL` | Gás Natural Henry Hub | MMBtu | NYMEX Nova York |

---

### 📈 D. 21 Indicadores Econômicos Oficiais & Bolsas de Valores
Rota especializada: `GET /api/cotacoes/indices`

| Código | Indicador Econômico | Unidade | Fonte Primária |
|---|---|---|---|
| `SELIC` | Taxa Selic Over *(aceita alias `CELIC`)* | % ao ano | Banco Central do Brasil |
| `CDI` | Taxa CDI Anualizada | % ao ano | B3 |
| `IPCA` | Inflação Oficial IPCA | % acum. 12 meses | IBGE |
| `IPCA15` | Prévia da Inflação IPCA-15 | % acum. 12 meses | IBGE |
| `IGPM` | IGP-M (Reajuste de Aluguéis) | % acum. 12 meses | Fundação Getulio Vargas (FGV) |
| `IGPDI` | IGP-DI Disponibilidade Interna | % acum. 12 meses | Fundação Getulio Vargas (FGV) |
| `INCC` | INCC (Custo da Construção Civil) | % acum. 12 meses | FGV |
| `IPCFIPE` | IPC-Fipe (Inflação de São Paulo) | % acum. 12 meses | Fipe |
| `POUPANCA` | Rendimento Mensal da Poupança | % ao mês | Banco Central |
| `TR` | Taxa Referencial Diária | % diário | Banco Central |
| `TLP` | Taxa de Longo Prazo BNDES | % a.a. + IPCA | BNDES |
| `TJLP` | Taxa de Juros de Longo Prazo | % ao ano | Banco Central |
| `SALARIO_MINIMO` | Salário Mínimo Nacional (R$ 1.412) | Moeda Corrente (R$) | Governo Federal |
| `IBOVESPA` | Índice Bovespa *(aceita `IBOV`)* | Pontos | B3 |
| `IFIX` | Índice de Fundos Imobiliários | Pontos | B3 |
| `SMLL` | Índice de Small Caps | Pontos | B3 |
| `IDIV` | Índice de Dividendos | Pontos | B3 |
| `BDRX` | Índice de BDRs Não Patrocinados | Pontos | B3 |
| `SP500` | S&P 500 Index (Estados Unidos) | Pontos | S&P Dow Jones Indices |
| `NASDAQ` | Nasdaq Composite (Estados Unidos) | Pontos | The Nasdaq Stock Market |
| `DOWJONES` | Dow Jones Industrial Average | Pontos | Dow Jones Indexes |

---

## 🔌 5. Endpoints Catalogados & Exemplos de Chamada

Todos os endpoints são servidos diretamente pela borda Cloudflare Anycast e aceitam rotas no plural e no singular.

### 📋 1. Catálogo Estruturado
Retorna a lista completa dos 123 ativos divididos por categoria com metadados:
```bash
curl -X GET "https://ponte.ozpro.com.br/api/cotacoes/catalogo" \
  -H "Authorization: Bearer cot_start_live_token123"
```

### 🔍 2. Busca Inteligente em Tempo Real
Localiza ativos por nome, código ou palavra-chave (ex: "dolar", "soja", "celic", "bitcoin", "ouro"):
```bash
curl -X GET "https://ponte.ozpro.com.br/api/cotacoes/busca?q=dolar" \
  -H "Authorization: Bearer cot_start_live_token123"
```

### 📦 3. Consulta de Múltiplos Pares em Lote
Consulta até dezenas de ativos em uma única requisição HTTP:
```bash
curl -X GET "https://ponte.ozpro.com.br/api/cotacao/atual?pares=USD-BRL,EUR-BRL,BTC-BRL,SELIC,SOJA" \
  -H "Authorization: Bearer cot_start_live_token123"
```

### 🎯 4. Consulta de Ativo Individual & Série Histórica
```bash
# Consulta Dólar com histórico de 30 dias
curl -X GET "https://ponte.ozpro.com.br/api/cotacoes/USD?periodo=30d" \
  -H "Authorization: Bearer cot_start_live_token123"

# Histórico 'MAX' desde o Plano Real (1994)
curl -X GET "https://ponte.ozpro.com.br/api/cotacoes/USD?periodo=max" \
  -H "Authorization: Bearer cot_start_live_token123"

# Consulta Taxa Selic (aceita alias CELIC)
curl -X GET "https://ponte.ozpro.com.br/api/cotacoes/CELIC" \
  -H "Authorization: Bearer cot_start_live_token123"
```

### 💱 5. Conversor Universal de Moedas com IOF
Converte qualquer par de moedas calculando automaticamente imposto IOF e arredondamento fiscal:
```bash
curl -X GET "https://ponte.ozpro.com.br/api/cotacao/conversao?de=USD&para=BRL&valor=250&iof=4.38" \
  -H "Authorization: Bearer cot_start_live_token123"
```

### 🎨 6. Gráficos Vetoriais SVG Anycast (<3ms)
Embed direto em websites sem JavaScript:
```html
<img src="https://ponte.ozpro.com.br/api/cotacoes/BTC?formato=svg&periodo=30d" width="580" height="240" alt="Gráfico Bitcoin" />
```

---

## 💻 6. Exemplos de Uso em Código

### 🔹 Node.js (SDK Oficial CotacoesPro)
```javascript
import { CotacoesPro } from 'cotacoes-pro';

CotacoesPro.configure({
  apiKey: 'cot_start_live_token123'
});

// 1. Obter catálogo completo estruturado (123 ativos)
const catalogo = await CotacoesPro.getCatalogo();
console.log(`Total de ativos: ${catalogo.totalAtivos}`);

// 2. Busca inteligente por termo
const busca = await CotacoesPro.buscar('soja');
console.log(busca.resultados);

// 3. Consulta de ativo com histórico
const usd = await CotacoesPro.consultar('USD', { periodo: '30d' });
console.log(`Dólar: R$ ${usd.dados.cotacao} (${usd.historico.variacaoPeriodo})`);

// 4. Conversão com IOF
const conv = await CotacoesPro.converter({ de: 'USD', para: 'BRL', valor: 100, iof: 4.38 });
console.log(`Total com IOF: R$ ${conv.conversao.totalFinalComIof}`);
```

### 🔹 Python (requests)
```python
import requests

headers = {
    "Authorization": "Bearer cot_start_live_token123"
}

# Consultar múltiplos ativos
url = "https://ponte.ozpro.com.br/api/cotacao/atual?pares=USD-BRL,BTC-BRL,SELIC,SOJA"
resp = requests.get(url, headers=headers)
data = resp.json()

print(f"Dólar: R$ {data['ativos']['USD']['cotacao']}")
print(f"Bitcoin: R$ {data['ativos']['BTC']['cotacao']:,}")
print(f"Selic: {data['ativos']['SELIC']['valor']}% a.a.")
print(f"Soja (60kg): R$ {data['ativos']['SOJA']['cotacao']}")
```

### 🔹 PHP (cURL)
```php
<?php
$ch = curl_init("https://ponte.ozpro.com.br/api/cotacoes/busca?q=ouro");
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer cot_start_live_token123",
    "Accept: application/json"
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$resposta = json_decode(curl_exec($ch), true);
curl_close($ch);

print_r($resposta['resultados']);
```

---

## 🧪 7. Validação por Testes Nativos

Execute a bateria completa de testes automatizados com Node.js:

```bash
node test.js
```

Resultado:
```text
========================================
🎉 TODOS OS 157 TESTES PASSARAM COM 100% DE SUCESSO!
   Falhas: 0
========================================
```

---

## 📄 8. Licença
Distribuído sob licença **MIT** &copy; 2026 Clepta Tech.
