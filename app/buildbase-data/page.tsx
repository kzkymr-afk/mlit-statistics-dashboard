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
        <h2>更新方法</h2>
        <p>
          BuildBaseの完成表を更新した後に同期し、未処理セルが0件であることを確認できたデータだけを公開します。表示値は分析用に単位を統一しています。
        </p>
      </section>

      <p>
        <a href="../">統計システムへ戻る</a>
      </p>
    </main>
  );
}
