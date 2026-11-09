import React from 'react';
import { Anchor, Text } from '@mantine/core';
import { translationCriteriaScreen } from '../screens/book.js';

export default function TranslationCriteria() {
 const model=translationCriteriaScreen();
 return <>
  <Text mb="md">{model.intro}</Text>
  <ol className="translation-criteria">
   {model.steps.map(step=><li key={step.title}><strong>{step.title}</strong> {step.body}</li>)}
  </ol>
  <Text mt="md">{model.basis.before} <Anchor href={model.basis.link.href} target="_blank" rel="noreferrer">{model.basis.link.text}</Anchor>{model.basis.after}</Text>
 </>;
}
