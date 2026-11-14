"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/field";
import { useAction } from "@/components/common/use-action";
import { saveGoal } from "../actions";

export function GoalDialog({ goal, open, onOpenChange }: { goal: { id: string; title: string; description: string; code: string }; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description);
  const { pending, exec } = useAction();
  const isCenter = goal.code === "CENTER";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isCenter ? "中心目標" : `領域 ${goal.code}`}</DialogTitle>
          <DialogDescription>{isCenter ? "マンダラの中心に置く最終目標です" : "この領域の8つの行動をまとめる目標です"}</DialogDescription>
        </DialogHeader>
        <Field label={isCenter ? "最終目標" : "領域名"} htmlFor="g-title">
          {isCenter ? <Textarea id="g-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} /> : <Input id="g-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />}
        </Field>
        <Field label="説明・メモ" htmlFor="g-desc">
          <Textarea id="g-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button disabled={pending} onClick={() => exec(() => saveGoal(goal.id, { title, description }), { onOk: () => onOpenChange(false) })}>{pending ? "保存中…" : "保存"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
