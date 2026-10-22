import styles from "./AtlasBuildStamp.module.css";

const channel = process.env.ATLAS_BUILD_CHANNEL;
const channelLabel = channel === "published" ? "公開版" : channel === "preview" ? "プレビュー版" : "ローカル版";
const version = process.env.ATLAS_BUILD_VERSION ?? "不明";
const buildId = process.env.ATLAS_BUILD_ID ?? "不明";
const builtAtUtc = process.env.ATLAS_BUILD_TIME_UTC ?? "";
const builtAtLabel = builtAtUtc ? builtAtUtc.replace("T", " ").replace(/\.\d{3}Z$/, " UTC") : "記録なし";

export default function AtlasBuildStamp() {
  return (
    <div className={styles.bar} aria-label="画面の版とビルド時刻" data-atlas-build-id={buildId} data-atlas-build-time={builtAtUtc}>
      <strong className={styles.version}>{channelLabel} · v{version}</strong>
      <time dateTime={builtAtUtc || undefined}>画面ビルド: {builtAtLabel}</time>
      <span className={styles.note}>統計データの更新日時とは別です</span>
    </div>
  );
}
