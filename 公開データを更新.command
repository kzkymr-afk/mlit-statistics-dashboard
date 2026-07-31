#!/bin/zsh
set -euo pipefail

SCRIPT_DIR=${0:A:h}
cd "$SCRIPT_DIR"

if [[ ! -f ".env.local" ]]; then
  echo "e-Stat APIが未設定です。"
  echo "先に「e-Stat APIを設定.command」を開いてください。"
  read "?Enterキーで閉じます。"
  exit 1
fi
set -a
source ".env.local"
set +a

echo "国交省統計システムの公開データを更新します。"
echo "1/5 e-Stat DB/APIの変更表だけを更新"
npm run sync:estat-api:resume

echo "2/5 Excel補完原本の更新確認"
npm run sync:building-annual
npm run sync:orders-major50-annual

echo "3/5 項目レジストリと分割データを生成・検証"
npm run data:publish-system
npm run test:system
npm run test:system-public
npm run build:pages

echo "4/5 項目レジストリと系列分割データをGitHubへ保存"
mkdir -p data/exports
COPYFILE_DISABLE=1 tar -czf data/exports/system-pages-data.tar.gz -C public system
if gh release view data-current >/dev/null 2>&1; then
  gh release upload data-current \
    data/exports/system-pages-data.tar.gz \
    --clobber
else
  gh release create data-current \
    data/exports/system-pages-data.tar.gz \
    --title "Current normalized data" \
    --notes "GitHub Pages公開用の最新項目レジストリと分割データです。"
fi

echo "5/5 GitHub Pagesの更新を開始"
gh workflow run pages.yml

echo
echo "更新処理を開始しました。GitHub Actions完了後に公開画面へ反映されます。"
read "?Enterキーで閉じます。"
