// Development-only test control, excluded from the audited content and production build.
import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import axe from 'axe-core';
export default function AccessibilityAudit(){
 const [result,setResult]=useState(null),[busy,setBusy]=useState(false);
 const [visible,setVisible]=useState(false);
 useEffect(()=>{const toggle=e=>{if(e.ctrlKey&&e.altKey&&e.code==='KeyA'){e.preventDefault();setVisible(v=>!v)}};window.addEventListener('keydown',toggle);return()=>window.removeEventListener('keydown',toggle)},[]);
 async function run(){
  setBusy(true);setResult(null);
  // Hide the development toolbar before scanning so it cannot obscure targets.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const r=await axe.run({exclude:[['#accessibility-audit']]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});
  setResult({checkedAt:new Date().toISOString(),theme:document.documentElement.dataset.mantineColorScheme,dialogs:document.querySelectorAll('[role=dialog]').length,violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),passes:r.passes.length});setBusy(false);
 }
 return visible?createPortal(<aside id="accessibility-audit" aria-label="Geliştirici erişilebilirlik denetimi" style={{visibility:busy?'hidden':undefined,position:'fixed',top:8,left:8,zIndex:99999,maxWidth:'calc(100vw - 16px)',width:result?620:'auto',maxHeight:'50vh',overflow:'auto',padding:8,background:'#fff',color:'#111',border:'2px solid #111',fontSize:'1rem'}}><button style={{fontSize:'1rem',minHeight:44,color:'#111',background:'#fff'}} disabled={busy} onClick={result?()=>setResult(null):run}>{busy?'Denetleniyor':result?'Denetimi kapat':'Erişilebilirliği denetle'}</button>{result&&<pre style={{whiteSpace:'pre-wrap',fontSize:'1rem'}}>{JSON.stringify(result,null,2)}</pre>}</aside>,document.body):null;
}
