# 三市场分页股票列表接入

行情页股票列表使用 `GET /api/quotes/stocks`，不再请求热门标的接口。指数卡片仍使用 `/api/quotes/indices`。

## 请求

`GET /api/quotes/stocks?market=CN&page=1&pageSize=50`

- `market`：`CN` / `HK` / `US`。
- `page`：从 1 开始，前端默认 1。
- `pageSize`：前端默认 50。

## 响应约定

沿用行情统一响应壳 `{ code, msg, data }`；本次接入按现有行情列表的 `stocks` 字段和以下分页字段处理：

```json
{
  "code": "200",
  "msg": "success",
  "data": {
    "market": "CN",
    "delayed": false,
    "stocks": [],
    "page": 1,
    "pageSize": 50,
    "total": 0
  }
}
```

`stocks` 每项沿用 `QuoteSnapshotVO`。`total` 表示当前市场的股票总数，总页数按 `ceil(total / pageSize)` 计算。

## 页面行为

- 三市场独立缓存当前页、列表和总数，切回市场恢复当前页。
- 上一页/下一页触发服务端分页，边界页和加载期间禁用对应按钮。
- 支持输入指定页码后点击「跳转」或按回车；只接受 1 至总页数的整数，当前页及加载期间不重复跳转。
- 轮询刷新当前股票页和指数，翻页中不重复请求股票。
- 请求失败保留上一份成功数据，重试请求失败页；旧请求返回时不能覆盖新页。
- 空列表显示「暂无股票数据」，股票与指数加载失败互不影响。

此仓库仅包含前端；服务端路由和股票数据分页由后端提供。本说明替代旧设计文档中行情页的热门列表部分。
