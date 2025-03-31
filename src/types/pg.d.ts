declare module 'pg' {
  export interface Pool {
    totalCount?: number;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
    query<T = any>(config: QueryConfig): Promise<QueryResult<T>>;
    on(event: string, listener: Function): void;
  }

  export interface PoolClient {
    query<T = any>(config: QueryConfig): Promise<QueryResult<T>>;
    release(err?: Error): void;
  }

  export interface QueryConfig {
    text: string;
    values?: any[];
    name?: string;
    rowMode?: string;
    types?: any;
  }

  export interface QueryResult<T> {
    command: string;
    rowCount: number;
    oid: number;
    rows: T[];
    fields: FieldInfo[];
  }

  export interface FieldInfo {
    name: string;
    tableID: number;
    columnID: number;
    dataTypeID: number;
    dataTypeSize: number;
    dataTypeModifier: number;
    format: string;
  }

  export class Client {
    constructor(config?: ConnectionConfig);
    connect(): Promise<void>;
    end(): Promise<void>;
    query<T = any>(config: QueryConfig): Promise<QueryResult<T>>;
    on(event: string, listener: Function): void;
  }

  export interface ConnectionConfig {
    user?: string;
    password?: string;
    host?: string;
    database?: string;
    port?: number;
    connectionString?: string;
    keepAlive?: boolean;
    stream?: any;
    ssl?: boolean | any;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
    query<T = any>(config: QueryConfig): Promise<QueryResult<T>>;
    on(event: string, listener: Function): void;
    totalCount?: number;
    idleCount?: number;
    waitingCount?: number;
  }

  export interface PoolConfig extends ConnectionConfig {
    max?: number;
    min?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    maxUses?: number;
    application_name?: string;
  }

  export class Query {
    text: string;
    values: any[];
    rows: any[];
    types: any;
    name: string;
    binary: boolean;
    portal: string;
    on(event: string, listener: Function): void;
    submit(connection: any): void;
  }
}