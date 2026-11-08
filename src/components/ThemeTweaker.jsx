import React, { useState } from 'react';
import { ActionIcon, Popover, Radio, SegmentedControl, Text, Tooltip, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { IconCheck, IconPalette } from '@tabler/icons-react';
import { WOODS, deviceStorage, readWood, saveWood } from '../app/woods';

const MODES = [{ value: 'dark', label: 'Koyu' }, { value: 'light', label: 'Açık' }];

// The colour panel: a wood scheme and dark or light. Each swatch carries its own data-wood, so it
// shows that scheme's real tokens from src/woods.css, in the mode the reader is using.
export default function ThemeTweaker() {
  const mode = useComputedColorScheme('dark');
  const { setColorScheme } = useMantineColorScheme();
  const [wood, setWood] = useState(() => readWood(deviceStorage()));
  const choose = id => {
    setWood(id);
    saveWood(id, deviceStorage());
    document.documentElement.setAttribute('data-wood', id);
  };
  return <Popover position="bottom-end" width="min(20rem, calc(100vw - 2rem))" shadow="lg" trapFocus returnFocus withinPortal>
    <Tooltip label="Renk düzeni" withArrow><Popover.Target><ActionIcon className="theme-toggle" variant="default" aria-label="Renk düzeni"><IconPalette size={22} /></ActionIcon></Popover.Target></Tooltip>
    <Popover.Dropdown className="theme-panel" aria-label="Renk düzeni">
      <Text className="theme-panel-title">Renk düzeni</Text>
      <SegmentedControl fullWidth aria-label="Görünüm" value={mode} onChange={setColorScheme} data={MODES} />
      <Radio.Group value={wood} onChange={choose} label="Ağaç" name="wood-scheme">
        <div className="theme-panel-woods">
          {WOODS.map(({ id, label, note }) => <Radio.Card key={id} className="wood-card" value={id}>
            <Radio.Indicator icon={IconCheck} />
            <span className="wood-card-text">
              <span className="wood-card-label">{label}</span>
              <span className="wood-card-note">{note}</span>
            </span>
            <span className="wood-swatch" data-wood={id} data-mantine-color-scheme={mode} aria-hidden="true"><i /><i /><i /><i /></span>
          </Radio.Card>)}
        </div>
      </Radio.Group>
    </Popover.Dropdown>
  </Popover>;
}
