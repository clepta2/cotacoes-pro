# CotacoesPro API & SDK Oficial

[![npm version](https://img.shields.io/npm/v/cotacoes-pro.svg?color=10b981)](https://www.npmjs.com/package/cotacoes-pro)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Edge Latency](https://img.shields.io/badge/Latency-%3C5ms-10b981.svg)](https://ponte.ozpro.com.br)
[![Cloudflare Workers](https://img.shields.io/badge/Runtime-Cloudflare%20Edge-F38020.svg)](https://workers.cloudflare.com)

SDK e API Oficial de **Cotações em Tempo Real, Câmbio Global, Criptomoedas, Indicadores Oficiais do Banco Central e Commodities do Agronegócio Brasileiro**.

Executada na borda ultra-rápida Cloudflare Anycast (<5ms), protegida contra estouro de cotas através de micro-cache em RAM e feed consolidado mestre.

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

## 📊 2. Matriz Oficial de Planos & Limitações de Vazão (Rate Limits)

Os limites são aplicados por isolate na borda Cloudflare Anycast e refletidos nos cabeçalhos de resposta HTTP:

| Plano | Rate Limit (Vazão) | Cota Diária | Suporte | Cabeçalho `x-cotacoes-plan` |
|---|---|---|---|---|
| 🟢 **Free / Sandbox** | 30 RPM (0.5 req/s) | 500 req/dia | Comunidade | `free` |
| 🔵 **Starter** | 60 RPM (1.0 req/s) | 2.000 req/dia | Padrão | `starter` |
| 🟣 **Pro** | 300 RPM (5.0 req/s) | 20.000 req/dia | Prioritário | `pro` |
| 🟠 **Business** | 1.200 RPM (20.0 req/s) | 100.000 req/dia | SLA 99.9% 24/7 | `business` |
| 🔴 **Master Admin** | 3.000 RPM (50.0 req/s) | Ilimitado | Engenharia Dedicada | `master` |

### Cabeçalhos de Telemetria Retornados em Toda Resposta:
- `x-cotacoes-plan`: Nome do plano ativo (ex: `pro`)
- `x-cotacoes-ratelimit-limit`: Limite de requisições por minuto (RPM)
- `x-cotacoes-ratelimit-remaining`: Requisições restantes na janela atual
- `x-cotacoes-ratelimit-reset`: Timestamp Unix para reinício da janela

Quando o limite for atingido, a API responderá com status **HTTP 429 Too Many Requests**, acompanhado do cabeçalho oficial `Retry-After: <segundos>` e payload JSON estruturado:

```json
{
  "ok": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Limite de requisições excedido para o plano Pro (300 RPM).",
  "plano": "pro",
  "retryAfter": 14
}
```

---

## 💻 3. Exemplos de Uso Multi-Linguagem

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

## 📈 4. Gráficos Vetoriais SVG Anycast em Tempo Real

A API é capaz de renderizar gráficos vetoriais SVG interativos diretamente da borda em `<3ms`, ideais para tags `<img>` e dashboards sem JavaScript no cliente:

```html
<!-- Gráfico do Dólar em tempo real via SVG Anycast -->
<img src="https://ponte.ozpro.com.br/api/cotacoes/USD?formato=svg&periodo=30d" width="580" height="240" alt="Cotação Dólar" />
```

---

## 🧪 5. Validação por Testes Unitários Nativos

Execute a suite de testes nativos com Node.js:

```bash
npm test
```

Licença **MIT** &copy; 2026 Clepta Tech.
