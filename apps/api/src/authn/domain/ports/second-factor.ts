import { type UserId } from '../../../shared/kernel/user-id';

export interface SecondFactorProof {
  kind: 'totp' | 'recovery';
  value: string;
}

export interface SecondFactor {
  verify(userId: UserId, proof: SecondFactorProof): Promise<boolean>;
}

export const SECOND_FACTOR = Symbol('SECOND_FACTOR');
