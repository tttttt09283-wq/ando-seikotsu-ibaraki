"use client";
import { useState } from "react";
import { Download, Upload, Trash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/common/use-action";
import { jstDateTime } from "@/lib/format";
import { deleteAllDataAction, restoreBackupAction } from "../actions";

const ACTION_LABEL: Record<string, string> = { insert: "追加", update: "更新", delete: "削除", import: "取り込み", export: "書き出し", restore: "復元", purge: "全削除" };

export function DataPanel({ mode, ai, logs }: { mode: "supabase" | "local"; ai: boolean; logs: { id: string; at: string; table: string; action: string; record: string }[] }) {
  const { pending, exec } = useAction();
  const [confirmText, setConfirmText] = useState("");
  async function onRestore(f?: File) {
    if (!f) return;
    let json: unknown;
    try {
      json = JSON.parse(await f.text());
    } catch {
      alert("JSON ファイルとして読めませんでした");
      return;
    }
    if (confirm("現在のデータをすべて削除し、バックアップの内容に置き換えます。よろしいですか？（先に今のバックアップを取っておくことをおすすめします）")) exec(() => restoreBackupAction(json));
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">接続状態</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          <Badge variant={mode === "supabase" ? "green" : "amber"}>{mode === "supabase" ? "Supabase に保存中（RLS で本人のみ）" : "ローカルモード（開発用・.data フォルダに保存）"}</Badge>
          <Badge variant={ai ? "green" : "gray"}>{ai ? "AI API：設定済み（サーバー側のみ）" : "AI API：未設定（ルールベースで動作）"}</Badge>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">エクスポート・バックアップ</CardTitle>
          <CardDescription>CSV は Excel で開けます（UTF-8 BOM 付き）。JSON は全データのバックアップです</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[
            ["backup", "全データ（JSON）"],
            ["mandala-list", "マンダラ一覧 CSV"],
            ["mandala-grid", "マンダラ 9×9 CSV"],
            ["tasks", "タスク CSV"],
            ["actuals", "月次実績 CSV"],
            ["reviews", "週間レビュー CSV"],
          ].map(([t, l]) => (
            <Button key={t} variant="outline" size="sm" asChild><a href={`/api/export?type=${t}`}><Download />{l}</a></Button>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">バックアップから復元</CardTitle>
          <CardDescription>FREEDOM OS で書き出した JSON を読み込み、現在のデータと置き換えます</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild disabled={pending}>
            <label className="cursor-pointer"><Upload />JSON を選択<input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => onRestore(e.target.files?.[0])} /></label>
          </Button>
        </CardContent>
      </Card>
      <Card className="border-status-red/40">
        <CardHeader>
          <CardTitle className="text-status-red text-base">データの全削除</CardTitle>
          <CardDescription>マンダラ・タスク・実績・シナリオ・レビュー・AI分析をすべて削除します。元に戻せません。削除後は初期テンプレートから再開します（監査ログは残ります）。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="「すべて削除」と入力" className="w-56" />
          <Button variant="destructive" disabled={pending || confirmText !== "すべて削除"} onClick={() => exec(() => deleteAllDataAction(confirmText), { onOk: () => setConfirmText("") })}><Trash />すべて削除</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">変更履歴（監査ログ・直近50件）</CardTitle>
          <CardDescription>すべての保存・削除・取り込みを記録しています。ログは変更・削除できません</CardDescription>
        </CardHeader>
        <CardContent className="max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="text-muted-foreground py-1.5 pr-2 whitespace-nowrap">{jstDateTime(l.at)}</td>
                  <td className="pr-2">{ACTION_LABEL[l.action] ?? l.action}</td>
                  <td className="text-muted-foreground">{l.table}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
