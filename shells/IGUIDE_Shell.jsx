import { useState, useRef, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// IGUIDE — Interactive Step-by-Step Guide  |  SHELL v1
// Claude: fetch this file, fill the placeholders below, output as JSX artifact
// ─────────────────────────────────────────────────────────────────────────────

const GUIDE_TITLE    = "{{TITLE}}";       // ← Claude replaces (e.g. "Setting Up AutoCAD LISP Loader")
const GUIDE_SUBTITLE = "{{SUBTITLE}}";    // ← Claude replaces (e.g. "Get ACADDOC.lsp loading automatically")
const GUIDE_DESC     = "{{DESC}}";        // ← Claude replaces (1 sentence: what this guide accomplishes + time estimate)
const STORAGE_KEY    = "iguide_{{key}}_v1"; // ← Claude replaces key (e.g. "lisp_loader")
const SCHEMA_VERSION = "1";

const C = {
  bg:"#0e0e0e", surface:"#161616", surfaceHi:"#1c1c1c",
  border:"#252525", text:"#e0e0e0", text2:"#b0b0b0", text3:"#666",
  green:"#5dba6e", greenDim:"#1a2e1a", greenBorder:"#2a5a2a",
  amber:"#f5b14a", amberDim:"#2e1e0a", amberBorder:"#5a3a0a",
  blue:"#5b9def", purple:"#8b7cf0",
};

// ── STEPS ─────────────────────────────────────────────────────────────────────
// Claude: inject step objects here
// Each step: { id, title, summary, instructions:[string], verify:string, note:string|null, codeBlock?:string }
// Instructions support **bold** and `code` markdown
// Placeholders in instructions/codeBlock: [PLACEHOLDER_NAME] (CAPS, underscores OK)
//   → automatically detected and turned into fill-in fields at runtime
// codeBlock optional — renders as a dark copyable block below the instructions
const STEPS = [
  // {
  //   id:1,
  //   title:"Step title",
  //   summary:"One-line summary of what this step accomplishes",
  //   instructions:[
  //     "Do the first thing",
  //     "Then do **this** (bold) or run `this command` (code)",
  //   ],
  //   verify:"You'll know it worked when you see X",
  //   note:null,              // or "A caution/tip shown in amber at top of step body"
  //   codeBlock:null,         // or a string to copy/paste
  // },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseInstructions(text) {
  const parts = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    const boldIdx  = remaining.indexOf("**");
    const codeIdx  = remaining.indexOf("`");
    const firstIdx = Math.min(
      boldIdx  >= 0 ? boldIdx  : Infinity,
      codeIdx  >= 0 ? codeIdx  : Infinity
    );
    if (firstIdx === Infinity) { parts.push(<span key={key++}>{remaining}</span>); break; }
    if (firstIdx > 0) { parts.push(<span key={key++}>{remaining.slice(0, firstIdx)}</span>); }
    if (boldIdx >= 0 && boldIdx === firstIdx) {
      const end = remaining.indexOf("**", boldIdx + 2);
      if (end < 0) { parts.push(<span key={key++}>{remaining}</span>); break; }
      parts.push(<strong key={key++} style={{color:C.text,fontWeight:600}}>{remaining.slice(boldIdx+2,end)}</strong>);
      remaining = remaining.slice(end + 2);
    } else {
      const end = remaining.indexOf("`", codeIdx + 1);
      if (end < 0) { parts.push(<span key={key++}>{remaining}</span>); break; }
      parts.push(<code key={key++} style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:"0.85em",
        background:"#1e1e2a",border:"1px solid #2a2a3a",borderRadius:3,
        padding:"1px 5px",color:"#8b9def"}}>{remaining.slice(codeIdx+1,end)}</code>);
      remaining = remaining.slice(end + 1);
    }
  }
  return parts;
}

async function copyText(text) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch(e) {}
  }
  try {
    const ta=document.createElement("textarea");ta.value=text;
    ta.style.cssText="position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;";
    document.body.appendChild(ta);ta.focus();ta.select();
    const ok=document.execCommand("copy");document.body.removeChild(ta);
    if(ok) return true;
  } catch(e) {}
  return false;
}

// ── Claude stuck helper ───────────────────────────────────────────────────────
async function askClaude(step, problem, history=[]) {
  const messages = [
    ...history,
    {role:"user", content:`I'm stuck. Here's my problem: ${problem}`}
  ];
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      model:"claude-sonnet-4-6", max_tokens:800,
      system:`You are helping Ben complete a step-by-step guide called "${GUIDE_TITLE}". He is stuck on Step ${step.id}: "${step.title}".

Step instructions:
${step.instructions.map((s,i)=>`${i+1}. ${s}`).join("\n")}

Verify condition: ${step.verify}

Give clear, specific troubleshooting guidance. Be concrete — exactly what to click, type, or look for. Keep it to 3-6 sentences. If his problem suggests a misunderstanding, gently correct it and redirect.`,
      messages
    })
  });
  const data = await resp.json();
  return data.content?.find(b=>b.type==="text")?.text || "No response received.";
}

// ── SavePulse ─────────────────────────────────────────────────────────────────
function SavePulse({trigger}) {
  const [vis,setVis] = useState(false);
  useEffect(()=>{
    setVis(true);
    const t=setTimeout(()=>setVis(false),1200);
    return()=>clearTimeout(t);
  },[trigger]);
  if(!vis) return null;
  return(
    <div style={{position:"fixed",bottom:14,left:"50%",transform:"translateX(-50%)",
      background:C.greenDim,border:"1px solid "+C.greenBorder,borderRadius:4,
      padding:"5px 14px",fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
      color:C.green,zIndex:9000,pointerEvents:"none",letterSpacing:".04em"}}>
      ✓ progress saved
    </div>
  );
}

// ── CodeBlock ─────────────────────────────────────────────────────────────────
function CodeBlock({content, resolvedContent}) {
  const [copied,setCopied] = useState(false);
  const displayContent = resolvedContent||content;
  function copy() {
    copyText(displayContent).then(ok=>{
      setCopied(true); setTimeout(()=>setCopied(false),1600);
      if(!ok) {
        const ta=document.createElement("textarea");ta.value=content;
        ta.style.cssText="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:85vw;height:60vh;z-index:9999;background:#1e1e1e;color:#c9d1d9;border:1px solid #5b9def;border-radius:6px;padding:12px;font-size:11px;font-family:monospace;";
        const ov=document.createElement("div");
        ov.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9998;";
        ov.onclick=()=>{[ov,ta].forEach(el=>{try{document.body.removeChild(el);}catch(e){}});};
        document.body.appendChild(ov);document.body.appendChild(ta);ta.focus();ta.select();
      }
    });
  }
  return(
    <div style={{marginTop:12,position:"relative"}}>
      <div style={{background:"#0d0d0d",border:"1px solid #252525",borderRadius:5,
        overflow:"hidden"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"6px 10px",background:"#161616",borderBottom:"1px solid #252525"}}>
          <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
            color:C.text3,letterSpacing:".06em"}}>COPY THIS</span>
          <button onClick={copy} style={{background:copied?C.greenDim:"transparent",
            border:"1px solid "+(copied?C.greenBorder:"#333"),borderRadius:3,
            padding:"2px 10px",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
            color:copied?C.green:"#666",cursor:"pointer",transition:"all .15s"}}>
            {copied?"✓ copied":"⎘ copy"}
          </button>
        </div>
        <pre style={{margin:0,padding:"12px",fontFamily:"'IBM Plex Mono',monospace",
          fontSize:11,color:"#c9d1d9",lineHeight:1.6,overflowX:"auto",
          whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:280,overflowY:"auto"}}>
          {displayContent}
        </pre>
      </div>
    </div>
  );
}

// ── StuckPanel ────────────────────────────────────────────────────────────────
function StuckPanel({step, onClose}) {
  const [problem,setProblem] = useState("");
  const [loading,setLoading] = useState(false);
  const [history,setHistory] = useState([]);   // [{role,content}]
  const [responses,setResponses] = useState([]);

  async function submit() {
    if(!problem.trim()) return;
    const userMsg = problem.trim();
    setProblem(""); setLoading(true);
    const newHistory = [...history, {role:"user",content:`I'm stuck. Here's my problem: ${userMsg}`}];
    try{
      const answer = await askClaude(step, userMsg, history);
      setHistory([...newHistory, {role:"assistant",content:answer}]);
      setResponses(p=>[...p,{q:userMsg,a:answer}]);
    }catch(e){
      setResponses(p=>[...p,{q:userMsg,a:"Error: "+e.message}]);
    }
    setLoading(false);
  }

  return(
    <div style={{marginTop:12,padding:"12px 14px",background:C.amberDim,
      border:"1px solid "+C.amberBorder,borderRadius:6,animation:"slideIn .2s ease"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
        marginBottom:10}}>
        <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
          color:C.amber,letterSpacing:".08em"}}>⚑ STUCK — Ask Claude</span>
        <button onClick={onClose} style={{background:"transparent",border:"none",
          color:"#666",cursor:"pointer",fontSize:14,padding:"0 4px",lineHeight:1}}>×</button>
      </div>

      {responses.map((ex,i)=>(
        <div key={i} style={{marginBottom:10}}>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
            color:C.amber,marginBottom:4}}>You: {ex.q}</div>
          <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,
            color:C.text2,lineHeight:1.65,padding:"8px 10px",
            background:"#1c1000",borderRadius:4,border:"1px solid "+C.amberBorder}}>
            {ex.a}
          </div>
        </div>
      ))}

      <div style={{display:"flex",gap:8,marginTop:responses.length?8:0}}>
        <input value={problem} onChange={e=>setProblem(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&!loading&&problem.trim()&&submit()}
          placeholder={responses.length?"Ask a follow-up…":"Describe what's going wrong…"}
          autoFocus
          style={{flex:1,background:"#1a0e00",border:"1px solid "+C.amberBorder,
            borderRadius:4,color:C.text,padding:"7px 10px",fontSize:13,
            fontFamily:"'DM Sans',sans-serif",outline:"none"}}/>
        <button onClick={submit} disabled={!problem.trim()||loading}
          style={{background:(!problem.trim()||loading)?C.amberDim:"#3a2000",
            border:"1px solid "+C.amberBorder,borderRadius:4,padding:"7px 16px",
            fontFamily:"'IBM Plex Mono',monospace",fontSize:11,
            color:(!problem.trim()||loading)?"#5a3a0a":C.amber,
            cursor:(!problem.trim()||loading)?"default":"pointer",
            whiteSpace:"nowrap",transition:"all .15s",flexShrink:0}}>
          {loading?"…":"Ask →"}
        </button>
      </div>
    </div>
  );
}

// ── StepCard ──────────────────────────────────────────────────────────────────
function StepCard({step, state, onComplete}) {
  const [showStuck, setShowStuck] = useState(false);
  const [phVals, setPhVals] = useState({});
  const ref = useRef(null);

  // Placeholder extraction + live resolution
  const _allText = [...step.instructions, step.codeBlock||'', step.verify||''].join('\n');
  const _phMatches = [..._allText.matchAll(/\[([A-Z][A-Z0-9_\s]*)\]/g)];
  const allPhs = [...new Set(_phMatches.map(m=>m[0]))];
  function resolve(text) {
    if(!text) return text;
    return allPhs.reduce((t,ph)=>{
      const v=phVals[ph];
      return v?.trim()?t.replaceAll(ph,v.trim()):t;
    },text);
  }

  useEffect(()=>{
    if(state==="current" && ref.current) {
      setTimeout(()=>{
        if(ref.current) {
          window.scrollTo({
            top:ref.current.getBoundingClientRect().top+window.scrollY-90,
            behavior:"smooth"
          });
        }
      },300);
    }
  },[state]);

  const isCurrent  = state==="current";
  const isDone     = state==="done";
  const isUpcoming = state==="upcoming";

  const borderColor = isDone ? C.greenBorder : isCurrent ? C.blue+"88" : C.border;
  const bgColor     = isCurrent ? C.surfaceHi : C.surface;
  const opacity     = isUpcoming ? 0.45 : 1;

  return(
    <div ref={ref} style={{border:"1px solid "+borderColor,borderRadius:8,
      background:bgColor,opacity,transition:"all .25s",
      ...(isCurrent?{boxShadow:"0 0 0 1px "+C.blue+"22"}:{})}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",
        borderBottom:isCurrent?"1px solid #222":"none"}}>
        <div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,
          display:"flex",alignItems:"center",justifyContent:"center",
          background:isDone?C.greenDim:isCurrent?"#0e1a2e":"#1a1a1a",
          border:"2px solid "+(isDone?C.green:isCurrent?C.blue:C.border),
          transition:"all .25s"}}>
          {isDone
            ? <span style={{color:C.green,fontSize:14}}>✓</span>
            : <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,
                color:isCurrent?C.blue:C.text3,fontWeight:600}}>{step.id}</span>
          }
        </div>
        <div style={{flex:1}}>
          <div style={{fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:15,
            color:isDone?C.text3:C.text,lineHeight:1.3,
            textDecoration:isDone?"line-through":"none"}}>
            {step.title}
          </div>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
            color:C.text3,marginTop:2}}>{step.summary}</div>
        </div>
        {isDone&&(
          <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
            color:C.green,background:C.greenDim,border:"1px solid "+C.greenBorder,
            borderRadius:3,padding:"2px 8px",letterSpacing:".06em",flexShrink:0}}>
            DONE
          </span>
        )}
      </div>

      {/* Body — only for current step */}
      {isCurrent&&(
        <div style={{padding:"14px 16px"}}>
          {/* Placeholder fill-in fields */}
          {allPhs.length>0&&(
            <div style={{padding:"10px 12px",background:"#1a1a0a",
              border:"1px solid #3a3510",borderRadius:5,marginBottom:12}}>
              <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
                color:"#c8b55e",letterSpacing:".08em",marginBottom:8}}>
                FILL IN YOUR DETAILS — CODE BLOCKS UPDATE AUTOMATICALLY
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {allPhs.map(ph=>(
                  <div key={ph} style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
                      color:"#c8b55e",background:"#252000",border:"1px solid #3a3510",
                      borderRadius:3,padding:"2px 8px",flexShrink:0,whiteSpace:"nowrap"}}>
                      {ph}
                    </span>
                    <input value={phVals[ph]||''}
                      onChange={e=>setPhVals(p=>({...p,[ph]:e.target.value}))}
                      placeholder={ph.slice(1,-1).toLowerCase().replace(/_/g,' ')}
                      style={{flex:1,background:"#141400",border:"1px solid #3a3510",
                        borderRadius:4,color:C.text,padding:"5px 9px",
                        fontFamily:"'IBM Plex Mono',monospace",fontSize:12,
                        outline:"none",transition:"border-color .15s"}}/>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Note */}
          {step.note&&(
            <div style={{display:"flex",gap:8,padding:"7px 10px",
              background:"#1a1a10",border:"1px solid #3a3a20",
              borderRadius:4,marginBottom:12}}>
              <span style={{color:"#c8b55e",fontSize:13,flexShrink:0}}>ℹ</span>
              <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,
                color:"#c8b55e",lineHeight:1.55}}>{step.note}</span>
            </div>
          )}

          {/* Instructions */}
          <ol style={{margin:"0 0 12px",paddingLeft:22,display:"flex",
            flexDirection:"column",gap:8}}>
            {step.instructions.map((inst,i)=>(
              <li key={i} style={{fontFamily:"'DM Sans',sans-serif",fontSize:14,
                color:C.text2,lineHeight:1.65}}>
                {parseInstructions(resolve(inst))}
              </li>
            ))}
          </ol>

          {/* Code block if present */}
          {step.codeBlock&&<CodeBlock content={step.codeBlock} resolvedContent={resolve(step.codeBlock)}/>}

          {/* Verify */}
          <div style={{display:"flex",gap:8,padding:"8px 10px",
            background:C.greenDim,border:"1px solid "+C.greenBorder,
            borderRadius:4,margin:"12px 0"}}>
            <span style={{color:C.green,fontSize:13,flexShrink:0}}>✓</span>
            <div>
              <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
                color:C.green,letterSpacing:".08em",marginBottom:3}}>
                YOU'LL KNOW IT WORKED WHEN:
              </div>
              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,
                color:"#7ab87a",lineHeight:1.5}}>
                {step.verify}
              </div>
            </div>
          </div>

          {/* Stuck panel */}
          {showStuck&&<StuckPanel step={step} onClose={()=>setShowStuck(false)}/>}

          {/* Action buttons */}
          <div style={{display:"flex",gap:10,marginTop:14,alignItems:"center"}}>
            <button onClick={onComplete}
              style={{background:C.greenDim,border:"1px solid "+C.green,
                borderRadius:5,padding:"10px 28px",
                fontFamily:"'IBM Plex Mono',monospace",fontSize:12,
                letterSpacing:".06em",color:C.green,cursor:"pointer",
                transition:"all .15s",fontWeight:"bold"}}>
              ✓ NEXT STEP
            </button>
            <button onClick={()=>setShowStuck(p=>!p)}
              style={{background:showStuck?C.amberDim:"transparent",
                border:"1px solid "+(showStuck?C.amber:"#3a3a2a"),
                borderRadius:5,padding:"10px 20px",
                fontFamily:"'IBM Plex Mono',monospace",fontSize:12,
                letterSpacing:".06em",
                color:showStuck?C.amber:"#888",
                cursor:"pointer",transition:"all .15s"}}>
              {showStuck?"▲ CLOSE":"⚑ STUCK"}
            </button>
            <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
              color:C.text3,marginLeft:4}}>Enter = next step</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function IGuideShell() {
  const [currentStep, setCurrentStep] = useState(1);
  const [completed,   setCompleted]   = useState([]);
  const [loaded,      setLoaded]      = useState(false);
  const [savePulse,   setSavePulse]   = useState(false);
  const [finished,    setFinished]    = useState(false);
  const [copiedGuide, setCopiedGuide] = useState(false);
  const saveTimer = useRef(null);

  // Load
  useEffect(()=>{
    (async()=>{
      try{
        const r=await window.storage.get(STORAGE_KEY);
        if(r?.value){
          const s=JSON.parse(r.value);
          if(s.version===SCHEMA_VERSION){
            if(typeof s.currentStep==="number") setCurrentStep(s.currentStep);
            if(Array.isArray(s.completed))      setCompleted(s.completed);
            if(s.finished)                       setFinished(s.finished);
          }
        }
      }catch(e){}
      setLoaded(true);
    })();
  },[]);

  // Save (debounced)
  useEffect(()=>{
    if(!loaded)return;
    clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(async()=>{
      try{
        await window.storage.set(STORAGE_KEY,JSON.stringify({
          version:SCHEMA_VERSION,currentStep,completed,finished
        }));
        setSavePulse(p=>!p);
      }catch(e){}
    },600);
  },[currentStep,completed,finished,loaded]);

  // Enter key = complete current step
  useEffect(()=>{
    if(!loaded||finished)return;
    const h=e=>{
      if(e.key==="Enter"&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){
        const tag=document.activeElement?.tagName?.toLowerCase();
        if(tag==="textarea"||tag==="input"||tag==="button") return;
        e.preventDefault();
        completeStep();
      }
    };
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  },[loaded,finished,currentStep,completed]);

  function completeStep(){
    if(finished)return;
    const newCompleted=[...completed,currentStep];
    setCompleted(newCompleted);
    if(currentStep>=STEPS.length){
      setFinished(true);
    } else {
      setCurrentStep(currentStep+1);
    }
  }

  async function reset(){
    if(!confirm("Reset all progress and start over?"))return;
    setCurrentStep(1);setCompleted([]);setFinished(false);
    try{await window.storage.delete(STORAGE_KEY);}catch(e){}
  }

  // ── Export guide as HTML ─────────────────────────────────────────────────
  function copyGuide(){
    function strip(t){return t.replace(/\*\*(.*?)\*\*/g,'$1').replace(/`(.*?)`/g,'$1');}
    function esc(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

    const stepsHTML = STEPS.map((step,si)=>{
      const instrItems = step.instructions.map(i=>`<li>${esc(strip(i))}</li>`).join('\n          ');
      const verifyHTML = `<div class="vf"><span class="vk">✓ done when:</span> ${esc(step.verify)}</div>`;
      const noteHTML = step.note ? `<div class="nt">ℹ ${esc(step.note)}</div>` : '';
      const codeHTML = step.codeBlock ? `
        <div class="bl">
          <div class="bh">
            <span class="bl-lbl">COPY THIS</span>
            <button class="cp-btn" onclick="cp(this)">⎘ copy</button>
          </div>
          <pre>${esc(step.codeBlock)}</pre>
        </div>` : '';

      return `
    <details class="step"${si===0?' open':''}>
      <summary><span class="sn">${String(step.id).padStart(2,'0')}</span>${esc(step.title)}</summary>
      <div class="bd">
        ${noteHTML}
        <details class="inst">
          <summary class="it">▸ instructions</summary>
          <ol class="instrs">
          ${instrItems}
          </ol>
          ${verifyHTML}
        </details>
        ${codeHTML}
      </div>
    </details>`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>${esc(GUIDE_TITLE)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0e0e0e;color:#e0e0e0;font-family:'IBM Plex Mono',monospace;font-size:13px;padding:20px 16px;max-width:740px;margin:0 auto;line-height:1.5}
h1{font-size:16px;color:#5b9def;margin-bottom:3px}
.meta{font-size:10px;color:#555;margin-bottom:16px}
.top{margin-bottom:16px}
button.ca{background:#1a2e1a;border:1px solid #2a5a2a;border-radius:4px;padding:6px 16px;color:#5dba6e;cursor:pointer;font-family:inherit;font-size:11px}
button.ca:hover{filter:brightness(1.15)}
details.step{border:1px solid #252525;border-radius:6px;margin-bottom:8px;overflow:hidden;transition:border-color .2s}
details.step[open]{border-color:#5b9def44}
details.step>summary{background:#161616;padding:11px 14px;cursor:pointer;font-size:13px;color:#b0b0b0;user-select:none;list-style:none;display:flex;align-items:center;gap:10px;transition:background .15s}
details.step>summary:hover{background:#1c1c1c}
details.step>summary::-webkit-details-marker{display:none}
details.step[open]>summary{color:#e0e0e0;background:#1a1a1a}
.sn{font-size:10px;color:#5b9def;background:#0e1a2e;border:1px solid #1a3a5a;border-radius:3px;padding:1px 6px;flex-shrink:0}
.bd{padding:14px}
.nt{font-size:12px;color:#c8b55e;background:#1a1a10;border:1px solid #3a3510;border-radius:4px;padding:7px 10px;margin-bottom:10px}
details.inst{margin-bottom:10px}
details.inst>.it{list-style:none;cursor:pointer;color:#666;font-size:11px;padding:4px 0;user-select:none}
details.inst>.it::-webkit-details-marker{display:none}
details.inst[open]>.it{color:#888}
.instrs{padding-left:20px;margin-top:8px;display:flex;flex-direction:column;gap:6px}
.instrs li{font-size:13px;color:#b0b0b0;line-height:1.65;font-family:'DM Sans',Arial,sans-serif}
.vf{margin-top:8px;font-size:12px;color:#5dba6e;background:#1a2e1a;border:1px solid #2a5a2a;border-radius:4px;padding:6px 10px}
.vk{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.06em;margin-right:6px}
.bl{background:#0d0d0d;border:1px solid #252525;border-radius:5px;overflow:hidden;margin-top:4px}
.bh{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#161616;border-bottom:1px solid #252525}
.bl-lbl{font-size:9px;color:#555;letter-spacing:.06em}
.cp-btn{background:transparent;border:1px solid #333;border-radius:3px;padding:3px 12px;color:#666;cursor:pointer;font-family:inherit;font-size:10px;transition:all .15s}
.cp-btn:hover{background:#1a2e1a;border-color:#2a5a2a;color:#5dba6e}
pre{font-family:'IBM Plex Mono',monospace;font-size:13px;color:#c9d1d9;line-height:1.7;white-space:pre-wrap;word-break:break-word;padding:14px;max-height:none;overflow-x:auto}
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=IBM+Plex+Mono&display=swap');
</style>
</head>
<body>
<h1>${esc(GUIDE_TITLE)}</h1>
<div class="meta">Generated: ${new Date().toLocaleString()} · ${STEPS.length} steps · ${esc(GUIDE_SUBTITLE)}</div>
<div class="top"><button class="ca" onclick="copyAll()">⎘ Copy all code blocks</button></div>
${stepsHTML}
<script>
document.querySelectorAll('details.step').forEach(function(d){
  d.addEventListener('toggle',function(){
    if(d.open){
      document.querySelectorAll('details.step').forEach(function(o){if(o!==d)o.open=false;});
    }
  });
});
function cp(btn){
  var pre=btn.closest('.bl').querySelector('pre');
  var txt=pre.textContent;
  (navigator.clipboard&&navigator.clipboard.writeText(txt)||Promise.reject()).catch(function(){
    var ta=document.createElement('textarea');ta.value=txt;ta.style.cssText='position:fixed;opacity:0';
    document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
  });
  var orig=btn.textContent;btn.textContent='✓';
  setTimeout(function(){btn.textContent=orig;},1500);
}
function copyAll(){
  var blocks=[].slice.call(document.querySelectorAll('pre'));
  var txt=blocks.map(function(p){return p.textContent}).join('\n\n────────────\n\n');
  (navigator.clipboard&&navigator.clipboard.writeText(txt)||Promise.reject()).catch(function(){
    var ta=document.createElement('textarea');ta.value=txt;ta.style.cssText='position:fixed;opacity:0';
    document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
  });
}
<\/script>
</body>
</html>`;

    copyText(html).then(ok=>{
      if(ok){setCopiedGuide(true);setTimeout(()=>setCopiedGuide(false),2000);}
      else{
        const ta=document.createElement("textarea");ta.value=html;
        ta.style.cssText="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:85vw;height:65vh;z-index:9999;background:#1e1e1e;color:#c9d1d9;border:1px solid #5b9def;border-radius:6px;padding:12px;font-size:11px;font-family:monospace;";
        const ov=document.createElement("div");
        ov.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9998;";
        const lbl=document.createElement("div");
        lbl.style.cssText="position:fixed;top:calc(50% - 36vh);left:50%;transform:translateX(-50%);z-index:10000;font-family:'IBM Plex Mono',monospace;font-size:11px;color:#5b9def;white-space:nowrap;";
        lbl.textContent="Select all (Ctrl+A) → Copy → paste into a .html file · tap outside to close";
        const close=()=>{[ov,ta,lbl].forEach(el=>{try{document.body.removeChild(el);}catch(e){}});};
        ov.onclick=close;[ov,ta,lbl].forEach(el=>document.body.appendChild(el));
        ta.focus();ta.select();
      }
    });
  }

  const pct = STEPS.length ? Math.round(completed.length/STEPS.length*100) : 0;

  if(!loaded)return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",
      alignItems:"center",justifyContent:"center",
      fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:C.text3}}>
      Restoring progress…
    </div>
  );

  if(!STEPS.length)return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",
      justifyContent:"center",flexDirection:"column",gap:12,padding:20}}>
      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:13,color:"#f5b14a"}}>
        ⚠ IGUIDE Shell — no steps injected
      </div>
      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:C.text3,textAlign:"center",maxWidth:420,lineHeight:1.6}}>
        This is the shell template. Use <code style={{background:"#222",padding:"1px 6px",borderRadius:3,color:"#5b9def"}}>!IGUIDE</code> to generate steps for a specific task. Claude fetches this file and injects steps into the STEPS array.
      </div>
    </div>
  );

  return(
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'DM Sans',sans-serif",
      padding:"20px 16px",maxWidth:720,margin:"0 auto",WebkitFontSmoothing:"antialiased"}}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;}
        button{outline:none;}
        button:hover:not(:disabled){filter:brightness(1.12);}
        textarea{outline:none;}
        textarea:focus{border-color:#5a3a0a!important;}
        @keyframes slideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <SavePulse trigger={savePulse}/>

      {/* Header */}
      <div style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"flex-start",
          justifyContent:"space-between",marginBottom:12}}>
          <div>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
              color:C.blue,letterSpacing:".12em",marginBottom:4}}>IGUIDE</div>
            <h1 style={{fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:20,
              color:C.text,margin:0,letterSpacing:"-.01em"}}>
              {GUIDE_TITLE}
            </h1>
            <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,
              color:C.text3,margin:"4px 0 0",lineHeight:1.5}}>
              {GUIDE_DESC}
            </p>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0,marginTop:4}}>
            <button onClick={copyGuide}
              style={{background:copiedGuide?C.greenDim:"transparent",
                border:"1px solid "+(copiedGuide?C.greenBorder:"#2a2a2a"),borderRadius:4,
                fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
                color:copiedGuide?C.green:"#555",cursor:"pointer",padding:"4px 8px",
                transition:"all .2s"}}>
              {copiedGuide?"✓ copied":"⎘ export"}
            </button>
            <button onClick={reset} style={{background:"transparent",border:"none",
              fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
              color:"#333",cursor:"pointer",padding:"4px 6px"}}>↺ reset</button>
          </div>
        </div>

        {/* Progress */}
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{flex:1,height:4,background:"#1a1a1a",borderRadius:2}}>
            <div style={{height:"100%",width:pct+"%",borderRadius:2,
              background:pct===100?C.green:C.blue,transition:"width .4s ease"}}/>
          </div>
          <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
            color:pct===100?C.green:C.text3,minWidth:60,textAlign:"right",
            transition:"color .3s"}}>
            {completed.length}/{STEPS.length} done
          </span>
        </div>

        <p style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
          color:"#444",margin:"8px 0 0"}}>
          Focus on the highlighted step · Enter = next · ⚑ STUCK for help
        </p>
      </div>

      {/* Finished state */}
      {finished&&(
        <div style={{background:"#0d1f0d",border:"1px solid "+C.green,borderRadius:8,
          padding:"20px",marginBottom:20,textAlign:"center",animation:"slideIn .3s ease"}}>
          <div style={{fontSize:32,marginBottom:8}}>✓</div>
          <div style={{fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:18,
            color:C.green,marginBottom:6}}>{GUIDE_TITLE} complete</div>
          <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:14,color:"#7ab87a",
            lineHeight:1.6,maxWidth:480,margin:"0 auto"}}>
            {GUIDE_SUBTITLE}
          </div>
          <div style={{marginTop:16}}>
            <button onClick={copyGuide}
              style={{background:copiedGuide?C.greenDim:"#1a2a1a",
                border:"1px solid "+(copiedGuide?C.green:C.greenBorder),
                borderRadius:5,padding:"8px 20px",
                fontFamily:"'IBM Plex Mono',monospace",fontSize:11,
                color:C.green,cursor:"pointer",transition:"all .2s"}}>
              {copiedGuide?"✓ copied":"⎘ export guide as HTML"}
            </button>
          </div>
        </div>
      )}

      {/* Steps */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {STEPS.map(step=>{
          const isDone    = completed.includes(step.id);
          const isCurrent = !finished&&step.id===currentStep;
          const state     = isDone?"done":isCurrent?"current":"upcoming";
          return(
            <StepCard key={step.id} step={step} state={state}
              onComplete={completeStep}/>
          );
        })}
      </div>

      {!finished&&(
        <div style={{marginTop:20,textAlign:"center",fontFamily:"'IBM Plex Mono',monospace",
          fontSize:10,color:"#333"}}>
          Progress auto-saves · refresh anytime to resume · ⎘ export exports as standalone HTML
        </div>
      )}
    </div>
  );
}
