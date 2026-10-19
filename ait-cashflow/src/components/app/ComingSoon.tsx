import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** まだ作っていない画面（何がいつ入るかを明示する） */
export function ComingSoon({ title, phase, items, note }: { title: string; phase: string; items: string[]; note?: string }) {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{phase}で実装予定</CardTitle>
            <CardDescription>この画面はまだ使えません。予定している機能：</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          {note && <p className="text-muted-foreground text-xs">{note}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
