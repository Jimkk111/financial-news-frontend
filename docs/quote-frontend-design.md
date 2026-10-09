# 行情模块前端技术方案

> 文档定位：回答**"怎么做"**。上承 [market-tab-requirements.md](market-tab-requirements.md)（需求分析，做什么），下接《行情功能前端对接文档》（接口契约 + 行为规格，后端已实现）。本文档以前端仓库现状为基线设计，开发按此执行；与对接文档冲突时**以对接文档为准**。
> 基线：Vue 3.5 + TS 5.9 + Pinia 3 + Vue Router + Naive UI + SCSS · 2026-10-07

---

## 1. 决策记录（ADR）

| # | 决策 | 选择 | 理由 | 放弃的备选 |
|---|------|------|------|-----------|
| D1 | 图表库 | **ECharts 5（按需引入）** | 分时/K线一库覆盖；`candlestick + dataZoom + axisPointer` 满足全部交互；对接文档"图表实现提示"已验证可行 | klinecharts：K 线更专业，但分时/未来 sparkline 还需引第二库 |
| D2 | ECharts 引入方式 | `echarts/core` + 模块注册 | 控制体积，目标 gzip ≤ 150KB，独立 chunk 不影响首屏 | 全量 `import * as echarts`（体积翻倍） |
| D3 | 图表与数据解耦 | option 由**纯函数**生成（`buildTrendOption` / `buildKlineOption`） | 可单测；组件只做薄壳 | 组件内联 option（不可测、难维护） |
| D4 | 状态与轮询分离 | Pinia store 管数据缓存，composable 管轮询生命周期 | 轮询绑定视图生命周期（可见性/页签激活），放 store 会与 keep-alive、多页面冲突 | store 内置定时器 |
| D5 | 详情页路由 | `/market/:secType/:symbol` | 硬性红线（对接文档 §2.2）：`000001` 同号异实，必须携带 `secType` 跳转 | 只带 symbol |
| D6 | keep-alive | `include` 增加 `'Market'`，详情页不缓存 | PRD 4.1：Tab 切回不重请求；详情页多标的、缓存无意义 | 详情页也缓存 |
| D7 | 行情错误归一化 | api 层 `quoteGet` 包装，不改全局拦截器 | 对接文档 §2.1：行情业务错误走非 200 HTTP，现有拦截器只处理 200 壳；动全局会波及现有模块 | 改 request.ts 拦截器 |

## 2. 依赖与构建

```bash
pnpm add echarts   # ^5.6
```

`vite.config.ts` 的 `manualChunks` 增加：

```ts
'vendor-echarts': ['echarts'],
```

`src/utils/echarts.ts` 统一注册出口（全项目唯一 import echarts 的地方）：

```ts
import * as echarts from 'echarts/core'
import { LineChart, CandlestickChart, BarChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, DataZoomComponent,
  MarkLineComponent, AxisPointerComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, CandlestickChart, BarChart, GridComponent,
  TooltipComponent, DataZoomComponent, MarkLineComponent,
  AxisPointerComponent, CanvasRenderer])

export { echarts }
export type { EChartsType } from 'echarts/core'
```

> 不注册 Legend（图例自绘）/Title（页面级标题）。vendor-echarts 仅被行情页引用，Home 首屏不加载。

## 3. 文件结构与职责

```
src/
├── api/quote.ts                      # quoteGet 归一化 + 6 个接口函数
├── types/quote.ts                    # 对接文档 §6 类型原样落地
├── stores/quote.ts                   # Pinia：市场缓存、lastMarket 记忆、分段错误状态
├── composables/
│   ├── usePolling.ts                 # 30s 轮询 / visibility / 429 退避 / keep-alive 接线
│   └── useECharts.ts                 # init / ResizeObserver / dispose / 主题重绘
├── utils/echarts.ts                  # 按需注册出口（见 §2）
├── utils/quote/
│   ├── format.ts                     # 币种符号、精度、万/亿缩写、带符号涨跌幅（纯函数）
│   ├── color.ts                      # 红涨绿跌/平盘取色（纯函数）
│   └── chartOptions.ts               # buildTrendOption / buildKlineOption（纯函数）
├── views/Market/
│   ├── index.vue                     # Tab 页（defineOptions name: 'Market'）
│   ├── MarketTabs.vue                # CN/US/HK 三市场分段
│   ├── IndexCards.vue                # 指数卡片行
│   ├── HotList.vue                   # 热门标的列表
│   └── QuoteSearch.vue               # 搜索联想框
├── views/QuoteDetail/
│   ├── index.vue                     # 详情页骨架：报价区 + 分时/日K 页签 + 分段容器
│   ├── QuoteHeader.vue               # 报价区（状态/精度/币种/延迟提示）
│   ├── TrendChart.vue                # 分时图（薄壳）
│   └── KlineChart.vue                # 日 K 图（薄壳）
└── components/BottomNav.vue          # navItems 新增 market（既有文件，改 1 行）
```

既有文件改动清单：`BottomNav.vue`（+1 导航项，icon 用 lucide `TrendingUp`）、`router/index.ts`（+2 路由）、`App.vue`（keep-alive include 加 `'Market'`）、`vite.config.ts`（manualChunks）、`src/styles/variables.scss`（行情色 token，§7）。

## 4. 数据层设计

### 4.1 API 模块（api/quote.ts）

错误归一化采用对接文档 §2.1 的 `quoteGet`（HTTP 400/404/429/502 的 `{code,msg}` 归一为 `ApiError` 抛出），在其上封装 6 个函数：

```ts
export const quoteApi = {
  getIndices: (market: QuoteMarket) => quoteGet<IndexListVO>('/quotes/indices', { market }),
  getHot: (market: QuoteMarket, limit = 20) => quoteGet<HotListVO>('/quotes/hot', { market, limit }),
  search: (keyword: string, limit = 10) => quoteGet<QuoteSearchVO>('/quotes/search', { keyword, limit }),
  getSnapshot: (secType: QuoteSecType, symbol: string) =>
    quoteGet<QuoteSnapshotVO>(`/quotes/${secType}/${symbol}/snapshot`),
  getTrend: (secType: QuoteSecType, symbol: string) =>
    quoteGet<QuoteTrendVO>(`/quotes/${secType}/${symbol}/trend`),
  getKline: (secType: QuoteSecType, symbol: string, count = 250) =>
    quoteGet<QuoteKlineVO>(`/quotes/${secType}/${symbol}/kline`, { count }),
}
```

429 判定依据：`ApiError.code === 'RATE_LIMIT_EXCEEDED'`（归一化后不再依赖 axios 原始 status）。

### 4.2 Store（stores/quote.ts）

```ts
interface MarketCache {
  indices: QuoteSnapshotVO[]
  hot: QuoteSnapshotVO[]
  delayed: boolean
  fetchedAt: number
  indicesError: string | null   // 分段错误隔离（E7）：两段各自持有
  hotError: string | null
}

state: {
  lastMarket: QuoteMarket                    // 与 localStorage 'quote.lastMarket' 双向同步
  marketCache: Partial<Record<QuoteMarket, MarketCache>>
}

actions:
  ensureMarket(market)      // 已有缓存（不论新旧）直接返回不打请求 —— PRD 4.1"切回不重新请求"；
                            // 新鲜度由视图层轮询负责，ensureMarket 只管"首次加载"
  refreshMarket(market)     // 轮询调用：indices + hot 并行，结果整体替换写回（触发响应式）
  refreshSegment(market, seg) // 分段重试按钮：只重发失败的那一段
  setLastMarket(market)     // 同步 localStorage
```

要点：

- **详情页数据不进 store**：页面级状态，离开即弃（D6）。
- `indices` / `hot` 两请求并行；任一失败只置对应 `*Error` 字段，另一段正常渲染（E7）；两段都失败时页面框架仍在，由视图提供整体重试（E8）。
- `delayed` 取后端返回值驱动提示条（对接文档 §5），前端不做推断。

### 4.3 轮询 composable（composables/usePolling.ts）

```ts
usePolling(fn: () => Promise<void>, options?: {
  intervalMs?: number          // 默认 30_000
  canRun?: () => boolean       // 门条件：如 tradeStatus === 'OPEN'；false 时跳过本轮
})
返回 { pause, resume, active }
```

行为（对接文档 §7 逐条落地）：

1. `setInterval` 周期执行；本轮 `canRun()` 为 false 则跳过。
2. `visibilitychange`：hidden → `pause()`；visible → 立即执行一次再恢复定时器。
3. `fn` 抛出 `RATE_LIMIT_EXCEEDED`：`pause()`，60s 后 `resume()`，Toast 提示一次（节流，避免重复弹）。
4. 组件卸载自动清理；**keep-alive 场景**由调用方在 `onActivated` / `onDeactivated` 中接 `resume` / `pause`（Market Tab 页需要，详情页不缓存不需要）。

轮询预算复核：Tab 页 2 请求/30s + 详情页 2 请求/30s + 搜索防抖后 ≈ 8 次/分钟 ≪ 60 次/分钟（对接文档 §2.5）。

## 5. 视图层设计

### 5.1 路由与导航

```ts
{ path: '/market', name: 'market', component: () => import('@/views/Market/index.vue') },
{ path: '/market/:secType(stock|index)/:symbol', name: 'quoteDetail',
  component: () => import('@/views/QuoteDetail/index.vue') },
```

- symbol 含 `.`（如 `600519.SH`），单段路径参数可完整匹配；跳转一律 `router.push({ name: 'quoteDetail', params: { secType, symbol } })`，值取接口原样返回（大小写不变，对接文档 §2.2）。
- BottomNav tab id `market` → `router.push('/market')`，现有 `handleTabChange` 的 `/${tab}` 拼接天然支持，无需改逻辑。
- 详情页无 BottomNav（内容型页面，与 NewsDetail 一致）。

### 5.2 Tab 页（Market/index.vue）

- 结构：`Header`（复用）+ `QuoteSearch` + `MarketTabs` + `IndexCards` + `HotList` + `BottomNav active-tab="market"`。
- 数据流：`onMounted` → `quoteStore.ensureMarket(lastMarket)`；`onActivated`（keep-alive 回返）→ 恢复轮询；`MarketTabs` 切换 → `setLastMarket(m)` + `ensureMarket(m)`。
- 列表轮询门条件：当前市场指数快照 `tradeStatus === 'OPEN'` 才轮询（与详情页同口径，休市不打无谓请求）。
- `IndexCards`：横向滚动，卡片按接口返回**顺序**渲染、不排序（对接文档 §3.1）；整卡点击 → `quoteDetail`（指数走 `secType: 'index'`）。
- `HotList`：整行点击 → `quoteDetail`；行情列：`latestPrice` / `changePercent`（带符号红涨绿跌）。

### 5.3 搜索（QuoteSearch.vue）

- `utils/debounce`（已有）300ms 调 `quoteApi.search`；keyword 为空清空结果不请求。
- 键盘 ↑↓ 移动 `highlightIndex`（本地态，不发请求）、Enter 跳转、Esc 收起；移动端点选（对接文档 §3.3 / PRD 4.3）。
- 结果行：`name` + `symbol` + 市场徽标（CN/HK/US）+ 类型徽标（股/指）+ `status === 'DELISTED'` 时「已退市」灰标（E4）。
- `items: []` → 空态"未找到相关标的"，**保留已输入关键词**（E9）。
- 点击组件外部收起下拉（`onClickOutside` 手写或 `v-on-clickout`，不新增依赖）。

### 5.4 详情页（QuoteDetail/index.vue）

- 首屏：`getSnapshot` + `getTrend` 并行；**K 线懒加载**：首次切到日 K 页签才 `getKline`，结果缓存在组件状态（对接文档 §7）。
- 状态决策（快照返回后）：
  - `tradeStatus === 'DELISTED'` → 默认页签切到日 K，分时区渲染"已退市，仅可查看历史 K 线"说明（E4）；
  - `SUSPENDED` → 报价区「停牌」标识 + 图区遮罩文案（E3）；
  - 其他非 OPEN → 仅停轮询 + 状态标签 + `dataDate`（E1/E2）。
- 分段隔离：报价区 / 分时 / 日 K 三段独立 loading/error + 段内重试（重试只重发该段）。
- `QuoteHeader`：主价格大字 + 红涨绿跌；字段映射 `currency → ¥/HK$/$`；`latestPrice == null` → `—`；`changePercent` 带 2 位符号（`+0.31%`）；`volume`/`turnover` 万/亿缩写；非 OPEN 必显 `dataDate`（对接文档 §4 通用规则）；未知 `tradeStatus` 按 `CLOSED` 渲染（向前兼容）。
- 页面底部固定声明：「数据仅供参考，不构成投资建议」（PRD 5.2-8）。

### 5.5 图表

**useECharts（composables/useECharts.ts）**

- `mounted` 时 `echarts.init(el)`；`ResizeObserver` → `chart.resize()`；`unmounted` → `dispose`。
- `watchEffect`：`setOption(build(data, isDark), { notMerge: true })`——数据或主题任一变化即整体重建。数据量小（250 根 / 391 点），重建成本可忽略，换可靠性与可测性。
- 主题源：`stores/theme` 的 `getAppliedTheme()`。

**分时图（buildTrendOption，纯函数）**

1. **数据重排**：`full: (TrendPointVO | null)[] = Array(timelineMinutes + 1)` 全 null，按 `p.minute` 回填——未来分钟保持 null，折线自然"走到哪画到哪"；`minute` 是折叠午休后的轴偏移（对接文档 §3.5），CN/HK 午休断开由偏移本身表达，无需特殊处理。
2. x 轴：`type: 'category'`，data 为 `0..timelineMinutes`；**刻度标签只标边界点**：
   - CN：`0→'09:30'`、`120→'11:30/13:00'`、`240→'15:00'`（常量表）；
   - HK：`0→'09:30'`、`150→'12:00/13:00'`、`330→'16:00'`（常量表）；
   - US：**动态取数据点的 `time`**（首点、按已有点数等分取 2 个中间点、最新点），**禁止由 minute 反推时间**（对接文档 §3.5 明确警告；DST/时段变化由数据兜底）。盘中已有点不足时标签自然少，随数据增长补齐。
3. 双 y 轴：左价格（`scale: true`，min/max 按 `[min(price,prevClose), max(price,prevClose)]` 上下留 10% 空间），右轴涨跌幅 `%`，与左轴同 min/max 函数映射（`(v-prevClose)/prevClose`）。
4. series：价格线（无 symbol、`connectNulls: false`）、均价线、成交量柱（独立 grid，柱色红绿按该分钟 price 与前一点比较，无前点按与 `prevClose` 比较）、`prevClose` 水平虚线 `markLine`。
5. tooltip：`axisPointer: 'cross'`，两 grid 用 `axisPointer link`（x 联动量价十字线）；formatter 取该 minute 的 point 展示 `time/price/avgPrice/volume/涨跌幅`；`confine: true`，移动端 `position` 固定图区顶部（PRD 4.2 避免遮挡手指）。

**日 K（buildKlineOption，纯函数）**

1. x 轴 `category` = `bars[].date`；两 grid：主图（约 62% 高）+ 成交量副图（约 18% 高）。
2. 主图 series：`candlestick`（`itemStyle.color`=阳线红、`color0`=阴线绿、`borderColor` 同步）+ 4 条 `line`（ma5/10/20/60，**数组与 bars 下标对齐，直接透传，`null` 由 ECharts 自动断线**，不重算不补值——对接文档 §3.6）。
3. 副图：成交量柱，颜色跟随对应 bar 的 `close >= open` 红绿。
4. `dataZoom`：`inside`（滚轮/双指）+ `slider`（移动端隐藏，按容器宽度判断）；首屏 `startValue: bars.length - 120`、`end: '100%'`——**一次拉 250 根，缩放平移全在本地，不翻页请求**（对接文档 §3.6 / PRD U3）。
5. tooltip formatter：日期、OHLC、`changePercent`、`volume`/`turnover`（万/亿缩写）、各 MA 值；十字光标。

## 6. 边界场景 → 实现位置映射

| 场景（PRD/对接文档） | 实现位置 |
|---|---|
| E1 休市展示最近交易日 | `QuoteHeader` 状态标签 + `dataDate`；trend 返回全量数据，builder 无感知 |
| E2 港股午休 | 状态标签「午间休市」；分钟折叠由后端表达（§5.5-1） |
| E3 停牌 | `SUSPENDED` 标签 + 图区遮罩组件 |
| E4 退市 | 默认切日 K 页签 + 价格 `—` + 分时空态文案（§5.4） |
| E5 新股 MA 不足 | ma 数组 `null` 透传自动断线（§5.5 日K-2） |
| E6 港股精度 | `formatPrice`：仅 CN/US `toFixed(2)`，HK 原样（科学计数法序列化由 JSON.parse 归一为 number） |
| E7 单段失败 | 分段独立 error 态 + 段内重试（store 字段 / 详情页组件态） |
| E8 整体失败 | 页面框架 + 整体重试入口 |
| E9 搜索空态 | `items: []` → 空态保留关键词 |
| 429 限流 | `usePolling` 捕获 → 60s 退避 + Toast 一次（§4.3-3） |
| 未知 tradeStatus | 映射表 fallback `CLOSED`（§5.4） |
| 美股跨日 / DST | 分时轴标签动态取数据 time，不反推（§5.5-2） |

## 7. 样式与主题 token

`src/styles/variables.scss` 新增（图表 JS 侧与 SCSS 侧各持一份，值保持一致、注释互指）：

```scss
:root {
  --quote-up: #e0343c;      // 红涨
  --quote-down: #0a9c52;    // 绿跌
  --quote-flat: #8c8c8c;    // 平盘
}
html.dark {
  --quote-up: #ff5a5f;
  --quote-down: #26b47a;
  --quote-flat: #7a7a7a;
}
```

`utils/quote/color.ts` 与 `chartTheme`（亮/暗两套：文字、轴线、分割线、tooltip 底色/边框、均价线色）由 `isDark` 选择，不读 CSS 变量（ECharts 需静态色值）。

## 8. 测试方案（Vitest，延续现有 utils/store 测试风格）

| 文件 | 覆盖点 |
|---|---|
| `utils/quote/__tests__/format.spec.ts` | HK 原样精度 vs CN/US 2 位；币种符号映射；万/亿缩写；涨跌幅带符号；`null → '—'` |
| `utils/quote/__tests__/chartOptions.spec.ts` | trend：points 按 minute 回填、未来 null、US 轴标签取自数据 time（构造跨日数据断言不反推）；kline：dataZoom start/end（250→首屏 120）、MA null 透传、双 grid 结构 |
| `stores/__tests__/quote.spec.ts` | `ensureMarket` 缓存命中不打请求（mock api 计数）；`refreshSegment` 只影响单段；`lastMarket` 持久化与恢复 |
| `composables/__tests__/usePolling.spec.ts` | fake timers：30s 周期、hidden 暂停 / visible 立即执行、429 → 60s 退避 + Toast 单次、unmount 清理 |

图表组件（TrendChart/KlineChart）本身不做 jsdom 单测（ECharts 初始化成本高、收益低），由对接文档 §8 自查清单 + 真机联调覆盖。

## 9. 实施步骤（6 步，每步可独立验证）

| 步骤 | 内容 | 验证方式 |
|---|---|---|
| 1. 基建 | 依赖安装；`types/quote.ts`、`api/quote.ts`、`utils/echarts.ts`；路由 + BottomNav + keep-alive + 两个空页面 | 点导航可进空页，无类型错误 |
| 2. Tab 页 | store + MarketTabs/IndexCards/HotList + 分段失败隔离 | 三市场数据可达，断网单段可重试 |
| 3. 搜索 | QuoteSearch：防抖/键盘/徽标/跳转 | 五类输入命中（§8 自查） |
| 4. 详情页报价区 | QuoteHeader：状态映射/精度/币种/退市降级 | 对照 §4 状态表逐态核对 |
| 5. 图表（核心工作量） | useECharts + chartTheme + TrendChart + KlineChart + 两个 option builder + 单测 | 三市场分时/K 线 + 亮暗主题 |
| 6. 轮询与收尾 | usePolling、429 退避、onActivated 接线、全部单测、对照对接文档 §8 自查清单 | 自查清单全绿 |

预估总量 3~4 个工作日，其中步骤 5 约占一半。

## 10. 风险与对策

| 风险 | 对策 |
|---|---|
| vendor-echarts 体积超 150KB gzip | 注册清单固定不扩（D2）；超出再评估：去掉 slider dataZoom / 换 svg renderer 权衡，仍不达再议换库 |
| 美股分时轴标签动态化复杂 | 降级方案：只标首/尾两个数据点 time，中间刻度留空（仍满足"不反推"红线） |
| keep-alive 与轮询生命周期冲突 | `onActivated/onDeactivated` 显式接 `resume/pause`（§4.3-4），Tab 页收尾步骤专项验证 |
| 移动端 dataZoom 手感差 | inside 缩放 + `throttle`（utils/throttle 已有）；slider 隐藏；真机验收 U3 |
| 亮暗切换图表残影 | `notMerge: true` 全量重建（§5.5），禁用增量 setOption |
