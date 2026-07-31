#!/bin/zsh
set -euo pipefail

SCRIPT_DIR=${0:A:h}
cd "$SCRIPT_DIR"

APP_ID=$(osascript <<'APPLESCRIPT' | tr -d '[:space:]'
set resultDialog to display dialog "e-Statで発行したアプリケーションIDを入力してください。" default answer "" with hidden answer buttons {"キャンセル", "保存"} default button "保存" with title "国交省統計システム"
return text returned of resultDialog
APPLESCRIPT
)

if [[ -z "$APP_ID" ]]; then
  osascript -e 'display alert "アプリケーションIDが空です。" as warning'
  exit 1
fi
if ! printf '%s' "$APP_ID" | LC_ALL=C grep -Eq '^[A-Za-z0-9_-]+$'; then
  osascript -e 'display alert "アプリケーションIDの形式を確認してください。" as warning'
  exit 1
fi

umask 077
TEMP_FILE=$(mktemp "$SCRIPT_DIR/.env.local.XXXXXX")
printf 'ESTAT_APP_ID=%s\n' "$APP_ID" > "$TEMP_FILE"
mv "$TEMP_FILE" "$SCRIPT_DIR/.env.local"

osascript -e 'display notification "e-Stat APIの設定を保存しました。" with title "国交省統計システム"'
