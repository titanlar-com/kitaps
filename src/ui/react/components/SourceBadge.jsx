import React from 'react';
import {Badge} from '@mantine/core';
import {sourceBadgeScreen} from '../../../screens/catalog.js';

export default function SourceBadge({id}) {return <Badge color={id==='kitaps'?'grape':id==='local'?'orange':id==='children'?'teal':'brand'}>{sourceBadgeScreen(id).label}</Badge>}
