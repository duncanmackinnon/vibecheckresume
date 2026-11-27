declare module 'mammoth' {
  export interface MammothMessage {
    type: string;
    message: string;
  }

  export interface MammothResult<T = string> {
    value: T;
    messages: MammothMessage[];
  }

  export type MammothInput =
    | { path: string }
    | { buffer: Buffer }
    | { arrayBuffer: ArrayBuffer };

  export function convertToHtml(
    input: MammothInput,
    options?: Record<string, unknown>,
  ): Promise<MammothResult<string>>;

  export function extractRawText(input: MammothInput): Promise<MammothResult<string>>;
}
