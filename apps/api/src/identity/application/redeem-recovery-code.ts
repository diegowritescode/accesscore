import { type Clock } from '../../shared/kernel/clock';
import { type UserId } from '../../shared/kernel/user-id';
import { type RecoveryCodesRepository } from '../domain/ports/recovery-codes-repository';
import { type TokenGenerator } from '../domain/ports/token-generator';

export interface RedeemRecoveryCodeInput {
  userId: UserId;
  code: string;
}

export class RedeemRecoveryCodeHandler {
  constructor(
    private readonly recovery: RecoveryCodesRepository,
    private readonly tokens: TokenGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: RedeemRecoveryCodeInput): Promise<boolean> {
    const code = await this.recovery.findByHash(input.userId, this.tokens.hash(input.code));
    if (!code || code.isConsumed()) {
      return false;
    }
    code.consume(this.clock.now());
    return this.recovery.consume(code);
  }
}

export const REDEEM_RECOVERY_CODE_HANDLER = Symbol('REDEEM_RECOVERY_CODE_HANDLER');
