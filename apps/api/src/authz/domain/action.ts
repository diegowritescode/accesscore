import { err, ok, type Result } from '../../shared/result';
import { isIdentifier } from './identifier';

export type ActionError = 'invalid_action';

export class Action {
  private constructor(
    readonly namespace: string,
    readonly verb: string,
  ) {}

  static create(name: string): Result<Action, ActionError> {
    const parts = name.split('.');
    if (parts.length !== 2) {
      return err('invalid_action');
    }
    const [namespace, verb] = parts;
    if (!namespace || !verb || !isIdentifier(namespace) || !isIdentifier(verb)) {
      return err('invalid_action');
    }
    return ok(new Action(namespace, verb));
  }

  static of(name: string): Action {
    const result = Action.create(name);
    if (!result.ok) {
      throw new Error(`invalid action: ${name}`);
    }
    return result.value;
  }

  get name(): string {
    return `${this.namespace}.${this.verb}`;
  }

  equals(other: Action): boolean {
    return this.namespace === other.namespace && this.verb === other.verb;
  }
}
