import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { marked } from 'marked';
import type { ExportFormat, GeneratedDocument } from './types.js';

// Export to Markdown (returns content as-is)
export async function exportMarkdown(
  document: GeneratedDocument
): Promise<{ content: string; mimeType: string; extension: string }> {
  return {
    content: document.content,
    mimeType: 'text/markdown',
    extension: 'md',
  };
}

// Export to HTML
export async function exportHtml(
  document: GeneratedDocument
): Promise<{ content: string; mimeType: string; extension: string }> {
  const htmlContent = await marked.parse(document.content);

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${document.templateName}</title>
    <style>
        body {
            font-family: "Microsoft YaHei", "SimSun", serif;
            line-height: 1.8;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            color: #333;
        }
        h1 { color: #1a1a1a; border-bottom: 2px solid #333; padding-bottom: 10px; }
        h2, h3 { color: #2a2a2a; }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 20px 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px 12px;
            text-align: left;
        }
        th { background-color: #f5f5f5; }
        code {
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
        }
        pre {
            background: #f4f4f4;
            padding: 15px;
            overflow-x: auto;
            border-radius: 5px;
        }
        blockquote {
            border-left: 4px solid #ddd;
            margin: 0;
            padding-left: 15px;
            color: #666;
        }
        .metadata {
            color: #888;
            font-size: 0.9em;
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #eee;
        }
    </style>
</head>
<body>
${htmlContent}
<div class="metadata">
    <p>生成时间: ${new Date(document.metadata.generatedAt).toLocaleString('zh-CN')}</p>
    <p>生成者: ${document.metadata.generatedBy}</p>
    <p>字数: ${document.metadata.wordCount}</p>
</div>
</body>
</html>`;

  return {
    content: html,
    mimeType: 'text/html',
    extension: 'html',
  };
}

// Export to DOCX
export async function exportDocx(
  document: GeneratedDocument
): Promise<{ content: Buffer; mimeType: string; extension: string }> {
  const lines = document.content.split('\n');
  const paragraphs: Paragraph[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      paragraphs.push(new Paragraph({ text: '' }));
      continue;
    }

    // Heading 1: # title
    if (trimmed.startsWith('# ')) {
      paragraphs.push(
        new Paragraph({
          text: trimmed.slice(2),
          heading: HeadingLevel.HEADING_1,
        })
      );
      continue;
    }

    // Heading 2: ## title
    if (trimmed.startsWith('## ')) {
      paragraphs.push(
        new Paragraph({
          text: trimmed.slice(3),
          heading: HeadingLevel.HEADING_2,
        })
      );
      continue;
    }

    // Heading 3: ### title
    if (trimmed.startsWith('### ')) {
      paragraphs.push(
        new Paragraph({
          text: trimmed.slice(4),
          heading: HeadingLevel.HEADING_3,
        })
      );
      continue;
    }

    // List items
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed.slice(2) })],
          bullet: { level: 0 },
        })
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(trimmed)) {
      const match = trimmed.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: match[2] })],
          })
        );
      }
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed.slice(2), italics: true, color: '#666' })],
        })
      );
      continue;
    }

    // Bold text within paragraph
    const children = parseInlineFormatting(trimmed);
    paragraphs.push(new Paragraph({ children }));
  }

  // Add metadata paragraph
  paragraphs.push(
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({
          text: `生成时间: ${new Date(document.metadata.generatedAt).toLocaleString('zh-CN')}`,
          color: '#888888',
          size: 18,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `生成者: ${document.metadata.generatedBy}`,
          color: '#888888',
          size: 18,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `字数: ${document.metadata.wordCount}`,
          color: '#888888',
          size: 18,
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  return {
    content: buffer,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx',
  };
}

// Parse inline formatting (bold, italic)
function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index) }));
    }

    if (match[1] !== undefined) {
      // **bold**
      runs.push(new TextRun({ text: match[1], bold: true }));
    } else if (match[2] !== undefined) {
      // *italic*
      runs.push(new TextRun({ text: match[2], italics: true }));
    } else if (match[3] !== undefined) {
      // `code`
      runs.push(new TextRun({ text: match[3], font: 'Courier New' }));
    }

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex) }));
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text }));
  }

  return runs;
}

// Main export function
export async function exportDocument(
  document: GeneratedDocument,
  format: ExportFormat
): Promise<{ content: string | Buffer; mimeType: string; extension: string }> {
  switch (format) {
    case 'markdown':
      return exportMarkdown(document);
    case 'html':
      return exportHtml(document);
    case 'docx':
      return exportDocx(document);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}
