'use client';

import { useState } from 'react';
import { Panel, cn } from '../ui';
import { CheckPanel } from './check-panel';
import { ExpandPanel } from './expand-panel';
import { SimulatePanel } from './simulate-panel';

type TabId = 'check' | 'expand' | 'simulate';

const tabs: { id: TabId; label: string; blurb: string }[] = [
  { id: 'check', label: 'Check', blurb: 'One decision, fully explained.' },
  { id: 'expand', label: 'Expand', blurb: 'Resolve a relation to its subjects.' },
  { id: 'simulate', label: 'Simulate', blurb: 'Live vs. proposed, side by side.' },
];

export function Playground() {
  const [active, setActive] = useState<TabId>('check');

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Playground tools"
        className="flex flex-wrap gap-2 rounded-xl border border-line bg-surface p-1.5"
      >
        {tabs.map((tab) => {
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(tab.id)}
              className={cn(
                'flex flex-1 flex-col items-start rounded-lg px-4 py-2.5 text-left transition-colors',
                selected ? 'bg-brand text-white' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              <span className="text-sm font-semibold">{tab.label}</span>
              <span className={cn('text-xs', selected ? 'text-white/80' : 'text-muted/80')}>
                {tab.blurb}
              </span>
            </button>
          );
        })}
      </div>

      <Panel>
        {active === 'check' ? <CheckPanel /> : null}
        {active === 'expand' ? <ExpandPanel /> : null}
        {active === 'simulate' ? <SimulatePanel /> : null}
      </Panel>
    </div>
  );
}
