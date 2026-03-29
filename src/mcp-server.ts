/**
 * MCP Streamable HTTP Server
 *
 * 문서 도구(list_documents, search_documents, read_document, get_categories)와
 * 파일시스템 도구(fs_*)를 MCP Streamable HTTP 프로토콜로 노출합니다.
 *
 * 기본 포트: 8001 (환경변수 MCP_PORT로 변경 가능)
 * Dify 연결 URL: http://host.docker.internal:8001/mcp
 * Electron 연결 URL: http://localhost:8001/mcp
 *
 * 실행: node dist/mcp-server.js
 */
import * as dotenv from 'dotenv'
dotenv.config({ override: true })

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { execFile, execFileSync } from 'node:child_process'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import {
  listDocuments,
  searchDocuments,
  readDocument,
  getCategories,
  setDocsRoot,
  getDocsRoot,
} from './docs-tools'

const PORT = parseInt(process.env.MCP_PORT ?? '8001', 10)
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? ''
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID ?? ''
const SERPAPI_KEY = process.env.SERPAPI_KEY ?? ''
const PUSH_ACK_PHRASE = 'I_UNDERSTAND_PUSH_RISK'
const SSH_DEFAULT_TIMEOUT_MS = Number(process.env.SSH_DEFAULT_TIMEOUT_MS ?? '20000')
const SSH_ALLOWED_HOSTS = (process.env.SSH_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean)
const DOCKER_BIN = process.env.DOCKER_BIN?.trim() || 'docker'
const DOCKER_DEFAULT_TIMEOUT_MS = Number(process.env.DOCKER_DEFAULT_TIMEOUT_MS ?? '20000')
const DOCKER_ALLOWED_CONTAINERS = (process.env.DOCKER_ALLOWED_CONTAINERS ?? '')
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean)

function runGit(repoPath: string, args: string[]): { ok: boolean; stdout: string; stderr?: string } {
  try {
    const stdout = execFileSync('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    return { ok: true, stdout }
  } catch (e: any) {
    const stdout = String(e?.stdout ?? '').trim()
    const stderr = String(e?.stderr ?? e?.message ?? 'git 실행 실패').trim()
    return { ok: false, stdout, stderr }
  }
}

function resolveRepoPath(repoPath?: string): string {
  if (repoPath && path.isAbsolute(repoPath)) return repoPath
  return process.cwd()
}

function isAllowedSshHost(host: string): boolean {
  if (SSH_ALLOWED_HOSTS.length === 0) return true
  return SSH_ALLOWED_HOSTS.includes(host)
}

function isAllowedDockerContainer(name: string): boolean {
  if (DOCKER_ALLOWED_CONTAINERS.length === 0) return true
  return DOCKER_ALLOWED_CONTAINERS.includes(name)
}

function runExecFile(
  bin: string,
  args: string[],
  timeoutMs: number,
): Promise<{ ok: boolean; stdout: string; stderr: string; timedOut: boolean; code: number | null }> {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      {
        timeout: timeoutMs,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 4,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({
            ok: true,
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? ''),
            timedOut: false,
            code: 0,
          })
          return
        }

        resolve({
          ok: false,
          stdout: String((error as any)?.stdout ?? stdout ?? ''),
          stderr: String((error as any)?.stderr ?? stderr ?? error.message ?? ''),
          timedOut: (error as any)?.killed === true || (error as any)?.signal === 'SIGTERM',
          code: typeof (error as any)?.code === 'number' ? (error as any).code : null,
        })
      },
    )
  })
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'ceninsight-docs',
    version: '1.0.0',
  })

  const tool = (server.tool as any).bind(server)

  // ── 문서 도구 ───────────────────────────────────────────────────────────────

  tool('get_categories', '사용 가능한 카테고리(폴더) 목록을 반환합니다.', {}, async () => {
    console.log(`[MCP] get_categories 호출`)
    const categories = await getCategories()
    console.log(`[MCP] get_categories 결과: ${categories.length}개`)
    return { content: [{ type: 'text', text: JSON.stringify(categories, null, 2) }] }
  })

  tool(
    'list_documents',
    '문서 목록을 반환합니다. (PDF, PPTX, PPT, HWP, DOCX, DOC 포함)',
    { category: z.string().optional().describe('카테고리 필터. 없으면 전체 반환.') },
    async ({ category }: { category?: string }) => {
      console.log(`[MCP] list_documents 호출 - category: ${category ?? '전체'}`)
      const docs = await listDocuments(category ?? null)
      console.log(`[MCP] list_documents 결과: ${docs.length}개 문서`)
      return { content: [{ type: 'text', text: JSON.stringify(docs, null, 2) }] }
    },
  )

  tool(
    'search_documents',
    '문서를 검색합니다. 파일명과 내용을 모두 검색합니다.',
    {
      keyword: z.string().describe('검색할 키워드'),
      search_content: z.boolean().optional().describe('파일 내용까지 검색 여부 (기본값: true)'),
    },
    async ({ keyword, search_content }: { keyword: string; search_content?: boolean }) => {
      console.log(`[MCP] search_documents 호출 - keyword: "${keyword}"`)
      const results = await searchDocuments(keyword, search_content ?? true)
      console.log(`[MCP] search_documents 결과: ${results.length}개 매칭`)
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] }
    },
  )

  tool(
    'read_document',
    '문서의 텍스트를 추출합니다. PDF, PPT/PPTX, HWP, DOC/DOCX 모두 지원합니다.',
    {
      path: z.string().describe('문서의 상대 경로 (list_documents 결과의 path 필드)'),
      max_pages: z.number().optional().describe('최대 읽을 페이지/슬라이드 수 (기본 10)'),
    },
    async ({ path: docPath, max_pages }: { path: string; max_pages?: number }) => {
      console.log(`[MCP] read_document 호출 - path: "${docPath}"`)
      const result = await readDocument(docPath, max_pages ?? 10)
      if ('error' in result) {
        console.error(`[MCP] read_document 실패 - ${result.error}`)
      } else {
        console.log(`[MCP] read_document 결과: ${result.extracted_pages}/${result.total_pages}페이지, ${result.text?.length ?? 0}자`)
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  )

  // ── 문서 폴더 관리 ───────────────────────────────────────────────────────────

  tool(
    'set_docs_root',
    '분석할 문서 폴더 경로를 변경합니다.',
    { path: z.string().describe('새로 설정할 문서 폴더의 절대 경로') },
    async ({ path: newPath }: { path: string }) => {
      console.log(`[MCP] set_docs_root 호출 - path: "${newPath}"`)
      setDocsRoot(newPath)
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, path: newPath }) }] }
    },
  )

  tool('get_docs_root', '현재 설정된 문서 폴더 경로를 반환합니다.', {}, async () => {
    const cwd = getDocsRoot()
    return { content: [{ type: 'text', text: JSON.stringify({ path: cwd }) }] }
  })

  // ── 외부 검색 도구 ───────────────────────────────────────────────────────────

  tool(
    'google_search',
    'Google 검색 결과를 반환합니다. 내부 문서로 답변이 부족할 때 보완용으로 사용하세요.',
    {
      query: z.string().describe('검색 질의어'),
      num: z.number().optional().describe('결과 개수 (1~10, 기본 5)'),
      hl: z.string().optional().describe('언어 코드 (예: ko, en)'),
    },
    async ({ query, num, hl }: { query: string; num?: number; hl?: string }) => {
      console.log(`[MCP] google_search 호출 - query: "${query}"`)

      const safeNum = Math.max(1, Math.min(10, num ?? 5))

      if (SERPAPI_KEY) {
        const url = new URL('https://serpapi.com/search.json')
        url.searchParams.set('engine', 'google')
        url.searchParams.set('q', query)
        url.searchParams.set('api_key', SERPAPI_KEY)
        url.searchParams.set('num', String(safeNum))
        if (hl) url.searchParams.set('hl', hl)

        const res = await fetch(url)
        const bodyText = await res.text()
        if (!res.ok) {
          console.error(`[MCP] google_search(serpapi) 실패 - status: ${res.status}`)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                ok: false,
                provider: 'serpapi',
                status: res.status,
                error: bodyText,
              }),
            }],
          }
        }

        let body: any = {}
        try {
          body = JSON.parse(bodyText)
        } catch {
          return { content: [{ type: 'text', text: JSON.stringify({ ok: false, provider: 'serpapi', error: '응답 파싱 실패' }) }] }
        }

        const results = (body.organic_results ?? []).map((item: any) => ({
          title: item.title ?? '',
          link: item.link ?? '',
          snippet: item.snippet ?? '',
          displayLink: item.displayed_link ?? '',
        }))

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              provider: 'serpapi',
              query,
              totalResults: body.search_information?.total_results ?? null,
              items: results,
            }, null, 2),
          }],
        }
      }

      if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: 'SERPAPI_KEY 또는 (GOOGLE_API_KEY + GOOGLE_CSE_ID)가 설정되지 않았습니다.',
            }),
          }],
        }
      }

      const url = new URL('https://www.googleapis.com/customsearch/v1')
      url.searchParams.set('key', GOOGLE_API_KEY)
      url.searchParams.set('cx', GOOGLE_CSE_ID)
      url.searchParams.set('q', query)
      url.searchParams.set('num', String(safeNum))
      if (hl) url.searchParams.set('hl', hl)

      const res = await fetch(url)
      const bodyText = await res.text()
      if (!res.ok) {
        console.error(`[MCP] google_search 실패 - status: ${res.status}`)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: false,
              status: res.status,
              error: bodyText,
            }),
          }],
        }
      }

      let body: any = {}
      try {
        body = JSON.parse(bodyText)
      } catch {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: '응답 파싱 실패' }) }] }
      }

      const results = (body.items ?? []).map((item: any) => ({
        title: item.title ?? '',
        link: item.link ?? '',
        snippet: item.snippet ?? '',
        displayLink: item.displayLink ?? '',
      }))

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: true,
            provider: 'google_cse',
            query,
            totalResults: body.searchInformation?.totalResults ?? null,
            items: results,
          }, null, 2),
        }],
      }
    },
  )

  // ── Git 도구 ────────────────────────────────────────────────────────────────

  tool(
    'git_status',
    'Git 저장소의 현재 상태를 반환합니다.',
    { repo_path: z.string().optional().describe('Git 저장소 절대 경로 (기본값: 현재 작업 디렉토리)') },
    async ({ repo_path }: { repo_path?: string }) => {
      const repoPath = resolveRepoPath(repo_path)
      const res = runGit(repoPath, ['status', '--short', '--branch'])
      return { content: [{ type: 'text', text: JSON.stringify({ repoPath, ...res }, null, 2) }] }
    },
  )

  tool(
    'git_log',
    'Git 커밋 로그를 반환합니다.',
    {
      repo_path: z.string().optional().describe('Git 저장소 절대 경로 (기본값: 현재 작업 디렉토리)'),
      max_count: z.number().optional().describe('조회할 최대 커밋 수 (기본값: 20)'),
    },
    async ({ repo_path, max_count }: { repo_path?: string; max_count?: number }) => {
      const repoPath = resolveRepoPath(repo_path)
      const count = Math.max(1, Math.min(100, max_count ?? 20))
      const res = runGit(repoPath, ['log', `--max-count=${count}`, '--oneline', '--decorate'])
      return { content: [{ type: 'text', text: JSON.stringify({ repoPath, ...res }, null, 2) }] }
    },
  )

  tool(
    'git_diff',
    'Git 변경사항 diff를 반환합니다.',
    {
      repo_path: z.string().optional().describe('Git 저장소 절대 경로 (기본값: 현재 작업 디렉토리)'),
      staged: z.boolean().optional().describe('staged diff 조회 여부 (기본값: false)'),
      pathspec: z.string().optional().describe('특정 파일/경로만 조회할 때 사용'),
    },
    async ({ repo_path, staged, pathspec }: { repo_path?: string; staged?: boolean; pathspec?: string }) => {
      const repoPath = resolveRepoPath(repo_path)
      const args = ['diff']
      if (staged) args.push('--staged')
      if (pathspec) args.push('--', pathspec)
      const res = runGit(repoPath, args)
      return { content: [{ type: 'text', text: JSON.stringify({ repoPath, staged: !!staged, pathspec: pathspec ?? null, ...res }, null, 2) }] }
    },
  )

  tool(
    'git_add',
    '파일을 staging area에 추가합니다.',
    {
      repo_path: z.string().optional().describe('Git 저장소 절대 경로 (기본값: 현재 작업 디렉토리)'),
      pathspec: z.string().describe('추가할 파일/경로 (예: ".", "src/main.ts")'),
    },
    async ({ repo_path, pathspec }: { repo_path?: string; pathspec: string }) => {
      const repoPath = resolveRepoPath(repo_path)
      const addRes = runGit(repoPath, ['add', pathspec])
      const statusRes = runGit(repoPath, ['status', '--short'])
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            repoPath,
            add: addRes,
            status: statusRes,
          }, null, 2),
        }],
      }
    },
  )

  tool(
    'git_commit',
    'staged 변경사항을 커밋합니다.',
    {
      repo_path: z.string().optional().describe('Git 저장소 절대 경로 (기본값: 현재 작업 디렉토리)'),
      message: z.string().describe('커밋 메시지'),
    },
    async ({ repo_path, message }: { repo_path?: string; message: string }) => {
      const repoPath = resolveRepoPath(repo_path)
      const commitRes = runGit(repoPath, ['commit', '-m', message])
      const statusRes = runGit(repoPath, ['status', '--short', '--branch'])
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            repoPath,
            commit: commitRes,
            status: statusRes,
          }, null, 2),
        }],
      }
    },
  )

  tool(
    'git_branch',
    '브랜치 목록 또는 현재 브랜치를 반환합니다.',
    {
      repo_path: z.string().optional().describe('Git 저장소 절대 경로 (기본값: 현재 작업 디렉토리)'),
      all: z.boolean().optional().describe('원격 포함 전체 브랜치 조회 여부 (기본값: false)'),
    },
    async ({ repo_path, all }: { repo_path?: string; all?: boolean }) => {
      const repoPath = resolveRepoPath(repo_path)
      const args = all ? ['branch', '-a'] : ['branch']
      const branchRes = runGit(repoPath, args)
      const currentRes = runGit(repoPath, ['branch', '--show-current'])
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            repoPath,
            current: currentRes,
            branches: branchRes,
          }, null, 2),
        }],
      }
    },
  )

  tool(
    'git_push',
    '원격 저장소로 push를 수행합니다. 보안 경고 확인 문구가 있어야 실제 push가 실행됩니다.',
    {
      repo_path: z.string().optional().describe('Git 저장소 절대 경로 (기본값: 현재 작업 디렉토리)'),
      remote: z.string().optional().describe('원격 이름 (기본값: origin)'),
      branch: z.string().optional().describe('브랜치 이름 (기본값: 현재 브랜치)'),
      dry_run: z.boolean().optional().describe('true면 실제 전송 없이 점검만 수행 (기본값: true)'),
      acknowledge: z.string().optional().describe(`실제 push 시 확인 문구: ${PUSH_ACK_PHRASE}`),
    },
    async ({
      repo_path,
      remote,
      branch,
      dry_run,
      acknowledge,
    }: {
      repo_path?: string
      remote?: string
      branch?: string
      dry_run?: boolean
      acknowledge?: string
    }) => {
      const repoPath = resolveRepoPath(repo_path)
      const targetRemote = remote ?? 'origin'
      const currentBranchRes = runGit(repoPath, ['branch', '--show-current'])
      const targetBranch = branch ?? (currentBranchRes.ok ? currentBranchRes.stdout : '')

      const warning = [
        '보안 경고: git push는 외부 원격 저장소로 코드/문서가 전송됩니다.',
        '민감정보(API 키, 비밀번호, 개인정보, 내부문서) 포함 여부를 반드시 확인하세요.',
        `실제 push를 실행하려면 acknowledge에 "${PUSH_ACK_PHRASE}"를 전달하세요.`,
      ].join(' ')

      const safeDryRun = dry_run ?? true
      if (!targetBranch) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: false,
              warning,
              error: '대상 브랜치를 확인할 수 없습니다. branch 값을 명시하세요.',
            }, null, 2),
          }],
        }
      }

      if (!safeDryRun && acknowledge !== PUSH_ACK_PHRASE) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: false,
              warning,
              blocked: true,
              requires_acknowledge: PUSH_ACK_PHRASE,
              next_step: 'acknowledge 값을 포함해 다시 호출하거나 dry_run=true로 점검하세요.',
              target: { remote: targetRemote, branch: targetBranch },
            }, null, 2),
          }],
        }
      }

      const args = ['push']
      if (safeDryRun) args.push('--dry-run')
      args.push(targetRemote, targetBranch)
      const pushRes = runGit(repoPath, args)

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            repoPath,
            warning,
            dry_run: safeDryRun,
            target: { remote: targetRemote, branch: targetBranch },
            push: pushRes,
          }, null, 2),
        }],
      }
    },
  )

  tool(
    'ssh_exec',
    'SSH로 원격 호스트에 단일 명령을 실행합니다.',
    {
      host: z.string().describe('원격 호스트 (예: 10.0.0.12 또는 my-server.local)'),
      user: z.string().optional().describe('접속 사용자 (기본값: 현재 사용자)'),
      port: z.number().optional().describe('SSH 포트 (기본값: 22)'),
      command: z.string().describe('원격에서 실행할 명령'),
      key_path: z.string().optional().describe('개인키 절대 경로 (옵션)'),
      timeout_ms: z.number().optional().describe(`타임아웃(ms), 기본 ${SSH_DEFAULT_TIMEOUT_MS}`),
      strict_host_key_checking: z.boolean().optional().describe('호스트 키 검증 강제 여부 (기본값: true)'),
    },
    async ({
      host,
      user,
      port,
      command,
      key_path,
      timeout_ms,
      strict_host_key_checking,
    }: {
      host: string
      user?: string
      port?: number
      command: string
      key_path?: string
      timeout_ms?: number
      strict_host_key_checking?: boolean
    }) => {
      const trimmedHost = host.trim()
      if (!trimmedHost) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'host 값이 비어 있습니다.' }) }] }
      }

      if (!isAllowedSshHost(trimmedHost)) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: false,
              blocked: true,
              error: '허용되지 않은 SSH 호스트입니다.',
              host: trimmedHost,
              allowed_hosts: SSH_ALLOWED_HOSTS,
            }, null, 2),
          }],
        }
      }

      const safePort = Math.max(1, Math.min(65535, port ?? 22))
      const safeTimeout = Math.max(1000, Math.min(300000, timeout_ms ?? SSH_DEFAULT_TIMEOUT_MS))
      const strict = strict_host_key_checking ?? true
      const target = user ? `${user}@${trimmedHost}` : trimmedHost

      const sshArgs: string[] = [
        '-p', String(safePort),
        '-o', `StrictHostKeyChecking=${strict ? 'yes' : 'no'}`,
        '-o', 'BatchMode=yes',
        '-o', `ConnectTimeout=${Math.max(1, Math.floor(safeTimeout / 1000))}`,
      ]
      if (key_path) sshArgs.push('-i', key_path)
      sshArgs.push(target, command)

      console.log(`[MCP] ssh_exec 호출 - target: "${target}:${safePort}"`)
      const result = await runExecFile('ssh', sshArgs, safeTimeout)

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: result.ok,
            target: { host: trimmedHost, user: user ?? null, port: safePort },
            command,
            timed_out: result.timedOut,
            code: result.code,
            stdout: result.stdout.trim(),
            stderr: result.stderr.trim(),
          }, null, 2),
        }],
      }
    },
  )

  // ── Docker 도구 ─────────────────────────────────────────────────────────────

  tool(
    'docker_ps',
    'Docker 컨테이너 목록을 조회합니다.',
    {
      all: z.boolean().optional().describe('중지된 컨테이너 포함 여부 (기본값: false)'),
      timeout_ms: z.number().optional().describe(`타임아웃(ms), 기본 ${DOCKER_DEFAULT_TIMEOUT_MS}`),
    },
    async ({ all, timeout_ms }: { all?: boolean; timeout_ms?: number }) => {
      const safeTimeout = Math.max(1000, Math.min(300000, timeout_ms ?? DOCKER_DEFAULT_TIMEOUT_MS))
      const args = ['ps', '--format', 'json']
      if (all) args.splice(1, 0, '-a')

      console.log(`[MCP] docker_ps 호출`)
      const result = await runExecFile(DOCKER_BIN, args, safeTimeout)
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: result.ok,
            all: !!all,
            timed_out: result.timedOut,
            code: result.code,
            stdout: result.stdout.trim(),
            stderr: result.stderr.trim(),
          }, null, 2),
        }],
      }
    },
  )

  tool(
    'docker_logs',
    'Docker 컨테이너 로그를 조회합니다.',
    {
      container: z.string().describe('컨테이너 이름 또는 ID'),
      tail: z.number().optional().describe('마지막 N줄 (기본값: 200)'),
      since: z.string().optional().describe('조회 시작 시점 (예: 10m, 1h, 2026-03-29T09:00:00)'),
      timestamps: z.boolean().optional().describe('타임스탬프 포함 여부 (기본값: false)'),
      timeout_ms: z.number().optional().describe(`타임아웃(ms), 기본 ${DOCKER_DEFAULT_TIMEOUT_MS}`),
    },
    async ({
      container,
      tail,
      since,
      timestamps,
      timeout_ms,
    }: {
      container: string
      tail?: number
      since?: string
      timestamps?: boolean
      timeout_ms?: number
    }) => {
      const target = container.trim()
      if (!target) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'container 값이 비어 있습니다.' }) }] }
      }
      if (!isAllowedDockerContainer(target)) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: false,
              blocked: true,
              error: '허용되지 않은 컨테이너입니다.',
              container: target,
              allowed_containers: DOCKER_ALLOWED_CONTAINERS,
            }, null, 2),
          }],
        }
      }

      const safeTimeout = Math.max(1000, Math.min(300000, timeout_ms ?? DOCKER_DEFAULT_TIMEOUT_MS))
      const safeTail = Math.max(1, Math.min(5000, tail ?? 200))
      const args = ['logs', '--tail', String(safeTail)]
      if (since?.trim()) args.push('--since', since.trim())
      if (timestamps) args.push('--timestamps')
      args.push(target)

      console.log(`[MCP] docker_logs 호출 - container: "${target}"`)
      const result = await runExecFile(DOCKER_BIN, args, safeTimeout)
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: result.ok,
            container: target,
            timed_out: result.timedOut,
            code: result.code,
            stdout: result.stdout.trim(),
            stderr: result.stderr.trim(),
          }, null, 2),
        }],
      }
    },
  )

  tool(
    'docker_exec',
    '실행 중인 컨테이너 내부에서 명령을 실행합니다.',
    {
      container: z.string().describe('컨테이너 이름 또는 ID'),
      command: z.string().describe('컨테이너 내부에서 실행할 명령'),
      shell: z.string().optional().describe('사용할 쉘 (기본값: sh)'),
      timeout_ms: z.number().optional().describe(`타임아웃(ms), 기본 ${DOCKER_DEFAULT_TIMEOUT_MS}`),
    },
    async ({
      container,
      command,
      shell,
      timeout_ms,
    }: {
      container: string
      command: string
      shell?: string
      timeout_ms?: number
    }) => {
      const target = container.trim()
      const cmd = command.trim()
      if (!target) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'container 값이 비어 있습니다.' }) }] }
      }
      if (!cmd) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'command 값이 비어 있습니다.' }) }] }
      }
      if (!isAllowedDockerContainer(target)) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: false,
              blocked: true,
              error: '허용되지 않은 컨테이너입니다.',
              container: target,
              allowed_containers: DOCKER_ALLOWED_CONTAINERS,
            }, null, 2),
          }],
        }
      }

      const safeTimeout = Math.max(1000, Math.min(300000, timeout_ms ?? DOCKER_DEFAULT_TIMEOUT_MS))
      const useShell = shell?.trim() || 'sh'
      const args = ['exec', target, useShell, '-lc', cmd]

      console.log(`[MCP] docker_exec 호출 - container: "${target}"`)
      const result = await runExecFile(DOCKER_BIN, args, safeTimeout)
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: result.ok,
            container: target,
            command: cmd,
            timed_out: result.timedOut,
            code: result.code,
            stdout: result.stdout.trim(),
            stderr: result.stderr.trim(),
          }, null, 2),
        }],
      }
    },
  )

  // ── 파일시스템 도구 ──────────────────────────────────────────────────────────

  tool(
    'fs_read_file',
    '파일의 텍스트 내용을 읽습니다.',
    {
      path: z.string().describe('읽을 파일의 절대 경로'),
      encoding: z.string().optional().describe('인코딩 (기본값: utf8)'),
    },
    async ({ path: filePath, encoding }: { path: string; encoding?: string }) => {
      console.log(`[MCP] fs_read_file 호출 - path: "${filePath}"`)
      const content = fs.readFileSync(filePath, { encoding: (encoding as BufferEncoding) ?? 'utf8' })
      return { content: [{ type: 'text', text: JSON.stringify({ path: filePath, content }) }] }
    },
  )

  tool(
    'fs_write_file',
    '파일에 텍스트 내용을 씁니다. 파일이 없으면 생성합니다.',
    {
      path: z.string().describe('쓸 파일의 절대 경로'),
      content: z.string().describe('파일에 쓸 내용'),
      encoding: z.string().optional().describe('인코딩 (기본값: utf8)'),
    },
    async ({ path: filePath, content, encoding }: { path: string; content: string; encoding?: string }) => {
      console.log(`[MCP] fs_write_file 호출 - path: "${filePath}"`)
      fs.writeFileSync(filePath, content, { encoding: (encoding as BufferEncoding) ?? 'utf8' })
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, path: filePath }) }] }
    },
  )

  tool(
    'fs_list_dir',
    '디렉토리 내 파일 및 폴더 목록을 반환합니다.',
    { path: z.string().describe('조회할 디렉토리의 절대 경로') },
    async ({ path: dirPath }: { path: string }) => {
      console.log(`[MCP] fs_list_dir 호출 - path: "${dirPath}"`)
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      const result = entries.map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file',
        path: path.join(dirPath, e.name),
      }))
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  )

  tool(
    'fs_stat',
    '파일 또는 디렉토리의 정보(크기, 수정일, 유형 등)를 반환합니다.',
    { path: z.string().describe('조회할 파일 또는 디렉토리의 절대 경로') },
    async ({ path: filePath }: { path: string }) => {
      const stat = fs.statSync(filePath)
      return {
        content: [{
          type: 'text', text: JSON.stringify({
            path: filePath,
            type: stat.isDirectory() ? 'directory' : 'file',
            size_bytes: stat.size,
            created_at: stat.birthtime.toISOString(),
            modified_at: stat.mtime.toISOString(),
          })
        }]
      }
    },
  )

  tool(
    'fs_exists',
    '파일 또는 디렉토리의 존재 여부를 확인합니다.',
    { path: z.string().describe('확인할 파일 또는 디렉토리의 절대 경로') },
    async ({ path: filePath }: { path: string }) => {
      return { content: [{ type: 'text', text: JSON.stringify({ path: filePath, exists: fs.existsSync(filePath) }) }] }
    },
  )

  tool(
    'fs_mkdir',
    '디렉토리를 생성합니다. 중간 경로도 함께 생성합니다.',
    { path: z.string().describe('생성할 디렉토리의 절대 경로') },
    async ({ path: dirPath }: { path: string }) => {
      fs.mkdirSync(dirPath, { recursive: true })
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, path: dirPath }) }] }
    },
  )

  tool(
    'fs_copy',
    '파일을 복사합니다.',
    {
      src: z.string().describe('복사할 원본 파일의 절대 경로'),
      dest: z.string().describe('복사될 대상 파일의 절대 경로'),
    },
    async ({ src, dest }: { src: string; dest: string }) => {
      console.log(`[MCP] fs_copy 호출 - src: "${src}" → dest: "${dest}"`)
      fs.copyFileSync(src, dest)
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, src, dest }) }] }
    },
  )

  tool(
    'fs_move',
    '파일 또는 디렉토리를 이동하거나 이름을 변경합니다.',
    {
      src: z.string().describe('이동할 원본 파일/디렉토리의 절대 경로'),
      dest: z.string().describe('이동될 대상 경로의 절대 경로'),
    },
    async ({ src, dest }: { src: string; dest: string }) => {
      console.log(`[MCP] fs_move 호출 - src: "${src}" → dest: "${dest}"`)
      fs.renameSync(src, dest)
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, src, dest }) }] }
    },
  )

  tool(
    'fs_delete',
    '파일 또는 디렉토리를 삭제합니다. recursive가 true이면 하위 항목도 모두 삭제합니다.',
    {
      path: z.string().describe('삭제할 파일 또는 디렉토리의 절대 경로'),
      recursive: z.boolean().optional().describe('디렉토리를 하위 항목과 함께 삭제 (기본값: false)'),
    },
    async ({ path: filePath, recursive }: { path: string; recursive?: boolean }) => {
      console.log(`[MCP] fs_delete 호출 - path: "${filePath}"`)
      const stat = fs.statSync(filePath)
      if (stat.isDirectory()) {
        fs.rmSync(filePath, { recursive: recursive ?? false })
      } else {
        fs.unlinkSync(filePath)
      }
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, path: filePath }) }] }
    },
  )

  return server
}

const httpServer = http.createServer(async (req, res) => {
  if (req.url !== '/mcp') {
    res.writeHead(404).end('Not Found')
    return
  }

  const clientIp = req.socket.remoteAddress ?? 'unknown'
  console.log(`[MCP] 요청 수신 - ${req.method} ${req.url} from ${clientIp}`)

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  const mcpServer = createMcpServer()

  res.on('close', () => {
    console.log(`[MCP] 연결 종료 - ${clientIp}`)
    transport.close().catch(() => {})
    mcpServer.close().catch(() => {})
  })

  await mcpServer.connect(transport)
  await transport.handleRequest(req, res)
})

httpServer.listen(PORT, () => {
  console.log(`MCP server running on http://localhost:${PORT}/mcp`)
  console.log(`Dify 연결 URL: http://host.docker.internal:${PORT}/mcp`)
})
