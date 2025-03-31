declare module 'dotenv' {
  export function config(options?: {
    path?: string;
    encoding?: string;
    debug?: boolean;
    override?: boolean;
  }): {
    error?: Error;
    parsed?: { [key: string]: string };
  };
  
  export function parse(
    src: string | Buffer,
    options?: {
      debug?: boolean;
    }
  ): { [key: string]: string };
}

declare module 'path' {
  export function resolve(...pathSegments: string[]): string;
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
  export function basename(path: string, ext?: string): string;
}

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    OPENAI_API_KEY: string;
    [key: string]: string | undefined;
  }
}

declare module '*.json' {
  const value: any;
  export default value;
}