# ============================================
# 多阶段构建：构建阶段
# ============================================
FROM node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package.json package-lock.json* ./

# 安装依赖
RUN npm install --registry=https://registry.npmmirror.com

# 复制源代码
COPY . .

# 构建生产版本
RUN npm run build

# ============================================
# 生产阶段：Nginx
# ============================================
FROM nginx:alpine AS production

# 日志轮转在容器内执行，归档及轮转状态保存到挂载目录
RUN apk add --no-cache logrotate
COPY docker/nginx-logrotate.conf /etc/nginx-logrotate.conf
COPY docker/nginx-logrotate.sh /etc/periodic/hourly/nginx-logrotate
COPY docker/40-start-logrotate.sh /docker-entrypoint.d/40-start-logrotate.sh
RUN chmod 644 /etc/nginx-logrotate.conf \
    && chmod 755 /etc/periodic/hourly/nginx-logrotate /docker-entrypoint.d/40-start-logrotate.sh

# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/nginx.conf
COPY nginx-default.conf /etc/nginx/conf.d/default.conf

# 从构建阶段复制静态文件
COPY --from=builder /app/dist /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 启动 Nginx
CMD ["nginx", "-g", "daemon off;"]
