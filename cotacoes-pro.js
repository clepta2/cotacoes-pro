/**
 * cotacoes-pro.js
 * SDK Oficial para Node.js, Browser e Edge Runtimes
 * Cotações em Tempo Real, Histórico e Conversor de Câmbio
 * 
 * @license MIT
 * @see https://github.com/clepta2/cotacoes-pro
 */

export class CotacoesPro {
  static baseUrl = 'https://ponte.ozpro.com.br';
  static apiKey = '';

  /**
   * Configura o cliente global com token Bearer ou chave
   * @param {Object} config - { apiKey?: string, baseUrl?: string }
   */
  static configure(config = {}) {
    if (config.baseUrl) this.baseUrl = config.baseUrl.replace(/\/$/, '');
    if (config.apiKey) this.apiKey = config.apiKey;
  }

  /**
   * Headers padrão para requisição com Bearer Token RFC 6750
   * @private
   */
  static _getHeaders() {
    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'CotacoesPro-SDK/1.0.0'
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
      headers['x-api-key'] = this.apiKey;
    }
    return headers;
  }

  /**
   * Obtém o Master Feed Consolidado com todos os ativos
   * @returns {Promise<Object>}
   */
  static async getMasterFeed() {
    const resp = await fetch(`${this.baseUrl}/api/cotacoes`, {
      method: 'GET',
      headers: this._getHeaders()
    });
    if (!resp.ok) {
      throw new Error(`Erro ao obter master feed: HTTP ${resp.status}`);
    }
    return await resp.json();
  }

  /**
   * Consulta a cotação de um ativo individual com histórico
   * @param {string} codigo - Ex: 'USD', 'EUR', 'BTC', 'SELIC', 'SOJA'
   * @param {Object} [options] - { periodo: '7d'|'30d'|'1a'|'5a'|'max', format: 'json'|'svg' }
   * @returns {Promise<Object>}
   */
  static async consultar(codigo, options = {}) {
    if (!codigo) throw new Error('O código do ativo é obrigatório.');
    const params = new URLSearchParams();
    if (options.periodo) params.set('periodo', options.periodo);
    if (options.dias) params.set('dias', String(options.dias));
    if (options.format) params.set('formato', options.format);

    const query = params.toString() ? `?${params.toString()}` : '';
    const resp = await fetch(`${this.baseUrl}/api/cotacoes/${encodeURIComponent(codigo)}${query}`, {
      method: 'GET',
      headers: this._getHeaders()
    });

    if (options.format === 'svg') {
      return await resp.text();
    }

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return { ok: false, status: resp.status, erro: err.erro || 'Falha na consulta' };
    }
    return await resp.json();
  }

  /**
   * Converte valores entre duas moedas com suporte opcional a IOF
   * @param {Object} opts - { de: 'USD', para: 'BRL', valor: 100, iof: 4.38 }
   * @returns {Promise<Object>}
   */
  static async converter({ de = 'USD', para = 'BRL', valor = 100, iof = 0 } = {}) {
    const params = new URLSearchParams({
      de: String(de).toUpperCase(),
      para: String(para).toUpperCase(),
      valor: String(valor),
      iof: String(iof)
    });

    const resp = await fetch(`${this.baseUrl}/api/cotacoes/converter?${params.toString()}`, {
      method: 'GET',
      headers: this._getHeaders()
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return { ok: false, status: resp.status, erro: err.erro || 'Falha na conversão' };
    }
    return await resp.json();
  }

  /**
   * Consulta múltiplos ativos em uma única requisição
   * @param {string[]} moedas - Ex: ['USD', 'EUR', 'BTC']
   * @returns {Promise<Object>}
   */
  static async consultarMultiplos(moedas = []) {
    if (!Array.isArray(moedas) || moedas.length === 0) {
      throw new Error('Informe um array de códigos de moedas.');
    }
    const resp = await fetch(`${this.baseUrl}/api/cotacoes?moedas=${moedas.join(',')}`, {
      method: 'GET',
      headers: this._getHeaders()
    });
    if (!resp.ok) {
      return { ok: false, status: resp.status };
    }
    return await resp.json();
  }

  /**
   * Gera a URL do gráfico SVG Ticker Anycast de um ativo
   * @param {string} codigo - Ex: 'USD', 'BTC'
   * @param {Object} [options] - { tema, paleta, width, height, periodo }
   * @returns {string}
   */
  static getSvgTickerUrl(codigo, options = {}) {
    const params = new URLSearchParams({ formato: 'svg' });
    if (options.tema) params.set('tema', options.tema);
    if (options.paleta) params.set('paleta', options.paleta);
    if (options.width) params.set('w', String(options.width));
    if (options.height) params.set('h', String(options.height));
    if (options.periodo) params.set('periodo', options.periodo);
    return `${this.baseUrl}/api/cotacoes/${encodeURIComponent(codigo)}?${params.toString()}`;
  }
}

export default CotacoesPro;
