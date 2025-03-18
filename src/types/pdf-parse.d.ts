declare module 'pdf-parse' {
  interface PDFExtractResult {
    text: string;
    info: {
      Author?: string;
      CreationDate?: string;
      Creator?: string;
      Keywords?: string;
      ModDate?: string;
      Producer?: string;
      Subject?: string;
      Title?: string;
    };
    metadata: any;
    version: string;
    numpages: number;
  }

  export class PDFExtract {
    extract(buffer: Buffer): Promise<PDFExtractResult>;
  }

  export default function(buffer: Buffer): Promise<PDFExtractResult>;
}