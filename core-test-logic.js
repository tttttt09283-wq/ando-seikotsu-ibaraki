// あんど式 体幹チェック（院内・イベント用）の採点ロジック
// 画面（core-test.html）から切り離した純粋な関数。基準値を変えるときは CORE_TESTS の steps だけ直せばよい。
(function(root){
  // steps：この値「以上」でその点数（1〜5点）。[2点の下限, 3点の下限, 4点の下限, 5点の下限]
  const CORE_TESTS=[
    {key:"plank",area:"前（お腹まわり）",name:"プランク",unit:"秒",max:180,timer:true,sides:false,
      steps:[20,40,60,90],
      how:"うつ伏せで両ひじ・つま先で支え、頭からかかとまで一直線をキープ。腰が落ちたら終了。",
      care:"ひざをついたプランク20秒×3回から。お腹を薄くしたまま呼吸を止めないのがコツです。"},
    {key:"side",area:"横（わき腹）",name:"サイドプランク",unit:"秒",max:120,timer:true,sides:true,
      steps:[10,20,35,60],
      how:"横向きでひじと足の側面で支え、体を一直線に。腰が落ちたら終了。左右それぞれ測定。",
      care:"ひざを曲げたサイドプランクを左右15秒ずつ。弱い側を1セット多めに行いましょう。"},
    {key:"balance",area:"バランス",name:"片脚立ち（目を閉じて）",unit:"秒",max:60,timer:true,sides:true,
      steps:[5,10,20,40],
      how:"目を閉じて片脚で立つ。軸足が動く・上げた足が床につく・手が体から離れたら終了（最大60秒）。",
      care:"歯みがき中に片脚立ち30秒ずつ。最初は目を開けて、壁の近くで安全に行いましょう。"},
    {key:"situp",area:"腹筋の力",name:"上体起こし（30秒）",unit:"回",max:60,timer:false,countdown:30,sides:false,
      steps:[5,10,15,20],
      how:"ひざを90度に曲げ、腕を胸の前で組む。30秒で、ひじが太ももにつくまで起き上がれた回数。",
      care:"おへそをのぞき込むように肩甲骨が浮くところまで起きる「クランチ」を10回×2セット。"},
    {key:"bridge",area:"後ろ（お尻・背中）",name:"片脚ブリッジ",unit:"秒",max:30,timer:true,sides:true,
      steps:[5,10,20,30],
      how:"仰向けでひざを立て、お尻を上げて片脚を伸ばす。腰が落ちる・骨盤が傾いたら終了（最大30秒）。",
      care:"両脚のヒップリフト10回×2セットから。お尻をしめて、腰を反らさないように。"},
    {key:"birddog",area:"安定性",name:"バードドッグ（スタッフ評価）",unit:"点",max:5,timer:false,rating:true,sides:false,
      steps:[2,3,4,5],
      how:"四つばいで右手と左脚（反対も）を伸ばして5秒キープ。ぐらつき・腰の反りをスタッフが5段階で評価。",
      care:"四つばいで手だけ・脚だけを交互に上げる練習から。腰が反らない高さで止めましょう。"},
  ];
  const RATING_LABELS={1:"姿勢を保てない",2:"大きくぐらつく",3:"少しぐらつく",4:"ほぼ安定",5:"ぶれずに安定"};
  const RANKS=[
    {rank:"S",min:85,label:"体幹エリート",color:"#7c3aed",bg:"#f5f3ff"},
    {rank:"A",min:70,label:"しっかり体幹",color:"#059669",bg:"#ecfdf5"},
    {rank:"B",min:50,label:"平均レベル",color:"#2563eb",bg:"#eff6ff"},
    {rank:"C",min:30,label:"伸びしろあり",color:"#d97706",bg:"#fffbeb"},
    {rank:"D",min:0,label:"体幹ケアを始めよう",color:"#dc2626",bg:"#fef2f2"},
  ];
  const FOLLOW_STATUSES=["未対応","連絡済み","予約済み","来院済み","見送り"];

  function num(v){ if(v===""||v==null) return null; const n=Number(v); return Number.isFinite(n)&&n>=0?n:null; }
  function pointsFor(test,value){
    const v=num(value); if(v==null) return null;
    let p=1; test.steps.forEach(s=>{ if(v>=s) p++; });
    return Math.min(5,p);
  }
  // 1つの項目の値（左右ありなら平均）と点数・左右差
  function evaluateItem(test,m){
    m=m||{};
    if(m.skip) return {key:test.key,skipped:true,points:null};
    if(test.sides){
      const r=num(m.right), l=num(m.left);
      if(r==null||l==null) return {key:test.key,incomplete:true,points:null};
      const pr=pointsFor(test,r), pl=pointsFor(test,l);
      const diff=Math.abs(r-l), base=Math.max(r,l);
      const asym=base>0&&diff>=Math.max(5,base*0.25); // 5秒以上かつ25%以上の差
      return {key:test.key,points:(pr+pl)/2,right:r,left:l,pointsRight:pr,pointsLeft:pl,
        asymmetry:asym?{weak:r<l?"右":"左",diff:Math.round(diff*10)/10}:null};
    }
    const v=num(m.value);
    if(v==null) return {key:test.key,incomplete:true,points:null};
    return {key:test.key,points:pointsFor(test,v),value:v};
  }
  function rankFor(score){ return RANKS.find(r=>score>=r.min)||RANKS[RANKS.length-1]; }
  // 全体の評価。スキップした項目は満点から除外する。未入力が残っていれば complete=false
  function evaluate(measurements){
    measurements=measurements||{};
    const items=CORE_TESTS.map(t=>evaluateItem(t,measurements[t.key]));
    const scored=items.filter(i=>i.points!=null);
    const incomplete=items.filter(i=>i.incomplete).map(i=>i.key);
    if(!scored.length) return {items,complete:false,incomplete,score:null,rank:null,weak:[],asymmetries:[]};
    const sum=scored.reduce((a,i)=>a+i.points,0);
    const score=Math.round(sum/(scored.length*5)*100);
    const r=rankFor(score);
    const weak=scored.filter(i=>i.points<=2).sort((a,b)=>a.points-b.points).map(i=>i.key);
    const asymmetries=items.filter(i=>i.asymmetry).map(i=>({key:i.key,weak:i.asymmetry.weak,diff:i.asymmetry.diff}));
    return {items,complete:incomplete.length===0,incomplete,score,rank:r.rank,rankInfo:r,weak,asymmetries,
      itemPoints:Object.fromEntries(scored.map(i=>[i.key,i.points]))};
  }
  function testByKey(k){ return CORE_TESTS.find(t=>t.key===k); }
  // 同じ人の前回と比べた点数の伸び（前回がなければ null）
  function improvement(current,previous){
    if(!previous||previous.total_score==null||current==null) return null;
    return Math.round((Number(current)-Number(previous.total_score))*10)/10;
  }
  // ランキング表示用：「田中 夕賀」→「田中 ○○」
  function maskName(name){
    const s=String(name||"").trim(); if(!s) return "";
    const parts=s.split(/[\s　]+/);
    if(parts.length>1) return parts[0]+" ○○";
    return s.charAt(0)+"○○";
  }
  function personKey(e){ return String(e.participant_name||"").replace(/[\s　]/g,"")+"|"+String(e.phone||"").replace(/\D/g,""); }
  // 一覧の集計
  function summarize(entries){
    const list=(entries||[]).filter(e=>e.total_score!=null);
    const n=list.length;
    const avg=n?Math.round(list.reduce((a,e)=>a+Number(e.total_score),0)/n*10)/10:null;
    const rankCount=Object.fromEntries(RANKS.map(r=>[r.rank,0]));
    list.forEach(e=>{ if(rankCount[e.rank]!=null) rankCount[e.rank]++; });
    const weakCount=Object.fromEntries(CORE_TESTS.map(t=>[t.key,0]));
    list.forEach(e=>(e.weak_items||[]).forEach(k=>{ if(weakCount[k]!=null) weakCount[k]++; }));
    const followCount=Object.fromEntries(FOLLOW_STATUSES.map(s=>[s,0]));
    (entries||[]).forEach(e=>{ const s=e.follow_status||"未対応"; if(followCount[s]!=null) followCount[s]++; });
    const people=new Set((entries||[]).map(personKey)).size;
    return {count:(entries||[]).length,people,avg,rankCount,weakCount,followCount,
      newCount:(entries||[]).filter(e=>!e.is_patient).length};
  }
  function csvCell(v){ const s=v==null?"":String(v); return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }
  function toCsv(entries,eventsById,staffById){
    const head=["測定日","イベント","名前","ふりがな","性別","年齢","電話","区分","担当",
      ...CORE_TESTS.flatMap(t=>t.sides?[t.name+"（右）",t.name+"（左）"]:[t.name]),
      "点数","ランク","弱い項目","コメント","フォロー状況","フォローメモ"];
    const rows=(entries||[]).map(e=>{
      const m=e.measurements||{};
      return [e.measured_on,(eventsById&&eventsById[e.event_id])||"",e.participant_name,e.kana,e.gender,e.age,e.phone,
        e.is_patient?"患者様":"新規",e.staff_name||(staffById&&staffById[e.staff_id])||"",
        ...CORE_TESTS.flatMap(t=>{ const x=m[t.key]||{}; if(x.skip) return t.sides?["スキップ","スキップ"]:["スキップ"]; return t.sides?[x.right,x.left]:[x.value]; }),
        e.total_score,e.rank,(e.weak_items||[]).map(k=>(testByKey(k)||{}).name||k).join("・"),e.comment,e.follow_status,e.follow_memo];
    });
    return "﻿"+[head,...rows].map(r=>r.map(csvCell).join(",")).join("\r\n");
  }
  const api={CORE_TESTS,RATING_LABELS,RANKS,FOLLOW_STATUSES,pointsFor,evaluateItem,evaluate,rankFor,testByKey,improvement,maskName,personKey,summarize,toCsv};
  if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.CoreTest=api;
})(typeof window!=="undefined"?window:globalThis);
