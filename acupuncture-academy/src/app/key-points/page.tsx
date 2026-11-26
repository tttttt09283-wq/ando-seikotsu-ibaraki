import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { ReviewStatusBadge } from "@/components/common/badges";
import { SourceList } from "@/components/common/source-list";
import { channelInfo, extraVesselMap } from "@/data/meridians";
import { pointMap } from "@/data/points";
import { confluentPairs } from "@/data/eight-confluent";
import {
  SHU_NAMES,
  YANG_ELEMENTS,
  YIN_ELEMENTS,
  extraLuo,
  extraXi,
  fiveShuTable,
  huiTable,
  lowerHeTable,
  shuMuTable,
  sizongTable,
  yuanLuoXiTable,
} from "@/data/yaoxue";

export const metadata: Metadata = { title: "要穴一覧" };

const YIN = new Set(["LU", "SP", "HT", "KI", "PC", "LR"]);

function P({ code, note }: { code: string; note?: string }) {
  const p = pointMap[code];
  if (!p) return <span className="text-verify">{code}（未登録）</span>;
  return (
    <Link href={`/points/${code}`} className="inline-flex flex-col rounded px-1 py-0.5 leading-tight hover:bg-accent">
      <span className="font-semibold text-foreground">{p.name}</span>
      <span className="font-mono text-[10px]" style={{ color: channelInfo[p.meridian].color }}>
        {code}
        {note ? <span className="ml-1 text-muted-foreground">{note}</span> : null}
      </span>
    </Link>
  );
}

function Block({ id, title, lead, children }: { id: string; title: string; lead: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border bg-white p-4 sm:p-5">
      <h2 className="text-lg font-bold text-primary">{title}</h2>
      <p className="mt-1 mb-3 text-sm leading-relaxed text-muted-foreground">{lead}</p>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">{children}</div>
    </section>
  );
}

const th = "border-b bg-muted/60 px-2 py-2 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground";
const td = "border-b px-2 py-1.5 align-top text-sm";

const toc = [
  ["five-shu", "五兪穴"],
  ["yuan-luo-xi", "原穴・絡穴・郄穴"],
  ["shu-mu", "背部兪穴・募穴"],
  ["hui", "八会穴"],
  ["lower-he", "下合穴"],
  ["confluent", "八脈交会穴"],
  ["sizong", "四総穴"],
];

export default function KeyPointsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="KEY POINTS"
        title="要穴一覧"
        description="要穴の分類表です。経穴名を押すと経穴辞典の詳しいページが開きます。経穴辞典の「分類」はこの表から作られているため、表と辞典は常に同じ内容になります。"
        actions={<ReviewStatusBadge status="unverified" />}
      />
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="要穴の種類">
        {toc.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded-full border bg-white px-3 py-1.5 text-sm hover:border-primary/40">
            {label}
          </a>
        ))}
      </nav>

      <Block id="five-shu" title="五兪穴" lead="指趾の端から肘・膝へ、井・滎・兪・経・合の順に並ぶ。（ ）は五行。陰経は井木から、陽経は井金から相生の順。">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className={th}>経脈</th>
              {SHU_NAMES.map((n) => (
                <th key={n} className={th}>
                  {n}穴
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fiveShuTable.map((r) => {
              const els = YIN.has(r.meridian) ? YIN_ELEMENTS : YANG_ELEMENTS;
              return (
                <tr key={r.meridian}>
                  <td className={`${td} font-semibold whitespace-nowrap`} style={{ color: channelInfo[r.meridian].color }}>
                    {channelInfo[r.meridian].short}
                  </td>
                  {r.codes.map((c, i) => (
                    <td key={c} className={td}>
                      <P code={c} note={`（${els[i]}）`} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Block>

      <Block id="yuan-luo-xi" title="原穴・絡穴・郄穴" lead="原穴は臓腑の原気が留まる穴（陰経では兪穴と同じ）。絡穴は表裏の経をつなぐ十五絡穴。郄穴は急性症状に用いる16穴。">
        <table className="w-full min-w-[480px] border-collapse">
          <thead>
            <tr>
              <th className={th}>経脈</th>
              <th className={th}>原穴</th>
              <th className={th}>絡穴</th>
              <th className={th}>郄穴</th>
            </tr>
          </thead>
          <tbody>
            {yuanLuoXiTable.map((r) => (
              <tr key={r.meridian}>
                <td className={`${td} font-semibold whitespace-nowrap`} style={{ color: channelInfo[r.meridian].color }}>
                  {channelInfo[r.meridian].short}
                </td>
                <td className={td}>
                  <P code={r.yuan} />
                </td>
                <td className={td}>
                  <P code={r.luo} />
                </td>
                <td className={td}>
                  <P code={r.xi} />
                </td>
              </tr>
            ))}
            {extraLuo.map((r) => (
              <tr key={r.code}>
                <td className={`${td} font-semibold whitespace-nowrap text-extra`}>{r.label.replace("の絡穴", "")}</td>
                <td className={td}>—</td>
                <td className={td}>
                  <P code={r.code} />
                </td>
                <td className={td}>—</td>
              </tr>
            ))}
            {extraXi.map((r) => (
              <tr key={r.code}>
                <td className={`${td} font-semibold whitespace-nowrap text-extra`}>{r.vessel}</td>
                <td className={td}>—</td>
                <td className={td}>—</td>
                <td className={td}>
                  <P code={r.code} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Block>

      <Block id="shu-mu" title="背部兪穴・募穴" lead="臓腑の気が背部に注ぐ兪穴（膀胱経第1行線）と、胸腹部に集まる募穴。同じ臓腑の兪穴と募穴を組むのが兪募配穴。">
        <table className="w-full min-w-[420px] border-collapse">
          <thead>
            <tr>
              <th className={th}>臓腑</th>
              <th className={th}>背部兪穴</th>
              <th className={th}>高さ</th>
              <th className={th}>募穴</th>
            </tr>
          </thead>
          <tbody>
            {shuMuTable.map((r) => (
              <tr key={r.organ}>
                <td className={`${td} font-semibold`}>{r.organ}</td>
                <td className={td}>
                  <P code={r.shu} />
                </td>
                <td className={`${td} text-muted-foreground`}>{r.level}</td>
                <td className={td}>
                  <P code={r.mu} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Block>

      <div className="grid gap-6 md:grid-cols-2">
        <Block id="hui" title="八会穴" lead="臓・腑・気・血・筋・脈・骨・髄の気が集まる穴（『難経』四十五難）。">
          <table className="w-full border-collapse">
            <tbody>
              {huiTable.map((r) => (
                <tr key={r.tissue}>
                  <td className={`${td} w-16 font-semibold`}>{r.tissue}会</td>
                  <td className={td}>
                    <P code={r.code} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>
        <Block id="lower-he" title="下合穴" lead="六腑の気が下肢で合流する穴。「合は内府を治す」（『霊枢』）。すべて足の三陽経上。">
          <table className="w-full border-collapse">
            <tbody>
              {lowerHeTable.map((r) => (
                <tr key={r.fu}>
                  <td className={`${td} w-16 font-semibold`}>{r.fu}</td>
                  <td className={td}>
                    <P code={r.code} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Block id="confluent" title="八脈交会穴" lead="奇経に通じる8穴。上肢と下肢の穴を組む。詳しくは「八脈交会穴」の画面で。">
          <table className="w-full min-w-[360px] border-collapse">
            <tbody>
              {confluentPairs.map((p) => (
                <tr key={p.id}>
                  <td className={td}>
                    <P code={p.upper.code} note={extraVesselMap[p.upper.vessel].name} />
                  </td>
                  <td className={td}>
                    <P code={p.lower.code} note={extraVesselMap[p.lower.vessel].name} />
                  </td>
                  <td className={`${td} text-xs text-muted-foreground`}>{p.regions.join("・")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>
        <Block id="sizong" title="四総穴" lead="広い部位の症状に用いる代表的な4穴（四総穴歌）。">
          <table className="w-full border-collapse">
            <tbody>
              {sizongTable.map((r) => (
                <tr key={r.code}>
                  <td className={td}>
                    <P code={r.code} />
                  </td>
                  <td className={`${td} text-sm`}>「{r.phrase}」</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>
      </div>

      <section className="rounded-2xl border bg-white p-4">
        <SourceList ids={["jp-textbook-points", "who2008", "jsam-who-history"]} title="分類と部位の出典・監修状態" />
      </section>
    </div>
  );
}
