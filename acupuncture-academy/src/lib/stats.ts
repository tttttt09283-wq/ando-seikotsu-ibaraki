import { addDays, dateKey, weekStart } from "./dates";
import type { LearningState } from "./repository/types";
import { isDue } from "./review";
import { allLessons, publishedLessons } from "@/data/curriculum";
import { lessonRevision } from "@/data/changelog";

export function totalStudySeconds(s: LearningState) {
  return Object.values(s.studyLog).reduce((a, b) => a + b, 0);
}

export function overallAccuracy(s: LearningState) {
  let correct = 0;
  let total = 0;
  for (const a of s.quizAttempts) {
    correct += a.score;
    total += a.total;
  }
  for (const a of s.caseAttempts) {
    correct += a.score;
    total += a.total;
  }
  return total ? correct / total : null;
}

export function completedCount(s: LearningState) {
  return Object.values(s.lessons).filter((l) => l.status === "completed").length;
}

/** 講義ごとの最高得点率 */
export function bestScore(s: LearningState, lessonId: string) {
  const attempts = s.quizAttempts.filter((a) => a.lessonId === lessonId);
  if (!attempts.length) return null;
  return Math.max(...attempts.map((a) => a.score / a.total));
}

/**
 * 習熟度：公開講義の最高得点率と、復習項目の定着度（箱の段階）を合わせた指標（0〜1）。
 * 復習で正解を重ねるほど上がる。
 */
export function mastery(s: LearningState) {
  if (!publishedLessons.length) return 0;
  const lessonPart = publishedLessons.reduce((acc, l) => acc + (bestScore(s, l.id) ?? 0), 0) / publishedLessons.length;
  const items = Object.values(s.reviewItems);
  const retention = items.length ? items.reduce((a, i) => a + i.box / 4, 0) / items.length : lessonPart;
  return Math.round((lessonPart * 0.7 + retention * 0.3) * 100) / 100;
}

export function dueItems(s: LearningState, today: string) {
  return Object.values(s.reviewItems)
    .filter((i) => isDue(i, today))
    .sort((a, b) => a.due.localeCompare(b.due));
}

export function upcomingItems(s: LearningState, days: number, today: string) {
  const limit = addDays(today, days);
  return Object.values(s.reviewItems)
    .filter((i) => i.due > today && i.due <= limit)
    .sort((a, b) => a.due.localeCompare(b.due));
}

/** 理論（トピック）ごとの正答率。苦手な順に並べる */
export function topicStats(s: LearningState) {
  const map = new Map<string, { correct: number; total: number }>();
  for (const a of s.quizAttempts) {
    for (const r of a.results) {
      const t = map.get(r.topic) ?? { correct: 0, total: 0 };
      t.total++;
      if (r.correct) t.correct++;
      map.set(r.topic, t);
    }
  }
  return [...map.entries()]
    .map(([topic, v]) => ({ topic, ...v, rate: v.correct / v.total }))
    .sort((a, b) => a.rate - b.rate);
}

/** 間違えた経穴（回数順） */
export function missedPoints(s: LearningState) {
  const map = new Map<string, number>();
  for (const a of s.quizAttempts) {
    for (const r of a.results) {
      if (!r.correct) for (const c of r.pointCodes ?? []) map.set(c, (map.get(c) ?? 0) + 1);
    }
  }
  return [...map.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
}

/** 直近 n 週の学習時間（分）と正答率 */
export function weeklySeries(s: LearningState, weeks: number, today: string) {
  const thisWeek = weekStart(today);
  const starts = Array.from({ length: weeks }, (_, i) => addDays(thisWeek, -7 * (weeks - 1 - i)));
  return starts.map((start) => {
    const end = addDays(start, 7);
    let seconds = 0;
    for (const [k, v] of Object.entries(s.studyLog)) if (k >= start && k < end) seconds += v;
    let correct = 0;
    let total = 0;
    for (const a of s.quizAttempts) {
      const k = dateKey(new Date(a.at));
      if (k >= start && k < end) {
        correct += a.score;
        total += a.total;
      }
    }
    return { start, minutes: Math.round(seconds / 60), accuracy: total ? correct / total : null };
  });
}

/** 次に学ぶ講義：学習中の講義 → 未完了の公開講義 → なし */
export function nextLesson(s: LearningState) {
  if (s.lastVisited && s.lessons[s.lastVisited.lessonId]?.status === "in-progress") {
    return allLessons.find((l) => l.id === s.lastVisited!.lessonId) ?? null;
  }
  return publishedLessons.find((l) => s.lessons[l.id]?.status !== "completed") ?? null;
}

/** 学習を始めた講義のうち、最後に確認したあとで教材が更新されたもの */
export function updatedSinceSeen(s: LearningState) {
  return allLessons.filter((l) => {
    if (!s.lessons[l.id]) return false;
    const seen = s.seenRevisions?.[l.id] ?? 1;
    return seen < lessonRevision(l.id).revision;
  });
}
