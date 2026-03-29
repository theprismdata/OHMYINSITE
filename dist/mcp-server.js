"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
const dotenv = __importStar(require("dotenv"));
dotenv.config({ override: true });
const node_http_1 = __importDefault(require("node:http"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const zod_1 = require("zod");
const docs_tools_1 = require("./docs-tools");
const PORT = parseInt(process.env.MCP_PORT ?? '8001', 10);
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? '';
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID ?? '';
const SERPAPI_KEY = process.env.SERPAPI_KEY ?? '';
const PUSH_ACK_PHRASE = 'I_UNDERSTAND_PUSH_RISK';
const SSH_DEFAULT_TIMEOUT_MS = Number(process.env.SSH_DEFAULT_TIMEOUT_MS ?? '20000');
const SSH_ALLOWED_HOSTS = (process.env.SSH_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
const DOCKER_BIN = process.env.DOCKER_BIN?.trim() || 'docker';
const DOCKER_DEFAULT_TIMEOUT_MS = Number(process.env.DOCKER_DEFAULT_TIMEOUT_MS ?? '20000');
const DOCKER_ALLOWED_CONTAINERS = (process.env.DOCKER_ALLOWED_CONTAINERS ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
function runGit(repoPath, args) {
    try {
        const stdout = (0, node_child_process_1.execFileSync)('git', args, {
            cwd: repoPath,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
        return { ok: true, stdout };
    }
    catch (e) {
        const stdout = String(e?.stdout ?? '').trim();
        const stderr = String(e?.stderr ?? e?.message ?? 'git 실행 실패').trim();
        return { ok: false, stdout, stderr };
    }
}
function resolveRepoPath(repoPath) {
    if (repoPath && node_path_1.default.isAbsolute(repoPath))
        return repoPath;
    return process.cwd();
}
function isAllowedSshHost(host) {
    if (SSH_ALLOWED_HOSTS.length === 0)
        return true;
    return SSH_ALLOWED_HOSTS.includes(host);
}
function isAllowedDockerContainer(name) {
    if (DOCKER_ALLOWED_CONTAINERS.length === 0)
        return true;
    return DOCKER_ALLOWED_CONTAINERS.includes(name);
}
function runExecFile(bin, args, timeoutMs) {
    return new Promise((resolve) => {
        (0, node_child_process_1.execFile)(bin, args, {
            timeout: timeoutMs,
            encoding: 'utf8',
            maxBuffer: 1024 * 1024 * 4,
        }, (error, stdout, stderr) => {
            if (!error) {
                resolve({
                    ok: true,
                    stdout: String(stdout ?? ''),
                    stderr: String(stderr ?? ''),
                    timedOut: false,
                    code: 0,
                });
                return;
            }
            resolve({
                ok: false,
                stdout: String(error?.stdout ?? stdout ?? ''),
                stderr: String(error?.stderr ?? stderr ?? error.message ?? ''),
                timedOut: error?.killed === true || error?.signal === 'SIGTERM',
                code: typeof error?.code === 'number' ? error.code : null,
            });
        });
    });
}
function createMcpServer() {
    const server = new mcp_js_1.McpServer({
        name: 'ceninsight-docs',
        version: '1.0.0',
    });
    const tool = server.tool.bind(server);
    // ── 문서 도구 ───────────────────────────────────────────────────────────────
    tool('get_categories', '사용 가능한 카테고리(폴더) 목록을 반환합니다.', {}, async () => {
        console.log(`[MCP] get_categories 호출`);
        const categories = await (0, docs_tools_1.getCategories)();
        console.log(`[MCP] get_categories 결과: ${categories.length}개`);
        return { content: [{ type: 'text', text: JSON.stringify(categories, null, 2) }] };
    });
    tool('list_documents', '문서 목록을 반환합니다. (PDF, PPTX, PPT, HWP, DOCX, DOC 포함)', { category: zod_1.z.string().optional().describe('카테고리 필터. 없으면 전체 반환.') }, async ({ category }) => {
        console.log(`[MCP] list_documents 호출 - category: ${category ?? '전체'}`);
        const docs = await (0, docs_tools_1.listDocuments)(category ?? null);
        console.log(`[MCP] list_documents 결과: ${docs.length}개 문서`);
        return { content: [{ type: 'text', text: JSON.stringify(docs, null, 2) }] };
    });
    tool('search_documents', '문서를 검색합니다. 파일명과 내용을 모두 검색합니다.', {
        keyword: zod_1.z.string().describe('검색할 키워드'),
        search_content: zod_1.z.boolean().optional().describe('파일 내용까지 검색 여부 (기본값: true)'),
    }, async ({ keyword, search_content }) => {
        console.log(`[MCP] search_documents 호출 - keyword: "${keyword}"`);
        const results = await (0, docs_tools_1.searchDocuments)(keyword, search_content ?? true);
        console.log(`[MCP] search_documents 결과: ${results.length}개 매칭`);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    });
    tool('read_document', '문서의 텍스트를 추출합니다. PDF, PPT/PPTX, HWP, DOC/DOCX 모두 지원합니다.', {
        path: zod_1.z.string().describe('문서의 상대 경로 (list_documents 결과의 path 필드)'),
        max_pages: zod_1.z.number().optional().describe('최대 읽을 페이지/슬라이드 수 (기본 10)'),
    }, async ({ path: docPath, max_pages }) => {
        console.log(`[MCP] read_document 호출 - path: "${docPath}"`);
        const result = await (0, docs_tools_1.readDocument)(docPath, max_pages ?? 10);
        if ('error' in result) {
            console.error(`[MCP] read_document 실패 - ${result.error}`);
        }
        else {
            console.log(`[MCP] read_document 결과: ${result.extracted_pages}/${result.total_pages}페이지, ${result.text?.length ?? 0}자`);
        }
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    });
    // ── 문서 폴더 관리 ───────────────────────────────────────────────────────────
    tool('set_docs_root', '분석할 문서 폴더 경로를 변경합니다.', { path: zod_1.z.string().describe('새로 설정할 문서 폴더의 절대 경로') }, async ({ path: newPath }) => {
        console.log(`[MCP] set_docs_root 호출 - path: "${newPath}"`);
        (0, docs_tools_1.setDocsRoot)(newPath);
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, path: newPath }) }] };
    });
    tool('get_docs_root', '현재 설정된 문서 폴더 경로를 반환합니다.', {}, async () => {
        const cwd = (0, docs_tools_1.getDocsRoot)();
        return { content: [{ type: 'text', text: JSON.stringify({ path: cwd }) }] };
    });
    // ── 외부 검색 도구 ───────────────────────────────────────────────────────────
    tool('google_search', 'Google 검색 결과를 반환합니다. 내부 문서로 답변이 부족할 때 보완용으로 사용하세요.', {
        query: zod_1.z.string().describe('검색 질의어'),
        num: zod_1.z.number().optional().describe('결과 개수 (1~10, 기본 5)'),
        hl: zod_1.z.string().optional().describe('언어 코드 (예: ko, en)'),
    }, async ({ query, num, hl }) => {
        console.log(`[MCP] google_search 호출 - query: "${query}"`);
        const safeNum = Math.max(1, Math.min(10, num ?? 5));
        if (SERPAPI_KEY) {
            const url = new URL('https://serpapi.com/search.json');
            url.searchParams.set('engine', 'google');
            url.searchParams.set('q', query);
            url.searchParams.set('api_key', SERPAPI_KEY);
            url.searchParams.set('num', String(safeNum));
            if (hl)
                url.searchParams.set('hl', hl);
            const res = await fetch(url);
            const bodyText = await res.text();
            if (!res.ok) {
                console.error(`[MCP] google_search(serpapi) 실패 - status: ${res.status}`);
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
                };
            }
            let body = {};
            try {
                body = JSON.parse(bodyText);
            }
            catch {
                return { content: [{ type: 'text', text: JSON.stringify({ ok: false, provider: 'serpapi', error: '응답 파싱 실패' }) }] };
            }
            const results = (body.organic_results ?? []).map((item) => ({
                title: item.title ?? '',
                link: item.link ?? '',
                snippet: item.snippet ?? '',
                displayLink: item.displayed_link ?? '',
            }));
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
            };
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
            };
        }
        const url = new URL('https://www.googleapis.com/customsearch/v1');
        url.searchParams.set('key', GOOGLE_API_KEY);
        url.searchParams.set('cx', GOOGLE_CSE_ID);
        url.searchParams.set('q', query);
        url.searchParams.set('num', String(safeNum));
        if (hl)
            url.searchParams.set('hl', hl);
        const res = await fetch(url);
        const bodyText = await res.text();
        if (!res.ok) {
            console.error(`[MCP] google_search 실패 - status: ${res.status}`);
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            ok: false,
                            status: res.status,
                            error: bodyText,
                        }),
                    }],
            };
        }
        let body = {};
        try {
            body = JSON.parse(bodyText);
        }
        catch {
            return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: '응답 파싱 실패' }) }] };
        }
        const results = (body.items ?? []).map((item) => ({
            title: item.title ?? '',
            link: item.link ?? '',
            snippet: item.snippet ?? '',
            displayLink: item.displayLink ?? '',
        }));
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
        };
    });
    // ── Git 도구 ────────────────────────────────────────────────────────────────
    tool('git_status', 'Git 저장소의 현재 상태를 반환합니다.', { repo_path: zod_1.z.string().optional().describe('Git 저장소 절대 경로 (기본값: 현재 작업 디렉토리)') }, async ({ repo_path }) => {
        const repoPath = resolveRepoPath(repo_path);
        const res = runGit(repoPath, ['status', '--short', '--branch']);
        return { content: [{ type: 'text', text: JSON.stringify({ repoPath, ...res }, null, 2) }] };
    });
    tool('git_log', 'Git 커밋 로그를 반환합니다.', {
        repo_path: zod_1.z.string().optional().describe('Git 저장소 절대 경로 (기본값: 현재 작업 디렉토리)'),
        max_count: zod_1.z.number().optional().describe('조회할 최대 커밋 수 (기본값: 20)'),
    }, async ({ repo_path, max_count }) => {
        const repoPath = resolveRepoPath(repo_path);
        const count = Math.max(1, Math.min(100, max_count ?? 20));
        const res = runGit(repoPath, ['log', `--max-count=${count}`, '--oneline', '--decorate']);
        return { content: [{ type: 'text', text: JSON.stringify({ repoPath, ...res }, null, 2) }] };
    });
    tool('git_diff', 'Git 변경사항 diff를 반환합니다.', {
        repo_path: zod_1.z.string().optional().describe('Git 저장소 절대 경로 (기본값: 현재 작업 디렉토리)'),
        staged: zod_1.z.boolean().optional().describe('staged diff 조회 여부 (기본값: false)'),
        pathspec: zod_1.z.string().optional().describe('특정 파일/경로만 조회할 때 사용'),
    }, async ({ repo_path, staged, pathspec }) => {
        const repoPath = resolveRepoPath(repo_path);
        const args = ['diff'];
        if (staged)
            args.push('--staged');
        if (pathspec)
            args.push('--', pathspec);
        const res = runGit(repoPath, args);
        return { content: [{ type: 'text', text: JSON.stringify({ repoPath, staged: !!staged, pathspec: pathspec ?? null, ...res }, null, 2) }] };
    });
    tool('git_add', '파일을 staging area에 추가합니다.', {
        repo_path: zod_1.z.string().optional().describe('Git 저장소 절대 경로 (기본값: 현재 작업 디렉토리)'),
        pathspec: zod_1.z.string().describe('추가할 파일/경로 (예: ".", "src/main.ts")'),
    }, async ({ repo_path, pathspec }) => {
        const repoPath = resolveRepoPath(repo_path);
        const addRes = runGit(repoPath, ['add', pathspec]);
        const statusRes = runGit(repoPath, ['status', '--short']);
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({
                        repoPath,
                        add: addRes,
                        status: statusRes,
                    }, null, 2),
                }],
        };
    });
    tool('git_commit', 'staged 변경사항을 커밋합니다.', {
        repo_path: zod_1.z.string().optional().describe('Git 저장소 절대 경로 (기본값: 현재 작업 디렉토리)'),
        message: zod_1.z.string().describe('커밋 메시지'),
    }, async ({ repo_path, message }) => {
        const repoPath = resolveRepoPath(repo_path);
        const commitRes = runGit(repoPath, ['commit', '-m', message]);
        const statusRes = runGit(repoPath, ['status', '--short', '--branch']);
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({
                        repoPath,
                        commit: commitRes,
                        status: statusRes,
                    }, null, 2),
                }],
        };
    });
    tool('git_branch', '브랜치 목록 또는 현재 브랜치를 반환합니다.', {
        repo_path: zod_1.z.string().optional().describe('Git 저장소 절대 경로 (기본값: 현재 작업 디렉토리)'),
        all: zod_1.z.boolean().optional().describe('원격 포함 전체 브랜치 조회 여부 (기본값: false)'),
    }, async ({ repo_path, all }) => {
        const repoPath = resolveRepoPath(repo_path);
        const args = all ? ['branch', '-a'] : ['branch'];
        const branchRes = runGit(repoPath, args);
        const currentRes = runGit(repoPath, ['branch', '--show-current']);
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({
                        repoPath,
                        current: currentRes,
                        branches: branchRes,
                    }, null, 2),
                }],
        };
    });
    tool('git_push', '원격 저장소로 push를 수행합니다. 보안 경고 확인 문구가 있어야 실제 push가 실행됩니다.', {
        repo_path: zod_1.z.string().optional().describe('Git 저장소 절대 경로 (기본값: 현재 작업 디렉토리)'),
        remote: zod_1.z.string().optional().describe('원격 이름 (기본값: origin)'),
        branch: zod_1.z.string().optional().describe('브랜치 이름 (기본값: 현재 브랜치)'),
        dry_run: zod_1.z.boolean().optional().describe('true면 실제 전송 없이 점검만 수행 (기본값: true)'),
        acknowledge: zod_1.z.string().optional().describe(`실제 push 시 확인 문구: ${PUSH_ACK_PHRASE}`),
    }, async ({ repo_path, remote, branch, dry_run, acknowledge, }) => {
        const repoPath = resolveRepoPath(repo_path);
        const targetRemote = remote ?? 'origin';
        const currentBranchRes = runGit(repoPath, ['branch', '--show-current']);
        const targetBranch = branch ?? (currentBranchRes.ok ? currentBranchRes.stdout : '');
        const warning = [
            '보안 경고: git push는 외부 원격 저장소로 코드/문서가 전송됩니다.',
            '민감정보(API 키, 비밀번호, 개인정보, 내부문서) 포함 여부를 반드시 확인하세요.',
            `실제 push를 실행하려면 acknowledge에 "${PUSH_ACK_PHRASE}"를 전달하세요.`,
        ].join(' ');
        const safeDryRun = dry_run ?? true;
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
            };
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
            };
        }
        const args = ['push'];
        if (safeDryRun)
            args.push('--dry-run');
        args.push(targetRemote, targetBranch);
        const pushRes = runGit(repoPath, args);
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
        };
    });
    tool('ssh_exec', 'SSH로 원격 호스트에 단일 명령을 실행합니다.', {
        host: zod_1.z.string().describe('원격 호스트 (예: 10.0.0.12 또는 my-server.local)'),
        user: zod_1.z.string().optional().describe('접속 사용자 (기본값: 현재 사용자)'),
        port: zod_1.z.number().optional().describe('SSH 포트 (기본값: 22)'),
        command: zod_1.z.string().describe('원격에서 실행할 명령'),
        key_path: zod_1.z.string().optional().describe('개인키 절대 경로 (옵션)'),
        timeout_ms: zod_1.z.number().optional().describe(`타임아웃(ms), 기본 ${SSH_DEFAULT_TIMEOUT_MS}`),
        strict_host_key_checking: zod_1.z.boolean().optional().describe('호스트 키 검증 강제 여부 (기본값: true)'),
    }, async ({ host, user, port, command, key_path, timeout_ms, strict_host_key_checking, }) => {
        const trimmedHost = host.trim();
        if (!trimmedHost) {
            return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'host 값이 비어 있습니다.' }) }] };
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
            };
        }
        const safePort = Math.max(1, Math.min(65535, port ?? 22));
        const safeTimeout = Math.max(1000, Math.min(300000, timeout_ms ?? SSH_DEFAULT_TIMEOUT_MS));
        const strict = strict_host_key_checking ?? true;
        const target = user ? `${user}@${trimmedHost}` : trimmedHost;
        const sshArgs = [
            '-p', String(safePort),
            '-o', `StrictHostKeyChecking=${strict ? 'yes' : 'no'}`,
            '-o', 'BatchMode=yes',
            '-o', `ConnectTimeout=${Math.max(1, Math.floor(safeTimeout / 1000))}`,
        ];
        if (key_path)
            sshArgs.push('-i', key_path);
        sshArgs.push(target, command);
        console.log(`[MCP] ssh_exec 호출 - target: "${target}:${safePort}"`);
        const result = await runExecFile('ssh', sshArgs, safeTimeout);
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
        };
    });
    // ── Docker 도구 ─────────────────────────────────────────────────────────────
    tool('docker_ps', 'Docker 컨테이너 목록을 조회합니다.', {
        all: zod_1.z.boolean().optional().describe('중지된 컨테이너 포함 여부 (기본값: false)'),
        timeout_ms: zod_1.z.number().optional().describe(`타임아웃(ms), 기본 ${DOCKER_DEFAULT_TIMEOUT_MS}`),
    }, async ({ all, timeout_ms }) => {
        const safeTimeout = Math.max(1000, Math.min(300000, timeout_ms ?? DOCKER_DEFAULT_TIMEOUT_MS));
        const args = ['ps', '--format', 'json'];
        if (all)
            args.splice(1, 0, '-a');
        console.log(`[MCP] docker_ps 호출`);
        const result = await runExecFile(DOCKER_BIN, args, safeTimeout);
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
        };
    });
    tool('docker_logs', 'Docker 컨테이너 로그를 조회합니다.', {
        container: zod_1.z.string().describe('컨테이너 이름 또는 ID'),
        tail: zod_1.z.number().optional().describe('마지막 N줄 (기본값: 200)'),
        since: zod_1.z.string().optional().describe('조회 시작 시점 (예: 10m, 1h, 2026-03-29T09:00:00)'),
        timestamps: zod_1.z.boolean().optional().describe('타임스탬프 포함 여부 (기본값: false)'),
        timeout_ms: zod_1.z.number().optional().describe(`타임아웃(ms), 기본 ${DOCKER_DEFAULT_TIMEOUT_MS}`),
    }, async ({ container, tail, since, timestamps, timeout_ms, }) => {
        const target = container.trim();
        if (!target) {
            return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'container 값이 비어 있습니다.' }) }] };
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
            };
        }
        const safeTimeout = Math.max(1000, Math.min(300000, timeout_ms ?? DOCKER_DEFAULT_TIMEOUT_MS));
        const safeTail = Math.max(1, Math.min(5000, tail ?? 200));
        const args = ['logs', '--tail', String(safeTail)];
        if (since?.trim())
            args.push('--since', since.trim());
        if (timestamps)
            args.push('--timestamps');
        args.push(target);
        console.log(`[MCP] docker_logs 호출 - container: "${target}"`);
        const result = await runExecFile(DOCKER_BIN, args, safeTimeout);
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
        };
    });
    tool('docker_exec', '실행 중인 컨테이너 내부에서 명령을 실행합니다.', {
        container: zod_1.z.string().describe('컨테이너 이름 또는 ID'),
        command: zod_1.z.string().describe('컨테이너 내부에서 실행할 명령'),
        shell: zod_1.z.string().optional().describe('사용할 쉘 (기본값: sh)'),
        timeout_ms: zod_1.z.number().optional().describe(`타임아웃(ms), 기본 ${DOCKER_DEFAULT_TIMEOUT_MS}`),
    }, async ({ container, command, shell, timeout_ms, }) => {
        const target = container.trim();
        const cmd = command.trim();
        if (!target) {
            return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'container 값이 비어 있습니다.' }) }] };
        }
        if (!cmd) {
            return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'command 값이 비어 있습니다.' }) }] };
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
            };
        }
        const safeTimeout = Math.max(1000, Math.min(300000, timeout_ms ?? DOCKER_DEFAULT_TIMEOUT_MS));
        const useShell = shell?.trim() || 'sh';
        const args = ['exec', target, useShell, '-lc', cmd];
        console.log(`[MCP] docker_exec 호출 - container: "${target}"`);
        const result = await runExecFile(DOCKER_BIN, args, safeTimeout);
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
        };
    });
    // ── 파일시스템 도구 ──────────────────────────────────────────────────────────
    tool('fs_read_file', '파일의 텍스트 내용을 읽습니다.', {
        path: zod_1.z.string().describe('읽을 파일의 절대 경로'),
        encoding: zod_1.z.string().optional().describe('인코딩 (기본값: utf8)'),
    }, async ({ path: filePath, encoding }) => {
        console.log(`[MCP] fs_read_file 호출 - path: "${filePath}"`);
        const content = node_fs_1.default.readFileSync(filePath, { encoding: encoding ?? 'utf8' });
        return { content: [{ type: 'text', text: JSON.stringify({ path: filePath, content }) }] };
    });
    tool('fs_write_file', '파일에 텍스트 내용을 씁니다. 파일이 없으면 생성합니다.', {
        path: zod_1.z.string().describe('쓸 파일의 절대 경로'),
        content: zod_1.z.string().describe('파일에 쓸 내용'),
        encoding: zod_1.z.string().optional().describe('인코딩 (기본값: utf8)'),
    }, async ({ path: filePath, content, encoding }) => {
        console.log(`[MCP] fs_write_file 호출 - path: "${filePath}"`);
        node_fs_1.default.writeFileSync(filePath, content, { encoding: encoding ?? 'utf8' });
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, path: filePath }) }] };
    });
    tool('fs_list_dir', '디렉토리 내 파일 및 폴더 목록을 반환합니다.', { path: zod_1.z.string().describe('조회할 디렉토리의 절대 경로') }, async ({ path: dirPath }) => {
        console.log(`[MCP] fs_list_dir 호출 - path: "${dirPath}"`);
        const entries = node_fs_1.default.readdirSync(dirPath, { withFileTypes: true });
        const result = entries.map((e) => ({
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file',
            path: node_path_1.default.join(dirPath, e.name),
        }));
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    });
    tool('fs_stat', '파일 또는 디렉토리의 정보(크기, 수정일, 유형 등)를 반환합니다.', { path: zod_1.z.string().describe('조회할 파일 또는 디렉토리의 절대 경로') }, async ({ path: filePath }) => {
        const stat = node_fs_1.default.statSync(filePath);
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
        };
    });
    tool('fs_exists', '파일 또는 디렉토리의 존재 여부를 확인합니다.', { path: zod_1.z.string().describe('확인할 파일 또는 디렉토리의 절대 경로') }, async ({ path: filePath }) => {
        return { content: [{ type: 'text', text: JSON.stringify({ path: filePath, exists: node_fs_1.default.existsSync(filePath) }) }] };
    });
    tool('fs_mkdir', '디렉토리를 생성합니다. 중간 경로도 함께 생성합니다.', { path: zod_1.z.string().describe('생성할 디렉토리의 절대 경로') }, async ({ path: dirPath }) => {
        node_fs_1.default.mkdirSync(dirPath, { recursive: true });
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, path: dirPath }) }] };
    });
    tool('fs_copy', '파일을 복사합니다.', {
        src: zod_1.z.string().describe('복사할 원본 파일의 절대 경로'),
        dest: zod_1.z.string().describe('복사될 대상 파일의 절대 경로'),
    }, async ({ src, dest }) => {
        console.log(`[MCP] fs_copy 호출 - src: "${src}" → dest: "${dest}"`);
        node_fs_1.default.copyFileSync(src, dest);
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, src, dest }) }] };
    });
    tool('fs_move', '파일 또는 디렉토리를 이동하거나 이름을 변경합니다.', {
        src: zod_1.z.string().describe('이동할 원본 파일/디렉토리의 절대 경로'),
        dest: zod_1.z.string().describe('이동될 대상 경로의 절대 경로'),
    }, async ({ src, dest }) => {
        console.log(`[MCP] fs_move 호출 - src: "${src}" → dest: "${dest}"`);
        node_fs_1.default.renameSync(src, dest);
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, src, dest }) }] };
    });
    tool('fs_delete', '파일 또는 디렉토리를 삭제합니다. recursive가 true이면 하위 항목도 모두 삭제합니다.', {
        path: zod_1.z.string().describe('삭제할 파일 또는 디렉토리의 절대 경로'),
        recursive: zod_1.z.boolean().optional().describe('디렉토리를 하위 항목과 함께 삭제 (기본값: false)'),
    }, async ({ path: filePath, recursive }) => {
        console.log(`[MCP] fs_delete 호출 - path: "${filePath}"`);
        const stat = node_fs_1.default.statSync(filePath);
        if (stat.isDirectory()) {
            node_fs_1.default.rmSync(filePath, { recursive: recursive ?? false });
        }
        else {
            node_fs_1.default.unlinkSync(filePath);
        }
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, path: filePath }) }] };
    });
    return server;
}
const httpServer = node_http_1.default.createServer(async (req, res) => {
    if (req.url !== '/mcp') {
        res.writeHead(404).end('Not Found');
        return;
    }
    const clientIp = req.socket.remoteAddress ?? 'unknown';
    console.log(`[MCP] 요청 수신 - ${req.method} ${req.url} from ${clientIp}`);
    const transport = new streamableHttp_js_1.StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const mcpServer = createMcpServer();
    res.on('close', () => {
        console.log(`[MCP] 연결 종료 - ${clientIp}`);
        transport.close().catch(() => { });
        mcpServer.close().catch(() => { });
    });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
});
httpServer.listen(PORT, () => {
    console.log(`MCP server running on http://localhost:${PORT}/mcp`);
    console.log(`Dify 연결 URL: http://host.docker.internal:${PORT}/mcp`);
});
