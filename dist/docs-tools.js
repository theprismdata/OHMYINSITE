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
exports.setDocsRoot = setDocsRoot;
exports.getDocsRoot = getDocsRoot;
exports.listDocuments = listDocuments;
exports.searchDocuments = searchDocuments;
exports.readDocument = readDocument;
exports.getCategories = getCategories;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pdf_parse_1 = require("pdf-parse");
const jszip_1 = __importDefault(require("jszip"));
const cfb = __importStar(require("cfb"));
const pako_1 = __importDefault(require("pako"));
const mammoth_1 = __importDefault(require("mammoth"));
const DEFAULT_DOCS_ROOT = path_1.default.join(process.cwd(), 'MCP-DRIVE');
let DOCS_ROOT = process.env.DOCS_ROOT?.trim() || DEFAULT_DOCS_ROOT;
const SUPPORTED_EXTS = new Set(['.pdf', '.pptx', '.ppt', '.hwp', '.hwpx', '.docx', '.doc']);
function setDocsRoot(newPath) {
    DOCS_ROOT = newPath;
}
function getDocsRoot() {
    return DOCS_ROOT;
}
function getAllDocs() {
    const results = [];
    function walk(dir) {
        let entries;
        try {
            entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const fullPath = path_1.default.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            }
            else {
                const ext = path_1.default.extname(entry.name).toLowerCase();
                if (SUPPORTED_EXTS.has(ext)) {
                    const rel = path_1.default.relative(DOCS_ROOT, fullPath);
                    const parts = rel.split(path_1.default.sep);
                    const category = parts.length > 1 ? parts[0] : '루트';
                    const stat = fs_1.default.statSync(fullPath);
                    results.push({
                        path: rel,
                        name: path_1.default.basename(entry.name, ext),
                        type: ext.slice(1),
                        category,
                        size_kb: Math.round((stat.size / 1024) * 10) / 10,
                    });
                }
            }
        }
    }
    walk(DOCS_ROOT);
    return results.sort((a, b) => a.path.localeCompare(b.path));
}
async function extractPdfText(fullPath, maxPages = 10) {
    const buffer = fs_1.default.readFileSync(fullPath);
    const parser = new pdf_parse_1.PDFParse({ data: buffer });
    const result = await parser.getText({ first: maxPages });
    const pages = result.pages
        .map((p, i) => `[페이지 ${i + 1}]\n${p.text.trim()}`)
        .filter((p) => p.trim().length > 10);
    return { total: result.total, text: pages.join('\n\n') };
}
async function extractPptxText(fullPath, maxSlides = 20) {
    const buffer = fs_1.default.readFileSync(fullPath);
    const zip = await jszip_1.default.loadAsync(buffer);
    const slideFiles = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => {
        const na = parseInt(a.match(/(\d+)/)[1]);
        const nb = parseInt(b.match(/(\d+)/)[1]);
        return na - nb;
    });
    const total = slideFiles.length;
    const texts = [];
    for (let i = 0; i < Math.min(maxSlides, slideFiles.length); i++) {
        const xml = await zip.files[slideFiles[i]].async('string');
        const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? [];
        const slideText = matches
            .map((t) => t.replace(/<[^>]+>/g, '').trim())
            .filter(Boolean)
            .join(' ');
        if (slideText.trim()) {
            texts.push(`[슬라이드 ${i + 1}]\n${slideText.trim()}`);
        }
    }
    return { total, text: texts.join('\n\n') };
}
async function extractHwpText(fullPath, maxPages = 10) {
    try {
        const buffer = fs_1.default.readFileSync(fullPath);
        const doc = cfb.read(buffer, { type: 'buffer' });
        let extractedText = '';
        const sectionPaths = doc.FullPaths.filter((p) => p.includes('BodyText/Section')).sort();
        for (const p of sectionPaths) {
            const entryName = p.split('/').pop();
            const entry = doc.FileIndex.find((e) => e.name === entryName && p.includes(e.name));
            if (!entry || !entry.content)
                continue;
            try {
                const decompressed = Buffer.from(pako_1.default.inflateRaw(entry.content));
                let offset = 0;
                while (offset < decompressed.length) {
                    if (offset + 4 > decompressed.length)
                        break;
                    const header = decompressed.readUInt32LE(offset);
                    offset += 4;
                    const tagId = header & 0x3ff;
                    let size = (header >> 20) & 0xfff;
                    if (size === 0xfff) {
                        if (offset + 4 > decompressed.length)
                            break;
                        size = decompressed.readUInt32LE(offset);
                        offset += 4;
                    }
                    if (offset + size > decompressed.length)
                        break;
                    if (tagId === 67) { // HWPTAG_PARA_TEXT
                        const textBuf = decompressed.subarray(offset, offset + size);
                        let i = 0;
                        let text = '';
                        while (i + 1 < textBuf.length) {
                            const ch = textBuf.readUInt16LE(i);
                            i += 2;
                            if (ch >= 0x0020) {
                                text += String.fromCharCode(ch);
                            }
                            else {
                                switch (ch) {
                                    case 13:
                                    case 10:
                                        text += '\n';
                                        break;
                                    case 9:
                                        text += '\t';
                                        break;
                                    case 1:
                                    case 2:
                                    case 3:
                                    case 11:
                                    case 12:
                                    case 14:
                                    case 15:
                                    case 16:
                                    case 17:
                                    case 18:
                                    case 21:
                                    case 22:
                                    case 23:
                                    case 24:
                                        i += 14; // 16-byte control chars (2 bytes + 14 bytes payload)
                                        break;
                                }
                            }
                        }
                        extractedText += text + '\n';
                    }
                    offset += size;
                }
            }
            catch (e) {
                // 일부 섹션 파싱 실패 시 무시하고 진행
            }
        }
        // HWP는 페이지 구분이 명확하지 않아 섹션 단위로 나누거나 텍스트 길이로 자릅니다.
        // 여기서는 1000자를 1페이지로 간주하여 maxPages 만큼 자릅니다.
        const charsPerPage = 1000;
        const totalPages = Math.ceil(extractedText.length / charsPerPage);
        const limitedText = extractedText.slice(0, maxPages * charsPerPage);
        return { total: totalPages, text: limitedText.trim() };
    }
    catch (error) {
        throw new Error(`HWP 파싱 실패: ${error.message}`);
    }
}
async function extractDocxText(fullPath, maxPages = 10) {
    // mammoth는 .docx(OOXML) 및 .doc(레거시 Word) 파싱을 지원합니다.
    // .doc(OLE 이진 형식)은 지원이 제한적이며, 일부 문서에서 텍스트 추출이 불완전할 수 있습니다.
    const result = await mammoth_1.default.extractRawText({ path: fullPath });
    const fullText = result.value;
    // Word는 별도 페이지 구분이 없으므로 1000자를 1페이지로 간주합니다.
    const charsPerPage = 1000;
    const totalPages = Math.ceil(fullText.length / charsPerPage);
    const limitedText = fullText.slice(0, maxPages * charsPerPage);
    return { total: totalPages, text: limitedText.trim() };
}
async function listDocuments(category = null) {
    const docs = getAllDocs();
    if (category)
        return docs.filter((d) => d.category === category);
    return docs;
}
async function searchDocuments(keyword, searchContent = true) {
    const kw = keyword.toLowerCase();
    const results = [];
    for (const doc of getAllDocs()) {
        const fullPath = path_1.default.join(DOCS_ROOT, doc.path);
        if (doc.name.toLowerCase().includes(kw)) {
            results.push({ ...doc, matched_in: 'name' });
            continue;
        }
        if (searchContent) {
            try {
                let text = '';
                if (doc.type === 'pdf') {
                    const { text: t } = await extractPdfText(fullPath, 5);
                    text = t;
                }
                else if (doc.type === 'hwp') {
                    const { text: t } = await extractHwpText(fullPath, 5);
                    text = t;
                }
                else if (doc.type === 'docx' || doc.type === 'doc') {
                    const { text: t } = await extractDocxText(fullPath, 5);
                    text = t;
                }
                else {
                    const { text: t } = await extractPptxText(fullPath, 5);
                    text = t;
                }
                if (text.toLowerCase().includes(kw)) {
                    results.push({ ...doc, matched_in: 'content' });
                }
            }
            catch {
                // 읽기 실패 시 건너뜀
            }
        }
    }
    return results;
}
async function readDocument(docPath, maxPages = 10) {
    const fullPath = path_1.default.join(DOCS_ROOT, docPath);
    if (!fs_1.default.existsSync(fullPath))
        return { error: `파일을 찾을 수 없습니다: ${docPath}` };
    const ext = path_1.default.extname(fullPath).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext))
        return { error: `지원하지 않는 형식: ${ext}` };
    try {
        let total;
        let text;
        let unit;
        if (ext === '.pdf') {
            ;
            ({ total, text } = await extractPdfText(fullPath, maxPages));
            unit = '페이지';
        }
        else if (ext === '.hwp') {
            ;
            ({ total, text } = await extractHwpText(fullPath, maxPages));
            unit = '페이지';
        }
        else if (ext === '.docx' || ext === '.doc') {
            ;
            ({ total, text } = await extractDocxText(fullPath, maxPages));
            unit = '페이지';
        }
        else {
            ;
            ({ total, text } = await extractPptxText(fullPath, maxPages));
            unit = '슬라이드';
        }
        return {
            title: path_1.default.basename(fullPath, ext),
            type: ext.slice(1),
            total_pages: total,
            extracted_pages: Math.min(maxPages, total),
            unit,
            text,
        };
    }
    catch (e) {
        return { error: e.message };
    }
}
async function getCategories() {
    const categories = new Set(getAllDocs().map((d) => d.category));
    return [...categories].sort();
}
