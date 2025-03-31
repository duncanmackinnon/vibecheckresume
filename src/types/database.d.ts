declare namespace Database {
  interface User {
    id: number;
    email: string;
    createdAt: Date;
    updatedAt: Date;
  }

  interface Resume {
    id: number;
    userId: number;
    content: string;
    filename: string;
    createdAt: Date;
    updatedAt: Date;
  }

  interface Analysis {
    id: number;
    resumeId: number;
    jobDescription: string;
    score: number;
    matchedSkills: {
      name: string;
      match: boolean;
    }[];
    missingSkills: string[];
    recommendations: {
      improvements: string[];
      strengths: string[];
      skillGaps: string[];
      format: string[];
    };
    createdAt: Date;
  }

  interface QueryConfig {
    text: string;
    values?: any[];
  }

  interface ConnectionConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean | {
      rejectUnauthorized: boolean;
    };
  }

  interface DatabaseError extends Error {
    code?: string;
    column?: string;
    constraint?: string;
    dataType?: string;
    detail?: string;
    file?: string;
    hint?: string;
    internalPosition?: string;
    internalQuery?: string;
    line?: string;
    position?: string;
    routine?: string;
    schema?: string;
    severity?: string;
    table?: string;
    where?: string;
  }

  interface Transaction {
    begin(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    query<T = any>(config: QueryConfig): Promise<T[]>;
  }

  interface Pool {
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
    query<T = any>(config: QueryConfig): Promise<T[]>;
    on(event: string, listener: Function): void;
  }

  interface PoolClient {
    query<T = any>(config: QueryConfig): Promise<T[]>;
    release(err?: Error): void;
  }

  // Utility types for query results
  type QueryResult<T> = {
    command: string;
    rowCount: number;
    oid: number;
    rows: T[];
  };

  type InsertResult<T> = QueryResult<T> & {
    rowCount: 1;
    rows: [T];
  };

  type UpdateResult<T> = QueryResult<T> & {
    rowCount: number;
  };

  type DeleteResult = QueryResult<never> & {
    rowCount: number;
  };
}