// 勤怠表（シフトの確認）・早朝出勤の理由・休憩が取れなかった理由の判定ロジック
// 画面（index.html の勤怠管理）から切り離した純粋な関数。テストは test/attendance.test.js。
//
// ・早朝：出勤が「平日 9:15」「休日（土日・祝日）8:15」より前（時刻は設定で変えられる）
// ・休憩なし：実働が基準（初期値6時間）を超えるのに、休憩の合計が基準（初期値45分）より短い
// ・時刻はすべて日本時間で判定する（端末の時計の設定に左右されないように）
(function(root){
  const DEFAULT_RULES={
    earlyWeekday:"09:15",   // 平日：この時刻より前の出勤は理由が必要
    earlyHoliday:"08:15",   // 休日（土日・祝日）：この時刻より前の出勤は理由が必要
    breakAfterHours:6,      // 実働がこの時間を超えたら
    breakMinMinutes:45,     // 休憩がこの分数より短いと理由が必要
    partTimers:[],          // アルバイトのスタッフID（勤怠表で別の欄に出す）
  };
  const HM_RE=/^([01]\d|2[0-3]):[0-5]\d$/;

  function normRules(r){
    const x=r&&typeof r==="object"?r:{};
    const num=(v,d,min,max)=>{ const n=Number(v); return Number.isFinite(n)&&n>=min&&n<=max?n:d; };
    return {
      earlyWeekday:HM_RE.test(x.earlyWeekday)?x.earlyWeekday:DEFAULT_RULES.earlyWeekday,
      earlyHoliday:HM_RE.test(x.earlyHoliday)?x.earlyHoliday:DEFAULT_RULES.earlyHoliday,
      breakAfterHours:num(x.breakAfterHours,DEFAULT_RULES.breakAfterHours,0,24),
      breakMinMinutes:num(x.breakMinMinutes,DEFAULT_RULES.breakMinMinutes,0,240),
      partTimers:Array.isArray(x.partTimers)?x.partTimers.map(Number).filter(Number.isFinite):[],
    };
  }

  // 日本時間の「HH:MM」
  function hmJst(iso){
    if(!iso) return "";
    const t=new Date(iso).getTime();
    if(!Number.isFinite(t)) return "";
    const d=new Date(t+9*3600000);
    return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
  }
  const toMin=hm=>{ const [h,m]=String(hm).split(":").map(Number); return h*60+m; };

  // 祝日の一覧（臨時休業・営業時間変更のメモに「祝日」「振替休日」「国民の休日」が入っている日）
  function holidaySetFrom(closures){
    const s=new Set();
    (closures||[]).forEach(c=>{ if(c&&c.date&&/祝日|振替休日|国民の休日/.test(c.memo||"")) s.add(String(c.date).slice(0,10)); });
    return s;
  }
  // 休日＝土曜・日曜・祝日
  function isHolidayDate(ds,holidays){
    const dow=new Date(ds+"T00:00:00Z").getUTCDay();
    return dow===0||dow===6||!!(holidays&&holidays.has(ds));
  }
  function earlyLimit(ds,rules,holidays){
    const r=normRules(rules);
    return isHolidayDate(ds,holidays)?r.earlyHoliday:r.earlyWeekday;
  }
  function isEarly(ds,clockInIso,rules,holidays){
    const hm=hmJst(clockInIso);
    if(!hm||!ds) return false;
    return toMin(hm)<toMin(earlyLimit(ds,rules,holidays));
  }

  const breaksOf=r=>Array.isArray(r&&r.breaks)?r.breaks:[];
  // 終わっている休憩の合計（分）
  function breakMinutes(r){
    return Math.round(breaksOf(r).reduce((s,b)=>(b&&b.start&&b.end)?s+Math.max(0,(new Date(b.end)-new Date(b.start))/60000):s,0));
  }
  // 実働（分）＝出勤〜退勤−休憩。退勤が無ければ null
  function workMinutes(r){
    if(!r||!r.clock_in||!r.clock_out) return null;
    return Math.max(0,Math.round((new Date(r.clock_out)-new Date(r.clock_in))/60000)-breakMinutes(r));
  }
  function needsBreakReason(r,rules){
    const x=normRules(rules);
    const w=workMinutes(r);
    if(w==null) return false;
    return w>x.breakAfterHours*60 && breakMinutes(r)<x.breakMinMinutes;
  }

  // シートの「出勤・退勤・出勤・退勤」：1回目の休憩で前半と後半に分ける（休憩が無ければ前半だけ）
  function segments(r){
    const bs=breaksOf(r).filter(b=>b&&b.start).slice().sort((a,b)=>String(a.start).localeCompare(String(b.start)));
    const inHM=hmJst(r&&r.clock_in), outHM=hmJst(r&&r.clock_out);
    if(!bs.length) return [{in:inHM,out:outHM},{in:"",out:""}];
    const b=bs[0];
    return [{in:inHM,out:hmJst(b.start)},{in:b.end?hmJst(b.end):"",out:outHM}];
  }

  // その記録の確認事項
  function issuesOf(r,rules,holidays){
    const early=isEarly(r&&r.date,r&&r.clock_in,rules,holidays);
    const noBreak=needsBreakReason(r,rules);
    const has=v=>!!String(v||"").trim();
    return {
      early, noBreak,
      earlyMissing:early&&!has(r.early_reason),
      breakMissing:noBreak&&!has(r.break_reason),
      limit:earlyLimit(r&&r.date,rules,holidays),
    };
  }

  // シフト表の「休み」の日数（設定していない日は、曜日ごとの基本シフトで休みなら休み）
  // shifts：shifts_YYYY-MM の中身 {"スタッフID_日付": "出勤"|"休み"|"有休"|…}
  // weekly：staff_weekly_shifts の行 [{staff_id, day_of_week, is_working}]
  function shiftValueOf(staffId,ds,shifts,weekly){
    const v=(shifts||{})[`${staffId}_${ds}`];
    if(v) return v;
    const dow=new Date(ds+"T00:00:00Z").getUTCDay();
    const w=(weekly||[]).find(x=>Number(x.staff_id)===Number(staffId)&&Number(x.day_of_week)===dow);
    return w&&w.is_working===false?"休み":"出勤";
  }
  function monthDates(ym){
    const [y,m]=ym.split("-").map(Number);
    const n=new Date(Date.UTC(y,m,0)).getUTCDate();
    return Array.from({length:n},(_,i)=>`${ym}-${String(i+1).padStart(2,"0")}`);
  }
  function publicHolidayCount(staffId,ym,shifts,weekly){
    return monthDates(ym).filter(ds=>shiftValueOf(staffId,ds,shifts,weekly)==="休み").length;
  }
  // 振休の残り（シフト表の「振替残」＋「祝振替残」）
  function furikaeLeft(balance){
    const b=balance||{};
    return (Number(b.振替残)||0)+(Number(b.祝振替残)||0);
  }

  // 1人・1か月分の勤怠表の行と合計
  function sheetFor(staffId,ym,records,opts){
    const o=opts||{};
    const mine=(records||[]).filter(r=>Number(r.staff_id)===Number(staffId)&&r.date&&String(r.date).slice(0,7)===ym)
      .sort((a,b)=>String(a.clock_in||"").localeCompare(String(b.clock_in||"")));
    let total=0, days=0, early=0, noBreak=0, missing=0;
    const rows=monthDates(ym).map(ds=>{
      const recs=mine.filter(r=>String(r.date).slice(0,10)===ds);
      const shift=shiftValueOf(staffId,ds,o.shifts,o.weekly);
      const items=recs.map(r=>{
        const iss=issuesOf(r,o.rules,o.holidays);
        const w=workMinutes(r);
        if(w!=null) total+=w;
        if(iss.early) early++;
        if(iss.noBreak) noBreak++;
        if(iss.earlyMissing||iss.breakMissing) missing++;
        return {record:r,segments:segments(r),work:w,open:!!(r.clock_in&&!r.clock_out),issues:iss};
      });
      if(recs.length) days++;
      return {date:ds,holiday:isHolidayDate(ds,o.holidays),shift,items};
    });
    return {rows,totalMinutes:total,days,early,noBreak,missing};
  }

  function fmtMinutes(m){
    if(m==null) return "";
    return `${Math.floor(m/60)}:${String(m%60).padStart(2,"0")}`;
  }

  root.Attendance={DEFAULT_RULES,normRules,hmJst,holidaySetFrom,isHolidayDate,earlyLimit,isEarly,breakMinutes,workMinutes,
    needsBreakReason,segments,issuesOf,shiftValueOf,monthDates,publicHolidayCount,furikaeLeft,sheetFor,fmtMinutes};
})(typeof window!=="undefined"?window:globalThis);
