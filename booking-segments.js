// 柔整鍼灸併用で「柔整」と「鍼灸」の担当を分けた予約を、担当ごとの部分（セグメント）に分ける。
// スタッフの予約画面（index.html）・患者様の予約ページ（booking.html など）・今日の空き状況（today.html）で共通に使う。
// テストは test/booking-segments.test.js。
//
// 予約の列：staff_id・time・duration＝柔整の部分の担当・来院の始まり・柔整の時間
//           acu_staff_id＝鍼灸の担当、acu_duration＝鍼灸の時間（分）、acu_order＝"after"（柔整→鍼灸）／"before"（鍼灸→柔整）
// 鍼灸の担当が無い・柔整と同じ人の予約は、これまでどおり1つのまま。
(function(root){
  function toMin(t){ var p=String(t||"0:0").split(":"); return Number(p[0])*60+Number(p[1]); }
  function addMin(t,m){ var x=toMin(t)+m; return String(Math.floor(x/60)).padStart(2,"0")+":"+String(x%60).padStart(2,"0"); }
  function isSplit(b){ return !!(b&&b.acu_staff_id&&b.acu_staff_id!==b.staff_id&&b.time); }
  function assign(base,extra){ var o={}; for(var k in base) o[k]=base[k]; for(var j in extra) o[j]=extra[j]; return o; }
  // defaultDuration：duration が無いときの柔整の時間（メニューから決める関数か数値）
  function segmentsOf(b,defaultDuration){
    if(!isSplit(b)) return [b];
    var ju=b.duration||(typeof defaultDuration==="function"?defaultDuration(b):defaultDuration)||20;
    var acu=b.acu_duration||20;
    var before=b.acu_order==="before";
    return [
      assign(b,{time:before?addMin(b.time,acu):b.time,duration:ju,_seg:"ju",_baseId:b.id}),
      assign(b,{staff_id:b.acu_staff_id,time:before?b.time:addMin(b.time,ju),duration:acu,_seg:"acu",_baseId:b.id}),
    ];
  }
  function expand(list,defaultDuration){
    var out=[];
    (list||[]).forEach(function(b){ segmentsOf(b,defaultDuration).forEach(function(s){ out.push(s); }); });
    return out;
  }
  // 来院全体の時間（始まり〜終わり）
  function visitRange(b,defaultDuration){
    var segs=segmentsOf(b,defaultDuration);
    var st=Math.min.apply(null,segs.map(function(s){ return toMin(s.time); }));
    var en=Math.max.apply(null,segs.map(function(s){ return toMin(s.time)+(s.duration||(typeof defaultDuration==="function"?defaultDuration(s):defaultDuration)||20); }));
    return {start:st,end:en,minutes:en-st};
  }
  root.BookingSegments={isSplit:isSplit,segmentsOf:segmentsOf,expand:expand,visitRange:visitRange};
})(typeof window!=="undefined"?window:globalThis);
