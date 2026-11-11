// 売上日報・日計／累計表（POSの「総合売上日報」「日計／累計表」と同じ集計）
// 画面（index.html の SalesReportPanel）から切り離した純粋な関数。テストは test/sales-report.test.js。
(function(root){
  const norm=s=>String(s||"").replace(/[\s　]/g,"");

  // ===== 商品（物販）の分け方 =====
  const GOODS_KINDS=[
    {key:"corset",label:"コルセット",words:["コルセット","サポーター","骨盤ベルト"]},
    {key:"taping",label:"テーピング",words:["テーピング","テープ"]},
    {key:"shippu",label:"シップ",words:["シップ","湿布"]},
  ];
  // 商品＝「物販：」で始まる項目、または物販らしい名前（テーピングは「物販：」が付いたときだけ商品。施術のテーピングは技術）
  function isGoods(label){
    const s=String(label||"");
    if(s.startsWith("物販：")) return true;
    return ["物販","商品","インソール","サンダル","コルセット","サポーター","シップ","湿布","サプリ"].some(w=>s.includes(w));
  }
  function goodsKind(label){
    const s=String(label||"");
    const k=GOODS_KINDS.find(g=>g.words.some(w=>s.includes(w)));
    return k?k.key:"other";
  }

  // ===== 支払方法（"現金:¥800・カード:¥3,600" の形） =====
  const PAY_KINDS=[
    {key:"cash",label:"現金",match:m=>/現金/.test(m)},
    {key:"credit",label:"クレジット",match:m=>/カード|クレジット/.test(m)},
    {key:"emoney",label:"電子マネー（PayPay等）",match:m=>/PayPay|ペイペイ|電子|QR|楽天|d払い|au\s?PAY|メルペイ|Suica|交通系|iD|QUICPay/i.test(m)},
  ];
  function parsePayments(text,total){
    const out=[];
    String(text||"").split("・").forEach(part=>{
      const m=part.match(/^(.*?)[:：]\s*[¥￥]?\s*([\d,]+)/);
      if(!m) return;
      const amt=Number(m[2].replace(/,/g,""))||0;
      const kind=(PAY_KINDS.find(k=>k.match(m[1]))||{key:"other"}).key;
      out.push({kind,amount:amt});
    });
    // 書き方が違う古いデータ：方法の名前だけで判定し、金額は会計の合計
    if(!out.length&&text){ const kind=(PAY_KINDS.find(k=>k.match(String(text)))||{key:"other"}).key; out.push({kind,amount:Number(total)||0}); }
    return out;
  }

  // ===== 患者さんごとの来院の記録（来店区分・性別・年代・きっかけに使う） =====
  // 来院＝会計のある予約（同じ予約の会計はまとめて1回）。¥0（回数券・FPの消化など）も来院に数える
  function visitsOf(payments){
    const m={};
    (payments||[]).forEach(p=>{
      if(p.is_refund||!p.payment_date) return;
      const key=p.booking_id!=null?"b"+p.booking_id:"p"+p.id;
      const v=m[key]=m[key]||{key,bookingId:p.booking_id,patient:norm(p.patient_name),date:p.payment_date,staffId:p.staff_id||0,payments:[]};
      if(p.payment_date<v.date) v.date=p.payment_date;
      v.payments.push(p);
    });
    return Object.values(m);
  }
  // 来店区分：新規＝初めて、再来＝2回目、固定＝3回目以上で前回から gapDays 日以内、ごぶさた＝前回から gapDays 日を超えて来院
  function classifyVisits(allVisits,gapDays){
    const gap=gapDays||90;
    const byPatient={};
    allVisits.forEach(v=>{ (byPatient[v.patient]=byPatient[v.patient]||[]).push(v); });
    const cls={};
    Object.values(byPatient).forEach(list=>{
      list.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:String(a.key).localeCompare(String(b.key)));
      list.forEach((v,i)=>{
        if(!v.patient){ cls[v.key]="guest"; return; }
        if(i===0){ cls[v.key]="new"; return; }
        const days=Math.round((Date.parse(v.date)-Date.parse(list[i-1].date))/86400000);
        if(days>gap) cls[v.key]="lapsed";
        else cls[v.key]=i===1?"return":"regular";
      });
    });
    return cls;
  }
  const VISIT_CLASSES=[{key:"new",label:"新規"},{key:"return",label:"再来"},{key:"regular",label:"固定"},{key:"lapsed",label:"ごぶさた"},{key:"guest",label:"ゲスト"}];

  // 予約（問診票）から患者さんごとの性別・年齢・きっかけ（いちばん新しい記入）
  function patientProfiles(bookings){
    const m={};
    [...(bookings||[])].sort((a,b)=>String(a.date).localeCompare(String(b.date))).forEach(b=>{
      const k=norm(b.patient_name); if(!k) return;
      const r=m[k]=m[k]||{};
      if(b.gender) r.gender=b.gender;
      if(b.age!==null&&b.age!==undefined&&b.age!=="") r.age=Number(b.age);
      if(b.how_know&&String(b.how_know).trim()) r.howKnow=String(b.how_know).trim();
    });
    return m;
  }
  const GENDERS=[{key:"female",label:"女性"},{key:"male",label:"男性"},{key:"unknown",label:"不明"}];
  const genderKey=g=>/女/.test(g||"")?"female":/男/.test(g||"")?"male":"unknown";
  const AGE_BANDS=[
    {key:"u10",label:"10歳未満"},{key:"10",label:"10歳代"},{key:"20",label:"20歳代"},{key:"30",label:"30歳代"},{key:"40",label:"40歳代"},
    {key:"50",label:"50歳代"},{key:"60",label:"60歳代"},{key:"70",label:"70歳代"},{key:"80",label:"80歳以上"},{key:"unknown",label:"不明"},
  ];
  function ageBand(age){
    if(age===null||age===undefined||!Number.isFinite(Number(age))) return "unknown";
    const a=Number(age);
    if(a<10) return "u10";
    if(a>=80) return "80";
    return String(Math.floor(a/10)*10);
  }
  const SOURCES=[
    {key:"referral",label:"紹介",re:/紹介/},
    {key:"google",label:"Google",re:/google|グーグル|検索|マップ/i},
    {key:"hp",label:"ホームページ",re:/ホームページ|HP|ウェブ|web/i},
    {key:"instagram",label:"Instagram",re:/instagram|インスタ/i},
    {key:"sns",label:"SNS（Threads等）",re:/threads|sns|tiktok|facebook|line|x\(|twitter|youtube/i},
    {key:"hotpepper",label:"ホットペッパー",re:/ホットペッパー|hot\s?pepper/i},
    {key:"ekiten",label:"エキテン",re:/エキテン/},
    {key:"tissue",label:"ティッシュ",re:/ティッシュ/},
    {key:"flyer",label:"チラシ",re:/チラシ|ポスティング/},
    {key:"walkby",label:"通りがかり・看板",re:/通りがかり|看板|近所|通勤/},
    {key:"other",label:"その他",re:/./},
  ];
  const sourceKey=t=>{ const s=String(t||"").trim(); if(!s) return "none"; return SOURCES.find(x=>x.re.test(s)).key; };

  // ===== 保険の窓口負担の柔整・鍼灸の内訳 =====
  // 会計で分けて保存した金額（ju_insurance_amount／acu_insurance_amount）を使う。
  // 分けて保存していない古い会計は、区分が「鍼灸～」（鍼灸併用・鍼灸のみ）なら鍼灸、それ以外は柔整
  function insuranceSplit(p){
    const ins=Number(p&&p.insurance_amount)||0;
    const ju=p&&p.ju_insurance_amount, acu=p&&p.acu_insurance_amount;
    if((ju!==null&&ju!==undefined)||(acu!==null&&acu!==undefined)) return {ju:Number(ju)||0,acu:Number(acu)||0};
    return /^鍼灸/.test(String((p&&p.insurance_type)||""))?{ju:0,acu:ins}:{ju:ins,acu:0};
  }

  // ===== 部門（柔整＝保険診療／鍼灸）=====
  // 保険診療＋鍼灸併用の会計は両方の部門に入る。医療助成の0円の会計も、区分を選んでいれば部門に数える
  function insuranceDepts(p){
    const t=String((p&&p.insurance_type)||""), sp=insuranceSplit(p), ins=Number(p&&p.insurance_amount)||0;
    return {
      ju:/手技/.test(t)||(!t&&ins>0)||sp.ju>0,
      acu:/鍼灸/.test(t)||sp.acu>0,
    };
  }
  // 保険の請求（見込み）：部門ごとに 実人数 × この金額（あとで実際の請求額に合わせて変えられるよう定数にしておく）
  const CLAIM_PER_PERSON={ju:1000,acu:1000};
  const DEPTS=[{key:"ju",label:"柔整（保険診療）"},{key:"acu",label:"鍼灸保険"}];

  // ===== 会計1件の内訳 =====
  // 技術＝保険の窓口負担＋自費の施術（回数券・FPを含む）。商品＝物販。消費税は自費・商品（課税）にだけ内税10%（保険は非課税）
  function splitAmounts(p){
    const total=Number(p.total_amount)||0, ins=Number(p.insurance_amount)||0;
    if(p.is_refund) return {total,ins:Number(p.insurance_amount)||0,tech:total,goods:0,goodsByKind:{}};
    let goods=0; const goodsByKind={};
    (Array.isArray(p.jifee_items)?p.jifee_items:[]).forEach(i=>{
      const a=Number(i&&i.amount)||0; if(!a||!isGoods(i.label)) return;
      goods+=a; const k=goodsKind(i.label); goodsByKind[k]=(goodsByKind[k]||0)+a;
    });
    return {total,ins,tech:total-goods,goods,goodsByKind};
  }
  const rateKey=r=>{ const s=String(r||""); if(/助成|0割|０割/.test(s)) return "subsidy"; if(/1|１/.test(s)) return "r1"; if(/2|２/.test(s)) return "r2"; return "r3"; };
  const TECH_ROWS=[{key:"r3",label:"保険 3割"},{key:"r2",label:"保険 2割"},{key:"r1",label:"保険 1割"},{key:"subsidy",label:"医療助成"},{key:"other",label:"上記以外（自費・回数券・FP等）"}];

  // ===== 総合売上日報・日計／累計表 =====
  // opts: {from, to, storeId|null, bookings, registerClosings, gapDays}
  function buildReport(payments,opts){
    const o=opts||{};
    const bookingById={}; (o.bookings||[]).forEach(b=>{ bookingById[b.id]=b; });
    const inStore=p=>o.storeId==null||p.booking_id==null||((bookingById[p.booking_id]||{}).store_id||1)===o.storeId;
    const inPeriod=d=>d&&(!o.from||d>=o.from)&&(!o.to||d<=o.to);
    const allVisits=visitsOf((payments||[]).filter(inStore));
    const cls=classifyVisits(allVisits,o.gapDays);
    const profiles=patientProfiles(o.bookings);
    const visits=allVisits.filter(v=>inPeriod(v.date));
    const refunds=(payments||[]).filter(p=>p.is_refund&&inPeriod(p.payment_date)&&inStore(p));

    const zero=()=>({count:0,amount:0});
    const r={
      days:new Set(visits.map(v=>v.date)).size,
      total:zero(),tech:zero(),goods:zero(),
      techRows:Object.fromEntries(TECH_ROWS.map(t=>[t.key,zero()])),
      juIns:zero(), acuIns:zero(),
      dept:{ju:{visits:0,people:new Set(),amount:0},acu:{visits:0,people:new Set(),amount:0}},
      goodsRows:Object.fromEntries([...GOODS_KINDS.map(g=>g.key),"other"].map(k=>[k,zero()])),
      visitClass:Object.fromEntries(VISIT_CLASSES.map(c=>[c.key,zero()])),
      gender:Object.fromEntries(GENDERS.map(g=>[g.key,zero()])),
      sources:{}, ages:{},
      taxable:0, nonTaxable:0,
      pay:Object.fromEntries([...PAY_KINDS.map(k=>k.key),"other"].map(k=>[k,zero()])),
      refund:{count:refunds.length,amount:refunds.reduce((s,p)=>s-(Number(p.total_amount)||0),0)},
      staffCount:0,
    };
    SOURCES.concat([{key:"none"}]).forEach(s=>{ r.sources[s.key]=Object.fromEntries(GENDERS.map(g=>[g.key,0])); });
    AGE_BANDS.forEach(a=>{ r.ages[a.key]=Object.fromEntries(GENDERS.map(g=>[g.key,0])); });
    const staff=new Set();

    visits.forEach(v=>{
      const sum={total:0,ins:0,tech:0,goods:0,goodsByKind:{},ju:0,acu:0};
      v.payments.forEach(p=>{
        const sp=insuranceSplit(p); sum.ju+=sp.ju; sum.acu+=sp.acu;
        const a=splitAmounts(p);
        sum.total+=a.total; sum.ins+=a.ins; sum.tech+=a.tech; sum.goods+=a.goods;
        Object.entries(a.goodsByKind).forEach(([k,x])=>{ sum.goodsByKind[k]=(sum.goodsByKind[k]||0)+x; });
        parsePayments(p.payment_method,p.total_amount).forEach(x=>{ if(x.amount>0){ r.pay[x.kind].count++; r.pay[x.kind].amount+=x.amount; } });
      });
      staff.add(v.staffId);
      r.total.count++; r.total.amount+=sum.total;
      r.tech.count++; r.tech.amount+=sum.tech; // 来院は全員「技術」の客数（POSと同じ）
      if(sum.goods>0){ r.goods.count++; r.goods.amount+=sum.goods; }
      Object.entries(sum.goodsByKind).forEach(([k,x])=>{ r.goodsRows[k].count++; r.goodsRows[k].amount+=x; });
      // 技術の内訳：保険の窓口負担は保険の割合ごと、残り（自費の施術など）は「上記以外」
      const b=bookingById[v.bookingId]||{};
      if(sum.ins>0){ const k=rateKey(b.insurance_rate); r.techRows[k].count++; r.techRows[k].amount+=sum.ins; }
      if(sum.tech-sum.ins>0){ r.techRows.other.count++; r.techRows.other.amount+=sum.tech-sum.ins; }
      r.nonTaxable+=sum.ins; r.taxable+=sum.total-sum.ins;
      // 部門ごとの来院数・実人数・窓口負担（保険診療＋鍼灸併用は両方に数える）
      const dj=v.payments.some(p=>insuranceDepts(p).ju), da=v.payments.some(p=>insuranceDepts(p).acu);
      if(dj){ r.dept.ju.visits++; r.dept.ju.people.add(v.patient||v.key); r.dept.ju.amount+=sum.ju; }
      if(da){ r.dept.acu.visits++; r.dept.acu.people.add(v.patient||v.key); r.dept.acu.amount+=sum.acu; }
      if(sum.ju>0){ r.juIns.count++; r.juIns.amount+=sum.ju; }
      if(sum.acu>0){ r.acuIns.count++; r.acuIns.amount+=sum.acu; }
      const c=cls[v.key]||"guest"; r.visitClass[c].count++; r.visitClass[c].amount+=sum.total;
      const prof=profiles[v.patient]||{};
      const g=genderKey(prof.gender); r.gender[g].count++; r.gender[g].amount+=sum.total;
      r.ages[ageBand(prof.age)][g]++;
      if(c==="new") r.sources[sourceKey(prof.howKnow)][g]++;
    });
    // 返金は返金日の売上から引く（客数は数えない）
    // 保険分の返金は保険（非課税・その割合の行）から、それ以外は自費（課税・上記以外）から引く
    refunds.forEach(p=>{
      const a=Number(p.total_amount)||0, ins=Math.max(a,Number(p.insurance_amount)||0), rest=a-ins;
      r.total.amount+=a; r.tech.amount+=a;
      if(ins){ r.techRows[rateKey((bookingById[p.booking_id]||{}).insurance_rate)].amount+=ins; r.nonTaxable+=ins; r.juIns.amount+=ins; }
      if(rest){ r.techRows.other.amount+=rest; r.taxable+=rest; }
    });
    r.staffCount=[...staff].filter(Boolean).length;
    // 実人数と請求（見込み）
    DEPTS.forEach(d=>{ const x=r.dept[d.key]; x.peopleCount=x.people.size; x.claim=x.peopleCount*CLAIM_PER_PERSON[d.key]; delete x.people; });
    r.taxIncluded=Math.round(r.taxable*10/110);
    r.netSales=r.total.amount-r.taxIncluded;

    // レジ締め（期間の最初の日のつり銭準備金、期間の現金売上、最後に締めた日の金種）
    const closings=(o.registerClosings||[]).filter(c=>inPeriod(c.date)&&(o.storeId==null||(c.store_id||1)===o.storeId)).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    r.register=closings.length?{
      floatStart:Number(closings[0].float_start)||0,
      cashSales:closings.reduce((s,c)=>s+(Number(c.cash_sales)||0),0),
      lastDate:closings[closings.length-1].date,
      denominations:closings[closings.length-1].denominations||{},
      actual:Number(closings[closings.length-1].actual)||0,
      diff:closings.reduce((s,c)=>s+(Number(c.diff)||0),0),
      days:closings.length,
    }:null;
    return r;
  }

  const api={insuranceSplit,insuranceDepts,CLAIM_PER_PERSON,DEPTS,GOODS_KINDS,isGoods,goodsKind,PAY_KINDS,parsePayments,visitsOf,classifyVisits,VISIT_CLASSES,patientProfiles,GENDERS,genderKey,
    AGE_BANDS,ageBand,SOURCES,sourceKey,splitAmounts,rateKey,TECH_ROWS,buildReport};
  root.SalesReport=api;
})(typeof window!=="undefined"?window:globalThis);
