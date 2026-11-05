// 巻き爪 × 物販（インソール・室内サンダル）の数値管理ロジック
// 画面（nail-goods.html）から切り離した純粋な関数。テストは test/nail-goods.test.js。
// 巻き爪分析表（R8巻き爪分析表最新.xlsx）の項目・指標をそのまま使う。
(function(root){
  // ===== 巻き爪分析表の指標（分析表「打込み方」シートの◎指標数値／◎理想・優良者） =====
  // higher=true は高いほど良い、false は低いほど良い
  const NAIL_KPIS=[
    {key:"secondRate",label:"2回目継続率",unit:"%",target:70,ideal:90,higher:true},
    {key:"fourRate",label:"4箇所施術率",unit:"%",target:60,ideal:80,higher:true},
    {key:"unitPrice",label:"一人平均単価",unit:"円",target:14000,ideal:16000,higher:true},
    {key:"dropRate",label:"問合せ離脱率",unit:"%",target:30,ideal:20,higher:false},
  ];

  // 分析表の入力項目（水色のセル）
  const NAIL_FIELDS=[
    {key:"days",label:"営業日数"},
    {key:"newCount",label:"新規数"},
    {key:"web",label:"Web"},{key:"nobori",label:"のぼり"},{key:"referral",label:"紹介"},
    {key:"inStore",label:"店舗内"},{key:"other",label:"その他"},
    {key:"revisit",label:"再診数"},
    {key:"total",label:"総人数"},
    {key:"four",label:"4箇所以上"},
    {key:"second",label:"2回目継続"},
    {key:"cont",label:"継続数"},
    {key:"cured",label:"治癒数"},
    {key:"sales",label:"売上（円）"},
    {key:"inquiry",label:"問合せ件数"},
    {key:"drop",label:"問合せ離脱"},
  ];

  // 2026年 門真巻き爪センター（施術者 伊牟田）の分析表の実績（1〜7月）。売上は「万」表記のため一人平均単価×総人数から円に戻した値。
  const SEED_NAIL_2026={
    "2026-01":{days:24,newCount:8,web:4,other:4,total:24,four:4,second:4,cont:16,cured:0,sales:384456,inquiry:10,drop:2},
    "2026-02":{days:24,newCount:10,web:6,nobori:3,other:1,total:33,four:0,second:7,cont:23,cured:0,sales:466158,inquiry:13,drop:3},
    "2026-03":{days:27,newCount:8,web:6,inStore:1,other:1,total:33,four:4,second:5,cont:25,cured:0,sales:462561,inquiry:10,drop:8},
    "2026-04":{days:25,newCount:7,web:6,nobori:1,total:35,four:3,second:4,cont:27,cured:1,sales:477400,inquiry:9,drop:2},
    "2026-05":{days:27,newCount:7,web:7,total:35,four:1,second:4,cont:27,cured:1,sales:412300,inquiry:7,drop:2},
    "2026-06":{days:26,newCount:7,web:2,nobori:1,referral:1,other:3,total:35,four:3,second:4,cont:27,cured:1,sales:421295,inquiry:8,drop:7},
    "2026-07":{days:26,newCount:9,web:8,referral:1,total:38,four:5,second:4,cont:29,sales:493886,inquiry:9,drop:0},
  };

  const num=v=>{const n=Number(v);return isFinite(n)?n:0;};
  const has=v=>v!==undefined&&v!==null&&v!==""&&isFinite(Number(v));
  const ratio=(a,b)=>num(b)>0?num(a)/num(b):null;
  const pct=(a,b)=>{const r=ratio(a,b);return r===null?null:r*100;};

  // 1か月分の分析表から、分析表と同じ計算式で指標を出す
  function nailMonthMetrics(row){
    const r=row||{};
    return {
      dailyAve:ratio(r.total,r.days),                 // 一日AVE＝総人数÷営業日数
      secondRate:pct(r.second,r.newCount),            // 2回目継続率＝2回目継続÷新規数
      fourRate:pct(r.four,r.newCount),                // 4箇所施術率＝4箇所以上÷新規数
      unitPrice:ratio(r.sales,r.total),               // 一人平均単価＝売上÷総人数
      dropRate:pct(r.drop,r.inquiry),                 // 離脱率＝問合せ離脱÷問合せ件数
      bookRate:has(r.inquiry)&&num(r.inquiry)>0?(1-num(r.drop)/num(r.inquiry))*100:null, // 問合せ→予約
    };
  }

  // 指標の判定：ideal（優良）／ok（指標クリア）／ng（未達）／null（データなし）
  function judgeKpi(key,value){
    const k=NAIL_KPIS.find(x=>x.key===key);
    if(!k||value===null||value===undefined||!isFinite(value)) return null;
    if(k.higher) return value>=k.ideal?"ideal":value>=k.target?"ok":"ng";
    return value<=k.ideal?"ideal":value<=k.target?"ok":"ng";
  }

  // 入力のある月だけで合計・平均（分析表の「合計」「平均」行と同じ考え方）
  function nailSummary(months){
    const keys=Object.keys(months||{}).filter(k=>months[k]&&has(months[k].total)&&num(months[k].total)>0).sort();
    const sum={};
    NAIL_FIELDS.forEach(f=>{sum[f.key]=keys.reduce((s,k)=>s+num(months[k][f.key]),0);});
    const n=keys.length;
    const avg={};
    NAIL_FIELDS.forEach(f=>{avg[f.key]=n?sum[f.key]/n:null;});
    const last=n?months[keys[n-1]]:null;
    return {months:keys,count:n,sum,avg,metrics:nailMonthMetrics(sum),last,lastKey:n?keys[n-1]:null};
  }

  // ===== 物販の商品（初期値は仮。設定タブで売価・原価を変更する） =====
  // cycle：買い替えの目安（か月）。repeat：買い替え時期に再購入する割合（%）
  const DEFAULT_PRODUCTS=[
    {id:"insole",name:"インソール",price:5500,cost:2200,cycle:6,repeat:30,lot:20},
    {id:"sandal",name:"室内サンダル",price:4400,cost:1800,cycle:12,repeat:20,lot:20},
  ];
  // POS の自費項目ラベル。先頭が「物販：」で始まるものを物販として集計する（名前を変えないこと）
  const GOODS_LABEL_PREFIX="物販：";
  const goodsLabel=p=>GOODS_LABEL_PREFIX+p.name;

  // ===== 見込みの前提（対象者のまとまり） =====
  // perMonth：毎月その人数が来る。once：立ち上げ月に一度だけ提案する人数（いま通院中の方など）
  // propose：提案率（%）。conv：商品ごとの購入率（%）
  const DEFAULT_SEGMENTS=[
    {id:"nail_new",name:"巻き爪 新規",perMonth:8,once:0,propose:90,conv:{insole:35,sandal:25}},
    {id:"nail_cont",name:"巻き爪 継続中（立ち上げ時に1回提案）",perMonth:0,once:29,propose:80,conv:{insole:30,sandal:20}},
    {id:"nail_second",name:"巻き爪 2回目来院（初回見送りの再提案）",perMonth:4,once:0,propose:50,conv:{insole:15,sandal:10}},
    {id:"general",name:"整骨院の患者（足・ひざ・腰の悩み）",perMonth:0,once:0,propose:30,conv:{insole:10,sandal:5}},
  ];
  const SCENARIOS=[
    {id:"low",label:"慎重",factor:0.6},
    {id:"base",label:"標準",factor:1},
    {id:"high",label:"強気",factor:1.4},
  ];

  // 分析表の実績から、見込みの対象人数を出す（新規は月平均、継続中は直近の継続数、2回目来院は月平均）
  function segmentsFromNail(summary,segments){
    const s=(segments||DEFAULT_SEGMENTS).map(x=>({...x,conv:{...x.conv}}));
    if(!summary||!summary.count) return s;
    const set=(id,k,v)=>{const g=s.find(x=>x.id===id);if(g&&v!==null&&isFinite(v)) g[k]=Math.round(v*10)/10;};
    set("nail_new","perMonth",summary.avg.newCount);
    set("nail_cont","once",summary.last?num(summary.last.cont):null);
    set("nail_second","perMonth",summary.avg.second);
    return s;
  }

  // 12か月（months）の販売見込み。factor で購入率を一律に増減（シナリオ）
  function forecast({products=DEFAULT_PRODUCTS,segments=DEFAULT_SEGMENTS,months=12,factor=1}={}){
    const rows=[];
    const firstBuys={}; // 商品ごとの月別の新規購入数（買い替えの計算に使う）
    products.forEach(p=>{firstBuys[p.id]=[];});
    const cum={sales:0,gross:0,units:{}};
    products.forEach(p=>{cum.units[p.id]=0;});
    for(let m=0;m<months;m++){
      const row={month:m+1,units:{},repeatUnits:{},sales:0,cost:0,gross:0,proposals:0};
      segments.forEach(g=>{
        const people=num(g.perMonth)+(m===0?num(g.once):0);
        row.proposals+=people*num(g.propose)/100;
      });
      products.forEach(p=>{
        let first=0;
        segments.forEach(g=>{
          const people=num(g.perMonth)+(m===0?num(g.once):0);
          const conv=Math.min(100,num((g.conv||{})[p.id])*factor);
          first+=people*num(g.propose)/100*conv/100;
        });
        firstBuys[p.id].push(first);
        // 買い替え：cycle か月前（とその倍数）に買った方のうち repeat% が再購入
        let rep=0;
        const cyc=Math.max(1,Math.round(num(p.cycle)));
        if(num(p.cycle)>0){
          for(let k=m-cyc;k>=0;k-=cyc) rep+=firstBuys[p.id][k]*Math.pow(num(p.repeat)/100,(m-k)/cyc);
        }
        const units=first+rep;
        row.units[p.id]=units;
        row.repeatUnits[p.id]=rep;
        row.sales+=units*num(p.price);
        row.cost+=units*num(p.cost);
        cum.units[p.id]+=units;
      });
      row.gross=row.sales-row.cost;
      cum.sales+=row.sales; cum.gross+=row.gross;
      row.cumSales=cum.sales; row.cumGross=cum.gross;
      row.cumUnits={...cum.units};
      rows.push(row);
    }
    const total={sales:cum.sales,gross:cum.gross,cost:cum.sales-cum.gross,units:{...cum.units}};
    // 初回仕入れ（lot × 原価）を粗利で回収できる月
    const initialCost=products.reduce((s,p)=>s+num(p.lot)*num(p.cost),0);
    const payback=rows.find(r=>r.cumGross>=initialCost);
    // 初回仕入れ分が売り切れる月（追加発注の目安）
    const stockOut={};
    products.forEach(p=>{
      const r=rows.find(x=>x.cumUnits[p.id]>=num(p.lot));
      stockOut[p.id]=num(p.lot)>0&&r?r.month:null;
    });
    return {rows,total,initialCost,paybackMonth:payback?payback.month:null,stockOut,
      monthlyAvg:{sales:months?cum.sales/months:0,gross:months?cum.gross/months:0}};
  }

  // 目標の物販売上（月）から逆算：必要な販売数・提案数・対象患者数
  function requiredForTarget({targetSales,products=DEFAULT_PRODUCTS,segments=DEFAULT_SEGMENTS}){
    // 毎月来る対象者（立ち上げの1回分は除く）で見た、1人あたりの平均購入額
    let people=0,proposals=0,buyValue=0,units=0;
    segments.forEach(g=>{
      const n=num(g.perMonth);
      people+=n;
      const prop=n*num(g.propose)/100;
      proposals+=prop;
      products.forEach(p=>{
        const u=prop*num((g.conv||{})[p.id])/100;
        units+=u; buyValue+=u*num(p.price);
      });
    });
    if(!(targetSales>0)||buyValue<=0) return null;
    const scale=targetSales/buyValue; // 今の前提の何倍の人数が必要か
    return {
      scale,
      people:people*scale,
      proposals:proposals*scale,
      units:units*scale,
      perPersonValue:people>0?buyValue/people:0,
      perProposalValue:proposals>0?buyValue/proposals:0,
      currentSales:buyValue,
    };
  }

  // ===== 実績の集計 =====
  // POS の会計（payments）から、月の巻き爪件数・売上と物販の販売数・売上を出す
  function aggregatePayments(payments,products=DEFAULT_PRODUCTS){
    const out={makiNew:0,makiCont:0,makiSales:0,goods:{},goodsSales:0,goodsUnits:0,buyers:0};
    products.forEach(p=>{out.goods[p.id]={units:0,sales:0};});
    const buyers=new Set();
    (payments||[]).forEach(pay=>{
      if(!pay||pay.is_refund) return;
      (Array.isArray(pay.jifee_items)?pay.jifee_items:[]).forEach(it=>{
        const label=String((it&&it.label)||"");
        const amt=parseInt(it&&it.amount)||0;
        if(label.startsWith("巻き爪")){
          if(label.includes("継続")) out.makiCont++; else out.makiNew++;
          out.makiSales+=amt;
        }else if(label.startsWith(GOODS_LABEL_PREFIX)){
          const name=label.slice(GOODS_LABEL_PREFIX.length);
          const p=products.find(x=>name===x.name||name.startsWith(x.name));
          const qty=Math.max(1,parseInt(it&&it.qty)||1);
          out.goodsUnits+=qty; out.goodsSales+=amt;
          if(p){ out.goods[p.id].units+=qty; out.goods[p.id].sales+=amt; }
          buyers.add(pay.booking_id||pay.id||pay.patient_name);
        }
      });
    });
    out.buyers=buyers.size;
    return out;
  }

  // 提案記録（誰に・何を提案して・買ったか）を月ごと・商品ごと・対象ごとに集計
  // log: {date:"YYYY-MM-DD", segment, product, result:"購入"|"見送り"|"検討中", qty, reason}
  function aggregateProposals(logs,ym){
    const list=(logs||[]).filter(l=>l&&String(l.date||"").startsWith(ym||""));
    const by=(keyFn)=>{
      const o={};
      list.forEach(l=>{
        const k=keyFn(l)||"未設定";
        const g=o[k]=o[k]||{proposals:0,bought:0,pending:0,units:0};
        g.proposals++;
        if(l.result==="購入"){ g.bought++; g.units+=Math.max(1,parseInt(l.qty)||1); }
        if(l.result==="検討中") g.pending++;
      });
      Object.values(o).forEach(g=>{g.rate=g.proposals?g.bought/g.proposals*100:null;});
      return o;
    };
    const all=by(()=> "all").all||{proposals:0,bought:0,pending:0,units:0,rate:null};
    const reasons={};
    list.filter(l=>l.result==="見送り"&&l.reason).forEach(l=>{reasons[l.reason]=(reasons[l.reason]||0)+1;});
    return {all,byProduct:by(l=>l.product),bySegment:by(l=>l.segment),reasons};
  }

  // 在庫：仕入れ合計 − 販売数（POS＋手入力）
  function stockLeft(product,purchases,soldUnits){
    const bought=(purchases||[]).filter(x=>x.product===product.id).reduce((s,x)=>s+num(x.qty),0);
    return bought-num(soldUnits);
  }

  const api={NAIL_KPIS,NAIL_FIELDS,SEED_NAIL_2026,DEFAULT_PRODUCTS,DEFAULT_SEGMENTS,SCENARIOS,GOODS_LABEL_PREFIX,
    goodsLabel,nailMonthMetrics,judgeKpi,nailSummary,segmentsFromNail,forecast,requiredForTarget,
    aggregatePayments,aggregateProposals,stockLeft};
  root.NailGoods=api;
})(typeof window!=="undefined"?window:globalThis);
