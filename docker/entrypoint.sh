#!/bin/sh
# 以 PUID:PGID 身份运行，使 /data 中的文件归属与宿主机用户一致（群晖、Unraid 等）
set -e
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  # 仅在属主不一致时修正，避免每次启动都递归 chown
  if [ "$(stat -c %u "$DATA_DIR")" != "$PUID" ] || [ "$(stat -c %g "$DATA_DIR")" != "$PGID" ]; then
    echo "将 $DATA_DIR 的属主调整为 $PUID:$PGID"
    chown -R "$PUID:$PGID" "$DATA_DIR"
  fi
  exec su-exec "$PUID:$PGID" "$@"
fi

# 已通过 --user 指定非 root 用户运行
exec "$@"
