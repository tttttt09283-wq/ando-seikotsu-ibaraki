// あんど整骨院 マニュアル（理念「心豊笑幸」・クラス別の会社方針・新人／育成カリキュラム・評価基準との対応）
//
// ・クラスは 新人(G1)・一般スタッフ(G2)・副院長(G3)・院長(G4)・BM(G5)・GM(G6)。「共通」は全員共通
// ・マニュアルの各項目は「区分」（理念・使命・方針・施術者・社会人）と「定量／定性」を持ち、
//   月次評価の項目（評価項目シートの項目ID）と紐づけると「評価対象」として目標値つきで表示する
// ・内容は台帳の「マニュアル」「育成カリキュラム」シートに保存（無ければ下の初期値）。社長・GMが画面から編集できる
// ・カリキュラムの進み具合は「カリキュラム進捗」、マニュアルを読んだ記録は「マニュアル確認」シート
import { normName } from "./incentive-calc.js";
import { gradeRank } from "./evaluation.js";

export const COMMON = "共通";
export const MANUAL_GRADES = ["G1", "G2", "G3", "G4", "G5", "G6"];
export const MANUAL_GRADE_LABELS = { [COMMON]: "全クラス共通", G1: "新人", G2: "一般スタッフ", G3: "副院長", G4: "院長", G5: "BM", G6: "GM" };
export const AREAS = ["理念", "使命", "方針", "施術者", "社会人"];
export const MEASURES = ["定量", "定性"];
export const RINEN = ["心", "豊", "笑", "幸"];
export const STEP_STATUSES = ["練習中", "合格"];
// カリキュラムの合格をつけられるクラス（同じ院の、自分より下のクラスの人に）
export const CHECKER_GRADES = ["G3", "S1", "G4", "S2", "G5", "S3", "G6"];

export const MANUAL_SHEET = "マニュアル";
export const MANUAL_HEADER = ["クラス", "区分", "定量/定性", "理念", "項目ID", "タイトル", "内容・基準", "評価項目ID", "並び順", "更新者", "更新日時"];
export const CURRICULUM_SHEET = "育成カリキュラム";
export const CURRICULUM_HEADER = ["クラス", "時期", "区分", "ステップID", "内容", "合格基準", "確認者", "並び順", "更新者", "更新日時"];
export const PROGRESS_SHEET = "カリキュラム進捗";
export const PROGRESS_HEADER = ["氏名key", "氏名", "ステップID", "状態", "確認者", "更新日時", "メモ"];
export const READ_SHEET = "マニュアル確認";
export const READ_HEADER = ["氏名key", "氏名", "クラス", "確認日時"];

// ===== 初期値 =====
let seq = 0;
const M = (grade, area, measure, rinen, id, title, body, evalId = "") => ({ grade, area, measure, rinen, id, title, body, evalId, order: ++seq, by: "", at: "" });

export const DEFAULT_MANUAL = [
  // ---- 理念 ----
  M(COMMON, "理念", "", "", "rinen_statement", "企業理念（心豊笑幸）", "私たちは、会社に関わる全ての人を、物心共に豊かに笑顔で幸せにすることを追求します。"),
  M(COMMON, "理念", "", "", "treat_statement", "施術理念", "私たちは、No.1の技術と接遇で、共に悩みに向き合い、トータルサポートを提供することで、地域の方々の健康で明るく楽しい生活づくりに貢献します。"),
  M(COMMON, "理念", "", "心", "rinen_shin", "心 ― 心を込めて向き合う", "来院される一人ひとりの痛みや不安に、心を込めて向き合います。仲間に対しても同じです。思いやりと感謝の気持ちが、すべての仕事の出発点です。"),
  M(COMMON, "理念", "", "豊", "rinen_hou", "豊 ― 物心ともに豊かになる", "技術と人間性を磨き続けることで、患者様の人生を豊かにし、私たち自身も物（給与・賞与・キャリア）と心（やりがい・成長・仲間）の両面で豊かになります。"),
  M(COMMON, "理念", "", "笑", "rinen_shou", "笑 ― 笑顔があふれる院をつくる", "患者様が笑顔で帰り、スタッフが笑顔で働ける院をつくります。明るい挨拶、きれいな院、チームワークが笑顔を生みます。"),
  M(COMMON, "理念", "", "幸", "rinen_kou", "幸 ― 関わる全ての人を幸せに", "患者様・スタッフ・その家族・地域・取引先など、会社に関わる全ての人が物心ともに幸せになることが、あんど整骨院の目的です。"),
  // ---- 全社共通の方針 ----
  M(COMMON, "方針", "", "心", "c_pol_patient", "患者様第一", "痛みを取るだけでなく、再発しない体づくりまで責任を持ちます。患者様にとって一番良いことは何かを、常に判断の基準にします。"),
  M(COMMON, "方針", "", "笑", "c_pol_team", "チームで成果を出す", "個人の成果は院の成果、院の成果は会社の成果です。技術・情報・成功事例を出し惜しみせず共有し、全員で成長します。"),
  M(COMMON, "方針", "", "幸", "c_pol_return", "成果は全員に還元する", "会社の成長は、給与・賞与・インセンティブ・新しい役職や店舗として、頑張った人に公平に還元します（人件費42%の枠組み）。評価は全員に公開された基準で行います。"),
  M(COMMON, "方針", "", "豊", "c_pol_growth", "クラスに応じた役割を果たす", "新人・一般スタッフ・副院長・院長・BM・GMそれぞれに会社としての役割があります。今のクラスの役割を果たし、次のクラスの基準を目指して成長します。"),
  // ---- 全社共通：社会人として（月次評価の「基本」） ----
  M(COMMON, "社会人", "定性", "笑", "c_greeting", "挨拶・言葉遣い", "来院時は目を見て名前を添えて挨拶し、お帰りは次回の来院日を伝えてお見送りします。誰かが挨拶したら全員で繰り返します（詳しくは行動マニュアル「挨拶・笑顔」）。", "basic_greeting"),
  M(COMMON, "社会人", "定性", "心", "c_appearance", "身だしなみ・清潔感", "制服は清潔に、インナーは白か黒の無地、黒ズボンは無地。髪・爪・匂いに気を配ります（詳しくは行動マニュアル「身だしなみ」）。", "basic_appearance"),
  M(COMMON, "社会人", "定性", "心", "c_punctual", "時間厳守・無遅刻無欠勤", "朝礼が始まるまでに着替えを済ませ、タイムカードで出勤を記録します。遅刻・欠席・早退は、分かった時点で本人が院長・社長に電話で連絡します。", "basic_punctual"),
  M(COMMON, "社会人", "定性", "笑", "c_hourensou", "報連相", "報告は結論から。悪い報告ほど早く。迷ったら相談。決められた相手に、決められたタイミングで行います。", "basic_hourensou"),
  M(COMMON, "社会人", "定性", "豊", "c_rules", "約束・期限・ルールを守る", "提出物の期限、患者様との約束、院のルール・整理整頓を守ります。守れないときは事前に相談します。", "basic_rules"),
  M(COMMON, "社会人", "定性", "心", "c_privacy", "個人情報・守秘義務", "カルテや患者様の情報を院外に持ち出さず、SNSにも書きません。院の数字や給与の情報も外に出しません。"),
  // ---- 全社共通：施術者として ----
  M(COMMON, "施術者", "定性", "心", "c_consent", "説明と同意", "施術前に、内容・目的・料金・通院の目安を説明し、同意を得てから始めます。保険と自費の違いを正しく伝えます。"),
  M(COMMON, "施術者", "定性", "笑", "c_hygiene", "衛生管理", "施術前後の手指消毒、フェイスペーパー・タオルの交換、ベッドの清拭を必ず行います。"),
  M(COMMON, "施術者", "定性", "豊", "c_study", "技術の研鑽", "院内練習・勉強会に参加し、学んだことを院内で共有します。"),

  // ===== G1 新人 =====
  M("G1", "使命", "", "心", "g1_mission", "基本を身につけ、安心して任せてもらえる施術者になる", "素直に学び、挨拶・身だしなみ・時間厳守といった社会人の基本と、施術の基本を最短で身につけます。"),
  M("G1", "方針", "", "豊", "g1_pol_curriculum", "カリキュラムを計画どおりに進める", "新人カリキュラムの各ステップを期日までに合格します。わからないことはその日のうちに質問します。"),
  M("G1", "方針", "", "心", "g1_pol_coachable", "指導を素直に受け入れる", "指導されたことはメモを取り、次の施術から実践します。同じ指摘を2回受けないことを目標にします。"),
  M("G1", "施術者", "定量", "心", "g1_on_time", "施術枠内時間の遵守", "決められた施術時間内で施術を終えます。目標：遵守率90%以上。", "on_time"),
  M("G1", "施術者", "定量", "幸", "g1_new_close", "新規の初回成約", "担当した新患のうち自費につながった割合。目標：月3名以上を担当し、成約率50%以上。", "new_close"),
  M("G1", "施術者", "定量", "心", "g1_patient_care", "患者対応チェック", "患者対応評価シートの○×チェックの実施率。目標：80%以上。", "patient_care"),
  M("G1", "施術者", "定量", "豊", "g1_sales", "個人売上", "窓口実績＋保険請求。目標は評価項目のとおり。", "personal_sales"),
  M("G1", "施術者", "定量", "幸", "g1_new_count", "新患対応数", "初回施術を担当した新患の人数。目標：月3名以上。", "new_count"),
  M("G1", "施術者", "定量", "豊", "g1_new_sales", "初回売上", "担当した新患の初回窓口金額＋成約金額。", "new_sales"),
  M("G1", "施術者", "定量", "豊", "g1_retail", "物販売上", "症状に合った物販（インソール・サポーター等）を提案し、販売した売上。", "retail_sales"),
  M("G1", "施術者", "定性", "豊", "g1_skill_check", "社内実技チェック", "研修・実技チェックを計画どおりに合格しているか（カリキュラムの進み具合で確認）。", "skill_check"),
  M("G1", "社会人", "定量", "笑", "g1_reviews", "口コミ獲得", "満足していただいた患者様に口コミをお願いします。目標：月1件以上。", "reviews"),
  M("G1", "社会人", "定性", "心", "g1_coachable", "指導の受け入れ・改善", "指導を素直に受け止め、次回までに改善できているか。", "coachable"),
  M("G1", "社会人", "定性", "笑", "g1_cleanliness", "院内美化", "ベッド・待合室・トイレの清掃と整頓を、言われる前に行います。", "cleanliness"),
  M("G1", "社会人", "定性", "幸", "g1_philosophy", "理念の理解・体現", "「心豊笑幸」を自分の言葉で説明でき、患者様対応で実践しているか。", "philosophy"),
  M("G1", "社会人", "定性", "豊", "g1_pc", "PCスキル", "予約システムの操作・カルテ入力を一人でできる。", "pc"),

  // ===== G2 一般スタッフ =====
  M("G2", "使命", "", "幸", "g2_mission", "自立した施術者として、患者様の改善と院の売上に責任を持つ", "一人で施術を完結し、患者様が改善するまで通院を支えます。自分の数字（売上・継続率・成約率）に責任を持ちます。"),
  M("G2", "方針", "", "心", "g2_pol_plan", "通院計画を必ず説明する", "症状と通院頻度を結びつけて、次回の来院時期を毎回説明します（平均通院6回を目指す）。"),
  M("G2", "方針", "", "笑", "g2_pol_support", "後輩を支える", "新人の質問に答え、練習相手になります。自分が学んだことをチームに返します。"),
  M("G2", "施術者", "定量", "豊", "g2_sales", "個人売上", "窓口実績＋保険請求。目標：70万円以上。", "personal_sales"),
  M("G2", "施術者", "定量", "心", "g2_continue", "継続率（初回の通院率）", "担当した新患が通院につながった割合。目標：75%以上。", "continue_rate"),
  M("G2", "施術者", "定量", "幸", "g2_new_close", "新規の初回成約", "目標：月5〜6名以上を担当し、成約率60%以上。", "new_close"),
  M("G2", "施術者", "定量", "豊", "g2_new_sales", "初回売上", "担当した新患の初回窓口金額＋成約金額。", "new_sales"),
  M("G2", "施術者", "定量", "心", "g2_patient_care", "患者対応チェック", "目標：実施率85%以上。", "patient_care"),
  M("G2", "施術者", "定量", "幸", "g2_new_count", "新患対応数", "初回施術を担当した新患の人数。目標：月6名以上。", "new_count"),
  M("G2", "施術者", "定量", "豊", "g2_retail", "物販売上", "症状に合った物販を提案し、販売した売上。目標：2万円以上。", "retail_sales"),
  M("G2", "施術者", "定性", "豊", "g2_technique", "基本手技の単独完結", "基本手技を一人で最後まで、同じ品質でできる。", "technique"),
  M("G2", "施術者", "定性", "幸", "g2_self_pay", "自費メニューの提案", "症状に合わせて自費メニューを提案し、定着させているか。", "self_pay"),
  M("G2", "社会人", "定量", "笑", "g2_reviews", "口コミ獲得", "目標：月3件以上。", "reviews"),
  M("G2", "社会人", "定性", "笑", "g2_cleanliness", "院内美化", "清掃・整頓を自分から行っているか。", "cleanliness"),
  M("G2", "社会人", "定性", "幸", "g2_philosophy", "理念の理解・体現", "理念に沿った患者対応ができているか。", "philosophy"),
  M("G2", "社会人", "定性", "豊", "g2_pc", "PCスキル", "予約・カルテ・日計表を正確に入力できる。", "pc"),

  // ===== G3 副院長 =====
  M("G3", "使命", "", "笑", "g3_mission", "院長の右腕として院を支え、新人を一人前に育てる", "トップクラスの施術者として結果を出しながら、院長不在時は院の責任者を務め、新人の実技メンターとして育成に責任を持ちます。"),
  M("G3", "方針", "", "心", "g3_pol_model", "院の手本になる", "施術・接遇・身だしなみ・時間の使い方のすべてで、スタッフの手本になります。"),
  M("G3", "方針", "", "豊", "g3_pol_mentor", "新人を計画的に育てる", "担当する新人のカリキュラムを毎週確認し、合格の判定を行います。"),
  M("G3", "施術者", "定量", "豊", "g3_sales", "個人売上", "目標：100万円以上を3ヶ月連続。", "personal_sales"),
  M("G3", "施術者", "定量", "幸", "g3_new_close", "新規の初回成約", "目標：成約率70%以上・初回売上15万円以上。", "new_close"),
  M("G3", "施術者", "定量", "豊", "g3_new_sales", "初回売上", "目標：15万円以上。", "new_sales"),
  M("G3", "施術者", "定量", "心", "g3_continue", "継続率（初回の通院率）", "目標：75%以上。", "continue_rate"),
  M("G3", "施術者", "定量", "心", "g3_patient_care", "患者対応チェック", "目標：実施率90%以上。", "patient_care"),
  M("G3", "施術者", "定量", "幸", "g3_avg_visits", "院の平均通院回数（6回への指導）", "院の患者様の平均通院回数が6回になるよう、通院計画の説明を指導します。", "avg_visits"),
  M("G3", "施術者", "定量", "幸", "g3_new_count", "新患対応数", "初回施術を担当した新患の人数。目標：月8名以上。", "new_count"),
  M("G3", "施術者", "定量", "豊", "g3_retail", "物販売上", "目標：3万円以上。後輩の手本となる提案をします。", "retail_sales"),
  M("G3", "施術者", "定性", "豊", "g3_full_menu", "自費フルメニュー・問診成約", "自費メニューを全て施術でき、問診からの成約率が高いか。", "full_menu"),
  M("G3", "社会人", "定量", "笑", "g3_reviews", "口コミ獲得", "目標：月3件以上。", "reviews"),
  M("G3", "社会人", "定性", "笑", "g3_acting", "院長不在時の代行業務", "受付・スタッフ配置・トラブル対応を任せられるか。", "acting_manager"),
  M("G3", "社会人", "定性", "心", "g3_mentor", "新人の実技メンター", "新人1名の実技指導を計画的に行っているか。", "mentor"),
  M("G3", "社会人", "定性", "豊", "g3_pc", "PCスキル", "日計表・売上集計をスプレッドシートで作成・更新できる。", "pc"),

  // ===== G4 院長 =====
  M("G4", "使命", "", "幸", "g4_mission", "院の経営者として、患者様・スタッフ・数字の全てに責任を持つ", "院の売上予算と人件費率を守り、スタッフ全員が成長できる院をつくります。院の成果をスタッフに還元するのが院長の仕事です。"),
  M("G4", "方針", "", "豊", "g4_pol_numbers", "数字で院を動かす", "毎週、売上・予約・新患・継続率を確認し、予実の差に対して具体的な対策を決めてチームに共有します。"),
  M("G4", "方針", "", "心", "g4_pol_people", "一人ひとりと向き合う", "スタッフ全員と月1回の面談を行い、目標・課題・キャリアの希望を確認します。"),
  M("G4", "施術者", "定量", "幸", "g4_new_count", "新患対応数", "院長自身が初回施術を担当した新患の人数。目標：月10名以上。", "new_count"),
  M("G4", "施術者", "定量", "豊", "g4_new_sales", "初回売上", "目標：20万円以上。", "new_sales"),
  M("G4", "施術者", "定量", "幸", "g4_new_close", "新規の初回成約", "目標：成約率70%以上・新規売上20万円以上。", "new_close"),
  M("G4", "施術者", "定量", "心", "g4_clinic_continue", "自院の継続率", "自院の新患のうち通院につながった割合。目標：75%以上。", "clinic_continue_rate"),
  M("G4", "施術者", "定量", "心", "g4_clinic_care", "自院スタッフの患者対応チェック", "自院の患者対応チェック実施率の平均。目標：85%以上。", "clinic_patient_care"),
  M("G4", "施術者", "定量", "幸", "g4_avg_visits", "院の平均通院回数", "目標：6回。", "avg_visits"),
  M("G4", "社会人", "定量", "豊", "g4_budget", "自院 売上予算達成率", "目標：100%以上。", "clinic_budget"),
  M("G4", "社会人", "定量", "幸", "g4_labor", "自院 人件費率", "目標：42%以下（成果を全員に還元するための基準）。", "clinic_labor"),
  M("G4", "社会人", "定量", "豊", "g4_retail", "自院の物販売上", "院全体の物販売上。", "clinic_retail_sales"),
  M("G4", "社会人", "定性", "豊", "g4_pl", "店舗PL管理・予実管理", "売上・経費・人件費の予実を毎月把握し対策を打てているか。", "pl"),
  M("G4", "社会人", "定性", "幸", "g4_shift", "シフト管理", "売上に合わせた人員配置ができているか。", "shift"),
  M("G4", "社会人", "定性", "心", "g4_claim", "クレームの一次完結", "クレームを院内で解決し、再発防止策を共有できているか。", "claim"),
  M("G4", "社会人", "定性", "笑", "g4_develop", "部下育成", "月1回の面談と技術指導を行っているか。", "develop"),
  M("G4", "社会人", "定性", "豊", "g4_pc", "PC業務（必須）", "PL・シフト・予実表をスプレッドシートで自分で作成・更新できる。", "pc"),

  // ===== G5 BM =====
  M("G5", "使命", "", "幸", "g5_mission", "複数の院を束ね、院長を育て、エリアを成長させる", "管轄する院の予算と人件費率に責任を持ち、院長が自分で院を経営できるように育てます。"),
  M("G5", "方針", "", "豊", "g5_pol_review", "院長の予実を毎月レビューする", "管轄院の予実を毎月院長と一緒に確認し、改善策を決めます。"),
  M("G5", "方針", "", "笑", "g5_pol_retention", "辞めない組織をつくる", "スタッフの声を拾い、離職の兆しには早めに手を打ちます。採用面接を行い、必要な人員を計画的に確保します。"),
  M("G5", "施術者", "定量", "幸", "g5_new_close", "エリアの初回成約率", "目標：80%以上。", "new_close"),
  M("G5", "施術者", "定性", "豊", "g5_tech_review", "技術審査・難治症状の指導", "全社の技術審査員として指導できているか。", "tech_review"),
  M("G5", "社会人", "定量", "豊", "g5_budget", "ブロック 売上予算達成率", "目標：100%以上。", "block_budget"),
  M("G5", "社会人", "定量", "幸", "g5_labor", "ブロック 人件費率", "目標：42%以下。", "block_labor"),
  M("G5", "社会人", "定量", "笑", "g5_turnover", "エリア離職率", "目標：10%以下。", "turnover"),
  M("G5", "社会人", "定性", "笑", "g5_hiring", "採用面接・人員計画", "採用面接を行い、必要人員を計画的に確保できているか。", "hiring"),
  M("G5", "社会人", "定性", "豊", "g5_coaching", "院長への予実管理指導", "担当院長の予実管理を毎月レビューしているか。", "coaching"),
  M("G5", "社会人", "定性", "豊", "g5_pc", "PC業務（必須）", "エリアの予実・人件費データを分析し、資料にまとめられる。", "pc"),

  // ===== G6 GM =====
  M("G6", "使命", "", "幸", "g6_mission", "会社の方向を示し、次のリーダーを育て、会社の成長を全員の幸せに変える", "全社の予算・利益に責任を持ち、理念「心豊笑幸」が全ての院で実践される仕組みをつくります。"),
  M("G6", "方針", "", "豊", "g6_pol_standard", "マニュアルと評価基準を育てる", "このマニュアルと評価項目を毎期見直し、全社の基準として浸透させます。"),
  M("G6", "方針", "", "幸", "g6_pol_post", "成長のポストをつくる", "出店・新業態でポストをつくり、頑張った人がキャリアアップできる会社にします。"),
  M("G6", "施術者", "定性", "豊", "g6_standardize", "技術開発・標準化", "全社の技術を標準化し、マニュアル化しているか。", "standardize"),
  M("G6", "社会人", "定量", "豊", "g6_budget", "全社 売上予算達成率", "目標：100%以上。", "company_budget"),
  M("G6", "社会人", "定量", "幸", "g6_labor", "全社 人件費率", "目標：42%以下。", "company_labor"),
  M("G6", "社会人", "定量", "豊", "g6_profit", "全社 営業利益達成率", "目標：95%以上。", "profit_rate"),
  M("G6", "社会人", "定性", "笑", "g6_leaders", "BM・院長の育成", "次期BM・院長を計画的に育成しているか（年2名）。", "develop_leaders"),
  M("G6", "社会人", "定性", "幸", "g6_strategy", "出店戦略・新業態", "出店・新業態の計画を進めているか。", "strategy"),
  M("G6", "社会人", "定性", "豊", "g6_pc", "PC業務（必須）", "全社KPIダッシュボード・経営資料を作成し、会議を運営できる。", "pc"),
];

let sseq = 0;
const S = (grade, phase, area, id, title, criterion, checker) => ({ grade, phase, area, id, title, criterion, checker, order: ++sseq, by: "", at: "" });
export const DEFAULT_CURRICULUM = [
  // ===== 新人カリキュラム（G1） =====
  S("G1", "入社前", "社会人", "n_rinen", "理念「心豊笑幸」・施術理念とマニュアル（共通・新人）を読む", "マニュアル画面で「読みました」を押し、理念の筆記テスト・唱和テストに合格する", "院長"),
  S("G1", "入社前", "社会人", "n_behavior", "スタッフ行動マニュアルを読む", "行動マニュアルの「読みました」を押し、挨拶・身だしなみ・掃除・朝礼のルールを説明できる", "院長"),
  S("G1", "入社前", "社会人", "n_brother", "ブラザー（担当の先輩）と顔合わせ", "ブラザー制度の説明を受け、困ったこと・相談・練習の相手を確認する", "院長"),
  S("G1", "入社前", "社会人", "n_rules", "就業規則・服務規程の説明を受ける", "勤怠・休暇・身だしなみ・守秘義務のルールを説明できる", "院長"),
  S("G1", "1週目", "社会人", "n_greeting", "挨拶・電話応対・受付の流れ", "ロールプレイで、電話（3コール以内）・受付〜会計（両手で受け渡し）〜次回予約までを一人でできる", "副院長"),
  S("G1", "1週目", "社会人", "n_open_close", "開店・閉店作業と院内清掃", "朝礼後15分の清掃・ごみ捨て・トイレ掃除・レジ締め（二人体制）を一人で回せる", "副院長"),
  S("G1", "1週目", "施術者", "n_hygiene", "衛生管理", "手指消毒・リネン交換・ベッド清拭を毎回できている", "副院長"),
  S("G1", "1週目", "社会人", "n_pc", "予約システム・カルテ入力", "予約の登録・変更、カルテ入力を一人で正確にできる", "副院長"),
  S("G1", "1ヶ月", "施術者", "n_exam", "問診・検査の流れ", "院長の前で問診〜検査〜説明を実演して合格", "院長"),
  S("G1", "1ヶ月", "施術者", "n_tech1", "基本手技①（部位別）", "社内実技チェック（部位別）に合格", "副院長"),
  S("G1", "1ヶ月", "施術者", "n_insurance", "保険施術の範囲と説明", "保険の対象・対象外を正しく説明できる", "院長"),
  S("G1", "1ヶ月", "社会人", "n_hourensou", "報連相・日報", "日報を毎日提出し、報告を結論から伝えられる", "院長"),
  S("G1", "3ヶ月", "施術者", "n_tech2", "基本手技②（全身）", "社内実技チェック（全身）に合格", "院長"),
  S("G1", "3ヶ月", "施術者", "n_on_time", "施術時間の管理", "施術枠内時間の遵守率90%以上を1ヶ月続ける", "院長"),
  S("G1", "3ヶ月", "施術者", "n_plan", "通院計画の説明", "症状と通院頻度を結びつけた説明をロールプレイで合格", "副院長"),
  S("G1", "3ヶ月", "施術者", "n_selfpay", "自費メニューの説明", "自費メニューの目的・効果・料金をロールプレイで説明できる", "副院長"),
  S("G1", "3ヶ月", "施術者", "n_debut", "新患の初回担当デビュー", "院長の同席のもと、新患の初回施術を担当する", "院長"),
  S("G1", "6ヶ月", "施術者", "n_close50", "新規成約率50%", "月3名以上の新患を担当し、成約率50%以上", "院長"),
  S("G1", "6ヶ月", "施術者", "n_care80", "患者対応チェック80%", "患者対応評価シートの実施率80%以上", "院長"),
  S("G1", "6ヶ月", "社会人", "n_review", "口コミ獲得", "月1件以上の口コミをいただく", "院長"),
  S("G1", "6ヶ月", "社会人", "n_promotion", "G2昇格面談", "院長・BMとの面談で、半年の振り返りと次の目標を決める", "BM"),
  // ===== 次のクラスへの育成ステップ =====
  S("G2", "副院長を目指す", "施術者", "g2_fullmenu", "自費フルメニューの習得", "全ての自費メニューを施術でき、社内チェックに合格", "院長"),
  S("G2", "副院長を目指す", "施術者", "g2_counsel", "問診からの成約ロールプレイ", "ロールプレイで成約までの流れを合格", "院長"),
  S("G2", "副院長を目指す", "社会人", "g2_teach", "新人の練習相手", "新人の実技練習に月4回以上付き合う", "副院長"),
  S("G3", "院長を目指す", "社会人", "g3_acting", "院長代行の実践", "院長不在日の運営を問題なく行う（3回以上）", "院長"),
  S("G3", "院長を目指す", "社会人", "g3_numbers", "日計表・予実の読み方", "院の予実表を読み、対策を院長に提案できる", "院長"),
  S("G3", "院長を目指す", "社会人", "g3_mentor", "新人1名を育てる", "担当新人のカリキュラムを3ヶ月分すべて合格させる", "院長"),
  S("G4", "BMを目指す", "社会人", "g4_pl", "PL・シフトの自走", "PL・シフト・予実表を自分で作り、毎月の会議で報告できる", "BM"),
  S("G4", "BMを目指す", "社会人", "g4_successor", "後任の育成", "副院長を院長候補に育てる", "BM"),
  S("G4", "BMを目指す", "社会人", "g4_hiring", "採用面接への同席", "採用面接に3回以上同席し、評価をまとめる", "BM"),
  S("G5", "GMを目指す", "社会人", "g5_area_plan", "エリア計画の作成", "管轄エリアの年間予算・人員計画を作成し、GMに提案する", "GM"),
  S("G5", "GMを目指す", "施術者", "g5_training", "全社研修の講師", "全社研修の講師を務める", "GM"),
  S("G6", "会社をつくる", "社会人", "g6_review", "マニュアル・評価基準の見直し", "半期に1回、マニュアルと評価項目を見直して更新する", "社長"),
];

// ===== シート ⇔ データ =====
const str = (v) => String(v ?? "").trim();
const cleanText = (v, max) => String(v ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
const headIndex = (rows, header) => {
  const head = (rows[0] || []).map(normName);
  return Object.fromEntries(header.map((h) => [h, head.indexOf(normName(h))]));
};
const cell = (r, c, h) => (c[h] >= 0 ? r[c[h]] : "");

export function parseManual(rows) {
  if (!rows || rows.length < 2) return null;
  const c = headIndex(rows, MANUAL_HEADER);
  const out = [];
  rows.slice(1).forEach((r, i) => {
    const id = str(cell(r, c, "項目ID"));
    const grade = str(cell(r, c, "クラス"));
    if (!id || !(grade === COMMON || MANUAL_GRADES.includes(grade))) return;
    const area = str(cell(r, c, "区分"));
    const measure = str(cell(r, c, "定量/定性"));
    const rinen = str(cell(r, c, "理念"));
    const order = Number(cell(r, c, "並び順"));
    out.push({
      grade, area: AREAS.includes(area) ? area : "方針", measure: MEASURES.includes(measure) ? measure : "",
      rinen: RINEN.includes(rinen) ? rinen : "", id, title: str(cell(r, c, "タイトル")) || id, body: String(cell(r, c, "内容・基準") ?? ""),
      evalId: str(cell(r, c, "評価項目ID")), order: Number.isFinite(order) && order !== 0 ? order : i + 1,
      by: str(cell(r, c, "更新者")), at: str(cell(r, c, "更新日時")),
    });
  });
  return out.length ? sortByOrder(out) : null;
}
export const manualRows = (list) => [MANUAL_HEADER, ...list.map((m) => [m.grade, m.area, m.measure, m.rinen, m.id, m.title, m.body, m.evalId, m.order, m.by, m.at])];

export function parseCurriculum(rows) {
  if (!rows || rows.length < 2) return null;
  const c = headIndex(rows, CURRICULUM_HEADER);
  const out = [];
  rows.slice(1).forEach((r, i) => {
    const id = str(cell(r, c, "ステップID"));
    const grade = str(cell(r, c, "クラス"));
    if (!id || !MANUAL_GRADES.includes(grade)) return;
    const area = str(cell(r, c, "区分"));
    const order = Number(cell(r, c, "並び順"));
    out.push({
      grade, phase: str(cell(r, c, "時期")) || "その他", area: area === "社会人" ? "社会人" : "施術者", id,
      title: str(cell(r, c, "内容")) || id, criterion: String(cell(r, c, "合格基準") ?? ""), checker: str(cell(r, c, "確認者")),
      order: Number.isFinite(order) && order !== 0 ? order : i + 1, by: str(cell(r, c, "更新者")), at: str(cell(r, c, "更新日時")),
    });
  });
  return out.length ? sortByOrder(out) : null;
}
export const curriculumRows = (list) => [CURRICULUM_HEADER, ...list.map((s) => [s.grade, s.phase, s.area, s.id, s.title, s.criterion, s.checker, s.order, s.by, s.at])];

// 「カリキュラム進捗」→ Map(氏名key → Map(ステップID → {status, checker, at, memo, row}))
export function parseProgress(rows) {
  const map = new Map();
  (rows || []).slice(1).forEach((r, i) => {
    const key = normName((r && r[0]) || (r && r[1]) || "");
    const step = str(r && r[2]);
    if (!key || !step) return;
    const status = str(r[3]);
    if (!map.has(key)) map.set(key, new Map());
    map.get(key).set(step, { status: STEP_STATUSES.includes(status) ? status : "", checker: str(r[4]), at: str(r[5]), memo: str(r[6]), row: i + 2 });
  });
  return map;
}

// 「マニュアル確認」→ Map("氏名key|クラス" → {at, row})
export function parseReads(rows) {
  const map = new Map();
  (rows || []).slice(1).forEach((r, i) => {
    const key = normName((r && r[0]) || (r && r[1]) || "");
    const grade = str(r && r[2]);
    if (!key || !grade) return;
    map.set(`${key}|${grade}`, { at: str(r[3]), row: i + 2 });
  });
  return map;
}

function sortByOrder(list) {
  return list.map((x, i) => [x, i]).sort((a, b) => a[0].order - b[0].order || a[1] - b[1]).map(([x]) => x);
}

// ===== 編集の確認 =====
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
export function validateManualItem(raw) {
  const m = raw || {};
  const grade = str(m.grade);
  if (!(grade === COMMON || MANUAL_GRADES.includes(grade))) throw new Error("クラスが正しくありません");
  const area = str(m.area);
  if (!AREAS.includes(area)) throw new Error("区分が正しくありません");
  if (area === "理念" && grade !== COMMON) throw new Error("理念は「全クラス共通」に入れてください");
  const id = str(m.id);
  if (!ID_RE.test(id)) throw new Error("項目IDは半角英数字・_・- の40文字以内にしてください");
  const title = cleanText(m.title, 80);
  if (!title) throw new Error("タイトルを入れてください");
  const evaluated = area === "施術者" || area === "社会人";
  const measure = evaluated ? str(m.measure) : "";
  if (evaluated && !MEASURES.includes(measure)) throw new Error("「定量」か「定性」を選んでください");
  const rinen = str(m.rinen);
  if (rinen && !RINEN.includes(rinen)) throw new Error("理念の文字が正しくありません");
  const evalId = evaluated ? str(m.evalId) : "";
  if (evalId && !ID_RE.test(evalId)) throw new Error("評価項目IDが正しくありません");
  const order = Number(m.order);
  return { grade, area, measure, rinen, id, title, body: cleanText(m.body, 1500), evalId, order: Number.isFinite(order) ? order : 0 };
}
export function validateStep(raw) {
  const s = raw || {};
  const grade = str(s.grade);
  if (!MANUAL_GRADES.includes(grade)) throw new Error("クラスが正しくありません");
  const id = str(s.id);
  if (!ID_RE.test(id)) throw new Error("ステップIDは半角英数字・_・- の40文字以内にしてください");
  const title = cleanText(s.title, 80);
  if (!title) throw new Error("内容を入れてください");
  const order = Number(s.order);
  return {
    grade, phase: cleanText(s.phase, 20) || "その他", area: str(s.area) === "社会人" ? "社会人" : "施術者", id, title,
    criterion: cleanText(s.criterion, 300), checker: cleanText(s.checker, 20), order: Number.isFinite(order) ? order : 0,
  };
}

// 追加・更新（同じIDは置き換え）。並び順が0なら最後に
export function upsert(list, item, by, at) {
  const cur = list.find((x) => x.id === item.id);
  const maxOrder = list.reduce((a, x) => Math.max(a, x.order || 0), 0);
  const next = { ...item, order: item.order || (cur ? cur.order : maxOrder + 1), by, at };
  return sortByOrder(cur ? list.map((x) => (x.id === item.id ? next : x)) : [...list, next]);
}
export const removeById = (list, id) => list.filter((x) => x.id !== id);

// ===== 表示用 =====
// そのクラスの版（最後に更新された日時）。読んだ日時がこれより前なら「更新あり」
export function versionOf(manual, grade) {
  return manual.filter((m) => m.grade === grade).reduce((a, m) => (m.at > a ? m.at : a), "");
}
export function readStatus(reads, manual, personKey, grade) {
  const r = reads.get(`${personKey}|${grade}`);
  if (!r) return { state: "未確認", at: "" };
  const v = versionOf(manual, grade);
  return { state: v && v > r.at ? "更新あり" : "確認済", at: r.at };
}

// マニュアルで使うクラス（スペシャリストは同じ段、短時間・受付などは一般スタッフの内容を見る）
const LEVEL_OF = { S1: "G3", S2: "G4", S3: "G5" };
export function manualGradeOf(grade) {
  const g = LEVEL_OF[grade] || grade;
  return MANUAL_GRADES.includes(g) ? g : "G2";
}

// 評価項目（評価項目シート）を、マニュアルの区分（施術者／社会人）と定量／定性に振り分ける
//   定量＝数値・KDI、定性＝行動・基本。区分はその評価項目を紐づけたマニュアル項目から（基本は社会人）
export function evaluationMap(items, manual, grade) {
  const linked = (id) => manual.find((m) => m.evalId === id && (m.grade === grade || m.grade === COMMON));
  const rows = [...(items[grade] || []), ...(items[COMMON] || [])].map((it) => {
    const m = linked(it.id);
    return {
      id: it.id, label: it.label, kind: it.kind, target: it.target ?? null, unit: it.unit || "", direction: it.direction || "",
      note: it.note || "", required: !!it.required, auto: !!it.auto,
      measure: it.kind === "数値" || it.kind === "KDI" ? "定量" : "定性",
      area: m ? m.area : it.kind === "基本" ? "社会人" : "",
      manualId: m ? m.id : "",
    };
  });
  return rows;
}

// マニュアル項目に、紐づけた評価項目の目標などを付ける
export function attachEval(manual, items) {
  return manual.map((m) => {
    if (!m.evalId) return m;
    const pool = m.grade === COMMON ? items[COMMON] || [] : [...(items[m.grade] || []), ...(items[COMMON] || [])];
    const it = pool.find((x) => x.id === m.evalId);
    return { ...m, eval: it ? { label: it.label, kind: it.kind, target: it.target ?? null, unit: it.unit || "", direction: it.direction || "", auto: !!it.auto, required: !!it.required } : null };
  });
}

// カリキュラムの進み具合（そのクラスのステップに対して）
export function curriculumProgress(curriculum, progressOfPerson, grade) {
  const steps = curriculum.filter((s) => s.grade === grade);
  const p = progressOfPerson || new Map();
  const passed = steps.filter((s) => (p.get(s.id) || {}).status === "合格").length;
  const practicing = steps.filter((s) => (p.get(s.id) || {}).status === "練習中").length;
  return { total: steps.length, passed, practicing, rate: steps.length ? Math.round((passed / steps.length) * 100) : null };
}

// カリキュラムの合格をつけられるか：社長・GM、または同じ院の「自分より上のクラス」の副院長以上
export function canCheck(viewer, isAdmin, person) {
  if (isAdmin || viewer.scope === "all") return true;
  if (!viewer.personKey || viewer.personKey === person.key) return false;
  if (!CHECKER_GRADES.includes(viewer.grade)) return false;
  if (gradeRank(viewer.grade) >= gradeRank(person.grade)) return false;
  return (person.clinics || []).some((c) => (viewer.clinics || []).includes(c));
}
