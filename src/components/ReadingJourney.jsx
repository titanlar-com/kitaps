import React from 'react';
import { Group, Progress, Text, Timeline } from '@mantine/core';
import { IconBook, IconCheck } from '@tabler/icons-react';
import { formatDay } from '../library';
import { readingJourney } from '../reading';

const STEPS = { started: { label: 'Başladım', Icon: IconBook }, finished: { label: 'Bitirdim', Icon: IconCheck } };

// How far a reading is and when it happened, at the top of the book page. The fields that change
// these stay in the reading record below.
export default function ReadingJourney({ record }) {
  const journey = readingJourney(record);
  if (!journey.hasAny) return null;
  return <section className="reading-journey" aria-label="Okuma durumum">
    {journey.percent !== null && <div className="reading-journey-progress">
      <Group justify="space-between" wrap="nowrap">
        <Text className="tabular-nums">{journey.page} / {journey.totalPages} sayfa</Text>
        <Text className="tabular-nums">%{journey.percent}</Text>
      </Group>
      <Progress value={journey.percent} size="md" aria-label="Okunan sayfa oranı" />
    </div>}
    {journey.steps.length > 0 && <Timeline active={journey.steps.length - 1}>
      {journey.steps.map(({ kind, day }) => {
        const { label, Icon } = STEPS[kind];
        return <Timeline.Item key={kind} title={label} bullet={<Icon size={16} aria-hidden="true" />}><Text className="reading-journey-day">{formatDay(day)}</Text></Timeline.Item>;
      })}
    </Timeline>}
  </section>;
}
