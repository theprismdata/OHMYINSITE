import fs from 'fs';
import * as cfb from 'cfb';
import pako from 'pako';

function extractTextFromHwp(filePath) {
  const buffer = fs.readFileSync(filePath);
  const doc = cfb.read(buffer, { type: 'buffer' });
  
  let extractedText = '';
  
  const sectionPaths = doc.FullPaths.filter(p => p.includes('BodyText/Section')).sort();
  
  for (const p of sectionPaths) {
    const entry = doc.FileIndex.find(e => e.name === p.split('/').pop() && p.includes(e.name));
    if (!entry || !entry.content) continue;
    
    try {
      const decompressed = Buffer.from(pako.inflateRaw(entry.content));
      let offset = 0;
      
      while (offset < decompressed.length) {
        if (offset + 4 > decompressed.length) break;
        const header = decompressed.readUInt32LE(offset);
        offset += 4;
        
        const tagId = header & 0x3FF;
        let size = (header >> 20) & 0xFFF;
        
        if (size === 0xFFF) {
          if (offset + 4 > decompressed.length) break;
          size = decompressed.readUInt32LE(offset);
          offset += 4;
        }
        
        if (offset + size > decompressed.length) break;
        
        if (tagId === 67) { // HWPTAG_PARA_TEXT
          const textBuf = decompressed.subarray(offset, offset + size);
          let i = 0;
          let text = '';
          while (i + 1 < textBuf.length) {
            const ch = textBuf.readUInt16LE(i);
            i += 2;
            
            if (ch >= 0x0020) {
              text += String.fromCharCode(ch);
            } else {
              // Control chars
              switch (ch) {
                case 13: // Paragraph break
                case 10: // Line break
                  text += '\n';
                  break;
                case 9: // Tab
                  text += '\t';
                  break;
                case 1: case 2: case 3: case 11: case 12: case 14: case 15: 
                case 16: case 17: case 18: case 21: case 22: case 23: case 24:
                  // 16-byte control (2 bytes for ch + 14 bytes payload)
                  i += 14;
                  break;
                default:
                  // Other 2-byte controls, just ignore
                  break;
              }
            }
          }
          extractedText += text + '\n';
        }
        
        offset += size;
      }
    } catch (e) {
      console.error('Section parse error:', e);
    }
  }
  
  return extractedText;
}

const testFile = process.argv[2] ?? './sample.hwp';

try {
  const text = extractTextFromHwp(testFile);
  console.log('추출 성공! 길이:', text.length);
  console.log('미리보기:\n', text.substring(0, 500));
} catch (e) {
  console.error('전체 에러:', e);
}
