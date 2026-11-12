export interface AtivoCotacao {
  codigo: string;
  nome: string;
  cotacao?: number;
  valor?: number;
  compra?: number;
  venda?: number;
  var24h?: string;
  min24h?: number;
  max24h?: number;
  unidade?: string;
  periodo?: string;
  fonte?: string;
  categoria?: 'fiat' | 'crypto' | 'indicesBrasil' | 'commoditiesAgro';
}

export interface HistoricoPonto {
  data: string;
  fechamento: number;
  maxima?: number;
  minima?: number;
  variacao?: string;
}

export interface HistoricoResultado {
  periodo: string;
  dias?: number;
  desde?: string;
  eventoNascimento?: string;
  totalPontos: number;
  fechamentos: number[];
  minimo: number;
  maximo: number;
  variacaoPeriodo: string;
  pontos: HistoricoPonto[];
  fonte: string;
}

export interface ConversaoResultado {
  origem: string;
  destino: string;
  valorOriginal: number;
  cotacaoAplicada: number;
  valorConvertido: number;
  valorFormatado: string;
  iofPercentual: number;
  valorIof: number;
  totalFinalComIof: number;
  atualizadoEm: string;
}

export interface MasterFeed {
  atualizadoEm: string;
  provedor: string;
  totalAtivos: number;
  indicesBrasil: Record<string, AtivoCotacao>;
  commoditiesAgro: Record<string, AtivoCotacao>;
  fiat: Record<string, AtivoCotacao>;
  crypto: Record<string, AtivoCotacao>;
}

export class CotacoesPro {
  static getMasterFeed(): Promise<MasterFeed>;
  static consultar(codigo: string, options?: { periodo?: string; dias?: number; format?: 'json' | 'svg' }): Promise<{ ok: boolean; ativo?: string; dados?: AtivoCotacao; historico?: HistoricoResultado }>;
  static converter(options: { de: string; para: string; valor: number; iof?: number }): Promise<{ ok: boolean; conversao: ConversaoResultado }>;
  static consultarMultiplos(moedas: string[]): Promise<{ ok: boolean; totalEncontrados: number; ativos: Record<string, AtivoCotacao> }>;
  static gerarSvgTicker(codigo: string, options?: { tema?: string; paleta?: string; width?: number; height?: number }): Promise<string>;
}
