// 個人サマリー（スタッフ別の売上・客数・客単価）と、個人マンダラ・目標（KGI／KPI／KDI）の計算ロジック
// 画面（index.html の StaffSummaryPanel・StaffMandalaPanel）から切り離した純粋な関数。テストは test/staff-goals.test.js。
(function(root){
  // ===== 技術・商品の分け方 =====
  // 商品＝会計の自費項目のうち「物販：」で始まるもの（巻き爪 物販プランと同じ書き方）と、名前に物販らしい言葉を含むもの。
  // それ以外（保険・自費の施術・回数券・フリーパス・カルテ管理料など）は技術。
  const GOODS_PREFIX="物販：";
  const GOODS_WORDS=["物販","商品","インソール","サンダル","サポーター","サプリ","テーピング販売"];
  function isGoodsLabel(label){
    const s=String(label||"");
    return s.startsWith(GOODS_PREFIX)||GOODS_WORDS.some(w=>s.includes(w));
  }

  // 会計1件を、担当スタッフごとの 技術・商品 の金額に分ける。
  // 保険分＝insurance_staff_id、自費の各項目＝項目の staff_id。指定が無いもの・項目の合計とのずれは会計の担当へ。
  // 返金（is_refund のマイナス行）は全額を元の担当の技術から引く。
  function splitPayment(p){
    const def=p.staff_id||0;
    const total=Number(p.total_amount)||0;
    const m={};
    const row=sid=>(m[sid]=m[sid]||{staffId:sid,tech:0,goods:0});
    if(p.is_refund){ row(def).tech+=total; return Object.values(m); }
    const items=Array.isArray(p.jifee_items)?p.jifee_items.filter(Boolean):[];
    const ins=Number(p.insurance_amount)||0;
    if(ins) row(p.insurance_staff_id||def).tech+=ins;
    let rest=total-ins;
    items.forEach(i=>{
      const a=Number(i.amount)||0;
      if(!a) return;
      rest-=a;
      const r=row(i.staff_id||def);
      if(isGoodsLabel(i.label)) r.goods+=a; else r.tech+=a;
    });
    if(rest) row(def).tech+=rest;
    const out=Object.values(m).filter(r=>r.tech||r.goods);
    return out.length?out:[{staffId:def,tech:0,goods:0}];
  }

  // 患者ごとの初めての会計日（新規・再来の判定に使う）。返金行は見ない
  function firstVisitDates(payments){
    const first={};
    (payments||[]).forEach(p=>{
      if(p.is_refund||!p.patient_name||!p.payment_date) return;
      const k=String(p.patient_name).replace(/\s/g,"");
      if(!first[k]||p.payment_date<first[k]) first[k]=p.payment_date;
    });
    return first;
  }

  const emptyRow=staffId=>({staffId,total:0,tech:0,goods:0,visits:0,techVisits:0,goodsVisits:0,newVisits:0,repeatVisits:0});

  // 期間・店舗で絞った、スタッフごとの集計。客数は「1回の来院（予約）」を1人と数える（同じ予約の会計が複数あってもまとめて1人）
  // opts: {from, to, storeId|null, storeOfBooking(bookingId)->storeId, firstDates}
  function summarize(payments,opts){
    const o=opts||{};
    const firstDates=o.firstDates||firstVisitDates(payments);
    const rows={};
    const visitSeen={}; // "staffId|来院キー" → {tech,goods}
    (payments||[]).forEach(p=>{
      if(!p.payment_date||(o.from&&p.payment_date<o.from)||(o.to&&p.payment_date>o.to)) return;
      if(o.storeId!=null&&o.storeOfBooking&&p.booking_id!=null&&o.storeOfBooking(p.booking_id)!==o.storeId) return;
      const visitKey=p.booking_id!=null?"b"+p.booking_id:"p"+p.id;
      const name=String(p.patient_name||"").replace(/\s/g,"");
      const isNew=!!name&&firstDates[name]===p.payment_date;
      splitPayment(p).forEach(part=>{
        const r=rows[part.staffId]=rows[part.staffId]||emptyRow(part.staffId);
        r.tech+=part.tech; r.goods+=part.goods; r.total+=part.tech+part.goods;
        if(p.is_refund) return; // 返金は金額だけ引き、客数は数えない
        const k=part.staffId+"|"+visitKey;
        const seen=visitSeen[k]=visitSeen[k]||{any:false,tech:false,goods:false};
        if(!seen.any&&(part.tech>0||part.goods>0)){ seen.any=true; r.visits++; if(isNew) r.newVisits++; else r.repeatVisits++; }
        if(!seen.tech&&part.tech>0){ seen.tech=true; r.techVisits++; }
        if(!seen.goods&&part.goods>0){ seen.goods=true; r.goodsVisits++; }
      });
    });
    return Object.values(rows).map(r=>({
      ...r,
      avg:r.visits?Math.round(r.total/r.visits):0,
      techAvg:r.techVisits?Math.round(r.tech/r.techVisits):0,
      goodsAvg:r.goodsVisits?Math.round(r.goods/r.goodsVisits):0,
    }));
  }

  // 並び替えの種類（POSの「総合売上順」などと同じ）
  const SORTS=[
    {key:"total",label:"総合 売上順"},{key:"visits",label:"総合 客数順"},{key:"avg",label:"総合 客単価順"},
    {key:"tech",label:"技術 売上順"},{key:"techVisits",label:"技術 客数順"},{key:"techAvg",label:"技術 客単価順"},
    {key:"goods",label:"商品 売上順"},{key:"goodsVisits",label:"商品 客数順"},{key:"goodsAvg",label:"商品 客単価順"},
    {key:"newVisits",label:"新規客数順"},{key:"repeatVisits",label:"再来客数順"},
  ];
  // 並び替えて順位を付ける（同じ値は同じ順位）。売上比率＝全体の総合売上に占める割合
  function rank(rows,key){
    const sorted=[...rows].sort((a,b)=>(b[key]-a[key])||(b.total-a.total)||(a.staffId-b.staffId));
    const grand=rows.reduce((s,r)=>s+r.total,0);
    let prev=null,prevRank=0;
    return sorted.map((r,i)=>{
      const rk=prev!==null&&r[key]===prev?prevRank:i+1;
      prev=r[key]; prevRank=rk;
      return {...r,rank:rk,share:grand?Math.round(r.total/grand*1000)/10:0};
    });
  }

  // ===== 個人マンダラ・目標 =====
  // マンダラは 3×3：マス0＝中心（目標・KGI）、マス1〜8＝重点テーマ。画面では中心を真ん中に、1〜8を時計回りに並べる
  const MANDALA_GRID=[1,2,3,8,0,4,7,6,5];
  const LEVELS={KGI:"最終目標（KGI）",KPI:"重要指標（KPI）",KDI:"行動目標（KDI）"};
  // 自動で実績が出る指標（その月の個人サマリーの数字）。manual は毎月手入力
  const METRICS={
    manual:{label:"手入力",unit:""},
    total:{label:"総合売上",unit:"円"},
    tech:{label:"技術売上",unit:"円"},
    goods:{label:"商品売上",unit:"円"},
    visits:{label:"総合客数",unit:"人"},
    avg:{label:"総合客単価",unit:"円"},
    newVisits:{label:"新規客数",unit:"人"},
    repeatVisits:{label:"再来客数",unit:"人"},
  };
  function emptyMandala(){ return Array.from({length:9},(_,i)=>({cell:i,title:"",memo:""})); }
  function normalizeCells(cells){
    const base=emptyMandala();
    (Array.isArray(cells)?cells:[]).forEach(c=>{ const i=Number(c&&c.cell); if(i>=0&&i<=8) base[i]={cell:i,title:String(c.title||""),memo:String(c.memo||"")}; });
    return base;
  }
  // 達成率（%）。direction="down" は少ないほど良い（目標以下で100%、超えた分だけ下がる）
  function achievement(target,actual,direction){
    const t=Number(target),a=Number(actual);
    if(!Number.isFinite(t)||!Number.isFinite(a)||actual===null||actual===""||target===null||target==="") return null;
    if(direction==="down"){ if(a<=t) return 100; return t>0?Math.max(0,Math.round((2-a/t)*1000)/10):0; }
    if(t<=0) return a>=t?100:0;
    return Math.round(a/t*1000)/10;
  }
  // 目標1件のその月の実績：自動の指標はサマリーの数字、手入力は保存した値
  function actualOf(goal,month,summaryRow){
    if(goal.metric&&goal.metric!=="manual") return summaryRow?Number(summaryRow[goal.metric])||0:0;
    const r=goal.results&&goal.results[month];
    return r&&r.actual!==undefined&&r.actual!==null&&r.actual!==""?Number(r.actual):null;
  }
  function monthRange(month){
    const [y,m]=month.split("-").map(Number);
    const last=new Date(Date.UTC(y,m,0)).getUTCDate();
    return {from:`${month}-01`,to:`${month}-${String(last).padStart(2,"0")}`};
  }

  const api={GOODS_PREFIX,isGoodsLabel,splitPayment,firstVisitDates,summarize,SORTS,rank,
    MANDALA_GRID,LEVELS,METRICS,emptyMandala,normalizeCells,achievement,actualOf,monthRange};
  root.StaffGoals=api;
})(typeof window!=="undefined"?window:globalThis);
