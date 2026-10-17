/**
 * ===== AI姿勢チェックの判定ロジック =====
 * スマホのカメラ／写真から MediaPipe Pose で検出した33点の体の位置（0〜1の比率）をもとに、
 * 横向き（頭・肩・骨盤・膝の前後のズレ）と正面（肩・骨盤・頭の左右差）を採点します。
 * 院内用の「体のチェック（AI姿勢分析）」と同じ判定基準です。医療診断ではありません。
 */

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility: number;
}
export interface Finding {
  part: string;
  ok: boolean;
  severity?: string;
  desc: string;
  impact?: string;
  muscles?: string[];
  symptoms?: string[];
}
export interface Overall {
  label: string;
  color: string;
  icon: string;
}
export interface PostureAnalysis {
  score: number;
  type: string;
  overall: Overall;
  findings: Finding[];
  quickChecks: { label: string; bad: boolean }[];
  side?: string;
  details: { label: string; value: number; color: string }[];
}

// ===== 姿勢の判定ロジック（横向き） =====
// MediaPipe Poseのランドマーク番号：耳7/8　肩11/12　股関節23/24　膝25/26　足首27/28　鼻0

// 基準（許容範囲）に対してどれくらい超えているかで「軽度／中等度／重度」を判定する
// ※かなり厳しめの基準：許容範囲を超えた時点で軽度以上とし、少し超えただけでも中等度・重度に上がりやすくしている
function severityLabel(absValue: number, tolerance: number): string | null {
  if(tolerance<=0) return null;
  const ratio=absValue/tolerance;
  if(ratio<=1) return null; // 基準範囲内
  if(ratio<=1.35) return"軽度";
  if(ratio<=2.0) return"中等度";
  return"重度";
}
// 点数から、画面の主役にする「総合評価」の言葉と色を決める
// ※厳しめの基準：90点以上でないと「良好」にならず、55点未満は最も重い評価になる
export function overallFromScore(score: number): Overall {
  if(score>=90) return{label:"良好",color:"#059669",icon:"✅"};
  if(score>=75) return{label:"軽度の歪みあり",color:"#d97706",icon:"⚠️"};
  if(score>=55) return{label:"中等度の歪みあり",color:"#ea580c",icon:"⚠️"};
  return{label:"歪みが大きく要注意",color:"#dc2626",icon:"🔴"};
}

export function computeSideAnalysis(lm: Landmark[]): PostureAnalysis {
  const leftVis=(lm[7].visibility+lm[11].visibility+lm[23].visibility+lm[25].visibility+lm[27].visibility)/5;
  const rightVis=(lm[8].visibility+lm[12].visibility+lm[24].visibility+lm[26].visibility+lm[28].visibility)/5;
  const useLeft=leftVis>=rightVis;
  const ear=useLeft?lm[7]:lm[8];
  const shoulder=useLeft?lm[11]:lm[12];
  const hip=useLeft?lm[23]:lm[24];
  const knee=useLeft?lm[25]:lm[26];
  const ankle=useLeft?lm[27]:lm[28];
  const nose=lm[0];

  const torsoLen=Math.max(Math.abs(hip.y-shoulder.y),0.05); // 正規化の基準（肩〜股関節の縦の長さ）
  // 身体が向いている方向（鼻が耳よりどちら側にあるか）を基準に、前方向をプラスに揃える
  const facingSign=(nose.x-ear.x)>=0?1:-1;

  function offsetFromAnkle(pt: Landmark): number {
    return((pt.x-ankle.x)/torsoLen)*facingSign;
  }
  const headOffset=offsetFromAnkle(ear);
  const shoulderOffset=offsetFromAnkle(shoulder);
  const hipOffset=offsetFromAnkle(hip);
  const kneeOffset=offsetFromAnkle(knee);

  // ===== 判定基準（かなり厳しめ）=====
  // 許容範囲（tolerance）を従来より狭め、超えた分の重み（weight）を大きくすることで、
  // 少しのズレでも点数が下がりやすく、「良好」と判定されにくくしている。
  const TOL_HEAD=0.06, TOL_SHOULDER=0.04, TOL_HIP=0.035, TOL_KNEE=0.035;

  // ===== スコア計算（100点満点。内部の記録・グラフ表示用に保持） =====
  function deduction(value: number, tolerance: number, weight: number, cap: number): number {
    const over=Math.max(0,Math.abs(value)-tolerance);
    return Math.min(cap,over*weight);
  }
  let score=100;
  score-=deduction(headOffset,TOL_HEAD,220,35);
  score-=deduction(shoulderOffset,TOL_SHOULDER,220,30);
  score-=deduction(hipOffset,TOL_HIP,240,28);
  score-=deduction(kneeOffset,TOL_KNEE,200,20);
  score=Math.max(0,Math.round(score));

  const headForward=headOffset>TOL_HEAD;
  const shoulderForward=shoulderOffset>TOL_SHOULDER;
  const hipForward=hipOffset>TOL_HIP;
  const hipBackward=hipOffset<-TOL_HIP;
  const kneeHyperextended=kneeOffset>TOL_KNEE;

  let type="良好姿勢（バランス良好）";
  if(headForward&&shoulderForward&&hipForward){
    type="スウェイバック姿勢の傾向";
  }else if(headForward&&shoulderForward&&hipBackward){
    type="猫背傾向（円背）";
  }else if(headForward&&shoulderForward){
    type="猫背傾向";
  }else if(headForward&&!shoulderForward){
    type="ストレートネック傾向";
  }else if(!headForward&&hipForward){
    type="反り腰傾向（骨盤前傾）";
  }else if(shoulderForward&&hipBackward){
    type="平背傾向";
  }else if(shoulderForward){
    type="巻き肩傾向";
  }else if(hipForward){
    type="骨盤前傾傾向";
  }else if(hipBackward){
    type="骨盤後傾傾向";
  }else if(score<90){
    type="軽度の姿勢の乱れ";
  }
  if(kneeHyperextended){
    type+="／膝の過伸展あり";
  }

  // ===== 部位ごとの所見：どこが、理想の位置からどうズレていて、身体にどんな負担がかかるか =====
  const findings: Finding[] = [];
  {
    const sev=severityLabel(Math.max(0,headOffset),TOL_HEAD); // 前に出ている場合だけ問題として扱う（後ろに残るのは稀かつ問題になりにくいため）
    if(headOffset>0&&sev){
      findings.push({part:"頭部（頭部前方位／ストレートネック傾向）",ok:false,severity:sev,
        desc:"頭が理想の位置（くるぶしの真上）より前に出ています（頭部前方位）。",
        impact:"首や肩の筋肉が常に頭の重さを支え続けることになり、負担が蓄積しやすい状態です。",
        muscles:["僧帽筋（上部）","肩甲挙筋","後頭下筋群"],
        symptoms:["肩こり","首の張り","緊張型頭痛","眼精疲労"]});
    }else{
      findings.push({part:"頭部",ok:true,desc:"くるぶしの真上に近く、理想的な位置に収まっています。"});
    }
  }
  {
    const sev=severityLabel(Math.max(0,shoulderOffset),TOL_SHOULDER);
    if(shoulderOffset>0&&sev){
      findings.push({part:"肩（巻き肩）",ok:false,severity:sev,
        desc:"肩が理想の位置より前に出ています（巻き肩）。",
        impact:"胸の筋肉が縮こまり、背中側の筋肉が引き伸ばされた状態が続きます。",
        muscles:["大胸筋・小胸筋（縮こまる）","僧帽筋（中部・下部）・菱形筋（伸びて弱くなる）"],
        symptoms:["猫背の助長","呼吸が浅くなる","肩甲骨まわりのこり","肩の可動域低下"]});
    }else{
      findings.push({part:"肩（巻き肩）",ok:true,desc:"理想的な位置に近く、良好な範囲内です。"});
    }
  }
  {
    const sevF=severityLabel(Math.max(0,hipOffset),TOL_HIP);
    const sevB=severityLabel(Math.max(0,-hipOffset),TOL_HIP);
    if(hipOffset>0&&sevF){
      findings.push({part:"骨盤（反り腰）",ok:false,severity:sevF,
        desc:"骨盤が前に傾いています（反り腰）。",
        impact:"腰の反りが強くなることで腰椎まわりに負担が集中しやすい状態です。",
        muscles:["腸腰筋・大腿直筋（縮こまる）","腹筋群・大殿筋（伸びて弱くなる）"],
        symptoms:["腰痛","反り腰による疲労感","股関節前面の張り"]});
    }else if(hipOffset<0&&sevB){
      findings.push({part:"骨盤（後傾）",ok:false,severity:sevB,
        desc:"骨盤が後ろに傾いています（骨盤後傾）。",
        impact:"腰全体が丸まりやすく、お尻や太もも裏に負担が集中しやすい状態です。",
        muscles:["ハムストリングス（縮こまる）","腸腰筋（伸びて弱くなる）"],
        symptoms:["お尻・太もも裏の張り","猫背の助長","腰の重だるさ"]});
    }else{
      findings.push({part:"骨盤（反り腰／後傾）",ok:true,desc:"前後の傾きは理想的な範囲内です。"});
    }
  }
  {
    const sev=severityLabel(Math.max(0,kneeOffset),TOL_KNEE);
    if(kneeOffset>0&&sev){
      findings.push({part:"膝（過伸展）",ok:false,severity:sev,
        desc:"膝が伸びきった状態（過伸展）になっています。",
        impact:"膝の関節や靭帯に体重の負担が集中しやすい状態です。",
        muscles:["大腿四頭筋","下腿三頭筋（ふくらはぎ）"],
        symptoms:["膝の疲労感・違和感","立ち仕事での膝の痛み","膝関節への負担蓄積"]});
    }else{
      findings.push({part:"膝（過伸展）",ok:true,desc:"適度な角度で、理想的な範囲内です。"});
    }
  }

  // ===== ひと目でわかる簡易チェック（巻き肩・反り腰など、よく聞かれる項目を明示） =====
  const quickChecks=[
    {label:"頭部前方位",bad:headForward},
    {label:"巻き肩",bad:shoulderForward},
    {label:"反り腰",bad:hipForward},
    {label:"骨盤後傾",bad:hipBackward},
    {label:"膝の過伸展",bad:kneeHyperextended},
  ];

  return{
    score,type,overall:overallFromScore(score),findings,quickChecks,
    side:useLeft?"左側面":"右側面",
    details:[
      {label:"頭部の前方位",value:headOffset,color:headForward?"#ef4444":"#059669"},
      {label:"肩の前方位（巻き肩）",value:shoulderOffset,color:shoulderForward?"#ef4444":"#059669"},
      {label:"骨盤の前後位置",value:hipOffset,color:(hipForward||hipBackward)?"#ef4444":"#059669"},
      {label:"膝の位置",value:kneeOffset,color:kneeHyperextended?"#ef4444":"#059669"},
    ],
  };
}

// ===== 姿勢の判定ロジック（正面：左右のバランス） =====
export function computeFrontAnalysis(lm: Landmark[]): PostureAnalysis {
  const ls=lm[11],rs=lm[12]; // 肩（左右）
  const lh=lm[23],rh=lm[24]; // 股関節（左右）
  const leftEye=lm[2],rightEye=lm[5];
  const nose=lm[0];

  const shoulderWidth=Math.max(Math.abs(rs.x-ls.x),0.05); // 正規化の基準

  const shoulderTilt=(rs.y-ls.y)/shoulderWidth; // 正の値＝右肩が下がっている
  const hipTilt=(rh.y-lh.y)/shoulderWidth;      // 正の値＝骨盤が右下がり
  const headTilt=(rightEye.y-leftEye.y)/shoulderWidth; // 正の値＝頭部が右に傾いている
  const hipMidX=(lh.x+rh.x)/2;
  const bodyShift=(nose.x-hipMidX)/shoulderWidth; // 正の値＝体幹が右寄り

  // ===== 判定基準（かなり厳しめ） =====
  const TOL_SHOULDER=0.03, TOL_HIP=0.03, TOL_HEAD=0.035, TOL_BODY=0.05;

  function deduction(value: number, tolerance: number, weight: number, cap: number): number {
    const over=Math.max(0,Math.abs(value)-tolerance);
    return Math.min(cap,over*weight);
  }
  let score=100;
  score-=deduction(shoulderTilt,TOL_SHOULDER,280,35);
  score-=deduction(hipTilt,TOL_HIP,280,30);
  score-=deduction(headTilt,TOL_HEAD,260,25);
  score-=deduction(bodyShift,TOL_BODY,220,25);
  score=Math.max(0,Math.round(score));

  const shoulderAsym=Math.abs(shoulderTilt)>TOL_SHOULDER;
  const hipAsym=Math.abs(hipTilt)>TOL_HIP;
  const headAsym=Math.abs(headTilt)>TOL_HEAD;
  const bodyAsym=Math.abs(bodyShift)>TOL_BODY;

  const parts: string[] = [];
  if(shoulderAsym) parts.push(shoulderTilt>0?"右肩下がり":"左肩下がり");
  if(hipAsym) parts.push(hipTilt>0?"骨盤右下がり":"骨盤左下がり");
  if(headAsym) parts.push(headTilt>0?"頭部が右に傾き":"頭部が左に傾き");
  if(bodyAsym) parts.push(bodyShift>0?"体幹が右寄り":"体幹が左寄り");

  const type=parts.length>0?parts.join("／"):"良好（左右バランス良好）";

  // ===== 部位ごとの所見：どこが、どちらにどうズレていて、身体にどんな負担がかかるか =====
  const findings: Finding[] = [];
  {
    const sev=severityLabel(Math.abs(shoulderTilt),TOL_SHOULDER);
    if(sev){
      const dir=shoulderTilt>0?"右肩が下がっています":"左肩が下がっています";
      findings.push({part:"肩の高さ（左右差）",ok:false,severity:sev,
        desc:`${dir}（左右で高さに差があります）。`,
        impact:"下がっている側の首・肩の筋肉が常に引っ張られた状態になりやすいです。",
        muscles:["僧帽筋","肩甲挙筋"],
        symptoms:["こり・痛みの左右差","片側だけの首の張り","肩の高さの見た目の左右差"]});
    }else{
      findings.push({part:"肩の高さ（左右差）",ok:true,desc:"左右の高さがそろっており、良好な範囲内です。"});
    }
  }
  {
    const sev=severityLabel(Math.abs(hipTilt),TOL_HIP);
    if(sev){
      const dir=hipTilt>0?"骨盤が右に下がっています":"骨盤が左に下がっています";
      findings.push({part:"骨盤の高さ（左右差）",ok:false,severity:sev,
        desc:`${dir}（左右で高さに差があります）。`,
        impact:"歩行時のバランスが崩れやすく、下がっている側の関節に負担が偏りやすい状態です。",
        muscles:["中殿筋","腰方形筋"],
        symptoms:["歩行時のバランスの崩れ","股関節・膝・足首への負担の偏り","脚の疲れやすさの左右差"]});
    }else{
      findings.push({part:"骨盤の高さ（左右差）",ok:true,desc:"左右の高さがそろっており、良好な範囲内です。"});
    }
  }
  {
    const sev=severityLabel(Math.abs(headTilt),TOL_HEAD);
    if(sev){
      const dir=headTilt>0?"頭が右に傾いています":"頭が左に傾いています";
      findings.push({part:"頭部の傾き",ok:false,severity:sev,
        desc:`${dir}。`,
        impact:"傾いている反対側の首の筋肉が常に伸ばされた状態になりやすいです。",
        muscles:["胸鎖乳突筋","斜角筋"],
        symptoms:["緊張型頭痛","肩こり","首を回した時の左右差"]});
    }else{
      findings.push({part:"頭部の傾き",ok:true,desc:"まっすぐに近く、良好な範囲内です。"});
    }
  }
  {
    const sev=severityLabel(Math.abs(bodyShift),TOL_BODY);
    if(sev){
      const dir=bodyShift>0?"体幹（上半身）が右に寄っています":"体幹（上半身）が左に寄っています";
      findings.push({part:"体幹バランス",ok:false,severity:sev,
        desc:`${dir}。`,
        impact:"姿勢を支える筋肉に左右で偏った負担がかかり続けやすい状態です。",
        muscles:["腹斜筋群","脊柱起立筋"],
        symptoms:["疲労・張りの左右差","姿勢の崩れやすさ","バランスの取りにくさ"]});
    }else{
      findings.push({part:"体幹バランス",ok:true,desc:"中心が骨盤の真上に近く、良好な範囲内です。"});
    }
  }

  // ===== ひと目でわかる簡易チェック =====
  const quickChecks=[
    {label:"肩の左右差",bad:shoulderAsym},
    {label:"骨盤の左右差",bad:hipAsym},
    {label:"頭部の傾き",bad:headAsym},
    {label:"体幹の左右バランス",bad:bodyAsym},
  ];

  return{
    score,type,overall:overallFromScore(score),findings,quickChecks,
    details:[
      {label:"肩の高さの左右差",value:shoulderTilt,color:shoulderAsym?"#ef4444":"#059669"},
      {label:"骨盤の高さの左右差",value:hipTilt,color:hipAsym?"#ef4444":"#059669"},
      {label:"頭部の傾き",value:headTilt,color:headAsym?"#ef4444":"#059669"},
      {label:"体幹の左右バランス",value:bodyShift,color:bodyAsym?"#ef4444":"#059669"},
    ],
  };
}

