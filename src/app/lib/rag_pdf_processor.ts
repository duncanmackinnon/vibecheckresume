import { createWorker, Worker } from 'tesseract.js';
import * as tf from '@tensorflow/tfjs';
import * as use from '@tensorflow-models/universal-sentence-encoder';
import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';
import { Buffer } from 'buffer';

// Configuration
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const MIN_TEXT_LENGTH = 50;
const OCR_TIMEOUT = 30000;

interface ProcessedChunk {
  text: string;
  embedding: tf.Tensor;
  pageNumber: number;
}

export class PDFRAGProcessor {
  private worker: Worker | null = null;
  private useModel: use.UniversalSentenceEncoder | null = null;
  private chunks: ProcessedChunk[] = [];

  async initialize() {
    try {
      this.worker = await createWorker('eng', 1, {
        logger: (m: unknown) => console.log(m),
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/worker.min.js',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@4/tesseract-core.wasm.js'
      });
      this.useModel = await use.load();
    } catch (err) {
      throw new Error(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
    this.chunks = [];
  }

  async processPDF(file: File): Promise<string> {
    if (!this.worker || !this.useModel) {
      throw new Error('Processor not initialized');
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.min.js';

    // First try standard text extraction
    let fullText = await this.extractPDFText(arrayBuffer);
    
    // Fallback to OCR if text extraction fails
    if (!this.isValidText(fullText)) {
      fullText = await this.extractWithOCR(arrayBuffer);
    }

    await this.createChunks(fullText);
    return fullText;
  }

  private async extractPDFText(arrayBuffer: ArrayBuffer): Promise<string> {
    const pdfjs = await import('pdfjs-dist');
    const loadingTask = pdfjs.getDocument({
      data: arrayBuffer,
      disableFontFace: true,
      disableAutoFetch: true
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const pdf = await loadingTask.promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items
          .map((item: TextItem | TextMarkedContent) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim() + '\n';
      }

      clearTimeout(timeout);
      return fullText;
    } catch (error) {
      clearTimeout(timeout);
      console.warn('Standard PDF text extraction failed, falling back to OCR');
      return '';
    }
  }

  private async extractWithOCR(arrayBuffer: ArrayBuffer): Promise<string> {
    if (!this.worker) throw new Error('OCR worker not available');

    const pdfjs = await import('pdfjs-dist');
    const loadingTask = pdfjs.getDocument({
      data: arrayBuffer,
      disableFontFace: true,
      disableAutoFetch: true
    });

    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context!,
        viewport
      }).promise;

      const dataUrl = canvas.toDataURL('image/png');
      const { data: { text } } = await this.worker.recognize(dataUrl);
      fullText += text + '\n';
    }

    return fullText;
  }

  private isValidText(text: string): boolean {
    if (!text?.trim()) return false;
    const wordCount = text.split(/\s+/).length;
    return wordCount >= 50 && /[a-zA-Z]{4,}/.test(text);
  }

  private async createChunks(fullText: string): Promise<void> {
    if (!this.useModel) throw new Error('Model not loaded');

    const paragraphs = fullText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    let chunks: ProcessedChunk[] = [];

    for (const para of paragraphs) {
      if (para.length > CHUNK_SIZE) {
        // Split large paragraphs into chunks with overlap
        let start = 0;
        while (start < para.length) {
          const end = Math.min(start + CHUNK_SIZE, para.length);
          const chunkText = para.substring(start, end);
          const embedding = await this.useModel.embed(chunkText);
          
          chunks.push({
            text: chunkText,
            embedding: embedding as unknown as tf.Tensor,
            pageNumber: 0 // Will be updated with actual page numbers
          });

          start = end - CHUNK_OVERLAP;
        }
      } else {
        const embedding = await this.useModel.embed(para);
        chunks.push({
          text: para,
          embedding: embedding as unknown as tf.Tensor,
          pageNumber: 0
        });
      }
    }

    this.chunks = chunks.filter(c => c.text.length >= MIN_TEXT_LENGTH);
  }

  async semanticSearch(query: string, topK = 3): Promise<string[]> {
    if (!this.useModel || this.chunks.length === 0) {
      throw new Error('Processor not ready for search');
    }

    const queryEmbedding = await this.useModel.embed(query);
    const similarities = this.chunks.map(chunk => {
      return tf.matMul(
        queryEmbedding as unknown as tf.Tensor,
        chunk.embedding.transpose()
      ).dataSync()[0];
    });

    const topIndices = similarities
      .map((val, idx) => ({val, idx}))
      .sort((a, b) => b.val - a.val)
      .slice(0, topK)
      .map(item => item.idx);

    return topIndices.map(idx => this.chunks[idx].text);
  }
}