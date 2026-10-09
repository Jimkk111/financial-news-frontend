<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, ref } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { Header, BottomNav } from '@/components'
import MarketTabs from './MarketTabs.vue'
import IndexCards from './IndexCards.vue'
import HotList from './HotList.vue'
import QuoteSearch from './QuoteSearch.vue'
import { useAuthStore } from '@/stores/auth'
import { useQuoteStore } from '@/stores/quote'
import { usePolling } from '@/composables/usePolling'
import { useRouter } from 'vue-router'

// 行情 Tab 页（docs/quote-frontend-design.md §5.2）
// - 首次进入某市场才加载；切回不重请求（store 缓存，PRD 4.1）
// - 当前市场交易中才轮询（30s）；页面切后台/离开本页暂停
// - 三市场分段失败隔离（E7），整体失败给重试（E8）
defineOptions({ name: 'Market' })

const router = useRouter()
const authStore = useAuthStore()
const quoteStore = useQuoteStore()

const activeMarket = computed(() => quoteStore.lastMarket)
const cache = computed(() => quoteStore.marketCache[activeMarket.value])

// keep-alive：离开本页（onDeactivated）时停轮询，回来立即刷一次
const pageActive = ref(true)

const poller = usePolling(
  () => quoteStore.refreshMarket(activeMarket.value),
  {
    canRun: () => pageActive.value && quoteStore.marketIsOpen(activeMarket.value),
  },
)

onMounted(() => {
  void quoteStore.ensureMarket(activeMarket.value)
  poller.start()
})

onActivated(() => {
  pageActive.value = true
  poller.resume()
})

onDeactivated(() => {
  pageActive.value = false
  poller.pause()
})

function switchMarket(market: 'CN' | 'US' | 'HK') {
  quoteStore.setLastMarket(market)
  void quoteStore.ensureMarket(market)
}

const allFailed = computed(() => {
  const c = cache.value
  return !!c && !!c.indicesError && !!c.hotError && !c.indices.length && !c.hot.length
})

async function retryAll() {
  await quoteStore.refreshMarket(activeMarket.value)
}

const handleUserClick = () => {
  if (!authStore.isAuthenticated) {
    router.push('/login')
  } else {
    router.push('/profile/info')
  }
}

const handleTabChange = (tab: string) => {
  if (tab === 'ai' && !authStore.isAuthenticated) {
    router.push('/login')
  } else {
    const routePath = tab === 'home' ? '/' : `/${tab}`
    router.push(routePath)
  }
}
</script>

<template>
  <div class="nb-page">
    <Header :avatar="authStore.user?.avatar || null" @user-click="handleUserClick" />

    <main class="nb-page-body nb-page-body--with-nav">
      <QuoteSearch />
      <MarketTabs :model-value="activeMarket" @update="switchMarket" />

      <div v-if="cache?.delayed" class="market-page__delayed">行情数据延迟，仅供参考</div>

      <div v-if="allFailed" class="market-page__error">
        <p>行情数据加载失败</p>
        <button class="market-page__retry" @click="retryAll">
          <RefreshCw :size="14" /> 重试
        </button>
      </div>

      <template v-else>
        <IndexCards
          :indices="cache?.indices ?? []"
          :loading="!quoteStore.hasCache(activeMarket)"
          :error="cache?.indicesError ?? null"
          @retry="quoteStore.refreshSegment(activeMarket, 'indices')"
        />
        <HotList
          :stocks="cache?.hot ?? []"
          :loading="!quoteStore.hasCache(activeMarket)"
          :error="cache?.hotError ?? null"
          @retry="quoteStore.refreshSegment(activeMarket, 'hot')"
        />
      </template>
    </main>

    <BottomNav active-tab="market" @tab-change="handleTabChange" />
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.market-page__delayed {
  margin: 0 $sp-4 $sp-2;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--nb-warning);
  background: var(--nb-warning-subtle);
}

.market-page__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $sp-3;
  padding: $sp-8 0 $sp-6;
  font-size: 13px;
  color: var(--nb-text-secondary);
}

.market-page__retry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  font-size: 13px;
  border-radius: 8px;
  color: var(--nb-info);
  background: var(--nb-info-subtle);
  cursor: pointer;
}
</style>
