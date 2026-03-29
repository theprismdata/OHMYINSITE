# 📚 OHMYINSITE - 기술문서 AI 어시스턴트

Electron 기반 기술문서 분석 AI 채팅 애플리케이션 & MCP 서버

## 🎯 주요 기능

- **문서 검색 및 분석**: PDF, DOCX, PPTX, HWP, HWPX 등 다양한 포맷 지원
- **MCP(Model Context Protocol) 서버**: Dify Agent와 연동 가능한 HTTP 서버
- **Electron GUI**: 데스크톱 채팅 인터페이스
- **다중 LLM 지원**: OpenAI, Dify Agent, vLLM 등
- **하이브리드 의도 라우팅**: 질문 의도(문서/코드/혼합/제안서)를 자동 분류해 프롬프트 강화
- **제안서 강화 모드**: 제안/RFP 요청 시 장문 문서 구조로 자동 생성
- **Claude 스킬 프로필 자동 주입**: Claude 선택 시 의도별 스킬 규칙/출력 포맷 자동 적용
- **OneDrive 연동**: MCP-DRIVE 폴더 자동 스캔
- **마크다운 & 다이어그램**: Mermaid 다이어그램 렌더링 지원

## 🏗️ 프로젝트 구조

```
OHMYINSITE/
├── src/
│   ├── main.ts           # Electron 메인 프로세스 (GUI 앱)
│   ├── renderer.ts       # Electron 렌더러 프로세스 (UI 로직)
│   ├── preload.ts        # Electron IPC 브릿지
│   ├── mcp-server.ts     # MCP HTTP 서버 (Dify 연동용) ⭐
│   ├── docs-tools.ts     # 문서 처리 핵심 로직
│   └── types.ts          # TypeScript 타입 정의
├── index.html            # Electron UI
├── package.json          # 프로젝트 설정
├── tsconfig.json         # TypeScript 설정
└── .env                  # 환경변수 (API 키, 모드 설정)
```

## 🚀 실행 방법

### 1️⃣ **MCP 서버 실행** (주로 사용 - Dify 연동용)

```bash
npm run mcp-server:dev
```

- **포트**: 8001
- **엔드포인트**: `http://localhost:8001/mcp`
- **용도**: Dify Agent와 연동하여 문서 검색/분석 기능 제공

### 2️⃣ **Electron GUI 앱 실행**

```bash
npm start
```

- 데스크톱 채팅 애플리케이션 실행
- MCP 서버 자동 백그라운드 실행
- OpenAI 또는 Dify Agent와 직접 통신

## 🔧 환경 설정 (.env)

먼저 템플릿을 복사해 로컬 환경 파일을 만드세요:

```bash
cp .env.example .env
```

```env
# Dify 모델 활성화 (true면 모델 선택기에 Dify Agent가 추가됨)
DIFY_MODE=true

# 앱 제목 (오픈소스/사내용 브랜딩에 사용)
APP_TITLE=OHMYINSITE

# Dify API 설정
DIFY_API_URL=http://192.168.0.2:5001/v1
DIFY_API_KEY=app-your-api-key

# vLLM 서버 설정
LLM_BASE_URL=http://192.168.0.2:8080/v1
LLM_MODEL=cen-35b

# OpenAI 설정 (선택)
OPENAI_API_KEY=sk-...

# Claude 설정 (선택)
ANTHROPIC_API_KEY=sk-ant-...
# 키가 없으면 세션 토큰으로 자동 폴백
ANTHROPIC_SESSION_TOKEN=...

# Dify 설정 (선택)
DIFY_SESSION_TOKEN=...

# Google 검색 설정 (선택: google_search 도구용)
# 1순위: SERPAPI_KEY
SERPAPI_KEY=your-serpapi-key
# 2순위(SerpAPI 미사용 시): Google CSE
GOOGLE_API_KEY=your-google-api-key
GOOGLE_CSE_ID=your-custom-search-engine-id

# MCP 서버 포트 (기본값: 8001)
MCP_PORT=8001

# SSH 도구 설정 (선택)
SSH_ALLOWED_HOSTS=server1,server2
SSH_DEFAULT_TIMEOUT_MS=20000

# Docker 도구 설정 (선택)
DOCKER_BIN=docker
DOCKER_DEFAULT_TIMEOUT_MS=20000
DOCKER_ALLOWED_CONTAINERS=app,worker
```

- OpenAI는 API 키 방식만 지원합니다 (`OPENAI_API_KEY` 필요).

## 📦 주요 패키지

### 런타임
- **Electron** 35.0.0 - 데스크톱 애플리케이션 프레임워크
- **TypeScript** 5.9.3 - 타입 안전성

### MCP & AI
- `@modelcontextprotocol/sdk` - MCP 프로토콜 구현
- `openai` - OpenAI API 클라이언트

### 문서 처리
- `pdf-parse` - PDF 파싱
- `mammoth` - DOCX 파싱
- `jszip`, `cfb`, `pako` - 압축/아카이브 처리 (HWP 등)

### UI
- `marked` - Markdown 렌더링
- `mermaid` - 다이어그램 생성

## 🛠️ MCP 서버 제공 도구

MCP 서버는 다음 도구들을 제공합니다:

### 문서 관리
- `get_categories` - 카테고리 목록 조회
- `list_documents` - 문서 목록 조회
- `search_documents` - 문서 검색
- `read_document` - 문서 내용 읽기
- `google_search` - 외부 Google 검색 (선택 기능)
  - `SERPAPI_KEY`가 있으면 SerpAPI 사용
  - 없으면 `GOOGLE_API_KEY + GOOGLE_CSE_ID` 사용

### 파일시스템 (기본 제공)
- `fs_read_file` - 파일 읽기
- `fs_read_multiple_files` - 여러 파일 읽기
- `fs_write_file` - 파일 쓰기
- `fs_edit_file` - 파일 편집
- `fs_create_directory` - 디렉토리 생성
- `fs_list_directory` - 디렉토리 목록
- `fs_directory_tree` - 디렉토리 트리
- `fs_move_file` - 파일 이동
- `fs_search_files` - 파일 검색
- `fs_get_file_info` - 파일 정보

### Git
- `git_status` - 현재 저장소 상태 조회
- `git_log` - 커밋 로그 조회
- `git_diff` - 변경사항 diff 조회
- `git_add` - 파일 스테이징
- `git_commit` - 커밋 생성
- `git_branch` - 브랜치 조회
- `git_push` - 원격 push (기본 dry-run, 확인 문구 필요)

### SSH
- `ssh_exec` - 원격 SSH 명령 실행 (타임아웃/호스트 제한 지원)

### Docker
- `docker_ps` - 컨테이너 목록 조회
- `docker_logs` - 컨테이너 로그 조회
- `docker_exec` - 컨테이너 내부 명령 실행 (타임아웃/컨테이너 allowlist 지원)

## 📊 시스템 아키텍처

### 모드 1: MCP 서버 모드 (주로 사용)
```
[Dify Agent]
    ↓ HTTP (POST /mcp)
[MCP Server :8001]
    ↓
[docs-tools.ts]
    ↓
[OneDrive/MCP-DRIVE 폴더]
    - PDF, DOCX, PPTX, HWP, HWPX 파일
```

### 모드 2: Electron GUI 모드
```
[Electron GUI (renderer.ts)]
    ↓ IPC
[Main Process (main.ts)]
    ↓ HTTP
[OpenAI/Dify API]
    ↓ (옵션) HTTP
[Local MCP Server :8001]
    ↓
[docs-tools.ts]
    ↓
[문서 파일]
```

### 공통 구조
```
[Electron 앱 (main.ts)]  ←─┐
                            ├── 둘 다 같은 docs-tools.ts 사용
[MCP 서버 (mcp-server.ts)] ←─┘
                            ↓
                    [docs-tools.ts]
                            ↓
                    [OneDrive MCP-DRIVE]
```

## 🔑 핵심 컴포넌트

### docs-tools.ts (문서 처리 엔진)
- **지원 포맷**: PDF, DOCX, PPTX, HWP, HWPX
- **기능**:
  - 문서 스캔 및 인덱싱
  - 카테고리 자동 분류
  - 전문 검색 (파일명, 카테고리, 태그)
  - 문서 내용 추출 및 파싱

### mcp-server.ts (MCP HTTP 서버)
- Express 기반 HTTP 서버
- SSE (Server-Sent Events) 미지원 환경 대응
- JSON-RPC 2.0 프로토콜
- Dify Agent와 통합

### main.ts (Electron 메인 프로세스)
- 윈도우 생성 및 관리
- IPC 통신 핸들러
- LLM API 호출 (OpenAI/Dify)
- Agent 시스템 (기술동향, 요약, 비교분석 등)

### renderer.ts (Electron UI)
- 채팅 인터페이스
- Markdown 렌더링
- Mermaid 다이어그램 지원
- 파일 트리 사이드바

## 📝 개발 스크립트

```bash
# 개발 모드 (Electron GUI)
npm start

# MCP 서버 개발 모드 (핫 리로드)
npm run mcp-server:dev

# MCP 서버 프로덕션 실행
npm run mcp-server

# TypeScript 컴파일
npm run build

# 의존성 설치
npm install
```

## 🔍 지원 문서 포맷

| 포맷 | 확장자 | 라이브러리 | 비고 |
|------|--------|-----------|------|
| PDF | `.pdf` | pdf-parse | ✅ 전문 검색 가능 |
| Word | `.docx` | mammoth | ✅ 전문 검색 가능 |
| PowerPoint | `.pptx` | jszip | ✅ 전문 검색 가능 |
| 한글 | `.hwp` | cfb, pako | ⚠️ 부분 지원 |
| 한글 (신버전) | `.hwpx` | jszip | ✅ 전문 검색 가능 |

## 🌐 Dify Agent 연동 방법

1. **MCP 서버 실행**
   ```bash
   npm run mcp-server:dev
   ```

2. **Dify에서 Tool 설정**
   - Tool Type: HTTP API
   - URL: `http://localhost:8001/mcp`
   - Method: POST
   - Body: JSON-RPC 2.0 형식

3. **사용 예시**
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": {
       "name": "search_documents",
       "arguments": {
         "query": "AI 기술 동향"
       }
     }
   }
   ```

## 🐛 트러블슈팅

### MCP 서버 포트 충돌
```bash
# 포트 변경 (.env)
MCP_PORT=8002
```

### 문서 읽기 실패
- OneDrive 동기화 상태 확인
- 파일 접근 권한 확인
- 지원 포맷 확인

### Electron 빌드 오류
```bash
# node_modules 재설치
rm -rf node_modules package-lock.json
npm install
```

## 📄 라이선스

MIT License

## 🤝 기여

이슈 및 풀 리퀘스트는 언제나 환영합니다!

---

**Made with ❤️ using Electron, TypeScript, and MCP Protocol**
