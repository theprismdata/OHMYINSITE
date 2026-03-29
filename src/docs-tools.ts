import fs from 'fs'
import path from 'path'
import { PDFParse } from 'pdf-parse'
import JSZip from 'jszip'
import * as cfb from 'cfb'
import pako from 'pako'
import mammoth from 'mammoth'
import type { DocInfo, SearchResult, DocumentContent } from './types'

let DOCS_ROOT = '/Users/prismdata/Library/CloudStorage/OneDrive-ITCEN/MCP-DRIVE'
const SUPPORTED_EXTS = new Set(['.pdf', '.pptx', '.ppt', '.hwp', '.hwpx', '.docx', '.doc'])

export function setDocsRoot(newPath: string): void {
  DOCS_ROOT = newPath
}

export function getDocsRoot(): string {
  return DOCS_ROOT
}

function getAllDocs(): DocInfo[] {
  const results: DocInfo[] = []

  function walk(dir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else {
        const ext = path.extname(entry.name).toLowerCase()
        if (SUPPORTED_EXTS.has(ext)) {
          const rel = path.relative(DOCS_ROOT, fullPath)
          const parts = rel.split(path.sep)
          const category = parts.length > 1 ? parts[0] : '루트'
          const stat = fs.statSync(fullPath)
          results.push({
            path: rel,
            name: path.basename(entry.name, ext),
            type: ext.slice(1),
            category,
            size_kb: Math.round((stat.size / 1024) * 10) / 10,
          })
        }
      }
    }
  }

  walk(DOCS_ROOT)
  return results.sort((a, b) => a.path.localeCompare(b.path))
}

async function extractPdfText(
  fullPath: string,
  maxPages = 10,
): Promise<{ total: number; text: string }> {
  const buffer = fs.readFileSync(fullPath)
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText({ first: maxPages })
  const pages = result.pages
    .map((p, i) => `[페이지 ${i + 1}]\n${p.text.trim()}`)
    .filter((p) => p.trim().length > 10)
  return { total: result.total, text: pages.join('\n\n') }
}

async function extractPptxText(
  fullPath: string,
  maxSlides = 20,
): Promise<{ total: number; text: string }> {
  const buffer = fs.readFileSync(fullPath)
  const zip = await JSZip.loadAsync(buffer)

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)![1])
      const nb = parseInt(b.match(/(\d+)/)![1])
      return na - nb
    })

  const total = slideFiles.length
  const texts: string[] = []

  for (let i = 0; i < Math.min(maxSlides, slideFiles.length); i++) {
    const xml = await zip.files[slideFiles[i]].async('string')
    const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? []
    const slideText = matches
      .map((t: string) => t.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean)
      .join(' ')
    if (slideText.trim()) {
      texts.push(`[슬라이드 ${i + 1}]\n${slideText.trim()}`)
    }
  }

  return { total, text: texts.join('\n\n') }
}

async function extractHwpText(
  fullPath: string,
  maxPages = 10,
): Promise<{ total: number; text: string }> {
  try {
    const buffer = fs.readFileSync(fullPath)
    const doc = cfb.read(buffer, { type: 'buffer' })
    
    let extractedText = ''
    const sectionPaths = doc.FullPaths.filter((p) => p.includes('BodyText/Section')).sort()
    
    for (const p of sectionPaths) {
      const entryName = p.split('/').pop()
      const entry = doc.FileIndex.find((e) => e.name === entryName && p.includes(e.name))
      if (!entry || !entry.content) continue
      
      try {
        const decompressed = Buffer.from(pako.inflateRaw(entry.content as Uint8Array))
        let offset = 0
        
        while (offset < decompressed.length) {
          if (offset + 4 > decompressed.length) break
          const header = decompressed.readUInt32LE(offset)
          offset += 4
          
          const tagId = header & 0x3ff
          let size = (header >> 20) & 0xfff
          
          if (size === 0xfff) {
            if (offset + 4 > decompressed.length) break
            size = decompressed.readUInt32LE(offset)
            offset += 4
          }
          
          if (offset + size > decompressed.length) break
          
          if (tagId === 67) { // HWPTAG_PARA_TEXT
            const textBuf = decompressed.subarray(offset, offset + size)
            let i = 0
            let text = ''
            while (i + 1 < textBuf.length) {
              const ch = textBuf.readUInt16LE(i)
              i += 2
              
              if (ch >= 0x0020) {
                text += String.fromCharCode(ch)
              } else {
                switch (ch) {
                  case 13: case 10: text += '\n'; break
                  case 9: text += '\t'; break
                  case 1: case 2: case 3: case 11: case 12: case 14: case 15:
                  case 16: case 17: case 18: case 21: case 22: case 23: case 24:
                    i += 14 // 16-byte control chars (2 bytes + 14 bytes payload)
                    break
                }
              }
            }
            extractedText += text + '\n'
          }
          offset += size
        }
      } catch (e) {
        // 일부 섹션 파싱 실패 시 무시하고 진행
      }
    }
    
    // HWP는 페이지 구분이 명확하지 않아 섹션 단위로 나누거나 텍스트 길이로 자릅니다.
    // 여기서는 1000자를 1페이지로 간주하여 maxPages 만큼 자릅니다.
    const charsPerPage = 1000
    const totalPages = Math.ceil(extractedText.length / charsPerPage)
    const limitedText = extractedText.slice(0, maxPages * charsPerPage)
    
    return { total: totalPages, text: limitedText.trim() }
  } catch (error) {
    throw new Error(`HWP 파싱 실패: ${(error as Error).message}`)
  }
}

async function extractDocxText(
  fullPath: string,
  maxPages = 10,
): Promise<{ total: number; text: string }> {
  // mammoth는 .docx(OOXML) 및 .doc(레거시 Word) 파싱을 지원합니다.
  // .doc(OLE 이진 형식)은 지원이 제한적이며, 일부 문서에서 텍스트 추출이 불완전할 수 있습니다.
  const result = await mammoth.extractRawText({ path: fullPath })
  const fullText = result.value

  // Word는 별도 페이지 구분이 없으므로 1000자를 1페이지로 간주합니다.
  const charsPerPage = 1000
  const totalPages = Math.ceil(fullText.length / charsPerPage)
  const limitedText = fullText.slice(0, maxPages * charsPerPage)

  return { total: totalPages, text: limitedText.trim() }
}

export async function listDocuments(category: string | null = null): Promise<DocInfo[]> {
  const docs = getAllDocs()
  if (category) return docs.filter((d) => d.category === category)
  return docs
}

export async function searchDocuments(
  keyword: string,
  searchContent = true,
): Promise<SearchResult[]> {
  const kw = keyword.toLowerCase()
  const results: SearchResult[] = []

  for (const doc of getAllDocs()) {
    const fullPath = path.join(DOCS_ROOT, doc.path)

    if (doc.name.toLowerCase().includes(kw)) {
      results.push({ ...doc, matched_in: 'name' })
      continue
    }

    if (searchContent) {
      try {
        let text = ''
        if (doc.type === 'pdf') {
          const { text: t } = await extractPdfText(fullPath, 5)
          text = t
        } else if (doc.type === 'hwp') {
          const { text: t } = await extractHwpText(fullPath, 5)
          text = t
        } else if (doc.type === 'docx' || doc.type === 'doc') {
          const { text: t } = await extractDocxText(fullPath, 5)
          text = t
        } else {
          const { text: t } = await extractPptxText(fullPath, 5)
          text = t
        }
        if (text.toLowerCase().includes(kw)) {
          results.push({ ...doc, matched_in: 'content' })
        }
      } catch {
        // 읽기 실패 시 건너뜀
      }
    }
  }

  return results
}

export async function readDocument(
  docPath: string,
  maxPages = 10,
): Promise<DocumentContent> {
  const fullPath = path.join(DOCS_ROOT, docPath)
  if (!fs.existsSync(fullPath)) return { error: `파일을 찾을 수 없습니다: ${docPath}` }

  const ext = path.extname(fullPath).toLowerCase()
  if (!SUPPORTED_EXTS.has(ext)) return { error: `지원하지 않는 형식: ${ext}` }

  try {
    let total: number
    let text: string
    let unit: string
    if (ext === '.pdf') {
      ;({ total, text } = await extractPdfText(fullPath, maxPages))
      unit = '페이지'
    } else if (ext === '.hwp') {
      ;({ total, text } = await extractHwpText(fullPath, maxPages))
      unit = '페이지'
    } else if (ext === '.docx' || ext === '.doc') {
      ;({ total, text } = await extractDocxText(fullPath, maxPages))
      unit = '페이지'
    } else {
      ;({ total, text } = await extractPptxText(fullPath, maxPages))
      unit = '슬라이드'
    }
    return {
      title: path.basename(fullPath, ext),
      type: ext.slice(1),
      total_pages: total,
      extracted_pages: Math.min(maxPages, total),
      unit,
      text,
    }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function getCategories(): Promise<string[]> {
  const categories = new Set(getAllDocs().map((d) => d.category))
  return [...categories].sort()
}
