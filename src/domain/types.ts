// 앱 전체가 공유하는 타입과 상수. spec §6이 원천이다.

export const SCHEMA_VERSION = 1;
export const APP_VERSION = '0.1.0';

export function isFutureDocument(document: { schemaVersion: number }): boolean {
  return document.schemaVersion > SCHEMA_VERSION;
}

export type ToolName = 'calc' | 'memo' | 'paint';

export interface SectionTools {
  allowed: Record<ToolName, boolean>; // false = 잠금
  calc: 'open' | 'collapsed'; // 허용될 때 계산기 기본 표시
  tab: 'memo' | 'paint'; // 허용될 때 기본 탭
}

export interface SectionDef {
  id: string;
  name: string;
  questions: number;
  seconds: number;
  choices?: number;
  tools: SectionTools;
}

export interface ExamProfile {
  id: string;
  name: string;
  choices: number;
  sections: SectionDef[];
  navigation: { backWithinSection: boolean; backAcrossSections: boolean; carryOver: boolean };
  penalty: { enabled: boolean };
  breakSec: number;
  autoStart: boolean;
  calcKeyboard: boolean;
  schemaVersion: number;
}

export interface SetLayoutPart {
  sectionId: string | null;
  name: string;
  count: number;
}

export interface ProblemSet {
  id: string;
  name: string;
  profileId: string;
  layout: SetLayoutPart[];
  choices: number;
  numbering: { startNo: number; mode: 'continuous' | 'perSection' };
  key: (number | null)[] | null;
  defaultFamilyId?: string;
  ranges: { from: number; to: number; familyId: string; leafId?: string }[];
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
}

export type Ev =
  | { t: number; k: 'sectionStart'; s: number; auto?: boolean }
  | { t: number; k: 'sectionEnd'; s: number; reason: 'deadline' | 'manual' }
  | { t: number; k: 'answer'; q: number; c: number }
  | { t: number; k: 'clear'; q: number }
  | { t: number; k: 'flag'; q: number; on: boolean; kind: 'guess' | 'skip' }
  | { t: number; k: 'pause' }
  | { t: number; k: 'resume' }
  | { t: number; k: 'gap'; from: number; to: number; cause: 'sleep' | 'closed' }
  | { t: number; k: 'pauseRange'; from: number; to: number }
  | { t: number; k: 'finish' }
  | { t: number; k: 'abandon' };

export interface SectionPlan {
  sectionId: string | null;
  name: string;
  qFrom: number;
  qTo: number; // 포함
  limitSec: number;
  choices: number;
  paceSec: number;
  breakSec: number; // 이 영역 앞 쉬는 시간
  tools: SectionTools;
}

export type SessionScope = 'full' | 'section' | 'drill';
export type SessionMode = 'omr' | 'external';
export type SessionPolicy = 'hard' | 'soft';
export type SessionStatus = 'in_progress' | 'awaiting_key' | 'graded' | 'external_done' | 'abandoned';

export interface DrillSpec {
  sectionIdx: number | null;
  count: number;
  seconds: number;
}

export interface Session {
  id: string;
  profileId: string;
  setId: string | null; // 외부 모의는 null
  label?: string; // 외부 모의 이름
  scope: SessionScope;
  mode: SessionMode;
  policy: SessionPolicy;
  autoStart: boolean;
  attempt: number;
  plan: SectionPlan[];
  events: Ev[];
  status: SessionStatus;
  externalAnswers?: (number | null)[]; // 외부 모의 채점 입력(v0.2)
  reasons?: Record<number, 'concept' | 'slip' | 'misread'>; // v0.2
  captures?: { q: number; t: number; file: string }[]; // ShareX 캡처 연결(v0.3)
  createdAt: number;
  finishedAt?: number;
  backedUpAt?: number;
  appVersion: string;
  schemaVersion: number;
}

// v0.2 타입(저장 형태를 미리 고정한다)
export interface ImportRecord {
  id: string;
  source: 'passsidae';
  profileId: string;
  capturedAt: number;
  raw: { html?: string; text: string };
  parserVersion: number;
  header?: {
    round?: number; date?: string; rank?: number; takers?: number; usedMin?: number;
    limitMin?: number; score?: number; scoreMax?: number; correct?: number; total?: number;
  };
  rows?: {
    pathRaw: string; category?: string; family: string; leaf: string;
    correct: number; total: number; rateRaw?: string;
    qFrom: number; qTo: number; sectionId: string | null;
    mapped: 'position' | 'alias' | 'inferred';
  }[];
  linkedSessionId?: string;
  status: 'raw' | 'parsed' | 'confirmed';
  overtime: boolean;
  schemaVersion: number;
}

export interface Taxonomy {
  profileId: string;
  families: { id: string; name: string; sectionHint: string[] }[];
  leaves: { id: string; familyId: string; name: string }[];
}

export interface AliasEntry {
  key: string;
  familyId: string;
  leafId?: string;
  decidedBy: 'auto' | 'user';
}

export interface SetupDraft {
  profileId: string;
  scope: SessionScope;
  mode: SessionMode;
  policy: SessionPolicy;
  sectionIdx: number | null;
  drillCount: number;
  drillSeconds: number | null; // null = 자동
  setId: string | null; // 기존 세트, null이면 새 세트
  newSetName: string;
  startNo: number;
  numberingMode: 'continuous' | 'perSection';
  label: string; // 외부 모의 이름
}

export interface Settings {
  seeded?: boolean; // 1회 시드를 삭제해도 다시 넣지 않는다(v0.2)
  autoBackupDownload: boolean;
  sound: boolean;
  flash: boolean;
  lastSetup?: SetupDraft;
}

export interface AllData {
  profiles: ExamProfile[]; // 사용자 수정본만
  sets: ProblemSet[];
  sessions: Session[];
  memos: Record<string, string>; // sessionId → 메모
  templates?: Record<string, ProblemSet['ranges']>; // profileId → 기본 유형 범위(v0.2)
  imports: ImportRecord[];
  taxonomy: Taxonomy[];
  aliases: AliasEntry[];
  settings: Settings;
}

export interface QuestionView {
  q: number;
  no: string;
  sectionIdx: number;
  answer: number | null;
  answeredAt: number | null;
  changes: number;
  inLimitAnswer: number | null;
  overtime: boolean;
  flag: 'guess' | 'skip' | null;
  key: number | null;
  correct: boolean | null;
  inLimitCorrect: boolean | null;
  timeSec: number | null;
  familyId?: string;
  leafId?: string;
}

export interface SectionSummary {
  idx: number;
  name: string;
  started: boolean;
  n: number;
  graded: number;
  correct: number;
  inLimitCorrect: number;
  unanswered: number;
  guessed: number;
  usedSec: number;
  limitSec: number;
  overtimeSec: number;
  medianLapSec: number | null;
  paceSec: number;
}

export interface SessionSummary {
  n: number; // 시작한 영역의 문항 수
  graded: number;
  correct: number;
  inLimitCorrect: number;
  answered: number;
  unanswered: number;
  guessed: number;
  guessedCorrect: number;
  overtimeAnswers: number;
  usedSec: number;
  limitSec: number;
  overtimeSec: number;
  unseenSections: number;
  sections: SectionSummary[];
}
