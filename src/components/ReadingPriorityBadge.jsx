import React from 'react';
import {Badge,Tooltip} from '@mantine/core';
import {priorityBadgeScreen} from '../screens/catalog.js';

export default function ReadingPriorityBadge({ranking}){
 if(!ranking)return null;
 const model=priorityBadgeScreen(ranking);
 return <Tooltip label={model.tooltip} withArrow>
  <Badge component="span" className="reading-priority-badge" variant="filled" color="brand">
   <span className="visually-hidden">{model.spoken}</span>
   <span className="priority-rank" aria-hidden="true">{model.rank}</span><span className="priority-score" aria-hidden="true">{model.score}</span>
  </Badge>
 </Tooltip>;
}
