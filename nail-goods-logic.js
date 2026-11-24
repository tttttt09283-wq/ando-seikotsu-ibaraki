// 巻き爪 × 物販（インソール・室内サンダル）の数値管理ロジック
// 画面（nail-goods.html）から切り離した純粋な関数。テストは test/nail-goods.test.js。
// 各センターの巻き爪分析表（門真・茨木・津田・交野・枚方・枚方市駅前）の項目・指標をそのまま使う。
(function(root){
  // ===== 巻き爪分析表の指標（分析表「打込み方」シートの◎指標数値／◎理想・優良者） =====
  // higher=true は高いほど良い、false は低いほど良い
  const NAIL_KPIS=[
    {key:"secondRate",label:"2回目継続率",unit:"%",target:70,ideal:90,higher:true},
    {key:"fourRate",label:"4箇所施術率",unit:"%",target:60,ideal:80,higher:true},
    {key:"unitPrice",label:"一人平均単価",unit:"円",target:14000,ideal:16000,higher:true},
    {key:"dropRate",label:"問合せ離脱率",unit:"%",target:30,ideal:20,higher:false},
  ];

  // 分析表の入力項目（水色のセル）。agg:"avg" は合計せずに平均する項目、sum:false は合計を出さない項目
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
    {key:"avgVisits",label:"平均通院回数",agg:"avg"},
    {key:"sales",label:"売上（円）",yen:true},
    {key:"lastYearSales",label:"昨年の売上",yen:true},
    {key:"inquiry",label:"問合せ件数"},
    {key:"drop",label:"問合せ離脱"},
    {key:"cost",label:"仕入れ＋広告費",yen:true},
  ];

  // 各センターの巻き爪分析表の実績（2026年11月にいただいた分析表から読み取り）
  // 売上が「万」表記の表（門真・茨木のPDF）は、一人平均単価×総人数から円に戻した値。
  // 茨木の4月は表の単価の計算式が崩れていた（58,804円）ため、売上70.6万円をそのまま入れている。
  // 枚方市駅前：9・10月は表の総人数が0（計算式の不具合）のため、新規＋再診＋継続＋治癒で入れている（1〜8月もこの式で表と一致）。
  //   2025年の表の1・2月は2026年1・2月と同じ数字が入っていたため取り込まず、2025年は8〜11月だけ。仕入れ＋広告費は広告費5万円＋10月の仕入れ7万円。
  const SEED_CENTERS=[
    {id:"kadoma",name:"門真巻き爪センター",staff:"伊牟田",source:"R8巻き爪分析表（PDF）",nail:{
      "2026-01":{days:24,"newCount":8,"web":4,"other":4,"total":24,"four":4,"second":4,"cont":16,"cured":0,"avgVisits":1,"sales":384456,"inquiry":10,"drop":2},
      "2026-02":{days:24,"newCount":10,"web":6,"nobori":3,"other":1,"total":33,"four":0,"second":7,"cont":23,"cured":0,"avgVisits":1,"sales":466158,"inquiry":13,"drop":3},
      "2026-03":{days:27,"newCount":8,"web":6,"inStore":1,"other":1,"total":33,"four":4,"second":5,"cont":25,"cured":0,"avgVisits":1,"sales":462561,"inquiry":10,"drop":2},
      "2026-04":{days:25,"newCount":7,"web":6,"nobori":1,"total":35,"four":3,"second":4,"cont":27,"cured":1,"avgVisits":1,"sales":477400,"inquiry":9,"drop":2},
      "2026-05":{days:27,"newCount":7,"web":7,"total":35,"four":1,"second":4,"cont":27,"cured":1,"avgVisits":1,"sales":412300,"inquiry":7,"drop":2},
      "2026-06":{days:26,"newCount":7,"web":2,"nobori":1,"referral":1,"other":3,"total":35,"four":3,"second":4,"cont":27,"cured":1,"avgVisits":1,"sales":421295,"inquiry":8,"drop":1},
      "2026-07":{days:26,"newCount":9,"web":8,"referral":1,"total":38,"four":5,"second":4,"cont":29,"avgVisits":1,"sales":493886,"inquiry":9,"drop":0},
      "2026-08":{days:26,"newCount":7,"web":6,"nobori":1,"total":45,"four":2,"second":8,"cont":37,"cured":1,"avgVisits":1,"sales":534150,"lastYearSales":31000,"inquiry":7,"drop":0},
      "2026-09":{days:26,"newCount":6,"web":5,"referral":1,"total":43,"four":2,"second":6,"cont":36,"cured":1,"avgVisits":1,"sales":523482,"lastYearSales":127000,"inquiry":8,"drop":1},
      "2026-10":{days:25,"newCount":6,"web":6,"total":43,"four":0,"second":5,"cont":36,"cured":1,"avgVisits":1,"sales":510539,"lastYearSales":221000,"inquiry":7,"drop":1,"cost":91690},
    }},
    {id:"ibaraki",name:"茨木巻き爪センター",staff:"広川",source:"巻き爪分析表（PDF）",nail:{
      "2026-01":{days:18,"newCount":11,"web":10,"nobori":1,"total":53,"four":5,"second":9,"cont":41,"cured":1,"avgVisits":4.5,"sales":741417,"lastYearSales":702000,"inquiry":12,"drop":2},
      "2026-02":{days:18,"newCount":7,"web":6,"nobori":1,"total":57,"four":1,"second":5,"cont":48,"cured":2,"avgVisits":3.7,"sales":737523,"lastYearSales":541000,"inquiry":9,"drop":2},
      "2026-03":{days:15,"newCount":9,"web":6,"inStore":3,"total":67,"four":5,"second":6,"cont":53,"cured":5,"avgVisits":4.2,"sales":757904,"lastYearSales":490000,"inquiry":8,"drop":2},
      "2026-04":{days:20,"newCount":7,"web":7,"total":63,"four":3,"second":7,"cont":50,"cured":6,"avgVisits":4.2,"sales":706000,"lastYearSales":551000,"inquiry":10,"drop":4},
      "2026-05":{days:17,"newCount":11,"web":11,"total":49,"four":5,"second":9,"cont":37,"cured":1,"avgVisits":3.7,"sales":579033,"lastYearSales":412000,"inquiry":11,"drop":0},
      "2026-06":{days:22,"newCount":6,"web":6,"total":57,"four":2,"second":5,"cont":49,"cured":2,"avgVisits":4,"sales":778221,"lastYearSales":391000,"inquiry":7,"drop":1},
      "2026-07":{days:21,"newCount":7,"web":7,"total":55,"four":3,"second":5,"cont":48,"cured":0,"avgVisits":2.4,"sales":734745,"lastYearSales":363000,"inquiry":9,"drop":2},
      "2026-08":{days:20,"newCount":11,"web":10,"inStore":1,"total":63,"four":3,"second":7,"cont":49,"cured":3,"avgVisits":1.8,"sales":824481,"lastYearSales":647000,"inquiry":12,"drop":3},
      "2026-09":{days:22,"newCount":5,"web":5,"revisit":1,"total":48,"four":3,"second":3,"cont":41,"cured":1,"avgVisits":1.6,"sales":562944,"lastYearSales":607000,"inquiry":5,"drop":2},
      "2026-10":{days:21,"newCount":9,"web":9,"total":59,"four":3,"cont":47,"cured":3,"avgVisits":1.2,"sales":721629,"lastYearSales":675000,"inquiry":9,"drop":2,"cost":50000},
    }},
    {id:"tsuda",name:"津田巻き爪センター",staff:"大森",staffChanges:[{from:"2026-01",staff:"児玉"},{from:"2026-11",staff:"大森"}],source:"巻き爪分析表2026（11月に正式な売上で差し替え）",nail:{
      "2026-01":{days:19.5,"newCount":7,"web":6,"other":1,"total":34,"four":1,"second":3,"cont":25,"cured":2,"avgVisits":2.1,"sales":393250,"inquiry":8,"drop":1},
      "2026-02":{days:18,"newCount":7,"web":5,"nobori":2,"total":45,"four":0,"second":7,"cont":28,"cured":10,"avgVisits":4,"sales":305900,"inquiry":7,"drop":0},
      "2026-03":{days:18,"newCount":9,"web":8,"other":1,"total":39,"four":3,"second":8,"cont":22,"cured":8,"avgVisits":3.7,"sales":387000,"inquiry":10,"drop":1},
      "2026-04":{days:20,"newCount":5,"web":4,"other":1,"total":27,"four":4,"second":2,"cont":19,"cured":3,"avgVisits":3.2,"sales":250800,"inquiry":8,"drop":0},
      "2026-05":{days:14,"newCount":10,"web":5,"nobori":4,"other":1,"total":35,"four":6,"second":9,"cont":20,"cured":5,"avgVisits":3.7,"sales":372350,"inquiry":12,"drop":0},
      "2026-06":{days:14,"newCount":8,"web":6,"nobori":1,"referral":1,"total":33,"four":5,"second":8,"cont":19,"cured":6,"avgVisits":3.4,"sales":335500,"inquiry":10,"drop":0},
      "2026-07":{days:18,"newCount":6,"web":4,"nobori":2,"total":31,"four":3,"second":6,"cont":21,"cured":4,"avgVisits":3.3,"sales":359700,"lastYearSales":51000,"inquiry":8,"drop":0},
      "2026-08":{days:15,"newCount":9,"web":4,"nobori":3,"other":2,"total":35,"four":5,"second":8,"cont":24,"cured":2,"avgVisits":3.2,"sales":362150,"lastYearSales":225000,"inquiry":10,"drop":0},
      "2026-09":{days:20,"newCount":9,"web":9,"total":40,"four":3,"second":6,"cont":29,"cured":2,"avgVisits":1.7,"sales":508700,"lastYearSales":307250,"inquiry":10,"drop":0},
      "2026-10":{days:19,"newCount":9,"web":5,"nobori":2,"referral":1,"other":1,"total":45,"four":5,"second":1,"cont":36,"cured":0,"avgVisits":1.1,"sales":554400,"lastYearSales":358600,"inquiry":10,"drop":0,"cost":136680},
    }},
    {id:"katano",name:"交野巻き爪センター",staff:"藤原",source:"巻き爪分析表（11月に10月分まで更新）",nail:{
      "2026-01":{days:23.0,"newCount":2,"nobori":2,"total":18,"four":2,"second":2.0,"cont":16,"avgVisits":3.0,"sales":305050,"inquiry":2,"drop":0},
      "2026-02":{days:24.0,"newCount":1,"nobori":1,"total":13,"four":1,"second":0.0,"cont":12,"avgVisits":1.0,"sales":263450,"inquiry":1,"drop":0},
      "2026-03":{days:25.0,"newCount":2,"web":1,"nobori":1,"total":19,"four":1,"second":1.0,"cont":17,"avgVisits":1.0,"sales":294800,"inquiry":2,"drop":0},
      "2026-04":{days:26.0,"newCount":4,"web":2,"nobori":2,"total":18,"four":3,"second":4.0,"cont":14,"avgVisits":1.0,"sales":294800,"inquiry":4,"drop":0},
      "2026-05":{days:26.0,"newCount":3,"web":1,"nobori":1,"inStore":1,"total":20,"four":3,"second":3.0,"cont":17,"avgVisits":1.0,"sales":330250,"inquiry":3,"drop":0},
      "2026-06":{days:25.0,"newCount":2,"web":1,"referral":1,"total":21,"four":1,"second":2.0,"cont":19,"avgVisits":1.0,"sales":363600,"inquiry":2,"drop":0},
      "2026-07":{days:25.0,"newCount":3,"web":2,"nobori":1,"total":23,"four":3,"second":3.0,"cont":20,"avgVisits":1.0,"sales":395550,"inquiry":3,"drop":0},
      "2026-08":{days:26.0,"newCount":4,"web":1,"nobori":2,"other":1,"total":34,"four":4,"second":4.0,"cont":30,"avgVisits":1.0,"sales":560350,"inquiry":4,"drop":0},
      "2026-09":{days:24.0,"newCount":3,"web":1,"nobori":2,"total":39,"four":2,"second":3.0,"cont":36,"avgVisits":1.0,"sales":593500,"inquiry":3,"drop":0,"cost":50000},
      "2026-10":{days:27.0,"newCount":4,"web":2,"nobori":1,"referral":1,"total":31,"four":3,"second":4.0,"cont":27,"avgVisits":1.0,"sales":419850,"inquiry":1,"drop":0,"cost":138000},
    }},
    {id:"hirakata",name:"枚方巻き爪センター",staff:"木村",source:"巻き爪分析表2025・2026.xlsx",nail:{
      "2025-01":{days:19,"newCount":6,"web":5,"inStore":1,"revisit":4,"total":44,"four":1,"second":6,"cont":29,"cured":5,"avgVisits":5.3,"sales":483850,"lastYearSales":365000,"inquiry":7,"drop":3},
      "2025-02":{days:19,"newCount":6,"web":5,"other":1,"revisit":1,"total":31,"four":1,"second":6,"cont":24,"cured":0,"avgVisits":3.8,"sales":398510,"lastYearSales":238000,"inquiry":7,"drop":1},
      "2025-03":{days:19,"newCount":5,"web":5,"total":32,"four":2,"second":5,"cont":25,"cured":2,"avgVisits":4.4,"sales":426450,"lastYearSales":347000,"inquiry":6,"drop":1},
      "2025-04":{days:20,"newCount":11,"web":9,"inStore":2,"revisit":2,"total":41,"four":2,"second":10,"cont":25,"cured":3,"avgVisits":4.3,"sales":472250,"lastYearSales":395000,"inquiry":12,"drop":1},
      "2025-05":{days:16,"newCount":12,"web":12,"revisit":2,"total":45,"four":3,"second":9,"cont":30,"cured":1,"avgVisits":3.6,"sales":472450,"lastYearSales":344000,"inquiry":13,"drop":1},
      "2025-06":{days:19,"newCount":7,"web":6,"inStore":1,"revisit":3,"total":53,"four":0,"second":6,"cont":41,"cured":2,"avgVisits":3.9,"sales":556850,"lastYearSales":328000,"inquiry":9,"drop":2},
      "2025-07":{days:20,"newCount":7,"web":7,"total":46,"four":2,"second":6,"cont":30,"cured":9,"avgVisits":4.1,"sales":440600,"lastYearSales":440600,"inquiry":9,"drop":2},
      "2025-08":{days:19,"newCount":7,"web":7,"revisit":2,"total":50,"four":1,"second":5,"cont":39,"cured":2,"avgVisits":3,"sales":486350,"lastYearSales":311000,"inquiry":9,"drop":2},
      "2025-09":{days:19,"newCount":10,"web":10,"revisit":3,"total":33,"four":5,"second":9,"cont":33,"cured":0,"avgVisits":3,"sales":513000,"lastYearSales":330000,"inquiry":14,"drop":4},
      "2025-10":{days:20,"newCount":4,"web":4,"revisit":2,"total":38,"four":2,"second":2.8,"cont":30,"cured":2,"avgVisits":2.8,"sales":436910,"lastYearSales":377000,"inquiry":7,"drop":3},
      "2025-11":{days:18,"newCount":5,"web":5,"revisit":1,"total":41,"four":3,"second":5,"cont":30,"cured":5,"avgVisits":2,"sales":460000,"lastYearSales":369000,"inquiry":7,"drop":2},
      "2025-12":{days:18,"newCount":7,"web":6,"nobori":1,"revisit":5,"total":52,"four":5,"cont":37,"cured":3,"avgVisits":1,"sales":624450,"lastYearSales":365000,"inquiry":7,"drop":0},
      "2026-01":{days:16,"newCount":1,"web":1,"revisit":2,"total":34,"four":0,"second":0,"cont":30,"cured":1,"avgVisits":4,"sales":624450,"lastYearSales":484000,"inquiry":2,"drop":1},
      "2026-02":{days:18,"newCount":4,"web":4,"revisit":4,"total":31,"four":2,"second":4,"cont":20,"cured":3,"avgVisits":4.3,"sales":371440,"lastYearSales":399000,"inquiry":5,"drop":1},
      "2026-03":{days:20,"newCount":6,"web":6,"revisit":2,"total":45,"four":4,"second":6,"cont":35,"cured":2,"avgVisits":3.3,"sales":557000,"lastYearSales":426000,"inquiry":6,"drop":0},
      "2026-04":{days:20,"newCount":5,"web":4,"inStore":1,"revisit":2,"total":39,"four":0,"second":1,"cont":32,"cured":0,"avgVisits":2,"sales":446050,"lastYearSales":472000,"inquiry":4,"drop":0},
      "2026-05":{days:21,"newCount":7,"web":6,"inStore":1,"revisit":1,"total":45,"four":1,"second":5,"cont":36,"cured":1,"avgVisits":1.7,"sales":624450,"lastYearSales":472000,"inquiry":10,"drop":3},
      "2026-06":{days:20.5,"newCount":6,"web":5,"other":1,"revisit":2,"total":46,"four":4,"second":1.7,"cont":37,"cured":1,"avgVisits":1,"sales":547850,"lastYearSales":555700,"inquiry":7,"drop":1},
      "2026-07":{days:20,"newCount":7,"web":6,"inStore":1,"total":44,"four":3,"second":6,"cont":36,"cured":1,"avgVisits":1.9,"sales":533000,"lastYearSales":441000,"inquiry":9,"drop":2},
      "2026-08":{days:19,"newCount":4,"web":2,"inStore":2,"revisit":2,"total":41,"four":3,"second":4,"cont":35,"cured":0,"avgVisits":2.5,"sales":546150,"lastYearSales":486000,"inquiry":4,"drop":2},
      "2026-09":{days:18,"newCount":7,"web":6,"inStore":1,"total":48,"four":3,"second":3,"cont":41,"cured":0,"avgVisits":1.5,"sales":696180,"lastYearSales":513000,"inquiry":7,"drop":1,"cost":158510},
      "2026-10":{days:18,"newCount":7,"web":5,"nobori":1,"inStore":1,"revisit":1,"total":45,"four":1,"cont":36,"cured":1,"avgVisits":1,"sales":585300,"lastYearSales":437000,"inquiry":8,"drop":1},
    }},
    {id:"hirakata_ekimae",name:"枚方市駅前巻き爪センター",staff:"原田",source:"最新巻き爪分析表（スプレッドシート）",nail:{
      "2025-08":{days:26,"newCount":2,"nobori":1,"inStore":1,"revisit":0,"total":2,"four":0,"second":2,"cont":0,"cured":0,"avgVisits":6,"sales":20900,"inquiry":2,"drop":0},
      "2025-09":{days:26,"newCount":3,"web":1,"inStore":2,"revisit":0,"total":5,"four":2,"second":2,"cont":2,"cured":0,"avgVisits":2.3,"sales":67650,"inquiry":4,"drop":1},
      "2025-10":{days:26,"newCount":0,"revisit":0,"total":4,"four":0,"second":0,"cont":4,"cured":0,"sales":17600,"inquiry":0,"drop":0},
      "2025-11":{days:26,"newCount":1,"web":1,"revisit":0,"total":5,"four":0,"second":1,"cont":4,"cured":0,"avgVisits":3,"sales":43450,"inquiry":1,"drop":0},
      "2026-01":{days:24,"newCount":5,"web":3,"inStore":2,"revisit":0,"total":10,"four":3,"second":5,"cont":5,"cured":0,"avgVisits":3.8,"sales":111650,"inquiry":8,"drop":3,"cost":50000},
      "2026-02":{days:24,"newCount":2,"web":1,"nobori":1,"revisit":0,"total":4,"four":1,"second":2,"cont":2,"cured":0,"avgVisits":4,"sales":57200,"inquiry":4,"drop":2,"cost":50000},
      "2026-03":{days:27,"newCount":1,"web":1,"revisit":0,"total":11,"four":1,"second":1,"cont":10,"cured":0,"avgVisits":7,"sales":158400,"inquiry":2,"drop":1,"cost":50000},
      "2026-04":{days:25,"newCount":3,"web":2,"inStore":1,"revisit":0,"total":10,"four":1,"second":3,"cont":7,"cured":0,"avgVisits":5.3,"sales":86350,"inquiry":3,"drop":0,"cost":50000},
      "2026-05":{days:26,"newCount":1,"referral":1,"revisit":0,"total":9,"four":0,"second":1,"cont":7,"cured":1,"avgVisits":5,"sales":103401,"inquiry":2,"drop":1,"cost":50000},
      "2026-06":{days:26,"newCount":5,"web":2,"inStore":1,"other":2,"revisit":0,"total":14,"four":2,"second":3,"cont":8,"cured":1,"avgVisits":2.8,"sales":151844,"inquiry":6,"drop":1,"cost":50000},
      "2026-07":{days:26,"newCount":0,"revisit":0,"total":8,"four":1,"second":0,"cont":7,"cured":1,"sales":71904,"inquiry":1,"drop":1,"cost":50000},
      "2026-08":{days:27,"newCount":2,"web":1,"inStore":1,"revisit":0,"total":13,"four":0,"second":0,"cont":10,"cured":1,"avgVisits":5,"sales":121953,"lastYearSales":20900,"inquiry":2,"drop":0,"cost":50000},
      "2026-09":{days:26,"newCount":4,"web":2,"nobori":1,"inStore":1,"revisit":0,"total":9,"four":2,"second":2,"cont":5,"cured":0,"avgVisits":2.1,"sales":116000,"lastYearSales":67650,"inquiry":4,"drop":0,"cost":50000},
      "2026-10":{days:26,"newCount":1,"inStore":1,"revisit":0,"total":10,"four":0,"cont":9,"cured":0,"avgVisits":1,"sales":126000,"lastYearSales":17600,"inquiry":2,"drop":1,"cost":120000},
    }},
  ];
  // 以前の版との互換（門真の実績）
  const SEED_NAIL_2026=SEED_CENTERS[0].nail;

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
      yoy:num(r.lastYearSales)>0&&has(r.sales)?num(r.sales)/num(r.lastYearSales)*100:null, // 昨対比
      costPerNew:num(r.cost)>0?ratio(r.cost,r.newCount):null,  // 新規1人あたりの仕入れ＋広告費
      salesPerCost:num(r.cost)>0?ratio(r.sales,r.cost):null,   // 売上÷（仕入れ＋広告費）
    };
  }

  // 指標の判定：ideal（優良）／ok（指標クリア）／ng（未達）／null（データなし）
  function judgeKpi(key,value){
    const k=NAIL_KPIS.find(x=>x.key===key);
    if(!k||value===null||value===undefined||!isFinite(value)) return null;
    if(k.higher) return value>=k.ideal?"ideal":value>=k.target?"ok":"ng";
    return value<=k.ideal?"ideal":value<=k.target?"ok":"ng";
  }

  const isRow=r=>r&&has(r.total)&&num(r.total)>0;
  // 入力のある月だけで合計・平均（分析表の「合計」「平均」行と同じ考え方）。year を渡すとその年だけ
  function nailSummary(months,year){
    const keys=Object.keys(months||{}).filter(k=>(!year||k.startsWith(year+"-"))&&isRow(months[k])).sort();
    const sum={},avg={};
    const n=keys.length;
    NAIL_FIELDS.forEach(f=>{
      const vals=keys.map(k=>months[k][f.key]).filter(has).map(Number);
      sum[f.key]=f.agg==="avg"?null:vals.reduce((s,v)=>s+v,0);
      avg[f.key]=f.agg==="avg"?(vals.length?vals.reduce((s,v)=>s+v,0)/vals.length:null):(n?sum[f.key]/n:null);
    });
    const metrics=nailMonthMetrics(sum);
    // 昨対比・費用対効果は、その数字が入っている月どうしで比べる
    const lyKeys=keys.filter(k=>num(months[k].lastYearSales)>0&&has(months[k].sales));
    const lySales=lyKeys.reduce((s,k)=>s+num(months[k].sales),0),ly=lyKeys.reduce((s,k)=>s+num(months[k].lastYearSales),0);
    metrics.yoy=ly>0?lySales/ly*100:null;
    const cKeys=keys.filter(k=>num(months[k].cost)>0);
    const cost=cKeys.reduce((s,k)=>s+num(months[k].cost),0);
    metrics.costPerNew=cost>0?ratio(cost,cKeys.reduce((s,k)=>s+num(months[k].newCount),0)):null;
    metrics.salesPerCost=cost>0?ratio(cKeys.reduce((s,k)=>s+num(months[k].sales),0),cost):null;
    metrics.avgVisits=avg.avgVisits;
    const last=n?months[keys[n-1]]:null;
    return {months:keys,count:n,sum,avg,metrics,last,lastKey:n?keys[n-1]:null};
  }

  // 複数センターの分析表を月ごとに足し合わせる（平均通院回数は入っているセンターの平均）
  function combineCenters(centers){
    const out={};
    (centers||[]).forEach(c=>{
      Object.entries(c.nail||{}).forEach(([ym,r])=>{
        if(!isRow(r)) return;
        const o=out[ym]=out[ym]||{_avgN:0};
        NAIL_FIELDS.forEach(f=>{
          if(!has(r[f.key])) return;
          if(f.agg==="avg"){ o[f.key]=(num(o[f.key])*o._avgN+num(r[f.key]))/(o._avgN+1); }
          else o[f.key]=num(o[f.key])+num(r[f.key]);
        });
        if(has(r.avgVisits)) o._avgN++;
      });
    });
    Object.values(out).forEach(o=>{delete o._avgN;});
    return out;
  }

  // ===== 分析表の差し替え（保存済みのデータにも1回だけ反映する） =====
  // 津田：担当者が大森さんから変わる時期で、10月の売上などが正式な数字になっていなかった（5日分・148,500円）。
  //   正式な分析表（10月は19日・554,400円。ほかの月の2回目継続・平均通院回数も修正あり）で2026年1〜10月を差し替える。
  const SEED_PATCHES=[
    {id:"tsuda-2026-official",center:"tsuda",months:["2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07","2026-08","2026-09","2026-10"]},
    // 交野：10月分（売上419,850円・新規4人）を入力済みの分析表で更新。9月の2回目継続（2→3）と広告費（9月5万・10月13.8万）も反映。
    //   11月は途中（新規4人だけで売上が未入力）のため取り込まない。
    // 津田：2026年11月から担当を大森さんに（10月までは児玉さん）
    {id:"tsuda-staff-2026-11",center:"tsuda",months:[],staff:true},
    {id:"katano-2026-11",center:"katano",months:["2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07","2026-08","2026-09","2026-10"]},
  ];
  // まだ反映していない差し替えを centers に反映し、反映済みの id の一覧を返す
  function applySeedPatches(centers,applied){
    const done=Array.isArray(applied)?applied.slice():[];
    SEED_PATCHES.forEach(pt=>{
      if(done.includes(pt.id)) return;
      const seed=SEED_CENTERS.find(c=>c.id===pt.center);
      const c=(centers||[]).find(x=>x.id===pt.center);
      if(seed&&c){
        c.nail=c.nail||{};
        pt.months.forEach(ym=>{ if(seed.nail[ym]) c.nail[ym]=JSON.parse(JSON.stringify(seed.nail[ym])); });
        if(seed.source&&pt.months.length) c.source=seed.source;
        if(pt.staff){ c.staff=seed.staff; c.staffChanges=JSON.parse(JSON.stringify(seed.staffChanges||[])); }
      }
      done.push(pt.id);
    });
    return done;
  }

  // ===== 担当者の交代 =====
  // center.staffChanges：[{from:"YYYY-MM", staff:"名前"}]。その月から担当がその人になる。無ければ center.staff
  function sortedChanges(center){
    return (center&&Array.isArray(center.staffChanges)?center.staffChanges:[]).filter(x=>x&&/^\d{4}-\d{2}$/.test(x.from||"")&&x.staff).slice().sort((a,b)=>a.from.localeCompare(b.from));
  }
  // その月の担当者（交代の記録より前の月は、いちばん古い記録の担当者）
  function staffAt(center,ym){
    const ch=sortedChanges(center);
    if(!ch.length) return (center&&center.staff)||"";
    let cur=ch[0].staff;
    ch.forEach(x=>{ if(x.from<=ym) cur=x.staff; });
    return cur;
  }
  // 表示用：「児玉→大森（26年11月〜）」のように交代が分かる名前
  function staffLabel(center){
    const ch=sortedChanges(center);
    if(ch.length<2) return (center&&center.staff)||(ch[0]&&ch[0].staff)||"";
    const last=ch[ch.length-1];
    return `${ch[ch.length-2].staff}→${last.staff}（${last.from.slice(2,4)}年${Number(last.from.slice(5))}月〜）`;
  }

  // 以前の保存データ（門真だけの nail）を、センター別の形にする。分析表から読み取った月はその数字で上書きし、手で入れた別の月は残す
  function migrateCenters(saved){
    const seeds=JSON.parse(JSON.stringify(SEED_CENTERS));
    const list=Array.isArray(saved&&saved.centers)?saved.centers:null;
    if(list){
      // 新しく増えたセンターだけ足す（保存済みのセンターはそのまま）
      seeds.forEach(sc=>{ if(!list.some(c=>c.id===sc.id)) list.push(sc); });
      return list;
    }
    if(saved&&saved.nail){
      const kad=seeds.find(c=>c.id==="kadoma");
      Object.entries(saved.nail).forEach(([ym,r])=>{ if(!kad.nail[ym]) kad.nail[ym]=r; });
      if(saved.center) kad.name=saved.center;
    }
    return seeds;
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
  // training=true のときはトレーニングモード（練習）の会計だけ、false のときは本番の会計だけを数える
  function aggregatePayments(payments,products=DEFAULT_PRODUCTS,training=false){
    const out={makiNew:0,makiCont:0,makiSales:0,goods:{},goodsSales:0,goodsUnits:0,buyers:0};
    products.forEach(p=>{out.goods[p.id]={units:0,sales:0};});
    const buyers=new Set();
    (payments||[]).forEach(pay=>{
      if(!pay||pay.is_refund) return;
      if(!!pay.is_training!==!!training) return;
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

  const api={NAIL_KPIS,NAIL_FIELDS,SEED_NAIL_2026,SEED_CENTERS,SEED_PATCHES,applySeedPatches,staffAt,staffLabel,sortedChanges,combineCenters,migrateCenters,DEFAULT_PRODUCTS,DEFAULT_SEGMENTS,SCENARIOS,GOODS_LABEL_PREFIX,
    goodsLabel,nailMonthMetrics,judgeKpi,nailSummary,segmentsFromNail,forecast,requiredForTarget,
    aggregatePayments,aggregateProposals,stockLeft};
  root.NailGoods=api;
})(typeof window!=="undefined"?window:globalThis);
