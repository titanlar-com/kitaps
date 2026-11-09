import React,{useEffect,useId,useRef,useState} from 'react';
import {Alert,Anchor,Button,Paper,PasswordInput,Stepper,Text,Title} from '@mantine/core';
import {IconAlertTriangle,IconArrowUpRight,IconBrandGithub,IconRefresh} from '@tabler/icons-react';
import SyncRecoveryAlert from './SyncRecovery';
import {GITHUB_STATE_OWNER} from '../../../state/types.ts';
import {SITE_URL} from '../../../site';
import {syncPanelScreen,syncTokenFormWords} from '../../../screens/sync.js';
import './SyncPanels.css';

// The token is kept in this origin's storage, which every Pages site on the same host can read.
const SITE_HOST=new URL(SITE_URL).host;

// Pre-filled creation form: the organisation that owns the state repository as
// resource owner, Contents read and write, 90 days. GitHub cannot pre-select the
// repository, so the steps below name it.
const TOKEN_FORM='https://github.com/settings/personal-access-tokens/new?'+new URLSearchParams({name:syncTokenFormWords.name,description:syncTokenFormWords.description,target_name:GITHUB_STATE_OWNER,expires_in:'90',contents:'write'});

/** Connects this browser to the shared state file. Inside a dialog that already
 * carries the title, `framed={false}` drops the panel's own frame and heading. */
export default function GitHubSyncPanel({sync,framed=true}){
 const [token,setToken]=useState('');const [submitting,setSubmitting]=useState(false);
 const [formOpened,setFormOpened]=useState(false);
 const status=useRef(null);const submitted=useRef(false);const cleared=useRef(false);const tokenField=useRef(null);
 // The button that removed the key has gone, so focus goes to the field that can take a new one.
 useEffect(()=>{if(cleared.current&&!sync.hasToken){cleared.current=false;tokenField.current?.focus()}},[sync.hasToken]);
const stepsTitle=useId();
 // A successful connect replaces the form, and the focused button with it; the status takes focus.
 useEffect(()=>{if(sync.hasToken&&submitted.current){submitted.current=false;status.current?.focus()}},[sync.hasToken]);
 const submit=async event=>{event.preventDefault();setSubmitting(true);submitted.current=true;try{await sync.saveToken(token);setToken('')}catch{submitted.current=false}finally{setSubmitting(false)}};
 const model=syncPanelScreen({sync,host:SITE_HOST});
 const failing=sync.status==='error';
 // The steps follow only what this page can see: the form was opened, a key was typed. What the reader does on GitHub stays unmarked.
 const activeStep=token.trim()?3:formOpened?1:0;
 const steps=model.connect.steps.map(step=>step.link?{...step,description:<><Anchor href={TOKEN_FORM} target="_blank" rel="noreferrer" onClick={()=>setFormOpened(true)}>{step.link.text}<span className="sync-link-end">{step.link.end}<IconArrowUpRight size={15} aria-hidden="true"/></span></Anchor>{step.description}</>}:step);
 const content=<>
  {framed&&<Title order={3} mb="sm">{model.title}</Title>}
  <Alert ref={status} tabIndex={-1} role="status" className="sync-alert" data-tone={failing?'danger':undefined} icon={failing?<IconAlertTriangle size={20}/>:<IconBrandGithub size={20}/>} title={model.alert.title}>{sync.message}{model.alert.pendingNote}</Alert>
  {model.activity&&<Text c="dimmed" className="sync-activity">{model.activity}</Text>}
  {sync.recovery&&<SyncRecoveryAlert sync={sync} onRemoved={()=>status.current?.focus()}/>}
  <Text c="dimmed" className="sync-intro">{model.intro}</Text>
  {sync.hasToken
   ?<div className="sync-actions"><Button variant="light" leftSection={<IconRefresh size={18}/>} onClick={()=>void sync.flush().catch(()=>undefined)}>{model.actions.send}</Button><Button variant="default" onClick={()=>void sync.load()}>{model.actions.reload}</Button><Button variant="subtle" className="sync-danger" onClick={()=>{cleared.current=true;sync.clearToken()}}>{model.actions.removeKey}</Button></div>
   :<>
    <div className="sync-actions"><Button type="button" variant="default" leftSection={<IconRefresh size={18}/>} onClick={()=>void sync.load()}>{model.reload}</Button></div>
    <form onSubmit={submit} className="sync-connect">
     <Text id={stepsTitle} className="sync-connect-title">{model.connect.title}</Text>
     <Stepper role="list" aria-labelledby={stepsTitle} aria-busy={submitting||undefined} className="sync-steps" orientation="vertical" size="sm" iconSize={32} active={activeStep}>
      {steps.map((step,index)=><Stepper.Step key={step.label} component="div" role="listitem" aria-current={index===activeStep?'step':undefined} label={<>{step.label}{index<activeStep&&<span className="visually-hidden">{model.connect.doneNote}</span>}</>} description={step.description} loading={submitting&&index===activeStep}/>)}
     </Stepper>
     <PasswordInput ref={tokenField} className="sync-token-field" label={model.connect.tokenField.label} description={model.connect.tokenField.description} value={token} onChange={event=>setToken(event.currentTarget.value)} autoComplete="off" required/>
     <Button className="sync-submit" type="submit" loading={submitting} disabled={!token.trim()}>{model.connect.submit}</Button>
     <Text c="dimmed" className="sync-storage-note">{model.connect.storageNote}</Text>
    </form>
   </>}
 </>;
 return framed?<Paper p="lg" radius="lg" className="github-sync-panel">{content}</Paper>:content;
}
