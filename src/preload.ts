import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AgentInfo, Chunk, MessageParam, ModelConfig, Task } from './types'

contextBridge.exposeInMainWorld('api', {
  // ── MCP 초기화 ───────────────────────────────────────────────────────────────
  initMCP: (): Promise<{ ok: boolean; tools?: number; error?: string; difyMode?: boolean }> =>
    ipcRenderer.invoke('init-mcp'),
  getAppMeta: (): Promise<{ title: string }> => ipcRenderer.invoke('get-app-meta'),

  // ── 에이전트 ─────────────────────────────────────────────────────────────────
  getAgents: (): Promise<AgentInfo[]> => ipcRenderer.invoke('get-agents'),

  // ── 채팅 ─────────────────────────────────────────────────────────────────────
  sendMessage: (messages: MessageParam[], agentId: string | null): void =>
    ipcRenderer.send('send-message', { messages, agentId }),
  stopMessage: (): void => ipcRenderer.send('stop-message'),

  onChunk: (cb: (chunk: Chunk) => void): void => {
    ipcRenderer.removeAllListeners('agent-chunk')
    ipcRenderer.on('agent-chunk', (_, data: Chunk) => cb(data))
  },

  onDone: (cb: () => void): void => {
    ipcRenderer.removeAllListeners('agent-done')
    ipcRenderer.once('agent-done', () => cb())
  },

  onError: (cb: (msg: string) => void): void => {
    ipcRenderer.removeAllListeners('agent-error')
    ipcRenderer.once('agent-error', (_, msg: string) => cb(msg))
  },

  onStopped: (cb: () => void): void => {
    ipcRenderer.removeAllListeners('agent-stopped')
    ipcRenderer.once('agent-stopped', () => cb())
  },

  // ── 폴더 ─────────────────────────────────────────────────────────────────────
  pickFolder: (): Promise<{ ok: boolean; path?: string }> => ipcRenderer.invoke('pick-folder'),
  setCurrentFolder: (newPath: string): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('set-current-folder', newPath),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  getCurrentFolder: (): Promise<{ path: string | null }> => ipcRenderer.invoke('get-current-folder'),
  getFolderTree: (): Promise<any> => ipcRenderer.invoke('get-folder-tree'),

  // ── 모델 ─────────────────────────────────────────────────────────────────────
  getModels: (): Promise<ModelConfig[]> => ipcRenderer.invoke('get-models'),
  getCurrentModel: (): Promise<ModelConfig> => ipcRenderer.invoke('get-current-model'),
  setModel: (modelId: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('set-model', modelId),
  getModelSettings: (): Promise<{
    selectedProvider: 'openai' | 'anthropic' | 'google' | 'vllm' | 'dify'
    selectedModelId: string
    openaiModelId: string
    anthropicModelId: string
    googleModelId: string
    vllmModelId: string
    vllmBaseUrl: string
    googleBaseUrl: string
    openaiUseCustomBaseUrl: boolean
    openaiBaseUrl: string
  }> => ipcRenderer.invoke('get-model-settings'),
  saveModelSettings: (input: {
    selectedProvider?: 'openai' | 'anthropic' | 'google' | 'vllm' | 'dify'
    selectedModelId?: string
    openaiModelId?: string
    anthropicModelId?: string
    googleModelId?: string
    vllmModelId?: string
    vllmBaseUrl?: string
    googleBaseUrl?: string
    openaiUseCustomBaseUrl: boolean
    openaiBaseUrl?: string
  }): Promise<{ ok: boolean; models: ModelConfig[]; currentModel: ModelConfig }> =>
    ipcRenderer.invoke('save-model-settings', input),
  getProviderAuthStatus: (
    provider: 'openai' | 'anthropic' | 'google' | 'vllm' | 'dify',
  ): Promise<{ connected: boolean; source: 'api_key' | 'session' | null }> =>
    ipcRenderer.invoke('get-provider-auth-status', provider),
  getProviderAuthPreview: (
    provider: 'openai' | 'anthropic' | 'google' | 'vllm' | 'dify',
  ): Promise<{ connected: boolean; source: 'api_key' | 'session' | null; masked: string }> =>
    ipcRenderer.invoke('get-provider-auth-preview', provider),
  saveProviderAuth: (
    provider: 'openai' | 'anthropic' | 'google' | 'vllm' | 'dify',
    input: { apiKey?: string; sessionToken?: string },
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('save-provider-auth', { provider, ...input }),

  // ── 태스크 ───────────────────────────────────────────────────────────────────
  createThread: (title: string, agentId: string): Promise<Task> =>
    ipcRenderer.invoke('create-thread', { title, agentId }),
  updateTaskTitle: (taskId: string, title: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('update-task-title', { taskId, title }),
  appendThreadLog: (
    threadId: string,
    type: 'info' | 'tool' | 'output' | 'error',
    text: string,
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('append-thread-log', { threadId, type, text }),
  appendThreadMessage: (
    threadId: string,
    role: 'user' | 'assistant',
    text: string,
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('append-thread-message', { threadId, role, text }),
  createTask: (title: string, prompt: string, agentId: string): Promise<Task> =>
    ipcRenderer.invoke('create-task', { title, prompt, agentId }),
  getTasks: (): Promise<Task[]> => ipcRenderer.invoke('get-tasks'),
  cancelTask: (taskId: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('cancel-task', taskId),
  deleteTask: (taskId: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('delete-task', taskId),
  onTaskUpdated: (cb: (task: Task) => void): void => {
    ipcRenderer.removeAllListeners('task-updated')
    ipcRenderer.on('task-updated', (_, task: Task) => cb(task))
  },
})
