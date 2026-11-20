"use client";

import * as React from "react";
import { addDays, dateKey } from "./dates";
import { getRepository } from "./repository";
import { emptyState, type LearningState, type QuestionResult, type ReviewItem } from "./repository/types";
import { scheduleAfter } from "./review";
import { lessonMap } from "@/data/curriculum";

export const PASS_RATE = 0.7;

interface LearningActions {
  openLesson(lessonId: string): void;
  setLessonStep(lessonId: string, stepIndex: number): void;
  recordQuiz(lessonId: string, results: QuestionResult[]): { passed: boolean; score: number; total: number };
  answerReview(itemId: string, correct: boolean): void;
  recordCase(caseId: string, score: number, total: number): void;
  toggleFavorite(code: string): void;
  addStudySeconds(seconds: number): void;
  reset(): Promise<void>;
}

interface LearningContextValue extends LearningActions {
  state: LearningState;
  hydrated: boolean;
  /** 端末のローカル日付（YYYY-MM-DD）。読み込み前（プリレンダー時）は空文字 */
  today: string;
  storageLabel: string;
}

const LearningContext = React.createContext<LearningContextValue | null>(null);

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function LearningProvider({ children }: { children: React.ReactNode }) {
  const repo = React.useMemo(() => getRepository(), []);
  const [state, setState] = React.useState<LearningState>(emptyState);
  const [hydrated, setHydrated] = React.useState(false);
  const [today, setToday] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    repo.load().then((s) => {
      if (!alive) return;
      setState(s);
      setToday(dateKey());
      setHydrated(true);
    });
    return () => {
      alive = false;
    };
  }, [repo]);

  // 読み込み完了後、変更があるたびに保存
  React.useEffect(() => {
    if (hydrated) void repo.save(state);
  }, [state, hydrated, repo]);

  const update = React.useCallback((fn: (s: LearningState) => LearningState) => setState((s) => fn(s)), []);

  const actions = React.useMemo<LearningActions>(
    () => ({
      openLesson(lessonId) {
        const now = new Date().toISOString();
        update((s) => ({
          ...s,
          lastVisited: { lessonId, at: now },
          lessons: s.lessons[lessonId]
            ? s.lessons
            : { ...s.lessons, [lessonId]: { stepIndex: 0, status: "in-progress", startedAt: now, updatedAt: now } },
        }));
      },
      setLessonStep(lessonId, stepIndex) {
        const now = new Date().toISOString();
        update((s) => {
          const cur = s.lessons[lessonId] ?? { stepIndex: 0, status: "in-progress" as const, startedAt: now, updatedAt: now };
          return { ...s, lessons: { ...s.lessons, [lessonId]: { ...cur, stepIndex, updatedAt: now } } };
        });
      },
      recordQuiz(lessonId, results) {
        const score = results.filter((r) => r.correct).length;
        const total = results.length;
        const passed = total > 0 && score / total >= PASS_RATE;
        const now = new Date().toISOString();
        const today = dateKey();
        const lesson = lessonMap[lessonId];
        update((s) => {
          const reviewItems = { ...s.reviewItems };
          for (const r of results) {
            const id = `question:${r.questionId}`;
            const existing = reviewItems[id];
            const q = lesson?.quiz?.find((x) => x.id === r.questionId);
            if (!r.correct) {
              reviewItems[id] = existing
                ? scheduleAfter(existing, false, today)
                : { id, type: "question", refId: r.questionId, lessonId, label: q?.prompt ?? r.questionId, box: 0, due: today, lapses: 1, lastReviewed: today };
            } else if (existing) {
              reviewItems[id] = scheduleAfter(existing, true, today);
            }
          }
          const lessons = { ...s.lessons };
          const cur = lessons[lessonId] ?? { stepIndex: 3, status: "in-progress" as const, startedAt: now, updatedAt: now };
          if (passed) {
            lessons[lessonId] = { ...cur, status: "completed", completedAt: cur.completedAt ?? now, updatedAt: now };
            const lid = `lesson:${lessonId}`;
            if (!reviewItems[lid]) {
              reviewItems[lid] = {
                id: lid,
                type: "lesson",
                refId: lessonId,
                lessonId,
                label: `講義の振り返り：${lesson?.title ?? lessonId}`,
                box: 0,
                due: addDays(today, 1),
                lapses: 0,
              };
            }
          } else {
            lessons[lessonId] = { ...cur, updatedAt: now };
          }
          return {
            ...s,
            lessons,
            reviewItems,
            quizAttempts: [...s.quizAttempts, { id: uid(), lessonId, at: now, score, total, results }],
          };
        });
        return { passed, score, total };
      },
      answerReview(itemId, correct) {
        update((s) => {
          const item: ReviewItem | undefined = s.reviewItems[itemId];
          if (!item) return s;
          return { ...s, reviewItems: { ...s.reviewItems, [itemId]: scheduleAfter(item, correct) } };
        });
      },
      recordCase(caseId, score, total) {
        update((s) => ({ ...s, caseAttempts: [...s.caseAttempts, { id: uid(), caseId, at: new Date().toISOString(), score, total }] }));
      },
      toggleFavorite(code) {
        update((s) => ({
          ...s,
          favorites: s.favorites.includes(code) ? s.favorites.filter((c) => c !== code) : [...s.favorites, code],
        }));
      },
      addStudySeconds(seconds) {
        const key = dateKey();
        update((s) => ({ ...s, studyLog: { ...s.studyLog, [key]: (s.studyLog[key] ?? 0) + seconds } }));
      },
      async reset() {
        await repo.clear();
        setState(emptyState());
      },
    }),
    [update, repo],
  );

  const value = React.useMemo(() => ({ state, hydrated, today, storageLabel: repo.label, ...actions }), [state, hydrated, today, repo, actions]);
  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>;
}

export function useLearning() {
  const ctx = React.useContext(LearningContext);
  if (!ctx) throw new Error("useLearning は LearningProvider の内側で使ってください");
  return ctx;
}

/** 画面が表示されている間、学習時間を記録する */
export function useStudyTimer(active = true) {
  const { addStudySeconds, hydrated } = useLearning();
  React.useEffect(() => {
    if (!active || !hydrated) return;
    const TICK = 15;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") addStudySeconds(TICK);
    }, TICK * 1000);
    return () => window.clearInterval(id);
  }, [active, hydrated, addStudySeconds]);
}
