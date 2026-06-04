/**
 * Search Package - BM25 + 关键词混合搜索
 */

export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  score: number;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  includeSnippet?: boolean;
}

const STOP_WORDS = new Set(['的', '了', '和', '是', '在', '与', '及', 'the', 'a', 'an', 'and', 'or', 'is', 'are']);

export class BM25 {
  private documents = new Map<string, { title: string; content: string }>();
  private invertedIndex = new Map<string, Map<string, number>>();
  private docLengths = new Map<string, number>();
  private avgDocLength = 0;
  
  private k1 = 1.5;
  private b = 0.75;

  index(id: string, title: string, content: string): void {
    this.documents.set(id, { title, content });
    
    const words = this.tokenize(title + ' ' + content);
    const docLength = words.length;
    this.docLengths.set(id, docLength);
    
    for (const word of words) {
      let docFreq = this.invertedIndex.get(word);
      if (!docFreq) {
        docFreq = new Map();
        this.invertedIndex.set(word, docFreq);
      }
      docFreq.set(id, (docFreq.get(id) ?? 0) + 1);
    }
    
    const totalLength = Array.from(this.docLengths.values()).reduce((a, b) => a + b, 0);
    this.avgDocLength = totalLength / this.docLengths.size;
  }

  remove(id: string): void {
    this.documents.delete(id);
    this.docLengths.delete(id);
    
    for (const [, docFreq] of this.invertedIndex) {
      docFreq.delete(id);
    }
  }

  search(query: string, limit = 10): SearchResult[] {
    const queryWords = this.tokenize(query);
    if (queryWords.length === 0) return [];

    const scores = new Map<string, number>();
    const N = this.documents.size;

    for (const word of queryWords) {
      const docFreq = this.invertedIndex.get(word);
      if (!docFreq) continue;

      const df = docFreq.size;
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

      for (const [docId, tf] of docFreq) {
        const docLength = this.docLengths.get(docId) ?? 1;
        const score = idf * (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * docLength / this.avgDocLength));
        scores.set(docId, (scores.get(docId) ?? 0) + score);
      }
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score]) => {
        const doc = this.documents.get(id)!;
        return {
          id,
          title: doc.title,
          snippet: this.generateSnippet(doc.content, queryWords),
          score,
        };
      });
  }

  private tokenize(text: string): string[] {
    const chinese = text.match(/[\u4e00-\u9fa5]+/g) ?? [];
    const chineseWords: string[] = [];
    
    for (const segment of chinese) {
      for (let i = 0; i < segment.length - 1; i++) {
        chineseWords.push(segment.slice(i, i + 2));
      }
    }

    const english = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1);

    return [...chineseWords, ...english].filter(w => !STOP_WORDS.has(w));
  }

  private generateSnippet(content: string, queryWords: string[]): string {
    const sentences = content.split(/[.!?。！？\n]+/).filter(s => s.trim());
    
    let bestSentence = sentences[0] ?? content.slice(0, 100);
    let maxMatches = 0;

    for (const sentence of sentences) {
      const matches = queryWords.filter(word => sentence.includes(word)).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        bestSentence = sentence;
      }
    }

    let snippet = bestSentence.slice(0, 150);
    if (bestSentence.length > 150) snippet += '...';

    for (const word of queryWords) {
      if (word.length >= 2) {
        const regex = new RegExp(`(${word})`, 'gi');
        snippet = snippet.replace(regex, '<mark>$1</mark>');
      }
    }

    return snippet;
  }

  get size(): number {
    return this.documents.size;
  }
}

// 单例
let searchEngine: BM25 | null = null;

export function getSearchEngine(): BM25 {
  if (!searchEngine) {
    searchEngine = new BM25();
  }
  return searchEngine;
}
