import { type Tx, type UnitOfWork } from '../shared/persistence/unit-of-work';
import { type Database } from './db.module';

export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Database) {}

  withTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction((executor) => work({ executor }));
  }
}
