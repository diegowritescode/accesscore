'use client';

import { useState } from 'react';
import { useT } from '../i18n/language-provider';
import { Panel, cn } from '../ui';
import { CheckPanel } from './check-panel';
import { ExpandPanel } from './expand-panel';
import { SimulatePanel } from './simulate-panel';

type TabId = 'check' | 'expand' | 'simulate';

const tabs: { id: TabId; labelKey: string; blurbKey: string }[] = [
  { id: 'check', labelKey: 'playground.tabCheck', blurbKey: 'playground.tabCheckBlurb' },
  { id: 'expand', labelKey: 'playground.tabExpand', blurbKey: 'playground.tabExpandBlurb' },
  { id: 'simulate', labelKey: 'playground.tabSimulate', blurbKey: 'playground.tabSimulateBlurb' },
];

export function Playground() {
  const t = useT();
  const [active, setActive] = useState<TabId>('check');

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label={t('playground.title')}
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
              <span className="text-sm font-semibold">{t(tab.labelKey)}</span>
              <span className={cn('text-xs', selected ? 'text-white/80' : 'text-muted/80')}>
                {t(tab.blurbKey)}
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
