// ── DOM 참조 ──────────────────────────────────────────────────────────────────
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const stopBtn = document.getElementById('stop-btn');
const sendBtn = document.getElementById('send-btn');
const dot = document.getElementById('dot');
const statusText = document.getElementById('status-text');
const routeInfo = document.getElementById('route-info');
const folderPath = document.getElementById('folder-path');
const folderBtn = document.getElementById('folder-btn');
const welcome = document.getElementById('welcome');
const welcomeTitle = document.getElementById('welcome-title');
const welcomeDesc = document.getElementById('welcome-desc');
const titlebarText = document.getElementById('titlebar-text');
const fileTreeEl = document.getElementById('file-tree');
const docPanel = document.getElementById('doc-panel');
const docPanelTitle = document.getElementById('doc-panel-title');
const docPanelContent = document.getElementById('doc-panel-content');
const docPanelClose = document.getElementById('doc-panel-close');
const modelSelect = document.getElementById('model-select');
const modelBadge = document.getElementById('model-provider-badge');
const taskList = document.getElementById('task-list');
const newTaskBtn = document.getElementById('new-task-btn');
const taskModalOverlay = document.getElementById('task-modal-overlay');
const taskTitleInput = document.getElementById('task-title-input');
const taskPromptInput = document.getElementById('task-prompt-input');
const modalCancel = document.getElementById('modal-cancel');
const modalSubmit = document.getElementById('modal-submit');
const chatView = document.getElementById('chat-view');
const taskDetailView = document.getElementById('task-detail-view');
const taskDetailBack = document.getElementById('task-detail-back');
const taskDetailTitle = document.getElementById('task-detail-title');
const taskDetailStatus = document.getElementById('task-detail-status');
const taskLogList = document.getElementById('task-log-list');
const taskOutputs = document.getElementById('task-outputs');
const taskOutputsSection = document.getElementById('task-outputs-section');
// ── 상태 ──────────────────────────────────────────────────────────────────────
let history = [];
let isThinking = false;
let isSending = false;
let currentBubble = null;
const DEFAULT_AGENT_ID = 'tech-trend';
let currentAgentId = DEFAULT_AGENT_ID;
let currentProvider = 'openai';
let currentThreadId = null;
let currentTaskId = null;
const taskMap = new Map();
const collapsedDirPaths = new Set();
window.api.getAppMeta().then((meta) => {
    const appTitle = (meta?.title ?? '').trim() || 'OHMYINSITE';
    document.title = appTitle;
    titlebarText.textContent = appTitle;
    welcomeTitle.textContent = appTitle;
}).catch(() => {
    document.title = 'OHMYINSITE';
    titlebarText.textContent = 'OHMYINSITE';
    welcomeTitle.textContent = 'OHMYINSITE';
});
welcomeDesc.textContent = '질문을 입력하면 의도를 자동 분류해 문서/코드/제안서 모드로 처리합니다.';
// ── 탭 전환 ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.sidebar-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.sidebar-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
        document.getElementById(`tab-${tab}`)?.classList.add('active');
    });
});
// ── 문서 패널 ─────────────────────────────────────────────────────────────────
docPanelClose.addEventListener('click', () => docPanel.classList.add('hidden'));
function showDocPreview(title, text) {
    docPanelTitle.textContent = `📄 ${title}`;
    docPanelContent.textContent = text;
    docPanel.classList.remove('hidden');
}
// ── 모델 셀렉터 ───────────────────────────────────────────────────────────────
async function initModelSelector() {
    const [models, current] = await Promise.all([
        window.api.getModels(),
        window.api.getCurrentModel(),
    ]);
    modelSelect.innerHTML = '';
    for (const m of models) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        if (m.id === current.id)
            opt.selected = true;
        modelSelect.appendChild(opt);
    }
    currentProvider = current.provider;
    updateModelBadge(current.provider);
}
function updateModelBadge(provider) {
    modelBadge.textContent = provider === 'anthropic' ? 'Anthropic' : provider === 'dify' ? 'Dify' : 'OpenAI';
    modelBadge.className = `model-provider-badge ${provider}`;
    // Fix: id is still there but className needs the right value
    modelBadge.setAttribute('id', 'model-provider-badge');
}
function intentLabel(intent) {
    if (intent === 'proposal')
        return '제안서';
    if (intent === 'hybrid')
        return '하이브리드';
    if (intent === 'code')
        return '코드';
    return '문서';
}
modelSelect.addEventListener('change', async () => {
    const modelId = modelSelect.value;
    await window.api.setModel(modelId);
    const allModels = await window.api.getModels();
    const selected = allModels.find((m) => m.id === modelId);
    if (selected) {
        currentProvider = selected.provider;
        updateModelBadge(selected.provider);
    }
});
// ── 채팅 vs 태스크 뷰 ─────────────────────────────────────────────────────────
function showChatView() {
    chatView.style.display = 'flex';
    taskDetailView.classList.remove('active');
    currentTaskId = null;
}
function showTaskDetail(task) {
    currentTaskId = task.id;
    chatView.style.display = 'none';
    taskDetailView.classList.add('active');
    renderTaskDetail(task);
}
function buildHistoryFromThread(task) {
    if (task.threadMessages && task.threadMessages.length > 0) {
        return task.threadMessages.map((m) => ({ role: m.role, content: m.text }));
    }
    const fallback = [];
    for (const l of task.log) {
        if (l.text.startsWith('사용자: ')) {
            fallback.push({ role: 'user', content: l.text.replace(/^사용자:\s*/, '') });
        }
        else if (l.text.startsWith('에이전트: ')) {
            fallback.push({ role: 'assistant', content: l.text.replace(/^에이전트:\s*/, '') });
        }
    }
    return fallback;
}
function openThread(task) {
    showChatView();
    currentThreadId = task.id;
    currentTaskId = task.id;
    history = buildHistoryFromThread(task);
    messagesEl.innerHTML = '';
    if (history.length === 0) {
        messagesEl.appendChild(welcome);
        welcome.style.display = '';
    }
    else {
        welcome.style.display = 'none';
        for (const m of history) {
            addMessage(m.role, m.content);
        }
    }
    inputEl.focus();
}
taskDetailBack.addEventListener('click', showChatView);
// ── 태스크 목록 ───────────────────────────────────────────────────────────────
function formatRelativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60)
        return '방금 전';
    const min = Math.floor(sec / 60);
    if (min < 60)
        return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 24)
        return `${hr}시간 전`;
    return `${Math.floor(hr / 24)}일 전`;
}
const statusLabels = {
    pending: '대기 중', running: '실행 중', completed: '완료', failed: '실패', cancelled: '취소됨',
};
function renderTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.dataset.taskId = task.id;
    if (currentTaskId === task.id)
        card.classList.add('selected');
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
  `;
    card.addEventListener('click', () => {
        document.querySelectorAll('.task-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        if (task.id.startsWith('task-')) {
            showTaskDetail(task);
        }
        else {
            openThread(task);
        }
    });
    const delBtn = card.querySelector('.task-delete-btn');
    delBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = confirm(`"${task.title}" 스레드를 삭제할까요?`);
        if (!ok)
            return;
        const res = await window.api.deleteTask(task.id);
        if (!res.ok) {
            addMessage('assistant', `오류: 삭제 실패 ${res.error ?? ''}`.trim());
            return;
        }
        taskMap.delete(task.id);
        if (currentThreadId === task.id) {
            currentThreadId = null;
            history = [];
            messagesEl.innerHTML = '';
            messagesEl.appendChild(welcome);
            welcome.style.display = '';
            showChatView();
        }
        if (currentTaskId === task.id)
            currentTaskId = null;
        refreshTaskList();
    });
    return card;
}
function refreshTaskList() {
    taskList.innerHTML = '';
    const sorted = Array.from(taskMap.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    sorted.forEach((t) => taskList.appendChild(renderTaskCard(t)));
}
// ── 태스크 디테일 렌더링 ──────────────────────────────────────────────────────
const logIcons = {
    info: 'ℹ', tool: '⚙', output: '📄', error: '⚠',
};
function renderTaskDetail(task) {
    // 헤더
    taskDetailTitle.textContent = task.title;
    taskDetailStatus.textContent = statusLabels[task.status];
    taskDetailStatus.className = `task-detail-status ${task.status}`;
    taskDetailStatus.setAttribute('id', 'task-detail-status');
    // 로그
    taskLogList.innerHTML = '';
    task.log.forEach((entry) => {
        const el = document.createElement('div');
        el.className = `log-entry ${entry.type}`;
        el.innerHTML = `
      <span class="log-icon">${logIcons[entry.type] ?? 'ℹ'}</span>
      <span class="log-text">${escapeHtml(entry.text)}</span>
    `;
        taskLogList.appendChild(el);
    });
    taskLogList.scrollTop = taskLogList.scrollHeight;
    // 출력 파일
    taskOutputs.innerHTML = '';
    if (task.outputFiles.length > 0) {
        taskOutputsSection.style.display = '';
        task.outputFiles.forEach((filePath) => {
            const item = document.createElement('div');
            item.className = 'output-file-item';
            const fileName = filePath.split('/').pop() ?? filePath;
            item.innerHTML = `<span>📄</span><span title="${escapeHtml(filePath)}">${escapeHtml(fileName)}</span>`;
            taskOutputs.appendChild(item);
        });
    }
    else {
        taskOutputsSection.style.display = 'none';
    }
}
// 태스크 업데이트 이벤트
window.api.onTaskUpdated((task) => {
    taskMap.set(task.id, task);
    refreshTaskList();
    if (currentTaskId === task.id && task.id.startsWith('task-')) {
        renderTaskDetail(task);
    }
});
// 기존 태스크 로드
window.api.getTasks().then((list) => {
    list.forEach((t) => taskMap.set(t.id, t));
    refreshTaskList();
    const latestThread = list
        .filter((t) => t.id.startsWith('thread-'))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    if (latestThread) {
        openThread(latestThread);
    }
});
// ── 새 태스크 모달 ────────────────────────────────────────────────────────────
newTaskBtn.addEventListener('click', () => {
    const title = `새 스레드 (${new Date().toLocaleString('ko-KR', { hour12: false })})`;
    window.api.createThread(title, DEFAULT_AGENT_ID).then((thread) => {
        taskMap.set(thread.id, thread);
        refreshTaskList();
        openThread(thread);
    }).catch((e) => {
        addMessage('assistant', `오류: 새 스레드 생성 실패 ${e.message ?? ''}`.trim());
    });
});
modalCancel.addEventListener('click', () => {
    taskModalOverlay.classList.remove('active');
});
taskModalOverlay.addEventListener('click', (e) => {
    if (e.target === taskModalOverlay)
        taskModalOverlay.classList.remove('active');
});
modalSubmit.addEventListener('click', async () => {
    let title = taskTitleInput.value.trim();
    const prompt = taskPromptInput.value.trim();
    if (!prompt) {
        addMessage('assistant', '오류: 스레드 작업 내용을 입력해 주세요.');
        taskPromptInput.focus();
        return;
    }
    if (!title) {
        const stamp = new Date().toLocaleString('ko-KR', { hour12: false });
        title = `새 스레드 (${stamp})`;
    }
    taskModalOverlay.classList.remove('active');
    // Tasks 탭으로 전환
    document.querySelectorAll('.sidebar-tab').forEach((b) => b.classList.remove('active'));
    document.querySelector('[data-tab="tasks"]')?.classList.add('active');
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    document.getElementById('tab-tasks')?.classList.add('active');
    try {
        const task = await window.api.createTask(title, prompt, DEFAULT_AGENT_ID);
        taskMap.set(task.id, task);
        refreshTaskList();
        showTaskDetail(task);
    }
    catch (e) {
        addMessage('assistant', `오류: 스레드 생성에 실패했습니다. ${e.message ?? ''}`.trim());
    }
});
// ── 채팅 메시지 ───────────────────────────────────────────────────────────────
function addMessage(role, text) {
    welcome.style.display = 'none';
    const wrap = document.createElement('div');
    wrap.className = `message ${role}`;
    const label = document.createElement('div');
    label.className = 'message-label';
    label.textContent = role === 'user' ? '나' : 'Agent';
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    if (role === 'assistant') {
        try {
            bubble.innerHTML = marked.parse(text);
            void renderMermaid(bubble);
        }
        catch {
            bubble.textContent = text;
        }
    }
    else {
        bubble.textContent = text;
    }
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'message-copy-btn';
    copyBtn.type = 'button';
    copyBtn.textContent = '복사';
    copyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(text);
            copyBtn.textContent = '복사됨';
            setTimeout(() => { copyBtn.textContent = '복사'; }, 1000);
        }
        catch {
            copyBtn.textContent = '실패';
            setTimeout(() => { copyBtn.textContent = '복사'; }, 1000);
        }
    });
    actions.appendChild(copyBtn);
    wrap.appendChild(label);
    wrap.appendChild(bubble);
    wrap.appendChild(actions);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
}
function addThinking() {
    welcome.style.display = 'none';
    const wrap = document.createElement('div');
    wrap.className = 'message assistant';
    wrap.id = 'thinking-indicator';
    const label = document.createElement('div');
    label.className = 'message-label';
    label.textContent = 'Agent';
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble thinking';
    bubble.innerHTML = '<span></span><span></span><span></span>';
    wrap.appendChild(label);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return wrap;
}
let toolBadges = [];
function addToolBadge(name) {
    const badge = document.createElement('div');
    badge.className = 'tool-badge';
    badge.textContent = `${name} 실행 중...`;
    if (currentBubble)
        currentBubble.parentElement?.appendChild(badge);
    toolBadges.push(badge);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}
function clearToolBadges() {
    toolBadges.forEach((b) => b.remove());
    toolBadges = [];
}
function makeThreadTitleFromAssistant(text) {
    const cleaned = text
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
        .replace(/[#>*_\-\[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const firstLine = cleaned.split('\n')[0]?.trim() ?? '';
    return (firstLine || '새 스레드').slice(0, 50);
}
async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isThinking || isSending)
        return;
    isSending = true;
    if (currentProvider === 'openai') {
        const auth = await window.api.getProviderAuthStatus('openai');
        if (!auth.connected) {
            addMessage('assistant', '오류: OpenAI API 키가 없습니다. `.env`의 `OPENAI_API_KEY`를 설정해 주세요.');
            isSending = false;
            return;
        }
    }
    if (!currentThreadId) {
        const autoTitle = `새 스레드 (${new Date().toLocaleString('ko-KR', { hour12: false })})`;
        try {
            const thread = await window.api.createThread(autoTitle, DEFAULT_AGENT_ID);
            currentThreadId = thread.id;
            taskMap.set(thread.id, thread);
            refreshTaskList();
        }
        catch (e) {
            addMessage('assistant', `오류: 스레드를 자동 생성하지 못했습니다. ${e.message ?? ''}`.trim());
            isSending = false;
            return;
        }
    }
    isThinking = true;
    inputEl.value = '';
    inputEl.disabled = true;
    stopBtn.disabled = false;
    sendBtn.disabled = true;
    inputEl.style.height = 'auto';
    addMessage('user', text);
    history.push({ role: 'user', content: text });
    if (currentThreadId) {
        await window.api.appendThreadMessage(currentThreadId, 'user', text);
    }
    routeInfo.textContent = '자동 라우팅: 분석 중...';
    const thinking = addThinking();
    currentBubble = null;
    let assistantText = '';
    window.api.onChunk((chunk) => {
        if (chunk.type === 'meta' && chunk.metaKind === 'routing') {
            const base = `자동 라우팅: ${intentLabel(chunk.intent)}`;
            if (chunk.provider === 'anthropic' && chunk.skillId) {
                routeInfo.textContent = `${base} · 스킬 ${chunk.skillId}`;
            }
            else {
                routeInfo.textContent = base;
            }
        }
        else if (chunk.type === 'tool' && !chunk.toolResult) {
            if (!currentBubble) {
                thinking.remove();
                currentBubble = addMessage('assistant', '');
            }
            addToolBadge(chunk.name ?? '');
        }
        else if (chunk.type === 'doc-preview') {
            showDocPreview(chunk.docTitle ?? '문서', chunk.docText ?? '');
        }
        else if (chunk.type === 'text') {
            if (!currentBubble) {
                thinking.remove();
                currentBubble = addMessage('assistant', '');
            }
            assistantText += chunk.text ?? '';
            const display = assistantText
                .replace(/<think>[\s\S]*?<\/think>/g, '')
                .replace(/<think>[\s\S]*$/g, '')
                .trimStart();
            try {
                currentBubble.innerHTML = marked.parse(display);
            }
            catch {
                currentBubble.textContent = display;
            }
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }
    });
    window.api.onDone(async () => {
        thinking.remove();
        clearToolBadges();
        if (!currentBubble && assistantText === '') {
            addMessage('assistant', '(응답 없음)');
        }
        if (currentBubble)
            renderMermaid(currentBubble);
        history.push({ role: 'assistant', content: assistantText });
        if (currentThreadId) {
            await window.api.appendThreadMessage(currentThreadId, 'assistant', assistantText || '(응답 없음)');
            const currentThread = taskMap.get(currentThreadId);
            const isFirstExchange = history.length === 2;
            const shouldAutoRename = !!currentThread
                && currentThread.title.startsWith('새 스레드')
                && isFirstExchange;
            if (shouldAutoRename) {
                const nextTitle = makeThreadTitleFromAssistant(assistantText || '(응답 없음)');
                const renameRes = await window.api.updateTaskTitle(currentThreadId, nextTitle);
                if (renameRes.ok) {
                    currentThread.title = nextTitle;
                    taskMap.set(currentThreadId, currentThread);
                    refreshTaskList();
                }
            }
        }
        isThinking = false;
        isSending = false;
        inputEl.disabled = false;
        stopBtn.disabled = true;
        sendBtn.disabled = false;
        inputEl.focus();
    });
    window.api.onStopped(async () => {
        thinking.remove();
        clearToolBadges();
        if (!currentBubble && assistantText === '') {
            addMessage('assistant', '응답이 중지되었습니다.');
        }
        if (currentBubble)
            renderMermaid(currentBubble);
        history.push({ role: 'assistant', content: assistantText || '(중지됨)' });
        if (currentThreadId) {
            await window.api.appendThreadMessage(currentThreadId, 'assistant', assistantText || '(중지됨)');
        }
        routeInfo.textContent = '자동 라우팅: 중지됨';
        isThinking = false;
        isSending = false;
        inputEl.disabled = false;
        stopBtn.disabled = true;
        sendBtn.disabled = false;
        inputEl.focus();
    });
    window.api.onError((msg) => {
        thinking.remove();
        clearToolBadges();
        addMessage('assistant', `오류: ${msg}`);
        isThinking = false;
        isSending = false;
        inputEl.disabled = false;
        stopBtn.disabled = true;
        sendBtn.disabled = false;
    });
    const MAX_HISTORY = 20;
    const trimmed = history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history;
    window.api.sendMessage(trimmed, currentAgentId);
}
async function renderMermaid(container) {
    const codeBlocks = Array.from(container.querySelectorAll('pre code.language-mermaid'));
    for (const block of codeBlocks) {
        const code = block.textContent ?? '';
        if (!code.trim())
            continue;
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-wrapper';
        const mermaidDiv = document.createElement('div');
        mermaidDiv.className = 'mermaid';
        mermaidDiv.textContent = code;
        wrapper.appendChild(mermaidDiv);
        block.closest('pre')?.replaceWith(wrapper);
    }
    const nodes = container.querySelectorAll('.mermaid');
    if (nodes.length > 0) {
        try {
            await mermaid.run({ nodes });
        }
        catch (e) {
            console.error('Mermaid 렌더링 실패:', e);
        }
    }
}
// ── 폴더 ──────────────────────────────────────────────────────────────────────
function updateFolderDisplay(p) {
    folderPath.textContent = p ? `📂 ${p.split('/').pop()}` : '';
    folderPath.title = p ?? '';
    updateFileTree();
}
async function updateFileTree() {
    const tree = await window.api.getFolderTree();
    fileTreeEl.innerHTML = '';
    if (!tree)
        return;
    renderTree(tree, fileTreeEl);
}
function renderTree(node, parentEl, depth = 0) {
    const item = document.createElement('div');
    item.className = `tree-item ${node.type}`;
    item.style.paddingLeft = `${depth * 12 + 8}px`;
    const isDirectory = node.type === 'directory';
    const hasChildren = isDirectory && Array.isArray(node.children) && node.children.length > 0;
    const isCollapsed = isDirectory && collapsedDirPaths.has(node.path);
    const disclosure = isDirectory ? (hasChildren ? (isCollapsed ? '▶' : '▼') : '•') : '';
    const icon = isDirectory ? '📁' : '📄';
    item.innerHTML = `<span class="tree-disclosure">${disclosure}</span><span>${icon}</span><span>${node.name}</span>`;
    item.title = node.path;
    parentEl.appendChild(item);
    if (isDirectory && hasChildren) {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            if (collapsedDirPaths.has(node.path)) {
                collapsedDirPaths.delete(node.path);
            }
            else {
                collapsedDirPaths.add(node.path);
            }
            void updateFileTree();
        });
    }
    if (node.children && !(isDirectory && isCollapsed)) {
        node.children.forEach((child) => renderTree(child, parentEl, depth + 1));
    }
}
folderBtn.addEventListener('click', async () => {
    const res = await window.api.pickFolder();
    if (res.ok && res.path) {
        updateFolderDisplay(res.path);
        addMessage('assistant', `📁 문서 폴더가 변경되었습니다.\n${res.path}`);
    }
});
function extractDroppedPath(event) {
    const items = event.dataTransfer?.items;
    if (items && items.length > 0) {
        for (const item of Array.from(items)) {
            if (item.kind !== 'file')
                continue;
            const f = item.getAsFile();
            if (!f)
                continue;
            const p = window.api.getPathForFile(f);
            if (p)
                return p;
        }
    }
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0)
        return null;
    for (const f of Array.from(files)) {
        const p = window.api.getPathForFile(f);
        if (p)
            return p;
    }
    const uriList = event.dataTransfer?.getData('text/uri-list')?.trim();
    if (uriList) {
        const first = uriList.split('\n').find((line) => line && !line.startsWith('#'));
        if (first?.startsWith('file://')) {
            try {
                return decodeURIComponent(first.replace('file://localhost', '').replace('file://', ''));
            }
            catch {
                // 무시
            }
        }
    }
    const textPlain = event.dataTransfer?.getData('text/plain')?.trim();
    if (textPlain?.startsWith('file://')) {
        try {
            return decodeURIComponent(textPlain.replace('file://localhost', '').replace('file://', ''));
        }
        catch {
            // 무시
        }
    }
    const fileUrl = event.dataTransfer?.getData('public.file-url')?.trim();
    if (fileUrl?.startsWith('file://')) {
        try {
            return decodeURIComponent(fileUrl.replace('file://localhost', '').replace('file://', ''));
        }
        catch {
            // 무시
        }
    }
    return null;
}
;
['dragenter', 'dragover'].forEach((evt) => {
    document.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
});
document.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedPath = extractDroppedPath(e);
    if (!droppedPath) {
        addMessage('assistant', '드롭 경로를 직접 읽지 못해 폴더 선택 창을 엽니다.');
        const picked = await window.api.pickFolder();
        if (picked.ok && picked.path) {
            updateFolderDisplay(picked.path);
            addMessage('assistant', `📁 문서 폴더가 설정되었습니다.\n${picked.path}`);
        }
        return;
    }
    const res = await window.api.setCurrentFolder(droppedPath);
    if (res.ok && res.path) {
        updateFolderDisplay(res.path);
        addMessage('assistant', `📁 드래그앤드롭으로 문서 폴더가 설정되었습니다.\n${res.path}`);
    }
    else if (res.error) {
        addMessage('assistant', `오류: ${res.error}`);
    }
});
// ── MCP 초기화 ────────────────────────────────────────────────────────────────
statusText.textContent = 'MCP 서버 시작 중...';
window.api.initMCP().then(async (res) => {
    if (res.ok) {
        dot.className = 'status-dot connected';
        if (res.difyMode) {
            statusText.textContent = 'Dify · MCP 연결됨';
        }
        else {
            statusText.textContent = `MCP · 도구 ${res.tools}개`;
        }
        inputEl.disabled = false;
        sendBtn.disabled = false;
        inputEl.focus();
        const folder = await window.api.getCurrentFolder();
        updateFolderDisplay(folder.path);
    }
    else {
        dot.className = 'status-dot error';
        statusText.textContent = `연결 실패`;
    }
});
// 모델 셀렉터 초기화
initModelSelector();
// ── 이벤트 바인딩 ─────────────────────────────────────────────────────────────
sendBtn.addEventListener('click', sendMessage);
stopBtn.addEventListener('click', () => {
    if (!isThinking)
        return;
    stopBtn.disabled = true;
    routeInfo.textContent = '자동 라우팅: 중지 요청 중...';
    window.api.stopMessage();
});
inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void sendMessage();
        return;
    }
    if (e.key === 'Escape' && isThinking) {
        e.preventDefault();
        stopBtn.disabled = true;
        routeInfo.textContent = '자동 라우팅: 중지 요청 중...';
        window.api.stopMessage();
    }
});
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isThinking)
        return;
    e.preventDefault();
    stopBtn.disabled = true;
    routeInfo.textContent = '자동 라우팅: 중지 요청 중...';
    window.api.stopMessage();
});
inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 130) + 'px';
});
// ── 유틸 ──────────────────────────────────────────────────────────────────────
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
export {};
