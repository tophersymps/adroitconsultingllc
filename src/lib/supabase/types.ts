/**
 * Typed database schemas for the progress tracking tables.
 * Mirrors the Supabase schema defined in the architecture (ADR-001).
 */

export interface ReadProgressRow {
  id: string;
  user_id: string;
  content_type: "blog" | "lesson";
  content_slug: string;
  read_at: string;
}

export interface LessonCompletionRow {
  id: string;
  user_id: string;
  lesson_slug: string;
  completed_at: string;
}

export interface QuizAttemptRow {
  id: string;
  user_id: string;
  quiz_name: string;
  question_index: number;
  correct_answer_index: number;
  user_answer_index: number;
  is_correct: boolean;
  attempted_at: string;
}

/** Aggregated progress summary returned by GET /api/progress/summary. */
export interface ProgressSummary {
  /** Content slugs the user has read: { blog: [...], lesson: [...] } */
  readContent: Record<string, string[]>;
  /** Content slugs the user has completed */
  completedLessons: string[];
  /** Quiz results keyed by quiz name */
  quizResults: Record<string, QuizResult>;
}

export interface QuizResult {
  total: number;
  correct: number;
  attempts: Array<{
    questionIndex: number;
    isCorrect: boolean;
    userAnswer: number;
    correctAnswer: number;
    attemptedAt: string;
  }>;
}
