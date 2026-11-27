// ===== 症状チェッカー（試験運用）の中身 =====
// スタッフが問診で聞いたことを選ぶと、考えられる状態の候補・確かめる検査・施術の方向性・保険の目安を出す。
// 診断ではない（最終判断は施術者。危険なサインがあれば医療機関へ）。画面は symptom-checker.html、テストは test/symptom.test.js
(function(root){
  // ---- 部位 ----
  const REGIONS=[
    {id:"neck",label:"首"},{id:"shoulder",label:"肩"},{id:"back",label:"背中"},{id:"low_back",label:"腰"},
    {id:"hip",label:"股関節・お尻"},{id:"knee",label:"膝"},{id:"ankle",label:"足首・足"},{id:"elbow_hand",label:"肘・手首・手"},{id:"head",label:"頭"},
  ];
  // ---- 選べる症状・特徴（グループごと） ----
  const FACTORS=[
    {group:"いつから・きっかけ",items:[
      {id:"sudden",label:"急に痛くなった（ここ数日）"},
      {id:"gradual",label:"少しずつ痛くなった"},
      {id:"chronic",label:"3か月以上続いている"},
      {id:"trauma",label:"ぶつけた・ひねった・転んだ"},
      {id:"lifting",label:"重い物を持った・前かがみで"},
      {id:"sleep",label:"朝起きたら痛かった（寝違え）"},
      {id:"overuse",label:"使いすぎ（スポーツ・仕事・家事）"},
      {id:"traffic",label:"交通事故のあと"},
    ]},
    {group:"どんなときに痛い",items:[
      {id:"move",label:"動かすと痛い"},
      {id:"flex",label:"前にかがむと痛い"},
      {id:"extend",label:"後ろに反らすと痛い"},
      {id:"rotate",label:"振り向く・ひねると痛い"},
      {id:"raise_arm",label:"腕を上げると痛い"},
      {id:"behind_back",label:"背中に手が回らない・髪が結べない"},
      {id:"walk_rest",label:"歩くと痛み・しびれ、休むと楽（間欠性跛行）"},
      {id:"stairs",label:"階段・立ち上がりで痛い"},
      {id:"first_step",label:"朝の一歩目・動き始めが痛い"},
      {id:"grip",label:"物をつかむ・ひねると痛い"},
      {id:"sitting",label:"座っていると痛い"},
      {id:"desk",label:"デスクワーク・スマホで悪化"},
    ]},
    {group:"どんな症状",items:[
      {id:"numb",label:"しびれがある"},
      {id:"radiate",label:"腕や脚に痛みが走る"},
      {id:"swelling",label:"腫れている"},
      {id:"heat",label:"熱をもっている"},
      {id:"stiff",label:"こり・張り・重だるい"},
      {id:"morning_stiff",label:"朝のこわばり"},
      {id:"lock",label:"引っかかる・ロックする"},
      {id:"unstable",label:"ぐらつく・抜ける感じ"},
      {id:"weakness",label:"力が入りにくい"},
      {id:"night_ache",label:"夜にうずく（寝返りで目が覚める）"},
      {id:"click",label:"音が鳴る（ポキッ・ゴリッ）"},
      {id:"tender_point",label:"押すと痛い場所がはっきりある"},
      {id:"headache_band",label:"頭全体が締めつけられる"},
      {id:"headache_pulse",label:"ズキズキ脈打つ・吐き気・光がつらい"},
    ]},
    {group:"年代・そのほか",items:[
      {id:"age_young",label:"10〜20代"},
      {id:"age_mid",label:"30〜50代"},
      {id:"age_old",label:"60代以上"},
      {id:"sports",label:"スポーツをしている"},
      {id:"female",label:"女性"},
      {id:"pregnant",label:"妊娠中・産後"},
    ]},
  ];
  // ---- 危険なサイン（ひとつでもあれば施術より先に医療機関へ） ----
  const RED_FLAGS=[
    {id:"rf_fever",label:"発熱がある・体がだるい"},
    {id:"rf_night_rest",label:"じっとしていても・夜中も強く痛む（姿勢で変わらない）"},
    {id:"rf_weight",label:"原因のわからない体重減少"},
    {id:"rf_cancer",label:"がんの治療歴がある"},
    {id:"rf_bladder",label:"尿や便が出にくい・もれる・股のまわりがしびれる"},
    {id:"rf_palsy",label:"手足の力がどんどん弱くなる・まひ"},
    {id:"rf_both_legs",label:"両手・両脚にしびれが広がっている"},
    {id:"rf_deform",label:"外傷のあと変形・強い腫れ・体重をかけられない（骨折の疑い）"},
    {id:"rf_chest",label:"胸の痛み・息苦しさ・冷や汗"},
    {id:"rf_thunder",label:"突然の激しい頭痛（今までで一番）"},
    {id:"rf_neuro",label:"ろれつが回らない・顔のゆがみ・ものが二重に見える"},
    {id:"rf_steroid",label:"ステロイドを長く飲んでいる・骨粗しょう症で転倒した"},
  ];
  const RED_FLAG_ADVICE="施術は行わず、整形外科・内科など医療機関の受診を勧めてください。急ぐ症状（胸の痛み・突然の激しい頭痛・まひ・排尿排便の異常）は救急へ。";

  // ---- 状態の候補 ----
  // w：特徴ごとの重み（＋は当てはまるほど近い、−は当てはまると遠い）。tests：確かめる検査。care：施術の方向性。
  // ins：保険の目安（ju＝柔整の対象になりうる（急性・亜急性の外傷性）、acu＝鍼灸保険の対象疾患（医師の同意書が必要））
  const CONDITIONS=[
    // 首
    {id:"neck_sprain",region:"neck",name:"寝違え（頚部の急性の筋・関節の痛み）",w:{sleep:4,sudden:3,rotate:3,move:2,tender_point:1,chronic:-3,numb:-2},
      tests:["首を回せる範囲（左右差）","痛みの出る方向の確認","押して痛い筋（肩甲挙筋・胸鎖乳突筋など）"],care:"痛みの強い時期は冷やして負担を減らす。可動域の回復に合わせて手技・軽い運動",ins:{ju:true,acu:false},note:"柔整の保険：頚部捻挫（寝違え）として対象になりうる"},
    {id:"whiplash",region:"neck",name:"むち打ち（頚椎捻挫）",w:{traffic:5,trauma:3,sudden:2,move:2,stiff:1,headache_band:1},
      tests:["神経の症状（しびれ・力の低下）の確認","可動域","スパーリングテスト（しびれがあるとき）"],care:"急性期は安静と冷却。症状に合わせて手技・物理療法。経過を記録する",ins:{ju:true,acu:true},note:"交通事故は自賠責の手続き（医療機関の受診も）。鍼灸保険：頚椎捻挫後遺症（同意書）"},
    {id:"cervical_radic",region:"neck",name:"頚椎症・頚椎椎間板ヘルニア（神経の圧迫）",w:{numb:4,radiate:4,extend:2,rotate:1,weakness:2,age_mid:1,age_old:1,gradual:1},
      tests:["スパーリングテスト","ジャクソンテスト","腱反射・握力・感覚の左右差"],care:"首を反らす動きを避ける。症状が強い・力が入らないときは医療機関へ",ins:{ju:false,acu:true},note:"鍼灸保険：頸腕症候群（同意書）"},
    {id:"stiff_neck",region:"neck",name:"首こり・ストレートネック（姿勢による筋緊張）",w:{stiff:4,desk:4,chronic:2,gradual:2,headache_band:1,sudden:-2,trauma:-3},
      tests:["姿勢（頭が前に出ていないか）","首・肩の可動域","押して痛い筋"],care:"手技・鍼灸で筋緊張をゆるめ、姿勢とデスク環境の指導、ストレッチ",ins:{ju:false,acu:false},note:"慢性のこりは保険の対象外（自費）"},
    {id:"tos",region:"neck",name:"胸郭出口症候群",w:{numb:3,raise_arm:3,stiff:2,female:1,desk:1,radiate:1},
      tests:["ライトテスト","モーレーテスト","アドソンテスト"],care:"なで肩・猫背の姿勢改善、斜角筋・小胸筋をゆるめる",ins:{ju:false,acu:true},note:"鍼灸保険：頸腕症候群（同意書）"},
    // 肩
    {id:"frozen",region:"shoulder",name:"五十肩（肩関節周囲炎）",w:{behind_back:4,raise_arm:3,night_ache:3,age_mid:2,age_old:1,gradual:2,trauma:-2},
      tests:["肩が上がる角度・後ろに回る範囲（自分で動かす・人が動かす）","夜間痛の有無"],care:"痛みの強い時期は無理に動かさない。時期に合わせて可動域を広げる手技・運動",ins:{ju:false,acu:true},note:"鍼灸保険：五十肩（同意書）"},
    {id:"rotator",region:"shoulder",name:"腱板損傷・腱板炎",w:{raise_arm:4,weakness:3,night_ache:2,trauma:2,overuse:2,age_old:2,click:1},
      tests:["ドロップアームテスト","エンプティカンテスト","ペインフルアーク（60〜120°で痛い）"],care:"腕が上がらない・力が入らないときは整形外科の検査（MRI）を勧める",ins:{ju:true,acu:false},note:"外傷・使いすぎによる急性の痛みは柔整の対象になりうる"},
    {id:"impinge",region:"shoulder",name:"インピンジメント（肩の挟み込み）",w:{raise_arm:4,overuse:3,sports:2,click:1,age_young:1,age_mid:1},
      tests:["ニアテスト","ホーキンステスト","ペインフルアーク"],care:"肩甲骨の動きの改善、使いすぎの調整、インナーマッスルの運動",ins:{ju:true,acu:false},note:""},
    {id:"shoulder_stiff",region:"shoulder",name:"肩こり（筋緊張）",w:{stiff:4,desk:3,chronic:2,gradual:1,headache_band:1,trauma:-3,raise_arm:-1},
      tests:["僧帽筋・肩甲挙筋の張り","姿勢・肩甲骨の位置"],care:"手技・鍼灸・EMSで筋緊張をゆるめ、姿勢指導",ins:{ju:false,acu:false},note:"慢性のこりは保険の対象外（自費）"},
    // 背中
    {id:"back_myofascial",region:"back",name:"背中の筋・筋膜性の痛み",w:{stiff:3,desk:2,move:2,tender_point:2,sudden:1,lifting:1},
      tests:["押して痛い場所","体幹をひねる・反らすときの痛み"],care:"手技・鍼灸、姿勢の調整",ins:{ju:true,acu:false},note:"急な痛み（背部挫傷）は柔整の対象になりうる"},
    {id:"intercostal",region:"back",name:"肋間神経痛",w:{radiate:3,rotate:2,sudden:1,tender_point:1},
      tests:["肋骨に沿った痛みの範囲","深呼吸・咳で痛むか","帯状の発疹がないか（帯状疱疹）"],care:"発疹・胸の症状・発熱があれば医療機関へ。鍼灸の対象",ins:{ju:false,acu:true},note:"鍼灸保険：神経痛（同意書）"},
    // 腰
    {id:"acute_lbp",region:"low_back",name:"ぎっくり腰（急性腰痛）",w:{sudden:4,lifting:4,move:3,flex:2,numb:-2,chronic:-3},
      tests:["痛みの出る動き","SLRテスト（しびれ・脚の痛みがないか）","神経の症状の確認"],care:"急性期は無理のない範囲で動く・冷却。コルセット。回復に合わせて手技・運動",ins:{ju:true,acu:true},note:"柔整の保険：腰部捻挫。慢性化すれば鍼灸保険：腰痛症"},
    {id:"disc_hernia",region:"low_back",name:"腰椎椎間板ヘルニア",w:{radiate:4,numb:4,flex:3,sitting:2,age_young:1,age_mid:2,weakness:1},
      tests:["SLRテスト","FNSテスト（太ももの前の痛み）","腱反射・感覚・筋力の左右差"],care:"前かがみ・長く座るのを控える。力が入らない・排尿排便の異常は医療機関へ",ins:{ju:false,acu:true},note:"鍼灸保険：腰痛症・神経痛（同意書）"},
    {id:"stenosis",region:"low_back",name:"腰部脊柱管狭窄症",w:{walk_rest:5,numb:3,extend:3,age_old:3,radiate:2,flex:-2},
      tests:["ケンプテスト","歩ける距離","前かがみで楽になるか"],care:"反らす姿勢を避け、前かがみで楽な姿勢を。症状が強いときは医療機関へ",ins:{ju:false,acu:true},note:"鍼灸保険：腰痛症・神経痛（同意書）"},
    {id:"facet",region:"low_back",name:"椎間関節性の腰痛",w:{extend:4,rotate:2,morning_stiff:1,tender_point:1,radiate:-1},
      tests:["ケンプテスト","反らす・ひねるときの痛み"],care:"反らしすぎを避け、股関節・胸椎の動きを改善",ins:{ju:true,acu:true},note:""},
    {id:"si_joint",region:"low_back",name:"仙腸関節の痛み",w:{sitting:2,first_step:2,tender_point:2,pregnant:3,female:1,lifting:1},
      tests:["ワンフィンガーテスト（仙腸関節を指さすか）","パトリックテスト","ゲンスレンテスト"],care:"骨盤ベルト、骨盤まわりの手技・運動",ins:{ju:true,acu:true},note:""},
    {id:"chronic_lbp",region:"low_back",name:"慢性腰痛（筋・筋膜性）",w:{chronic:4,stiff:3,desk:2,sitting:1,sudden:-2,radiate:-1},
      tests:["姿勢・体の硬さ（前屈・股関節）","押して痛い筋"],care:"手技・鍼灸・EMS、体幹・股関節の運動、生活の指導",ins:{ju:false,acu:true},note:"鍼灸保険：腰痛症（同意書）。柔整の保険は慢性では対象外"},
    // 股関節・お尻
    {id:"hip_oa",region:"hip",name:"変形性股関節症",w:{first_step:3,stairs:2,age_old:2,female:2,gradual:2,move:1,click:1},
      tests:["パトリックテスト","股関節の動く範囲（特に内旋）","脚の長さの差"],care:"股関節まわりの筋力と動き、体重の管理。進行していれば整形外科へ",ins:{ju:false,acu:false},note:""},
    {id:"piriformis",region:"hip",name:"梨状筋症候群（お尻からのしびれ）",w:{sitting:3,radiate:3,numb:2,sports:1,tender_point:2},
      tests:["梨状筋の圧痛","フライバーグテスト","SLRとの比較（腰からかどうか）"],care:"お尻の筋をゆるめる手技・鍼灸、ストレッチ",ins:{ju:false,acu:true},note:"鍼灸保険：神経痛（坐骨神経痛）（同意書）"},
    // 膝
    {id:"knee_oa",region:"knee",name:"変形性膝関節症",w:{stairs:4,first_step:3,age_old:3,female:1,swelling:1,gradual:2,click:1},
      tests:["膝の曲げ伸ばしの範囲","関節の腫れ（水がたまっていないか）","O脚の程度"],care:"太ももの筋力、体重の管理、インソール。腫れ・熱が強いときは整形外科へ",ins:{ju:false,acu:false},note:"慢性は保険の対象外（自費）"},
    {id:"meniscus",region:"knee",name:"半月板損傷",w:{lock:4,trauma:2,rotate:2,sports:2,swelling:2,click:1},
      tests:["マックマリーテスト","アプレーテスト","膝のつまり・引っかかり"],care:"ロックする・腫れが続くときは整形外科（MRI）へ",ins:{ju:true,acu:false},note:"ひねって痛めた急性のものは柔整の対象になりうる"},
    {id:"knee_ligament",region:"knee",name:"膝の靭帯損傷（内側側副靭帯など）",w:{trauma:4,unstable:4,swelling:2,sports:2,sudden:1},
      tests:["外反ストレステスト","前方引き出しテスト・ラックマンテスト（前十字靭帯）"],care:"固定と冷却。ぐらつきが強い・腫れが強いときは整形外科へ",ins:{ju:true,acu:false},note:"柔整の保険：膝の捻挫"},
    {id:"pes",region:"knee",name:"鵞足炎（膝の内側の痛み）",w:{stairs:2,overuse:2,tender_point:3,sports:1,female:1},
      tests:["膝の内側やや下の圧痛"],care:"太もも裏・内側のストレッチ、使いすぎの調整",ins:{ju:true,acu:false},note:""},
    {id:"jumper",region:"knee",name:"膝蓋腱炎（ジャンパー膝）・オスグッド",w:{sports:3,overuse:3,age_young:3,stairs:1,tender_point:2},
      tests:["膝のお皿の下（膝蓋腱・すねの骨の出っ張り）の圧痛"],care:"太もも前のストレッチ、運動量の調整",ins:{ju:true,acu:false},note:""},
    // 足首・足
    {id:"ankle_sprain",region:"ankle",name:"足首の捻挫",w:{trauma:5,sudden:2,swelling:3,unstable:1,sports:1},
      tests:["押して痛い場所（オタワ基準：骨の痛み・4歩歩けない→骨折を疑いレントゲン）","前方引き出しテスト"],care:"固定・冷却・挙上。骨折の疑いがあれば整形外科へ",ins:{ju:true,acu:false},note:"柔整の保険：足関節捻挫"},
    {id:"plantar",region:"ankle",name:"足底腱膜炎（かかとの痛み）",w:{first_step:5,overuse:2,age_mid:1,sports:1,tender_point:2},
      tests:["かかとの内側前の圧痛","足指を反らすと痛むか"],care:"足裏・ふくらはぎのストレッチ、インソール",ins:{ju:false,acu:false},note:""},
    {id:"achilles",region:"ankle",name:"アキレス腱炎",w:{overuse:3,sports:3,first_step:2,tender_point:2,swelling:1},
      tests:["アキレス腱の圧痛・腫れ","トンプソンテスト（断裂していないか）"],care:"ふくらはぎのストレッチ、運動量の調整。急に切れた感じは整形外科へ",ins:{ju:true,acu:false},note:""},
    {id:"bunion",region:"ankle",name:"外反母趾・足の痛み（巻き爪を含む）",w:{female:2,gradual:2,walk_rest:-2,tender_point:1},
      tests:["足の形・靴の当たり","爪の巻き具合"],care:"インソール・靴の指導、巻き爪の施術",ins:{ju:false,acu:false},note:"自費（巻き爪施術・インソール）"},
    // 肘・手首・手
    {id:"tennis",region:"elbow_hand",name:"テニス肘（上腕骨外側上顆炎）",w:{grip:4,overuse:3,age_mid:2,tender_point:2},
      tests:["トムセンテスト","チェアテスト","肘の外側の圧痛"],care:"手首の使いすぎの調整、前腕のストレッチ、サポーター",ins:{ju:true,acu:false},note:""},
    {id:"dequervain",region:"elbow_hand",name:"腱鞘炎（ドケルバン病・手首の親指側）",w:{grip:3,overuse:3,female:2,pregnant:2,tender_point:2},
      tests:["フィンケルシュタインテスト"],care:"親指・手首の使いすぎの調整、固定",ins:{ju:true,acu:false},note:""},
    {id:"trigger",region:"elbow_hand",name:"ばね指",w:{lock:4,click:3,morning_stiff:2,female:1,age_mid:1},
      tests:["指の付け根の圧痛・引っかかり"],care:"使いすぎの調整。改善しなければ整形外科へ",ins:{ju:false,acu:false},note:""},
    {id:"carpal",region:"elbow_hand",name:"手根管症候群（手のしびれ）",w:{numb:4,night_ache:2,female:2,pregnant:2,grip:1},
      tests:["ファーレンテスト","ティネル徴候","親指〜薬指のしびれの範囲"],care:"手首の安静・装具。筋力が落ちている（親指の付け根がやせる）ときは整形外科へ",ins:{ju:false,acu:true},note:"鍼灸保険：神経痛（同意書）"},
    // 頭
    {id:"tension_ha",region:"head",name:"緊張型頭痛",w:{headache_band:5,stiff:3,desk:3,chronic:1,headache_pulse:-3},
      tests:["首・肩の筋緊張","頭痛の起こり方（毎日・夕方）"],care:"首肩の手技・鍼灸、姿勢の指導",ins:{ju:false,acu:false},note:"自費"},
    {id:"migraine",region:"head",name:"片頭痛（の可能性）",w:{headache_pulse:5,female:2,age_young:1,age_mid:1,headache_band:-2},
      tests:["頭痛の起こり方・前ぶれ（光が見える等）","吐き気・光や音がつらいか"],care:"発作中は暗い静かな場所で休む。初めての頭痛・いつもと違う頭痛は医療機関へ",ins:{ju:false,acu:false},note:"診断と薬は医療機関"},
  ];

  // ---- 計算 ----
  // sel：{region, factors:[id...], redFlags:[id...]}
  function evaluate(sel){
    const f=new Set((sel&&sel.factors)||[]);
    const rf=((sel&&sel.redFlags)||[]).map(id=>RED_FLAGS.find(x=>x.id===id)).filter(Boolean);
    const list=CONDITIONS.filter(c=>!sel||!sel.region||c.region===sel.region).map(c=>{
      let score=0,max=0; const hits=[], against=[];
      Object.entries(c.w).forEach(([k,w])=>{
        if(w>0) max+=w;
        if(f.has(k)){ score+=w; (w>0?hits:against).push(labelOf(k)); }
      });
      const pct=max>0?Math.max(0,Math.round(score/max*100)):0;
      return {...c,score,pct,hits,against};
    }).filter(c=>c.score>0).sort((a,b)=>b.score-a.score||b.pct-a.pct);
    const top=list.slice(0,4).map(c=>({...c,level:c.pct>=45?"高":c.pct>=25?"中":"低"}));
    // 保険の目安（上位の候補から）
    const juOk=top.some(c=>c.ins.ju)&&(f.has("sudden")||f.has("trauma")||f.has("lifting")||f.has("sleep")||f.has("traffic"))&&!f.has("chronic");
    const acuOk=top.some(c=>c.ins.acu);
    const insurance=[];
    if(f.has("traffic")) insurance.push("交通事故：自賠責保険の手続き。医療機関の受診と診断書も必要です");
    if(juOk) insurance.push("柔整の保険（健康保険）：急性・亜急性の外傷性（捻挫・挫傷など）で、原因がはっきりしていれば対象になりえます");
    else if(top.some(c=>c.ins.ju)) insurance.push("柔整の保険：いつ・どうして痛めたか（急性の外傷性か）を確認してください。慢性のこり・痛みは対象外です");
    if(acuOk) insurance.push("鍼灸の保険：神経痛・腰痛症・五十肩・頸腕症候群・頚椎捻挫後遺症などで、医師の同意書があれば対象になりえます（鍼灸保険の同意書の案内へ）");
    if(!insurance.length) insurance.push("保険の対象になりにくい内容です（自費の施術・EMS・ストレッチなど）");
    return {redFlags:rf,urgent:rf.length>0,candidates:top,insurance};
  }
  function labelOf(id){
    for(const g of FACTORS){ const it=g.items.find(x=>x.id===id); if(it) return it.label; }
    return id;
  }
  // 施術記録・メモに貼る用の文章
  function summaryText(sel,res){
    const reg=(REGIONS.find(r=>r.id===sel.region)||{}).label||"";
    const lines=[`【症状チェッカー】${reg}`];
    if((sel.factors||[]).length) lines.push("問診："+sel.factors.map(labelOf).join("・"));
    if(res.urgent) lines.push("⚠ 危険なサイン："+res.redFlags.map(x=>x.label).join("・")+" → 医療機関の受診を勧める");
    res.candidates.forEach((c,i)=>lines.push(`候補${i+1}：${c.name}（可能性 ${c.level}）／検査：${c.tests.join("、")}`));
    lines.push("保険の目安："+res.insurance.join(" ／ "));
    lines.push("※診断ではありません。最終判断は施術者が行います");
    return lines.join("\n");
  }

  // ===== 治療計画（候補をタップすると出す） =====
  // 状態の種類ごとのひな形（期間・頻度・施術・おうちでのケア）。年代・慢性かどうか・スポーツで期間と内容を調整する
  const PLAN_TYPE={
    neck_sprain:"acute",whiplash:"acute",acute_lbp:"acute",knee_ligament:"acute",ankle_sprain:"acute",meniscus:"acute",back_myofascial:"acute",
    cervical_radic:"nerve",tos:"nerve",disc_hernia:"nerve",stenosis:"nerve",piriformis:"nerve",carpal:"nerve",intercostal:"nerve",
    stiff_neck:"chronic",shoulder_stiff:"chronic",chronic_lbp:"chronic",tension_ha:"chronic",
    frozen:"joint",hip_oa:"joint",knee_oa:"joint",si_joint:"joint",facet:"joint",
    impinge:"tendon",rotator:"tendon",pes:"tendon",jumper:"tendon",plantar:"tendon",achilles:"tendon",tennis:"tendon",dequervain:"tendon",trigger:"tendon",
    bunion:"foot",migraine:"refer",
  };
  const PLAN_TEMPLATES={
    acute:{label:"急なけが・急な痛み",phases:[
      {name:"急性期（炎症をおさえる）",weeks:1,freq:"週3〜4回（できれば毎日）",goal:"痛みと炎症をおさえ、悪化させない",treat:["アイシング・冷却","痛みの少ない範囲の手技","テーピング・固定（必要なとき）","電気（物理療法）"],home:["痛む動きを避ける","冷やす（1回15分程度）","入浴は短めに"]},
      {name:"回復期（動きを取り戻す）",weeks:2,freq:"週2〜3回",goal:"動かせる範囲を広げ、日常の動作を楽にする",treat:["手技（筋・関節の動き）","鍼灸（痛み・筋緊張）","ストレッチ","温熱"],home:["痛みのない範囲で動かす","ストレッチを1日2回"]},
      {name:"再発予防期",weeks:3,freq:"週1〜2回",goal:"再発しない体づくり",treat:["体幹・まわりの筋力トレーニング","姿勢・動き方の指導","EMS"],home:["教えた運動を続ける","重い物の持ち方に気をつける"]},
    ]},
    nerve:{label:"神経の症状（しびれ・放散痛）",phases:[
      {name:"痛みをおさえる時期",weeks:2,freq:"週2〜3回",goal:"しびれ・痛みを落ち着かせる",treat:["鍼灸（神経に沿った痛み）","痛みの出ない姿勢での手技","物理療法"],home:["しびれが強くなる姿勢を避ける","長く同じ姿勢をとらない"]},
      {name:"改善期",weeks:4,freq:"週2回",goal:"神経への負担を減らす体の使い方にする",treat:["鍼灸","手技（筋・関節）","神経の滑走を助ける運動"],home:["教えたストレッチ・運動","休みながら歩く（狭窄症のとき）"]},
      {name:"安定期",weeks:6,freq:"週1回〜2週に1回",goal:"再発予防と体力づくり",treat:["体幹・股関節の運動","姿勢の指導","EMS"],home:["運動を続ける","症状が強くなったら早めに来院"]},
    ]},
    chronic:{label:"慢性のこり・痛み",phases:[
      {name:"集中期（こりをゆるめる）",weeks:2,freq:"週2回",goal:"たまった筋緊張をゆるめ、楽な状態を作る",treat:["手技（筋緊張をゆるめる）","鍼灸","温熱","EMS"],home:["1時間に1回は体を動かす","湯船につかる"]},
      {name:"改善期（姿勢を整える）",weeks:4,freq:"週1〜2回",goal:"こりにくい姿勢・体の使い方にする",treat:["骨格・姿勢の調整","ストレッチ指導","EMS（インナーマッスル）"],home:["デスク・スマホの姿勢を見直す","ストレッチを毎日"]},
      {name:"メンテナンス期",weeks:8,freq:"2週に1回〜月2回",goal:"よい状態を保つ",treat:["メンテナンスの手技・鍼灸","体の状態のチェック"],home:["運動・ストレッチの習慣"]},
    ]},
    joint:{label:"関節の痛み・動きにくさ",phases:[
      {name:"痛みをおさえる時期",weeks:2,freq:"週2〜3回",goal:"痛みを落ち着かせ、夜もよく眠れるように",treat:["痛みの少ない範囲の手技","鍼灸","温熱・物理療法"],home:["痛む動きを無理にしない","冷やす／温めるは状態に合わせて"]},
      {name:"可動域改善期",weeks:6,freq:"週2回",goal:"関節の動く範囲を広げる",treat:["関節の動きを出す手技","ストレッチ","まわりの筋の運動"],home:["毎日の関節体操","体重・負担の管理"]},
      {name:"筋力・維持期",weeks:8,freq:"週1回",goal:"関節を支える筋力と再発予防",treat:["筋力トレーニング・EMS","歩き方・動き方の指導"],home:["運動を続ける","インソール・サポーター（必要なとき）"]},
    ]},
    tendon:{label:"腱・付着部の使いすぎ",phases:[
      {name:"負担を減らす時期",weeks:2,freq:"週2〜3回",goal:"炎症をおさえ、使いすぎを止める",treat:["アイシング","テーピング・サポーター","手技・鍼灸","物理療法"],home:["痛む動作・練習量を減らす","冷やす"]},
      {name:"回復期",weeks:3,freq:"週2回",goal:"腱の柔らかさと動きを戻す",treat:["ストレッチ","手技・鍼灸","軽い負荷の運動"],home:["ストレッチを毎日","少しずつ使う量を戻す"]},
      {name:"復帰・予防期",weeks:4,freq:"週1回",goal:"スポーツ・仕事への復帰と再発予防",treat:["筋力トレーニング・EMS","フォーム・動き方の指導"],home:["準備運動・クールダウン","道具（靴・インソール）を見直す"]},
    ]},
    foot:{label:"足の形・爪",phases:[
      {name:"痛みをおさえる時期",weeks:2,freq:"週1〜2回",goal:"当たって痛いところを楽にする",treat:["巻き爪の施術（巻き爪のとき）","テーピング","足のまわりの手技"],home:["靴を見直す"]},
      {name:"改善期",weeks:6,freq:"2週に1回",goal:"足の使い方・形を整える",treat:["インソール","足指の運動の指導"],home:["足指の運動","合う靴・インソール"]},
    ]},
    refer:{label:"医療機関での診断が先",phases:[
      {name:"まず受診",weeks:0,freq:"—",goal:"医療機関で診断を受ける",treat:["医療機関の受診を勧める"],home:["発作中は暗い静かな場所で休む"]},
      {name:"受診のあと",weeks:6,freq:"週1回",goal:"首肩のこり・生活の調整で頭痛を起こしにくくする",treat:["首肩の手技・鍼灸","生活習慣の指導"],home:["睡眠・食事のリズム","頭痛日記をつける"]},
    ]},
  };
  function treatmentPlan(cond,sel){
    if(!cond) return null;
    const f=new Set((sel&&sel.factors)||[]);
    const type=PLAN_TYPE[cond.id]||"chronic";
    const tpl=PLAN_TEMPLATES[type];
    const urgent=((sel&&sel.redFlags)||[]).length>0;
    // 年代・慢性で期間を長めに
    let k=1; if(f.has("age_old")) k*=1.3; if(f.has("chronic")&&type!=="chronic") k*=1.2;
    let phases=tpl.phases.map(p=>({...p,weeks:p.weeks?Math.max(1,Math.round(p.weeks*k)):0,treat:[...p.treat],home:[...p.home]}));
    // すでに慢性なら急性期を飛ばす
    if(f.has("chronic")&&(type==="acute"||type==="tendon")) phases=phases.slice(1);
    if(f.has("sports")) phases[phases.length-1].treat.push("競技に合わせた動き・復帰の段階づけ");
    if(f.has("pregnant")) phases.forEach(p=>{ p.treat=p.treat.filter(t=>!/EMS|電気|物理療法/.test(t)); p.treat.push("妊娠中・産後に合わせた姿勢での施術（電気・EMSは使わない）"); });
    // この状態ならではの内容を最初の時期に足す
    phases[0].treat.push("この状態の施術："+cond.care);
    const totalWeeks=phases.reduce((t,p)=>t+p.weeks,0);
    const visits=phases.reduce((t,p)=>t+p.weeks*freqPerWeek(p.freq),0);
    // おすすめのプラン（院のメニュー）
    const menus=[];
    if(urgent) menus.push({name:"まず医療機関の受診",why:"危険なサインがあるため、施術の前に診断を受けてもらう"});
    if(cond.ins&&cond.ins.ju&&(f.has("sudden")||f.has("trauma")||f.has("lifting")||f.has("sleep"))&&!f.has("chronic")) menus.push({name:"柔整（健康保険）",why:"急性の外傷性の痛み（捻挫・挫傷）として"});
    if(cond.ins&&cond.ins.acu) menus.push({name:"鍼灸（鍼灸保険）",why:"医師の同意書があれば保険で鍼灸（同意書の案内を）"});
    if(f.has("traffic")) menus.push({name:"交通事故（自賠責）",why:"自己負担なしで施術できることが多い（医療機関の受診と手続きが必要）"});
    const early=phases[0]?freqPerWeek(phases[0].freq):1;
    if(early>=2&&totalWeeks>=3) menus.push({name:totalWeeks>=8?"フリーパス 3ヶ月":"フリーパス 1ヶ月",why:`最初の${phases[0].weeks}週は週${phases[0].freq.replace(/^週/,"")}通うのがおすすめのため、通い放題がお得`});
    else menus.push({name:visits>12?"回数券 24回":"回数券 10回",why:`全体で${Math.round(visits)}回ほどの通院の目安`});
    if(["chronic","joint","nerve"].includes(type)) menus.push({name:"EMS（インナーマッスル）",why:"姿勢を支える筋力をつけ、再発を防ぐ"});
    if(cond.id==="bunion") menus.push({name:"巻き爪の施術・インソール",why:"足の痛みのもとに直接アプローチ"});
    const explain=`今の状態は「${cond.name.replace(/（.*）$/,"")}」が考えられます。まず${phases[0]?phases[0].goal:""}ことを目標に、${phases[0]?phases[0].freq:""}の通院をおすすめします。全体ではおよそ${totalWeeks}週間（${Math.round(visits)}回ほど）が目安です。おうちでは${phases[0]&&phases[0].home[0]?phases[0].home[0]:"無理をしない"}ようにしてください。`;
    return {type,typeLabel:tpl.label,urgent,phases,totalWeeks,visits:Math.round(visits),menus,explain};
  }
  // 「週2〜3回」→2.5、「2週に1回」→0.5、「月2回」→0.5
  function freqPerWeek(freq){
    const s=String(freq||"");
    let m=s.match(/週(\d+)〜(\d+)回/); if(m) return (Number(m[1])+Number(m[2]))/2;
    m=s.match(/週(\d+)回/); if(m) return Number(m[1]);
    m=s.match(/(\d+)週に(\d+)回/); if(m) return Number(m[2])/Number(m[1]);
    m=s.match(/月(\d+)回/); if(m) return Number(m[1])/4.3;
    return 0;
  }
  function planText(cond,plan){
    if(!cond||!plan) return "";
    const L=[`【治療計画】${cond.name}（${plan.typeLabel}）`,`目安：およそ${plan.totalWeeks}週間・${plan.visits}回`];
    if(plan.urgent) L.push("⚠ 危険なサインがあるため、まず医療機関の受診を勧める");
    plan.phases.forEach((p,i)=>{ L.push(`${i+1}. ${p.name}${p.weeks?`（${p.weeks}週・${p.freq}）`:""}：${p.goal}`); L.push(`   施術：${p.treat.join("、")}`); L.push(`   おうちで：${p.home.join("、")}`); });
    L.push("おすすめのプラン："+plan.menus.map(m=>m.name).join("・"));
    L.push("患者さんへの説明："+plan.explain);
    return L.join("\n");
  }
  const api={REGIONS,FACTORS,RED_FLAGS,RED_FLAG_ADVICE,CONDITIONS,evaluate,labelOf,summaryText,PLAN_TYPE,PLAN_TEMPLATES,treatmentPlan,freqPerWeek,planText};
  root.SymptomLogic=api;
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
