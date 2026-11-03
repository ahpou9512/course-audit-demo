(function(){
const DAY=864e5, KEY='course-audit-demo-v4';
const CRITERIA=['Search on Dell Learning works','Course Description (PDF) works','Enrollment works','Launch URL works',
  'Course launches on first attempt','No error page','No access denied','Completion recorded'];

const answers=i=>i<3?['Yes','No','N/A']:['Yes','No']; // only H–J can be N/A
const AUDIENCES=['Partner','DSP','Customer','Tailored','TD'];
const CATS=['Content','Edutube','Course Setup','Learning Plan Setup','Pricing','CD PDF','IT issue','Other'];
const USERS=[
  {id:'u1',name:'Rick',role:'Auditor'},
  {id:'u2',name:'Calvin',role:'Auditor'},
  {id:'u3',name:'Gary',role:'SELM'},
  {id:'u5',name:'Jocelyn',role:'SELM'},
  {id:'u4',name:'Eddy',role:'Course Owner'}];
// earlier demo names, renamed in saved data so ticket ownership and history carry over
const OLD_NAMES={'Alex Tan':'Rick','Priya Nair':'Calvin','Sam Wong':'Gary','Mei Lin':'Jocelyn','Jordan Lee':'Eddy'};
const PV_RES='Pending Verification - Resolved', PV_DIS='Pending Verification - Discontinued', CLOSED='Closed / Archived';
const WORKING=['Escalated','In Progress','Retest Failed'];
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const STAGES=[['all','All'],['audit','To audit'],['issues','Unhealthy'],['verify','Ready to check'],['healthy','Healthy'],['disc','Discontinued']];

let S, view={name:'dashboard'}, user=USERS[0], filter='all', myF=false, catFilter='', tkF='', auditedF='', openRecs=new Set(), rejecting=null, search='', histQ='', rptFrom, rptTo, draft=null;

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const fmtD=t=>{if(!t)return '—';const d=new Date(t);return `${pad(d.getMonth()+1)}-${pad(d.getDate())}-${d.getFullYear()}`};
const fmtDT=t=>{const d=new Date(t);return `${fmtD(t)} ${pad(d.getHours())}:${pad(d.getMinutes())}`};
const toInput=t=>{const d=new Date(t);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const fromInput=s=>s?new Date(s+'T00:00:00').getTime():null;
const dayStart=t=>{const d=new Date(t);d.setHours(0,0,0,0);return d.getTime()};
const daysSince=t=>Math.floor((dayStart(Date.now())-dayStart(t))/DAY);
const week=t=>t?`${MONTHS[new Date(t).getMonth()]}_Wk${Math.ceil(new Date(t).getDate()/7)}`:'TBD';
const audList=s=>String(s||'').split(',').map(x=>x.trim()).filter(Boolean);
const course=id=>S.courses.find(c=>c.id===id);
const ticket=id=>S.tickets.find(t=>t.id===id);
const ticketsOf=cid=>S.tickets.filter(t=>t.courseId===cid);
const openOf=cid=>ticketsOf(cid).filter(t=>t.status!==CLOSED);
const isOverdue=t=>t.status==='Escalated'&&!t.fixDate&&Date.now()-t.escalatedAt>7*DAY;
const isAud=()=>user.role==='Auditor', isSelm=()=>user.role==='SELM', isOwner=()=>user.role==='Course Owner';
// a ticket belongs to the SELM who escalated it; other SELMs can only view it
const mine=t=>!t.escalatedBy||t.escalatedBy===user.name;
const readyToVerify=c=>{const o=openOf(c.id);return o.length>0&&o.every(t=>t.status===PV_RES||t.status===PV_DIS)};

function stage(c){
  if(c.health==='Discontinued')return 'disc';
  if(c.auditorStatus==='Pending'||c.lockedBy&&c.auditorStatus!=='Completed')return 'audit';
  if(openOf(c.id).length)return readyToVerify(c)?'verify':'issues';
  return 'healthy';
}
function nextStep(c){
  const st=stage(c), o=openOf(c.id);
  if(st==='audit'){
    if(c.lockedBy&&c.lockedBy!==user.name)return [`Being audited by ${c.lockedBy}`,false];
    if(c.lockedBy)return ['Finish your audit',true];
    return isAud()?['Start audit',true]:['Waiting for auditor',false];
  }
  if(st==='issues'){const n=o.filter(t=>t.status==='New'||WORKING.includes(t.status)).length, v=o.length-n;
    if(isAud()&&v)return [`${v} ticket${v>1?'s':''} to verify`,true];
    const m=o.filter(t=>t.status==='New'||WORKING.includes(t.status)&&mine(t)).length;
    return isSelm()&&m?[`${m} ticket${m>1?'s':''} to handle`,true]:['With SELM',false]}
  if(st==='verify')return isAud()?['Verify fixes',true]:['Waiting for auditor',false];
  if(st==='healthy')return [`Audited ${daysSince(c.lastAudited)}d ago`,false];
  return ['Archived',false];
}
function tone(s){
  return ({'Healthy':'t-ok','Passed':'t-ok','Completed':'t-ok',[CLOSED]:'t-gray',
    'Unhealthy':'t-bad','Failed':'t-bad','Retest Failed':'t-bad',
    'Pending Audit':'t-warn','Pending':'t-warn','New':'t-warn',
    'Escalated':'t-info','In Progress':'t-acc','Ready to check':'t-pv',[PV_RES]:'t-pv',[PV_DIS]:'t-pv','Discontinued':'t-gray'})[s]||'t-gray';
}
const pill=s=>`<span class="pill ${tone(s)}">${esc(s)}</span>`;
const healthLabel=c=>stage(c)==='verify'?'Ready to check':c.health;
const shortStatus=s=>({[PV_RES]:'Verify fix',[PV_DIS]:'Verify cancel'})[s]||s;

function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
function load(){try{let v=localStorage.getItem(KEY);if(!v)return null;
  for(const [o,n] of Object.entries(OLD_NAMES))v=v.split(JSON.stringify(o)).join(JSON.stringify(n));
  return JSON.parse(v)}catch(e){return null}}
function fresh(){S={courses:[],audits:[],tickets:[],logs:[],seq:{t:1001,a:1,c:1,l:1}};save()}

/* ---------- shell ---------- */
let openHist=new Set(), openEdits=new Set(); // courses whose older audits are unfolded; audits whose criteria edits are listed
let animTree=false, animatedFor=null, enterAnim=true, rowAnim=true, flashId=null, editingT=null; // editingT: ticket whose SELM form is open
function render(){
  if(view.name==='course'){animTree=animatedFor!==view.id;animatedFor=view.id}else{animTree=false;animatedFor=null}
  const cur=view.name==='course'?'courses':view.name;
  $('#tabs').innerHTML=[['dashboard','Dashboard'],['courses','Courses']] // History tab hidden for now; vHistory() is kept
    .map(([k,l])=>`<button class="tab" data-a="go" data-id="${k}" aria-current="${cur===k}">${l}</button>`).join('');
  $('#view').innerHTML=({courses:vCourses,course:vCourse,dashboard:vDash,history:vHistory})[view.name]();
  if(view.name==='course'&&draft)renderIssues();
  if(enterAnim){const v=$('#view');v.classList.remove('enter');void v.offsetWidth;v.classList.add('enter');enterAnim=false}
  rowAnim=false;flashId=null;
  if(animTree)setTimeout(()=>$('#tree')?.classList.remove('anim'),1600);
}
function go(name,id){
  // leaving the page abandons an unfinished re-audit, so the course stays exactly as it was
  if(draft?.re&&!(name==='course'&&id===draft.courseId)){const c=course(draft.courseId);if(c){c.lockedBy=null;c.lockedAt=null}draft=null;save()}
  view={name,id};editingT=null;enterAnim=true;rowAnim=true;render();window.scrollTo(0,0)}

/* ---------- courses list ---------- */
function vCourses(){
  const counts={};STAGES.forEach(([k])=>counts[k]=0);
  S.courses.forEach(c=>{if(stage(c)!=='disc')counts.all++;counts[stage(c)]++});
  const canAdd=isAud()||isOwner(), myN=S.tickets.filter(t=>t.status!==CLOSED&&t.escalatedBy===user.name).length;
  return `<div class="head"><h2>Courses</h2>${canAdd?`<button class="btn primary" data-a="addCourse">+ Add course</button>`:''}</div>
  <div class="toolbar"><div class="chips-bar">${STAGES.map(([k,l])=>`<button class="fchip${k==='disc'?' sep':''}" data-a="filter" data-id="${k}" aria-pressed="${filter===k}">${l} <b>${counts[k]}</b></button>`).join('')}
    ${isSelm()?`<button class="fchip mine" data-a="toggleMine" aria-pressed="${myF}">My tickets <b>${myN}</b></button>`:''}</div>
    </div>
  <div class="tk-legend" role="group" aria-label="Highlight tickets"><span class="lbl">Highlight tickets</span>${TK_OPTS.map(([v,l])=>`<button class="lchip" data-a="tkHl" data-id="${v}" aria-pressed="${tkF===v}">${v==='closed'?'<span class="dot chk">✓</span>':`<span class="dot ${tone(v==='verify'?PV_RES:v)}"></span>`}${l} <b>${tkCount(v)}</b></button>`).join('')}</div>
  <div class="tbl-wrap"><table class="courses-tbl"><colgroup><col style="width:24%"><col style="width:14%"><col style="width:32%"><col style="width:14%"><col style="width:16%"></colgroup>
    <thead><tr><th>Course</th><th>Status</th><th>Issue categories</th><th>Last audited</th><th>Next step</th></tr>
    <tr class="frow"><th><input type="search" id="search" placeholder="Search code or name" value="${esc(search)}" aria-label="Search courses"></th>
    <th>${fsel('statusF',filter==='all'?'':filter,'All statuses',STAGES.slice(1),'Filter by status')}</th>
    <th>${fsel('catFilter',catFilter,'All categories',CATS.map(x=>[x,x]),'Filter by issue category')}</th>
    <th>${fsel('auditedF',auditedF,'Any time',AUDITED_OPTS,'Filter by last audited')}</th>
    <th><button class="link small" data-a="clearF">Clear filters</button></th></tr></thead><tbody id="courseRows">${courseRows()}
  </tbody></table></div>`;
}

const TK_OPTS=[['New','New'],['Escalated','Escalated'],['In Progress','In Progress'],['Retest Failed','Retest Failed'],['verify','Waiting for verification'],['closed','Closed']];
const tkIs=(t,v)=>v==='verify'?t.status===PV_RES||t.status===PV_DIS:v==='closed'?t.status===CLOSED:t.status===v;
const tkMatch=t=>tkIs(t,tkF);
const tkCount=v=>S.courses.flatMap(shownOf).filter(t=>tkIs(t,v)).length; // tickets the table shows in that state
// category and My tickets narrow the course list; the ticket status filter only highlights, so no course is hidden by it
const tkKeep=t=>(!catFilter||t.category===catFilter)&&(!myF||!isSelm()||t.escalatedBy===user.name);
const tkHit=t=>tkKeep(t)&&(!tkF||tkMatch(t));
// while the cycle is still open, tickets already approved stay listed with a check mark
const shownOf=c=>openOf(c.id).length?ticketsOf(c.id).filter(t=>t.status!==CLOSED||t.auditId===c.cycleAuditId):[];
const AUDITED_OPTS=[['never','Never audited'],['7','Last 7 days'],['30','Last 30 days'],['old','Over 30 days ago']];
const fsel=(id,cur,all,opts,label)=>`<select id="${id}" class="${cur?'on':''}" aria-label="${label}"><option value="">${all}</option>${opts.map(([v,l])=>`<option value="${esc(v)}"${cur===v?' selected':''}>${esc(l)}</option>`).join('')}</select>`;
function auditedOk(c){
  if(!auditedF)return true;
  if(auditedF==='never')return !c.lastAudited;
  if(!c.lastAudited)return false;
  const d=daysSince(c.lastAudited);
  return auditedF==='old'?d>30:d<=+auditedF;
}
// filtering only swaps the table rows, so the page itself never redraws
function refreshRows(){
  document.querySelectorAll('.fchip[data-a=filter]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.id===filter));
  $('.fchip.mine')?.setAttribute('aria-pressed',myF);
  document.querySelectorAll('.lchip').forEach(b=>b.setAttribute('aria-pressed',b.dataset.id===tkF));
  const sf=$('#statusF');if(sf){sf.value=filter==='all'?'':filter;sf.classList.toggle('on',filter!=='all')}
  // remember where each row was and what was faded, then let the new rows slide and fade from there
  const body=$('#courseRows'),wrap=body.closest('.tbl-wrap'),h0=wrap.offsetHeight,prev={};
  body.querySelectorAll('tr[data-id]').forEach(tr=>{prev[tr.dataset.id]={top:tr.getBoundingClientRect().top,dim:tr.classList.contains('dim'),
    other:new Set([...tr.querySelectorAll('.ci.other')].map(ci=>ci.title))}});
  body.innerHTML=courseRows();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  glide(wrap,h0); // the table grows or shrinks smoothly instead of jumping
  const ease={duration:320,easing:'cubic-bezier(.2,.7,.3,1)'},op=d=>({opacity:d?.4:1});
  body.querySelectorAll('tr[data-id]').forEach(tr=>{const p=prev[tr.dataset.id];
    if(!p)return tr.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],ease);
    const dy=p.top-tr.getBoundingClientRect().top;if(Math.abs(dy)>1)tr.animate([{transform:`translateY(${dy}px)`},{transform:'none'}],ease);
    const dim=tr.classList.contains('dim');if(dim!==p.dim)tr.querySelectorAll('td').forEach(td=>td.animate([op(p.dim),op(dim)],ease));
    tr.querySelectorAll('.ci').forEach(ci=>{const was=p.other.has(ci.title),is=ci.classList.contains('other');
      if(was!==is)[...ci.children].forEach(el=>el.animate([op(was),op(is)],ease))});
  });
}
function courseRows(){
  const q=search.trim().toLowerCase();
  const list=S.courses.filter(c=>(filter==='all'?stage(c)!=='disc':stage(c)===filter)&&(!q||(c.code+' '+c.name).toLowerCase().includes(q))
      &&auditedOk(c)&&(!(catFilter||myF&&isSelm())||shownOf(c).some(tkKeep)))
    .sort((a,b)=>(tkF?shownOf(b).some(tkHit)-shownOf(a).some(tkHit):0)||(nextStep(b)[1]-nextStep(a)[1])||b.createdAt-a.createdAt);
  return `  ${list.length?list.map((c,i)=>{const [txt,me]=nextStep(c), shown=shownOf(c), hit=!tkF||shown.some(tkHit), fade=hit&&(catFilter||tkF||myF&&isSelm());return `<tr class="click${hit?'':' dim'}${rowAnim?' row-in':''}${c.id===flashId?' flash':''}" style="--i:${Math.min(i,12)}" data-a="open" data-id="${c.id}" tabindex="0">
    <td><div class="cname"><span class="mono">${esc(c.code)}</span><b>${esc(c.name)}</b></div></td>
    <td>${pill(healthLabel(c))}</td>
    <td>${shown.length?`<div class="catlist">${shown.map(t=>{const done=t.status===CLOSED,dis=t.closedAs==='Cancelled'||t.closedAs==='Discontinued';
      return `<div class="ci${done?' closed':''}${fade&&!tkHit(t)?' other':''}" title="${t.id}">${done?`<span class="dot chk${dis?' dis':''}">✓</span>`:`<span class="dot ${tone(t.status)}"></span>`}<span class="cn">${esc(t.category)}</span>
      ${done?`<span class="cs ${dis?'':'ok'}">${dis?esc(t.closedAs):'Approved'}</span>`:`<span class="cs${isOverdue(t)?' late':''}">${esc(shortStatus(t.status))}${isOverdue(t)?` · ${daysSince(t.escalatedAt)}d no fix date`:''}</span>`}</div>`}).join('')}</div>`:'<span class="muted">—</span>'}</td>
    <td class="mono nowrap">${fmtD(c.lastAudited)}</td>
    <td><span class="next${me?' me':''}">${esc(txt)}</span></td></tr>`}).join('')
  :`<tr><td colspan="5" class="empty">${S.courses.length?'No courses match.':'No courses yet. Add the first one with “+ Add course”.'}</td></tr>`}`;
}

/* ---------- course page ---------- */
function vCourse(){
  const c=course(view.id); if(!c){view={name:'courses'};return vCourses()}
  const st=stage(c), open=openOf(c.id), closed=ticketsOf(c.id).filter(t=>t.status===CLOSED);
  const runs=S.audits.filter(a=>a.courseId===c.id).sort((a,b)=>b.date-a.date);
  let btn='';
  if(c.lockedBy&&c.lockedBy!==user.name)btn=`<span class="muted small">🔒 Being audited by ${esc(c.lockedBy)}</span>`;
  else if(st==='audit'&&isAud()&&!c.lockedBy)btn=`<button class="btn primary" data-a="startAudit" data-id="${c.id}">Start audit</button>`;
  else if(st==='healthy'&&!c.lockedBy&&(isAud()||isOwner()))btn=`<button class="btn" data-a="reaudit" data-id="${c.id}">${isAud()?'Re-audit':'Queue re-audit'}</button>`;
  else if(st==='audit'&&!isAud())btn=`<span class="muted small">Waiting for an auditor</span>`;
  const stats=`<div class="stats"><span>Audits <b>${runs.length}</b></span><span>Last audited <b>${fmtD(c.lastAudited)}</b>${c.lastAudited?` (${daysSince(c.lastAudited)}d ago)`:''}</span>
      <span>By <b>${esc(c.lastAuditor||'—')}</b></span><span id="priceBox">${priceView(c)}</span><span id="audBox">${audView(c)}</span></div>`;
  return `<button class="link back" data-a="go" data-id="courses">← All courses</button>
  <div class="panel cover${st==='disc'?' gone':''}"><div class="chead"><div style="display:flex;flex-direction:column;gap:6px">
      <span class="mono muted">${esc(c.code)} · ${esc(c.type)}${open.length?` · ${open.length} open issue${open.length>1?'s':''}`:''}</span><h2>${esc(c.name)}</h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${pill(healthLabel(c))}${st==='audit'&&c.health==='Healthy'?pill('Re-audit queued'):''}${discInfo(c)}</div></div>
      <div class="chead-act">${btn}${(isAud()||isOwner())&&st!=='disc'?(!runs.length&&!ticketsOf(c.id).length?(c.lockedBy?'':`<button class="btn danger" data-a="delCourse" data-id="${c.id}">Delete course</button>`)
        :`<button class="btn danger" data-a="discCourse" data-id="${c.id}">Discontinue course</button>`):''}${isAud()&&st==='disc'?`<button class="btn" data-a="restoreCourse" data-id="${c.id}">Restore course</button>`:''}</div></div>
    ${stats}</div>
  ${draft&&draft.courseId===c.id&&c.lockedBy===user.name?`<div class="expander open done">${auditForm(c)}</div>`:''}
  ${open.length||closed.length?`<div class="panel">${open.length?`<div class="panel-h"><h3>Open tickets (${open.length})</h3>${isAud()&&c.cycleAuditId?`<button class="btn sm" data-a="addTk" data-id="${c.id}">+ Add ticket</button>`:''}</div>
    <div class="tree${animTree?' anim':''}" id="tree"><div class="tree-kids">${open.map((t,i)=>`<div class="tree-kid" style="--i:${i}">${ticketRow(c,t,st)}</div>`).join('')}</div></div>`:''}
    ${closed.length?`<details><summary>Closed tickets (${closed.length})</summary><div class="tree-kids closed-kids">${closed.map(t=>`<div class="tree-kid">${ticketRow(c,t,st)}</div>`).join('')}</div></details>`:''}</div>`:''}
  <div class="panel"><h3>Audit history</h3>
    ${runs.length?`<div class="hist${openHist.has(c.id)?' open':''}" id="hist-${c.id}">${runs.map((a,i)=>`<div class="iter${i>=3?' old':''}"><span class="n">#${runs.length-i}</span><span class="mono">${fmtD(a.date)}</span>
      <div class="body" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${pill(a.result)}<span>${esc(a.auditor)}</span>${a.note?`<span class="muted small">${esc(a.note)}</span>`:''}
        ${a.checklist&&isAud()&&a.id===c.cycleAuditId&&open.length?`<button class="link small" data-a="editCrit" data-id="${a.id}">Edit criteria</button>`:''}</div>
      ${a.checklist?`<div class="ck" id="ck-${a.id}">${critChips(a)}</div>`:''}${auditInfo(a,runs[i+1])}${editTrail(a)}</div>`).join('')}</div>
    ${runs.length>3?`<button type="button" class="link small hist-more" data-a="toggleHist" data-id="${c.id}" data-n="${runs.length-3}">${openHist.has(c.id)?'Show less':`Show ${runs.length-3} earlier audit${runs.length-3>1?'s':''}`}</button>`:''}`
    :'<span class="muted">Not audited yet.</span>'}
  </div>`;
}

// when and why a course was retired, shown on its overview card
const discInfo=c=>{if(c.health!=='Discontinued')return '';const l=[...S.logs].reverse().find(x=>x.courseId===c.id&&x.action==='Course discontinued');
  return l?`<span class="muted small">${fmtD(l.ts)}${l.actor?` by ${esc(l.actor)}`:''}${l.detail?` · ${esc(l.detail)}`:''}</span>`:''};
// Docebo pricing can be corrected in place by the auditor or SELM; every change is logged
const canPrice=()=>isAud()||isSelm();
// pricing is stored as a number (null = not filled in); '' → null, anything that isn't a non-negative number → NaN
const toPrice=v=>{v=String(v??'').trim();if(!v)return null;const n=Number(v);return Number.isFinite(n)&&n>=0?Math.round(n*100)/100:NaN};
const fmtPrice=p=>p==null?'—':Number(p).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
// a Healthy course has passed its audit, so its pricing and audience change only through a re-audit
const canEditInfo=c=>canPrice()&&c.health!=='Healthy'&&c.health!=='Discontinued';
const priceView=c=>`Pricing <b>${fmtPrice(c.price)}</b>${canEditInfo(c)?` <button class="link small" data-a="editPrice" data-id="${c.id}">Edit</button>`:''}`;
const audView=c=>`Audience <b>${esc(c.audience||'—')}</b>${canEditInfo(c)?` <button class="link small" data-a="editAud" data-id="${c.id}">Edit</button>`:''}`;
// dashboard breakdown cards can be folded away; the choice is remembered per browser
const FOLD_KEY='course-audit-fold';
let fold=(()=>{try{return JSON.parse(localStorage.getItem(FOLD_KEY))||{}}catch(e){return {}}})();
const foldBtn=k=>`<button class="fold-btn" data-a="fold" data-id="${k}" aria-expanded="${!fold[k]}"><span class="fl"><span>Hide details</span><span>Show details</span></span><i>▾</i></button>`;
// who changed this audit's answers afterwards, newest first; the changes unfold under the summary line
function editTrail(a){
  const ed=S.logs.filter(l=>l.action==='Criteria updated'&&l.auditId===a.id).reverse();if(!ed.length)return '';
  const open=openEdits.has(a.id),last=ed[0];
  return `<div class="aedit${open?' open':''}" id="ae-${a.id}"><div class="aedit-h">✎ Edited ${ed.length} time${ed.length>1?'s':''} · last by ${esc(last.actor)}, ${fmtDT(last.ts)}
    <button type="button" class="link small" data-a="toggleEdits" data-id="${a.id}">${open?'Hide changes':'Show changes'}</button></div>
    <ol>${ed.map(l=>`<li><span class="mono">${fmtDT(l.ts)}</span><b>${esc(l.actor)}</b><span class="chg-list">${l.detail.split('; ').map(esc).join('<br>')}</span></li>`).join('')}</ol></div>`;
}
const critChips=a=>{const no=CRITERIA.filter((_,j)=>a.checklist[j]==='No'),yes=a.checklist.filter(v=>v==='Yes').length,na=a.checklist.filter(v=>v==='N/A').length;
  return `<div class="chips crit-sum">${no.map(l=>`<span class="cchip t-bad">✕ ${esc(l)}</span>`).join('')}<span class="cchip t-ok">✓ ${no.length?`${yes} Yes`:'All Yes'}</span>${na?`<span class="cchip t-gray">${na} N/A</span>`:''}</div>`};
// pricing and audience as they were at that audit; a value that differs from the audit before it shows what it was
const auditInfo=(a,prev)=>{const v=(k,f)=>a[k]===undefined?'—':f(a[k]),moved=k=>prev&&a[k]!==undefined&&prev[k]!==undefined&&prev[k]!==a[k];
  const part=(l,k,f)=>`<span>${l} ${moved(k)?`<s>${esc(f(prev[k]))}</s> → <b class="chg">${esc(v(k,f))}</b>`:`<b>${esc(v(k,f))}</b>`}</span>`;
  return `<div class="ainfo">${part('Pricing','price',fmtPrice)}${part('Audience','audience',x=>x||'—')}</div>`};
// the auditor can correct the criteria of the current audit while its tickets are still open
function critEditor(a){
  return `<div class="crit-edit"><div class="crit">${CRITERIA.map((l,i)=>`<div class="crit-row${a.checklist[i]==='No'?' no':''}"><span>${l}</span>
    <div class="seg" role="radiogroup" aria-label="${l}">${answers(i).map(v=>`<label><input type="radio" name="e${i}" value="${v}"${a.checklist[i]===v?' checked':''}><span class="${v==='Yes'?'y':v==='No'?'n':'na'}">${v}</span></label>`).join('')}</div></div>`).join('')}</div>
    <div class="tk-btns"><span class="err" id="ckErr-${a.id}" style="margin-right:auto"></span><button class="btn sm" data-a="cancelCrit" data-id="${a.id}">Cancel</button><button class="btn primary sm" data-a="saveCrit" data-id="${a.id}">Save criteria</button></div></div>`;
}
const approveBox=t=>`<div class="tk-approve"><button class="btn approve-big" data-a="approve" data-id="${t.id}"><span>${t.status===PV_DIS?'Approve cancel':'Approve'}</span></button><button class="btn sm" data-a="startReject" data-id="${t.id}">Reject</button></div>`;
const rejectBox=t=>`<div class="tk-form"><label class="field grow"><span class="req">Why it is rejected</span><input type="text" id="rej-${t.id}" placeholder="What still fails"></label>
      <div class="tk-btns"><button class="btn sm" data-a="cancelReject">Cancel</button><button class="btn danger sm" data-a="reject" data-id="${t.id}">Send back to SELM</button></div></div>`;
// card contents changed, so don't replay the cards' entrance animation
function relayout(){$('#tree')?.classList.remove('anim')}
// let a card glide from its old height to its current one
function glide(el,h0){
  const h1=el.offsetHeight;if(h0===h1||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  el.style.overflow='hidden';
  el.animate([{height:h0+'px'},{height:h1+'px'}],{duration:280,easing:'cubic-bezier(.2,.7,.3,1)'}).onfinish=()=>{el.style.overflow=''};
}
// redraw one ticket card in place (no page redraw); returns the new card
function swapCard(id,flash){
  const old=document.querySelector(`.tk[data-tid="${id}"]`),t=ticket(id),c=course(t.courseId);if(!old){render();return null}
  const box=document.createElement('div');flashId=flash?id:null;box.innerHTML=ticketRow(c,t,stage(c));flashId=null;
  const nu=box.firstElementChild,h0=old.offsetHeight;old.replaceWith(nu);relayout();glide(nu,h0);return nu;
}
// opening or closing the SELM form only swaps the bottom of the card, so the records above never redraw
function swapSelm(id,open){
  const card=document.querySelector(`.tk[data-tid="${id}"]`),part=card?.querySelector('.tk-act,.tk-form');if(!part)return swapCard(id);
  const h0=card.offsetHeight;part.outerHTML=open?selmForm(ticket(id)):selmAct(ticket(id));card.querySelector('.tk-act,.tk-form').classList.add('enter');glide(card,h0);return card;
}
const selmAct=t=>`<div class="tk-btns tk-act"><button class="btn primary sm" data-a="openT" data-id="${t.id}">Update <span class="arr" aria-hidden="true">→</span></button></div>`;
const selmForm=t=>`<div class="tk-form">
      <label class="field"><span>Tentative fix date</span><input type="date" id="fix-${t.id}" value="${t.fixDate?toInput(t.fixDate):''}"></label>
      <label class="field grow"><span>Note</span><input type="text" id="note-${t.id}" placeholder="Progress, owner, or reason to cancel"></label>
      <div class="tk-btns"><button class="btn sm" data-a="saveT" data-id="${t.id}">Save</button><button class="btn okb sm" data-a="resolveT" data-id="${t.id}">Resolved</button><button class="btn danger sm" data-a="discT" data-id="${t.id}">Cancel</button><button type="button" class="btn sm tk-back" data-a="cancelT" aria-label="Back without saving" title="Back without saving (Esc)">←</button></div></div>`;
function ticketRow(c,t,st){
  const pv=t.status===PV_RES||t.status===PV_DIS;
  let note='';
  if(t.status==='Retest Failed'&&t.rejection)note=`<div class="tk-note bad"><b>Auditor:</b> ${esc(t.rejection)}</div>`;
  else if(t.status===PV_DIS&&t.justification)note=`<div class="tk-note"><b>Why cancel:</b> ${esc(t.justification)}</div>`;
  let side='', below='';
  if(isSelm()&&t.status==='New')side=`<button class="btn primary sm" data-a="escalate" data-id="${t.id}">Escalate</button>`;
  else if(isSelm()&&WORKING.includes(t.status)&&!mine(t))side=`<span class="muted small">Handled by ${esc(t.escalatedBy)}</span>`;
  else if(isSelm()&&WORKING.includes(t.status))below=editingT===t.id?selmForm(t):selmAct(t);
  else if(isAud()&&pv){
    below=rejecting===t.id?rejectBox(t):approveBox(t);
  }else if(pv)side=`<span class="muted small">Waiting for auditor</span>`;
  const eta=t.status===CLOSED?`Closed ${fmtD(t.closedAt)} · ${t.closedAs}`:t.fixDate?`ETA ${week(t.fixDate)} · ${fmtD(t.fixDate)}`:'ETA TBD';
  return `<div class="tk${t.id===flashId?' flash':''}" data-tid="${t.id}"><div class="tk-main">
    <div class="tk-top"><span class="mono muted">${t.id}</span><b>${esc(t.category)}</b><span class="st ${tone(t.status)}" title="${esc(t.status)}"><i></i>${esc(shortStatus(t.status))}</span>
      ${isOverdue(t)?`<span class="late">${daysSince(t.escalatedAt)}d no fix date</span>`:''}<span class="tk-eta">${eta}</span></div>
    <div class="tk-desc">${esc(t.detail)}</div>${note}${records(t)}</div>
    ${side?`<div class="tk-side">${side}</div>`:''}${below}</div>`;
}

// every action on a ticket, newest first; older entries fold away after the first 3,
// and a closed ticket hides its whole record list until asked
function records(t){
  const recs=S.logs.filter(l=>l.ticketId===t.id).reverse(); // logs are stored oldest first
  recs.push({ts:t.createdAt,actor:'',action:'Ticket created',detail:''});
  const closed=t.status===CLOSED, keep=closed?0:3;
  const row=(l,i)=>`<li${i>=keep?' class="old"':''}><span class="mono">${fmtDT(l.ts)}</span><b>${esc(l.action)}</b>${l.detail?`<span>${esc(l.detail)}</span>`:''}${l.actor&&l.actor!==recs[i-1]?.actor?`<i>${esc(l.actor)}</i>`:''}</li>`; // name only where the person changes
  const more=recs.length-keep, open=openRecs.has(t.id);
  const on=closed?'Hide records':'Show less', off=closed?`Show records (${more})`:`Show ${more} earlier`;
  // one list: older rows unfold under the first 3, and the toggle stays at the bottom
  return `<div class="recs${open?' open':''}${closed?' shut':''}"><div class="recs-h">Records</div><ol>${recs.map(row).join('')}</ol>
    ${more>0?`<button type="button" class="link small recs-more" data-a="toggleRecs" data-id="${t.id}" data-on="${on}" data-off="${off}">${open?on:off}</button>`:''}</div>`;
}
function auditForm(c){
  const d=draft;
  return `<form class="audit" id="auditForm" novalidate>
  <div class="audit-h"><h3>Audit #${S.audits.filter(a=>a.courseId===c.id).length+1}</h3><button type="button" class="btn sm" data-a="cancelAudit" data-id="${c.id}">Cancel audit</button></div>
  <div class="audit-b">
    ${d.re?`<div class="info-fields locked"><div class="field"><span>Docebo pricing</span><b>${fmtPrice(c.price)}</b></div>
      <div class="field"><span>Catalog audience</span><b>${esc(c.audience||'—')}</b></div></div>`
    :`<div class="info-fields">
      <label class="field"><span>Docebo pricing</span><input type="text" id="fPrice" inputmode="decimal" autocomplete="off" value="${esc(d.price)}"></label>
      <fieldset class="aud"><legend class="req">Catalog audience</legend><div class="aud-opts">${AUDIENCES.map(a=>`<label class="aud-opt"><input type="checkbox" name="fAud" value="${a}"${d.aud.includes(a)?' checked':''}> ${a}</label>`).join('')}</div></fieldset>
    </div>`}
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="sec-label">Criteria</span><button type="button" class="btn sm" data-a="markAllYes">All Yes</button></div>
    <div class="crit">${CRITERIA.map((l,i)=>`<div class="crit-row${d.crit[i]==='No'?' no':''}" id="cr${i}"><span>${l}</span>
      <div class="seg" role="radiogroup" aria-label="${l}">${answers(i).map(v=>`<label><input type="radio" name="c${i}" value="${v}"${d.crit[i]===v?' checked':''}><span class="${v==='Yes'?'y':v==='No'?'n':'na'}">${v}</span></label>`).join('')}</div></div>`).join('')}</div>
    <div id="issues"></div>
  </div>
  <div class="audit-f"><span class="err" id="formErr" style="margin-right:auto"></span><button type="submit" class="btn primary submit-fill" id="submitBtn"><span>Submit audit</span></button></div></form>`;
}
function renderIssues(){
  const box=$('#issues');if(!box||!draft)return;
  const anyNo=draft.crit.includes('No');
  if(anyNo&&!draft.issues.length)draft.issues=[{desc:'',cat:''}];
  document.querySelectorAll('.crit-row').forEach((r,i)=>r.classList.toggle('no',draft.crit[i]==='No'));
  box.className=anyNo?'issues'+(draft.wasOpen?'':' open-in'):'';draft.wasOpen=anyNo;
  box.innerHTML=anyNo?`<div class="sec-label" style="color:var(--bad)">Issues · each one becomes a ticket</div>`+draft.issues.map((x,i)=>`<div class="issue"><div class="issue-h"><span>Issue ${i+1}</span>${draft.issues.length>1?`<button type="button" class="btn sm" data-a="rmIssue" data-id="${i}">Remove</button>`:''}</div>
      <label class="field"><span class="req">What is wrong</span><textarea id="iDesc${i}" data-i="${i}" rows="2" placeholder="Page, module or link, and what happens">${esc(x.desc)}</textarea></label>
      <label class="field"><span class="req">Category</span><select id="iCat${i}" data-i="${i}"><option value="">Choose…</option>${CATS.map(c=>`<option${x.cat===c?' selected':''}>${c}</option>`).join('')}</select></label></div>`).join('')
      +`<div><button type="button" class="btn sm" data-a="addIssue">+ Add issue</button></div>`:'';
}
function submitAudit(){
  const c=course(draft.courseId), err=m=>{$('#formErr').textContent=m};
  const left=draft.crit.filter(v=>!v).length;
  if(left)return err(`Answer all criteria (${left} left).`);
  if(!draft.aud.length)return err('Choose at least one catalog audience.');
  const price=toPrice(draft.price);
  if(Number.isNaN(price))return err('Docebo pricing must be a number of 0 or more.');
  // a re-audit is saved when it finds a No or changes an answer (e.g. Yes → N/A); otherwise Cancel audit keeps it as it was
  if(draft.re&&!draft.crit.includes('No')&&draft.base&&draft.crit.join()===draft.base.join())
    return err('Nothing changed. Mark a criterion No or N/A, or use Cancel audit to keep it Healthy.');
  c.price=price;c.audience=draft.aud.join(', ');
  const info={price:c.price,audience:c.audience}, ts=Date.now();
  const started=c.lockedAt?` · started ${fmtDT(c.lockedAt)}`:'';
  if(draft.crit.includes('No')){
    const bad=draft.issues.findIndex(x=>!x.desc.trim()||!x.cat);
    if(bad>-1)return err(`Issue ${bad+1}: describe it and choose a category.`);
    if(draft.re&&!draft.ok){const n=draft.crit.filter(v=>v==='No').length,k=draft.issues.length;
      return openModal(`<div class="ov-h"><h3>Mark ${esc(c.code)} Unhealthy?</h3><button class="x" data-a="close" aria-label="Close">×</button></div>
        <div class="ov-b"><p style="margin:0">${n} criteri${n>1?'a':'on'} marked No. The course changes from Healthy to Unhealthy and ${k} ticket${k>1?'s are':' is'} created.</p></div>
        <div class="ov-f"><button class="btn" data-a="close">Back to form</button><button class="btn danger" data-a="confirmFail">Mark Unhealthy</button></div>`)}
    const a=addAudit(c,'Failed',[...draft.crit],info,draft.issues.map(x=>({...x})));
    const made=draft.issues.map(x=>{const t={id:'TKT-'+S.seq.t++,courseId:c.id,auditId:a.id,category:x.cat,detail:x.desc.trim(),status:'New',createdAt:ts,
      escalatedAt:null,escalatedBy:null,fixDate:null,notes:[],justification:null,rejection:null,closedAt:null,closedAs:null};S.tickets.push(t);return t});
    c.health='Unhealthy';c.auditorStatus='In Progress';c.cycleAuditId=a.id;c.lastAudited=ts;c.lastAuditor=user.name;
    log({courseId:c.id,ticketIds:made.map(t=>t.id),action:'Audit failed',detail:`${made.length} ticket(s) created: ${made.map(t=>`${t.id} ${t.category}`).join(', ')}${started}`});
    var msg=`Unhealthy · created ${made.map(t=>t.id).join(', ')}`, fill='--bad', label=`${made.length} ticket${made.length>1?'s':''} created`;
  }else{
    addAudit(c,'Passed',[...draft.crit],info);
    c.health='Healthy';c.auditorStatus='Completed';c.auditCount++;c.lastAudited=ts;c.lastAuditor=user.name;
    log({courseId:c.id,action:'Audit passed',detail:`Iteration ${c.auditCount}${started}`});
    var msg=`Healthy · audit counter now ${c.auditCount}`, fill='--ok', label='Passed ✓';
  }
  c.lockedBy=null;c.lockedAt=null;draft=null;save();
  // fill the button, fold the form away, then land on the Courses list with this row highlighted
  const done=()=>{filter='all';search='';catFilter='';tkF='';auditedF='';flashId=c.id;go('courses');toast(msg)};
  const b=$('#submitBtn'),x=$('#auditForm')?.parentElement;
  if(!b||matchMedia('(prefers-reduced-motion: reduce)').matches)return done();
  b.disabled=true;b.style.setProperty('--fill',`var(${fill})`);b.classList.add('filling');
  setTimeout(()=>{b.querySelector('span').textContent=label;b.classList.add('done')},450);
  setTimeout(()=>x?.classList.remove('done','open'),900);
  setTimeout(done,1350);
}

/* ---------- dashboard ---------- */
// how often each criterion was marked No, laid out like the category panel
function critPanel(){
  const runs=S.audits.filter(a=>a.checklist?.length);
  const rows=CRITERIA.map((l,i)=>[l,runs.filter(a=>a.checklist[i]==='No').length]).filter(r=>r[1]).sort((a,b)=>b[1]-a[1]);
  const max=Math.max(1,...rows.map(r=>r[1]));
  return `<div class="panel"><div class="panel-h"><h3>Criteria marked No</h3></div>
    <div class="bars wide">${rows.length?rows.map(([l,n])=>`<div class="bar"><span>${esc(l)}</span><div class="track"><div class="fill" style="width:${n/max*100}%;background:var(--bad)"></div></div><span class="v">${n}</span></div>`).join('')
    :`<span class="muted">${runs.length?'No criteria marked No':'No audits yet'}</span>`}</div></div>`;
}
function vDash(){
  const cs={};STAGES.forEach(([k])=>cs[k]=0);S.courses.forEach(c=>{if(stage(c)!=='disc')cs.all++;cs[stage(c)]++});
  const open=S.tickets.filter(t=>t.status!==CLOSED), overdue=S.tickets.filter(isOverdue);
  const catCounts=CATS.map(c=>[c,open.filter(t=>t.category===c).length]).filter(x=>x[1]);
  const maxC=Math.max(1,...catCounts.map(x=>x[1]));
  const etaT=S.tickets.filter(t=>WORKING.includes(t.status));
  const buckets={};etaT.forEach(t=>{const k=week(t.fixDate);(buckets[k]=buckets[k]||[]).push(t)});
  const bKeys=Object.keys(buckets).sort((a,b)=>a==='TBD'?1:b==='TBD'?-1:Math.min(...buckets[a].map(t=>t.fixDate))-Math.min(...buckets[b].map(t=>t.fixDate)));
  const maxB=Math.max(1,...bKeys.map(k=>buckets[k].length));
  const m=(v,l,t)=>`<div class="metric" style="--tone:var(${t})"><b>${v}</b><span>${l}</span></div>`;
  const tm=(v,l,t)=>`<div class="metric" style="--tone:var(${t})"><b>${v}</b><span>${l}</span></div>`;
  const from=rptFrom??dayStart(Date.now()-6*DAY), to=rptTo??dayStart(Date.now());
  const inR=S.logs.filter(l=>l.ts>=from&&l.ts<to+DAY), cnt=a=>inR.filter(l=>l.action===a).length;
  return `<div class="head"><h2>Dashboard</h2><button class="btn sm" data-a="reset">Clear all data</button></div>
  <span class="sec-label">Courses</span>
  <div class="metric hero" style="--tone:var(--accent)"><b>${cs.all}</b><span>All courses</span><button class="link small hero-sla" data-a="goFilter" data-id="disc">${cs.disc} discontinued</button>${foldBtn('courses')}</div>
  <div class="fold-box${fold.courses?' shut':''}" id="fold-courses"><div class="metrics">${m(cs.healthy,'Healthy','--ok','healthy')}${m(cs.issues,'Unhealthy','--bad','issues')}${m(cs.verify,'Ready to check','--pv','verify')}${m(cs.audit,'To audit','--warn','audit')}</div></div>
  ${overdue.length?`<div class="alert"><span>⚠</span><div><b>${overdue.length} ticket${overdue.length>1?'s':''} escalated over 7 days with no fix date.</b> SELM and Auditor groups notified: ${overdue.map(t=>`<button class="link" data-a="open" data-id="${t.courseId}">${t.id}</button>`).join(', ')}</div></div>`:''}
  <span class="sec-label">Tickets</span>
  <div class="metric hero" style="--tone:var(--accent)"><b>${open.length}</b><span>Open tickets</span><small class="hero-sla${overdue.length?' bad':''}">${overdue.length} over 7-day SLA</small>${foldBtn('tickets')}</div>
  <div class="fold-box${fold.tickets?' shut':''}" id="fold-tickets"><div class="metrics">${tm(S.tickets.filter(t=>t.status==='New').length,'New','--warn')}${tm(S.tickets.filter(t=>t.status==='Retest Failed').length,'Sent back','--bad')}${tm(S.tickets.filter(t=>t.status==='Escalated').length,'Escalated','--info')}${tm(S.tickets.filter(t=>t.status==='In Progress').length,'In Progress','--accent')}${tm(S.tickets.filter(t=>t.status===PV_RES||t.status===PV_DIS).length,'Waiting for verification','--pv')}</div></div>
  <div class="grid2">
    <div class="panel"><h3>Open tickets by category</h3><div class="bars">${catCounts.length?catCounts.map(([c,n])=>`<div class="bar"><span>${esc(c)}</span><div class="track"><div class="fill" style="width:${n/maxC*100}%"></div></div><span class="v">${n}</span></div>`).join(''):'<span class="muted">No open tickets</span>'}</div></div>
    <div class="panel"><h3>Fix ETA by week</h3><div class="bars">${bKeys.length?bKeys.map(k=>`<div class="bar"><span class="mono">${k}</span><div class="track"><div class="fill" style="width:${buckets[k].length/maxB*100}%;${k==='TBD'?'background:var(--warn)':''}"></div></div><span class="v">${buckets[k].length}</span></div>`).join(''):'<span class="muted">Nothing scheduled</span>'}</div></div>
  </div>
  ${critPanel()}
  <div class="panel"><div class="panel-h"><h3>Status report</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end"><label class="field"><span>From</span><input type="date" id="rFrom" value="${toInput(from)}"></label>
    <label class="field"><span>To</span><input type="date" id="rTo" value="${toInput(to)}"></label>
    <button class="btn sm" data-a="rToday">Today</button><button class="btn sm" data-a="rWeek">7 days</button></div></div>
    <div class="kv"><div><b>${cnt('Audit passed')+cnt('Re-verification approved')}</b><span>Audits passed</span></div><div><b>${cnt('Audit failed')}</b><span>Audits failed</span></div>
    <div><b>${inR.reduce((n,l)=>n+(l.ticketIds?.length||0),0)}</b><span>Tickets opened</span></div><div><b>${cnt('Escalated')}</b><span>Escalated</span></div>
    <div><b>${cnt('Ticket closed')}</b><span>Tickets closed</span></div><div><b>${cnt('Retest failed')+cnt('Cancellation rejected')+cnt('Discontinuation rejected')}</b><span>Sent back</span></div></div></div>`;
}

/* ---------- history ---------- */
function histRows(){
  const q=histQ.trim().toLowerCase();
  const rows=S.logs.filter(l=>{const c=course(l.courseId);return !q||[l.actor,l.action,l.detail,l.ticketId,(l.ticketIds||[]).join(' '),c?.code,c?.name].join(' ').toLowerCase().includes(q)}).sort((a,b)=>b.ts-a.ts);
  return `  ${rows.length?rows.map(l=>{const c=course(l.courseId);return `<tr><td class="mono nowrap">${fmtDT(l.ts)}</td><td class="nowrap">${esc(l.actor)}</td>
  <td class="mono nowrap">${c?`<button class="link" data-a="open" data-id="${c.id}">${esc(c.code)}</button>`:''}</td>
  <td class="nowrap">${esc(l.action)}${l.ticketId?` <span class="mono muted">${l.ticketId}</span>`:''}</td><td>${esc(l.detail)}</td></tr>`}).join('')
  :`<tr><td colspan="5" class="empty">${S.logs.length?'No matches.':'Nothing has happened yet.'}</td></tr>`}`;
}
function vHistory(){
  return `<div class="head"><h2>History</h2><input type="search" id="histQ" placeholder="Search code, person, ticket…" value="${esc(histQ)}" aria-label="Search history" style="width:min(300px,100%)"></div>
  <div class="tbl-wrap"><table><thead><tr><th>When</th><th>Who</th><th>Course</th><th>Action</th><th>Detail</th></tr></thead><tbody id="histRows">${histRows()}</tbody></table></div>`;
}

/* ---------- modals ---------- */
function openModal(html){$('#overlay').innerHTML=`<div class="scrim"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`}
function closeOv(){$('#overlay').innerHTML=''}

/* ---------- actions ---------- */
function closeCycle(c){
  if(openOf(c.id).length)return null;
  const cyc=ticketsOf(c.id).filter(t=>t.auditId===c.cycleAuditId);
  // older data: a ticket closed as "Discontinued" took the whole course with it
  if(cyc.some(t=>t.closedAs==='Discontinued')){
    c.health='Discontinued';c.auditorStatus='Completed';
    log({courseId:c.id,action:'Course discontinued',detail:'Archived and removed from active queues'});
    return 'Course discontinued';
  }
  c.health='Healthy';c.auditorStatus='Completed';c.auditCount++;c.lastAudited=Date.now();c.lastAuditor=user.name;
  // every issue is fixed, so the failed criteria become Yes; N/A answers stay N/A
  const prev=S.audits.find(a=>a.id===c.cycleAuditId)?.checklist;
  addAudit(c,'Passed',prev?prev.map(v=>v==='N/A'?'N/A':'Yes'):null,{price:c.price,audience:c.audience},[],'Re-verification after fixes');
  log({courseId:c.id,action:'Re-verification approved',detail:`Course Healthy · iteration ${c.auditCount}`});
  return `Course is Healthy · audit counter ${c.auditCount}`;
}
function log(e){S.logs.push({id:'L'+S.seq.l++,ts:Date.now(),actor:user.name,detail:'',...e})}
function addAudit(c,result,checklist,info,issues,note){
  const a={id:'A'+S.seq.a++,courseId:c.id,date:Date.now(),result,auditor:user.name,checklist,...info,issues:issues||[],note:note||''};
  S.audits.push(a);return a}
function toast(msg){const h=$('#toastHost'),el=document.createElement('div');el.className='toast';el.setAttribute('role','status');el.textContent=msg;
  h.innerHTML='';h.appendChild(el);setTimeout(()=>{el.classList.add('out');setTimeout(()=>el.remove(),300)},2400)}
function tlog(t,action,detail){log({courseId:t.courseId,ticketId:t.id,action,detail:detail||''})}

const A={
  go(id){go(id)},
  open(id){go('course',id)},
  filter(id){filter=id;refreshRows()},
  goFilter(id){filter=id;go('courses')},
  addCourse(){openModal(`<form id="addForm" novalidate style="display:contents"><div class="ov-h"><h3>Add a course</h3><button type="button" class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="ov-b"><label class="field"><span class="req">Course code</span><input type="text" id="nCode" placeholder="e.g. ESSTGD04406"></label>
    <label class="field"><span class="req">Course name</span><input type="text" id="nName"></label>
    <label class="field"><span>Type</span><select id="nType"><option>E-Learning</option><option>ILT</option><option>On-Demand</option></select></label>
    <span class="err" id="nErr"></span></div>
    <div class="ov-f"><button type="button" class="btn" data-a="close">Cancel</button><button type="submit" class="btn primary">Add</button></div></form>`);$('#nCode').focus()},
  saveCourse(){
    const code=$('#nCode').value.trim(),name=$('#nName').value.trim();
    if(!code||!name){$('#nErr').textContent='Course code and course name are required.';return}
    if(S.courses.some(c=>c.code.toLowerCase()===code.toLowerCase())){$('#nErr').textContent=`${code} is already in the masterlist.`;return}
    const c={id:'C'+S.seq.c++,code,name,type:$('#nType').value,price:null,audience:'',health:'Pending Audit',auditorStatus:'Pending',auditCount:0,lastAudited:null,lastAuditor:null,lockedBy:null,lockedAt:null,cycleAuditId:null,createdAt:Date.now()};
    S.courses.push(c);log({courseId:c.id,action:'Course registered',detail:'Manual entry'});save();closeOv();render();toast(`${code} added`)},
  close:closeOv,
  toggleMine(){myF=!myF;refreshRows()},
  // an issue the auditor missed can still join the current round as a new ticket
  addTk(id){if($('#tkAdd'))return $('#tkCat').focus();
    document.querySelector(`[data-a=addTk][data-id="${id}"]`).closest('.panel-h').insertAdjacentHTML('afterend',`<div class="tk-add" id="tkAdd">
      <label class="field"><span class="req">Category</span><select id="tkCat"><option value="">Choose…</option>${CATS.map(x=>`<option>${x}</option>`).join('')}</select></label>
      <label class="field grow"><span class="req">What is wrong</span><input type="text" id="tkDesc" placeholder="Page, module or link, and what happens"></label>
      <div class="tk-btns"><button class="btn primary sm" data-a="doAddTk" data-id="${id}">Add ticket</button><button type="button" class="btn sm" data-a="cancelAddTk" aria-label="Back without adding" title="Back without adding">←</button></div>
      <span class="err" id="tkErr"></span></div>`);$('#tkCat').focus()},
  cancelAddTk(){$('#tkAdd')?.remove()},
  doAddTk(id){const c=course(id),cat=$('#tkCat').value,desc=$('#tkDesc').value.trim();
    if(!cat||!desc){$('#tkErr').textContent=!cat?'Choose a category.':'Describe what is wrong.';return (!cat?$('#tkCat'):$('#tkDesc')).focus()}
    const t={id:'TKT-'+S.seq.t++,courseId:id,auditId:c.cycleAuditId,category:cat,detail:desc,status:'New',createdAt:Date.now(),
      escalatedAt:null,escalatedBy:null,fixDate:null,notes:[],justification:null,rejection:null,closedAt:null,closedAs:null};
    S.tickets.push(t);c.health='Unhealthy';tlog(t,'Added after audit',`${cat} · by the auditor`);flashId=t.id;save();render();toast(`${t.id} added`)},
  toggleEdits(id){const box=$('#ae-'+id),open=!openEdits.has(id);open?openEdits.add(id):openEdits.delete(id);
    box.classList.toggle('open',open);box.querySelector('[data-a=toggleEdits]').textContent=open?'Hide changes':'Show changes'},
  toggleHist(id){const h=$('#hist-'+id),b=document.querySelector(`[data-a=toggleHist][data-id="${id}"]`),open=!openHist.has(id),n=+b.dataset.n;
    open?openHist.add(id):openHist.delete(id);h.classList.add('reveal');h.classList.toggle('open',open);b.textContent=open?'Show less':`Show ${n} earlier audit${n>1?'s':''}`},
  tkHl(id){tkF=tkF===id?'':id;refreshRows()},
  clearF(){search='';catFilter='';tkF='';auditedF='';filter='all';myF=false;
    $('#search').value='';['statusF','catFilter','auditedF'].forEach(id=>{$('#'+id).value='';$('#'+id).classList.remove('on')});refreshRows()},
  reset(){openModal(`<div class="ov-h"><h3>Clear all data?</h3><button class="x" data-a="close" aria-label="Close">×</button></div><div class="ov-b">All courses, audits, tickets and history in this browser will be removed.</div><div class="ov-f"><button class="btn" data-a="close">Cancel</button><button class="btn danger" data-a="doReset">Clear</button></div>`)},
  doReset(){fresh();draft=null;closeOv();go('courses');toast('All data cleared')},
  startAudit(id,re){const c=course(id);c.lockedBy=user.name;c.lockedAt=Date.now();if(!re)c.auditorStatus='In Progress';
    const last=re?S.audits.filter(a=>a.courseId===id&&a.checklist?.length===8).sort((a,b)=>b.date-a.date)[0]?.checklist:null;
    const base=last?last.map(v=>v==='N/A'?'N/A':'Yes'):null;
    draft={courseId:id,crit:base?[...base]:Array(8).fill(null),base,price:c.price??'',aud:audList(c.audience),issues:[],re:!!re};save();
    // open the form in place instead of re-rendering the page
    const b=document.querySelector('[data-a=startAudit],[data-a=reaudit]'),p=b?.closest('.panel');if(!p){render();return}
    b.remove();p.insertAdjacentHTML('afterend',`<div class="expander">${auditForm(c)}</div>`);renderIssues();
    const x=p.nextElementSibling;void x.offsetWidth;x.classList.add('open');
    setTimeout(()=>{x.classList.add('done');x.scrollIntoView({behavior:'smooth',block:'nearest'})},460)},
  cancelAudit(id){const c=course(id),re=draft?.re;c.lockedBy=null;c.lockedAt=null;if(!re)c.auditorStatus='Pending';draft=null;save();
    // fold the form away and put the Start audit button back, without redrawing the page
    const x=$('#auditForm')?.parentElement,p=x?.previousElementSibling;
    if(!x?.classList.contains('expander')||!p?.querySelector('.chead'))return render();
    p.scrollIntoView({behavior:'smooth',block:'start'});
    x.classList.remove('done','open');
    setTimeout(()=>{x.remove();p.querySelector('.chead-act').insertAdjacentHTML('afterbegin',re?`<button class="btn" data-a="reaudit" data-id="${c.id}">Re-audit</button>`
      :`<button class="btn primary" data-a="startAudit" data-id="${c.id}">Start audit</button>`)},460)},
  markAllYes(){draft.crit=draft.crit.map(v=>v||'Yes');$('#formErr').textContent='';document.querySelectorAll('#auditForm input[type=radio]').forEach(r=>r.checked=draft.crit[+r.name.slice(1)]===r.value);renderIssues()},
  addIssue(){draft.issues.push({desc:'',cat:''});renderIssues();$(`#iDesc${draft.issues.length-1}`)?.focus()},
  rmIssue(i){draft.issues.splice(+i,1);renderIssues()},
  // a discontinued course no longer exists: it leaves the active queues and its open tickets are cancelled
  discCourse(id){const c=course(id);openModal(`<div class="ov-h"><h3>Discontinue ${esc(c.code)}?</h3><button class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="ov-b"><p style="margin:0">The course is marked as no longer available. It leaves the active queues${openOf(id).length?` and its ${openOf(id).length} open ticket${openOf(id).length>1?'s are':' is'} cancelled`:''}.</p>
      <label class="field"><span class="req">Reason</span><input type="text" id="discWhy" placeholder="Why the course is being retired"></label><span class="err" id="discErr"></span></div>
    <div class="ov-f"><button class="btn" data-a="close">Keep course</button><button class="btn danger" data-a="doDiscCourse" data-id="${id}">Discontinue course</button></div>`);$('#discWhy')?.focus()},
  doDiscCourse(id){const why=$('#discWhy').value.trim();if(!why){$('#discErr').textContent='Add a reason.';return $('#discWhy').focus()}
    const c=course(id),now=Date.now();
    openOf(id).forEach(t=>{t.status=CLOSED;t.closedAs='Cancelled';t.closedAt=now;tlog(t,'Ticket closed','Course discontinued')});
    c.health='Discontinued';c.auditorStatus='Completed';c.lockedBy=null;c.lockedAt=null;if(draft?.courseId===id)draft=null;editingT=null;
    log({courseId:id,action:'Course discontinued',detail:why});save();closeOv();render();toast(`${c.code} discontinued`)},
  delCourse(id){const c=course(id);openModal(`<div class="ov-h"><h3>Delete ${esc(c.code)}?</h3><button class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="ov-b"><p style="margin:0">This course has never been audited, so it is removed completely. This can't be undone.</p></div>
    <div class="ov-f"><button class="btn" data-a="close">Keep course</button><button class="btn danger" data-a="doDelCourse" data-id="${id}">Delete course</button></div>`)},
  doDelCourse(id){const c=course(id);if(!c)return closeOv();
    S.courses=S.courses.filter(x=>x.id!==id);S.logs=S.logs.filter(l=>l.courseId!==id);if(draft?.courseId===id)draft=null;
    save();closeOv();go('courses');toast(`${c.code} deleted`)},
  restoreCourse(id){const c=course(id);openModal(`<div class="ov-h"><h3>Restore ${esc(c.code)}?</h3><button class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="ov-b"><p style="margin:0">The course comes back to the active list and waits for a fresh audit. Its cancelled tickets stay closed.</p></div>
    <div class="ov-f"><button class="btn" data-a="close">Keep discontinued</button><button class="btn primary" data-a="doRestoreCourse" data-id="${id}">Restore course</button></div>`)},
  doRestoreCourse(id){const c=course(id);c.health='Pending Audit';c.auditorStatus='Pending';c.cycleAuditId=null;
    log({courseId:id,action:'Course restored',detail:'Back in the active list, waiting for audit'});save();closeOv();render();toast(`${c.code} restored · waiting for audit`)},
  reaudit(id){const c=course(id);if(isAud())return A.startAudit(id,true);
    openModal(`<div class="ov-h"><h3>Queue re-audit?</h3><button class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="ov-b"><p style="margin:0">Are you sure you want to re-audit <b>${esc(c.code)}</b> · ${esc(c.name)}? It goes back to the To audit queue for an auditor to check again.</p></div>
    <div class="ov-f"><button class="btn" data-a="close">Cancel</button><button class="btn primary" data-a="doReaudit" data-id="${c.id}">Queue re-audit</button></div>`)},
  doReaudit(id){closeOv();const c=course(id);c.auditorStatus='Pending';log({courseId:c.id,action:'Re-audit queued',detail:''});save();render();toast('Queued for re-audit')},
  // a re-audit that finds a No asks once before the healthy course turns Unhealthy
  confirmFail(){if(!draft)return closeOv();draft.ok=true;closeOv();submitAudit()},
  escalate(id){const t=ticket(id);t.status='Escalated';t.escalatedAt=Date.now();t.escalatedBy=user.name;tlog(t,'Escalated');save();
    // go straight on to the fix date: the card opens its form in place
    const prev=editingT;editingT=id;if(prev&&prev!==id)swapSelm(prev,false);
    swapCard(id,true)?.querySelector('.tk-form')?.classList.add('enter');toast(`${id} escalated · set a fix date within 7 days`)},
  saveT(id,quiet){if(!mine(ticket(id)))return toast(`Only ${ticket(id).escalatedBy} can update ${id}`);const t=ticket(id),fix=fromInput($(`#fix-${id}`).value),note=$(`#note-${id}`).value.trim(),before=S.logs.length;
    if((fix?toInput(fix):'')!==(t.fixDate?toInput(t.fixDate):'')){tlog(t,t.fixDate?'Fix date changed':'Fix date set',`${week(t.fixDate)} → ${week(fix)}${fix?` (${fmtD(fix)})`:''}`);t.fixDate=fix}
    if(note){t.notes.push({ts:Date.now(),by:user.name,text:note});tlog(t,'Note added',note)}
    if(t.fixDate&&t.status!=='In Progress'){t.status='In Progress';tlog(t,'Status → In Progress','Fix date saved')}
    if(quiet)return;
    const added=S.logs.length-before, card=document.querySelector(`.tk[data-tid="${id}"]`);
    const say=(el,txt,cls)=>{el.querySelector('.tk-saved')?.remove();el.querySelector('.tk-btns')?.insertAdjacentHTML('beforeend',`<span class="tk-saved ${cls}">${txt}</span>`)};
    if(!added){if(card)say(card,'No changes to save','none');return}
    // close the form; the card comes back with its new record rows lit up and a saved note by Update
    save();editingT=null;const nu=swapCard(id,true);if(!nu)return toast('Saved');
    [...nu.querySelectorAll('.recs li')].slice(0,added).forEach(li=>li.classList.add('new'));say(nu,'✓ Saved','ok')},
  openT(id){const prev=editingT;editingT=id;if(prev&&prev!==id)swapSelm(prev,false);
    swapSelm(id,true)},
  cancelT(){const id=editingT;editingT=null;if(id)swapSelm(id,false)},
  resolveT(id){if(!mine(ticket(id)))return toast(`Only ${ticket(id).escalatedBy} can update ${id}`);A.saveT(id,true);const t=ticket(id);t.status=PV_RES;tlog(t,'Marked resolved','Sent for auditor verification');editingT=null;flashId=id;save();render();toast(`${id} sent for verification`)},
  discT(id){if(!mine(ticket(id)))return toast(`Only ${ticket(id).escalatedBy} can update ${id}`);const note=$(`#note-${id}`).value.trim();if(!note){$(`#note-${id}`).focus();toast('Add a note explaining why');return}
    const t=ticket(id);t.notes.push({ts:Date.now(),by:user.name,text:note});t.status=PV_DIS;t.justification=note;tlog(t,'Proposed cancellation',note);editingT=null;flashId=id;save();render();toast(`${id} sent for verification`)},
  startReject(id){if(rejecting)A.cancelReject();
    const el=document.querySelector(`[data-a=startReject][data-id="${id}"]`)?.closest('.tk-approve');
    rejecting=id;if(!el)return render();el.outerHTML=rejectBox(ticket(id));relayout();$('#rej-'+id)?.focus()},
  cancelReject(){const id=rejecting,el=$('#rej-'+id)?.closest('.tk-form');rejecting=null;
    if(!el)return render();el.outerHTML=approveBox(ticket(id));relayout()},
  approve(id){const b=document.querySelector(`.approve-big[data-id="${id}"]`);
    if(!b||matchMedia('(prefers-reduced-motion: reduce)').matches)return A.doApprove(id);
    if(b.classList.contains('filling'))return;
    b.classList.add('filling');b.disabled=true;
    setTimeout(()=>{b.querySelector('span').textContent='✓ Approved';b.classList.add('done')},650);
    setTimeout(()=>A.doApprove(id),1150)},
  doApprove(id){const t=ticket(id),c=course(t.courseId);
    t.closedAs=t.status===PV_DIS?'Cancelled':'Resolved';t.status=CLOSED;t.closedAt=Date.now();tlog(t,'Ticket closed',`Approved (${t.closedAs})`);
    const r=closeCycle(c);save();render();toast(`${id} closed`+(r?` · ${r}`:''))},
  reject(id){const t=ticket(id),n=$(`#rej-${id}`).value.trim();if(!n){$(`#rej-${id}`).focus();toast('Add rejection notes first');return}
    const dis=t.status===PV_DIS;rejecting=null;t.status='Retest Failed';t.rejection=n;tlog(t,dis?'Cancellation rejected':'Retest failed',n);flashId=id;save();render();toast(`${id} sent back to SELM`)},
  editCrit(id){const a=S.audits.find(x=>x.id===id),box=$('#ck-'+id);if(!a||!box)return;
    document.querySelector(`[data-a=editCrit][data-id="${id}"]`)?.setAttribute('hidden','');box.innerHTML=critEditor(a)},
  cancelCrit(id){const a=S.audits.find(x=>x.id===id);$('#ck-'+id).innerHTML=critChips(a);
    document.querySelector(`[data-a=editCrit][data-id="${id}"]`)?.removeAttribute('hidden')},
  saveCrit(id){const a=S.audits.find(x=>x.id===id);
    const next=CRITERIA.map((_,i)=>document.querySelector(`#ck-${id} input[name=e${i}]:checked`)?.value||a.checklist[i]);
    // open tickets mean the course still has a failing criterion
    if(!next.includes('No')&&openOf(a.courseId).length){$('#ckErr-'+id).textContent='Keep at least one No while tickets are open.';return}
    const diff=next.map((v,i)=>v!==a.checklist[i]?`${CRITERIA[i]}: ${a.checklist[i]} → ${v}`:'').filter(Boolean);
    if(diff.length){a.checklist=next;log({courseId:a.courseId,auditId:a.id,action:'Criteria updated',detail:diff.join('; ')});save();
      // refresh the edit trail under this audit in place
      const ae=$('#ae-'+id),html=editTrail(a);if(ae)ae.outerHTML=html;else $('#ck-'+id).closest('.iter').insertAdjacentHTML('beforeend',html);
      $('#ae-'+id)?.classList.add('fresh')}
    A.cancelCrit(id);toast(diff.length?`Criteria updated (${diff.length} change${diff.length>1?'s':''})`:'No changes')},
  toggleRecs(id){const b=document.querySelector(`[data-a=toggleRecs][data-id="${id}"]`),open=!openRecs.has(id);
    open?openRecs.add(id):openRecs.delete(id);b.closest('.recs').classList.toggle('open',open);b.closest('.recs').classList.add('reveal');b.textContent=open?b.dataset.on:b.dataset.off;relayout()},
  editPrice(id){const c=course(id);$('#priceBox').innerHTML=`<span class="price-edit">Pricing <input type="text" id="priceIn" inputmode="decimal" autocomplete="off" value="${c.price??''}" aria-label="Docebo pricing">
      <button class="btn primary sm" data-a="savePrice" data-id="${id}">Save</button><button class="btn sm" data-a="cancelPrice" data-id="${id}">Cancel</button><span class="err" id="priceErr"></span></span>`;
    const i=$('#priceIn');i.focus();i.select()},
  cancelPrice(id){$('#priceBox').innerHTML=priceView(course(id))},
  savePrice(id){const c=course(id),v=toPrice($('#priceIn').value),old=c.price??null;
    if(Number.isNaN(v)){$('#priceErr').textContent='Enter a number of 0 or more.';return}
    if(v!==old){c.price=v;log({courseId:id,action:'Pricing updated',detail:`${fmtPrice(old)} → ${fmtPrice(v)}`});save();toast('Pricing updated')}
    A.cancelPrice(id)},
  editAud(id){const c=course(id),cur=audList(c.audience);
    $('#audBox').innerHTML=`<span class="price-edit aud-edit">Audience ${AUDIENCES.map(a=>`<label class="aud-opt"><input type="checkbox" name="eAud" value="${a}"${cur.includes(a)?' checked':''}> ${a}</label>`).join('')}
      <button class="btn primary sm" data-a="saveAud" data-id="${id}">Save</button><button class="btn sm" data-a="cancelAud" data-id="${id}">Cancel</button><span class="err" id="audErr"></span></span>`},
  cancelAud(id){$('#audBox').innerHTML=audView(course(id))},
  saveAud(id){const c=course(id),v=[...document.querySelectorAll('input[name=eAud]:checked')].map(x=>x.value).join(', '),old=c.audience||'';
    if(!v){$('#audErr').textContent='Choose at least one.';return}
    if(v!==old){c.audience=v;log({courseId:id,action:'Audience updated',detail:`${old||'—'} → ${v}`});save();toast('Audience updated')}
    A.cancelAud(id)},
  fold(k){fold[k]=!fold[k];try{localStorage.setItem(FOLD_KEY,JSON.stringify(fold))}catch(e){}
    $('#fold-'+k).classList.toggle('shut',!!fold[k]);$(`.fold-btn[data-id=${k}]`).setAttribute('aria-expanded',!fold[k])},
  rToday(){rptFrom=rptTo=dayStart(Date.now());render()},
  rWeek(){rptFrom=dayStart(Date.now()-6*DAY);rptTo=dayStart(Date.now());render()},
};

document.addEventListener('click',e=>{
  const el=e.target.closest('[data-a]');if(!el)return;
  const a=el.dataset.a;
  if(A[a]){e.preventDefault();A[a](el.dataset.id)}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&$('#overlay').innerHTML)closeOv();
  // Escape also folds an open ticket form back to its Update button, without saving
  else if(e.key==='Escape'&&editingT)A.cancelT();
  if(e.target.id==='priceIn'&&(e.key==='Enter'||e.key==='Escape')){e.preventDefault();A[e.key==='Enter'?'savePrice':'cancelPrice'](e.target.closest('.price-edit').querySelector('[data-a=savePrice]').dataset.id)}
  if(e.key==='Enter'&&e.target.matches('tr.click'))A.open(e.target.dataset.id);
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.name&&/^c\d$/.test(t.name)){draft.crit[+t.name.slice(1)]=t.value;$('#formErr').textContent='';renderIssues()}
  else if(t.name&&/^e\d$/.test(t.name))t.closest('.crit-row').classList.toggle('no',t.value==='No');
  else if(t.name==='fAud'){draft.aud=[...document.querySelectorAll('input[name=fAud]:checked')].map(x=>x.value);$('#formErr').textContent=''}
  else if(t.id==='userSel'){user=USERS.find(u=>u.id===t.value);closeOv();render();toast(`Now ${user.name} (${user.role})`)}
  else if(t.id==='statusF'){filter=t.value||'all';refreshRows()}
  else if(['catFilter','auditedF'].includes(t.id)){
    ({catFilter:v=>catFilter=v,auditedF:v=>auditedF=v})[t.id](t.value);
    t.classList.toggle('on',!!t.value);refreshRows()}
  else if(t.id==='rFrom'){rptFrom=fromInput(t.value);render()}
  else if(t.id==='rTo'){rptTo=fromInput(t.value);render()}
  else if(t.id?.startsWith('iCat'))draft.issues[+t.dataset.i].cat=t.value;
});
document.addEventListener('input',e=>{
  const t=e.target;
  // pricing boxes are plain text boxes that keep only digits and one decimal point (2 places)
  if(t.id==='fPrice'||t.id==='priceIn'){const v=t.value.replace(/[^\d.]/g,'').replace(/(\..*)\./g,'$1').replace(/(\.\d{2})\d+/,'$1');if(v!==t.value)t.value=v}
  if(t.id?.startsWith('iDesc'))draft.issues[+t.dataset.i].desc=t.value;
  else if(t.id==='fPrice'){draft.price=t.value;$('#formErr').textContent=''}
  // only refresh the table body so the search box keeps focus, scroll and IME composition
  else if(t.id==='search'){search=t.value;$('#courseRows').innerHTML=courseRows()}
  else if(t.id==='histQ'){histQ=t.value;$('#histRows').innerHTML=histRows()}
});
document.addEventListener('submit',e=>{
  if(e.target.id==='auditForm'){e.preventDefault();submitAudit()}
  else if(e.target.id==='addForm'){e.preventDefault();A.saveCourse()}
});

/* ---------- boot ---------- */
S=load(); if(!S||!S.seq)fresh();
// older data stored pricing as free text; keep it only if it reads as a number
[...S.courses,...S.audits].forEach(x=>{if(typeof x.price==='string'){const p=toPrice(x.price);x.price=Number.isNaN(p)?null:p}});
// older data only recorded passed audits as "last audited"; take the latest audit of any result
S.courses.forEach(c=>{const a=S.audits.filter(x=>x.courseId===c.id).sort((x,y)=>y.date-x.date)[0];
  if(a&&(!c.lastAudited||a.date>c.lastAudited)){c.lastAudited=a.date;c.lastAuditor=a.auditor}});
// an unfinished audit form does not survive a reload, so release its lock
S.courses.forEach(c=>{if(c.lockedBy){c.lockedBy=null;c.lockedAt=null;if(!openOf(c.id).length&&c.auditorStatus==='In Progress')c.auditorStatus='Pending'}});
$('#userSel').innerHTML=USERS.map(u=>`<option value="${u.id}">${u.name} · ${u.role}</option>`).join('');
render();
})();
