// ============================================================
// 行情模块类型（契约来源：《行情功能前端对接文档》§6）
// ============================================================

export type QuoteMarket = 'CN' | 'HK' | 'US'

export type QuoteSecType = 'stock' | 'index'

export type TradeStatus =
  | 'PRE_OPEN'
  | 'OPEN'
  | 'LUNCH_BREAK'
  | 'CLOSED'
  | 'HOLIDAY'
  | 'SUSPENDED'
  | 'DELISTED'

export type QuoteCurrency = 'CNY' | 'HKD' | 'USD'

/** 标的快照公共字段（快照/分时/K线响应都携带） */
export interface QuoteBaseVO {
  secType: QuoteSecType
  symbol: string
  name: string
  market: QuoteMarket
  currency: QuoteCurrency
  tradeStatus: TradeStatus
  /** 数据归属交易日 yyyy-MM-dd */
  dataDate: string
  /** 数据时间 HH:mm:ss */
  dataTime: string
  /** true 时页面必须展示「行情数据延迟」提示（对接文档 §5） */
  delayed: boolean
}

/** 单标的实时快照（详情页报价区 / 指数卡片 / 热门列表行） */
export interface QuoteSnapshotVO extends QuoteBaseVO {
  /** 最新价；退市/无成交为 null，展示「—」 */
  latestPrice: number | null
  /** 涨跌额（后端已四舍五入 2 位） */
  changeAmount: number | null
  /** 涨跌幅 %（后端已四舍五入 2 位） */
  changePercent: number | null
  open: number | null
  prevClose: number | null
  high: number | null
  low: number | null
  /** 成交量（股，三市场已归一化，前端不再换算手） */
  volume: number | null
  /** 成交额（原币种元；美股指数可能为 null） */
  turnover: number | null
}

export interface IndexListVO {
  market: QuoteMarket
  /** 各项 delayed 的 OR，直接驱动列表头提示条 */
  delayed: boolean
  /** 指数快照数组，后端配置顺序即展示顺序，前端不得重排 */
  indices: QuoteSnapshotVO[]
}

export interface HotListVO {
  market: QuoteMarket
  delayed: boolean
  /** 按 quote_hot_list 配置顺序返回 */
  stocks: QuoteSnapshotVO[]
}

export interface QuoteSearchItemVO {
  secType: QuoteSecType
  symbol: string
  name: string
  market: QuoteMarket
  currency: QuoteCurrency
  status: 'ACTIVE' | 'DELISTED'
}

export interface QuoteSearchVO {
  keyword: string
  items: QuoteSearchItemVO[]
}

export interface TrendPointVO {
  /** 折叠午休后的分时轴偏移，[0, timelineMinutes]；回填图表用，勿反推时间 */
  minute: number
  /** HH:mm（北京时间），轴刻度与十字线取值展示用 */
  time: string
  price: number | null
  avgPrice: number | null
  volume: number | null
}

export interface QuoteTrendVO extends QuoteBaseVO {
  /** 昨收基准线取值；备源降级时可能为 null */
  prevClose: number | null
  /** 分时轴总分钟数：CN 240 / HK 330 / US 390（以返回值为准，勿写死） */
  timelineMinutes: number
  points: TrendPointVO[]
}

export interface KlineBarVO {
  /** yyyy-MM-dd，升序 */
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
  turnover: number | null
  /** 相对前一根收盘的涨跌幅 %（首根也有值） */
  changePercent: number | null
}

export interface QuoteKlineVO extends QuoteBaseVO {
  /** 本期固定前复权 */
  fq: 'qfq'
  bars: KlineBarVO[]
  /** 均线数组，与 bars 下标一一对齐；null = 历史不足（新股/新指数），跳过不绘制 */
  ma: {
    ma5: Array<number | null>
    ma10: Array<number | null>
    ma20: Array<number | null>
    ma60: Array<number | null>
  }
}
