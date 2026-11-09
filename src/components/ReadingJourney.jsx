import React from 'react';
import { Group, Progress, Text, Timeline } from '@mantine/core';
import { IconBook, IconCheck } from '@tabler/icons-react';
import { formatDay } from '../library';
import { readingJourneyScreen } from '../screens/book.js';

const STEP_ICONS = { started: IconBook, finished: IconCheck };

// How far a reading is and when it happened, at the top of the book page. The fields that change
// these stay in the reading record below.
export default function ReadingJourney({ record }) {
  const model = readingJourneyScreen({ record, formatDay });
  if (!model) return null;
  return <section className="reading-journey" aria-label={model.label}>
    {model.progress && <div className="reading-journey-progress">
      <Group justify="space-between" wrap="nowrap">
        <Text className="tabular-nums">{model.progress.pages}</Text>
        <Text className="tabular-nums">{model.progress.percent}</Text>
      </Group>
      <Progress value={model.progress.value} size="md" aria-label={model.progress.label} />
    </div>}
    {model.steps.length > 0 && <Timeline active={model.steps.length - 1}>
      {model.steps.map(({ kind, label, day }) => {
        const Icon = STEP_ICONS[kind];
        return <Timeline.Item key={kind} title={label} bullet={<Icon size={16} aria-hidden="true" />}><Text className="reading-journey-day">{day}</Text></Timeline.Item>;
      })}
    </Timeline>}
  </section>;
}
