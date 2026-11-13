# CotacoesPro API & SDK Oficial

[![npm version](https://img.shields.io/npm/v/cotacoes-pro.svg?color=10b981)](https://www.npmjs.com/package/cotacoes-pro)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Edge Latency](https://img.shields.io/badge/Latency-%3C5ms-10b981.svg)](https://ponte.ozpro.com.br)
[![Cloudflare Workers](https://img.shields.io/badge/Runtime-Cloudflare%20Edge-F38020.svg)](https://workers.cloudflare.com)

SDK e API Oficial de **Cotações em Tempo Real, Câmbio Global (28 Moedas Fiat), Criptomoedas (16 Criptoativos/Bitcoins), Indicadores Econômicos Oficiais (Selic, CDI, IPCA, Ibovespa) e Commodities do Agronegócio Brasileiro**.

Executada na borda ultra-rápida Cloudflare Anycast (<5ms), protegida contra estouro de cotas através de micro-cache em RAM e **proteção de vazão dupla com janela de 86.400 segundos (24 horas)**.

---

## 🚀 1. Padrão de Autenticação Oficial (Bearer RFC 6750 & x-api-key)

A autenticação segue rigorosamente o padrão **RFC 6750 Bearer Token**, sendo também compatível com o cabeçalho alternativo `x-api-key` e consulta em query string:

```http
Authorization: Bearer cot_live_SEU_TOKEN_AQUI
```
*(ou `x-api-key: cot_live_...`)*

### Prefixos Inteligentes de Chaves & Resolução de Nível

| Prefixo | Plano Correspondente | Nível de Acesso & Finalidade |
|---|---|---|
| `cot_free_...` | **Free / Sandbox** | Desenvolvimento, testes e projetos de baixo tráfego |
| `cot_start_...` | **Starter** | Pequenos e-commerces, blogs financeiros e dashboards |
| `cot_pro_...` | **Pro** | SaaS, fintechs em escala, checkouts e portais de mídia |
| `cot_biz_...` | **Business / Enterprise** | Grandes corporações, ERPs, bancos e alto volume |
| `cot_master_...` | **Master Admin** | Gestão de infraestrutura, bypass irrestrito e telemetria |

---

## 📊 2. Matriz Oficial de Planos & Proteção de Vazão Dupla (RPM & Janela 86.400s)

A API possui **dupla camada de proteção**:
1. **Janela por Minuto (RPM - 60s)**: Previne ataques de negação de serviço e rajadas repentinas.
2. **Janela Diária de 86.400 segundos (24h / Cota Diária)**: Limite de cota diária por usuário/token.

| Plano | Vazão (RPM / 60s) | Cota Diária (86.400s) | Suporte | Cabeçalho `x-cotacoes-plan` |
|---|---|---|---|---|
| 🟢 **Free / Sandbox** | 30 RPM (0.5 req/s) | 500 req / 86400s | Comunidade | `free` |
| 🔵 **Starter** | 60 RPM (1.0 req/s) | 2.000 req / 86400s | Padrão | `starter` |
| 🟣 **Pro** | 300 RPM (5.0 req/s) | 20.000 req / 86400s | Prioritário | `pro` |
| 🟠 **Business** | 1.200 RPM (20.0 req/s) | 100.000 req / 86400s | SLA 99.9% 24/7 | `business` |
| 🔴 **Master Admin** | 3.000 RPM (50.0 req/s) | Ilimitado (Infinity) | Engenharia Dedicada | `master` |

### Cabeçalhos de Telemetria Retornados em Toda Resposta:
- `x-cotacoes-plan`: Nome do plano ativo (ex: `pro`)
- `x-cotacoes-ratelimit-limit`: Limite de requisições por minuto (RPM)
- `x-cotacoes-ratelimit-remaining`: Requisições restantes na janela atual de 60s
- `x-cotacoes-ratelimit-reset`: Timestamp Unix para reinício da janela de 60s
- `x-cotacoes-daily-limit`: Limite de requisições na janela diária de 86.400s
- `x-cotacoes-daily-remaining`: Requisições restantes na janela diária de 86.400s
- `x-cotacoes-daily-reset`: Timestamp Unix para reinício da janela de 86.400s
- `x-cotacoes-window-daily`: `86400s`

Quando o limite de vazão ou cota for atingido, a API responderá com status **HTTP 429 Too Many Requests**, acompanhado do cabeçalho oficial `Retry-After: <segundos>`:

```json
{
  "ok": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Limite de requisições por minuto excedido para o plano Pro (300 RPM).",
  "plano": "pro",
  "janela": "60s",
  "retryAfter": 14
}
```

Ou em caso de cota diária de 86.400s esgotada:

```json
{
  "ok": false,
  "error": "DAILY_LIMIT_EXCEEDED",
  "message": "Cota diária de requisições excedida (janela 86400s) para o plano Free / Sandbox (500 req/86400s).",
  "plano": "free",
  "janela": "86400s",
  "cotaDiaria": 500,
  "retryAfter": 43200
}
```

---

## 🌐 3. Catálogo Completo de Ativos (67 Ativos Consolidados)

### 🪙 28 Moedas Fiduciárias (Câmbio Global - Fiat)
`USD` (Dólar Comercial), `USDTUR` (Dólar Turismo), `EUR` (Euro), `GBP` (Libra Esterlina), `JPY` (Iene Japonês), `CHF` (Franco Suíço), `CAD` (Dólar Canadense), `AUD` (Dólar Australiano), `CNY` (Yuan Chinês), `ARS` (Peso Argentino), `CLP` (Peso Chileno), `COP` (Peso Colombiano), `UYU` (Peso Uruguaio), `MXN` (Peso Mexicano), `INR` (Rúpia Indiana), `RUB` (Rublo Russo), `ZAR` (Rand Sul-Africano), `TRY` (Nova Lira Turca), `ILS` (Novo Shekel Israelense), `AED` (Dirham dos Emirados), `SAR` (Riyal Saudita), `SEK` (Coroa Sueca), `NOK` (Coroa Norueguesa), `DKK` (Coroa Dinamarquesa), `PLN` (Zlóti Polonês), `NZD` (Dólar Neozelandês), `SGD` (Dólar de Cingapura), `HKD` (Dólar de Hong Kong).

### ⚡ 16 Criptomoedas (Bitcoins & Altcoins)
`BTC` (Bitcoin), `ETH` (Ethereum), `SOL` (Solana), `BNB` (Binance Coin), `USDT` (Tether USD), `USDC` (USD Coin), `XRP` (Ripple), `DOGE` (Dogecoin), `ADA` (Cardano), `LTC` (Litecoin), `AVAX` (Avalanche), `DOT` (Polkadot), `LINK` (Chainlink), `BCH` (Bitcoin Cash), `POL` (Polygon / MATIC), `SHIB` (Shiba Inu).

### 🌾 12 Commodities do Agronegócio Brasileiro & Energia
`SOJA` (Soja em Grão saca 60kg - Cepea), `MILHO` (Milho saca 60kg - Cepea), `BOI_GORDO` (Arroba do Boi 15kg - Cepea/B3), `CAFE` (Café Arábica Tipo 6 saca 60kg - Cepea/B3), `ACUCAR` (Açúcar Cristal saca 50kg - Cepea), `ALGODAO` (Algodão em Pluma lb - Cepea), `TRIGO` (Trigo Tonelada - Cepea), `ETANOL` (Etanol Hidratado m³ - Cepea), `OURO_G` (Ouro 24K Grama - B3), `PRATA_G` (Prata 999 Grama), `BRENT` (Petróleo Barril Brent - ICE), `WTI` (Petróleo Barril WTI - NYMEX).

### 📈 11 Indicadores Econômicos Oficiais do Brasil
`SELIC` (Taxa Selic Over % a.a. - Bacen - aceita alias `CELIC`), `CDI` (Taxa CDI % a.a. - B3), `IPCA` (Inflação Oficial % acum. 12m - IBGE), `IPCA15` (Prévia IPCA-15 - IBGE), `IGPM` (IGP-M Reajuste Aluguéis - FGV), `INCC` (Custo Construção Civil - FGV), `POUPANCA` (Rendimento Poupança % a.m.), `TR` (Taxa Referencial Diária), `SALARIO_MINIMO` (Salário Mínimo Nacional R$ 1.412,00), `IBOVESPA` (Índice Bovespa B3), `IFIX` (Índice de Fundos Imobiliários B3).

---

## 🔌 4. Endpoints da API

A API é 100% retrocompatível, aceitando rotas no plural e no singular (conforme divulgado na vitrine do marketplace):

| Método | Endpoint | Finalidade |
|---|---|---|
| `GET` | `/api/cotacoes` | Master Feed consolidado com todos os 67 ativos |
| `GET` | `/api/cotacoes/:codigo` | Cotação individual, histórico e mini-gráfico (ex: `/api/cotacoes/USD`) |
| `GET` | `/api/cotacao/atual?pares=USD-BRL,EUR-BRL,BTC-BRL` | Consulta múltiplos ativos em lote |
| `GET` | `/api/cotacao/historico?par=USD-BRL&dias=30` | Série histórica diária (suporta `dias=30` ou `periodo=max`) |
| `GET` | `/api/cotacoes/converter?de=USD&para=BRL&valor=100&iof=4.38` | Conversão de moedas com arredondamento fiscal e IOF |
| `GET` | `/api/cotacao/conversao?de=EUR&para=BRL&valor=250` | Alias singular do conversor de moedas |
| `GET` | `/api/cotacoes/USD?formato=svg` | Gera badge vetorial SVG Anycast (<5ms) para dashboards |

---

## 💻 5. Exemplos de Uso Multi-Linguagem

### 🔹 cURL
```bash
# Consultar Dólar com histórico de 30 dias
curl -X GET "https://ponte.ozpro.com.br/api/cotacoes/USD?periodo=30d" \
  -H "Authorization: Bearer cot_pro_live_token123"

# Conversor de Moedas (100 USD para BRL com IOF de 4.38%)
curl -X GET "https://ponte.ozpro.com.br/api/cotacoes/converter?de=USD&para=BRL&valor=100&iof=4.38" \
  -H "Authorization: Bearer cot_pro_live_token123"
```

### 🔹 Node.js (Fetch Nativo / ESM)
```javascript
import { CotacoesPro } from 'cotacoes-pro';

CotacoesPro.configure({
  apiKey: 'cot_pro_live_token123'
});

// 1. Consulta ativo com histórico
const res = await CotacoesPro.consultar('USD', { periodo: 'max' });
console.log(`Dólar: R$ ${res.dados.cotacao} (${res.historico.variacaoPeriodo})`);

// 2. Conversão com IOF
const conv = await CotacoesPro.converter({ de: 'USD', para: 'BRL', valor: 250, iof: 4.38 });
console.log(`R$ ${conv.conversao.valorFormatado} (Total c/ IOF: R$ ${conv.conversao.totalFinalComIof})`);
```

### 🔹 Python (requests)
```python
import requests

headers = {
    "Authorization": "Bearer cot_pro_live_token123"
}

resp = requests.get("https://ponte.ozpro.com.br/api/cotacoes/BTC", headers=headers)
data = resp.json()
print(f"Bitcoin: R$ {data['dados']['cotacao']:,} | 24h: {data['dados']['var24h']}")
```

### 🔹 PHP (curl_init)
```php
<?php
$ch = curl_init("https://ponte.ozpro.com.br/api/cotacoes/SELIC");
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer cot_pro_live_token123",
    "Accept: application/json"
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = json_decode(curl_exec($ch), true);
curl_close($ch);

echo "Taxa Selic: " . $response['dados']['valor'] . "% a.a.";
```

### 🔹 C# (.NET HttpClient)
```csharp
using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;

class Program {
    static async Task Main() {
        using var client = new HttpClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "cot_pro_live_token123");
        var json = await client.GetStringAsync("https://ponte.ozpro.com.br/api/cotacoes/SOJA");
        Console.WriteLine(json);
    }
}
```

---

## 📈 6. Gráficos Vetoriais SVG Anycast em Tempo Real

A API é capaz de renderizar gráficos vetoriais SVG interativos diretamente da borda em `<3ms`, ideais para tags `<img>` e dashboards sem JavaScript no cliente:

```html
<!-- Gráfico do Dólar em tempo real via SVG Anycast -->
<img src="https://ponte.ozpro.com.br/api/cotacoes/USD?formato=svg&periodo=30d" width="580" height="240" alt="Cotação Dólar" />
```

---

## 🧪 7. Validação por Testes Unitários Nativos

Execute a suite de testes nativos com Node.js:

```bash
npm test
```

Licença **MIT** &copy; 2026 Clepta Tech.
