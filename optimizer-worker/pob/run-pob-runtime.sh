#!/bin/sh
set -eu

: "${POB_ROOT:=/opt/pob}"
: "${POB_DISABLE_JIT:=1}"

case "${POB_ROOT}" in
  [A-Za-z]:/*|[A-Za-z]:\\*)
    echo "[pob-runtime] Ignoring Windows-style POB_ROOT on Linux: ${POB_ROOT}. Falling back to /opt/pob." >&2
    POB_ROOT=/opt/pob
    ;;
esac

export LUA_PATH="/app/pob/?.lua;/app/pob/?/init.lua;${POB_ROOT}/src/?.lua;${POB_ROOT}/src/?/init.lua;${POB_ROOT}/runtime/lua/?.lua;${POB_ROOT}/runtime/lua/?/init.lua;;"

cd "${POB_ROOT}/src"
if [ "${POB_DISABLE_JIT}" = "1" ]; then
  exec luajit -joff /app/pob/run-analysis.lua
fi

exec luajit /app/pob/run-analysis.lua
