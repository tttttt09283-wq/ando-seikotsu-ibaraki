// シフト管理（全社・院別）の集計ロジック
// 画面（index.html の「シフト管理（全社・院別）」）から切り離した純粋な関数。テストは test/shift.test.js。
//
// データの元：
// ・月次シフト表   app_settings「shifts_YYYY-MM」   {"スタッフID_日付":"出勤"|"午前出勤"|…}
// ・その日の勤務院 app_settings「shiftstore_YYYY-MM」{"スタッフID_日付":店舗ID}（応援など、その日だけ別の院で働くとき）
// ・週固定シフト   staff_weekly_shifts（曜日ごとの出勤／休み・勤務院）
// ・所属院         clinic_staff.store_ids（先頭を所属院とみなす）
// ・必要人数       app_settings「shift_required」 {店舗ID:{weekday:n,sat:n,sun:n}}（日曜と祝日は sun）
//
// 勤務院の決め方：その日の勤務院 ＞ 週固定シフトのその曜日の勤務院 ＞ 所属院
// 人数の数え方：出勤＝1人、午前出勤・午後出勤＝0.5人、休み・有休・振替・祝振替＝0人
(function(root){
  const TYPES=["出勤","午前出勤","午後出勤","休み","有休","振替","祝振替"];
  const UNITS={"出勤":1,"午前出勤":0.5,"午後出勤":0.5};
  const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;

  function pad(n){ return String(n).padStart(2,"0"); }
  function dowOf(dateStr){ const [y,m,d]=dateStr.split("-").map(Number); return new Date(y,m-1,d).getDay(); }

  // その月の日付の一覧 [{date,day,label}]
  function monthDates(month){
    const [y,m]=String(month).split("-").map(Number);
    if(!y||!m) return [];
    const n=new Date(y,m,0).getDate();
    return Array.from({length:n},(_,i)=>{ const date=`${y}-${pad(m)}-${pad(i+1)}`; return {date,day:dowOf(date),label:i+1}; });
  }
  function shiftMonth(month,delta){
    const [y,m]=String(month).split("-").map(Number);
    const d=new Date(y,m-1+delta,1);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
  }

  function workUnits(type){ return UNITS[type]||0; }
  function isWorking(type){ return workUnits(type)>0; }

  // 週固定シフトの行 [{staff_id,day_of_week,is_working,store_id}] → {"スタッフID_曜日":{is_working,store_id}}
  function weeklyMap(rows){
    const map={};
    (rows||[]).forEach(r=>{ if(r&&r.staff_id!=null&&r.day_of_week!=null) map[`${r.staff_id}_${r.day_of_week}`]={is_working:r.is_working!==false,store_id:r.store_id==null?null:Number(r.store_id)}; });
    return map;
  }

  // その日の種類（シフト表に無ければ週固定シフトから「出勤」か「休み」）
  function dayType(shifts,weekly,staffId,date){
    const v=shifts&&shifts[`${staffId}_${date}`];
    if(TYPES.includes(v)) return v;
    const w=weekly&&weekly[`${staffId}_${dowOf(date)}`];
    return w&&!w.is_working?"休み":"出勤";
  }

  // 所属院（clinic_staff.store_ids の先頭。未設定なら null）
  function homeStore(staffStores,staffId){
    const ids=staffStores&&staffStores[staffId];
    return Array.isArray(ids)&&ids.length>0?Number(ids[0]):null;
  }

  // その日の勤務院
  function workStore(storeOverrides,weekly,staffStores,staffId,date){
    const o=storeOverrides&&storeOverrides[`${staffId}_${date}`];
    if(o!=null&&o!=="") return Number(o);
    const w=weekly&&weekly[`${staffId}_${dowOf(date)}`];
    if(w&&w.store_id!=null) return Number(w.store_id);
    return homeStore(staffStores,staffId);
  }

  // 必要人数の設定を整える {店舗ID:{weekday,sat,sun}}
  function normRequired(v){
    const out={};
    if(!v||typeof v!=="object") return out;
    Object.keys(v).forEach(k=>{
      const r=v[k]||{};
      const num=x=>{ const n=Number(x); return Number.isFinite(n)&&n>=0&&n<=99?Math.round(n*2)/2:0; };
      out[k]={weekday:num(r.weekday),sat:num(r.sat),sun:num(r.sun)};
    });
    return out;
  }
  // その日の必要人数（日曜・祝日は sun、土曜は sat、それ以外は weekday）
  function requiredOn(required,storeId,date,holidays){
    const r=required&&required[storeId];
    if(!r) return 0;
    const d=dowOf(date);
    const isHol=holidays&&(holidays.has?holidays.has(date):holidays.includes&&holidays.includes(date));
    if(d===0||isHol) return r.sun||0;
    if(d===6) return r.sat||0;
    return r.weekday||0;
  }

  // 1か月分をまとめて集計する
  // staff:[{id,name}] stores:[{id,name}] closed: Set「店舗ID_日付」（休診日。人数不足に数えない）
  function buildMonth({month,staff,stores,shifts,storeOverrides,weekly,staffStores,required,holidays,closed}){
    const dates=monthDates(month);
    const storeIds=(stores||[]).map(s=>Number(s.id));
    const cells={};          // "スタッフID_日付" → {type,storeId,units,away}
    const perStore={};       // 店舗ID → {日付: 人数}
    const perStoreStaff={};  // 店舗ID → {日付: [スタッフID]}
    const total={};          // 日付 → 全社の人数
    const unassigned={};     // 日付 → 勤務院が決まっていない人数
    const staffSummary={};   // スタッフID → {days,units,off,paid,furi,shuku,byStore:{店舗ID:人数}}
    storeIds.forEach(id=>{ perStore[id]={}; perStoreStaff[id]={}; dates.forEach(({date})=>{ perStore[id][date]=0; perStoreStaff[id][date]=[]; }); });
    dates.forEach(({date})=>{ total[date]=0; unassigned[date]=0; });

    (staff||[]).forEach(s=>{
      const sid=s.id, home=homeStore(staffStores,sid);
      const sum={days:0,units:0,off:0,paid:0,furi:0,shuku:0,away:0,byStore:{}};
      dates.forEach(({date})=>{
        const type=dayType(shifts,weekly,sid,date);
        const units=workUnits(type);
        let storeId=units>0?workStore(storeOverrides,weekly,staffStores,sid,date):null;
        if(storeId!=null&&!perStore[storeId]) storeId=null; // 消した院などは「未設定」扱い
        const away=units>0&&storeId!=null&&home!=null&&storeId!==home;
        cells[`${sid}_${date}`]={type,storeId,units,away};
        if(units>0){
          sum.days+=1; sum.units+=units; if(away) sum.away+=1;
          total[date]+=units;
          if(storeId==null) unassigned[date]+=units;
          else{ perStore[storeId][date]+=units; perStoreStaff[storeId][date].push(sid); sum.byStore[storeId]=(sum.byStore[storeId]||0)+units; }
        }
        else if(type==="休み") sum.off+=1;
        else if(type==="有休") sum.paid+=1;
        else if(type==="振替") sum.furi+=1;
        else if(type==="祝振替") sum.shuku+=1;
      });
      staffSummary[sid]=sum;
    });

    // 人数が足りない日（休診日は除く）
    const shortages=[];
    const storeSummary={};
    storeIds.forEach(id=>{
      let units=0,short=0,openDays=0;
      dates.forEach(({date})=>{
        const isClosed=!!(closed&&closed.has&&closed.has(`${id}_${date}`));
        units+=perStore[id][date];
        if(isClosed) return;
        openDays+=1;
        const need=requiredOn(required,id,date,holidays);
        if(need>0&&perStore[id][date]<need){ short+=1; shortages.push({storeId:id,date,need,have:perStore[id][date]}); }
      });
      storeSummary[id]={units,shortDays:short,openDays,avg:openDays?Math.round(units/openDays*10)/10:0};
    });
    return {dates,cells,perStore,perStoreStaff,total,unassigned,staffSummary,storeSummary,shortages};
  }

  // その院のシフト表に出すスタッフ（所属している人＋その月に1日でも応援に来る人）。所属の人を先に並べる
  function staffForStore(result,storeId,staff,staffStores){
    const id=Number(storeId);
    const own=[],help=[];
    (staff||[]).forEach(s=>{
      if(homeStore(staffStores,s.id)===id) own.push(s);
      else if((result.staffSummary[s.id]&&result.staffSummary[s.id].byStore[id])>0) help.push(s);
    });
    return {own,help};
  }

  // 全社のシフト表用に、スタッフを所属院ごとにまとめる（所属院が無い人は最後に「所属院 未設定」）
  function groupByHome(staff,stores,staffStores){
    const groups=(stores||[]).map(st=>({storeId:Number(st.id),name:st.name,staff:[]}));
    const none={storeId:null,name:"所属院 未設定",staff:[]};
    (staff||[]).forEach(s=>{
      const h=homeStore(staffStores,s.id);
      const g=groups.find(x=>x.storeId===h);
      (g||none).staff.push(s);
    });
    return groups.filter(g=>g.staff.length>0).concat(none.staff.length?[none]:[]);
  }

  // 有休・振替・祝振替の残りを、変更前→変更後に合わせて増減する（シフト表の他の画面と同じ計算）
  function adjustBalance(balance,staffId,before,after){
    const h=JSON.parse(JSON.stringify(balance||{}));
    if(!h[staffId]) h[staffId]={有休残:10,振替残:0,祝振替残:0};
    ["有休","振替","祝振替"].forEach(t=>{
      const k=t+"残";
      if(before===t) h[staffId][k]=(h[staffId][k]||0)+1;
      if(after===t) h[staffId][k]=Math.max(0,(h[staffId][k]||0)-1);
    });
    return h;
  }

  // 院名を短くする（「あんど整骨院 茨木院」→「茨木」）
  function shortStoreName(name){
    const s=String(name||"").replace(/^あんど整骨院\s*/,"").replace(/(駅前院|整骨院|院)$/,"").trim();
    return s||String(name||"");
  }

  // 人数の表示（0.5 刻み）
  function fmtUnits(n){ return Number.isInteger(n)?String(n):n.toFixed(1); }

  // CSV（全社または1院）
  function toCsv(result,rows,stores){
    const esc=v=>{ const s=String(v==null?"":v); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; };
    const nameOf=id=>{ const st=(stores||[]).find(x=>Number(x.id)===id); return st?shortStoreName(st.name):""; };
    const head=["スタッフ"].concat(result.dates.map(d=>d.date.slice(5))).concat(["出勤日数","休み","有休"]);
    const lines=[head.map(esc).join(",")];
    rows.forEach(s=>{
      const sum=result.staffSummary[s.id]||{};
      const cols=result.dates.map(({date})=>{
        const c=result.cells[`${s.id}_${date}`]; if(!c) return "";
        return c.units>0&&c.storeId!=null?`${c.type}(${nameOf(c.storeId)})`:c.type;
      });
      lines.push([s.name].concat(cols).concat([sum.days||0,sum.off||0,sum.paid||0]).map(esc).join(","));
    });
    return lines.join("\n");
  }

  // ===== 日割りの売上目標（シフトの出勤人数で配分） =====
  // dates：[{date}]、units：{日付:その日の出勤人数}、closed(date)：休診なら true、target：月の目標売上、
  // actual：{日付:売上}、today："YYYY-MM-DD"
  // ・出勤人数が多い日ほど目標を大きくする（目標 × その日の人数 ÷ 月の延べ人数）＝基本の目標
  // ・前日までの実績が目標に足りない（マイナス）ときは、足りない分をその日以降の稼働日に人数の割合で上乗せする
  // ・目標より多く売れている（プラス）ときは減らさず、基本の目標（平均の数字）のまま
  function dailySalesPlan({dates,units,closed,target,actual,today}){
    const T=Number(target)||0, act=actual||{};
    const w=d=>{ const u=Number(units&&units[d])||0; return closed&&closed(d)?0:Math.max(0,u); };
    const W=dates.reduce((t,{date})=>t+w(date),0);
    const workDays=dates.filter(({date})=>w(date)>0).length;
    const A=d=>Math.round(Number(act[d])||0);
    // 今日から先は「前日までの実績」で割り直した同じ割合（1人あたり）を使う
    const beforeToday=dates.reduce((t,{date})=>t+(date<today?A(date):0),0);
    const wFromToday=dates.reduce((t,{date})=>t+(date>=today?w(date):0),0);
    const futureRate=wFromToday>0?(T-beforeToday)/wFromToday:0;
    let actBefore=0, wFrom=W, cum=0;
    const days=dates.map(({date})=>{
      const weight=w(date), a=A(date);
      const base=W>0?T*weight/W:0;
      // 過去の日は「その日より前の実績」で、残りの目標を残りの延べ人数に割り直した数（その日に見ていた目標）
      const need=date<today?(wFrom>0?(T-actBefore)*weight/wFrom:0):futureRate*weight;
      const tgt=weight>0?Math.round(Math.max(base,need)):0;
      const past=date<today, isToday=date===today;
      const row={date,units:weight,working:weight>0,base:Math.round(base),target:tgt,added:Math.max(0,tgt-Math.round(base)),
        perPerson:weight>0?Math.round(tgt/weight):0,actual:date<=today?a:null,past,today:isToday};
      if(date<=today){ row.diff=a-tgt; if(past) cum+=a-tgt; row.cum=cum; }
      actBefore+=a; wFrom-=weight;
      return row;
    });
    const actualTotal=dates.reduce((t,{date})=>t+(date<=today?Math.round(Number(act[date])||0):0),0);
    const remainDays=days.filter(d=>d.working&&d.date>=today).length;
    const todayRow=days.find(d=>d.today)||null;
    const next=days.find(d=>d.working&&d.date>=today)||null;
    return {target:T,totalUnits:W,workDays,avgDaily:workDays?Math.round(T/workDays):0,actualTotal,remaining:Math.max(0,T-actualTotal),
      rate:T>0?Math.round(actualTotal/T*1000)/10:null,remainDays,today:todayRow,next,days};
  }

  const api={TYPES,DATE_RE,monthDates,shiftMonth,workUnits,isWorking,weeklyMap,dayType,homeStore,workStore,normRequired,requiredOn,buildMonth,staffForStore,groupByHome,adjustBalance,shortStoreName,fmtUnits,toCsv,dowOf,dailySalesPlan};
  root.ShiftLogic=api;
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
