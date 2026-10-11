# 财经新闻

基于 Vue 3、TypeScript 和 Vite 构建，集财经资讯、市场行情、AI 问答与内容创作于一体。

在线访问：[https://fsnews.mojodev.cn](https://fsnews.mojodev.cn)

后端仓库：[financial-news_api](https://github.com/Jimkk111/financial-news_api)

## 主要功能

- **财经资讯**：分类浏览、关键词搜索、相关阅读与新闻分享，移动端支持滑动切换分类
- **市场行情**：A 股、港股、美股市场切换，指数与股票列表、标的搜索、报价详情、分时图和日 K 线
- **AI 助手**：多会话管理、流式回答、联网搜索与来源引用、思考过程展示，支持停止生成、重新生成及断线恢复
- **新闻解读**：新闻列表右键或长按、正文选中文字后，可通过「问 AI」将内容带入对话
- **内容创作**：富文本编辑、图片与视频插入、草稿保存与继续编辑、新闻发布和已发布内容管理
- **个人中心**：注册登录、密码重置、个人资料管理、新闻收藏与浏览历史
- **界面体验**：适配桌面与移动端，支持亮色、暗色及跟随系统主题

## 技术栈

Vue 3 · TypeScript · Vite · Pinia · Vue Router · Naive UI · Axios · Tiptap · ECharts

## 本地开发

Node.js 版本要求：`^20.19.0 || >=22.12.0`。

```bash
pnpm install
pnpm dev
```

默认访问地址为 `http://localhost:5173`，`/api` 请求代理到 `http://localhost:3000`。可通过环境变量 `VITE_API_BASE_URL` 配置 API 基础地址，通过 `VITE_PROXY_TARGET` 修改开发代理目标。

```bash
pnpm build       # 类型检查与生产构建
pnpm preview     # 预览生产构建
pnpm type-check  # 类型检查
pnpm test        # 单元测试
```

## 许可证

本项目采用 [MIT License](LICENSE)。
