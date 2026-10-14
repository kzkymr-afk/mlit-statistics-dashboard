"use client";

import { useEffect, useRef, useState } from "react";
import StatisticsSystemWorkbench from "./StatisticsSystemWorkbench";
import { explorerDocument } from "@/lib/atlas-explorer-document.mjs";
import { acceptedExplorerMessage, explorerBasePath, explorerRestoreMessage } from "@/lib/atlas-explorer-bridge.mjs";

/** The document is hosted inside the existing layout's login gate, with no HTML route. */
export default function AtlasExplorer() {
  const frame = useRef<HTMLIFrameElement>(null);
  const advancedMode = useRef(false);
  const [document, setDocument] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [advancedLoaded, setAdvancedLoaded] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDocument(explorerDocument(explorerBasePath(window.location.pathname), window.location.hash, window.location.origin));
    const receive = (event: MessageEvent) => {
      const hash = acceptedExplorerMessage(event, window.location.origin, frame.current?.contentWindow, advancedMode.current);
      if (hash !== null) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
    };
    const restore = () => {
      const message = explorerRestoreMessage(window.location.hash, advancedMode.current);
      if (message) frame.current?.contentWindow?.postMessage(message, window.location.origin);
    };
    window.addEventListener("message", receive);
    window.addEventListener("hashchange", restore);
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("message", receive);
      window.removeEventListener("hashchange", restore);
      window.removeEventListener("popstate", restore);
    };
  }, []);
  return <>
    <div className="atlas-explorer-navigation">
      <button type="button" aria-expanded={advanced} onClick={() => { advancedMode.current = !advanced; setAdvancedLoaded(true); setAdvanced(!advanced); }}>
        {advanced ? "検索と企業比較へ戻る" : "詳細な統計設定"}
      </button>
      <span>詳細では従来の分類指定・お気に入り・グラフ設定・分析用書き出しを利用できます。</span>
    </div>
    <div hidden={advanced}>
      {document ? <iframe ref={frame} title="Atlas 指標・会社・公的統計の検索と比較" srcDoc={document}
        sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox" className="atlas-explorer-frame" />
        : <p role="status">検索画面を準備しています…</p>}
    </div>
    {advancedLoaded ? <div hidden={!advanced}><StatisticsSystemWorkbench /></div> : null}
  </>;
}
