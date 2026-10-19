"use client";

import * as React from "react";
import { cancelTransactionAction, confirmOccurrenceAction, confirmTransactionAction, createTransactionAction, saveRuleAction, toggleRuleAction } from "@/app/actions";
import { Field, Input, Select } from "@/components/ui/form";
import { CATEGORY_LABEL, IN_CATEGORIES, OUT_CATEGORIES, type BankAccount, type Branch } from "@/lib/cash/types";
import { ActionForm, Submit } from "./ActionForm";

type Opts = { accounts: Pick<BankAccount, "id" | "name" | "branch_id" | "is_active">[]; branches: Pick<Branch, "id" | "name" | "is_active">[]; today: string };

function AccountSelect({ accounts, name = "bank_account_id", label = "口座" }: { accounts: Opts["accounts"]; name?: string; label?: string }) {
  return (
    <Field label={label}>
      <Select name={name} required defaultValue="">
        <option value="" disabled>
          選択してください
        </option>
        {accounts
          .filter((a) => a.is_active)
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
      </Select>
    </Field>
  );
}

function BranchSelect({ branches }: { branches: Opts["branches"] }) {
  if (!branches.length) return null;
  return (
    <Field label="店舗（任意）" hint="本部の口座から店舗の家賃を払う場合などに、どの店舗の取引かを記録します">
      <Select name="branch_id" defaultValue="">
        <option value="">指定しない</option>
        {branches
          .filter((b) => b.is_active)
          .map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
      </Select>
    </Field>
  );
}

/** 入金・支払・口座間振替の登録 */
export function TransactionForm({ accounts, branches, today }: Opts) {
  const [direction, setDirection] = React.useState<"in" | "out" | "transfer">("out");
  const [status, setStatus] = React.useState<"planned" | "confirmed">("planned");
  const cats = direction === "in" ? IN_CATEGORIES : OUT_CATEGORIES;
  return (
    <ActionForm action={createTransactionAction} resetOnSuccess className="space-y-3">
      <div className="flex flex-wrap gap-1" role="group" aria-label="種類">
        {(
          [
            ["out", "支払"],
            ["in", "入金"],
            ["transfer", "口座間振替"],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            type="button"
            aria-pressed={direction === v}
            onClick={() => setDirection(v)}
            className={`rounded-full px-3 py-1.5 text-sm ${direction === v ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <input type="hidden" name="direction" value={direction} />
      <div className="grid gap-3 sm:grid-cols-2">
        {direction === "transfer" ? (
          <>
            <AccountSelect accounts={accounts} name="from_account_id" label="振替元の口座" />
            <AccountSelect accounts={accounts} name="to_account_id" label="振替先の口座" />
          </>
        ) : (
          <>
            <Field label="カテゴリ">
              <Select name="category" required key={direction}>
                {cats.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <AccountSelect accounts={accounts} />
          </>
        )}
        <Field label="金額（円・税込の実際の入出金額）">
          <Input name="amount_jpy" inputMode="numeric" pattern="[0-9]*" required placeholder="例 200000" />
        </Field>
        <Field label="状態">
          <Select name="status" value={status} onChange={(e) => setStatus(e.target.value as "planned" | "confirmed")}>
            <option value="planned">予定（まだ動いていない）</option>
            <option value="confirmed">確定（実際に入出金した）</option>
          </Select>
        </Field>
        <Field label={status === "planned" ? "予定日" : "確定日（実際に動いた日）"}>
          <Input type="date" name="date" required defaultValue={today} />
        </Field>
        {direction !== "transfer" && status === "planned" && (
          <Field label="確度" hint="売上の見込みなど、金額・日付がまだ決まっていないものは「見込み」にします（予測ではシナリオに応じて割り引きます）">
            <Select name="certainty" defaultValue="fixed">
              <option value="fixed">確定予定（請求済・契約済）</option>
              <option value="expected">見込み</option>
            </Select>
          </Field>
        )}
        {direction !== "transfer" && (
          <>
            <Field label="取引先（任意）">
              <Input name="counterparty" maxLength={100} />
            </Field>
            <BranchSelect branches={branches} />
          </>
        )}
        <Field label="メモ（任意）" className="sm:col-span-2">
          <Input name="memo" maxLength={500} />
        </Field>
      </div>
      {direction === "transfer" && <p className="text-muted-foreground text-xs">振替は口座ごとの残高には反映しますが、企業全体の入金・支払の合計には含めません。</p>}
      <Submit>登録する</Submit>
    </ActionForm>
  );
}

export function ConfirmForm({ id, amount, today, label = "確定", returnStatus }: { id: string; amount: number; today: string; label?: string; returnStatus: string }) {
  return (
    <ActionForm action={confirmTransactionAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="return_status" value={returnStatus} />
      <Field label="確定日" className="w-36">
        <Input type="date" name="confirmed_date" defaultValue={today} required />
      </Field>
      <Field label="実際の金額" className="w-32">
        <Input name="amount_jpy" inputMode="numeric" defaultValue={amount} required />
      </Field>
      <Submit size="sm">{label}</Submit>
    </ActionForm>
  );
}

export function CancelForm({ id, returnStatus }: { id: string; returnStatus: string }) {
  return (
    <ActionForm action={cancelTransactionAction} confirmText="この予定を取り消しますか？（計算から外れます。記録は残ります）">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="return_status" value={returnStatus} />
      <Submit size="sm" variant="ghost">
        取消
      </Submit>
    </ActionForm>
  );
}

export function ConfirmOccurrenceForm({ ruleId, occurrenceDate, plannedDate, amount, today }: { ruleId: string; occurrenceDate: string; plannedDate: string; amount: number; today: string }) {
  return (
    <ActionForm action={confirmOccurrenceAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="rule_id" value={ruleId} />
      <input type="hidden" name="occurrence_date" value={occurrenceDate} />
      <input type="hidden" name="planned_date" value={plannedDate} />
      <Field label="確定日" className="w-36">
        <Input type="date" name="confirmed_date" defaultValue={today < plannedDate ? today : plannedDate} required />
      </Field>
      <Field label="実際の金額" className="w-32">
        <Input name="amount_jpy" inputMode="numeric" defaultValue={amount} required />
      </Field>
      <Submit size="sm">確定</Submit>
    </ActionForm>
  );
}

export function ToggleRuleForm({ id, active }: { id: string; active: boolean }) {
  return (
    <ActionForm action={toggleRuleAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={String(!active)} />
      <Submit size="sm" variant="outline">
        {active ? "停止" : "再開"}
      </Submit>
    </ActionForm>
  );
}

/** 定期支払・定期入金の繰返し設定 */
export function RuleForm({ accounts, branches, today }: Opts) {
  const [direction, setDirection] = React.useState<"in" | "out">("out");
  const [frequency, setFrequency] = React.useState<"monthly" | "weekly" | "yearly">("monthly");
  const cats = direction === "in" ? IN_CATEGORIES : OUT_CATEGORIES;
  return (
    <ActionForm action={saveRuleAction} resetOnSuccess className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="入金・支払">
          <Select name="direction" value={direction} onChange={(e) => setDirection(e.target.value as "in" | "out")}>
            <option value="out">支払</option>
            <option value="in">入金</option>
          </Select>
        </Field>
        <Field label="カテゴリ">
          <Select name="category" key={direction}>
            {cats.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <AccountSelect accounts={accounts} />
        <Field label="金額（円）">
          <Input name="amount_jpy" inputMode="numeric" required placeholder="例 280000" />
        </Field>
        <Field label="繰返し">
          <Select name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}>
            <option value="monthly">毎月</option>
            <option value="weekly">毎週</option>
            <option value="yearly">毎年</option>
          </Select>
        </Field>
        <Field label="間隔" hint="2 にすると隔月・隔週">
          <Input name="interval_count" inputMode="numeric" defaultValue={1} />
        </Field>
        {frequency === "yearly" && (
          <Field label="月">
            <Select name="month_of_year" defaultValue="1">
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}月
                </option>
              ))}
            </Select>
          </Field>
        )}
        {frequency !== "weekly" ? (
          <Field label="日" hint="31 を選ぶと毎月末（2月は28日・閏年は29日）">
            <Select name="day_of_month" defaultValue="25">
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1 === 31 ? "末日（31）" : `${i + 1}日`}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="曜日">
            <Select name="weekday" defaultValue="5">
              {"日月火水木金土".split("").map((w, i) => (
                <option key={w} value={i}>
                  {w}曜日
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="土日に当たったら">
          <Select name="weekend_shift" defaultValue="previous">
            <option value="previous">前の平日</option>
            <option value="next">次の平日</option>
            <option value="none">そのまま</option>
          </Select>
        </Field>
        <Field label="確度">
          <Select name="certainty" defaultValue="fixed">
            <option value="fixed">確定予定（家賃・給与など）</option>
            <option value="expected">見込み（売上など）</option>
          </Select>
        </Field>
        <Field label="開始日">
          <Input type="date" name="start_date" defaultValue={today} required />
        </Field>
        <Field label="終了日（任意）">
          <Input type="date" name="end_date" />
        </Field>
        <Field label="取引先・名前（任意）">
          <Input name="counterparty" maxLength={100} placeholder="例 本店 家賃" />
        </Field>
        <BranchSelect branches={branches} />
      </div>
      <Submit>繰返しを登録</Submit>
    </ActionForm>
  );
}
