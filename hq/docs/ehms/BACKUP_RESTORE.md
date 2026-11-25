# EHMS バックアップ・復元

## バックアップ
1. **Supabase の自動バックアップ**：Supabase のダッシュボード → Database → Backups（プランにより日次・保存期間が異なる）。有料プランの変更は経営者の承認のうえで行う。
2. **月次の書き出し（推奨・毎月の締め後）**：EHMS の「🔁 データ入出力」→「月次データ（Excel）」「年間PL（Excel）」を保存し、社内の決められた場所に保管する。
3. **SQL での書き出し（管理者）**：Supabase の SQL Editor で次を実行し、結果を CSV で保存。
   ```sql
   select * from ehms_monthly_records order by month, store_id, account_id;
   select * from ehms_stores; select * from ehms_accounts; select * from ehms_settings; select * from ehms_month_closes;
   ```

## 復元
- **一部の数字を戻す**：書き出した月次データ（CSV/Excel）を「🔁 データ入出力」で取り込む。自然キー（店舗・月・科目・区分）で上書きされるので重複しない。締めた月は先に締め解除する。
- **変更履歴から戻す**：`ehms_audit_logs` の before（変更前）を見て、月次PLで手入力するか、CSV にして取り込む。
- **全体を戻す**：Supabase のバックアップから復元（Supabase の手順に従う。予約管理のデータも同じデータベースにあるため、全体の復元は影響範囲を確認してから）。
