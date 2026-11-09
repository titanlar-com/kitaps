import React from 'react';
import {Badge,Group,Paper,Progress,Stack,Text,Title} from '@mantine/core';
import {priorityCardScreen} from '../screens/catalog.js';

export default function ReadingPriorityCard({ranking}){
 if(!ranking)return null;
 const model=priorityCardScreen(ranking);
 return <Paper withBorder p="lg" radius="lg" className="reading-priority-card">
  <Group justify="space-between" align="flex-start" gap="md"><div><Text className="eyebrow">{model.eyebrow}</Text><Title order={3}>{model.score}</Title><Text c="dimmed" mt={4}>{model.place}</Text></div><Badge size="xl" variant="transparent" className="maturity-badge" data-level={model.maturity.level}>{model.maturity.label}</Badge></Group>
  <Progress value={model.total.value} size="lg" mt="lg" aria-label={model.total.label}/>
  <Stack gap="sm" mt="lg">{model.criteria.map(item=><div className="score-criterion" key={item.id}><Group justify="space-between" gap="md" wrap="nowrap"><Text fw={500}>{item.label}</Text><Text className="score-points">{item.points}</Text></Group><Progress value={item.value} size="sm" mt={5} aria-label={item.progressLabel}/><Text c="dimmed" mt={5}>{item.evidence}</Text></div>)}</Stack>
  {model.reasons&&<div className="score-reasons"><Text fw={500}>{model.reasons.title}</Text><ul>{model.reasons.items.map(reason=><li key={reason}>{reason}</li>)}</ul></div>}
  <Text mt="lg"><strong>{model.confidence.label}</strong> {model.confidence.value}</Text><Text c="dimmed" mt={6}>{model.policy}</Text>
 </Paper>;
}
