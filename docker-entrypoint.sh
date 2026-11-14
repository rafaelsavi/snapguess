#!/bin/sh
set -eu

if [ "$#" -eq 0 ]; then
    set -- /app/.venv/bin/python -m src.main
fi

trim_ws() {
    printf '%s' "$1" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

RAW_DATA_PATH="$(trim_ws "${DATA_PATH:-}")"
RAW_DATA_DIR="$(trim_ws "${DATA_DIR:-}")"
if [ -n "$RAW_DATA_PATH" ]; then
    RESOLVED_DATA_DIR="$RAW_DATA_PATH"
elif [ -n "$RAW_DATA_DIR" ]; then
    RESOLVED_DATA_DIR="$RAW_DATA_DIR"
else
    RESOLVED_DATA_DIR="/app/data"
fi

RAW_PUID="$(trim_ws "${PUID:-}")"
RAW_PGID="$(trim_ws "${PGID:-}")"
TARGET_PUID="${RAW_PUID:-1000}"
TARGET_PGID="${RAW_PGID:-1000}"

case "$TARGET_PUID" in
    ''|*[!0-9]*)
        echo "ERROR: PUID must be a non-negative integer, got '$TARGET_PUID'" >&2
        exit 1
        ;;
esac
case "$TARGET_PGID" in
    ''|*[!0-9]*)
        echo "ERROR: PGID must be a non-negative integer, got '$TARGET_PGID'" >&2
        exit 1
        ;;
esac

if [ "$(id -u)" -eq 0 ]; then
    if ! mkdir -p "$RESOLVED_DATA_DIR"; then
        echo "ERROR: Unable to create data directory '$RESOLVED_DATA_DIR'." >&2
        exit 1
    fi

    # Fix root-owned bind mounts created automatically by Docker on Unraid / Linux hosts
    if ! chown -R "${TARGET_PUID}:${TARGET_PGID}" "$RESOLVED_DATA_DIR"; then
        echo "WARNING: Failed to update ownership of '$RESOLVED_DATA_DIR' to ${TARGET_PUID}:${TARGET_PGID}." >&2
    fi

    if [ "$TARGET_PUID" -eq 0 ] && [ "$TARGET_PGID" -eq 0 ]; then
        exec "$@"
    fi

    # Prevent third-party libraries from attempting cache/config writes under /root
    if [ "$TARGET_PUID" -ne 0 ] && [ "${HOME:-}" = "/root" ]; then
        export HOME=/tmp
    fi

    exec setpriv --reuid="$TARGET_PUID" --regid="$TARGET_PGID" --clear-groups -- "$@"
fi

# Already running as non-root (e.g., explicit --user or compose user override)
if [ ! -d "$RESOLVED_DATA_DIR" ]; then
    mkdir -p "$RESOLVED_DATA_DIR" || true
fi

exec "$@"
