// 小口現金の抽出（CSV）。画面（index.html の「当日の会計明細・金額計算・小口」→「小口現金」）から切り離した純粋な関数。
// テストは test/petty-cash.test.js。
(function(root){
  const num=v=>parseInt(String(v==null?"":v).replace(/[^\d-]/g,""),10)||0;
  const sign=e=>e.kind==="in"?num(e.amount):-num(e.amount);

  // 期間（from〜to、YYYY-MM-DD）の記録を、残高つきで並べる。期間より前の分は「繰越」にまとめる
  function pettyLedger(entries,from,to){
    const list=(entries||[]).filter(e=>e&&e.entry_date).slice()
      .sort((a,b)=>String(a.entry_date).localeCompare(String(b.entry_date))||(Number(a.id)||0)-(Number(b.id)||0));
    const carry=list.filter(e=>e.entry_date<from).reduce((s,e)=>s+sign(e),0);
    let bal=carry;
    const rows=list.filter(e=>e.entry_date>=from&&e.entry_date<=to).map(e=>{ bal+=sign(e); return {...e,balance:bal}; });
    const inSum=rows.filter(e=>e.kind==="in").reduce((s,e)=>s+num(e.amount),0);
    const outSum=rows.filter(e=>e.kind==="out").reduce((s,e)=>s+num(e.amount),0);
    const byCat={};
    rows.filter(e=>e.kind==="out").forEach(e=>{ const c=e.category||"その他"; byCat[c]=(byCat[c]||0)+num(e.amount); });
    return {carry,rows,inSum,outSum,end:carry+inSum-outSum,byCat};
  }

  const HEADERS=["日付","区分","内容","分類","入金","出金","残高","レシート・領収書","メモ","記録した人","店舗"];
  // CSV の行（見出しを除く）。先頭に繰越、最後に合計と分類別の出金
  function pettyCsvRows(entries,from,to,storeName){
    const L=pettyLedger(entries,from,to);
    const kindLabel=e=>e.kind==="in"?"入金":"出金";
    const catLabel=e=>e.kind==="out"?(e.category||"その他"):(e.source==="register"?"補充（売上から）":"補充");
    const rows=[[from,"繰越","前期からの繰越","","","",L.carry,"","","",storeName||""]];
    L.rows.forEach(e=>rows.push([e.entry_date,kindLabel(e),e.item||"",catLabel(e),
      e.kind==="in"?num(e.amount):"",e.kind==="out"?num(e.amount):"",e.balance,
      e.kind==="out"?(e.has_receipt?"あり":"なし"):"",e.memo||"",e.created_by_name||"",storeName||""]));
    rows.push(["","","","","","","","","","",""]);
    rows.push([to,"合計",`${from}〜${to}`,"",L.inSum,L.outSum,L.end,"","","",storeName||""]);
    const cats=Object.entries(L.byCat).sort((a,b)=>b[1]-a[1]);
    if(cats.length){
      rows.push(["","","","","","","","","","",""]);
      rows.push(["","分類別の出金","","","","","","","","",""]);
      cats.forEach(([c,v])=>rows.push(["","",c,c,"",v,"","","","",""]));
    }
    return rows;
  }
  function toCsv(headers,rows){
    const esc=v=>{ const s=v==null?"":String(v); return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
    return [headers,...rows].map(r=>r.map(esc).join(",")).join("\r\n");
  }
  root.PettyCash={pettyLedger,pettyCsvRows,toCsv,HEADERS};
})(typeof window!=="undefined"?window:globalThis);
