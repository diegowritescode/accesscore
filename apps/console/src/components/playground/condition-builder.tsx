'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/language-provider';
import { Button, Select, TextInput, cn } from '../ui';
import { Segmented } from './form-kit';

type Attr = 'principal.aal' | 'env.now' | 'env.ip' | 'ip.cidr';
type CmpOp = 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge';
type Combinator = 'and' | 'or';

interface Clause {
  id: string;
  attr: Attr;
  op: CmpOp;
  value: string;
}

const ATTRS: { value: Attr; label: string }[] = [
  { value: 'principal.aal', label: 'principal.aal' },
  { value: 'env.ip', label: 'env.ip' },
  { value: 'ip.cidr', label: 'env.ip in CIDR' },
  { value: 'env.now', label: 'env.now' },
];

const OP_LABELS: Record<CmpOp, string> = {
  eq: '=',
  ne: '≠',
  lt: '<',
  le: '≤',
  gt: '>',
  ge: '≥',
};

const NUMERIC_OPS: CmpOp[] = ['eq', 'ne', 'lt', 'le', 'gt', 'ge'];
const STRING_OPS: CmpOp[] = ['eq', 'ne'];

function opsFor(attr: Attr): CmpOp[] {
  if (attr === 'principal.aal' || attr === 'env.now') return NUMERIC_OPS;
  if (attr === 'env.ip') return STRING_OPS;
  return [];
}

function inputTypeFor(attr: Attr): string {
  if (attr === 'principal.aal') return 'number';
  if (attr === 'env.now') return 'datetime-local';
  return 'text';
}

function placeholderFor(attr: Attr): string {
  switch (attr) {
    case 'principal.aal':
      return '2';
    case 'env.ip':
      return '203.0.113.10';
    case 'ip.cidr':
      return '203.0.113.0/24, 10.0.0.0/8';
    case 'env.now':
      return '';
  }
}

function compileClause(clause: Clause): unknown {
  if (clause.attr === 'ip.cidr') {
    return {
      kind: 'ipInCidr',
      ip: { kind: 'attr', path: 'env.ip' },
      cidrs: clause.value
        .split(',')
        .map((cidr) => cidr.trim())
        .filter(Boolean),
    };
  }
  if (clause.attr === 'principal.aal') {
    const numeric = Number(clause.value);
    return {
      kind: 'cmp',
      op: clause.op,
      left: { kind: 'attr', path: 'principal.aal' },
      right: { kind: 'lit', value: Number.isNaN(numeric) ? 0 : numeric },
    };
  }
  let literal = clause.value;
  if (clause.attr === 'env.now' && clause.value) {
    const parsed = new Date(clause.value);
    if (!Number.isNaN(parsed.getTime())) {
      literal = parsed.toISOString();
    }
  }
  return {
    kind: 'cmp',
    op: clause.op,
    left: { kind: 'attr', path: clause.attr },
    right: { kind: 'lit', value: literal },
  };
}

function compile(combinator: Combinator, clauses: Clause[]): unknown {
  const nodes = clauses.map(compileClause);
  if (nodes.length === 1) {
    return nodes[0];
  }
  return { kind: combinator, children: nodes };
}

const PRESETS: { labelKey: string; combinator: Combinator; clauses: Omit<Clause, 'id'>[] }[] = [
  {
    labelKey: 'builder.presetMfa',
    combinator: 'and',
    clauses: [{ attr: 'principal.aal', op: 'ge', value: '2' }],
  },
  {
    labelKey: 'builder.presetIp',
    combinator: 'and',
    clauses: [{ attr: 'ip.cidr', op: 'eq', value: '203.0.113.0/24' }],
  },
  {
    labelKey: 'builder.presetDeadline',
    combinator: 'and',
    clauses: [{ attr: 'env.now', op: 'le', value: '2026-12-31T23:59' }],
  },
];

export function ConditionBuilder({ onChange }: { onChange: (condition: unknown) => void }) {
  const t = useT();
  const nextId = useRef(1);
  const [combinator, setCombinator] = useState<Combinator>('and');
  const [clauses, setClauses] = useState<Clause[]>([
    { id: 'c0', attr: 'principal.aal', op: 'ge', value: '2' },
  ]);
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    onChange(compile(combinator, clauses));
  }, [combinator, clauses, onChange]);

  function updateClause(id: string, patch: Partial<Clause>) {
    setClauses((current) =>
      current.map((clause) => {
        if (clause.id !== id) return clause;
        const next = { ...clause, ...patch };
        if (patch.attr) {
          const [firstOp] = opsFor(patch.attr);
          if (firstOp && !opsFor(patch.attr).includes(next.op)) {
            next.op = firstOp;
          }
          next.value = '';
        }
        return next;
      }),
    );
  }

  function addClause() {
    setClauses((current) => [
      ...current,
      { id: `c${nextId.current++}`, attr: 'principal.aal', op: 'ge', value: '' },
    ]);
  }

  function removeClause(id: string) {
    setClauses((current) =>
      current.length === 1 ? current : current.filter((clause) => clause.id !== id),
    );
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setCombinator(preset.combinator);
    setClauses(preset.clauses.map((clause) => ({ ...clause, id: `c${nextId.current++}` })));
  }

  return (
    <div className="flex flex-col gap-3">
      {clauses.length > 1 ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{t('builder.match')}</span>
          <Segmented
            ariaLabel={t('builder.match')}
            value={combinator}
            onChange={setCombinator}
            options={[
              { value: 'and', label: t('builder.all') },
              { value: 'or', label: t('builder.any') },
            ]}
          />
          <span className="text-xs text-muted">{t('builder.ofThese')}</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {clauses.map((clause) => {
          const ops = opsFor(clause.attr);
          return (
            <div key={clause.id} className="flex flex-wrap items-center gap-2">
              <Select
                aria-label={t('builder.attribute')}
                value={clause.attr}
                onChange={(event) => updateClause(clause.id, { attr: event.target.value as Attr })}
                className="w-auto min-w-[9.5rem] font-mono"
              >
                {ATTRS.map((attr) => (
                  <option key={attr.value} value={attr.value}>
                    {attr.label}
                  </option>
                ))}
              </Select>

              {ops.length > 0 ? (
                <Select
                  aria-label={t('builder.operator')}
                  value={clause.op}
                  onChange={(event) => updateClause(clause.id, { op: event.target.value as CmpOp })}
                  className="w-16 text-center font-mono"
                >
                  {ops.map((op) => (
                    <option key={op} value={op}>
                      {OP_LABELS[op]}
                    </option>
                  ))}
                </Select>
              ) : (
                <span className="px-1 font-mono text-sm text-muted">{t('builder.in')}</span>
              )}

              <TextInput
                aria-label={t('builder.value')}
                type={inputTypeFor(clause.attr)}
                value={clause.value}
                placeholder={placeholderFor(clause.attr)}
                onChange={(event) => updateClause(clause.id, { value: event.target.value })}
                className="w-auto flex-1 font-mono"
              />

              <button
                type="button"
                aria-label={t('builder.removeCondition')}
                onClick={() => removeClause(clause.id)}
                disabled={clauses.length === 1}
                className={cn(
                  'shrink-0 rounded-lg border border-line px-2.5 py-2 text-sm text-muted transition-colors',
                  clauses.length === 1
                    ? 'cursor-not-allowed opacity-40'
                    : 'hover:border-line-strong hover:text-deny',
                )}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={addClause}
          className="px-3 py-1.5 text-xs"
        >
          {t('builder.addCondition')}
        </Button>
        <span className="mx-1 text-xs text-muted">{t('builder.presets')}</span>
        {PRESETS.map((preset) => (
          <Button
            key={preset.labelKey}
            type="button"
            variant="ghost"
            onClick={() => applyPreset(preset)}
            className="px-2.5 py-1.5 text-xs"
          >
            {t(preset.labelKey)}
          </Button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowJson((current) => !current)}
        className="self-start text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-fg"
      >
        {showJson ? t('builder.hideJson') : t('builder.viewJson')}
      </button>
      {showJson ? (
        <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs leading-relaxed text-fg">
          {JSON.stringify(compile(combinator, clauses), null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
