#!/bin/sh
# Runs pending migrations, then starts the app (or whatever CMD was given).
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  node ace migration:run --force
fi

exec "$@"
