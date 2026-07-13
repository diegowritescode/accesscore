export interface Tx {
  readonly executor: unknown;
}

export interface TransactionOptions {
  readonly readOnly?: boolean;
  readonly isolationLevel?: 'repeatable read' | 'serializable';
}

export interface UnitOfWork {
  withTransaction<T>(work: (tx: Tx) => Promise<T>, options?: TransactionOptions): Promise<T>;
}

export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');
