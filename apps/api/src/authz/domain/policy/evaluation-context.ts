export interface EvaluationContext {
  readonly principal: { readonly aal: number; readonly authTime: Date | null };
  readonly env: { readonly ip: string; readonly now: Date };
  readonly resource: Readonly<Record<string, never>>;
}
