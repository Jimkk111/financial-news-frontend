#!/bin/sh
set -eu

# 状态文件持久化，避免重建容器后丢失轮转记录。
exec logrotate --state /var/log/nginx/.logrotate.status /etc/nginx-logrotate.conf
