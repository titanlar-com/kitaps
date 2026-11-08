import {useEffect,useMemo,useState} from 'react';
import {GitHubStateRepository} from './GitHubStateRepository.ts';
import {GITHUB_STATE_BACKUP_KEY} from './types.ts';
import {createSyncController,SHARED_REFRESH_MS} from '../core/sync/controller.js';
import {useViewModel} from '../adapters/react/useViewModel.js';
import {browserLifecycle,browserStorage,browserTimers} from '../adapters/browser/ports.js';

export {SHARED_REFRESH_MS};

/** The copy of this device's records taken before a first sync decision. */
export function readSyncBackup(){
 try{return JSON.parse(localStorage.getItem(GITHUB_STATE_BACKUP_KEY)||'null')}catch{return null}
}

const deviceStorage=browserStorage({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)});

/** React's binding to the sync controller (ADR 003, phase 8). `source` owns the reader's data. */
export function useGitHubStateSync({bookIds,source}){
 const [controller]=useState(()=>createSyncController({bookIds,source,repository:new GitHubStateRepository(),lifecycle:browserLifecycle(),timers:browserTimers(),storage:deviceStorage,now:()=>Date.now()}));
 useEffect(()=>{controller.start();return controller.stop},[controller]);
 const snapshot=useViewModel(controller);
 return useMemo(()=>({...snapshot,...controller.commands}),[snapshot,controller]);
}
