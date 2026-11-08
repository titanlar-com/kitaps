import React from 'react';
import {Badge,Group,Paper,Progress,Stack,Text,Title} from '@mantine/core';

export default function ReadingPriorityCard({ranking}){
 if(!ranking)return null;
 return <Paper withBorder p="lg" radius="lg" className="reading-priority-card">
  <Group justify="space-between" align="flex-start" gap="md"><div><Text className="eyebrow">OKUMA ÖNCELİĞİ</Text><Title order={3}>{ranking.score} / 100</Title><Text c="dimmed" mt={4}>{ranking.audience==='children'?'Çocuk kitapları arasında sıra':'Katalog sırası'} · {ranking.rank}</Text></div><Badge size="xl" variant="transparent" className="maturity-badge" data-level={ranking.maturity}>{ranking.maturityLabel}</Badge></Group>
  <Progress value={ranking.score} size="lg" mt="lg" aria-label={`Toplam okuma önceliği: 100 üzerinden ${ranking.score}`}/>
  <Stack gap="sm" mt="lg">{ranking.criteria.map(item=><div className="score-criterion" key={item.id}><Group justify="space-between" gap="md" wrap="nowrap"><Text fw={500}>{item.label}</Text><Text className="score-points">+{item.points.toFixed(1)}</Text></Group><Progress value={item.normalized*100} size="sm" mt={5} aria-label={`${item.label}: yüzde ${Math.round(item.normalized*100)}, katkı ${item.points.toFixed(1)} puan`}/><Text c="dimmed" mt={5}>{item.evidence}</Text></div>)}</Stack>
  {ranking.reasons?.length>0&&<div className="score-reasons"><Text fw={500}>En güçlü gerekçeler</Text><ul>{ranking.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul></div>}
  <Text mt="lg"><strong>Puan güveni:</strong> %{ranking.confidence}</Text><Text c="dimmed" mt={6}>Kural sürümü: {ranking.policyVersion}. Puan yalnızca katalog, kitap ilişkileri veya kural sürümü değiştiğinde yeniden hesaplanır. Satın alma, favori, okuma durumu, okuma kaydı ve kişisel sıra puanı değiştirmez.</Text>
 </Paper>;
}
