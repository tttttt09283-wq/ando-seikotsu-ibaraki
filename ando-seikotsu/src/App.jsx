import { useState, useEffect, useMemo, useCallback } from "react";

// ============================================================
//  ⚙️  ここだけ自分の値に書き換える（Supabaseダッシュボードで確認）
// ============================================================
const SUPABASE_URL = "https://dctlirxcwitcupaewiyt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjdGxpcnhjd2l0Y3VwYWV3aXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzOTI1NTgsImV4cCI6MjA5Nzk2ODU1OH0.ym1WINmz3W7T2HWvtzWkQcKs96RB5JU1JZL7EiMz704";
// ============================================================

// 軽量Supabaseクライアント（CDN不要・fetch直接呼び出し）
const sb = {
  async query(table, method = "GET", body = null, filters = "") {
    const url = `${SUPABASE_URL}/rest/v1/${table}${filters}`;
    const res = await fetch(url, {
      method,
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        "Prefer": method === "POST" ? "return=representation" : "return=representation",
      },
      body: body ? JSON.stringify(body) : null,
    });
    if (!res.ok) { const e = await res.text(); throw new Error(e); }
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  },
  select: (table, filters = "") => sb.query(table, "GET", null, filters),
  insert: (table, data) => sb.query(table, "POST", data),
  update: (table, id, data) => sb.query(table, "PATCH", data, `?id=eq.${id}`),
  delete: (table, id) => sb.query(table, "DELETE", null, `?id=eq.${id}`),
  rpc: async (fn, params) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json();
  },
};

// ============================================================
//  定数
// ============================================================
const CLINIC_NAME = "あんど整骨院";
const STAFF_COLORS = { 1:"#2563eb", 2:"#059669", 3:"#d97706", 4:"#7c3aed" };
const STAFF_INITIALS = { 1:"岩", 2:"大", 3:"定", 4:"細" };
const MENUS = ["初診（60分）","再診（30分）","鍼灸（45分）","骨盤矯正（40分）","マッサージ（30分）"];
const DURATION = { "初診（60分）":60,"再診（30分）":30,"鍼灸（45分）":45,"骨盤矯正（40分）":40,"マッサージ（30分）":30 };
const HOURS = Array.from({length:11},(_,i)=>i+9);
const DAYS_JP = ["月","火","水","木","金","土","日"];

function fmtDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function addDays(d,n) { const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function getWeekDates(base) {
  const day=base.getDay(), mon=new Date(base);
  mon.setDate(base.getDate()-(day===0?6:day-1));
  return Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return d; });
}
function toMin(t) { const [h,m]=t.split(":").map(Number); return h*60+m; }
function overlaps(a,b) {
  const as=toMin(a.time),ae=as+DURATION[a.menu],bs=toMin(b.time),be=bs+DURATION[b.menu];
  return as<be && bs<ae;
}

const today = new Date();

// ============================================================
//  デモ用フォールバックデータ（Supabase未接続時）
// ============================================================
const DEMO_STAFF = [
  { id:1, name:"岩永 先生", email:"iwanaga@ando.jp", password:"iwanaga123", role:"admin" },
  { id:2, name:"大皿 先生", email:"osara@ando.jp",   password:"osara123",   role:"staff" },
  { id:3, name:"定井 先生", email:"sadai@ando.jp", password:"sadai123", role:"staff" },
  { id:4, name:"細永 先生", email:"hosonaga@ando.jp", password:"hosonaga123", role:"staff" },
];
const DEMO_BOOKINGS = [
  { id:1, patient_name:"山本 花子", phone:"090-1234-5678", staff_id:1, date:fmtDate(today), time:"10:00", menu:"初診（60分）", line_notify:true, reminded:false },
  { id:2, patient_name:"田中 太郎", phone:"080-9876-5432", staff_id:2, date:fmtDate(today), time:"11:00", menu:"再診（30分）", line_notify:true, reminded:true },
  { id:3, patient_name:"佐藤 美咲", phone:"070-1111-2222", staff_id:3, date:fmtDate(addDays(today,1)), time:"14:00", menu:"鍼灸（45分）", line_notify:false, reminded:false },
  { id:4, patient_name:"鈴木 次郎", phone:"090-3333-4444", staff_id:4, date:fmtDate(addDays(today,1)), time:"15:30", menu:"骨盤矯正（40分）", line_notify:true, reminded:false },
];

// ============================================================
//  ログイン画面
// ============================================================
function LoginScreen({ onLogin, isDemo }) {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [showPw,setShowPw]=useState(false);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);

  async function handleLogin() {
    setLoading(true); setError("");
    try {
      if (isDemo) {
        // デモモード：ローカル認証
        const user = DEMO_STAFF.find(s=>s.email===email.trim()&&s.password===password);
        if (user) { onLogin({...user, color:STAFF_COLORS[user.id], initial:STAFF_INITIALS[user.id]}); }
        else { setError("メールアドレスまたはパスワードが違います"); }
      } else {
        // 本番：Supabase認証
        const users = await sb.select("clinic_staff", `?email=eq.${encodeURIComponent(email.trim())}&password=eq.${encodeURIComponent(password)}`);
        if (users.length > 0) {
          const u = users[0];
          onLogin({...u, color:STAFF_COLORS[u.id]||"#2563eb", initial:u.name?.[0]||"？"});
        } else { setError("メールアドレスまたはパスワードが違います"); }
      }
    } catch(e) { setError("ログインエラー："+e.message); }
    setLoading(false);
  }

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#0f2744,#1e5799 60%,#2d8ecf)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{marginBottom:28,textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:8}}>🏥</div>
        <div style={{color:"white",fontSize:22,fontWeight:800,letterSpacing:2}}>{CLINIC_NAME}</div>
        <div style={{color:"rgba(255,255,255,0.6)",fontSize:13,marginTop:4}}>スタッフ管理システム</div>
        {isDemo && <div style={{background:"#fbbf24",color:"#78350f",borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:700,marginTop:8,display:"inline-block"}}>デモモード（Supabase未接続）</div>}
      </div>

      <div style={{background:"white",borderRadius:18,padding:28,width:"100%",maxWidth:360,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:17,fontWeight:800,color:"#1e3a5f",marginBottom:20,textAlign:"center"}}>ログイン</div>
        {error && <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"10px 14px",marginBottom:14,color:"#dc2626",fontSize:13,textAlign:"center"}}>⚠️ {error}</div>}

        <div style={{marginBottom:14}}>
          <label style={S.label}>メールアドレス</label>
          <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("");}} placeholder="iwanaga@ando.jp" onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={S.input}/>
        </div>
        <div style={{marginBottom:20}}>
          <label style={S.label}>パスワード</label>
          <div style={{position:"relative"}}>
            <input type={showPw?"text":"password"} value={password} onChange={e=>{setPassword(e.target.value);setError("");}} placeholder="パスワード" onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={{...S.input,paddingRight:44}}/>
            <button onClick={()=>setShowPw(v=>!v)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#9ca3af",fontSize:16}}>{showPw?"🙈":"👁"}</button>
          </div>
        </div>
        <button onClick={handleLogin} disabled={loading} style={{width:"100%",background:"linear-gradient(135deg,#1e3a5f,#2d6a9f)",color:"white",border:"none",borderRadius:10,padding:14,fontWeight:800,fontSize:15,cursor:"pointer",opacity:loading?0.7:1}}>
          {loading?"確認中...":"ログイン →"}
        </button>

        <div style={{marginTop:18,background:"#f8fafc",borderRadius:10,padding:"12px 14px"}}>
          <div style={{fontSize:11,color:"#9ca3af",fontWeight:700,marginBottom:8}}>🔑 デモ用アカウント</div>
          {DEMO_STAFF.map(s=>(
            <button key={s.id} onClick={()=>{setEmail(s.email);setPassword(s.password);}}
              style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",padding:"4px 0",cursor:"pointer"}}>
              <span style={{fontWeight:700,color:STAFF_COLORS[s.id],fontSize:12}}>{s.name}</span>
              <span style={{color:"#9ca3af",fontSize:11,marginLeft:6}}>{s.email}</span>
              {s.role==="admin"&&<span style={{background:"#fef3c7",color:"#d97706",borderRadius:4,padding:"1px 5px",fontSize:10,marginLeft:4}}>管理者</span>}
            </button>
          ))}
          <div style={{fontSize:10,color:"#d1d5db",marginTop:6}}>※ タップすると自動入力されます</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  メイン管理画面
// ============================================================
function Dashboard({ currentUser, onLogout, isDemo }) {
  const [bookings,setBookings]=useState([]);
  const [staffList,setStaffList]=useState(DEMO_STAFF.map(s=>({...s,color:STAFF_COLORS[s.id],initial:STAFF_INITIALS[s.id]})));
  const [loading,setLoading]=useState(true);
  const [syncing,setSyncing]=useState(false);
  const [lastSync,setLastSync]=useState(null);
  const [view,setView]=useState("calendar");
  const [selStaff,setSelStaff]=useState(null);
  const [baseDate,setBaseDate]=useState(today);
  const [form,setForm]=useState(null);
  const [editId,setEditId]=useState(null);
  const [conflict,setConflict]=useState(false);
  const [toast,setToast]=useState(null);
  const [delConfirm,setDelConfirm]=useState(null);
  const [showMenu,setShowMenu]=useState(false);

  const isAdmin = currentUser.role==="admin";
  const weekDates = getWeekDates(baseDate);
  const todayStr = fmtDate(today);
  const tomorrowStr = fmtDate(addDays(today,1));

  // データ取得
  const fetchBookings = useCallback(async () => {
    try {
      setSyncing(true);
      if (isDemo) {
        await new Promise(r=>setTimeout(r,400));
        setBookings(DEMO_BOOKINGS);
      } else {
        const data = await sb.select("bookings","?order=date.asc,time.asc");
        setBookings(data);
      }
      setLastSync(new Date());
    } catch(e) { showToast("データ取得エラー："+e.message,"error"); }
    finally { setSyncing(false); setLoading(false); }
  }, [isDemo]);

  useEffect(()=>{ fetchBookings(); const t=setInterval(fetchBookings,30000); return ()=>clearInterval(t); },[fetchBookings]);

  function showToast(msg,type="success") { setToast({msg,type}); setTimeout(()=>setToast(null),3500); }

  const visibleStaff = isAdmin ? staffList : staffList.filter(s=>s.id===currentUser.id);
  const filteredBookings = useMemo(()=>
    selStaff ? bookings.filter(b=>b.staff_id===selStaff) : (isAdmin?bookings:bookings.filter(b=>b.staff_id===currentUser.id)),
    [bookings,selStaff,isAdmin,currentUser.id]
  );

  function openAdd(date=null,time=null,staffId=null) {
    setForm({patient_name:"",phone:"",staff_id:staffId||(isAdmin?(selStaff||1):currentUser.id),date:date||todayStr,time:time||"10:00",menu:MENUS[0],line_notify:true,reminded:false});
    setConflict(false); setEditId(null); setView("form");
  }
  function openEdit(b) {
    if(!isAdmin&&b.staff_id!==currentUser.id) return;
    setForm({...b}); setEditId(b.id); setConflict(false); setView("form");
  }

  async function save() {
    if(!form.patient_name.trim()) return;
    if(bookings.some(b=>b.id!==editId&&b.staff_id===form.staff_id&&b.date===form.date&&overlaps(b,form))) { setConflict(true); return; }
    try {
      setSyncing(true);
      if(isDemo) {
        if(editId!==null) setBookings(prev=>prev.map(b=>b.id===editId?{...form,id:editId}:b));
        else setBookings(prev=>[...prev,{...form,id:Date.now()}]);
      } else {
        if(editId!==null) await sb.update("bookings",editId,form);
        else await sb.insert("bookings",form);
        await fetchBookings();
      }
      showToast(editId!==null?"予約を更新しました":"予約を登録しました");
      setView("calendar");
    } catch(e) { showToast("保存エラー："+e.message,"error"); }
    finally { setSyncing(false); }
  }

  async function del(id) {
    try {
      setSyncing(true);
      if(isDemo) setBookings(prev=>prev.filter(b=>b.id!==id));
      else { await sb.delete("bookings",id); await fetchBookings(); }
      setDelConfirm(null); setView("calendar");
      showToast("削除しました","delete");
    } catch(e) { showToast("削除エラー："+e.message,"error"); }
    finally { setSyncing(false); }
  }

  function getCells(d,hour) {
    const ds=fmtDate(d);
    const sids=selStaff?[selStaff]:visibleStaff.map(s=>s.id);
    return sids.flatMap(sid=>bookings.filter(b=>b.date===ds&&b.staff_id===sid&&parseInt(b.time.split(":")[0])===hour));
  }

  const todayCount=bookings.filter(b=>b.date===todayStr).length;
  const pendingLine=bookings.filter(b=>b.date===tomorrowStr&&b.line_notify&&!b.reminded).length;

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f0f4f8",flexDirection:"column",gap:16}}>
      <div style={{fontSize:40}}>🏥</div>
      <div style={{fontWeight:700,color:"#1e3a5f",fontSize:16}}>予約データを読み込んでいます...</div>
      <div style={{width:200,height:4,background:"#e5e7eb",borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",background:"#2563eb",borderRadius:2,animation:"loading 1.5s ease-in-out infinite",width:"60%"}}></div>
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif",background:"#f0f4f8",minHeight:"100vh"}}>
      {/* ヘッダー */}
      <div style={{background:"linear-gradient(135deg,#1e3a5f,#2d5a8e)",color:"white"}}>
        <div style={{maxWidth:920,margin:"0 auto",padding:"12px 16px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontSize:11,opacity:0.6,letterSpacing:2}}>スタッフ管理</div>
                {isDemo && <span style={{background:"#fbbf24",color:"#78350f",borderRadius:4,padding:"1px 7px",fontSize:10,fontWeight:700}}>デモ</span>}
                {syncing && <span style={{fontSize:11,opacity:0.7}}>🔄 同期中...</span>}
              </div>
              <div style={{fontSize:18,fontWeight:800}}>{CLINIC_NAME}</div>
              {lastSync && <div style={{fontSize:10,opacity:0.5}}>最終同期 {lastSync.getHours()}:{String(lastSync.getMinutes()).padStart(2,"0")}</div>}
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={()=>openAdd()} style={{background:"white",color:"#1e3a5f",border:"none",borderRadius:8,padding:"7px 14px",fontWeight:700,cursor:"pointer",fontSize:13}}>＋ 新規予約</button>
              <div style={{position:"relative"}}>
                <button onClick={()=>setShowMenu(v=>!v)} style={{background:"rgba(255,255,255,0.18)",border:"none",borderRadius:8,padding:"7px 10px",color:"white",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13}}>
                  <div style={{width:26,height:26,borderRadius:"50%",background:currentUser.color,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13}}>{currentUser.initial}</div>
                  <span style={{fontWeight:600}}>{currentUser.name}</span>
                  {isAdmin&&<span style={{background:"#fbbf24",color:"#78350f",borderRadius:4,padding:"1px 5px",fontSize:10,fontWeight:700}}>管理者</span>}
                </button>
                {showMenu && (
                  <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"white",borderRadius:10,boxShadow:"0 8px 30px rgba(0,0,0,0.18)",minWidth:180,zIndex:200,overflow:"hidden"}}>
                    <div style={{padding:"12px 14px",borderBottom:"1px solid #f0f0f0"}}>
                      <div style={{fontWeight:700,fontSize:13,color:"#1e3a5f"}}>{currentUser.name}</div>
                      <div style={{fontSize:11,color:"#9ca3af"}}>{currentUser.email}</div>
                      <div style={{fontSize:11,color:isDemo?"#d97706":"#16a34a",marginTop:2}}>{isDemo?"⚠️ デモモード":"✅ Supabase接続済み"}</div>
                    </div>
                    <button onClick={fetchBookings} style={{width:"100%",padding:"10px 14px",background:"none",border:"none",textAlign:"left",cursor:"pointer",fontSize:13,color:"#2563eb",fontWeight:600}}>🔄 今すぐ同期</button>
                    <button onClick={onLogout} style={{width:"100%",padding:"10px 14px",background:"none",border:"none",textAlign:"left",cursor:"pointer",fontSize:13,color:"#ef4444",fontWeight:700,borderTop:"1px solid #f5f5f5"}}>🚪 ログアウト</button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:4,marginTop:10}}>
            {[["calendar","📅 カレンダー"],["list","📋 一覧"],["stats","📊 サマリー"],["setup","⚙️ 接続設定"]].map(([v,label])=>(
              <button key={v} onClick={()=>{setView(v);setShowMenu(false);}} style={{background:view===v?"white":"transparent",color:view===v?"#1e3a5f":"rgba(255,255,255,0.8)",border:"none",borderRadius:"8px 8px 0 0",padding:"7px 12px",fontWeight:view===v?700:400,cursor:"pointer",fontSize:12}}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{maxWidth:920,margin:"0 auto",padding:16}} onClick={()=>setShowMenu(false)}>

        {/* LINE通知バナー */}
        {pendingLine>0 && view!=="setup" && (
          <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
            <div style={{fontSize:13,color:"#15803d",fontWeight:600}}>🟢 明日 {pendingLine}件のLINEリマインドが17:00に自動送信されます</div>
            <button onClick={fetchBookings} style={{background:"none",border:"none",cursor:"pointer",color:"#15803d",fontSize:12,fontWeight:600,flexShrink:0}}>🔄 更新</button>
          </div>
        )}

        {/* スタッフフィルター */}
        {(view==="calendar"||view==="list") && (
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            {isAdmin&&<button onClick={()=>setSelStaff(null)} style={{background:!selStaff?"#1e3a5f":"white",color:!selStaff?"white":"#444",border:"1.5px solid "+(!selStaff?"#1e3a5f":"#ddd"),borderRadius:20,padding:"5px 14px",cursor:"pointer",fontSize:13,fontWeight:600}}>全員</button>}
            {visibleStaff.map(s=>(
              <button key={s.id} onClick={()=>setSelStaff(s.id)} style={{background:selStaff===s.id?s.color:"white",color:selStaff===s.id?"white":"#444",border:"1.5px solid "+(selStaff===s.id?s.color:"#ddd"),borderRadius:20,padding:"5px 14px",cursor:"pointer",fontSize:13,fontWeight:600}}>{s.name}</button>
            ))}
          </div>
        )}

        {/* カレンダー */}
        {view==="calendar" && (
          <div style={{background:"white",borderRadius:12,boxShadow:"0 2px 12px rgba(0,0,0,0.07)",overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid #eee"}}>
              <button onClick={()=>{const d=new Date(baseDate);d.setDate(d.getDate()-7);setBaseDate(d);}} style={{background:"none",border:"1px solid #ddd",borderRadius:6,padding:"4px 12px",cursor:"pointer"}}>◀</button>
              <div style={{textAlign:"center"}}>
                <div style={{fontWeight:700,fontSize:15}}>{weekDates[0].getMonth()+1}月{weekDates[0].getDate()}日 〜 {weekDates[6].getMonth()+1}月{weekDates[6].getDate()}日</div>
                {!isDemo&&<div style={{fontSize:10,color:"#9ca3af"}}>30秒ごとに自動更新</div>}
              </div>
              <button onClick={()=>{const d=new Date(baseDate);d.setDate(d.getDate()+7);setBaseDate(d);}} style={{background:"none",border:"1px solid #ddd",borderRadius:6,padding:"4px 12px",cursor:"pointer"}}>▶</button>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:580}}>
                <thead>
                  <tr>
                    <th style={{width:40,background:"#f8fafc",borderBottom:"1px solid #eee",padding:"8px 2px"}}></th>
                    {weekDates.map((d,i)=>{
                      const isToday=fmtDate(d)===todayStr;
                      return <th key={i} style={{padding:"8px 3px",background:isToday?"#eff6ff":"#f8fafc",borderBottom:"1px solid #eee",fontSize:12}}>
                        <div style={{color:i>=5?"#ef4444":"#666"}}>{DAYS_JP[i]}</div>
                        <div style={{fontSize:15,fontWeight:isToday?800:500,color:isToday?"#2563eb":i>=5?"#ef4444":"#222"}}>{d.getDate()}</div>
                      </th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {HOURS.map(hour=>(
                    <tr key={hour}>
                      <td style={{fontSize:10,color:"#bbb",textAlign:"right",paddingRight:4,paddingTop:3,borderBottom:"1px solid #f5f5f5",verticalAlign:"top"}}>{hour}:00</td>
                      {weekDates.map((d,di)=>{
                        const cells=getCells(d,hour);
                        const isToday=fmtDate(d)===todayStr;
                        return <td key={di} onClick={()=>openAdd(fmtDate(d),`${String(hour).padStart(2,"0")}:00`,selStaff||(isAdmin?1:currentUser.id))}
                          style={{verticalAlign:"top",padding:2,borderBottom:"1px solid #f5f5f5",borderLeft:"1px solid #f5f5f5",cursor:"pointer",background:isToday?"#fafcff":"white",minWidth:72}}>
                          {cells.map(b=>{
                            const st=staffList.find(x=>x.id===b.staff_id)||{color:"#888",initial:"？"};
                            return <div key={b.id} onClick={e=>{e.stopPropagation();openEdit(b);}}
                              style={{background:st.color+"22",borderLeft:`3px solid ${st.color}`,borderRadius:4,padding:"2px 4px",marginBottom:2,fontSize:11,cursor:"pointer"}}>
                              <div style={{fontWeight:700,color:st.color,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.patient_name}</div>
                              <div style={{color:"#666",fontSize:10}}>{b.time}</div>
                              {b.line_notify&&<div style={{fontSize:9,color:"#16a34a"}}>🟢LINE</div>}
                            </div>;
                          })}
                        </td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 一覧 */}
        {view==="list" && (
          <div>
            {filteredBookings.length===0 ? (
              <div style={{background:"white",borderRadius:12,padding:40,textAlign:"center",color:"#aaa"}}>
                <div style={{fontSize:36,marginBottom:8}}>📋</div>
                <div>予約がありません</div>
              </div>
            ) : [...filteredBookings].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)).map(b=>{
              const s=staffList.find(x=>x.id===b.staff_id)||{color:"#888",name:"不明",initial:"？"};
              const canEdit=isAdmin||b.staff_id===currentUser.id;
              return <div key={b.id} style={{background:"white",borderRadius:10,padding:"12px 16px",marginBottom:9,boxShadow:"0 1px 6px rgba(0,0,0,0.06)",borderLeft:`4px solid ${s.color}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:4}}>
                    <span style={{background:s.color,color:"white",borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700}}>{s.name}</span>
                    {b.line_notify&&<span style={{background:b.reminded?"#dcfce7":"#fef9c3",color:b.reminded?"#15803d":"#a16207",borderRadius:6,padding:"2px 8px",fontSize:11}}>{b.reminded?"🟢 送信済":"🔔 送信待"}</span>}
                  </div>
                  <div style={{fontWeight:700,fontSize:15}}>{b.patient_name}</div>
                  <div style={{color:"#666",fontSize:13}}>{b.date} {b.time} ｜ {b.menu}</div>
                  <div style={{color:"#aaa",fontSize:12}}>{b.phone}</div>
                </div>
                {canEdit&&<div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>openEdit(b)} style={{background:"#eff6ff",color:"#2563eb",border:"none",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:600,fontSize:13}}>編集</button>
                  <button onClick={()=>setDelConfirm(b)} style={{background:"#fef2f2",color:"#ef4444",border:"none",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:600,fontSize:13}}>削除</button>
                </div>}
              </div>;
            })}
          </div>
        )}

        {/* サマリー */}
        {view==="stats" && (
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:16}}>
              {[
                {label:"本日の予約",value:`${todayCount}件`,icon:"📅",color:"#2563eb"},
                {label:"LINE送信予定（明日）",value:`${pendingLine}件`,icon:"🟢",color:"#16a34a"},
                {label:"今週の予約",value:`${bookings.filter(b=>{const d=new Date(b.date);return d>=weekDates[0]&&d<=weekDates[6];}).length}件`,icon:"📊",color:"#7c3aed"},
                {label:"総予約数",value:`${bookings.length}件`,icon:"📋",color:"#d97706"},
              ].map(item=>(
                <div key={item.label} style={{background:"white",borderRadius:12,padding:16,boxShadow:"0 1px 6px rgba(0,0,0,0.06)",borderTop:`3px solid ${item.color}`}}>
                  <div style={{fontSize:22}}>{item.icon}</div>
                  <div style={{fontSize:26,fontWeight:800,color:item.color,margin:"6px 0 2px"}}>{item.value}</div>
                  <div style={{fontSize:12,color:"#9ca3af"}}>{item.label}</div>
                </div>
              ))}
            </div>
            <div style={{background:"white",borderRadius:12,padding:16,boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}>
              <div style={{fontWeight:700,fontSize:14,color:"#1e3a5f",marginBottom:14}}>スタッフ別 本日の予約数</div>
              {staffList.map(s=>{
                const cnt=bookings.filter(b=>b.date===todayStr&&b.staff_id===s.id).length;
                return <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                  <div style={{width:32,height:32,borderRadius:"50%",background:s.color,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:800,fontSize:13,flexShrink:0}}>{s.initial}</div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:13,fontWeight:600}}>{s.name}</span>
                      <span style={{fontSize:13,color:s.color,fontWeight:700}}>{cnt}件</span>
                    </div>
                    <div style={{height:6,background:"#f0f0f0",borderRadius:3}}>
                      <div style={{height:"100%",width:`${Math.min(cnt*33,100)}%`,background:s.color,borderRadius:3}}></div>
                    </div>
                  </div>
                </div>;
              })}
            </div>
          </div>
        )}

        {/* 接続設定 */}
        {view==="setup" && <SetupGuide isDemo={isDemo}/>}

        {/* フォーム */}
        {view==="form" && form && (
          <div style={{background:"white",borderRadius:12,padding:22,boxShadow:"0 2px 12px rgba(0,0,0,0.08)",maxWidth:480}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
              <h2 style={{margin:0,fontSize:17,color:"#1e3a5f"}}>{editId!==null?"予約を編集":"新規予約"}</h2>
              <button onClick={()=>setView("calendar")} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#aaa"}}>✕</button>
            </div>
            {conflict&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"10px 14px",marginBottom:14,color:"#dc2626",fontSize:13,fontWeight:600}}>⚠️ この時間はすでに予約が入っています（ダブルブッキング防止）</div>}
            {[
              {label:"患者名 *",key:"patient_name",type:"text",placeholder:"山本 花子"},
              {label:"電話番号",key:"phone",type:"tel",placeholder:"090-0000-0000"},
              {label:"日付",key:"date",type:"date"},
              {label:"時間",key:"time",type:"time"},
            ].map(({label,key,type,placeholder})=>(
              <div key={key} style={{marginBottom:12}}>
                <label style={S.label}>{label}</label>
                <input type={type} value={form[key]||""} placeholder={placeholder} onChange={e=>{setForm(f=>({...f,[key]:e.target.value}));setConflict(false);}} style={S.input}/>
              </div>
            ))}
            {isAdmin&&(
              <div style={{marginBottom:12}}>
                <label style={S.label}>担当スタッフ</label>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {staffList.map(s=>(
                    <button key={s.id} onClick={()=>{setForm(f=>({...f,staff_id:s.id}));setConflict(false);}}
                      style={{background:form.staff_id===s.id?s.color:"white",color:form.staff_id===s.id?"white":"#444",border:`1.5px solid ${s.color}`,borderRadius:20,padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:600}}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{marginBottom:12}}>
              <label style={S.label}>メニュー</label>
              <select value={form.menu} onChange={e=>setForm(f=>({...f,menu:e.target.value}))} style={S.input}>
                {MENUS.map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div style={{marginBottom:18,display:"flex",alignItems:"center",gap:8}}>
              <input type="checkbox" id="ln" checked={!!form.line_notify} onChange={e=>setForm(f=>({...f,line_notify:e.target.checked}))} style={{width:16,height:16}}/>
              <label htmlFor="ln" style={{fontSize:13,color:"#555",fontWeight:600}}>🟢 LINEリマインドを前日に送る</label>
            </div>
            <div style={{display:"flex",gap:10}}>
              {editId!==null&&<button onClick={()=>setDelConfirm(bookings.find(b=>b.id===editId))} style={{flex:1,background:"#fef2f2",color:"#ef4444",border:"none",borderRadius:8,padding:11,fontWeight:700,cursor:"pointer"}}>削除</button>}
              <button onClick={save} disabled={syncing} style={{flex:2,background:"linear-gradient(135deg,#1e3a5f,#2d6a9f)",color:"white",border:"none",borderRadius:8,padding:11,fontWeight:700,cursor:"pointer",fontSize:14,opacity:syncing?0.7:1}}>
                {syncing?"保存中...":(editId!==null?"更新する":"予約を登録")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 削除確認 */}
      {delConfirm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:16}}>
          <div style={{background:"white",borderRadius:14,padding:24,maxWidth:300,width:"100%"}}>
            <div style={{textAlign:"center",fontSize:36,marginBottom:8}}>🗑️</div>
            <div style={{fontWeight:700,fontSize:16,textAlign:"center",marginBottom:6}}>削除しますか？</div>
            <div style={{color:"#666",fontSize:13,textAlign:"center",marginBottom:18}}>{delConfirm.patient_name}さん<br/>{delConfirm.date} {delConfirm.time}</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setDelConfirm(null)} style={{flex:1,background:"#f3f4f6",border:"none",borderRadius:8,padding:11,cursor:"pointer",fontWeight:600}}>キャンセル</button>
              <button onClick={()=>del(delConfirm.id)} style={{flex:1,background:"#ef4444",color:"white",border:"none",borderRadius:8,padding:11,cursor:"pointer",fontWeight:700}}>削除する</button>
            </div>
          </div>
        </div>
      )}

      {/* トースト */}
      {toast&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:toast.type==="delete"?"#1f2937":toast.type==="error"?"#dc2626":"#059669",color:"white",padding:"12px 24px",borderRadius:10,fontWeight:600,fontSize:14,zIndex:400,boxShadow:"0 4px 20px rgba(0,0,0,0.2)",whiteSpace:"nowrap"}}>
          {toast.type==="delete"?"🗑️ ":toast.type==="error"?"❌ ":"✅ "}{toast.msg}
        </div>
      )}
    </div>
  );
}

// ============================================================
//  接続設定ガイド
// ============================================================
function SetupGuide({ isDemo }) {
  const steps = [
    {
      title:"Supabaseアカウントを作成",
      body:"supabase.com にアクセスして「Start your project」からアカウントを作成（無料）",
      link:"https://supabase.com",
      linkLabel:"Supabaseを開く →",
    },
    {
      title:"新しいプロジェクトを作成",
      body:'ダッシュボードで「New project」をクリック → プロジェクト名に「ando-seikotsu」などを入力 → データベースパスワードを設定',
    },
    {
      title:"テーブルを作成（SQLエディタで実行）",
      body:'左メニュー「SQL Editor」→「New query」に以下のSQLを貼り付けて実行：',
      code:`-- スタッフテーブル
CREATE TABLE staff (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'staff'
);

-- 予約テーブル
CREATE TABLE bookings (
  id SERIAL PRIMARY KEY,
  patient_name TEXT NOT NULL,
  phone TEXT,
  staff_id INT REFERENCES staff(id),
  date DATE NOT NULL,
  time TEXT NOT NULL,
  menu TEXT NOT NULL,
  line_notify BOOLEAN DEFAULT false,
  reminded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- サンプルデータ投入
INSERT INTO staff (name,email,password,role) VALUES
  ('岩永 先生','iwanaga@ando.jp','iwanaga123','admin'),
  ('大皿 先生','osara@ando.jp','osara123','staff'),
  ('定井 先生','sadai@ando.jp','sadai123','staff'),
  ('細永 先生','hosonaga@ando.jp','hosonaga123','staff');

-- RLS（Row Level Security）を無効化（社内利用のため）
ALTER TABLE staff DISABLE ROW LEVEL SECURITY;
ALTER TABLE bookings DISABLE ROW LEVEL SECURITY;`,
    },
    {
      title:"APIキーをコピーしてアプリに貼り付け",
      body:'左メニュー「Settings」→「API」→「Project URL」と「anon public」キーをコピーして、このファイルの先頭 SUPABASE_URL と SUPABASE_ANON_KEY に貼り付ける',
    },
  ];

  return (
    <div style={{maxWidth:560,margin:"0 auto"}}>
      <div style={{background:isDemo?"#fef9c3":"#f0fdf4",border:"1px solid "+(isDemo?"#fde68a":"#86efac"),borderRadius:12,padding:14,marginBottom:20}}>
        <div style={{fontWeight:700,color:isDemo?"#92400e":"#15803d",fontSize:14,marginBottom:4}}>
          {isDemo?"⚠️ 現在デモモードで動作しています":"✅ Supabase接続済みです"}
        </div>
        <div style={{fontSize:13,color:isDemo?"#a16207":"#16a34a"}}>
          {isDemo?"以下の手順でSupabaseを接続すると、スタッフ全員でリアルタイム共有できます":"予約データはSupabaseに保存され、30秒ごとに自動同期されます"}
        </div>
      </div>

      {steps.map((step,i)=>(
        <div key={i} style={{background:"white",borderRadius:12,padding:18,marginBottom:12,boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}>
          <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:"#1e3a5f",color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,flexShrink:0}}>{i+1}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:800,fontSize:14,color:"#1e3a5f",marginBottom:6}}>{step.title}</div>
              <div style={{fontSize:13,color:"#555",lineHeight:1.7}}>{step.body}</div>
              {step.link&&<a href={step.link} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:8,color:"#2563eb",fontSize:13,fontWeight:600}}>{step.linkLabel}</a>}
              {step.code&&(
                <div style={{marginTop:10,background:"#1e293b",borderRadius:8,padding:12,overflowX:"auto"}}>
                  <pre style={{margin:0,fontSize:11,color:"#e2e8f0",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{step.code}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:12,padding:16}}>
        <div style={{fontWeight:700,color:"#1d4ed8",fontSize:14,marginBottom:6}}>💡 接続後にできること</div>
        <div style={{fontSize:13,color:"#1e40af",lineHeight:1.8}}>
          ✅ スタッフ全員がリアルタイムで同じ予約データを共有<br/>
          ✅ 30秒ごとに自動更新（他の人が入れた予約がすぐ反映）<br/>
          ✅ データがクラウドに保存される（スマホ・PC両方から使える）<br/>
          ✅ 予約が入るたびにLINEグループへ通知
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  ルート（接続チェック付き）
// ============================================================
export default function App() {
  const [user,setUser]=useState(null);
  const [isDemo,setIsDemo]=useState(false);

  useEffect(()=>{
    if(SUPABASE_URL.includes("xxxxxxxxxxxx") || SUPABASE_URL.length < 20) {
      setIsDemo(true);
    } else {
      setIsDemo(false);
    }
  },[]);
  if(!user) return <LoginScreen onLogin={setUser} isDemo={isDemo}/>;
  return <Dashboard currentUser={user} onLogout={()=>setUser(null)} isDemo={isDemo}/>;
}

const S = {
  label:{display:"block",fontSize:13,color:"#555",marginBottom:4,fontWeight:600},
  input:{width:"100%",padding:"9px 12px",border:"1.5px solid #ddd",borderRadius:8,fontSize:14,boxSizing:"border-box"},
};
