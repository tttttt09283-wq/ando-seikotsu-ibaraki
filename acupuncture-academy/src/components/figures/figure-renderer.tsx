"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { flowOrder } from "@/data/meridians";
import { BodyFigure } from "./body-figure";
import { FlowCycleFigure, LimbDirectionFigure, MeridianSystemFigure } from "./diagrams";
import {
  ArmChannelsFigure,
  ChannelPairsFigure,
  FiveElementsFigure,
  JingbieFlowFigure,
  QiBloodFluidFigure,
  TransmissionFigure,
  YinYangBalanceFigure,
  YinYangFigure,
  ZangFuFigure,
} from "./diagrams-basics";
import { BoneProportionFigure, FingerCunFigure, PointClassificationFigure, SpineLandmarksFigure } from "./diagrams-points";
import {
  BiaoBenFigure,
  CareTeamFigure,
  ConfluentOverviewFigure,
  EightPrinciplesFigure,
  ExtraVesselsFigure,
  FiveShuFigure,
  FourExamsFigure,
  HeadacheChannelsFigure,
  HuiHeFigure,
  NeedleMoxaFigure,
  NeuropathicPainFigure,
  ParkinsonFigure,
  PulsePositionsFigure,
  RedFlagFlowFigure,
  ShuMuFigure,
  TongueMapFigure,
  TonifyDrainFigure,
  YuanTableFigure,
  ZangfuPatternsFigure,
} from "./diagrams-advanced";
import type { MeridianId, View } from "@/data/types";

function BodyPair({ views, visible }: { views: View[]; visible: MeridianId[] }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {views.map((v) => (
          <BodyFigure key={v} view={v} visible={visible} showLabels={false} pointCodes={[]} className="w-full" />
        ))}
      </div>
      <ProvisionalFigureNotice />
    </div>
  );
}
import { ProvisionalFigureNotice } from "@/components/common/notices";

export function FigureRenderer({ id }: { id: string }) {
  switch (id) {
    case "meridian-system":
      return <MeridianSystemFigure />;
    case "limb-direction":
      return <LimbDirectionFigure />;
    case "flow-cycle":
      return <FlowCycleFigure />;
    case "yin-yang":
      return <YinYangFigure />;
    case "yin-yang-balance":
      return <YinYangBalanceFigure />;
    case "five-elements":
      return <FiveElementsFigure />;
    case "qi-blood-fluid":
      return <QiBloodFluidFigure />;
    case "zang-fu":
      return <ZangFuFigure />;
    case "jingbie-flow":
      return <JingbieFlowFigure />;
    case "transmission":
      return <TransmissionFigure />;
    case "arm-channels":
      return <ArmChannelsFigure />;
    case "channel-pairs":
      return <ChannelPairsFigure />;
    case "point-classification":
      return <PointClassificationFigure />;
    case "bone-proportion":
      return <BoneProportionFigure />;
    case "finger-cun":
      return <FingerCunFigure />;
    case "spine-landmarks":
      return <SpineLandmarksFigure />;
    case "five-shu":
      return <FiveShuFigure />;
    case "yuan-table":
      return <YuanTableFigure />;
    case "shu-mu":
      return <ShuMuFigure />;
    case "hui-he":
      return <HuiHeFigure />;
    case "extra-vessels":
      return <ExtraVesselsFigure />;
    case "confluent-overview":
      return <ConfluentOverviewFigure />;
    case "four-exams":
      return <FourExamsFigure />;
    case "tongue-map":
      return <TongueMapFigure />;
    case "pulse-positions":
      return <PulsePositionsFigure />;
    case "eight-principles":
      return <EightPrinciplesFigure />;
    case "zangfu-patterns":
      return <ZangfuPatternsFigure />;
    case "headache-channels":
      return <HeadacheChannelsFigure />;
    case "biao-ben":
      return <BiaoBenFigure />;
    case "tonify-drain":
      return <TonifyDrainFigure />;
    case "needle-moxa":
      return <NeedleMoxaFigure />;
    case "redflag-flow":
      return <RedFlagFlowFigure />;
    case "neuropathic-pain":
      return <NeuropathicPainFigure />;
    case "parkinson":
      return <ParkinsonFigure />;
    case "care-team":
      return <CareTeamFigure />;
    case "body-arms":
      return <BodyPair views={["front", "back"]} visible={["LU", "PC", "HT", "LI", "TE", "SI"]} />;
    case "body-legs":
      return <BodyPair views={["front", "back"]} visible={["ST", "SP", "LR", "KI", "GB", "BL"]} />;
    case "body-preview":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(["front", "back", "side"] as const).map((v) => (
              <BodyFigure key={v} view={v} visible={flowOrder} showLabels={false} pointCodes={[]} className="w-full" />
            ))}
          </div>
          <ProvisionalFigureNotice />
          <Button asChild variant="outline" className="w-full">
            <Link href="/meridians">
              経絡マップで詳しく見る
              <ArrowRight />
            </Link>
          </Button>
        </div>
      );
    default:
      return <p className="text-sm text-verify">図「{id}」は準備中です。</p>;
  }
}
