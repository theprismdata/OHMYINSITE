export interface AgentDefinition {
  id: string
  name: string
  icon: string
  description: string
  examples: string[]
  systemPrompt: string
}

export interface AgentInfo {
  id: string
  name: string
  icon: string
  description: string
  examples: string[]
}

export interface DocInfo {
  path: string
  name: string
  type: string
  category: string
  size_kb: number
}

export interface SearchResult extends DocInfo {
  matched_in: 'name' | 'content'
}

export interface DocumentContent {
  title?: string
  type?: string
  total_pages?: number
  extracted_pages?: number
  unit?: string
  text?: string
  error?: string
}

// ── 모델 ──────────────────────────────────────────────────────────────────────

export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'vllm' | 'dify'

export interface ModelConfig {
  id: string
  name: string
  provider: ModelProvider
}

// ── 태스크 ────────────────────────────────────────────────────────────────────

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface TaskLogEntry {
  time: string
  type: 'info' | 'tool' | 'output' | 'error'
  text: string
}

export interface ThreadMessage {
  time: string
  role: 'user' | 'assistant'
  text: string
}

export interface Task {
  id: string
  title: string
  agentId: string
  status: TaskStatus
  createdAt: string
  completedAt?: string
  outputFiles: string[]
  log: TaskLogEntry[]
  threadMessages?: ThreadMessage[]
  error?: string
}

// ── 스트리밍 청크 ─────────────────────────────────────────────────────────────

export interface Chunk {
  type: 'text' | 'tool' | 'doc-preview' | 'meta'
  text?: string
  name?: string
  toolArgs?: any
  toolResult?: string
  docTitle?: string
  docText?: string
  metaKind?: 'routing'
  intent?: 'document' | 'code' | 'hybrid' | 'proposal'
  provider?: ModelProvider
  skillId?: string
}

export interface MessageParam {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | null
}
