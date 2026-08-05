export const metadata = {
  title: "BuildBase会社別データ | 国交省統計システム",
  description:
    "ゼネコン各社の有価証券報告書、公式ファクトブック、決算説明資料等から確定した会社別データの収録方針です。",
};

export default function BuildBaseDataGuide() {
  return (
    <main className="buildbase-guide">
      <header>
        <span>COMPANY DATA</span>
        <h1>BuildBase会社別データ</h1>
        <p>
          ゼネコン各社の公開資料から確定した年度別指標を、国交省統計と同じ表・グラフ・CSVで比較できるようにしたデータセットです。
        </p>
      </header>

      <section>
        <h2>収録する資料</h2>
        <ul>
          <li>有価証券報告書</li>
          <li>各社公式ファクトブック・データブック</li>
          <li>各社公式決算説明資料</li>
          <li>CIIC経営事項審査結果（技術職員数）</li>
        </ul>
      </section>

      <section>
        <h2>空欄の扱い</h2>
        <p>
          数値がないセルを0にはしません。対象資料を確認して開示がないものは「非開示」、情報源がまだ公表されていないものは「公表待ち」と表示します。
        </p>
      </section>

      <section>
        <h2>建物用途別受注実績</h2>
        <p>
          {`各社の公式ファクトブックにある工種別・用途別の建築受注実績を、共通の9用途へそろえています。現在は${buildBaseCatalog.buildingUseCompanyCount}社、${buildBaseCatalog.factbookBuildingUseFilledCount.toLocaleString("ja-JP")}件を収録しています。`}
        </p>
        <p>
          事務所・庁舎、宿泊、店舗・商業、工場・発電所、倉庫・流通、住宅、教育・研究・文化、医療・福祉、娯楽・その他を比較できます。
        </p>
      </section>

      <section>
        <h2>データが届くまで</h2>
        <ol>
          <li>BuildBaseが公式資料から値と出典を確定します。</li>
          <li>未処理セルが0件の完成データだけを1つの公開データにまとめます。</li>
          <li>国交省統計システムが会社比較・グラフ・CSVへ反映します。</li>
        </ol>
        <p>表示値は分析用に単位を統一しています。</p>
      </section>

      <p>
        <a href="../">統計システムへ戻る</a>
      </p>
    </main>
  );
}
import buildBaseCatalog from "@/data/catalogs/buildbase-company-data.json";
