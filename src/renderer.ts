declare const marked: { parse: (md: string) => string }
declare const mermaid: { run: (config: { nodes: NodeListOf<Element> }) => Promise<void> }

// window.api 타입 선언
interface Chunk {
  type: 'text' | 'tool' | 'doc-preview' | 'meta'
  text?: string; name?: string; toolArgs?: any; toolResult?: string
  docTitle?: string; docText?: string
  metaKind?: 'routing'
  intent?: 'document' | 'code' | 'hybrid' | 'proposal'
  provider?: 'openai' | 'anthropic' | 'google' | 'vllm' | 'dify'
  skillId?: string
}
interface MessageParam { role: 'user' | 'assistant'; content: string }
interface ModelConfig { id: string; name: string; provider: 'openai' | 'anthropic' | 'google' | 'vllm' | 'dify' }
type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
interface TaskLogEntry { time: string; type: 'info' | 'tool' | 'output' | 'error'; text: string }
interface ThreadMessage { time: string; role: 'user' | 'assistant'; text: string }
interface Task {
  id: string; title: string; agentId: string; status: TaskStatus
  createdAt: string; completedAt?: string; outputFiles: string[]; log: TaskLogEntry[]; threadMessages?: ThreadMessage[]; error?: string
}
interface WindowApi {
  initMCP: () => Promise<{ ok: boolean; tools?: number; error?: string; difyMode?: boolean }>
  getAppMeta: () => Promise<{ title: string }>
  sendMessage: (messages: MessageParam[], agentId: string | null) => void
  stopMessage: () => void
  onChunk: (cb: (chunk: Chunk) => void) => void
  onDone: (cb: () => void) => void
  onError: (cb: (msg: string) => void) => void
  onStopped: (cb: () => void) => void
  pickFolder: () => Promise<{ ok: boolean; path?: string }>
  setCurrentFolder: (newPath: string) => Promise<{ ok: boolean; path?: string; error?: string }>
  getPathForFile: (file: File) => string
  getCurrentFolder: () => Promise<{ path: string | null }>
  getFolderTree: () => Promise<any>
  getModels: () => Promise<ModelConfig[]>
  getCurrentModel: () => Promise<ModelConfig>
  setModel: (modelId: string) => Promise<{ ok: boolean }>
  getModelSettings: () => Promise<{
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
  }>
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
  }) => Promise<{ ok: boolean; models: ModelConfig[]; currentModel: ModelConfig }>
  getProviderAuthStatus: (
    provider: 'openai' | 'anthropic' | 'google' | 'vllm' | 'dify',
  ) => Promise<{ connected: boolean; source: 'api_key' | 'session' | null }>
  getProviderAuthPreview: (
    provider: 'openai' | 'anthropic' | 'google' | 'vllm' | 'dify',
  ) => Promise<{ connected: boolean; source: 'api_key' | 'session' | null; masked: string }>
  saveProviderAuth: (
    provider: 'openai' | 'anthropic' | 'google' | 'vllm' | 'dify',
    input: { apiKey?: string; sessionToken?: string },
  ) => Promise<{ ok: boolean; error?: string }>
  createThread: (title: string, agentId: string) => Promise<Task>
  updateTaskTitle: (taskId: string, title: string) => Promise<{ ok: boolean; error?: string }>
  appendThreadLog: (
    threadId: string,
    type: 'info' | 'tool' | 'output' | 'error',
    text: string,
  ) => Promise<{ ok: boolean; error?: string }>
  appendThreadMessage: (
    threadId: string,
    role: 'user' | 'assistant',
    text: string,
  ) => Promise<{ ok: boolean; error?: string }>
  createTask: (title: string, prompt: string, agentId: string) => Promise<Task>
  getTasks: () => Promise<Task[]>
  cancelTask: (taskId: string) => Promise<{ ok: boolean }>
  deleteTask: (taskId: string) => Promise<{ ok: boolean; error?: string }>
  onTaskUpdated: (cb: (task: Task) => void) => void
}
declare global { interface Window { api: WindowApi } }

// ── DOM 참조 ──────────────────────────────────────────────────────────────────

const messagesEl     = document.getElementById('messages') as HTMLDivElement
const inputEl        = document.getElementById('input') as HTMLTextAreaElement
const stopBtn        = document.getElementById('stop-btn') as HTMLButtonElement
const sendBtn        = document.getElementById('send-btn') as HTMLButtonElement
const dot            = document.getElementById('dot') as HTMLDivElement
const statusText     = document.getElementById('status-text') as HTMLSpanElement
const routeInfo      = document.getElementById('route-info') as HTMLSpanElement
const folderPath     = document.getElementById('folder-path') as HTMLSpanElement
const folderBtn      = document.getElementById('folder-btn') as HTMLButtonElement
const welcome        = document.getElementById('welcome') as HTMLDivElement
const welcomeTitle   = document.getElementById('welcome-title') as HTMLHeadingElement
const welcomeDesc    = document.getElementById('welcome-desc') as HTMLParagraphElement
const titlebarText   = document.getElementById('titlebar-text') as HTMLSpanElement
const fileTreeEl     = document.getElementById('file-tree') as HTMLDivElement
const docPanel       = document.getElementById('doc-panel') as HTMLDivElement
const docPanelTitle  = document.getElementById('doc-panel-title') as HTMLSpanElement
const docPanelContent = document.getElementById('doc-panel-content') as HTMLDivElement
const docPanelClose  = document.getElementById('doc-panel-close') as HTMLButtonElement
const modelSelect    = document.getElementById('model-select') as HTMLSelectElement
const modelBadge     = document.getElementById('model-provider-badge') as HTMLDivElement
const modelSettingsBtn = document.getElementById('model-settings-btn') as HTMLButtonElement
const modelSettingsOverlay = document.getElementById('model-settings-overlay') as HTMLDivElement
const vllmSection = document.getElementById('openai-compatible-section') as HTMLDivElement
const vllmModelIdInput = document.getElementById('vllm-model-id-input') as HTMLInputElement
const vllmBaseUrlInput = document.getElementById('vllm-base-url-input') as HTMLInputElement
const modelProviderGroupSelect = document.getElementById('model-provider-group-select') as HTMLSelectElement
const modelProviderModelSelect = document.getElementById('model-provider-model-select') as HTMLSelectElement
const modelProviderModelAdd = document.getElementById('model-provider-model-add') as HTMLButtonElement
const providerApiKeyLabel = document.getElementById('provider-api-key-label') as HTMLLabelElement
const providerApiKeyInput = document.getElementById('provider-api-key-input') as HTMLInputElement
const modelSettingsCancel = document.getElementById('model-settings-cancel') as HTMLButtonElement
const modelSettingsSave = document.getElementById('model-settings-save') as HTMLButtonElement
const taskList       = document.getElementById('task-list') as HTMLDivElement
const newTaskBtn     = document.getElementById('new-task-btn') as HTMLButtonElement
const taskModalOverlay = document.getElementById('task-modal-overlay') as HTMLDivElement
const taskTitleInput = document.getElementById('task-title-input') as HTMLInputElement
const taskPromptInput = document.getElementById('task-prompt-input') as HTMLTextAreaElement
const modalCancel    = document.getElementById('modal-cancel') as HTMLButtonElement
const modalSubmit    = document.getElementById('modal-submit') as HTMLButtonElement
const authModalOverlay = document.getElementById('auth-modal-overlay') as HTMLDivElement
const authModalTitle = authModalOverlay.querySelector('h3') as HTMLHeadingElement
const authHelp = document.getElementById('auth-help') as HTMLParagraphElement
const authTokenInput = document.getElementById('auth-token-input') as HTMLInputElement
const authCancel = document.getElementById('auth-cancel') as HTMLButtonElement
const authSubmit = document.getElementById('auth-submit') as HTMLButtonElement
const chatView       = document.getElementById('chat-view') as HTMLDivElement
const taskDetailView = document.getElementById('task-detail-view') as HTMLDivElement
const taskDetailBack = document.getElementById('task-detail-back') as HTMLButtonElement
const taskDetailTitle = document.getElementById('task-detail-title') as HTMLSpanElement
const taskDetailStatus = document.getElementById('task-detail-status') as HTMLSpanElement
const taskLogList    = document.getElementById('task-log-list') as HTMLDivElement
const taskOutputs    = document.getElementById('task-outputs') as HTMLDivElement
const taskOutputsSection = document.getElementById('task-outputs-section') as HTMLDivElement

// ── 상태 ──────────────────────────────────────────────────────────────────────

let history: MessageParam[] = []
let isThinking = false
let isSending = false
let currentBubble: HTMLDivElement | null = null
const DEFAULT_AGENT_ID = 'tech-trend'
let currentAgentId: string | null = DEFAULT_AGENT_ID
let currentProvider: 'openai' | 'anthropic' | 'google' | 'vllm' | 'dify' = 'openai'
let currentThreadId: string | null = null
let currentTaskId: string | null = null
const taskMap = new Map<string, Task>()
const collapsedDirPaths = new Set<string>()
let modelSettingsLoaded = false
let currentProviderMaskedKey = ''
const PROVIDER_MODEL_PRESETS: Record<string, string[]> = {
  openai: ['gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini'],
  anthropic: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  vllm: [],
}

window.api.getAppMeta().then((meta) => {
  const appTitle = (meta?.title ?? '').trim() || 'OHMYINSITE'
  document.title = appTitle
  titlebarText.textContent = appTitle
  welcomeTitle.textContent = appTitle
}).catch(() => {
  document.title = 'OHMYINSITE'
  titlebarText.textContent = 'OHMYINSITE'
  welcomeTitle.textContent = 'OHMYINSITE'
})
welcomeDesc.textContent = '질문을 입력하면 의도를 자동 분류해 문서/코드/제안서 모드로 처리합니다.'

// ── 탭 전환 ───────────────────────────────────────────────────────────────────

document.querySelectorAll('.sidebar-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = (btn as HTMLButtonElement).dataset.tab!
    document.querySelectorAll('.sidebar-tab').forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'))
    document.getElementById(`tab-${tab}`)?.classList.add('active')
  })
})

// ── 문서 패널 ─────────────────────────────────────────────────────────────────

docPanelClose.addEventListener('click', () => docPanel.classList.add('hidden'))

function showDocPreview(title: string, text: string): void {
  docPanelTitle.textContent = `📄 ${title}`
  docPanelContent.textContent = text
  docPanel.classList.remove('hidden')
}

// ── 모델 셀렉터 ───────────────────────────────────────────────────────────────

async function initModelSelector(): Promise<void> {
  const [models, current] = await Promise.all([window.api.getModels(), window.api.getCurrentModel()])
  renderModelSelector(models, current)
}

function renderModelSelector(models: ModelConfig[], current: ModelConfig): void {
  modelSelect.innerHTML = ''
  for (const m of models) {
    const opt = document.createElement('option')
    opt.value = m.id
    opt.textContent = m.name
    if (m.id === current.id) opt.selected = true
    modelSelect.appendChild(opt)
  }

  currentProvider = current.provider
  updateModelBadge(current.provider)
}

function refreshProviderPresetModels(): void {
  const provider = modelProviderGroupSelect.value
  const presets = PROVIDER_MODEL_PRESETS[provider] ?? []
  modelProviderModelSelect.innerHTML = ''
  for (const id of presets) {
    const opt = document.createElement('option')
    opt.value = id
    opt.textContent = id
    modelProviderModelSelect.appendChild(opt)
  }
}

function updateModelSettingsVisibilityByProvider(): void {
  const provider = modelProviderGroupSelect.value
  const isVllm = provider === 'vllm'
  vllmSection.style.display = isVllm ? '' : 'none'
  modelProviderModelSelect.disabled = isVllm
  modelProviderModelAdd.textContent = isVllm ? '적용' : '적용'

  if (provider === 'anthropic') {
    providerApiKeyLabel.textContent = 'Anthropic API 키 (선택)'
    providerApiKeyInput.placeholder = '예: sk-ant-...'
  } else if (provider === 'google') {
    providerApiKeyLabel.textContent = 'Google API 키 (선택)'
    providerApiKeyInput.placeholder = '예: AIza...'
  } else if (provider === 'vllm') {
    providerApiKeyLabel.textContent = 'vLLM API 키 (선택)'
    providerApiKeyInput.placeholder = '필요할 때만 입력'
  } else {
    providerApiKeyLabel.textContent = 'OpenAI API 키 (선택)'
    providerApiKeyInput.placeholder = '예: sk-...'
  }
}

async function refreshProviderAuthPreview(): Promise<void> {
  const provider = modelProviderGroupSelect.value as ProviderName
  const preview = await window.api.getProviderAuthPreview(provider)
  currentProviderMaskedKey = preview.masked ?? ''
  providerApiKeyInput.value = currentProviderMaskedKey
}

async function loadModelSettingsModal(): Promise<void> {
  const settings = await window.api.getModelSettings()
  const provider = settings.selectedProvider
  modelProviderGroupSelect.value = ['openai', 'anthropic', 'google', 'vllm'].includes(provider)
    ? provider
    : 'openai'
  refreshProviderPresetModels()
  const providerModelMap: Record<string, string> = {
    openai: settings.openaiModelId,
    anthropic: settings.anthropicModelId,
    google: settings.googleModelId,
    vllm: settings.vllmModelId,
  }
  const mapped = providerModelMap[modelProviderGroupSelect.value]
  if (mapped) {
    const exists = Array.from(modelProviderModelSelect.options).some((o) => o.value === mapped)
    if (exists) modelProviderModelSelect.value = mapped
  }
  vllmModelIdInput.value = settings.vllmModelId ?? 'CEN-35B'
  vllmBaseUrlInput.value = settings.vllmBaseUrl ?? ''
  updateModelSettingsVisibilityByProvider()
  await refreshProviderAuthPreview()
  modelSettingsLoaded = true
}

function updateModelBadge(provider: 'openai' | 'anthropic' | 'google' | 'vllm' | 'dify'): void {
  modelBadge.textContent = provider === 'anthropic'
    ? 'Anthropic'
    : provider === 'google'
      ? 'Google'
      : provider === 'vllm'
        ? 'vLLM'
        : provider === 'dify'
          ? 'Dify'
          : 'OpenAI'
  modelBadge.className = `model-provider-badge ${provider}`
  // Fix: id is still there but className needs the right value
  modelBadge.setAttribute('id', 'model-provider-badge')
}

function intentLabel(intent?: 'document' | 'code' | 'hybrid' | 'proposal'): string {
  if (intent === 'proposal') return '제안서'
  if (intent === 'hybrid') return '하이브리드'
  if (intent === 'code') return '코드'
  return '문서'
}

modelSelect.addEventListener('change', async () => {
  const modelId = modelSelect.value
  await window.api.setModel(modelId)
  const allModels = await window.api.getModels()
  const selected = allModels.find((m) => m.id === modelId)
  if (selected) {
    currentProvider = selected.provider
    updateModelBadge(selected.provider)
  }
})

modelSettingsBtn.addEventListener('click', async () => {
  await loadModelSettingsModal()
  modelSettingsOverlay.classList.add('active')
  if (modelProviderGroupSelect.value === 'vllm') {
    vllmModelIdInput.focus()
  } else {
    modelProviderModelSelect.focus()
  }
})

modelProviderGroupSelect.addEventListener('change', () => {
  refreshProviderPresetModels()
  updateModelSettingsVisibilityByProvider()
  void refreshProviderAuthPreview()
})

modelProviderModelAdd.addEventListener('click', () => {
  void (async () => {
    const provider = modelProviderGroupSelect.value
    const selectedModel = provider === 'vllm'
      ? vllmModelIdInput.value.trim()
      : modelProviderModelSelect.value.trim()
    if (!selectedModel) return

    const apiKey = providerApiKeyInput.value.trim()
    if (apiKey && apiKey !== currentProviderMaskedKey) {
      const saved = await window.api.saveProviderAuth(provider as ProviderName, { apiKey })
      if (!saved.ok) {
        addMessage('assistant', `오류: API 키 저장 실패 ${saved.error ?? ''}`.trim())
        return
      }
      await refreshProviderAuthPreview()
    }

    const res = await window.api.saveModelSettings({
      selectedProvider: provider as 'openai' | 'anthropic' | 'google' | 'vllm',
      selectedModelId: selectedModel,
      openaiModelId: provider === 'openai' ? selectedModel : undefined,
      anthropicModelId: provider === 'anthropic' ? selectedModel : undefined,
      googleModelId: provider === 'google' ? selectedModel : undefined,
      vllmModelId: provider === 'vllm' ? selectedModel : undefined,
      vllmBaseUrl: provider === 'vllm' ? vllmBaseUrlInput.value.trim() : undefined,
      openaiUseCustomBaseUrl: false,
      openaiBaseUrl: '',
    })
    if (!res.ok) {
      addMessage('assistant', '오류: 제공사 모델 적용에 실패했습니다.')
      return
    }
    renderModelSelector(res.models, res.currentModel)
    addMessage('assistant', `${provider.toUpperCase()} 모델이 ${selectedModel}(으)로 적용되었습니다.`)
  })()
})

modelSettingsSave.addEventListener('click', async () => {
  const provider = modelProviderGroupSelect.value as 'openai' | 'anthropic' | 'google' | 'vllm'
  const selectedModel = provider === 'vllm'
    ? vllmModelIdInput.value.trim()
    : modelProviderModelSelect.value.trim()
  if (!selectedModel) {
    addMessage('assistant', '오류: 선택된 모델이 없습니다. 모델을 선택(또는 입력)해 주세요.')
    return
  }
  const apiKey = providerApiKeyInput.value.trim()
  if (apiKey && apiKey !== currentProviderMaskedKey) {
    const saved = await window.api.saveProviderAuth(provider as ProviderName, { apiKey })
    if (!saved.ok) {
      addMessage('assistant', `오류: API 키 저장 실패 ${saved.error ?? ''}`.trim())
      return
    }
    await refreshProviderAuthPreview()
  }

  const res = await window.api.saveModelSettings({
    selectedProvider: provider,
    selectedModelId: selectedModel,
    openaiModelId: provider === 'openai' ? selectedModel : undefined,
    anthropicModelId: provider === 'anthropic' ? selectedModel : undefined,
    googleModelId: provider === 'google' ? selectedModel : undefined,
    vllmModelId: provider === 'vllm' ? selectedModel : undefined,
    vllmBaseUrl: provider === 'vllm' ? vllmBaseUrlInput.value.trim() : undefined,
    openaiUseCustomBaseUrl: false,
    openaiBaseUrl: '',
  })
  if (!res.ok) {
    addMessage('assistant', '오류: 모델 설정 저장에 실패했습니다.')
    return
  }
  renderModelSelector(res.models, res.currentModel)
  modelSettingsOverlay.classList.remove('active')
  addMessage('assistant', '모델 설정이 저장되었습니다.')
})

modelSettingsCancel.addEventListener('click', () => {
  modelSettingsOverlay.classList.remove('active')
})

modelSettingsOverlay.addEventListener('click', (e) => {
  if (e.target === modelSettingsOverlay) modelSettingsOverlay.classList.remove('active')
})

// ── 채팅 vs 태스크 뷰 ─────────────────────────────────────────────────────────

function showChatView(): void {
  chatView.style.display = 'flex'
  taskDetailView.classList.remove('active')
  currentTaskId = null
}

function showTaskDetail(task: Task): void {
  currentTaskId = task.id
  chatView.style.display = 'none'
  taskDetailView.classList.add('active')
  renderTaskDetail(task)
}

function buildHistoryFromThread(task: Task): MessageParam[] {
  if (task.threadMessages && task.threadMessages.length > 0) {
    return task.threadMessages.map((m) => ({ role: m.role, content: m.text }))
  }
  const fallback: MessageParam[] = []
  for (const l of task.log) {
    if (l.text.startsWith('사용자: ')) {
      fallback.push({ role: 'user', content: l.text.replace(/^사용자:\s*/, '') })
    } else if (l.text.startsWith('에이전트: ')) {
      fallback.push({ role: 'assistant', content: l.text.replace(/^에이전트:\s*/, '') })
    }
  }
  return fallback
}

function openThread(task: Task): void {
  showChatView()
  currentThreadId = task.id
  currentTaskId = task.id

  history = buildHistoryFromThread(task)
  messagesEl.innerHTML = ''
  if (history.length === 0) {
    messagesEl.appendChild(welcome)
    welcome.style.display = ''
  } else {
    welcome.style.display = 'none'
    for (const m of history) {
      addMessage(m.role, m.content)
    }
  }
  inputEl.focus()
}

taskDetailBack.addEventListener('click', showChatView)

// ── 태스크 목록 ───────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '방금 전'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  return `${Math.floor(hr / 24)}일 전`
}

const statusLabels: Record<TaskStatus, string> = {
  pending: '대기 중', running: '실행 중', completed: '완료', failed: '실패', cancelled: '취소됨',
}

function renderTaskCard(task: Task): HTMLDivElement {
  const card = document.createElement('div')
  card.className = 'task-card'
  card.dataset.taskId = task.id
  if (currentTaskId === task.id) card.classList.add('selected')

  card.innerHTML = `
    <div class="task-card-header">
      <div class="task-status-dot ${task.status}"></div>
      <div class="task-card-title">${escapeHtml(task.title)}</div>
      <button class="task-delete-btn" data-task-id="${task.id}" title="삭제">삭제</button>
    </div>
    <div class="task-card-meta">
      <span>자동 라우팅</span>
      <span>${formatRelativeTime(task.createdAt)}</span>
    </div>
    ${task.outputFiles.length > 0 ? `<div class="task-card-outputs">📄 ${task.outputFiles.length}개 파일 생성됨</div>` : ''}
  `

  card.addEventListener('click', () => {
    document.querySelectorAll('.task-card').forEach((c) => c.classList.remove('selected'))
    card.classList.add('selected')
    if (task.id.startsWith('task-')) {
      showTaskDetail(task)
    } else {
      openThread(task)
    }
  })

  const delBtn = card.querySelector('.task-delete-btn') as HTMLButtonElement | null
  delBtn?.addEventListener('click', async (e) => {
    e.stopPropagation()
    const ok = confirm(`"${task.title}" 스레드를 삭제할까요?`)
    if (!ok) return

    const res = await window.api.deleteTask(task.id)
    if (!res.ok) {
      addMessage('assistant', `오류: 삭제 실패 ${res.error ?? ''}`.trim())
      return
    }

    taskMap.delete(task.id)
    if (currentThreadId === task.id) {
      currentThreadId = null
      history = []
      messagesEl.innerHTML = ''
      messagesEl.appendChild(welcome)
      welcome.style.display = ''
      showChatView()
    }
    if (currentTaskId === task.id) currentTaskId = null
    refreshTaskList()
  })

  return card
}

function refreshTaskList(): void {
  taskList.innerHTML = ''
  const sorted = Array.from(taskMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  sorted.forEach((t) => taskList.appendChild(renderTaskCard(t)))
}

// ── 태스크 디테일 렌더링 ──────────────────────────────────────────────────────

const logIcons: Record<TaskLogEntry['type'], string> = {
  info: 'ℹ', tool: '⚙', output: '📄', error: '⚠',
}

function renderTaskDetail(task: Task): void {
  // 헤더
  taskDetailTitle.textContent = task.title
  taskDetailStatus.textContent = statusLabels[task.status]
  taskDetailStatus.className = `task-detail-status ${task.status}`
  taskDetailStatus.setAttribute('id', 'task-detail-status')

  // 로그
  taskLogList.innerHTML = ''
  task.log.forEach((entry) => {
    const el = document.createElement('div')
    el.className = `log-entry ${entry.type}`
    el.innerHTML = `
      <span class="log-icon">${logIcons[entry.type] ?? 'ℹ'}</span>
      <span class="log-text">${escapeHtml(entry.text)}</span>
    `
    taskLogList.appendChild(el)
  })
  taskLogList.scrollTop = taskLogList.scrollHeight

  // 출력 파일
  taskOutputs.innerHTML = ''
  if (task.outputFiles.length > 0) {
    taskOutputsSection.style.display = ''
    task.outputFiles.forEach((filePath) => {
      const item = document.createElement('div')
      item.className = 'output-file-item'
      const fileName = filePath.split('/').pop() ?? filePath
      item.innerHTML = `<span>📄</span><span title="${escapeHtml(filePath)}">${escapeHtml(fileName)}</span>`
      taskOutputs.appendChild(item)
    })
  } else {
    taskOutputsSection.style.display = 'none'
  }
}

// 태스크 업데이트 이벤트
window.api.onTaskUpdated((task) => {
  taskMap.set(task.id, task)
  refreshTaskList()
  if (currentTaskId === task.id && task.id.startsWith('task-')) {
    renderTaskDetail(task)
  }
})

// 기존 태스크 로드
window.api.getTasks().then((list) => {
  list.forEach((t) => taskMap.set(t.id, t))
  refreshTaskList()
  const latestThread = list
    .filter((t) => t.id.startsWith('thread-'))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
  if (latestThread) {
    openThread(latestThread)
  }
})

// ── 새 태스크 모달 ────────────────────────────────────────────────────────────

newTaskBtn.addEventListener('click', () => {
  const title = `새 스레드 (${new Date().toLocaleString('ko-KR', { hour12: false })})`
  window.api.createThread(title, DEFAULT_AGENT_ID).then((thread) => {
    taskMap.set(thread.id, thread)
    refreshTaskList()
    openThread(thread)
  }).catch((e) => {
    addMessage('assistant', `오류: 새 스레드 생성 실패 ${(e as Error).message ?? ''}`.trim())
  })
})

modalCancel.addEventListener('click', () => {
  taskModalOverlay.classList.remove('active')
})

taskModalOverlay.addEventListener('click', (e) => {
  if (e.target === taskModalOverlay) taskModalOverlay.classList.remove('active')
})

modalSubmit.addEventListener('click', async () => {
  let title = taskTitleInput.value.trim()
  const prompt = taskPromptInput.value.trim()

  if (!prompt) {
    addMessage('assistant', '오류: 스레드 작업 내용을 입력해 주세요.')
    taskPromptInput.focus()
    return
  }

  if (!title) {
    const stamp = new Date().toLocaleString('ko-KR', { hour12: false })
    title = `새 스레드 (${stamp})`
  }

  taskModalOverlay.classList.remove('active')

  // Tasks 탭으로 전환
  document.querySelectorAll('.sidebar-tab').forEach((b) => b.classList.remove('active'))
  document.querySelector('[data-tab="tasks"]')?.classList.add('active')
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'))
  document.getElementById('tab-tasks')?.classList.add('active')

  try {
    const task = await window.api.createTask(title, prompt, DEFAULT_AGENT_ID)
    taskMap.set(task.id, task)
    refreshTaskList()
    showTaskDetail(task)
  } catch (e) {
    addMessage('assistant', `오류: 스레드 생성에 실패했습니다. ${(e as Error).message ?? ''}`.trim())
  }
})

// ── 채팅 메시지 ───────────────────────────────────────────────────────────────

function addMessage(role: 'user' | 'assistant', text: string): HTMLDivElement {
  welcome.style.display = 'none'

  const wrap = document.createElement('div')
  wrap.className = `message ${role}`

  const label = document.createElement('div')
  label.className = 'message-label'
  label.textContent = role === 'user' ? '나' : 'Agent'

  const bubble = document.createElement('div')
  bubble.className = 'message-bubble'
  if (role === 'assistant') {
    try {
      bubble.innerHTML = marked.parse(text)
      void renderMermaid(bubble)
    } catch {
      bubble.textContent = text
    }
  } else {
    bubble.textContent = text
  }

  const actions = document.createElement('div')
  actions.className = 'message-actions'
  const copyBtn = document.createElement('button')
  copyBtn.className = 'message-copy-btn'
  copyBtn.type = 'button'
  copyBtn.textContent = '복사'
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text)
      copyBtn.textContent = '복사됨'
      setTimeout(() => { copyBtn.textContent = '복사' }, 1000)
    } catch {
      copyBtn.textContent = '실패'
      setTimeout(() => { copyBtn.textContent = '복사' }, 1000)
    }
  })
  actions.appendChild(copyBtn)

  wrap.appendChild(label)
  wrap.appendChild(bubble)
  wrap.appendChild(actions)
  messagesEl.appendChild(wrap)
  messagesEl.scrollTop = messagesEl.scrollHeight
  return bubble
}

function addThinking(): HTMLDivElement {
  welcome.style.display = 'none'

  const wrap = document.createElement('div')
  wrap.className = 'message assistant'
  wrap.id = 'thinking-indicator'

  const label = document.createElement('div')
  label.className = 'message-label'
  label.textContent = 'Agent'

  const bubble = document.createElement('div')
  bubble.className = 'message-bubble thinking'
  bubble.innerHTML = '<span></span><span></span><span></span>'

  wrap.appendChild(label)
  wrap.appendChild(bubble)
  messagesEl.appendChild(wrap)
  messagesEl.scrollTop = messagesEl.scrollHeight
  return wrap
}

let toolBadges: HTMLDivElement[] = []

function addToolBadge(name: string): void {
  const badge = document.createElement('div')
  badge.className = 'tool-badge'
  badge.textContent = `${name} 실행 중...`
  if (currentBubble) currentBubble.parentElement?.appendChild(badge)
  toolBadges.push(badge)
  messagesEl.scrollTop = messagesEl.scrollHeight
}

function clearToolBadges(): void {
  toolBadges.forEach((b) => b.remove())
  toolBadges = []
}

function makeThreadTitleFromAssistant(text: string): string {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/[#>*_\-\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const firstLine = cleaned.split('\n')[0]?.trim() ?? ''
  return (firstLine || '새 스레드').slice(0, 50)
}

type ProviderName = 'openai' | 'anthropic' | 'google' | 'vllm' | 'dify'

function authUiText(provider: ProviderName): { title: string; help: string; placeholder: string } {
  if (provider === 'anthropic') {
    return {
      title: 'Claude API 키 입력',
      help: 'Anthropic API 키를 입력하면 로컬 설정에 저장되어 다음부터 바로 사용됩니다.',
      placeholder: '예: sk-ant-...',
    }
  }
  if (provider === 'dify') {
    return {
      title: 'Dify 인증 입력',
      help: 'Dify API 키를 입력하면 로컬 설정에 저장되어 다음부터 바로 사용됩니다.',
      placeholder: '예: app-...',
    }
  }
  if (provider === 'google') {
    return {
      title: 'Google API 키 입력',
      help: 'Google Gemini API 키를 입력하면 로컬 설정에 저장되어 다음부터 바로 사용됩니다.',
      placeholder: '예: AIza...',
    }
  }
  if (provider === 'vllm') {
    return {
      title: 'vLLM API 키 입력 (선택)',
      help: 'vLLM 서버가 인증을 요구하지 않으면 입력하지 않아도 됩니다. 필요할 때만 입력하세요.',
      placeholder: '선택 입력',
    }
  }
  return {
    title: 'OpenAI API 키 입력',
    help: 'OpenAI API 키를 입력하면 로컬 설정에 저장되어 다음부터 바로 사용됩니다.',
    placeholder: '예: sk-...',
  }
}

function openAuthModal(provider: ProviderName): Promise<string | null> {
  return new Promise((resolve) => {
    const ui = authUiText(provider)
    authModalTitle.textContent = ui.title
    authHelp.textContent = ui.help
    authTokenInput.placeholder = ui.placeholder
    authTokenInput.value = ''
    authModalOverlay.classList.add('active')

    const close = (token: string | null): void => {
      authModalOverlay.classList.remove('active')
      authTokenInput.value = ''
      authCancel.removeEventListener('click', onCancel)
      authSubmit.removeEventListener('click', onSubmit)
      authModalOverlay.removeEventListener('click', onOverlayClick)
      resolve(token)
    }

    const onCancel = (): void => close(null)
    const onSubmit = (): void => {
      const token = authTokenInput.value.trim()
      if (!token) {
        authTokenInput.focus()
        return
      }
      close(token)
    }
    const onOverlayClick = (e: MouseEvent): void => {
      if (e.target === authModalOverlay) close(null)
    }

    authCancel.addEventListener('click', onCancel)
    authSubmit.addEventListener('click', onSubmit)
    authModalOverlay.addEventListener('click', onOverlayClick)
    setTimeout(() => authTokenInput.focus(), 0)
  })
}

async function ensureProviderCredential(provider: ProviderName): Promise<boolean> {
  if (provider === 'vllm') return true
  const status = await window.api.getProviderAuthStatus(provider)
  if (status.connected) return true

  const token = await openAuthModal(provider)
  if (!token) return false

  const save = await window.api.saveProviderAuth(provider, { apiKey: token })
  if (!save.ok) {
    addMessage('assistant', `오류: 인증 저장 실패 ${save.error ?? ''}`.trim())
    return false
  }

  const recheck = await window.api.getProviderAuthStatus(provider)
  return recheck.connected
}

async function sendMessage(): Promise<void> {
  const text = inputEl.value.trim()
  if (!text || isThinking || isSending) return
  isSending = true

  if (currentProvider === 'openai' || currentProvider === 'anthropic' || currentProvider === 'google' || currentProvider === 'dify' || currentProvider === 'vllm') {
    const ok = await ensureProviderCredential(currentProvider)
    if (!ok) {
      addMessage('assistant', '인증 정보가 없어 요청을 시작하지 않았습니다. 키를 입력하면 바로 사용할 수 있습니다.')
      isSending = false
      return
    }
  }

  if (!currentThreadId) {
    const autoTitle = `새 스레드 (${new Date().toLocaleString('ko-KR', { hour12: false })})`
    try {
      const thread = await window.api.createThread(autoTitle, DEFAULT_AGENT_ID)
      currentThreadId = thread.id
      taskMap.set(thread.id, thread)
      refreshTaskList()
    } catch (e) {
      addMessage('assistant', `오류: 스레드를 자동 생성하지 못했습니다. ${(e as Error).message ?? ''}`.trim())
      isSending = false
      return
    }
  }

  isThinking = true
  inputEl.value = ''
  inputEl.disabled = true
  stopBtn.disabled = false
  sendBtn.disabled = true
  inputEl.style.height = 'auto'

  addMessage('user', text)
  history.push({ role: 'user', content: text })
  if (currentThreadId) {
    await window.api.appendThreadMessage(currentThreadId, 'user', text)
  }
  routeInfo.textContent = '자동 라우팅: 분석 중...'

  const thinking = addThinking()
  currentBubble = null
  let assistantText = ''

  window.api.onChunk((chunk) => {
    if (chunk.type === 'meta' && chunk.metaKind === 'routing') {
      const base = `자동 라우팅: ${intentLabel(chunk.intent)}`
      if (chunk.provider === 'anthropic' && chunk.skillId) {
        routeInfo.textContent = `${base} · 스킬 ${chunk.skillId}`
      } else {
        routeInfo.textContent = base
      }
    } else if (chunk.type === 'tool' && !chunk.toolResult) {
      if (!currentBubble) {
        thinking.remove()
        currentBubble = addMessage('assistant', '')
      }
      addToolBadge(chunk.name ?? '')
    } else if (chunk.type === 'doc-preview') {
      showDocPreview(chunk.docTitle ?? '문서', chunk.docText ?? '')
    } else if (chunk.type === 'text') {
      if (!currentBubble) {
        thinking.remove()
        currentBubble = addMessage('assistant', '')
      }
      assistantText += chunk.text ?? ''
      const display = assistantText
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/<think>[\s\S]*$/g, '')
        .trimStart()
      try {
        currentBubble.innerHTML = marked.parse(display)
      } catch {
        currentBubble.textContent = display
      }
      messagesEl.scrollTop = messagesEl.scrollHeight
    }
  })

  window.api.onDone(async () => {
    thinking.remove()
    clearToolBadges()
    if (!currentBubble && assistantText === '') {
      addMessage('assistant', '(응답 없음)')
    }
    if (currentBubble) renderMermaid(currentBubble)
    history.push({ role: 'assistant', content: assistantText })
    if (currentThreadId) {
      await window.api.appendThreadMessage(currentThreadId, 'assistant', assistantText || '(응답 없음)')

      const currentThread = taskMap.get(currentThreadId)
      const isFirstExchange = history.length === 2
      const shouldAutoRename = !!currentThread
        && currentThread.title.startsWith('새 스레드')
        && isFirstExchange
      if (shouldAutoRename) {
        const nextTitle = makeThreadTitleFromAssistant(assistantText || '(응답 없음)')
        const renameRes = await window.api.updateTaskTitle(currentThreadId, nextTitle)
        if (renameRes.ok) {
          currentThread.title = nextTitle
          taskMap.set(currentThreadId, currentThread)
          refreshTaskList()
        }
      }
    }
    isThinking = false
    isSending = false
    inputEl.disabled = false
    stopBtn.disabled = true
    sendBtn.disabled = false
    inputEl.focus()
  })

  window.api.onStopped(async () => {
    thinking.remove()
    clearToolBadges()
    if (!currentBubble && assistantText === '') {
      addMessage('assistant', '응답이 중지되었습니다.')
    }
    if (currentBubble) renderMermaid(currentBubble)
    history.push({ role: 'assistant', content: assistantText || '(중지됨)' })
    if (currentThreadId) {
      await window.api.appendThreadMessage(currentThreadId, 'assistant', assistantText || '(중지됨)')
    }
    routeInfo.textContent = '자동 라우팅: 중지됨'
    isThinking = false
    isSending = false
    inputEl.disabled = false
    stopBtn.disabled = true
    sendBtn.disabled = false
    inputEl.focus()
  })

  window.api.onError((msg) => {
    thinking.remove()
    clearToolBadges()
    addMessage('assistant', `오류: ${msg}`)
    isThinking = false
    isSending = false
    inputEl.disabled = false
    stopBtn.disabled = true
    sendBtn.disabled = false
  })

  const MAX_HISTORY = 20
  const trimmed = history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history
  window.api.sendMessage(trimmed, currentAgentId)
}

async function renderMermaid(container: HTMLElement): Promise<void> {
  const codeBlocks = Array.from(container.querySelectorAll('pre code.language-mermaid'))
  for (const block of codeBlocks) {
    const code = block.textContent ?? ''
    if (!code.trim()) continue
    const wrapper = document.createElement('div')
    wrapper.className = 'mermaid-wrapper'
    const mermaidDiv = document.createElement('div')
    mermaidDiv.className = 'mermaid'
    mermaidDiv.textContent = code
    wrapper.appendChild(mermaidDiv)
    block.closest('pre')?.replaceWith(wrapper)
  }
  const nodes = container.querySelectorAll('.mermaid')
  if (nodes.length > 0) {
    try { await mermaid.run({ nodes }) } catch (e) { console.error('Mermaid 렌더링 실패:', e) }
  }
}

// ── 폴더 ──────────────────────────────────────────────────────────────────────

function updateFolderDisplay(p: string | null): void {
  folderPath.textContent = p ? `📂 ${p.split('/').pop()}` : ''
  folderPath.title = p ?? ''
  updateFileTree()
}

async function updateFileTree(): Promise<void> {
  const tree = await window.api.getFolderTree()
  fileTreeEl.innerHTML = ''
  if (!tree) return
  renderTree(tree, fileTreeEl)
}

function renderTree(node: any, parentEl: HTMLElement, depth = 0): void {
  const item = document.createElement('div')
  item.className = `tree-item ${node.type}`
  item.style.paddingLeft = `${depth * 12 + 8}px`
  const isDirectory = node.type === 'directory'
  const hasChildren = isDirectory && Array.isArray(node.children) && node.children.length > 0
  const isCollapsed = isDirectory && collapsedDirPaths.has(node.path)
  const disclosure = isDirectory ? (hasChildren ? (isCollapsed ? '▶' : '▼') : '•') : ''
  const icon = isDirectory ? '📁' : '📄'
  item.innerHTML = `<span class="tree-disclosure">${disclosure}</span><span>${icon}</span><span>${node.name}</span>`
  item.title = node.path
  parentEl.appendChild(item)

  if (isDirectory && hasChildren) {
    item.addEventListener('click', (e) => {
      e.stopPropagation()
      if (collapsedDirPaths.has(node.path)) {
        collapsedDirPaths.delete(node.path)
      } else {
        collapsedDirPaths.add(node.path)
      }
      void updateFileTree()
    })
  }

  if (node.children && !(isDirectory && isCollapsed)) {
    node.children.forEach((child: any) => renderTree(child, parentEl, depth + 1))
  }
}

folderBtn.addEventListener('click', async () => {
  const res = await window.api.pickFolder()
  if (res.ok && res.path) {
    updateFolderDisplay(res.path)
    addMessage('assistant', `📁 문서 폴더가 변경되었습니다.\n${res.path}`)
  }
})

function extractDroppedPath(event: DragEvent): string | null {
  const items = event.dataTransfer?.items
  if (items && items.length > 0) {
    for (const item of Array.from(items)) {
      if (item.kind !== 'file') continue
      const f = item.getAsFile()
      if (!f) continue
      const p = window.api.getPathForFile(f)
      if (p) return p
    }
  }

  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return null
  for (const f of Array.from(files)) {
    const p = window.api.getPathForFile(f)
    if (p) return p
  }

  const uriList = event.dataTransfer?.getData('text/uri-list')?.trim()
  if (uriList) {
    const first = uriList.split('\n').find((line) => line && !line.startsWith('#'))
    if (first?.startsWith('file://')) {
      try {
        return decodeURIComponent(first.replace('file://localhost', '').replace('file://', ''))
      } catch {
        // 무시
      }
    }
  }

  const textPlain = event.dataTransfer?.getData('text/plain')?.trim()
  if (textPlain?.startsWith('file://')) {
    try {
      return decodeURIComponent(textPlain.replace('file://localhost', '').replace('file://', ''))
    } catch {
      // 무시
    }
  }

  const fileUrl = event.dataTransfer?.getData('public.file-url')?.trim()
  if (fileUrl?.startsWith('file://')) {
    try {
      return decodeURIComponent(fileUrl.replace('file://localhost', '').replace('file://', ''))
    } catch {
      // 무시
    }
  }

  return null
}

;['dragenter', 'dragover'].forEach((evt) => {
  document.addEventListener(evt, (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
})

document.addEventListener('drop', async (e) => {
  e.preventDefault()
  e.stopPropagation()
  const droppedPath = extractDroppedPath(e)
  if (!droppedPath) {
    addMessage('assistant', '드롭 경로를 직접 읽지 못해 폴더 선택 창을 엽니다.')
    const picked = await window.api.pickFolder()
    if (picked.ok && picked.path) {
      updateFolderDisplay(picked.path)
      addMessage('assistant', `📁 문서 폴더가 설정되었습니다.\n${picked.path}`)
    }
    return
  }

  const res = await window.api.setCurrentFolder(droppedPath)
  if (res.ok && res.path) {
    updateFolderDisplay(res.path)
    addMessage('assistant', `📁 드래그앤드롭으로 문서 폴더가 설정되었습니다.\n${res.path}`)
  } else if (res.error) {
    addMessage('assistant', `오류: ${res.error}`)
  }
})

// ── MCP 초기화 ────────────────────────────────────────────────────────────────

statusText.textContent = 'MCP 서버 시작 중...'
window.api.initMCP().then(async (res: any) => {
  if (res.ok) {
    dot.className = 'status-dot connected'
    if (res.difyMode) {
      statusText.textContent = 'Dify · MCP 연결됨'
    } else {
      statusText.textContent = `MCP · 도구 ${res.tools}개`
    }
    inputEl.disabled = false
    sendBtn.disabled = false
    inputEl.focus()
    const folder = await window.api.getCurrentFolder()
    updateFolderDisplay(folder.path)
  } else {
    dot.className = 'status-dot error'
    statusText.textContent = `연결 실패 (채팅은 시도 가능)`
    inputEl.disabled = false
    sendBtn.disabled = false
    inputEl.focus()
    addMessage('assistant', `MCP 초기화 실패: ${res.error ?? '원인 미상'}\nMCP 없이도 채팅은 시도할 수 있습니다.`)
  }
})

// 모델 셀렉터 초기화
initModelSelector()

// ── 이벤트 바인딩 ─────────────────────────────────────────────────────────────

sendBtn.addEventListener('click', sendMessage)
stopBtn.addEventListener('click', () => {
  if (!isThinking) return
  stopBtn.disabled = true
  routeInfo.textContent = '자동 라우팅: 중지 요청 중...'
  window.api.stopMessage()
})

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void sendMessage()
    return
  }
  if (e.key === 'Escape' && isThinking) {
    e.preventDefault()
    stopBtn.disabled = true
    routeInfo.textContent = '자동 라우팅: 중지 요청 중...'
    window.api.stopMessage()
  }
})

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !isThinking) return
  e.preventDefault()
  stopBtn.disabled = true
  routeInfo.textContent = '자동 라우팅: 중지 요청 중...'
  window.api.stopMessage()
})

inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto'
  inputEl.style.height = Math.min(inputEl.scrollHeight, 130) + 'px'
})

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export {}
