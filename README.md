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

## 部署日志

Nginx 日志通过 `./logs/nginx:/var/log/nginx` 挂载保存在主机项目目录下，删除或重建容器不会删除这些文件。

- `logs/nginx/access.log`：访问日志（静态资源等配置了 `access_log off` 的请求不记录）。
- `logs/nginx/error.log`：错误日志。
- 容器每小时检查轮转：按天轮转，或检查时发现文件超过 20 MB 则提前轮转；这是检查阈值，不是文件大小硬限制。
- 每类日志保留最近 14 份归档，旧归档压缩，最近一份延迟到下次轮转压缩；并非固定保留 14 天。
- 轮转状态保存在同一目录的 `.logrotate.status`，重建后继续使用。
- `logs/` 不提交 Git，也不进入 Docker 构建上下文。

在服务器项目目录执行以下命令应用配置：

```bash
docker compose up -d --build frontend
sudo tail -n 100 -f logs/nginx/access.log
sudo tail -n 100 -f logs/nginx/error.log
```

Nginx 访问和错误日志改为文件输出后，`docker logs` 主要用于查看容器启动和轮转任务的诊断信息；Docker 自身日志另行限制为每份 10 MB、最多 3 份。旧容器的 Docker 日志不会自动迁入新日志目录，需要时应在重建前导出。

部署后可检查轮转配置（只检查，不实际轮转）：

```bash
docker compose exec frontend logrotate --debug --state /var/log/nginx/.logrotate.status /etc/nginx-logrotate.conf
```

## 许可证

本项目采用 [MIT License](LICENSE)。
