import {
  type TransactionOptions,
  type Tx,
  type UnitOfWork,
} from '../shared/persistence/unit-of-work';
import { type Database } from './db.module';

export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Database) {}

  withTransaction<T>(work: (tx: Tx) => Promise<T>, options?: TransactionOptions): Promise<T> {
    return this.db.transaction((executor) => work({ executor }), {
      isolationLevel: options?.isolationLevel,
      accessMode: options?.readOnly ? 'read only' : undefined,
    });
  }
}
