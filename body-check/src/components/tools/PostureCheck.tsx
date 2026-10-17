"use client";

/**
 * AI姿勢チェック
 * 横向き・正面の写真から、MediaPipe Pose（体の33点を見つけるAI）で姿勢を判定します。
 * 写真はスマホの中だけで解析し、どこにも送信・保存しません。
 */
import { useEffect, useRef, useState } from "react";
import { computeFrontAnalysis, computeSideAnalysis, type Landmark, type PostureAnalysis } from "@/lib/posture";
import { buttonStyles, cx } from "@/components/styles";
import { Card, Spinner } from "@/components/ui";
import { Disclaimer, OtherChecks, ToolHeader, ToolResultCta } from "./ToolParts";

type View = "side" | "front";
interface Shot {
  image: string; // 結果表示用（骨格の線を重ねた画像）
  analysis: PostureAnalysis;
}

declare global {
  interface Window {
    Pose?: new (opts: { locateFile: (f: string) => string }) => PoseModel;
    /** テスト用：AIの代わりに体の位置を返す */
    __POSE_OVERRIDE?: (canvas: HTMLCanvasElement, view: View) => Landmark[] | null;
  }
}
interface PoseModel {
  setOptions: (o: Record<string, unknown>) => void;
  onResults: (cb: (r: { poseLandmarks?: Landmark[] }) => void) => void;
  send: (i: { image: HTMLCanvasElement }) => Promise<void>;
}

const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/pose";
let posePromise: Promise<PoseModel> | null = null;
let poseResolve: ((l: Landmark[] | null) => void) | null = null;

/** AIのプログラムは、姿勢チェックを開いたときだけ読み込む */
function loadPose(): Promise<PoseModel> {
  if (!posePromise) {
    posePromise = new Promise((resolve, reject) => {
      const ready = () => {
        if (!window.Pose) return reject(new Error("load"));
        const model = new window.Pose({ locateFile: (f) => `${CDN}/${f}` });
        model.setOptions({ modelComplexity: 1, smoothLandmarks: false, enableSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        model.onResults((r) => {
          poseResolve?.(r.poseLandmarks ?? null);
          poseResolve = null;
        });
        resolve(model);
      };
      if (window.Pose) return ready();
      const s = document.createElement("script");
      s.src = `${CDN}/pose.js`;
      s.crossOrigin = "anonymous";
      s.onload = ready;
      s.onerror = () => {
        posePromise = null;
        reject(new Error("load"));
      };
      document.head.appendChild(s);
    });
  }
  return posePromise;
}

async function detect(canvas: HTMLCanvasElement, view: View): Promise<Landmark[] | null> {
  if (window.__POSE_OVERRIDE) return window.__POSE_OVERRIDE(canvas, view);
  const model = await loadPose();
  return new Promise((resolve, reject) => {
    poseResolve = resolve;
    model.send({ image: canvas }).catch(reject);
  });
}

const LINES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [7, 11], [8, 12],
];

/** 写真の上に、見つけた体の点と線・基準線を描く */
function drawOverlay(src: HTMLCanvasElement, lm: Landmark[], view: View): string {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const W = c.width, H = c.height, lw = Math.max(3, W * 0.006);
  ctx.setLineDash([W * 0.015, W * 0.01]);
  ctx.strokeStyle = "rgba(250,204,21,0.95)";
  ctx.lineWidth = lw;
  ctx.beginPath();
  if (view === "side") {
    const ankle = lm[27].visibility >= lm[28].visibility ? lm[27] : lm[28];
    ctx.moveTo(ankle.x * W, 0);
    ctx.lineTo(ankle.x * W, H);
  } else {
    const mx = ((lm[23].x + lm[24].x) / 2) * W;
    ctx.moveTo(mx, 0);
    ctx.lineTo(mx, H);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "#22d3ee";
  LINES.forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(lm[a].x * W, lm[a].y * H);
    ctx.lineTo(lm[b].x * W, lm[b].y * H);
    ctx.stroke();
  });
  ctx.fillStyle = "#f97316";
  [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach((i) => {
    ctx.beginPath();
    ctx.arc(lm[i].x * W, lm[i].y * H, lw * 1.3, 0, Math.PI * 2);
    ctx.fill();
  });
  return c.toDataURL("image/jpeg", 0.85);
}

/** 撮影（カメラ＋10秒タイマー）または写真を選ぶ */
function Capture({ view, onCaptured, onSkip }: { view: View; onCaptured: (c: HTMLCanvasElement) => void; onSkip?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [camOn, setCamOn] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [camError, setCamError] = useState(false);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  };
  useEffect(() => stop, []);

  const start = async (f = facing) => {
    stop();
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: f }, width: { ideal: 960 }, height: { ideal: 1280 } }, audio: false });
      streamRef.current = s;
      setCamOn(true);
      setCamError(false);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setCamError(true);
    }
  };

  const shoot = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d")!;
    if (facing === "user") {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0);
    stop();
    onCaptured(c);
  };

  const timer = () => {
    let n = 10;
    setCount(n);
    const id = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(id);
        setCount(null);
        shoot();
      } else setCount(n);
    }, 1000);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * r));
      c.height = Math.max(1, Math.round(img.height * r));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      onCaptured(c);
    };
    img.src = URL.createObjectURL(file);
  };

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-black">{view === "side" ? "① 横向きの写真" : "② 正面の写真"}</h2>
        <ul className="mt-2 space-y-1 text-sm leading-relaxed text-slate-700">
          {view === "side" ? (
            <>
              <li>・体の真横から、頭から足先まで全身が入るように撮ります</li>
              <li>・いつも通りの楽な姿勢で、まっすぐ前を見て立ちます</li>
            </>
          ) : (
            <>
              <li>・正面から、頭から足先まで全身が入るように撮ります</li>
              <li>・かかとをそろえ、腕は体の横に下ろします</li>
            </>
          )}
          <li>・体のラインが分かる服がおすすめです。ひとりのときはスマホを置いて10秒タイマーで撮れます</li>
        </ul>
      </Card>
      {camOn ? (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-3xl bg-black" style={{ aspectRatio: "3 / 4" }}>
            <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 size-full object-cover" style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }} />
            {count !== null && <p className="absolute inset-0 flex items-center justify-center text-8xl font-black text-white drop-shadow-lg">{count}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={shoot} disabled={count !== null} className={buttonStyles.primary}>
              📷 撮影
            </button>
            <button type="button" onClick={timer} disabled={count !== null} className={buttonStyles.accent}>
              ⏱ 10秒タイマー
            </button>
          </div>
          <button
            type="button"
            className={buttonStyles.ghost}
            onClick={() => {
              const f = facing === "user" ? "environment" : "user";
              setFacing(f);
              void start(f);
            }}
          >
            🔄 カメラを切り替える（内側／外側）
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <button type="button" onClick={() => void start()} className={buttonStyles.primary}>
            📷 カメラで撮る
          </button>
          {camError && <p className="text-center text-sm font-bold text-red-700">カメラを起動できませんでした。「写真を選ぶ」をお使いください。</p>}
          <button type="button" onClick={() => fileRef.current?.click()} className={buttonStyles.secondary}>
            🖼 写真を選ぶ
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label="写真を選ぶ" onChange={onFile} />
        </div>
      )}
      {onSkip && (
        <button type="button" onClick={onSkip} className={cx(buttonStyles.ghost, "w-full")}>
          正面はスキップして結果を見る
        </button>
      )}
    </div>
  );
}

function ResultCard({ title, shot }: { title: string; shot: Shot }) {
  const a = shot.analysis;
  const bad = a.findings.filter((f) => !f.ok);
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-black">{title}</h2>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot.image} alt={`${title}の写真（体の点と線を重ねて表示）`} className="w-full rounded-2xl" />
      <div className="text-center">
        <p className="text-5xl font-black" style={{ color: a.overall.color }}>
          {a.score}
          <span className="text-xl">点</span>
        </p>
        <p className="mt-1 font-black" style={{ color: a.overall.color }}>
          {a.overall.icon} {a.overall.label}
        </p>
        <p className="mt-1 text-sm font-bold text-slate-600">{a.type}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {a.quickChecks.map((q) => (
          <span key={q.label} className={cx("rounded-full px-2.5 py-1 text-xs font-bold", q.bad ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")}>
            {q.bad ? "⚠️" : "✅"} {q.label}
          </span>
        ))}
      </div>
      {bad.length > 0 ? (
        <ul className="space-y-2">
          {bad.map((f) => (
            <li key={f.part} className="rounded-2xl bg-red-50 p-3 text-sm leading-relaxed">
              <p className="font-black text-red-800">
                {f.part}
                {f.severity && <span className="ml-2 rounded-full bg-red-100 px-2 text-xs">{f.severity}</span>}
              </p>
              <p className="mt-1">{f.desc}</p>
              {f.impact && <p className="mt-1 text-amber-800">💡 {f.impact}</p>}
              {f.symptoms && <p className="mt-1 text-xs text-red-800">起こりやすい不調：{f.symptoms.join("・")}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">大きなズレは見られませんでした。</p>
      )}
    </Card>
  );
}

export function PostureCheck() {
  const [step, setStep] = useState<"intro" | View | "result">("intro");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [side, setSide] = useState<Shot | null>(null);
  const [front, setFront] = useState<Shot | null>(null);

  const analyze = async (view: View, canvas: HTMLCanvasElement) => {
    setBusy(true);
    setError(null);
    try {
      const lm = await detect(canvas, view);
      if (!lm || lm.length < 33) {
        setError("体を見つけられませんでした。頭から足先まで全身が入るように、明るい場所で撮り直してください。");
        return;
      }
      const shot = { image: drawOverlay(canvas, lm, view), analysis: view === "side" ? computeSideAnalysis(lm) : computeFrontAnalysis(lm) };
      if (view === "side") {
        setSide(shot);
        setStep("front");
      } else {
        setFront(shot);
        setStep("result");
      }
      window.scrollTo({ top: 0 });
    } catch {
      setError("AIの読み込みに失敗しました。通信状況をご確認のうえ、もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  if (busy) return <Spinner label="AIが姿勢を解析しています…" />;

  if (step === "intro") {
    return (
      <main className="flex flex-1 flex-col">
        <ToolHeader icon="📸" title="AI姿勢チェック" sub="横向きと正面の写真から、AIが姿勢のクセを見つけます（約2分）" />
        <div className="space-y-5 px-5 py-6">
          <Card className="space-y-2 text-sm leading-relaxed">
            <p>
              <b>わかること：</b>頭・肩・骨盤・ひざの前後のズレ（猫背・反り腰など）と、肩・骨盤・頭の左右の傾き
            </p>
            <p>
              <b>準備：</b>全身が映る場所と、体のラインが分かる服。ひとりでもスマホを置いて10秒タイマーで撮れます
            </p>
            <p className="rounded-2xl bg-brand-50 p-3 font-bold text-brand-800">🔒 写真はお使いのスマホの中だけで解析し、どこにも送信・保存しません。</p>
          </Card>
          <button type="button" onClick={() => setStep("side")} className={buttonStyles.primary}>
            はじめる ▶
          </button>
          <Disclaimer>本チェックは写真から姿勢の傾向を推定する目安で、医療診断ではありません。服装・撮影の角度で結果が変わることがあります。</Disclaimer>
        </div>
      </main>
    );
  }

  if (step === "side" || step === "front") {
    return (
      <main className="flex flex-1 flex-col">
        <ToolHeader icon="📸" title="AI姿勢チェック" sub={step === "side" ? "STEP 1 / 2　横向き" : "STEP 2 / 2　正面"} />
        <div className="space-y-4 px-5 py-6">
          {error && (
            <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">
              {error}
            </p>
          )}
          <Capture key={step} view={step} onCaptured={(c) => void analyze(step, c)} onSkip={step === "front" ? () => setStep("result") : undefined} />
        </div>
      </main>
    );
  }

  const summaryParts = [side && `横${side.analysis.score}点（${side.analysis.type}）`, front && `正面${front.analysis.score}点`].filter(Boolean);
  return (
    <main className="flex flex-1 flex-col">
      <ToolHeader icon="📸" title="AI姿勢チェックの結果" />
      <div className="space-y-5 px-5 py-6">
        {side && <ResultCard title="横向き（前後のバランス）" shot={side} />}
        {front && <ResultCard title="正面（左右のバランス）" shot={front} />}
        <ToolResultCta
          summary={`AI姿勢チェック ${summaryParts.join("／")}`}
          lead="写真で見つかった姿勢のクセを、専門スタッフが実際の動きと触診で詳しく確認します。"
        />
        <button
          type="button"
          className={buttonStyles.secondary}
          onClick={() => {
            setSide(null);
            setFront(null);
            setStep("side");
          }}
        >
          撮り直す
        </button>
        <OtherChecks current="/posture" />
        <Disclaimer>本チェックは写真から姿勢の傾向を推定する目安で、医療診断ではありません。</Disclaimer>
      </div>
    </main>
  );
}
