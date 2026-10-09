<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronLeft, RefreshCw } from 'lucide-vue-next'
import { getKline, getSnapshot, getTrend, isRateLimitError } from '@/api/quote'
import { errorMessage } from '@/utils/toast'
import { usePolling } from '@/composables/usePolling'
import QuoteHeader from './QuoteHeader.vue'
import TrendChart from './TrendChart.vue'
import KlineChart from './KlineChart.vue'
import type { QuoteKlineVO, QuoteSecType, QuoteSnapshotVO, QuoteTrendVO } from '@/types/quote'

// 标的详情页（docs/quote-frontend-design.md §5.4）
// - 首屏 snapshot + trend 并行；K 线页签懒加载（一次拉 250 根，本地缩放）
// - 仅 tradeStatus === 'OPEN' 轮询；429 由 usePolling 退避
// - 分段失败隔离（E7）：报价/分时/K线各自错误态 + 段内重试
// - 退市默认切日 K（E4）、停牌遮罩（E3）
defineOptions({ name: 'QuoteDetail' })

const route = useRoute()
const router = useRouter()

// 路由段已由正则约束为 stock|index（对接文档 §2.2 同号异实红线）
const secType = route.params.secType as QuoteSecType
const symbol = route.params.symbol as string

const snapshot = ref<QuoteSnapshotVO | null>(null)
const trend = ref<QuoteTrendVO | null>(null)
const kline = ref<QuoteKlineVO | null>(null)

const snapshotError = ref<string | null>(null)
const trendError = ref<string | null>(null)
const klineError = ref<string | null>(null)
const klineLoading = ref(false)
const klineLoaded = ref(false)

const activeTab = ref<'trend' | 'kline'>('trend')

async function fetchSnapshot() {
  try {
    snapshot.value = await getSnapshot(secType, symbol)
    snapshotError.value = null
  } catch (e) {
    snapshotError.value = errorMessage(e, '行情数据加载失败')
    if (isRateLimitError(e)) throw e
  }
}

async function fetchTrend() {
  try {
    trend.value = await getTrend(secType, symbol)
    trendError.value = null
  } catch (e) {
    trendError.value = errorMessage(e, '分时数据加载失败')
    if (isRateLimitError(e)) throw e
  }
}

async function loadCore() {
  const results = await Promise.allSettled([fetchSnapshot(), fetchTrend()])
  // 429 需上抛给 usePolling 进入退避（分段错误态已在 fetch 内落好）
  const limited = results.find(
    (r): r is PromiseRejectedResult => r.status === 'rejected' && isRateLimitError(r.reason),
  )
  if (limited) throw limited.reason
}

async function loadKline() {
  if (klineLoaded.value || klineLoading.value) return
  klineLoading.value = true
  try {
    kline.value = await getKline(secType, symbol)
    klineError.value = null
    klineLoaded.value = true
  } catch (e) {
    klineError.value = errorMessage(e, 'K线数据加载失败')
  } finally {
    klineLoading.value = false
  }
}

const poller = usePolling(loadCore, {
  // 非 OPEN 状态数据不会变化，停止轮询（对接文档 §7）
  canRun: () => snapshot.value?.tradeStatus === 'OPEN',
})

onMounted(() => {
  void loadCore()
  poller.start()
})

watch(
  () => snapshot.value?.tradeStatus,
  (status) => {
    if (status === 'DELISTED') activeTab.value = 'kline'
  },
)

watch(activeTab, (tab) => {
  if (tab === 'kline') void loadKline()
})

const delayed = computed(() => !!(snapshot.value?.delayed || trend.value?.delayed))

/** 分时图区遮罩文案（E3/E4/空数据） */
const trendOverlay = computed(() => {
  const status = snapshot.value?.tradeStatus
  if (status === 'DELISTED') return '已退市，仅可查看历史 K 线'
  if (status === 'SUSPENDED') return '停牌期间无最新行情'
  if (trend.value && !trend.value.points.length) return '暂无分时数据'
  return null
})

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/market')
}
</script>

<template>
  <div class="quote-detail">
    <header class="quote-detail__topbar">
      <button class="quote-detail__back" aria-label="返回" @click="goBack">
        <ChevronLeft :size="20" />
      </button>
      <span class="quote-detail__topbar-title">{{ snapshot?.name || symbol }}</span>
    </header>

    <div v-if="delayed" class="quote-detail__delayed">行情数据延迟，仅供参考</div>

    <!-- 报价区（分段 1） -->
    <div v-if="snapshotError && !snapshot" class="quote-detail__error">
      <span>{{ snapshotError }}</span>
      <button class="quote-detail__retry" @click="fetchSnapshot">
        <RefreshCw :size="13" /> 重试
      </button>
    </div>
    <QuoteHeader v-else-if="snapshot" :snapshot="snapshot" />

    <!-- 分时 / 日K 页签 -->
    <div class="quote-detail__tabs">
      <button
        class="quote-detail__tab"
        :class="{ 'is-active': activeTab === 'trend' }"
        @click="activeTab = 'trend'"
      >
        分时
      </button>
      <button
        class="quote-detail__tab"
        :class="{ 'is-active': activeTab === 'kline' }"
        @click="activeTab = 'kline'"
      >
        日K
      </button>
    </div>

    <!-- 分时（分段 2） -->
    <div v-if="activeTab === 'trend'" class="quote-detail__chart">
      <div v-if="trendError && !trend" class="quote-detail__error">
        <span>{{ trendError }}</span>
        <button class="quote-detail__retry" @click="fetchTrend">
          <RefreshCw :size="13" /> 重试
        </button>
      </div>
      <div v-else-if="!trend" class="quote-detail__skeleton" />
      <template v-else>
        <TrendChart :trend="trend" />
        <div v-if="trendOverlay" class="quote-detail__overlay">
          <span>{{ trendOverlay }}</span>
        </div>
      </template>
    </div>

    <!-- 日K（分段 3，懒加载） -->
    <div v-else class="quote-detail__chart">
      <div v-if="klineError && !kline" class="quote-detail__error">
        <span>{{ klineError }}</span>
        <button
          class="quote-detail__retry"
          @click="
            () => {
              klineError = null
              klineLoaded = false
              void loadKline()
            }
          "
        >
          <RefreshCw :size="13" /> 重试
        </button>
      </div>
      <div v-else-if="!kline" class="quote-detail__skeleton" />
      <KlineChart v-else :kline="kline" />
    </div>

    <footer class="quote-detail__disclaimer">数据仅供参考，不构成投资建议</footer>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;
@use '../../styles/mixins' as *;

.quote-detail {
  min-height: 100dvh;
  background: var(--nb-bg);
}

.quote-detail__topbar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: $sp-2;
  height: 48px;
  padding: 0 $sp-3;
  background: var(--nb-surface);
  border-bottom: 1px solid var(--nb-border);
}

.quote-detail__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: var(--nb-text);
  cursor: pointer;

  &:hover {
    background: var(--nb-hover);
  }
}

.quote-detail__topbar-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--nb-text);
  @include ellipsis;
}

.quote-detail__delayed {
  margin: $sp-2 $sp-4 0;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--nb-warning);
  background: var(--nb-warning-subtle);
}

.quote-detail__tabs {
  display: flex;
  gap: $sp-1;
  padding: $sp-3 $sp-4 $sp-1;
}

.quote-detail__tab {
  padding: 5px 14px;
  border-radius: 999px;
  font-size: 13px;
  color: var(--nb-text-secondary);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;

  &.is-active {
    color: var(--nb-text);
    background: var(--nb-surface-subtle);
    border-color: var(--nb-border);
    font-weight: 600;
  }
}

.quote-detail__chart {
  position: relative;
}

.quote-detail__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--nb-overlay);
  color: #fff;
  font-size: 14px;
  border-radius: 4px;
}

.quote-detail__skeleton {
  margin: $sp-2 $sp-4;
  height: 340px;
  border-radius: 10px;
  background: var(--nb-surface-subtle);
  animation: qd-pulse 1.2s ease-in-out infinite;
}

.quote-detail__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $sp-2;
  padding: $sp-6 0;
  font-size: 13px;
  color: var(--nb-text-secondary);
}

.quote-detail__retry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  font-size: 12px;
  border-radius: 6px;
  color: var(--nb-info);
  background: var(--nb-info-subtle);
  cursor: pointer;
}

.quote-detail__disclaimer {
  padding: $sp-4 0 $sp-6;
  text-align: center;
  font-size: 11px;
  color: var(--nb-text-tertiary);
}

@keyframes qd-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
</style>
