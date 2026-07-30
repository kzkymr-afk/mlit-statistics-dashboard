#!/bin/zsh
set -euo pipefail

SCRIPT_DIR=${0:A:h}
cd "$SCRIPT_DIR"

echo "国交省統計パネルの公開データを更新します。"
echo "1/5 公式Excelの更新確認"
npm run sync:building-annual
npm run sync:orders-major50-annual

echo "2/5 ローカルDBを再構築"
npm run db:build-local

echo "3/5 Pages用データを検証"
npm run data:export-pages
npm run test:data
npm run build:pages

echo "4/5 最新DBと閲覧データをGitHubへ保存"
gzip -c data/database/mlit-statistics.sqlite > data/database/mlit-statistics.sqlite.gz
tar -cf data/exports/pages-data.tar -C public data
if gh release view data-current >/dev/null 2>&1; then
  gh release upload data-current \
    data/database/mlit-statistics.sqlite.gz \
    data/exports/pages-data.tar \
    --clobber
else
  gh release create data-current \
    data/database/mlit-statistics.sqlite.gz \
    data/exports/pages-data.tar \
    --title "Current normalized data" \
    --notes "GitHub Pages公開用の最新正規化データです。"
fi

echo "5/5 GitHub Pagesの更新を開始"
gh workflow run pages.yml

echo
echo "更新処理を開始しました。GitHub Actions完了後に公開画面へ反映されます。"
read "?Enterキーで閉じます。"
