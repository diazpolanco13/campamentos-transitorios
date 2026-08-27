#!/usr/bin/env bash
# Un ciclo del timer: Nexus institucional + servicios de plataforma.
# Uno no debe tumbar al otro.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
"$DIR/vigilante-nexus.sh" "$@" || true
if [ -x "$DIR/vigilante-plataforma.sh" ]; then
  "$DIR/vigilante-plataforma.sh" "$@" || true
fi
