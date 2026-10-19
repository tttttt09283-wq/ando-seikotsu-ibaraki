import { ComingSoon } from "@/components/app/ComingSoon";

export const metadata = { title: "AI分析" };

export default function AssistantPage() {
  return (
    <ComingSoon
      title="AI分析"
      phase="フェーズ4"
      items={[
        "検証済みの集計結果（残高・予測・判定）だけを渡し、要約・リスクの説明・確認すべき事項・改善案の下書きを作る",
        "入金の督促文・支払条件の相談文などは下書きのみ（自動送信しない）",
        "外部AIへの送信前に同意を取り、取引先名・口座番号などは送らない",
        "振込・支払・仕訳の変更をAIが実行することはありません",
      ]}
      note="AIは財務計算の根拠にしません。計算は検証可能なプログラムとデータベースで行います。APIキーはサーバー側だけで管理します。"
    />
  );
}
