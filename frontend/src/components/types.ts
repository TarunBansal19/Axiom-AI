export type SourceType = "PDF" | "TEXT" | "URL" | "YOUTUBE" | "VTT" | "YOUTUBE_PLAYLIST" | "youtube_playlist";

export type SourceStatus = "UPLOADING" | "EXTRACTING" | "CHUNKING" | "EMBEDDING" | "READY" | "FAILED";

export interface Source {
  id: string;
  notebookId: string;
  type: SourceType;
  originalUri: string;
  title?: string;
  status: SourceStatus;
  statusDetail?: string;
  rawContentRef?: string;
  rawContentText?: string;
  createdAt: string;
  indexedAt?: string;
}

export interface Citation {
  chunkId: string;
  sourceId: string;
  snippet: string;
}

export interface Answer {
  id: string;
  queryId: string;
  text: string;
  citations: string | Citation[];
  createdAt: string;
}

export interface QueryMessage {
  id: string;
  notebookId: string;
  question: string;
  createdAt: string;
  answer?: Answer;
}

export interface Notebook {
  id: string;
  name: string;
  isPinned?: boolean;
  createdAt: string;
  sources: Source[];
  queries?: QueryMessage[];
}

export interface ChunkDetails {
  id: string;
  notebookId: string;
  sourceId: string;
  text: string;
  chunkIndex: number;
  location: any;
  source: Source;
}

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  status: 'unseen' | 'correct' | 'incorrect';
}

export interface FlashcardDeck {
  id: string;
  notebookId: string;
  sourceIds: string[];
  title: string;
  cards: Flashcard[];
  createdAt: string;
  updatedAt: string;
}

export interface QuizOption {
  id: string;
  label: string;
  rationale: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
  correctOptionId: string;
}

export interface Quiz {
  id: string;
  notebookId: string;
  sourceIds: string[];
  title: string;
  questions: QuizQuestion[];
  createdAt: string;
}

export interface MindMapNode {
  id: string;
  label: string;
  summary?: string;
  children: MindMapNode[];
}

export interface MindMap {
  id: string;
  notebookId: string;
  sourceIds: string[];
  title: string;
  root: MindMapNode;
  createdAt: string;
}

export interface Roadmap {
  id: string;
  notebookId: string;
  sourceId: string;
  title: string;
  stages: RoadmapStage[];
  createdAt: string;
}

export interface RoadmapStage {
  id: string;
  roadmapId: string;
  order: number;
  title: string;
  description: string;
  estimatedMinutes: number;
  outcomes: string[];
  videoIds: string[];
  completed: boolean;
}

export interface NotebookOverview {
  id: string;
  notebookId: string;
  sourceIds: string[];
  title: string;
  summaryMarkdown: string;
  suggestedQuestions: string[];
  generatedAt: string;
}
