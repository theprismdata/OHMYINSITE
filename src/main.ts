import * as dotenv from 'dotenv'
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, ChildProcess } from 'child_process'
import { setDocsRoot, getDocsRoot } from './docs-tools'
import type { AgentInfo, Chunk, ModelConfig, Task, TaskLogEntry } from './types'

function loadEnvFile(): void {
  const candidates = [
    process.env.ENV_FILE?.trim(),
    path.join(process.cwd(), '.env'),
    path.join(path.dirname(process.execPath), '.env'),
    (process.resourcesPath ? path.join(process.resourcesPath, '.env') : null),
    (process.env.HOME ? path.join(process.env.HOME, 'Library', 'Application Support', 'ohmyinsite', '.env') : null),
  ]
    .filter((p): p is string => !!p)

  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue
      dotenv.config({ path: p, override: true })
      return
    } catch {
      // continue
    }
  }

  dotenv.config({ override: true })
}

loadEnvFile()

// ── 환경변수 ───────────────────────────────────────────────────────────────────

const DIFY_MODE = (process.env.DIFY_MODE ?? 'false') === 'true'
const APP_TITLE = process.env.APP_TITLE?.trim() || 'OHMYINSITE'
const APP_ICON_PATH = process.env.APP_ICON_PATH?.trim() || ''
const DIFY_API_URL = process.env.DIFY_API_URL ?? 'http://localhost/v1'
const DIFY_API_KEY = process.env.DIFY_API_KEY ?? ''
const DIFY_SESSION_TOKEN = process.env.DIFY_SESSION_TOKEN ?? ''

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''
const ANTHROPIC_SESSION_TOKEN = process.env.ANTHROPIC_SESSION_TOKEN ?? ''
const GOOGLE_LLM_API_KEY = process.env.GOOGLE_LLM_API_KEY ?? process.env.GOOGLE_API_KEY ?? ''
const VLLM_API_KEY = process.env.VLLM_API_KEY ?? ''
const LLM_BASE_URL = process.env.LLM_BASE_URL
const GOOGLE_LLM_BASE_URL = process.env.GOOGLE_LLM_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta/openai'
const OPENAI_USE_CUSTOM_BASE_URL = (process.env.OPENAI_USE_CUSTOM_BASE_URL ?? 'false') === 'true'
const LLM_MODEL = process.env.LLM_MODEL ?? ''
const MCP_URL = `http://localhost:${process.env.MCP_PORT ?? '8001'}/mcp`
const CHAT_REQUEST_TIMEOUT_MS = Number(process.env.CHAT_REQUEST_TIMEOUT_MS ?? '90000')

type CredentialSource = 'api_key' | 'session'
type ProviderName = 'openai' | 'anthropic' | 'google' | 'vllm' | 'dify'

interface ProviderAuthSettings {
  apiKey?: string
  sessionToken?: string
}

interface ModelSettings {
  selectedProvider?: ProviderName
  selectedModelId?: string
  openaiModelId?: string
  anthropicModelId?: string
  googleModelId?: string
  vllmModelId?: string
  vllmBaseUrl?: string
  googleBaseUrl?: string
  openaiUseCustomBaseUrl?: boolean
  openaiBaseUrl?: string
}

interface AppSettings {
  docsRoot?: string
  auth?: Partial<Record<ProviderName, ProviderAuthSettings>>
  model?: ModelSettings
}

function getSavedModelSettings(): ModelSettings {
  const s = loadAppSettings()
  return s.model ?? {}
}

function getSavedProviderAuth(provider: ProviderName): ProviderAuthSettings {
  const s = loadAppSettings()
  return s.auth?.[provider] ?? {}
}

function resolveProviderCredential(provider: ProviderName): { token: string; source: CredentialSource } | null {
  const saved = getSavedProviderAuth(provider)

  if (provider === 'openai') {
    if (OPENAI_API_KEY) return { token: OPENAI_API_KEY, source: 'api_key' }
    if (saved.apiKey) return { token: saved.apiKey, source: 'api_key' }
    return null
  }

  if (provider === 'anthropic') {
    if (ANTHROPIC_API_KEY) return { token: ANTHROPIC_API_KEY, source: 'api_key' }
    if (saved.apiKey) return { token: saved.apiKey, source: 'api_key' }
    if (ANTHROPIC_SESSION_TOKEN) return { token: ANTHROPIC_SESSION_TOKEN, source: 'session' }
    if (saved.sessionToken) return { token: saved.sessionToken, source: 'session' }
    return null
  }

  if (provider === 'google') {
    if (GOOGLE_LLM_API_KEY) return { token: GOOGLE_LLM_API_KEY, source: 'api_key' }
    if (saved.apiKey) return { token: saved.apiKey, source: 'api_key' }
    return null
  }

  if (provider === 'vllm') {
    if (VLLM_API_KEY) return { token: VLLM_API_KEY, source: 'api_key' }
    if (saved.apiKey) return { token: saved.apiKey, source: 'api_key' }
    // vLLM은 인증 없이도 쓰는 경우가 많아 더미 키 허용
    return { token: 'EMPTY', source: 'api_key' }
  }

  if (DIFY_API_KEY) return { token: DIFY_API_KEY, source: 'api_key' }
  if (saved.apiKey) return { token: saved.apiKey, source: 'api_key' }
  if (DIFY_SESSION_TOKEN) return { token: DIFY_SESSION_TOKEN, source: 'session' }
  if (saved.sessionToken) return { token: saved.sessionToken, source: 'session' }
  return null
}

function resolveBaseURL(provider: ProviderName): string | undefined {
  const settings = getSavedModelSettings()
  if (provider === 'google') {
    const trimmed = (settings.googleBaseUrl ?? GOOGLE_LLM_BASE_URL ?? '').trim()
    return trimmed || undefined
  }
  if (provider === 'vllm') {
    const trimmed = (settings.vllmBaseUrl ?? LLM_BASE_URL ?? '').trim()
    return trimmed || undefined
  }
  if (provider === 'openai') {
    const useCustom = settings.openaiUseCustomBaseUrl ?? OPENAI_USE_CUSTOM_BASE_URL
    if (!useCustom) return undefined
    const trimmed = (settings.openaiBaseUrl ?? LLM_BASE_URL ?? '').trim()
    return trimmed || undefined
  }
  return undefined
}

function resolveAppIconPath(): string | undefined {
  const candidates = [
    APP_ICON_PATH,
    path.join(process.cwd(), 'assets', 'icon', 'sloth-icon.png'),
    path.join(app.getAppPath(), 'assets', 'icon', 'sloth-icon.png'),
  ].filter(Boolean) as string[]

  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
    } catch {
      // ignore
    }
  }
  return undefined
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// ── 모델 목록 & 현재 모델 ─────────────────────────────────────────────────────

const OPENAI_MODELS: ModelConfig[] = [
  { id: 'gpt-5.3-codex', name: 'GPT-5.3-Codex', provider: 'openai' },
  { id: 'gpt-5.2-codex', name: 'GPT-5.2-Codex', provider: 'openai' },
  { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
]
const ANTHROPIC_MODELS: ModelConfig[] = [
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic' },
]
const GOOGLE_MODELS: ModelConfig[] = [
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google' },
]
const BASE_MODELS: ModelConfig[] = [...OPENAI_MODELS, ...ANTHROPIC_MODELS, ...GOOGLE_MODELS]

function buildAvailableModels(): ModelConfig[] {
  const list: ModelConfig[] = [...BASE_MODELS]
  if (DIFY_MODE) {
    list.unshift({ id: 'dify-agent', name: 'Dify Agent', provider: 'dify' })
  }

  const settings = getSavedModelSettings()
  const vllmModelId = (settings.vllmModelId ?? '').trim() || 'CEN-35B'
  if (vllmModelId && !list.some((m) => m.id === vllmModelId && m.provider === 'vllm')) {
    list.unshift({
      id: vllmModelId,
      name: `vLLM (${vllmModelId})`,
      provider: 'vllm',
    })
  }

  return list
}

function resolveInitialModel(models: ModelConfig[]): ModelConfig {
  const settings = getSavedModelSettings()
  const preferred = (settings.selectedModelId ?? '').trim()
  const envPreferred = (LLM_MODEL ?? '').trim()
  const preferredProvider = settings.selectedProvider
  if (preferredProvider) {
    const byProvider = models.find((m) => m.provider === preferredProvider && m.id === preferred)
    if (byProvider) return byProvider
  }
  return models.find((m) => m.id === preferred)
    ?? models.find((m) => m.id === envPreferred)
    ?? (DIFY_MODE ? models.find((m) => m.provider === 'dify') : undefined)
    ?? models[0]
}

let availableModels: ModelConfig[] = buildAvailableModels()
let currentModel: ModelConfig = resolveInitialModel(availableModels)

// ── 앱 로그(파일) ─────────────────────────────────────────────────────────────

let appLogFilePath: string | null = null

function getAppLogFilePath(): string {
  if (appLogFilePath) return appLogFilePath
  const file = path.join(app.getPath('userData'), 'app.log')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  appLogFilePath = file
  return file
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
}

function appendAppLog(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  try {
    const ts = new Date().toISOString()
    const tail = meta === undefined ? '' : ` ${safeStringify(meta)}`
    fs.appendFileSync(getAppLogFilePath(), `${ts} [${level}] ${message}${tail}\n`, 'utf-8')
  } catch {
    // 파일 로깅 실패는 앱 동작에 영향 주지 않음
  }
}

process.on('uncaughtException', (err) => {
  appendAppLog('ERROR', 'uncaughtException', { message: err.message, stack: err.stack })
})

process.on('unhandledRejection', (reason) => {
  appendAppLog('ERROR', 'unhandledRejection', reason)
})

function getSettingsFilePath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function loadAppSettings(): AppSettings {
  try {
    const file = getSettingsFilePath()
    if (!fs.existsSync(file)) return {}
    const raw = fs.readFileSync(file, 'utf-8')
    const parsed = JSON.parse(raw) as AppSettings
    return parsed ?? {}
  } catch (e) {
    console.warn(`[Settings] 로드 실패: ${(e as Error).message}`)
    return {}
  }
}

function saveAppSettings(next: AppSettings): void {
  try {
    const file = getSettingsFilePath()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf-8')
  } catch (e) {
    console.warn(`[Settings] 저장 실패: ${(e as Error).message}`)
  }
}

function persistDocsRoot(newPath: string): void {
  const prev = loadAppSettings()
  saveAppSettings({ ...prev, docsRoot: newPath })
}

function restoreDocsRootFromSettings(): string | null {
  const s = loadAppSettings()
  const saved = s.docsRoot
  if (!saved) return null
  if (!path.isAbsolute(saved)) return null
  if (!fs.existsSync(saved)) return null
  try {
    if (!fs.statSync(saved).isDirectory()) return null
  } catch {
    return null
  }
  setDocsRoot(saved)
  return saved
}

function getThreadsFilePath(): string {
  return path.join(app.getPath('userData'), 'threads.json')
}

// ── MCP 서버 프로세스 ─────────────────────────────────────────────────────────

let mcpServerProcess: ChildProcess | null = null
let mcpServerSpawnedByApp = false

async function startMcpServer(): Promise<void> {
  const serverScript = path.join(__dirname, 'mcp-server.js')
  const launchPlans = app.isPackaged
    ? [
        { bin: process.execPath, envExtra: { ELECTRON_RUN_AS_NODE: '1' }, label: 'electron-as-node' },
        { bin: process.env.NODE_BINARY?.trim() || 'node', envExtra: {}, label: 'node' },
      ]
    : [
        { bin: process.env.NODE_BINARY?.trim() || 'node', envExtra: {}, label: 'node' },
        { bin: process.execPath, envExtra: { ELECTRON_RUN_AS_NODE: '1' }, label: 'electron-as-node' },
      ]

  let lastError: Error | null = null

  for (const plan of launchPlans) {
    try {
      appendAppLog('INFO', 'MCP launch attempt', { label: plan.label, bin: plan.bin })
      mcpServerProcess = spawn(plan.bin, [serverScript], {
        env: { ...process.env, ...plan.envExtra },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      mcpServerSpawnedByApp = true

      mcpServerProcess.stdout?.on('data', (data) => {
        const line = data.toString().trim()
        console.log(`[MCP-Server] ${line}`)
        appendAppLog('INFO', '[MCP-Server] stdout', line)
      })
      mcpServerProcess.stderr?.on('data', (data) => {
        const line = data.toString().trim()
        console.error(`[MCP-Server] ${line}`)
        appendAppLog('ERROR', '[MCP-Server] stderr', line)
      })
      mcpServerProcess.on('exit', (code) => {
        console.log(`[MCP-Server] 종료 (exit code: ${code})`)
        appendAppLog('WARN', '[MCP-Server] exited', { code })
        if (mcpServerProcess && code !== 0 && code !== null) {
          mcpServerSpawnedByApp = false
        }
      })

      const startError = new Promise<void>((_, reject) => {
        mcpServerProcess!.once('error', (err) => reject(err))
      })

      const earlyExit = new Promise<void>((_, reject) => {
        mcpServerProcess!.once('exit', (code) => {
          if (code !== 0 && code !== null) {
            reject(
              new Error(
                `MCP 서버가 바로 종료되었습니다 (exit ${code}). 포트 ${process.env.MCP_PORT ?? '8001'} 사용 중이면 별도 터미널의 mcp-server를 종료하세요.`,
              ),
            )
          }
        })
      })

      const waitReady = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('MCP 서버 시작 타임아웃(5초)')), 5000)
        const check = setInterval(async () => {
          try {
            const res = await fetch(MCP_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{}',
            })
            if (res.status !== 404) {
              clearInterval(check)
              clearTimeout(timeout)
              resolve()
            }
          } catch {
            // 아직 미준비
          }
        }, 200)
      })

      await Promise.race([startError, earlyExit, waitReady])
      return
    } catch (e) {
      lastError = e as Error
      appendAppLog('WARN', 'MCP launch attempt failed', { label: plan.label, error: lastError.message })
      mcpServerProcess?.kill()
      mcpServerProcess = null
      mcpServerSpawnedByApp = false
    }
  }

  throw lastError ?? new Error('MCP 서버 시작에 실패했습니다.')
}

async function checkMcpServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    return res.status !== 404
  } catch {
    return false
  }
}

// ── MCP 클라이언트 ────────────────────────────────────────────────────────────

let mcpClient: import('@modelcontextprotocol/sdk/client/index.js').Client | null = null
let openaiTools: any[] = []

async function connectMcpClient(): Promise<{ tools: number }> {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')

  const client = new Client({ name: 'ohmyinsite', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL))
  try {
    await client.connect(transport)
    const { tools: toolList } = await client.listTools()

    if (mcpClient) {
      await mcpClient.close().catch(() => {})
    }
    mcpClient = client

    openaiTools = toolList.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description ?? '',
        parameters: (t.inputSchema as any) ?? { type: 'object', properties: {} },
      },
    }))

    console.log(`[MCP] 연결 성공, 도구 ${toolList.length}개 로드`)
    return { tools: toolList.length }
  } catch (e) {
    await client.close().catch(() => {})
    throw e
  }
}

async function syncDocsRootToMcp(newPath: string): Promise<void> {
  try {
    if (!mcpClient) {
      try {
        await connectMcpClient()
      } catch {
        // 연결 실패 시 로컬 경로만 유지
      }
    }
    if (!mcpClient) return

    await mcpClient.callTool({
      name: 'set_docs_root',
      arguments: { path: newPath },
    })
    console.log(`[MCP] 문서 루트 동기화 완료: ${newPath}`)
  } catch (e) {
    console.warn(`[MCP] 문서 루트 동기화 실패: ${(e as Error).message}`)
  }
}

// ── 에이전트 정의 ─────────────────────────────────────────────────────────────

interface AgentDefinition extends AgentInfo {
  systemPrompt: string
}

type IntentType = 'document' | 'code' | 'hybrid' | 'proposal'

interface IntentDecision {
  intent: IntentType
  confidence: number
}

interface SkillProfile {
  id: string
  name: string
  objective: string
  rules: string[]
  outputFormat: string[]
}

const AGENTS: Record<string, AgentDefinition> = {
  'tech-trend': {
    id: 'tech-trend',
    name: '기술동향 분석',
    icon: '🔍',
    description: 'RAG, AI Agent, LLM, Vector DB 등 최신 기술 동향 문서를 검색하고 분석합니다.',
    examples: ['"RAG 관련 최신 동향 요약해줘"', '"AI Agent 기술 트렌드 알려줘"', '"Vector DB 비교 문서 있어?"'],
    systemPrompt: `당신은 기술 동향 분석 전문가입니다.
사용자 질문에 답하기 위해 기술동향 문서 도구를 적극 활용하세요.

## 문서 검색 전략 (순서대로 시도)

1. **search_documents**로 핵심 키워드 검색
   - 검색어를 한국어/영어 모두 시도 (예: "반도체", "semiconductor", "NPU", "AI칩")
   - 축약어, 유사어도 시도

2. **검색 결과가 없거나 부족하면 → list_documents**로 전체 목록 조회
   - 전체 목록에서 질문과 관련 있어 보이는 파일을 직접 선별

3. 관련 파일을 찾으면 **read_document**로 내용 추출 후 요약

## 답변 형식
- 📄 출처 문서명 명시
- 핵심 내용 요약
- 주요 시사점

문서를 끝까지 찾지 못한 경우에만 "관련 문서 없음"으로 답변하세요.`,
  },
  'hr-management': {
    id: 'hr-management',
    name: '인력관리',
    icon: '👥',
    description: '인력 현황, 조직 구성, 채용·배치·평가 등 인사 관련 문서를 분석합니다.',
    examples: ['"현재 인력 현황 정리해줘"', '"팀별 인원 배치 현황 알려줘"', '"채용 관련 서류 있어?"'],
    systemPrompt: `당신은 인력관리 전문 에이전트입니다.
인력, 조직, 채용, 평가 관련 문서를 검색·분석하여 답변하세요.
search_documents와 read_document 도구를 적극 활용하세요.`,
  },
  'biz-planning': {
    id: 'biz-planning',
    name: '사업 기획',
    icon: '📊',
    description: '사업계획, 시장분석, 전략기획 관련 문서를 분석하고 기획을 지원합니다.',
    examples: ['"2025년 사업계획 핵심 내용 요약해줘"', '"시장 분석 자료 있어?"', '"경쟁사 현황 정리해줘"'],
    systemPrompt: `당신은 사업 기획 전문 에이전트입니다.
사업계획, 시장분석, 전략기획 관련 문서를 검색·분석하여 답변하세요.
search_documents와 read_document 도구를 적극 활용하세요.`,
  },
  'project-analysis': {
    id: 'project-analysis',
    name: '프로젝트 분석',
    icon: '📋',
    description: '프로젝트 진행 현황, 일정, 이슈 등을 분석하고 보고합니다.',
    examples: ['"현재 프로젝트 진행 상황 정리해줘"', '"지연 리스크 있는 항목 알려줘"', '"마일스톤 현황 요약해줘"'],
    systemPrompt: `당신은 프로젝트 진행 분석 전문 에이전트입니다.
프로젝트 현황, 일정, 이슈 관련 문서를 검색·분석하여 답변하세요.
search_documents와 read_document 도구를 적극 활용하세요.`,
  },
  'proposal-support': {
    id: 'proposal-support',
    name: '제안서 지원',
    icon: '📝',
    description: '제안서 작성, RFP 분석, 견적·입찰 관련 문서를 지원합니다.',
    examples: ['"RFP 핵심 요구사항 정리해줘"', '"기존 제안서 구성 알려줘"', '"경쟁사 제안 전략 분석해줘"'],
    systemPrompt: `당신은 제안서 지원 전문 에이전트입니다.
제안서, RFP, 입찰 관련 문서를 검색·분석하여 답변하세요.
search_documents와 read_document 도구를 적극 활용하세요.`,
  },
}

// ── 의도 분류 & 프롬프트 강화 ─────────────────────────────────────────────────

function detectIntent(userMessage: string): IntentDecision {
  const q = userMessage.toLowerCase()

  const proposalKeywords = [
    '제안서', 'rfp', '입찰', '견적', '사업계획', '제안', 'proposal', 'executive summary',
  ]
  const codeKeywords = [
    '코드', '버그', '에러', '오류', '디버그', '수정', '리팩토링', '테스트', '빌드', '배포',
    'stack trace', 'typescript', 'javascript', 'node', 'npm', '함수', '클래스', '파일',
  ]
  const docKeywords = [
    '문서', '요약', '분석', '정리', '자료', '근거', '출처', '보고서', '리포트', '정책', '규정',
    '계약', '현황', '트렌드', '시장',
  ]

  const proposalScore = proposalKeywords.reduce((acc, k) => acc + (q.includes(k) ? 1 : 0), 0)
  const codeScore = codeKeywords.reduce((acc, k) => acc + (q.includes(k) ? 1 : 0), 0)
  const docScore = docKeywords.reduce((acc, k) => acc + (q.includes(k) ? 1 : 0), 0)

  if (proposalScore > 0) {
    const confidence = Math.min(0.95, 0.7 + proposalScore * 0.08)
    return { intent: 'proposal', confidence }
  }

  if (codeScore > 0 && docScore > 0) {
    const confidence = Math.min(0.92, 0.62 + Math.min(codeScore, docScore) * 0.08)
    return { intent: 'hybrid', confidence }
  }

  if (codeScore > docScore) {
    const confidence = Math.min(0.9, 0.6 + codeScore * 0.07)
    return { intent: 'code', confidence }
  }

  return {
    intent: 'document',
    confidence: Math.min(0.88, 0.58 + Math.max(docScore, 1) * 0.06),
  }
}

function buildIntentPrompt(basePrompt: string, intent: IntentType, mode: 'chat' | 'task', userMessage: string): string {
  const commonRule = `

## 실행 원칙
- 사용자 질문 의도에 맞춰 필요한 도구만 선택적으로 사용하세요.
- 추정이 필요한 경우 가정을 명시하세요.
- 근거가 있는 내용은 가능한 범위에서 출처 문서명을 답변에 포함하세요.
- 내부 문서로 충분히 답이 나오지 않을 때만 google_search를 보완적으로 사용하세요.`

  const documentRule = `

## 문서 중심 답변 방식
- search_documents → list_documents → read_document 순서로 정보를 확보하세요.
- 답변은 "핵심 요약 / 근거 / 시사점" 순서로 정리하세요.`

  const codeRule = `

## 코드 중심 답변 방식
- 문제 재현/원인/해결안을 단계적으로 제시하세요.
- fs_* 도구로 필요한 파일을 먼저 확인하고, 변경 영향 범위를 설명하세요.
- 사용자 요청이 수정 작업이면 가능한 실행 가능한 패치 수준으로 답변하세요.`

  const hybridRule = `

## 하이브리드 방식 (문서 + 코드)
- 먼저 문서 근거를 수집해 요구사항과 제약을 정리하세요.
- 그 다음 코드/설계 변경안을 제시하세요.
- 최종 답변은 "요구사항 요약 / 근거 문서 / 구현 방안 / 리스크" 순서로 작성하세요.`

  const proposalRule = `

## 제안서 강화 모드
- 긴 문서는 반드시 섹션 단위로 작성하세요: 개요 → 배경/문제정의 → 목표/KPI → 추진전략 → 실행계획 → 인력/예산 → 리스크/대응 → 기대효과.
- 제안서 내용은 근거 기반으로 작성하고, 확인 불가 사항은 "확인 필요"로 표시하세요.
- 표/목록을 적극 사용해 가독성을 높이세요.
- 결과물은 완성된 문서 품질로 작성하세요.`

  const modeRule = mode === 'task'
    ? `\n- 태스크 모드에서는 결과물을 반드시 파일로 저장 가능하도록 구조화하세요.`
    : `\n- 채팅 모드에서는 사용자가 바로 활용할 수 있도록 요약본과 상세본을 함께 제공하세요.`

  const intentRule = intent === 'proposal'
    ? proposalRule
    : intent === 'hybrid'
      ? hybridRule
      : intent === 'code'
        ? codeRule
        : documentRule

  const userContextRule = `

## 사용자 요청 원문
${userMessage.slice(0, 4000)}`

  return `${basePrompt}${commonRule}${intentRule}${modeRule}${userContextRule}`
}

function buildDifyQuery(userMessage: string, intent: IntentType): string {
  if (intent === 'proposal') {
    return `[제안서 강화 모드]\n아래 요청을 장문 제안서 품질로 작성해줘. 섹션별 구조, 근거, 실행계획, 리스크 대응을 포함해.\n\n${userMessage}`
  }
  if (intent === 'hybrid') {
    return `[하이브리드 모드]\n문서 근거를 먼저 정리한 뒤 구현/실행 방안을 제시해줘.\n\n${userMessage}`
  }
  if (intent === 'code') {
    return `[코드 모드]\n문제 재현, 원인, 해결안을 단계적으로 제시해줘.\n\n${userMessage}`
  }
  return userMessage
}

function enrichImplicitReferenceQuery(userMessage: string): string {
  const q = userMessage.trim()
  if (!q) return q

  const deicticPatterns = [
    /이거/,
    /저거/,
    /여기/,
    /이 폴더/,
    /이 파일/,
    /방금/,
    /현재 폴더/,
  ]
  const hasDeictic = deicticPatterns.some((p) => p.test(q))
  if (!hasDeictic) return q

  const docsRoot = getDocsRoot()
  return `${q}

[문맥 정보]
- 사용자가 지칭한 대상("이거/여기/이 폴더")은 현재 문서 루트로 해석하세요.
- 현재 문서 루트: ${docsRoot}
- 먼저 list_documents 또는 search_documents로 대상 자료를 확인한 뒤 분석을 진행하세요.`
}

const CLAUDE_SKILLS: Record<IntentType, SkillProfile> = {
  document: {
    id: 'doc_analyst',
    name: 'Document Analyst',
    objective: '문서 근거를 바탕으로 정확하고 실무형 답변을 제공합니다.',
    rules: [
      '핵심 주장마다 근거 문서를 연결한다.',
      '사실/해석/추정을 구분해 제시한다.',
      '근거가 부족하면 확인 필요 항목으로 분리한다.',
    ],
    outputFormat: [
      '핵심 요약',
      '근거 문서',
      '시사점',
      '확인 필요',
    ],
  },
  code: {
    id: 'code_troubleshooter',
    name: 'Code Troubleshooter',
    objective: '코드 이슈를 재현 가능하게 분석하고 실행 가능한 수정안을 제시합니다.',
    rules: [
      '문제를 재현 가능한 단위로 쪼개어 설명한다.',
      '원인 가설은 우선순위와 함께 제시한다.',
      '수정안은 영향 범위와 검증 방법을 포함한다.',
    ],
    outputFormat: [
      '문제 재현',
      '원인 분석',
      '수정안',
      '검증 방법',
    ],
  },
  hybrid: {
    id: 'doc_code_architect',
    name: 'Doc+Code Architect',
    objective: '문서 요구사항과 코드 구현을 연결해 실행 계획을 제시합니다.',
    rules: [
      '문서 근거로 요구사항/제약을 먼저 정리한다.',
      '요구사항별 구현 방안을 대응시켜 설명한다.',
      '기술 리스크와 운영 리스크를 분리해 제시한다.',
    ],
    outputFormat: [
      '요구사항 요약',
      '근거 문서',
      '구현 방안',
      '리스크/대응',
    ],
  },
  proposal: {
    id: 'proposal_writer_plus',
    name: 'Proposal Writer+',
    objective: '장문 제안서를 구조화해 설득력 있게 작성합니다.',
    rules: [
      '섹션별 목적과 메시지를 분명히 유지한다.',
      '수치/KPI/일정/예산은 가능한 범위에서 명시한다.',
      '검증되지 않은 정보는 확인 필요로 명확히 표시한다.',
    ],
    outputFormat: [
      '개요',
      '배경/문제정의',
      '목표/KPI',
      '추진전략',
      '실행계획',
      '인력/예산',
      '리스크/대응',
      '기대효과',
    ],
  },
}

function buildClaudeSkillPrompt(intent: IntentType): string {
  const skill = CLAUDE_SKILLS[intent]
  const rules = skill.rules.map((r) => `- ${r}`).join('\n')
  const format = skill.outputFormat.map((f) => `- ${f}`).join('\n')

  return `

## Claude Skill Profile
- skill_id: ${skill.id}
- skill_name: ${skill.name}
- objective: ${skill.objective}

### Skill Rules
${rules}

### Output Contract
${format}`
}

// ── Dify Agent 호출 ───────────────────────────────────────────────────────────

const difyConversations: Record<string, string> = {}

class AgentStoppedError extends Error {
  constructor() {
    super('요청이 사용자에 의해 중지되었습니다.')
    this.name = 'AgentStoppedError'
  }
}

function throwIfStopped(shouldStop: () => boolean): void {
  if (shouldStop()) {
    throw new AgentStoppedError()
  }
}

async function runDifyAgent(
  userMessage: string,
  onChunk: (chunk: Chunk) => void,
  agentId?: string,
  shouldStop: () => boolean = () => false,
): Promise<void> {
  if (!DIFY_MODE) {
    throw new Error('Dify 모드가 비활성화되어 있습니다. DIFY_MODE=true 로 설정하세요.')
  }
  const credential = resolveProviderCredential('dify')
  if (!credential) {
    throw new Error('Dify 인증 정보가 없습니다. 앱에서 인증 정보를 입력해 주세요.')
  }
  appendAppLog('INFO', 'Dify auth mode', { source: credential.source })

  const agent = AGENTS[agentId ?? 'tech-trend'] ?? AGENTS['tech-trend']
  const conversationId = difyConversations[agent.id] ?? ''

  const res = await fetch(`${DIFY_API_URL}/chat-messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${credential.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: { agent_type: agent.id },
      query: userMessage,
      response_mode: 'streaming',
      conversation_id: conversationId,
      user: 'electron-user',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Dify API 오류 (${res.status}): ${body}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('응답 스트림을 읽을 수 없습니다.')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    throwIfStopped(shouldStop)
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      throwIfStopped(shouldStop)
      if (!line.startsWith('data: ')) continue
      const jsonStr = line.slice(6).trim()
      if (!jsonStr) continue

      try {
        const event = JSON.parse(jsonStr)

        switch (event.event) {
          case 'agent_message':
          case 'message':
            if (event.answer) {
              onChunk({ type: 'text', text: event.answer })
            }
            break

          case 'agent_thought':
            if (event.tool) {
              onChunk({ type: 'tool', name: event.tool })
            }
            if (event.tool === 'read_document' && event.observation) {
              try {
                const obs = JSON.parse(event.observation)
                const docData = obs.read_document ? JSON.parse(obs.read_document) : obs
                if (docData.text) {
                  onChunk({
                    type: 'doc-preview',
                    docTitle: docData.title ?? docData.path ?? '문서',
                    docText: docData.text,
                  })
                }
              } catch {
                // observation 파싱 실패 무시
              }
            }
            break

          case 'message_end':
            if (event.conversation_id) {
              difyConversations[agent.id] = event.conversation_id
            }
            break

          case 'error':
            throw new Error(`Dify 에러: ${event.message ?? JSON.stringify(event)}`)
        }
      } catch (e) {
        if (e instanceof SyntaxError) {
          // JSON 파싱 실패 무시
        } else {
          throw e
        }
      }
    }
  }
}

// ── OpenAI Agent 호출 ─────────────────────────────────────────────────────────

async function runOpenAIAgent(
  messages: any[],
  onChunk: (chunk: Chunk) => void,
  agentId?: string,
  systemPromptOverride?: string,
  provider: ProviderName = 'openai',
  shouldStop: () => boolean = () => false,
): Promise<void> {
  if (!mcpClient) throw new Error('MCP 서버에 연결되지 않았습니다.')
  const credential = resolveProviderCredential(provider)
  if (!credential) {
    if (provider === 'google') {
      throw new Error('Google 인증 정보가 없습니다. 앱에서 인증 정보를 입력해 주세요.')
    }
    if (provider === 'vllm') {
      throw new Error('vLLM 설정이 올바르지 않습니다. 모델 설정에서 주소/모델을 확인해 주세요.')
    }
    throw new Error('OpenAI API 키가 없습니다. 앱에서 인증 정보를 입력해 주세요.')
  }
  appendAppLog('INFO', 'OpenAI-compatible auth mode', { provider, source: credential.source })
  const baseURL = resolveBaseURL(provider)
  appendAppLog('INFO', 'OpenAI-compatible target', {
    provider,
    baseURL: baseURL ?? 'https://api.openai.com/v1 (default)',
    model: currentModel.id,
  })

  const OpenAI = (await import('openai')).default
  const openai = new OpenAI({
    apiKey: credential.token,
    ...(baseURL ? { baseURL } : {}),
  })
  const agent = AGENTS[agentId ?? 'tech-trend'] ?? AGENTS['tech-trend']
  const systemPrompt = systemPromptOverride ?? agent.systemPrompt
  const conversation: any[] = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]
  let effectiveModel = currentModel.id
  let downgradedToStable = false

  const isCodexModel = (modelId: string): boolean => /codex/i.test(modelId)
  const isServer5xx = (err: unknown): boolean => {
    const status = Number((err as any)?.status ?? 0)
    if (status >= 500 && status < 600) return true
    const msg = String((err as any)?.message ?? err ?? '')
    return /\b5\d\d\b/.test(msg)
  }

  const runResponsesCodex = async (): Promise<void> => {
    const input = [
      { role: 'system', content: systemPrompt },
      ...messages
        .filter((m) => m?.role === 'user' || m?.role === 'assistant')
        .map((m) => ({ role: m.role, content: String(m.content ?? '') })),
    ]

    const response: any = await (openai as any).responses.create({
      model: effectiveModel,
      input,
      stream: false,
    })

    const text = String(response?.output_text ?? '').trim()
    if (text) {
      onChunk({ type: 'text', text })
      return
    }

    const joined = Array.isArray(response?.output)
      ? response.output
        .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
        .map((c: any) => c?.text?.value ?? c?.text ?? '')
        .filter(Boolean)
        .join('\n')
      : ''
    if (joined) onChunk({ type: 'text', text: joined })
  }

  if (provider === 'openai' && isCodexModel(effectiveModel)) {
    appendAppLog('INFO', 'codex model selected; using responses API path', { model: effectiveModel })
    await runResponsesCodex()
    return
  }

  const buildCompletionPrompt = (): string => {
    const lines: string[] = []
    lines.push(`[SYSTEM]\n${systemPrompt}\n`)
    for (const m of messages) {
      const role = String(m?.role ?? 'user').toUpperCase()
      const content = String(m?.content ?? '')
      lines.push(`[${role}]\n${content}\n`)
    }
    lines.push('[ASSISTANT]\n')
    return lines.join('\n')
  }

  const runCompletionFallback = async (modelId: string): Promise<void> => {
    const prompt = buildCompletionPrompt()
    const stream = await openai.completions.create({
      model: modelId,
      prompt,
      stream: true,
      max_tokens: 4096,
    } as any)
    for await (const chunk of stream as any) {
      throwIfStopped(shouldStop)
      const text = chunk?.choices?.[0]?.text
      if (text) onChunk({ type: 'text', text })
    }
  }

  while (true) {
    throwIfStopped(shouldStop)
    let stream: any
    try {
      stream = await openai.chat.completions.create({
        model: effectiveModel,
        messages: conversation,
        tools: openaiTools,
        tool_choice: 'auto',
        stream: true,
      })
    } catch (e) {
      const msg = String((e as Error)?.message ?? e)
      const isNotChatModel = msg.includes('not a chat model') || msg.includes('/v1/chat/completions')
      if (isNotChatModel) {
        appendAppLog('WARN', 'chat.completions unsupported; fallback to completions', {
          provider,
          model: effectiveModel,
        })
        try {
          await runCompletionFallback(effectiveModel)
          return
        } catch (fallbackErr) {
          if (isServer5xx(fallbackErr) && isCodexModel(effectiveModel) && !downgradedToStable) {
            downgradedToStable = true
            effectiveModel = 'gpt-4.1'
            onChunk({ type: 'text', text: '\n\n(안내) Codex 모델 오류로 GPT-4.1로 자동 전환해 재시도합니다.\n' })
            continue
          }
          throw fallbackErr
        }
      }

      if (isServer5xx(e) && isCodexModel(effectiveModel) && !downgradedToStable) {
        downgradedToStable = true
        effectiveModel = 'gpt-4.1'
        onChunk({ type: 'text', text: '\n\n(안내) Codex 모델 오류로 GPT-4.1로 자동 전환해 재시도합니다.\n' })
        continue
      }
      throw e
    }

    let fullContent = ''
    const toolCalls: any[] = []

    for await (const chunk of stream) {
      throwIfStopped(shouldStop)
      const delta = chunk.choices[0]?.delta as any

      if (delta?.content) {
        fullContent += delta.content
        onChunk({ type: 'text', text: delta.content })
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.index !== undefined) {
            if (!toolCalls[tc.index]) {
              toolCalls[tc.index] = { id: '', type: 'function', function: { name: '', arguments: '' } }
            }
            if (tc.id) toolCalls[tc.index].id = tc.id
            if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name
            if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments
          }
        }
      }
    }

    if (toolCalls.length === 0) {
      conversation.push({ role: 'assistant', content: fullContent })
      break
    }

    conversation.push({ role: 'assistant', content: fullContent || null, tool_calls: toolCalls })

    for (const tc of toolCalls) {
      throwIfStopped(shouldStop)
      onChunk({ type: 'tool', name: tc.function.name })
      const args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>
      const mcpResult = await mcpClient.callTool({ name: tc.function.name, arguments: args })
      const resultText = (mcpResult.content as any[])
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n')

      if (tc.function.name === 'read_document') {
        try {
          const obs = JSON.parse(resultText)
          if (obs.text) {
            onChunk({ type: 'doc-preview', docTitle: obs.title ?? args.path ?? '문서', docText: obs.text })
          }
        } catch {}
      }

      onChunk({ type: 'tool', name: tc.function.name, toolArgs: args, toolResult: resultText })
      conversation.push({ role: 'tool', tool_call_id: tc.id, content: resultText })
    }
  }
}

// ── Anthropic (Claude) Agent 호출 ────────────────────────────────────────────

async function runAnthropicAgent(
  messages: any[],
  onChunk: (chunk: Chunk) => void,
  agentId?: string,
  systemPromptOverride?: string,
  shouldStop: () => boolean = () => false,
): Promise<void> {
  if (!mcpClient) throw new Error('MCP 서버에 연결되지 않았습니다.')
  const credential = resolveProviderCredential('anthropic')
  if (!credential) {
    throw new Error('Anthropic 인증 정보가 없습니다. 앱에서 인증 정보를 입력해 주세요.')
  }
  appendAppLog('INFO', 'Anthropic auth mode', { source: credential.source })

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const anthropic = new Anthropic({ apiKey: credential.token })

  const agent = AGENTS[agentId ?? 'tech-trend'] ?? AGENTS['tech-trend']
  const systemPrompt = systemPromptOverride ?? agent.systemPrompt

  // MCP tools → Anthropic 포맷 변환
  const anthropicTools = openaiTools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  })) as any[]

  // 대화 히스토리 변환 (system 제외)
  let conversation: any[] = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content ?? '' }))

  while (true) {
    throwIfStopped(shouldStop)
    let fullText = ''
    const toolsByIndex = new Map<number, { id: string; name: string; inputJson: string }>()

    const stream = anthropic.messages.stream({
      model: currentModel.id,
      max_tokens: 8192,
      system: systemPrompt,
      messages: conversation,
      tools: anthropicTools,
    })

    for await (const event of (stream as any)) {
      throwIfStopped(shouldStop)
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          toolsByIndex.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            inputJson: '',
          })
          onChunk({ type: 'tool', name: event.content_block.name })
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          fullText += event.delta.text
          onChunk({ type: 'text', text: event.delta.text })
        } else if (event.delta.type === 'input_json_delta') {
          const tool = toolsByIndex.get(event.index)
          if (tool) tool.inputJson += event.delta.partial_json
        }
      }
    }

    const finalMessage = await stream.finalMessage()

    // 도구 호출 없으면 종료
    const toolUseBlocks = finalMessage.content.filter((b: any) => b.type === 'tool_use')
    if (toolUseBlocks.length === 0) {
      conversation.push({ role: 'assistant', content: fullText })
      break
    }

    conversation.push({ role: 'assistant', content: finalMessage.content })

    const toolResults: any[] = []
    for (const [, tool] of toolsByIndex) {
      throwIfStopped(shouldStop)
      let input: any = {}
      try { input = JSON.parse(tool.inputJson || '{}') } catch {}

      const mcpResult = await mcpClient.callTool({ name: tool.name, arguments: input })
      const resultText = (mcpResult.content as any[])
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n')

      // doc-preview 처리
      if (tool.name === 'read_document') {
        try {
          const obs = JSON.parse(resultText)
          if (obs.text) {
            onChunk({ type: 'doc-preview', docTitle: obs.title ?? input.path ?? '문서', docText: obs.text })
          }
        } catch {}
      }

      onChunk({ type: 'tool', name: tool.name, toolArgs: input, toolResult: resultText })

      toolResults.push({
        type: 'tool_result',
        tool_use_id: tool.id,
        content: resultText,
      })
    }

    conversation.push({ role: 'user', content: toolResults })
  }
}

// ── LLM 디스패처 ─────────────────────────────────────────────────────────────

async function runLLMAgent(
  messages: any[],
  onChunk: (chunk: Chunk) => void,
  agentId?: string,
  systemPromptOverride?: string,
  mode: 'chat' | 'task' = 'chat',
  shouldStop: () => boolean = () => false,
): Promise<void> {
  throwIfStopped(shouldStop)
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
  const rawUserQuery = String(lastUserMsg?.content ?? '')
  const userQuery = enrichImplicitReferenceQuery(rawUserQuery)
  const intentDecision = detectIntent(userQuery)
  console.log(`[Intent] ${intentDecision.intent} (${intentDecision.confidence.toFixed(2)})`)

  const routingChunk: Chunk = {
    type: 'meta',
    metaKind: 'routing',
    intent: intentDecision.intent,
    provider: currentModel.provider,
  }

  if (currentModel.provider === 'dify') {
    throwIfStopped(shouldStop)
    onChunk(routingChunk)
    const routedQuery = buildDifyQuery(userQuery, intentDecision.intent)
    await runDifyAgent(routedQuery, onChunk, agentId, shouldStop)
  } else if (currentModel.provider === 'anthropic') {
    const agent = AGENTS[agentId ?? 'tech-trend'] ?? AGENTS['tech-trend']
    const promptBase = systemPromptOverride ?? agent.systemPrompt
    const enhancedPrompt = buildIntentPrompt(promptBase, intentDecision.intent, mode, userQuery)
    const claudeSkillPrompt = buildClaudeSkillPrompt(intentDecision.intent)
    const finalPrompt = `${enhancedPrompt}${claudeSkillPrompt}`
    const skillId = CLAUDE_SKILLS[intentDecision.intent].id
    console.log(`[Claude Skill] ${skillId}`)
    throwIfStopped(shouldStop)
    onChunk({ ...routingChunk, skillId })
    await runAnthropicAgent(messages, onChunk, agentId, finalPrompt, shouldStop)
  } else {
    throwIfStopped(shouldStop)
    onChunk(routingChunk)
    const agent = AGENTS[agentId ?? 'tech-trend'] ?? AGENTS['tech-trend']
    const promptBase = systemPromptOverride ?? agent.systemPrompt
    const enhancedPrompt = buildIntentPrompt(promptBase, intentDecision.intent, mode, userQuery)
    await runOpenAIAgent(messages, onChunk, agentId, enhancedPrompt, currentModel.provider as ProviderName, shouldStop)
  }
}

// ── 태스크 관리 ───────────────────────────────────────────────────────────────

const tasks = new Map<string, Task>()
let mainWindow: BrowserWindow | null = null
const chatStopFlags = new Map<number, boolean>()

function saveThreadsToDisk(): void {
  try {
    const file = getThreadsFilePath()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const list = Array.from(tasks.values()).map((t) => ({ ...t, log: [...t.log] }))
    fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf-8')
  } catch (e) {
    console.warn(`[Threads] 저장 실패: ${(e as Error).message}`)
    appendAppLog('ERROR', 'Threads save failed', { message: (e as Error).message })
  }
}

function loadThreadsFromDisk(): void {
  try {
    const file = getThreadsFilePath()
    if (!fs.existsSync(file)) return
    const raw = fs.readFileSync(file, 'utf-8')
    const list = JSON.parse(raw) as Task[]
    if (!Array.isArray(list)) return
    tasks.clear()
    for (const t of list) {
      const normalized: Task = {
        ...t,
        outputFiles: Array.isArray(t.outputFiles) ? t.outputFiles : [],
        log: Array.isArray(t.log) ? t.log : [],
        threadMessages: Array.isArray((t as any).threadMessages) ? (t as any).threadMessages : [],
      }
      tasks.set(normalized.id, normalized)
    }
    console.log(`[Threads] ${tasks.size}개 복원됨`)
    appendAppLog('INFO', 'Threads restored', { count: tasks.size })
  } catch (e) {
    console.warn(`[Threads] 복원 실패: ${(e as Error).message}`)
    appendAppLog('ERROR', 'Threads restore failed', { message: (e as Error).message })
  }
}

function notifyTaskUpdate(task: Task): void {
  mainWindow?.webContents.send('task-updated', { ...task, log: [...task.log] })
  saveThreadsToDisk()
}

function addTaskLog(task: Task, type: TaskLogEntry['type'], text: string): void {
  task.log.push({ time: new Date().toISOString(), type, text })
  appendAppLog(type === 'error' ? 'ERROR' : 'INFO', `Thread(${task.id}) ${type}`, text)
  notifyTaskUpdate(task)
}

async function runTask(task: Task): Promise<void> {
  const docsRoot = getDocsRoot()
  const outputDir = path.join(docsRoot, 'outputs')
  fs.mkdirSync(outputDir, { recursive: true })

  task.status = 'running'
  notifyTaskUpdate(task)
  addTaskLog(task, 'info', '태스크를 시작합니다...')

  const agent = AGENTS[task.agentId] ?? AGENTS['tech-trend']
  const taskSystemPrompt = `${agent.systemPrompt}

## 자율 작업 모드
주어진 태스크를 완전히 자율적으로 완료하세요.
- 관련 문서를 검색·읽어 필요한 정보를 수집하세요
- 작업 결과물은 반드시 fs_write_file로 파일에 저장하세요
- 출력 파일 경로: "${outputDir}/<파일명>"
- 마크다운(.md) 형식으로 저장하세요
- 완료 후 저장한 파일 경로를 반드시 응답에 포함하세요`

  try {
    await runLLMAgent(
      [{ role: 'user', content: task.title + '\n\n' + (task as any).prompt }],
      (chunk) => {
        if (chunk.type === 'tool' && chunk.name && !chunk.toolResult) {
          addTaskLog(task, 'tool', `도구 실행: ${chunk.name}`)
        }
        if (chunk.type === 'tool' && chunk.name === 'fs_write_file' && chunk.toolArgs?.path) {
          const filePath = chunk.toolArgs.path as string
          if (!task.outputFiles.includes(filePath)) {
            task.outputFiles.push(filePath)
            addTaskLog(task, 'output', `파일 저장됨: ${path.basename(filePath)}`)
          }
        }
      },
      task.agentId,
      taskSystemPrompt,
      'task',
    )

    task.status = 'completed'
    task.completedAt = new Date().toISOString()
    addTaskLog(task, 'info', '태스크가 완료되었습니다.')
  } catch (e) {
    task.status = 'failed'
    task.error = (e as Error).message
    addTaskLog(task, 'error', `오류: ${(e as Error).message}`)
  }

  notifyTaskUpdate(task)
}

// ── Electron 윈도우 ───────────────────────────────────────────────────────────

function createWindow(): void {
  const iconPath = resolveAppIconPath()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 800,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
    title: APP_TITLE,
    ...(iconPath ? { icon: iconPath } : {}),
    backgroundColor: '#0d0d1a',
  })
  if (process.platform === 'darwin' && iconPath) {
    app.dock?.setIcon(iconPath)
  }
  mainWindow.loadFile('index.html')
  mainWindow.webContents.openDevTools()
}

// ── IPC 핸들러 ────────────────────────────────────────────────────────────────

ipcMain.handle('init-mcp', async () => {
  try {
    mcpServerSpawnedByApp = false
    const running = await checkMcpServerRunning()
    if (!running) {
      console.log('[MCP] 실행 중인 서버 없음, 내장 MCP 서버를 시작합니다…')
      await startMcpServer()
    }
    try {
      const { tools } = await connectMcpClient()
      await syncDocsRootToMcp(getDocsRoot())
      console.log('[MCP] 이미 실행 중인 MCP 서버에 연결했습니다.')
      return { ok: true, tools, difyMode: currentModel.provider === 'dify' }
    } catch {
      if (currentModel.provider === 'dify') {
        console.warn('[MCP] MCP 클라이언트 연결 실패. Dify 전용 모드로 계속 진행합니다.')
        return { ok: true, tools: 0, difyMode: true }
      }
      throw new Error('MCP 서버 연결 실패: OpenAI/Claude 사용을 위해 MCP 연결이 필요합니다.')
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
})

ipcMain.handle('get-agents', async (): Promise<AgentInfo[]> => {
  return Object.values(AGENTS).map(({ id, name, icon, description, examples }) => ({
    id, name, icon, description, examples,
  }))
})

ipcMain.handle('get-app-meta', async () => {
  return { title: APP_TITLE }
})

ipcMain.on('send-message', async (event, { messages, agentId }: { messages: any[]; agentId?: string }) => {
  const senderId = event.sender.id
  chatStopFlags.set(senderId, false)
  appendAppLog('INFO', 'send-message received', {
    senderId,
    model: currentModel.id,
    provider: currentModel.provider,
    messageCount: Array.isArray(messages) ? messages.length : 0,
  })
  try {
    await withTimeout(
      runLLMAgent(
        messages,
        (chunk) => event.sender.send('agent-chunk', chunk),
        agentId,
        undefined,
        'chat',
        () => chatStopFlags.get(senderId) === true,
      ),
      CHAT_REQUEST_TIMEOUT_MS,
      `응답이 지연되어 자동 중단되었습니다. (${Math.round(CHAT_REQUEST_TIMEOUT_MS / 1000)}초 초과)`,
    )
    if (chatStopFlags.get(senderId) === true) {
      appendAppLog('INFO', 'send-message stopped', { senderId })
      event.sender.send('agent-stopped')
    } else {
      appendAppLog('INFO', 'send-message done', { senderId })
      event.sender.send('agent-done')
    }
  } catch (e) {
    if (e instanceof AgentStoppedError) {
      appendAppLog('INFO', 'send-message stopped', { senderId })
      event.sender.send('agent-stopped')
    } else {
      appendAppLog('ERROR', 'send-message failed', {
        senderId,
        message: (e as Error).message,
        stack: (e as Error).stack,
      })
      event.sender.send('agent-error', (e as Error).message)
    }
  } finally {
    chatStopFlags.delete(senderId)
  }
})

ipcMain.on('stop-message', (event) => {
  const senderId = event.sender.id
  chatStopFlags.set(senderId, true)
  appendAppLog('INFO', 'stop-message requested', { senderId })
})

// 모델 IPC
ipcMain.handle('get-models', () => availableModels)
ipcMain.handle('get-current-model', () => currentModel)
ipcMain.handle('set-model', (_event, modelId: string) => {
  const model = availableModels.find((m) => m.id === modelId)
  if (model) {
    currentModel = model
    const prev = loadAppSettings()
    const prevModel = prev.model ?? {}
    saveAppSettings({
      ...prev,
      model: {
        ...prevModel,
        selectedProvider: model.provider as ProviderName,
        selectedModelId: model.id,
      },
    })
    console.log(`[Model] 변경됨: ${model.name}`)
    return { ok: true }
  }
  return { ok: false }
})

ipcMain.handle('get-model-settings', () => {
  const settings = getSavedModelSettings()
  const selectedProvider = settings.selectedProvider ?? (currentModel.provider as ProviderName)
  return {
    selectedProvider,
    selectedModelId: currentModel.id,
    openaiModelId: (settings.openaiModelId ?? OPENAI_MODELS[0].id).trim(),
    anthropicModelId: (settings.anthropicModelId ?? ANTHROPIC_MODELS[0].id).trim(),
    googleModelId: (settings.googleModelId ?? GOOGLE_MODELS[0].id).trim(),
    vllmModelId: (settings.vllmModelId ?? 'CEN-35B').trim(),
    vllmBaseUrl: (settings.vllmBaseUrl ?? LLM_BASE_URL ?? '').trim(),
    googleBaseUrl: (settings.googleBaseUrl ?? GOOGLE_LLM_BASE_URL ?? '').trim(),
    openaiUseCustomBaseUrl: settings.openaiUseCustomBaseUrl ?? OPENAI_USE_CUSTOM_BASE_URL,
    openaiBaseUrl: (settings.openaiBaseUrl ?? LLM_BASE_URL ?? '').trim(),
  }
})

ipcMain.handle('save-model-settings', (_event, input: {
  selectedProvider?: ProviderName
  selectedModelId?: string
  openaiModelId?: string
  anthropicModelId?: string
  googleModelId?: string
  vllmModelId?: string
  vllmBaseUrl?: string
  googleBaseUrl?: string
  openaiUseCustomBaseUrl: boolean
  openaiBaseUrl?: string
}) => {
  const selectedProvider = input.selectedProvider
  const selectedModelId = (input.selectedModelId ?? '').trim()
  const openaiModelId = (input.openaiModelId ?? '').trim()
  const anthropicModelId = (input.anthropicModelId ?? '').trim()
  const googleModelId = (input.googleModelId ?? '').trim()
  const vllmModelId = (input.vllmModelId ?? '').trim()
  const vllmBaseUrl = (input.vllmBaseUrl ?? '').trim()
  const googleBaseUrl = (input.googleBaseUrl ?? '').trim()
  const openaiUseCustomBaseUrl = input.openaiUseCustomBaseUrl === true
  const openaiBaseUrl = (input.openaiBaseUrl ?? '').trim()

  const prev = loadAppSettings()
  const prevModel = prev.model ?? {}
  const nextModel: ModelSettings = {
    ...prevModel,
    ...(selectedProvider ? { selectedProvider } : {}),
    ...(selectedModelId ? { selectedModelId } : {}),
    ...(openaiModelId ? { openaiModelId } : {}),
    ...(anthropicModelId ? { anthropicModelId } : {}),
    ...(googleModelId ? { googleModelId } : {}),
    ...(vllmModelId ? { vllmModelId } : {}),
    ...(vllmBaseUrl ? { vllmBaseUrl } : {}),
    ...(googleBaseUrl ? { googleBaseUrl } : {}),
    openaiUseCustomBaseUrl,
    openaiBaseUrl,
  }
  saveAppSettings({ ...prev, model: nextModel })

  availableModels = buildAvailableModels()
  if (selectedProvider && selectedModelId) {
    const bySelection = availableModels.find((m) => m.provider === selectedProvider && m.id === selectedModelId)
    if (bySelection) currentModel = bySelection
  }
  if (!availableModels.some((m) => m.id === currentModel.id && m.provider === currentModel.provider)) {
    currentModel = resolveInitialModel(availableModels)
  }
  return { ok: true, models: availableModels, currentModel }
})

ipcMain.handle('get-provider-auth-status', (_event, provider: ProviderName) => {
  const credential = resolveProviderCredential(provider)
  return { connected: !!credential, source: credential?.source ?? null }
})

ipcMain.handle('get-provider-auth-preview', (_event, provider: ProviderName) => {
  const credential = resolveProviderCredential(provider)
  const token = credential?.token ?? ''
  if (!token) {
    return { connected: false, source: null, masked: '' }
  }
  const tail = token.slice(-4)
  const masked = `********${tail}`
  return { connected: true, source: credential?.source ?? null, masked }
})

ipcMain.handle(
  'save-provider-auth',
  (
    _event,
    input: { provider: ProviderName; apiKey?: string; sessionToken?: string },
  ): { ok: boolean; error?: string } => {
    const provider = input?.provider
    if (!provider || !['openai', 'anthropic', 'google', 'vllm', 'dify'].includes(provider)) {
      return { ok: false, error: '유효하지 않은 provider입니다.' }
    }

    const apiKey = (input.apiKey ?? '').trim()
    const sessionToken = (input.sessionToken ?? '').trim()
    if (!apiKey && !sessionToken) {
      return { ok: false, error: '저장할 인증 값이 없습니다.' }
    }

    const prev = loadAppSettings()
    const prevAuth = prev.auth ?? {}
    const nextAuth = {
      ...prevAuth,
      [provider]: {
        ...(apiKey ? { apiKey } : {}),
        ...(sessionToken ? { sessionToken } : {}),
      },
    }
    saveAppSettings({ ...prev, auth: nextAuth })
    appendAppLog('INFO', 'provider auth saved', {
      provider,
      apiKey: !!apiKey,
      sessionToken: !!sessionToken,
    })
    return { ok: true }
  },
)

// 태스크 IPC
ipcMain.handle('create-task', async (_event, { title, prompt, agentId }: { title: string; prompt: string; agentId: string }) => {
  appendAppLog('INFO', 'create-thread request', {
    title,
    agentId,
    promptLength: (prompt ?? '').length,
  })
  const task: Task = {
    id: `task-${Date.now()}`,
    title,
    agentId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    outputFiles: [],
    log: [],
    threadMessages: [],
  }
  ;(task as any).prompt = prompt
  tasks.set(task.id, task)
  appendAppLog('INFO', 'create-thread accepted', { id: task.id, title: task.title })
  notifyTaskUpdate(task)

  // 백그라운드 실행
  runTask(task).catch((e) => console.error('[Task] 실행 오류:', e))

  return { ...task }
})

ipcMain.handle('create-thread', async (_event, { title, agentId }: { title: string; agentId: string }) => {
  const thread: Task = {
    id: `thread-${Date.now()}`,
    title,
    agentId,
    status: 'completed',
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    outputFiles: [],
    log: [],
    threadMessages: [],
  }
  tasks.set(thread.id, thread)
  addTaskLog(thread, 'info', '스레드가 시작되었습니다.')
  notifyTaskUpdate(thread)
  appendAppLog('INFO', 'create-thread accepted', { id: thread.id, title: thread.title })
  return { ...thread }
})

ipcMain.handle('update-task-title', async (_event, { taskId, title }: { taskId: string; title: string }) => {
  const task = tasks.get(taskId)
  if (!task) return { ok: false, error: '스레드를 찾을 수 없습니다.' }

  const nextTitle = String(title ?? '').trim().slice(0, 120)
  if (!nextTitle) return { ok: false, error: '제목이 비어 있습니다.' }

  task.title = nextTitle
  appendAppLog('INFO', 'thread title updated', { id: task.id, title: task.title })
  notifyTaskUpdate(task)
  return { ok: true }
})

ipcMain.handle('append-thread-log', async (
  _event,
  { threadId, type, text }: { threadId: string; type: TaskLogEntry['type']; text: string },
) => {
  const thread = tasks.get(threadId)
  if (!thread) return { ok: false, error: '스레드를 찾을 수 없습니다.' }
  addTaskLog(thread, type, text)
  return { ok: true }
})

ipcMain.handle('append-thread-message', async (
  _event,
  { threadId, role, text }: { threadId: string; role: 'user' | 'assistant'; text: string },
) => {
  const thread = tasks.get(threadId)
  if (!thread) return { ok: false, error: '스레드를 찾을 수 없습니다.' }

  if (!thread.threadMessages) thread.threadMessages = []
  thread.threadMessages.push({
    time: new Date().toISOString(),
    role,
    text,
  })
  addTaskLog(thread, 'info', `${role === 'user' ? '사용자' : '에이전트'} 메시지 추가`)
  notifyTaskUpdate(thread)
  return { ok: true }
})

ipcMain.handle('get-tasks', () => {
  return Array.from(tasks.values()).map((t) => ({
    ...t,
    log: [...t.log],
    threadMessages: [...(t.threadMessages ?? [])],
  }))
})

ipcMain.handle('cancel-task', (_event, taskId: string) => {
  const task = tasks.get(taskId)
  if (task && task.status === 'running') {
    task.status = 'cancelled'
    addTaskLog(task, 'info', '태스크가 취소되었습니다.')
    notifyTaskUpdate(task)
    return { ok: true }
  }
  return { ok: false }
})

ipcMain.handle('delete-task', (_event, taskId: string) => {
  const existed = tasks.delete(taskId)
  if (existed) {
    saveThreadsToDisk()
    appendAppLog('INFO', 'thread deleted', { id: taskId })
    return { ok: true }
  }
  return { ok: false, error: '삭제할 스레드를 찾을 수 없습니다.' }
})

// 폴더 IPC
ipcMain.handle('pick-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: '문서 폴더 선택',
  })
  if (canceled || filePaths.length === 0) return { ok: false }

  const newPath = filePaths[0]
  setDocsRoot(newPath)
  persistDocsRoot(newPath)
  await syncDocsRootToMcp(newPath)
  return { ok: true, path: newPath }
})

ipcMain.handle('set-current-folder', async (_event, newPath: string) => {
  try {
    if (!newPath || typeof newPath !== 'string') {
      return { ok: false, error: '유효한 경로가 아닙니다.' }
    }
    if (!path.isAbsolute(newPath)) {
      return { ok: false, error: '절대 경로만 허용됩니다.' }
    }
    if (!fs.existsSync(newPath)) {
      return { ok: false, error: '경로가 존재하지 않습니다.' }
    }

    const stat = fs.statSync(newPath)
    let targetDir = newPath
    if (!stat.isDirectory()) {
      // 파일을 드롭한 경우에는 부모 폴더를 문서 루트로 사용
      targetDir = path.dirname(newPath)
    }

    setDocsRoot(targetDir)
    persistDocsRoot(targetDir)
    await syncDocsRootToMcp(targetDir)
    return { ok: true, path: targetDir }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
})

ipcMain.handle('get-current-folder', async () => {
  return { path: getDocsRoot() }
})

ipcMain.handle('get-folder-tree', async () => {
  const rootPath = getDocsRoot()

  function buildTree(dirPath: string): any {
    const name = path.basename(dirPath)
    const node: any = { name, path: dirPath, type: 'directory', children: [] }

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const fullPath = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          node.children.push(buildTree(fullPath))
        } else {
          node.children.push({ name: entry.name, path: fullPath, type: 'file' })
        }
      }
      node.children.sort((a: any, b: any) => {
        if (a.type === b.type) return a.name.localeCompare(b.name)
        return a.type === 'directory' ? -1 : 1
      })
    } catch (e) {
      console.error('Failed to read directory:', dirPath, e)
    }

    return node
  }

  return buildTree(rootPath)
})

// ── 앱 생명주기 ───────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  appendAppLog('INFO', 'App starting')
  const restored = restoreDocsRootFromSettings()
  if (restored) {
    console.log(`[Settings] 문서 루트 복원됨: ${restored}`)
    appendAppLog('INFO', 'Docs root restored', { path: restored })
  }
  loadThreadsFromDisk()
  createWindow()
  appendAppLog('INFO', 'Window created')
})

app.on('window-all-closed', () => {
  appendAppLog('INFO', 'App closing')
  if (mcpClient) mcpClient.close().catch(() => {})
  if (mcpServerSpawnedByApp && mcpServerProcess) {
    mcpServerProcess.kill()
    mcpServerSpawnedByApp = false
  }
  app.quit()
})
