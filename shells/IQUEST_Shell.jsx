import { useState, useRef, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// IQUEST — Interactive Questionnaire  |  SHELL v1
// Claude: fetch this file, fill the placeholders below, output as JSX artifact
// ─────────────────────────────────────────────────────────────────────────────

const GUIDE_TITLE    = "{{TITLE}}";         // ← Claude replaces (e.g. "FD Right-Click Tickets")
const STORAGE_KEY    = "iquest_{{key}}_v1"; // ← Claude replaces key (e.g. "fd_tickets")
const SCHEMA_VERSION = "1";

const C = {
  bg:"#111", surface:"#181818", surfaceHi:"#1e1e1e",
  border:"#282828", text:"#e0e0e0", text2:"#b0b0b0", text3:"#777",
  green:"#5dba6e", recBg:"#151f15", recBorder:"#253525",
};

// ── QUESTIONS ─────────────────────────────────────────────────────────────────
// Claude: inject question objects here following schemas/iquest_schema.json
// Types: "choice" (single-select), "multi" (multi-select), "yn" (yes/no)
// Colors: #5b9def #34d399 #8b7cf0 #f5b14a #f0894a #f0696b #5ec8aa #c8b55e
// rec.val for multi is an array; for choice/yn is a string
// opts only required for choice and multi
const QUESTIONS = [
  // {
  //   id:1, tag:"TAG-01", color:"#5b9def",
  //   q:"Question text?",
  //   ctx:"Why this matters / what it affects.",
  //   rec:{val:"opt_a", why:"optional rationale"},
  //   type:"choice",
  //   opts:[
  //     {v:"opt_a", l:"Option A label", sub:"optional subtitle",
  //      pros:["Pro 1","Pro 2"], cons:["Con 1"]},
  //     {v:"opt_b", l:"Option B label"},
  //   ]
  // },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function isAnswered(q, answers) {
  const a = answers[q.id];
  if (a === null || a === undefined) return false;
  if (typeof a === "object" && !Array.isArray(a)) {
    if ("custom" in a) return a.custom.trim().length > 0;
    if ("sel"    in a) return true;
  }
  if (q.type === "multi") return Array.isArray(a) && a.length > 0;
  return !!a;
}

function getLabel(q, answers) {
  const a = answers[q.id];
  if (!a) return null;
  if (typeof a === "object" && !Array.isArray(a)) {
    if ("custom" in a) return "Custom: " + a.custom.slice(0,50) + (a.custom.length>50?"…":"");
    if ("sel"    in a) {
      const lbl = q.type==="yn"?(a.sel==="yes"?"Yes":"No"):(q.opts?.find(o=>o.v===a.sel)?.l||a.sel);
      return lbl + (a.ctx?.trim() ? " +notes" : "");
    }
  }
  if (q.type==="multi") {
    if (!Array.isArray(a)||!a.length) return null;
    return a.map(v=>q.opts?.find(o=>o.v===v)?.l||v).join(", ");
  }
  if (q.type==="yn") return a==="yes"?"Yes":"No";
  return q.opts?.find(o=>o.v===a)?.l||a;
}

function formatForClaude(q, answers) {
  const a = answers[q.id];
  if (!a) return "[Not answered]";
  if (typeof a === "object" && !Array.isArray(a)) {
    if ("custom" in a) return `Custom: "${a.custom}"`;
    if ("sel"    in a) {
      const lbl = q.type==="yn"?(a.sel==="yes"?"Yes":"No"):(q.opts?.find(o=>o.v===a.sel)?.l||a.sel);
      return a.ctx?.trim() ? `${lbl} — Notes: "${a.ctx}"` : lbl;
    }
  }
  if (q.type==="multi") {
    if (!Array.isArray(a)||!a.length) return "[Not answered]";
    return a.map(v=>q.opts?.find(o=>o.v===v)?.l||v).join(", ");
  }
  if (q.type==="yn") return a==="yes"?"Yes":"No";
  return q.opts?.find(o=>o.v===a)?.l||a;
}

function buildSummaryText(allQs, allAnswers, tickets=[]) {
  const qLines = allQs.map(q =>
    `[${q.tag}]\n  Q: ${q.q}\n  A: ${getLabel(q,allAnswers)||"— not answered —"}`
  );
  const ticketLines = tickets.length ? [
    "\n── TICKETS ──────────────────────────────────",
    ...tickets.map((t,i) =>
      `#${i+1} [${t.severity}] ${t.context}\n  "${t.note}"\n  ${new Date(t.ts).toLocaleString()}`)
  ] : [];
  return ["IQUEST — "+GUIDE_TITLE,"─".repeat(40),...qLines,...ticketLines].join("\n\n");
}

function defaultAnswerForQ(q) {
  if (!q.rec?.val) return null;
  if (q.type==="multi") return Array.isArray(q.rec.val)?q.rec.val:[q.rec.val];
  return {sel: q.rec.val, ctx:""};
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

// ── Claude API ────────────────────────────────────────────────────────────────
async function callClaude(allQs, allAnswers, inquiryLog={}, prevSummary="") {
  const lines = allQs.map(q=>`${q.tag}: ${formatForClaude(q,allAnswers)}`).join("\n");
  const threads = Object.entries(inquiryLog).map(([qId,exs])=>{
    const q=allQs.find(x=>String(x.id)===String(qId));
    if(!q||!exs.length) return null;
    return `[${q.tag}]\n${exs.map(e=>`  Ben: "${e.q}"\n  Claude: "${e.a}"`).join("\n")}`;
  }).filter(Boolean).join("\n\n");
  const body = `IQUEST answers:\n\n${lines}${threads?"\n\nInquiry threads:\n"+threads:""}${prevSummary?"\n\nPrior summary: \""+prevSummary+"\"":""}\n\nAny follow-ups needed?`;

  const resp = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:2500,
      system:`Review IQUEST answers for "${GUIDE_TITLE}" and identify unresolved decisions blocking implementation. Respond ONLY with valid JSON, no markdown:
{"summary":"2 sentences","questions":[{"id":201,"tag":"TAG","color":"#hex","q":"?","ctx":"why","rec":{"val":"v","why":"reason"},"type":"choice|yn|multi","opts":[{"v":"val","l":"Label","sub":"optional","pros":[],"cons":[]}]}]}
If nothing blocking: {"summary":"...","questions":[]}
Colors: #5b9def #34d399 #8b7cf0 #f5b14a #f0894a #f0696b #5ec8aa #c8b55e`,
      messages:[{role:"user",content:body}]})
  });
  const data = await resp.json();
  const raw = data.content?.find(b=>b.type==="text")?.text||"{}";
  const attempts=[()=>JSON.parse(raw),()=>JSON.parse(raw.replace(/```json\n?|```/g,"").trim()),
    ()=>{const s=raw.indexOf("{"),e=raw.lastIndexOf("}");if(s<0||e<=s)throw 0;return JSON.parse(raw.slice(s,e+1));}];
  for(const fn of attempts){try{return fn();}catch(e){}}
  throw new Error("Parse failed: "+raw.slice(0,120));
}

// ── SavePulse ─────────────────────────────────────────────────────────────────
function SavePulse({trigger}){
  const [vis,setVis]=useState(false);
  useEffect(()=>{setVis(true);const t=setTimeout(()=>setVis(false),1200);return()=>clearTimeout(t);},[trigger]);
  if(!vis) return null;
  return(
    <div style={{position:"fixed",bottom:14,left:"50%",transform:"translateX(-50%)",
      background:"#1a2e1a",border:"1px solid #3a5a3a",borderRadius:4,padding:"5px 14px",
      fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#5dba6e",
      zIndex:9000,pointerEvents:"none",letterSpacing:".04em"}}>✓ saved</div>
  );
}

// ── Ticket system ─────────────────────────────────────────────────────────────
function getElementContext(el){
  if(!el) return "Unknown element";
  let node=el;
  for(let i=0;i<8;i++){
    if(!node) break;
    if(node.dataset?.iquestCtx) return node.dataset.iquestCtx;
    const tag=node.tagName?.toLowerCase();
    if(tag==="button") return `Button: "${(node.textContent||"").trim().slice(0,40)}"`;
    if(tag==="input")  return `Input: ${node.placeholder||node.type||"field"}`;
    if(tag==="textarea") return `Textarea: ${node.placeholder||"text field"}`;
    node=node.parentElement;
  }
  const txt=(el.textContent||"").trim().slice(0,60);
  return txt?`Element: "${txt}"`:"Visual element";
}

function CtxMenu({menu,onCreateTicket,onClose}){
  useEffect(()=>{
    const close=()=>onClose();
    window.addEventListener("click",close);
    return()=>window.removeEventListener("click",close);
  },[onClose]);
  if(!menu) return null;
  return(
    <div style={{position:"fixed",left:menu.x,top:menu.y,zIndex:9999,
      background:"#1e1e1e",border:"1px solid #333",borderRadius:5,
      boxShadow:"0 4px 20px rgba(0,0,0,.6)",minWidth:180,padding:"4px 0"}}
      onClick={e=>e.stopPropagation()}>
      <div style={{padding:"4px 10px 2px",fontFamily:"'IBM Plex Mono',monospace",
        fontSize:9,color:"#555",letterSpacing:".08em"}}>
        {menu.context.slice(0,35)}{menu.context.length>35?"…":""}
      </div>
      <div style={{height:1,background:"#2a2a2a",margin:"4px 0"}}/>
      <button onClick={()=>{onCreateTicket(menu.context);onClose();}} style={{
        display:"block",width:"100%",textAlign:"left",background:"transparent",
        border:"none",padding:"7px 14px",fontFamily:"'DM Sans',sans-serif",
        fontSize:13,color:"#e0e0e0",cursor:"pointer"}}
        onMouseEnter={e=>e.currentTarget.style.background="#2a2a2a"}
        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        🎫 Create Ticket
      </button>
    </div>
  );
}

function TicketModal({context,onSave,onClose}){
  const [note,setNote]=useState("");
  const [severity,setSeverity]=useState("Enhancement");
  const sevs=["Bug","Annoyance","Enhancement"];
  const sevColors={"Bug":"#f0696b","Annoyance":"#f5b14a","Enhancement":"#5b9def"};
  function save(){if(!note.trim())return;onSave({context,note:note.trim(),severity,ts:Date.now()});onClose();}
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:9998,
      display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#1e1e1e",border:"1px solid #333",borderRadius:7,
        padding:"18px 20px",width:380,maxWidth:"92vw",boxShadow:"0 8px 40px rgba(0,0,0,.7)"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:15,
          color:"#e0e0e0",marginBottom:6}}>🎫 New Ticket</div>
        <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
          color:"#666",marginBottom:12,lineHeight:1.5}}>{context}</div>
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          {sevs.map(s=>{
            const sel=severity===s;const c=sevColors[s];
            return(<button key={s} onClick={()=>setSeverity(s)} style={{
              flex:1,padding:"5px 0",borderRadius:4,fontSize:12,
              fontFamily:"'IBM Plex Mono',monospace",cursor:"pointer",
              background:sel?c+"22":"#1a1a1a",border:"1px solid "+(sel?c:"#333"),
              color:sel?c:"#666",transition:"all .12s"}}>{s}</button>);
          })}
        </div>
        <textarea value={note} onChange={e=>setNote(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey))save();}}
          placeholder="What would you like to change? (Ctrl+Enter to save)"
          rows={3} autoFocus
          style={{display:"block",width:"100%",resize:"vertical",background:"#161616",
            border:"1px solid #333",borderRadius:4,color:"#e0e0e0",padding:"8px 10px",
            fontSize:13,fontFamily:"'DM Sans',sans-serif",lineHeight:1.55,
            outline:"none",boxSizing:"border-box",marginBottom:12}}/>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{background:"transparent",border:"1px solid #333",
            borderRadius:4,padding:"6px 14px",fontSize:12,
            fontFamily:"'IBM Plex Mono',monospace",color:"#666",cursor:"pointer"}}>Cancel</button>
          <button onClick={save} disabled={!note.trim()} style={{
            background:note.trim()?"#1a1a2e":"#161616",
            border:"1px solid "+(note.trim()?"#3a3a6e":"#2a2a2a"),
            borderRadius:4,padding:"6px 14px",fontSize:12,
            fontFamily:"'IBM Plex Mono',monospace",
            color:note.trim()?"#8b9def":"#444",
            cursor:note.trim()?"pointer":"default",transition:"all .15s"}}>Save Ticket</button>
        </div>
      </div>
    </div>
  );
}

function TicketsPanel({tickets,onDelete}){
  const [copied,setCopied]=useState(false);
  const sevColors={"Bug":"#f0696b","Annoyance":"#f5b14a","Enhancement":"#5b9def"};
  function copyAll(){
    const txt=tickets.map((t,i)=>`#${i+1} [${t.severity}] ${t.context}\n  "${t.note}"\n  ${new Date(t.ts).toLocaleString()}`).join("\n\n");
    copyText(txt).then(ok=>{setCopied(true);setTimeout(()=>setCopied(false),1600);if(!ok)alert(txt);});
  }
  if(!tickets.length) return(
    <div style={{padding:"10px 0",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:"#555"}}>
      No tickets yet. Right-click any element to create one.
    </div>
  );
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#666"}}>
          {tickets.length} ticket{tickets.length!==1?"s":""}
        </span>
        <button onClick={copyAll} style={{background:copied?"#1a2e1a":"transparent",
          border:"1px solid "+(copied?"#3a6a3a":"#2a2a2a"),borderRadius:4,padding:"3px 10px",
          fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
          color:copied?"#5dba6e":"#666",cursor:"pointer",transition:"all .15s"}}>
          {copied?"✓ copied":"⎘ copy all"}
        </button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {tickets.map((t,i)=>{
          const c=sevColors[t.severity]||"#888";
          return(
            <div key={t.ts} style={{background:"#181818",border:"1px solid #282828",
              borderLeft:"3px solid "+c,borderRadius:4,padding:"8px 10px"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:c,
                  background:c+"18",border:"1px solid "+c+"44",borderRadius:3,
                  padding:"1px 5px",flexShrink:0,marginTop:1}}>{t.severity.toUpperCase()}</span>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
                    color:"#555",marginBottom:3}}>{t.context}</div>
                  <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,
                    color:"#ccc",lineHeight:1.5}}>{t.note}</div>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
                    color:"#444",marginTop:4}}>{new Date(t.ts).toLocaleString()}</div>
                </div>
                <button onClick={()=>onDelete(i)} style={{background:"transparent",
                  border:"none",color:"#444",cursor:"pointer",fontSize:14,padding:"0 2px",
                  lineHeight:1,flexShrink:0}}
                  onMouseEnter={e=>e.currentTarget.style.color="#f0696b"}
                  onMouseLeave={e=>e.currentTarget.style.color="#444"}>×</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── InquiryPanel ──────────────────────────────────────────────────────────────
function InquiryPanel({q,onExchange}){
  const [inp,setInp]=useState("");
  const [loading,setLd]=useState(false);
  const [resp,setResp]=useState("");
  async function ask(){
    if(!inp.trim())return;setLd(true);setResp("");
    try{
      const r=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:600,
          system:`Helping Ben clarify an IQUEST decision for "${GUIDE_TITLE}". Question: "${q.q}". Context: ${q.ctx}. Answer in 2-3 sentences. Be direct.`,
          messages:[{role:"user",content:inp.trim()}]})
      });
      const d=await r.json();
      const answer=d.content?.find(b=>b.type==="text")?.text||"No response.";
      setResp(answer);if(onExchange)onExchange(inp.trim(),answer);
    }catch(e){setResp("Error: "+e.message);}
    setLd(false);
  }
  return(
    <div style={{marginTop:10,borderTop:"1px solid #282828",paddingTop:10}}>
      <div style={{display:"flex",gap:6,marginBottom:resp?8:0}}>
        <input value={inp} onChange={e=>setInp(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&!loading&&inp.trim()&&ask()}
          placeholder="Ask anything about this decision…"
          style={{flex:1,background:"#222",border:"1px solid #333",borderRadius:4,
            color:"#e0e0e0",padding:"7px 10px",fontSize:13,
            fontFamily:"'DM Sans',sans-serif",outline:"none"}}/>
        <button onClick={ask} disabled={!inp.trim()||loading} style={{
          background:loading?"#1e1e1e":"#1a2e1a",border:"1px solid #3a6a3a",
          color:"#5dba6e",borderRadius:4,padding:"7px 14px",
          cursor:loading?"default":"pointer",fontFamily:"'IBM Plex Mono',monospace",
          fontSize:11,opacity:(!inp.trim()||loading)?0.4:1,whiteSpace:"nowrap"}}>
          {loading?"…":"Ask →"}
        </button>
      </div>
      {resp&&<div style={{background:"#1c1c1c",border:"1px solid #2e2e2e",borderRadius:4,
        padding:"10px 12px",fontFamily:"'DM Sans',sans-serif",
        fontSize:13,color:"#b0b0b0",lineHeight:1.65}}>{resp}</div>}
    </div>
  );
}

// ── QRow ──────────────────────────────────────────────────────────────────────
function QRow({q, idx, open, onToggle, answers, onAnswer, onAccept, onInquiry, isFollowup=false}){
  const answered  = isAnswered(q,answers);
  const label     = getLabel(q,answers);
  const [showInquiry,setShowInquiry] = useState(false);
  const [showCtx,setShowCtx]         = useState(false);
  const c = q.color;
  const a = answers[q.id];

  const selVal    = a&&typeof a==="object"&&!Array.isArray(a)&&"sel"in a ? a.sel
                  : (typeof a==="string"?a:null);
  const ctxVal    = a&&typeof a==="object"&&!Array.isArray(a)&&"ctx"in a ? a.ctx:"";
  const customVal = a&&typeof a==="object"&&"custom"in a ? a.custom:"";
  const multiSel  = Array.isArray(a)?a:[];

  const activeVal = q.type==="multi" ? null : (selVal||q.rec?.val);
  const activeOpt = q.opts?.find(o=>o.v===activeVal);
  const isRecSel  = selVal===q.rec?.val||(!selVal&&q.type!=="multi");

  function pickOpt(v){
    if(q.type==="multi"){
      const curr=Array.isArray(a)?a:[];
      if(v==="none"){onAnswer(q.id,["none"],{noAdvance:true});return;}
      const without=curr.filter(x=>x!=="none");
      onAnswer(q.id,without.includes(v)?without.filter(x=>x!==v):[...without,v],{noAdvance:true});
      return;
    }
    if(selVal===v&&!customVal){onAnswer(q.id,defaultAnswerForQ(q),{noAdvance:true});return;}
    onAnswer(q.id,{sel:v,ctx:(a&&typeof a==="object"&&"ctx"in a)?a.ctx:""},
      {noAdvance:true,isUserPick:true});
  }
  function setCtx(v)    {onAnswer(q.id,{sel:selVal,ctx:v},{noAdvance:true});}
  function setCustom(v) {onAnswer(q.id,v.trim()?{custom:v}:null,{noAdvance:true});}

  function handleAccept(){
    if(!isAnswered(q,answers)) return;
    onAccept(q.id);
  }

  useEffect(()=>{
    if(!open) return;
    const h=e=>{
      if(e.key==="Enter"&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){
        const tag=document.activeElement?.tagName?.toLowerCase();
        if(tag==="textarea"||tag==="input") return;
        e.preventDefault();
        handleAccept();
      }
    };
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  },[open,answers]);

  return(
    <div data-qrow={!isFollowup||undefined} data-furow={isFollowup||undefined}
      data-iquest-ctx={`Question ${idx+1}: ${q.tag} — ${q.q.slice(0,50)}`}
      style={{background:open?C.surfaceHi:C.surface,
        border:"1px solid "+(answered?c+"55":C.border),
        borderRadius:6,transition:"background .15s,border-color .2s",overflow:"hidden",
        ...(isFollowup?{borderLeft:"3px solid "+c}:{})}}>

      {/* Header row */}
      <div onClick={onToggle} style={{display:"flex",alignItems:"center",gap:10,
        padding:"10px 14px",cursor:"pointer",userSelect:"none"}}>
        <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
          color:C.text3,minWidth:18,flexShrink:0}}>
          {isFollowup?"↳":String(idx+1).padStart(2,"0")}
        </span>
        <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,letterSpacing:".1em",
          color:c,background:c+"18",border:"1px solid "+c+"40",
          borderRadius:3,padding:"2px 7px",flexShrink:0,whiteSpace:"nowrap"}}>{q.tag}</span>
        <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:500,
          color:open?C.text:"#ccc",flex:1,overflow:"hidden",textOverflow:"ellipsis",
          whiteSpace:open?"normal":"nowrap",lineHeight:1.4}}>{q.q}</span>
        {answered&&!open&&label&&(
          <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
            color:c,background:c+"1a",border:"1px solid "+c+"44",
            borderRadius:3,padding:"2px 8px",flexShrink:0,whiteSpace:"nowrap",
            maxWidth:160,overflow:"hidden",textOverflow:"ellipsis"}}>{label}</span>
        )}
        <span style={{fontSize:12,flexShrink:0,marginLeft:2,
          transform:open&&!answered?"rotate(180deg)":"none",display:"inline-block",
          transition:"transform .15s",
          color:answered?C.green:open?"#888":"#444"}}>
          {answered&&!open?"✓":!answered&&!open?"○":"▾"}
        </span>
      </div>

      {/* Body */}
      {open&&(
        <div style={{padding:"0 14px 14px"}}
          onClick={e=>e.stopPropagation()}
          onTouchStart={e=>e.stopPropagation()}
          onPointerDown={e=>e.stopPropagation()}>

          <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:"#9e9e9e",
            lineHeight:1.65,margin:"0 0 12px"}}>{q.ctx}</p>

          {/* REC / Pros-Cons box */}
          <div style={{marginBottom:12,padding:"8px 10px",background:C.recBg,
            border:"1px solid "+(isRecSel?C.recBorder:c+"33"),borderRadius:4,
            transition:"border-color .2s"}}>
            {activeOpt?.pros?.length ? (
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
                    letterSpacing:".12em",color:C.green,flexShrink:0}}>
                    {isRecSel?"★ REC":"SELECTED"}
                  </span>
                  <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,
                    fontWeight:600,color:isRecSel?"#6dca7e":c}}>
                    {activeOpt.l}
                  </span>
                </div>
                <div style={{display:"flex",gap:16}}>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
                      color:"#5dba6e",letterSpacing:".06em",marginBottom:3}}>PROS</div>
                    {activeOpt.pros.map((p,i)=>(
                      <div key={i} style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,
                        color:"#7ab87a",lineHeight:1.5}}>+ {p}</div>
                    ))}
                  </div>
                  {activeOpt.cons?.length>0&&(
                    <div style={{flex:1}}>
                      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
                        color:"#c07070",letterSpacing:".06em",marginBottom:3}}>CONS</div>
                      {activeOpt.cons.map((con,i)=>(
                        <div key={i} style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,
                          color:"#c07070",lineHeight:1.5}}>− {con}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ):(
              <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
                  letterSpacing:".12em",color:C.green,flexShrink:0}}>★ REC</span>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,
                  fontWeight:600,color:"#6dca7e"}}>
                  {q.type==="multi"&&Array.isArray(q.rec?.val)
                    ? q.rec.val.map(v=>q.opts?.find(o=>o.v===v)?.l||v).join(" + ")
                    : q.type==="yn"?(q.rec?.val==="yes"?"Yes":"No")
                    : q.opts?.find(o=>o.v===q.rec?.val)?.l||q.rec?.val}
                </span>
              </div>
            )}
          </div>

          {/* Options */}
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
            {q.type==="yn"&&[{v:"yes",l:"Yes"},{v:"no",l:"No"}].map(opt=>{
              const sel=selVal===opt.v&&!customVal;
              const isRec=opt.v===q.rec?.val;
              const ac=opt.v==="yes"?C.green:"#c07070";
              return(
                <button key={opt.v} onClick={()=>pickOpt(opt.v)}
                  style={{background:sel?ac+"22":"#222",border:"1px solid "+(sel?ac:"#333"),
                    color:sel?ac:"#888",borderRadius:4,padding:"6px 22px",
                    fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:14,
                    cursor:"pointer",transition:"all .12s",
                    position:"relative",opacity:customVal?0.4:1}}>
                  {opt.l}
                  {isRec&&<span style={{position:"absolute",top:-8,right:-6,
                    fontFamily:"'IBM Plex Mono',monospace",fontSize:8,fontWeight:"bold",
                    color:"#fff",background:"#2a5a2a",border:"1px solid #5dba6e",
                    borderRadius:3,padding:"1px 5px",letterSpacing:".06em",
                    boxShadow:"0 0 6px #5dba6e55"}}>★ REC</span>}
                </button>
              );
            })}
            {(q.type==="choice"||q.type==="multi")&&q.opts.map(opt=>{
              const sel=q.type==="multi"?multiSel.includes(opt.v):(selVal===opt.v&&!customVal);
              const isRec=Array.isArray(q.rec?.val)?q.rec.val.includes(opt.v):opt.v===q.rec?.val;
              return(
                <button key={opt.v} onClick={()=>pickOpt(opt.v)}
                  data-iquest-ctx={`Option: ${q.tag} → "${opt.l}"`}
                  style={{background:sel?c+"1e":"#222",border:"1px solid "+(sel?c:"#333"),
                    color:sel?c:"#888",borderRadius:4,padding:"6px 14px",
                    fontFamily:"'DM Sans',sans-serif",fontWeight:sel?600:400,
                    fontSize:13,cursor:"pointer",transition:"all .12s",textAlign:"left",
                    position:"relative",
                    opacity:(customVal&&q.type!=="multi")?0.4:1}}>
                  {opt.l}
                  {opt.sub&&<div style={{fontFamily:"'IBM Plex Mono',monospace",
                    fontSize:9,color:sel?c+"99":"#555",marginTop:2}}>{opt.sub}</div>}
                  {isRec&&<span style={{position:"absolute",top:-8,right:-6,
                    fontFamily:"'IBM Plex Mono',monospace",fontSize:8,fontWeight:"bold",
                    color:"#fff",background:"#2a5a2a",border:"1px solid #5dba6e",
                    borderRadius:3,padding:"1px 5px",letterSpacing:".06em",
                    boxShadow:"0 0 6px #5dba6e55"}}>★ REC</span>}
                </button>
              );
            })}
          </div>

          {/* ACCEPT + ANNOTATE */}
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button onClick={handleAccept} disabled={!isAnswered(q,answers)}
              data-iquest-ctx="Button: ACCEPT and advance"
              style={{background:isAnswered(q,answers)?"#1a2e1a":"#161616",
                border:"1px solid "+(isAnswered(q,answers)?"#3a6a3a":"#222"),
                borderRadius:4,padding:"7px 18px",
                fontFamily:"'IBM Plex Mono',monospace",fontSize:11,
                color:isAnswered(q,answers)?"#5dba6e":"#3a3a3a",
                cursor:isAnswered(q,answers)?"pointer":"default",
                letterSpacing:".04em",transition:"all .15s"}}
                title="Accept this answer and move to next question (Enter)">
              ACCEPT →
            </button>
            {q.type!=="multi"&&<button onClick={()=>{setShowCtx(p=>!p);}}
              data-iquest-ctx="Button: ANNOTATE / add notes"
              style={{background:showCtx||ctxVal?"#1a1a2e":"transparent",
                border:"1px solid "+(showCtx||ctxVal?c+"44":"#2a2a2a"),
                borderRadius:4,padding:"7px 14px",
                fontFamily:"'IBM Plex Mono',monospace",fontSize:11,
                color:showCtx||ctxVal?c:"#555",
                cursor:"pointer",letterSpacing:".04em",transition:"all .15s"}}
                title="Add notes or context to this answer">
              {ctxVal?"NOTES ✎":"ANNOTATE"}
            </button>}
          </div>

          {(showCtx||ctxVal)&&q.type!=="multi"&&(
            <div style={{marginBottom:10}}>
              <textarea value={ctxVal} onChange={e=>setCtx(e.target.value)}
                placeholder="Add notes or context for this decision…" rows={2}
                data-iquest-ctx={`Notes field: ${q.tag}`}
                style={{display:"block",width:"100%",resize:"vertical",
                  background:"#1a1a1a",border:"1px solid "+c+"44",borderRadius:4,
                  color:C.text2,padding:"7px 9px",fontSize:12,
                  fontFamily:"'DM Sans',sans-serif",lineHeight:1.55,outline:"none",
                  boxSizing:"border-box"}}/>
            </div>
          )}

          {/* Custom answer */}
          <div style={{marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <div style={{flex:1,height:1,background:C.border}}/>
              <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
                color:"#555",letterSpacing:".06em"}}>or type a custom answer</span>
              <div style={{flex:1,height:1,background:C.border}}/>
            </div>
            <textarea value={customVal} onChange={e=>setCustom(e.target.value)}
              placeholder="Your own answer…" rows={2}
              data-iquest-ctx={`Custom answer: ${q.tag}`}
              style={{display:"block",width:"100%",resize:"vertical",
                background:customVal?"#1e1e2a":"#191919",
                border:"1px solid "+(customVal?"#5b9def66":"#2a2a2a"),
                borderRadius:4,color:customVal?C.text:C.text3,
                padding:"7px 9px",fontSize:12,
                fontFamily:"'DM Sans',sans-serif",lineHeight:1.55,
                outline:"none",boxSizing:"border-box",transition:"all .15s"}}/>
            {customVal&&(
              <button onClick={()=>setCustom("")} style={{marginTop:4,background:"transparent",
                border:"none",padding:0,cursor:"pointer",
                fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#555"}}>✕ clear</button>
            )}
          </div>

          {/* Inquire */}
          <button onClick={()=>setShowInquiry(p=>!p)} style={{
            background:showInquiry?"#0e1a2e":"#1c1c1c",
            border:"1px solid "+(showInquiry?"#5b9def88":"#383838"),
            borderRadius:4,padding:"5px 12px",
            fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
            color:showInquiry?"#7ab8f5":"#888",
            cursor:"pointer",letterSpacing:".06em",transition:"all .15s",
            display:"inline-flex",alignItems:"center",gap:5}}>
            <span style={{fontSize:12,lineHeight:1}}>{showInquiry?"▲":"?"}</span>
            {showInquiry?"close inquiry":"ask Claude"}
          </button>
          {showInquiry&&<InquiryPanel q={q}
            onExchange={(uq,ans)=>onInquiry&&onInquiry(q.id,uq,ans)}/>}
        </div>
      )}
    </div>
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────
function Summary({allQs,allAnswers,tickets}){
  const [copied,setCopied]=useState(false);
  const count=allQs.filter(q=>isAnswered(q,allAnswers)).length;
  function copy(){
    const txt=buildSummaryText(allQs,allAnswers,tickets);
    copyText(txt).then(ok=>{
      if(ok){setCopied(true);setTimeout(()=>setCopied(false),1600);}
      else{
        const ta=document.createElement("textarea");ta.value=txt;
        ta.style.cssText="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:80vw;height:40vh;z-index:9999;background:#1e1e1e;color:#e0e0e0;border:1px solid #444;border-radius:6px;padding:12px;font-size:12px;";
        const ov=document.createElement("div");
        ov.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9998;";
        ov.onclick=()=>{document.body.removeChild(ov);document.body.removeChild(ta);};
        document.body.appendChild(ov);document.body.appendChild(ta);
        ta.focus();ta.select();setCopied(true);setTimeout(()=>setCopied(false),1600);
      }
    });
  }
  return(
    <div style={{background:"#181818",border:"1px solid #282828",
      borderRadius:6,padding:"14px 16px",marginTop:20}}>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:12}}>
        <span style={{fontFamily:"'DM Sans',sans-serif",fontWeight:600,
          fontSize:15,color:C.text2}}>
          Summary
          <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
            color:C.text3,marginLeft:10}}>{count}/{allQs.length} answered</span>
          {tickets.length>0&&<span style={{fontFamily:"'IBM Plex Mono',monospace",
            fontSize:9,color:"#f5b14a",background:"#f5b14a18",
            border:"1px solid #f5b14a44",borderRadius:3,padding:"1px 6px",
            marginLeft:8}}>{tickets.length} ticket{tickets.length!==1?"s":""}</span>}
        </span>
        <button onClick={copy} title="Copies questions, answers, follow-ups, and tickets"
          style={{background:copied?"#1a2e1a":"#222",
            border:"1px solid "+(copied?"#3a6a3a":"#333"),
            color:copied?C.green:"#666",borderRadius:4,padding:"4px 12px",
            cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace",
            fontSize:10,transition:"all .15s"}}>
          {copied?"✓ copied":"⎘ copy all"}
        </button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:3}}>
        {allQs.map(q=>{
          const ans=isAnswered(q,allAnswers);
          return(
            <div key={q.id} style={{display:"flex",alignItems:"center",gap:8,
              padding:"5px 8px",borderRadius:4,background:ans?"#1e1e1e":"#161616"}}>
              <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
                letterSpacing:".08em",color:q.color,background:q.color+"14",
                borderRadius:2,padding:"1px 5px",flexShrink:0,whiteSpace:"nowrap"}}>{q.tag}</span>
              <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,
                color:ans?C.text2:"#555",flex:1}}>
                {getLabel(q,allAnswers)||"not answered"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function IQUESTShell(){
  const [answers,      setAnswers]      = useState({});
  const [answerAt,     setAnswerAt]     = useState({});
  const [openIdx,      setOpenIdx]      = useState(0);
  const [inquiryLog,   setInquiryLog]   = useState({});
  const [loaded,       setLoaded]       = useState(false);
  const [savePulse,    setSavePulse]    = useState(false);
  const [submitState,  setSubmitState]  = useState("idle");
  const [summary,      setSummary]      = useState("");
  const [followupQs,   setFollowupQs]   = useState([]);
  const [followupOpen, setFollowupOpen] = useState(0);
  const [fuAnswers,    setFuAnswers]    = useState({});
  const [tickets,      setTickets]      = useState([]);
  const [ctxMenu,      setCtxMenu]      = useState(null);
  const [ticketModal,  setTicketModal]  = useState(null);
  const [showTickets,  setShowTickets]  = useState(false);
  const saveTimer   = useRef(null);
  const submitRef   = useRef(null);
  const fuSubmitRef = useRef(null);

  const allQs      = [...QUESTIONS,...followupQs];
  const allAnswers = {...answers,...fuAnswers};

  // Load saved state
  useEffect(()=>{
    (async()=>{
      let hasLoaded=false;
      try{
        const r=await window.storage.get(STORAGE_KEY);
        if(r?.value){
          const s=JSON.parse(r.value);
          if(s.version===SCHEMA_VERSION){
            if(s.answers    &&Object.keys(s.answers).length)    {setAnswers(s.answers);hasLoaded=true;}
            if(s.answerAt   &&Object.keys(s.answerAt).length)   setAnswerAt(s.answerAt);
            if(s.inquiryLog &&Object.keys(s.inquiryLog).length) setInquiryLog(s.inquiryLog);
            if(s.summary)                                        setSummary(s.summary);
            if(s.followupQs &&s.followupQs.length)              setFollowupQs(s.followupQs);
            if(s.fuAnswers  &&Object.keys(s.fuAnswers).length)   setFuAnswers(s.fuAnswers);
            if(s.tickets    &&s.tickets.length)                  setTickets(s.tickets);
          }
        }
      }catch(e){}
      if(!hasLoaded){
        const defaults={};
        QUESTIONS.forEach(q=>{const d=defaultAnswerForQ(q);if(d!==null)defaults[q.id]=d;});
        setAnswers(defaults);
      }
      setLoaded(true);
    })();
  },[]);

  // Debounced save
  useEffect(()=>{
    if(!loaded)return;
    clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(async()=>{
      try{
        await window.storage.set(STORAGE_KEY,JSON.stringify({
          version:SCHEMA_VERSION,answers,answerAt,inquiryLog,
          summary,followupQs,fuAnswers,tickets
        }));
        setSavePulse(p=>!p);
      }catch(e){}
    },800);
  },[answers,answerAt,inquiryLog,summary,followupQs,fuAnswers,tickets,loaded]);

  // Right-click → ticket
  useEffect(()=>{
    const h=e=>{e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY,context:getElementContext(e.target)});};
    document.addEventListener("contextmenu",h);
    return()=>document.removeEventListener("contextmenu",h);
  },[]);

  // Ctrl+Enter global submit
  useEffect(()=>{
    if(!loaded)return;
    const h=e=>{
      if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){
        e.preventDefault();
        if(followupQs.length&&Object.keys(fuAnswers).length) fuSubmitRef.current?.click();
        else submitRef.current?.click();
      }
    };
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  },[loaded,followupQs,fuAnswers]);

  function onAnswer(id,val,opts={}){
    const isFu=followupQs.some(q=>String(q.id)===String(id));
    if(isFu) setFuAnswers(p=>({...p,[id]:val}));
    else     setAnswers(p=>({...p,[id]:val}));
    setAnswerAt(p=>({...p,[id]:new Date().toISOString()}));
  }

  function onAccept(qId){
    setAnswerAt(p=>({...p,[qId]:new Date().toISOString()}));
    const isFu=followupQs.some(q=>String(q.id)===String(qId));
    if(!isFu){
      const cur=QUESTIONS.findIndex(q=>String(q.id)===String(qId));
      const next=cur+1<QUESTIONS.length?cur+1:-1;
      if(next>=0) setTimeout(()=>{ setOpenIdx(next); scrollToRow(next,false); },80);
      else setOpenIdx(null);
    } else {
      const cur=followupQs.findIndex(q=>String(q.id)===String(qId));
      const next=cur+1<followupQs.length?cur+1:-1;
      if(next>=0) setTimeout(()=>{ setFollowupOpen(next); scrollToRow(next,true); },80);
      else setFollowupOpen(null);
    }
  }

  function scrollToRow(idx,isFu){
    setTimeout(()=>{
      const sel=isFu?"[data-furow]":"[data-qrow]";
      const rows=document.querySelectorAll(sel);
      if(rows[idx]) window.scrollTo({top:rows[idx].getBoundingClientRect().top+window.scrollY-80,behavior:"smooth"});
    },500);
  }

  function onInquiry(qId,q,a){setInquiryLog(p=>({...p,[qId]:[...(p[qId]||[]),{q,a}]}));}

  function exportAnswers(){
    const data={exportedAt:new Date().toISOString(),version:SCHEMA_VERSION,
      title:GUIDE_TITLE,answers,answerAt,inquiryLog,summary,followupQs,fuAnswers,tickets};
    const json=JSON.stringify(data,null,2);
    try{
      const uri="data:application/json;charset=utf-8,"+encodeURIComponent(json);
      const a=document.createElement("a");a.href=uri;
      a.download="iquest_"+STORAGE_KEY.replace("iquest_","").replace("_v1","")+"_"+new Date().toISOString().slice(0,10)+".json";
      document.body.appendChild(a);a.click();document.body.removeChild(a);
    }catch(e){
      const ta=document.createElement("textarea");ta.value=json;
      ta.style.cssText="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:80vw;height:55vh;z-index:9999;background:#1e1e1e;color:#e0e0e0;border:1px solid #5b9def;border-radius:6px;padding:12px;font-size:11px;font-family:monospace;";
      const ov=document.createElement("div");
      ov.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9998;";
      const msg=document.createElement("div");
      msg.style.cssText="position:fixed;top:calc(50% - 32vh);left:50%;transform:translateX(-50%);z-index:10000;font-family:'IBM Plex Mono',monospace;font-size:11px;color:#5b9def;white-space:nowrap;";
      msg.textContent="Select all (Ctrl+A) then copy — tap outside to close";
      const close=()=>{[ov,ta,msg].forEach(el=>{try{document.body.removeChild(el);}catch(e){}});};
      ov.onclick=close;
      [ov,ta,msg].forEach(el=>document.body.appendChild(el));
      ta.focus();ta.select();
    }
  }

  function importAnswers(file){
    if(!file)return;
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const d=JSON.parse(e.target.result);
        if(!d.version||!d.answers)throw new Error("Invalid file");
        if(!confirm("Import? Current answers will be replaced."))return;
        setAnswers(d.answers||{});setAnswerAt(d.answerAt||{});
        setInquiryLog(d.inquiryLog||{});setSummary(d.summary||"");
        setFollowupQs(d.followupQs||[]);setFuAnswers(d.fuAnswers||{});
        setTickets(d.tickets||[]);setSubmitState("idle");
      }catch(err){alert("Import failed: "+err.message);}
    };
    reader.readAsText(file);
  }

  async function clearAll(){
    if(!confirm("Clear all answers and tickets?"))return;
    const defaults={};
    QUESTIONS.forEach(q=>{const d=defaultAnswerForQ(q);if(d!==null)defaults[q.id]=d;});
    setAnswers(defaults);setAnswerAt({});setInquiryLog({});setSummary("");
    setFollowupQs([]);setFuAnswers({});setTickets([]);
    setSubmitState("idle");setOpenIdx(0);
    try{await window.storage.delete(STORAGE_KEY);}catch(e){}
  }

  async function submit(){
    setSubmitState("loading");
    try{
      const result=await callClaude(allQs,allAnswers,inquiryLog);
      setFollowupQs(result.questions||[]);setSummary(result.summary||"");
      setSubmitState(result.questions?.length?"has-followups":"done");
      if(result.questions?.length)setFollowupOpen(0);
    }catch(e){setSubmitState("error:"+e.message);}
  }

  async function submitFollowups(){
    setSubmitState("loading-fu");
    try{
      const fuLines=followupQs.map(q=>"[FU] "+q.tag+": "+formatForClaude(q,fuAnswers)).join("\n");
      const resp=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1500,
          system:`Prior summary: "${summary}". Review follow-up answers for "${GUIDE_TITLE}". Respond with valid JSON: {"summary":"...","questions":[]} when done, or with more questions if still blocking.`,
          messages:[{role:"user",content:"Follow-up answers:\n\n"+fuLines+"\n\nAnything still blocking?"}]})
      });
      const data=await resp.json();
      const raw=data.content?.find(b=>b.type==="text")?.text||"{}";
      let result;
      const attempts=[()=>JSON.parse(raw),()=>JSON.parse(raw.replace(/```json\n?|```/g,"").trim()),
        ()=>{const s=raw.indexOf("{"),e=raw.lastIndexOf("}");if(s<0||e<=s)throw 0;return JSON.parse(raw.slice(s,e+1));}];
      for(const fn of attempts){try{result=fn();break;}catch(e){}}
      if(!result)throw new Error("Parse failed");
      if(result.questions?.length){setFollowupQs(result.questions);setFuAnswers({});setFollowupOpen(0);}
      setSummary(result.summary||"");setSubmitState(result.questions?.length?"has-followups":"done");
    }catch(e){setSubmitState("error:"+e.message);}
  }

  const isLoading    = submitState==="loading"||submitState==="loading-fu";
  const isDone       = submitState==="done"||submitState==="has-followups";
  const isError      = submitState.startsWith("error");
  const answeredCount= QUESTIONS.filter(q=>isAnswered(q,answers)).length;
  const pct          = QUESTIONS.length ? Math.round(answeredCount/QUESTIONS.length*100) : 0;
  const fuAnsweredCt = followupQs.filter(q=>isAnswered(q,fuAnswers)).length;

  if(!loaded)return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",
      justifyContent:"center",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:C.text3}}>
      Restoring session…
    </div>
  );

  if(!QUESTIONS.length)return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",
      justifyContent:"center",flexDirection:"column",gap:12,padding:20}}>
      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:13,color:"#f5b14a"}}>
        ⚠ IQUEST Shell — no questions injected
      </div>
      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:C.text3,textAlign:"center",maxWidth:420,lineHeight:1.6}}>
        This is the shell template. Use <code style={{background:"#222",padding:"1px 6px",borderRadius:3,color:"#5b9def"}}>!IQUEST</code> to generate questions for a specific topic. Claude fetches this file and injects questions into the QUESTIONS array.
      </div>
    </div>
  );

  return(
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'DM Sans',sans-serif",
      padding:"20px 16px",maxWidth:760,margin:"0 auto",WebkitFontSmoothing:"antialiased"}}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;} button{outline:none;}
        button:hover:not(:disabled){filter:brightness(1.12);}
        textarea{outline:none;} textarea:focus{border-color:#444!important;}
        @keyframes slideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <SavePulse trigger={savePulse}/>

      {ctxMenu&&<CtxMenu menu={ctxMenu}
        onCreateTicket={ctx=>setTicketModal(ctx)}
        onClose={()=>setCtxMenu(null)}/>}
      {ticketModal!==null&&<TicketModal context={ticketModal}
        onSave={t=>setTickets(p=>[...p,t])}
        onClose={()=>setTicketModal(null)}/>}

      {/* Header */}
      <div style={{marginBottom:18}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
          <div>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
              color:"#555",letterSpacing:".12em",marginBottom:3}}>IQUEST</div>
            <h1 style={{fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:20,
              color:C.text,margin:0,letterSpacing:"-.01em"}}>{GUIDE_TITLE}</h1>
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
              color:"#f5b14a",marginTop:3,letterSpacing:".06em"}}>
              ✦ RIGHT-CLICK ANY ELEMENT TO CREATE A TICKET
            </div>
          </div>
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <button onClick={()=>setShowTickets(p=>!p)}
              data-iquest-ctx="Button: toggle tickets panel"
              style={{background:showTickets?"#1a1a1a":"transparent",
                border:"1px solid "+(tickets.length?"#f5b14a44":"#2a2a2a"),borderRadius:4,
                fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
                color:tickets.length?"#f5b14a":"#666",cursor:"pointer",padding:"3px 8px"}}>
              🎫{tickets.length>0?" "+tickets.length:""}
            </button>
            <button onClick={exportAnswers} style={{background:"transparent",
              border:"1px solid #2a2a2a",borderRadius:4,fontFamily:"'IBM Plex Mono',monospace",
              fontSize:10,color:"#666",cursor:"pointer",padding:"3px 8px"}}>⬇ export</button>
            <label style={{background:"transparent",border:"1px solid #2a2a2a",borderRadius:4,
              fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#666",
              cursor:"pointer",padding:"3px 8px",display:"inline-block"}}>
              ⬆ import<input type="file" accept=".json" style={{display:"none"}}
                onChange={e=>{importAnswers(e.target.files[0]);e.target.value="";}}/>
            </label>
            <button onClick={clearAll} style={{background:"transparent",border:"none",
              fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#3a3a3a",
              cursor:"pointer",padding:"3px 6px"}}>↺</button>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1,height:3,background:"#2a2a2a",borderRadius:2}}>
            <div style={{height:"100%",width:pct+"%",borderRadius:2,
              background:"#5dba6e",transition:"width .3s"}}/>
          </div>
          <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
            color:C.text3,minWidth:32,textAlign:"right"}}>{pct}%</span>
        </div>
        <p style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
          color:"#666",margin:"8px 0 0",lineHeight:1.5}}>
          Click row to expand · ACCEPT or Enter to advance · <span style={{color:"#3e5a6e"}}>? inquire</span> · Right-click to ticket · Ctrl+Enter to submit
        </p>
      </div>

      {showTickets&&(
        <div style={{marginBottom:16,padding:"12px 14px",background:"#181818",
          border:"1px solid #f5b14a33",borderRadius:6,animation:"slideIn .2s ease"}}>
          <div style={{fontFamily:"'DM Sans',sans-serif",fontWeight:600,
            fontSize:13,color:"#f5b14a",marginBottom:10}}>🎫 Tickets</div>
          <TicketsPanel tickets={tickets}
            onDelete={i=>setTickets(p=>p.filter((_,j)=>j!==i))}/>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {QUESTIONS.map((q,i)=>(
          <QRow key={q.id} q={q} idx={i}
            open={openIdx===i}
            onToggle={()=>setOpenIdx(p=>p===i?null:i)}
            answers={answers}
            onAnswer={onAnswer}
            onAccept={onAccept}
            onInquiry={onInquiry}/>
        ))}
      </div>

      {/* Submit */}
      <div style={{marginTop:20,padding:"14px 16px",background:"#181818",
        border:"1px solid #282828",borderRadius:6}}>
        {summary&&(
          <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:C.text2,
            lineHeight:1.6,marginBottom:12,padding:"8px 10px",background:"#1a2a1a",
            border:"1px solid #253525",borderRadius:4}}>
            <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,
              color:C.green,letterSpacing:".08em",marginRight:8}}>SUMMARY</span>
            {summary}
          </div>
        )}
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <button ref={submitRef} onClick={submit}
            disabled={isLoading||!answeredCount}
            data-iquest-ctx="Button: Submit answers to Claude"
            style={{background:isDone?"#1a2e1a":"#1a1a2e",
              border:"1px solid "+(isDone?"#3a6a3a":"#3a3a6e"),
              color:isDone?C.green:"#8b9def",borderRadius:5,padding:"9px 20px",
              cursor:isLoading||!answeredCount?"default":"pointer",
              fontFamily:"'IBM Plex Mono',monospace",fontSize:11,letterSpacing:".04em",
              opacity:isLoading||!answeredCount?0.5:1,transition:"all .15s"}}>
            {submitState==="loading"?"Thinking…":isDone?"✓ Submitted — resubmit?":"Submit → Claude"}
          </button>
          {isError&&<span style={{fontFamily:"'IBM Plex Mono',monospace",
            fontSize:10,color:"#c07070"}}>{submitState.replace("error:","Error: ")}</span>}
          {submitState==="done"&&<span style={{fontFamily:"'IBM Plex Mono',monospace",
            fontSize:10,color:C.green}}>✓ No follow-ups needed</span>}
        </div>
      </div>

      {followupQs.length>0&&(
        <div style={{marginTop:20,animation:"slideIn .3s ease"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{flex:1,height:1,background:"#2a2a2a"}}/>
            <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
              color:"#8b7cf0",letterSpacing:".08em"}}>CLAUDE FOLLOW-UPS</span>
            <div style={{flex:1,height:1,background:"#2a2a2a"}}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {followupQs.map((q,i)=>(
              <QRow key={q.id} q={q} idx={i}
                open={followupOpen===i} isFollowup
                onToggle={()=>setFollowupOpen(p=>p===i?null:i)}
                answers={fuAnswers}
                onAnswer={onAnswer}
                onAccept={onAccept}
                onInquiry={onInquiry}/>
            ))}
          </div>
          <div style={{marginTop:12,padding:"12px 16px",background:"#181818",
            border:"1px solid #2a2a3a",borderRadius:6}}>
            <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <button ref={fuSubmitRef} onClick={submitFollowups}
                disabled={isLoading||!fuAnsweredCt}
                style={{background:"#1a1a2e",border:"1px solid #3a3a6e",color:"#8b7cf0",
                  borderRadius:5,padding:"9px 20px",
                  cursor:isLoading||!fuAnsweredCt?"default":"pointer",
                  fontFamily:"'IBM Plex Mono',monospace",fontSize:11,letterSpacing:".04em",
                  opacity:isLoading||!fuAnsweredCt?0.5:1,transition:"all .15s"}}>
                {submitState==="loading-fu"?"Thinking…":"Submit follow-ups → Claude"}
              </button>
              <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:"#555"}}>
                {fuAnsweredCt}/{followupQs.length} answered
              </span>
            </div>
          </div>
        </div>
      )}

      <Summary allQs={allQs} allAnswers={allAnswers} tickets={tickets}/>
    </div>
  );
}
