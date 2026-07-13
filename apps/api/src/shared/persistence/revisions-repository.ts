import { type Revision } from '../kernel/revision';
import { type Tx } from './unit-of-work';

export interface RevisionsRepository {
  allocate(tx: Tx): Promise<Revision>;
  current(tx: Tx): Promise<Revision>;
}

export const REVISIONS_REPOSITORY = Symbol('REVISIONS_REPOSITORY');
