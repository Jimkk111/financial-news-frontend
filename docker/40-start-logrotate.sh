#!/bin/sh
set -eu

# 挂载目录覆盖镜像自带的 stdout/stderr 日志链接，改用普通日志文件。
mkdir -p /var/log/nginx
chmod 0750 /var/log/nginx
for logfile in /var/log/nginx/access.log /var/log/nginx/error.log; do
    if [ -L "$logfile" ]; then
        unlink "$logfile"
    fi
done
touch /var/log/nginx/access.log /var/log/nginx/error.log
chown nginx:nginx /var/log/nginx/access.log /var/log/nginx/error.log
chmod 0640 /var/log/nginx/access.log /var/log/nginx/error.log

# Alpine 默认 root crontab 会执行 /etc/periodic/hourly 下的任务。
crond -b -l 8 -L /dev/stderr
