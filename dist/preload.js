"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('api', {
    // ── MCP 초기화 ───────────────────────────────────────────────────────────────
    initMCP: () => electron_1.ipcRenderer.invoke('init-mcp'),
    getAppMeta: () => electron_1.ipcRenderer.invoke('get-app-meta'),
    // ── 에이전트 ─────────────────────────────────────────────────────────────────
    getAgents: () => electron_1.ipcRenderer.invoke('get-agents'),
    // ── 채팅 ─────────────────────────────────────────────────────────────────────
    sendMessage: (messages, agentId) => electron_1.ipcRenderer.send('send-message', { messages, agentId }),
    stopMessage: () => electron_1.ipcRenderer.send('stop-message'),
    onChunk: (cb) => {
        electron_1.ipcRenderer.removeAllListeners('agent-chunk');
        electron_1.ipcRenderer.on('agent-chunk', (_, data) => cb(data));
    },
    onDone: (cb) => {
        electron_1.ipcRenderer.removeAllListeners('agent-done');
        electron_1.ipcRenderer.once('agent-done', () => cb());
    },
    onError: (cb) => {
        electron_1.ipcRenderer.removeAllListeners('agent-error');
        electron_1.ipcRenderer.once('agent-error', (_, msg) => cb(msg));
    },
    onStopped: (cb) => {
        electron_1.ipcRenderer.removeAllListeners('agent-stopped');
        electron_1.ipcRenderer.once('agent-stopped', () => cb());
    },
    // ── 폴더 ─────────────────────────────────────────────────────────────────────
    pickFolder: () => electron_1.ipcRenderer.invoke('pick-folder'),
    setCurrentFolder: (newPath) => electron_1.ipcRenderer.invoke('set-current-folder', newPath),
    getPathForFile: (file) => electron_1.webUtils.getPathForFile(file),
    getCurrentFolder: () => electron_1.ipcRenderer.invoke('get-current-folder'),
    getFolderTree: () => electron_1.ipcRenderer.invoke('get-folder-tree'),
    // ── 모델 ─────────────────────────────────────────────────────────────────────
    getModels: () => electron_1.ipcRenderer.invoke('get-models'),
    getCurrentModel: () => electron_1.ipcRenderer.invoke('get-current-model'),
    setModel: (modelId) => electron_1.ipcRenderer.invoke('set-model', modelId),
    getProviderAuthStatus: (provider) => electron_1.ipcRenderer.invoke('get-provider-auth-status', provider),
    // ── 태스크 ───────────────────────────────────────────────────────────────────
    createThread: (title, agentId) => electron_1.ipcRenderer.invoke('create-thread', { title, agentId }),
    updateTaskTitle: (taskId, title) => electron_1.ipcRenderer.invoke('update-task-title', { taskId, title }),
    appendThreadLog: (threadId, type, text) => electron_1.ipcRenderer.invoke('append-thread-log', { threadId, type, text }),
    appendThreadMessage: (threadId, role, text) => electron_1.ipcRenderer.invoke('append-thread-message', { threadId, role, text }),
    createTask: (title, prompt, agentId) => electron_1.ipcRenderer.invoke('create-task', { title, prompt, agentId }),
    getTasks: () => electron_1.ipcRenderer.invoke('get-tasks'),
    cancelTask: (taskId) => electron_1.ipcRenderer.invoke('cancel-task', taskId),
    deleteTask: (taskId) => electron_1.ipcRenderer.invoke('delete-task', taskId),
    onTaskUpdated: (cb) => {
        electron_1.ipcRenderer.removeAllListeners('task-updated');
        electron_1.ipcRenderer.on('task-updated', (_, task) => cb(task));
    },
});
