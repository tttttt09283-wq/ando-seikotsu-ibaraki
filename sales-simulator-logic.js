// 整骨院 総売上シミュレーター の計算ロジック
// 画面（index.html の SalesSimulatorPanel）から切り離した純粋な関数。テストは test/sales-simulator.test.js。
// 率（rate）はすべて「%」（0〜100）で持つ。
//
// 端数処理（全体で統一）
// - 回数・件数は四捨五入で整数にする（roundCount）。浮動小数点の誤差（2.9999… など）はごく小さな補正値で吸収する。
// - 金額は「整数の件数 × 整数円の単価」なので、常に整数円になる。
//
// 重複計上しないためのルール
// - カルテ数と延べ来院数は1回だけ数える。柔整と鍼灸を併用する患者がいても来院数は増えない。
// - 柔整・鍼灸の対応率はどちらも「延べ来院数に対する割合」。合計が100%を超えてもよい（併用）。各率は0〜100%。
// - 鍼灸の2術件数＝鍼灸延べ対応数−1術件数。1術＋2術が必ず鍼灸延べ対応数と一致する。
// - 自費施術・EMS・物販・その他は、それぞれ独立した売上として1回ずつだけ足す。
//
// 保険の単価は制度上の固定単価ではなく、実績にもとづく編集できる平均値として扱う。算定の適法性・請求可否は判定しない。
(function(root){
  const EPS=1e-9;

  // ===== 入力の安全化 =====
  function roundCount(v){ return !Number.isFinite(v)||v<=0?0:Math.floor(v+0.5+EPS); }
  function toSafeNumber(v,fallback){
    const fb=fallback===undefined?0:fallback;
    if(v===null||v===undefined) return fb;
    if(typeof v==="string"){
      const s=v.replace(/[０-９．]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0)).replace(/[,，\s円人回枚件日%％]/g,"");
      if(s==="") return fb;
      v=Number(s);
    }
    return typeof v==="number"&&Number.isFinite(v)?v:fb;
  }
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  const nonNegative=v=>Math.max(0,toSafeNumber(v));
  const nonNegativeInt=v=>Math.round(nonNegative(v));
  const percent=v=>Math.round(clamp(toSafeNumber(v),0,100)*10)/10;
  const oneDecimal=v=>Math.round(nonNegative(v)*10)/10;

  // ===== デモ用の初期値（仮の数値。実際の請求単価ではない） =====
  const DEFAULT_INPUT={
    basic:{karteCount:100,visitsPerKarte:5,workingDays:25,staffCount:4,targetSales:4000000},
    judo:{rate:100,useManualCount:false,manualCount:500,copay:500,claim:1700},
    acu:{rate:60,oneRate:30,one:{copay:300,claim:1200},two:{copay:400,claim:1600}},
    self:{treatmentCount:100,treatmentPrice:2000,emsRate:20,emsPrice:2000,productSales:0,otherSales:0},
  };
  function cloneInput(i){
    return {basic:{...i.basic},judo:{...i.judo},acu:{...i.acu,one:{...i.acu.one},two:{...i.acu.two}},self:{...i.self}};
  }

  // 入力全体を安全な値にそろえる（保存データが古い・壊れている場合も、欠けた項目は fallback で補う）
  function sanitizeInput(raw,fallback){
    const fb=fallback||DEFAULT_INPUT;
    const r=raw&&typeof raw==="object"?raw:{};
    const b=r.basic||{}, j=r.judo||{}, a=r.acu||{}, s=r.self||{}, a1=a.one||{}, a2=a.two||{};
    const pick=(v,d)=>v===undefined?d:v;
    return {
      basic:{
        karteCount:nonNegativeInt(pick(b.karteCount,fb.basic.karteCount)),
        visitsPerKarte:Math.min(31,oneDecimal(pick(b.visitsPerKarte,fb.basic.visitsPerKarte))),
        workingDays:clamp(nonNegativeInt(pick(b.workingDays,fb.basic.workingDays)),0,31),
        staffCount:nonNegativeInt(pick(b.staffCount,fb.basic.staffCount)),
        targetSales:nonNegativeInt(pick(b.targetSales,fb.basic.targetSales)),
      },
      judo:{
        rate:percent(pick(j.rate,fb.judo.rate)),
        useManualCount:typeof j.useManualCount==="boolean"?j.useManualCount:fb.judo.useManualCount,
        manualCount:nonNegativeInt(pick(j.manualCount,fb.judo.manualCount)),
        copay:nonNegativeInt(pick(j.copay,fb.judo.copay)),
        claim:nonNegativeInt(pick(j.claim,fb.judo.claim)),
      },
      acu:{
        rate:percent(pick(a.rate,fb.acu.rate)),
        oneRate:percent(pick(a.oneRate,fb.acu.oneRate)),
        one:{copay:nonNegativeInt(pick(a1.copay,fb.acu.one.copay)),claim:nonNegativeInt(pick(a1.claim,fb.acu.one.claim))},
        two:{copay:nonNegativeInt(pick(a2.copay,fb.acu.two.copay)),claim:nonNegativeInt(pick(a2.claim,fb.acu.two.claim))},
      },
      self:{
        treatmentCount:nonNegativeInt(pick(s.treatmentCount,fb.self.treatmentCount)),
        treatmentPrice:nonNegativeInt(pick(s.treatmentPrice,fb.self.treatmentPrice)),
        emsRate:percent(pick(s.emsRate,fb.self.emsRate)),
        emsPrice:nonNegativeInt(pick(s.emsPrice,fb.self.emsPrice)),
        productSales:nonNegativeInt(pick(s.productSales,fb.self.productSales)),
        otherSales:nonNegativeInt(pick(s.otherSales,fb.self.otherSales)),
      },
    };
  }

  // ===== 月間売上の計算 =====
  // 0除算を防ぐ割り算（分母が0以下なら null）
  function safeDivide(a,b){ return !Number.isFinite(a)||!Number.isFinite(b)||b<=0?null:a/b; }
  // 件数＝母数×率(%)を四捨五入（掛けてから100で割って誤差を抑える）
  const countByRate=(base,rate)=>roundCount(base*rate/100);

  function calculate(input){
    const {basic,judo,acu,self}=input;
    const warnings=[];
    const totalVisits=roundCount(basic.karteCount*basic.visitsPerKarte);

    let judoCount;
    if(judo.useManualCount){
      judoCount=Math.max(0,Math.round(judo.manualCount));
      if(judoCount>totalVisits){
        warnings.push(`柔整保険の延べ対応数（${judoCount}回）が延べ来院数（${totalVisits}回）を超えているため、延べ来院数に合わせて計算しています。`);
        judoCount=totalVisits;
      }
    } else judoCount=countByRate(totalVisits,judo.rate);
    const judoCopay=judoCount*judo.copay, judoClaim=judoCount*judo.claim;

    const acuCount=countByRate(totalVisits,acu.rate);
    const oneRate=clamp(acu.oneRate,0,100);
    const twoRate=Math.round((100-oneRate)*10)/10;
    const oneCount=countByRate(acuCount,oneRate);
    const twoCount=acuCount-oneCount;
    const acuCopay=oneCount*acu.one.copay+twoCount*acu.two.copay;
    const acuClaim=oneCount*acu.one.claim+twoCount*acu.two.claim;

    const treatmentCount=Math.max(0,Math.round(self.treatmentCount));
    const treatmentSales=treatmentCount*self.treatmentPrice;
    const emsCount=countByRate(totalVisits,self.emsRate);
    const emsSales=emsCount*self.emsPrice;
    const selfTotal=treatmentSales+emsSales+self.productSales+self.otherSales;
    if(treatmentCount>totalVisits&&totalVisits>0)
      warnings.push(`自費施術の延べ件数（${treatmentCount}件）が延べ来院数（${totalVisits}回）を上回っています。1回の来院で複数施術がある場合以外は入力を確認してください。`);

    const judoTotal=judoCopay+judoClaim, acuTotal=acuCopay+acuClaim;
    const insuranceTotal=judoTotal+acuTotal;
    const totalSales=insuranceTotal+selfTotal;
    const fixedSales=self.productSales+self.otherSales;
    const rate=safeDivide(totalSales,basic.targetSales);
    return {
      totalVisits,
      judo:{effectiveRate:(safeDivide(judoCount,totalVisits)||0)*100,count:judoCount,copaySales:judoCopay,claimSales:judoClaim,total:judoTotal},
      acu:{count:acuCount,oneRate,twoRate,oneCount,twoCount,copaySales:acuCopay,claimSales:acuClaim,total:acuTotal},
      self:{treatmentCount,treatmentSales,emsCount,emsSales,productSales:self.productSales,otherSales:self.otherSales,total:selfTotal},
      insuranceTotal,totalSales,fixedSales,variableSales:totalSales-fixedSales,
      achievementRate:rate===null?null:rate*100,
      shortfall:Math.max(0,basic.targetSales-totalSales),
      surplus:Math.max(0,totalSales-basic.targetSales),
      salesPerKarte:safeDivide(totalSales,basic.karteCount),
      salesPerVisit:safeDivide(totalSales,totalVisits),
      salesPerStaff:safeDivide(totalSales,basic.staffCount),
      visitsPerDay:safeDivide(totalVisits,basic.workingDays),
      warnings,
    };
  }

  // ===== 目標逆算 =====
  // 固定売上＝物販・その他（カルテ数が変わっても一定）、連動売上＝それ以外（来院数に比例）。
  // カルテ数・来院回数を変えるときは、各率・単価はそのまま、自費施術件数は「今の 自費件数÷延べ来院数」の割合で増減。
  // 柔整を直接入力している場合は、今の実効対応率（件数÷来院数）に置き換える。
  function projectInput(base,change){
    const c=change||{};
    const baseResult=calculate(base);
    const baseVisits=baseResult.totalVisits;
    const karteCount=c.karteCount!==undefined?c.karteCount:base.basic.karteCount;
    const visitsPerKarte=c.visitsPerKarte!==undefined?c.visitsPerKarte:base.basic.visitsPerKarte;
    const newVisits=roundCount(karteCount*visitsPerKarte);
    const treatmentCount=baseVisits>0?roundCount(newVisits*base.self.treatmentCount/baseVisits):base.self.treatmentCount;
    const next=cloneInput(base);
    next.basic.karteCount=karteCount; next.basic.visitsPerKarte=visitsPerKarte;
    if(base.judo.useManualCount){ next.judo.useManualCount=false; next.judo.rate=baseResult.judo.effectiveRate; }
    if(c.acuRate!==undefined) next.acu.rate=c.acuRate;
    next.self.treatmentCount=treatmentCount;
    if(c.treatmentPrice!==undefined) next.self.treatmentPrice=c.treatmentPrice;
    return next;
  }

  // 単調に増える f について、f(n)>=target となる最小の整数 n（lo〜hi）を二分探索。無ければ null
  function findMinInteger(f,target,lo,hi){
    if(hi<lo||f(hi)<target) return null;
    let l=lo, r=hi;
    while(l<r){ const m=Math.floor((l+r)/2); if(f(m)>=target) r=m; else l=m+1; }
    return l;
  }

  const MAX_KARTE=1000000, MAX_VISITS_TENTHS=310, SELF_PRICE_STEP=10, MAX_SELF_PRICE_STEPS=100000;
  const salesOf=(base,change)=>calculate(projectInput(base,change)).totalSales;

  function findRequiredKarte(base,target){
    const f=k=>salesOf(base,{karteCount:k});
    if(f(0)>=target) return 0;
    let hi=Math.max(1,base.basic.karteCount);
    while(f(hi)<target){ if(hi>=MAX_KARTE) return null; hi=Math.min(MAX_KARTE,hi*2); }
    return findMinInteger(f,target,0,hi);
  }

  function reverseCalculate(base){
    const current=calculate(base);
    const target=base.basic.targetSales;
    const alreadyAchieved=current.totalSales>=target;
    const mk=(key,label,description,unit,cur,req,change,note)=>({
      key,label,description,unit,current:cur,required:req,
      delta:req===null?null:Math.round((req-cur)*10)/10,
      achievable:req!==null,alreadyAchieved,
      resultingSales:req===null?null:salesOf(base,change(req)),
      note:req===null?note:undefined,
    });

    const requiredKarte=findRequiredKarte(base,target);
    const visitsTenths=findMinInteger(t=>salesOf(base,{visitsPerKarte:t/10}),target,0,MAX_VISITS_TENTHS);
    const acuRate=findMinInteger(r=>salesOf(base,{acuRate:r}),target,0,100);
    const priceSteps=findMinInteger(p=>salesOf(base,{treatmentPrice:p*SELF_PRICE_STEP}),target,0,MAX_SELF_PRICE_STEPS);

    const cases=[
      mk("karte","カルテ数を増やす","来院頻度・対応率・単価はそのままで、稼働カルテ数だけを増やす","枚",
        base.basic.karteCount,requiredKarte,v=>({karteCount:v}),"来院に連動する売上が0のため、カルテ数を増やしても目標に届きません。"),
      mk("visits","来院回数を増やす","カルテ数はそのままで、1カルテあたりの月間来院回数を増やす","回",
        base.basic.visitsPerKarte,visitsTenths===null?null:visitsTenths/10,v=>({visitsPerKarte:v}),"月31回（毎日来院）まで増やしても目標に届きません。"),
      mk("acuRate","鍼灸保険対応率を高める","カルテ数・来院回数はそのままで、鍼灸保険の対応率を高める","%",
        base.acu.rate,acuRate,v=>({acuRate:v}),"鍼灸保険対応率を100%にしても目標に届きません。"),
      mk("selfPrice","自費単価を高める","自費施術の件数はそのままで、平均単価を高める（10円単位）","円",
        base.self.treatmentPrice,priceSteps===null?null:priceSteps*SELF_PRICE_STEP,v=>({treatmentPrice:v}),
        base.self.treatmentCount===0?"自費施術の件数が0のため、単価を上げても売上は増えません。":"単価100万円まででは目標に届きません。"),
    ];
    const requiredVisits=requiredKarte===null?null:roundCount(requiredKarte*base.basic.visitsPerKarte);
    return {
      targetSales:target,currentSales:current.totalSales,gap:target-current.totalSales,
      fixedSales:current.fixedSales,variableSales:current.variableSales,
      variablePerKarte:safeDivide(current.variableSales,base.basic.karteCount),
      requiredKarte,
      additionalKarte:requiredKarte===null?null:Math.max(0,requiredKarte-base.basic.karteCount),
      requiredVisits,
      requiredVisitsPerDay:requiredVisits===null?null:safeDivide(requiredVisits,base.basic.workingDays),
      requiredSalesPerStaff:safeDivide(target,base.basic.staffCount),
      currentSalesPerStaff:current.salesPerStaff,
      cases,
    };
  }

  // ===== 月次の実績（SalesReport.buildMonthlyKpi の1行）から、人数・回数・率だけを読み込む =====
  // 単価（窓口・請求・自費）は実績から正しく分けられないので変えない。
  // 平均来院回数は小数第1位に丸めるため、延べ来院数は実績と数回ずれることがある。
  function fromMonthlyActuals(row,base){
    const next=cloneInput(base);
    if(!row||row.empty||!row.visits||!row.karte) return null;
    next.basic.karteCount=nonNegativeInt(row.karte);
    next.basic.visitsPerKarte=Math.min(31,oneDecimal(row.visits/row.karte));
    if(row.days) next.basic.workingDays=clamp(nonNegativeInt(row.days),0,31);
    if(row.therapists) next.basic.staffCount=Math.max(1,nonNegativeInt(row.therapists));
    next.judo.useManualCount=false;
    next.judo.rate=percent((row.juVisits||0)/row.visits*100);
    next.acu.rate=percent((row.acuVisits||0)/row.visits*100);
    return next;
  }

  // ===== 3パターン（現在値・改善案・挑戦目標）の保存 =====
  const SCENARIOS=[{id:"current",label:"現在値"},{id:"improve",label:"改善案"},{id:"challenge",label:"挑戦目標"}];
  // 店舗ごとに保存する。index.html の SHARED_SETTING_PREFIXES に "sales_simulator_" があり、全端末で共有される
  const STORAGE_PREFIX="sales_simulator_";
  const storageKey=storeId=>`${STORAGE_PREFIX}v1_${storeId==null?"all":storeId}`;
  function createInitialState(){
    const scenarios={};
    SCENARIOS.forEach(s=>{ scenarios[s.id]={input:cloneInput(DEFAULT_INPUT),savedAt:null}; });
    return {version:1,active:"current",scenarios};
  }
  function parseStoredState(json){
    const init=createInitialState();
    if(!json) return init;
    try{
      const raw=JSON.parse(json);
      if(!raw||typeof raw!=="object") return init;
      SCENARIOS.forEach(({id})=>{
        const s=raw.scenarios&&raw.scenarios[id];
        if(s&&typeof s==="object") init.scenarios[id]={input:sanitizeInput(s.input,DEFAULT_INPUT),savedAt:typeof s.savedAt==="string"?s.savedAt:null};
      });
      if(SCENARIOS.some(s=>s.id===raw.active)) init.active=raw.active;
      return init;
    }catch(e){ return init; }
  }
  const inputsEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

  // ===== 表示 =====
  function formatInt(v){ return v===null||v===undefined||!Number.isFinite(v)?"—":Math.round(v).toLocaleString("ja-JP"); }
  function formatOneDecimal(v){ return v===null||v===undefined||!Number.isFinite(v)?"—":(Math.round(v*10)/10).toLocaleString("ja-JP",{maximumFractionDigits:1}); }
  function formatPercent(v){ const s=formatOneDecimal(v); return s==="—"?s:s+"%"; }
  function formatSigned(v,unit,decimals){
    if(v===null||v===undefined||!Number.isFinite(v)) return "—";
    const body=decimals?formatOneDecimal(Math.abs(v)):formatInt(Math.abs(v));
    return (v>0?"+":v<0?"−":"±")+body+unit;
  }

  root.SalesSim={
    roundCount,toSafeNumber,clamp,nonNegativeInt,percent,sanitizeInput,
    DEFAULT_INPUT,cloneInput,safeDivide,countByRate,calculate,
    projectInput,findMinInteger,reverseCalculate,fromMonthlyActuals,
    SCENARIOS,STORAGE_PREFIX,storageKey,createInitialState,parseStoredState,inputsEqual,
    formatInt,formatOneDecimal,formatPercent,formatSigned,
  };
})(typeof window!=="undefined"?window:globalThis);
