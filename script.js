(function(){
const DAY=864e5, KEY='course-audit-demo-v4';
const CRITERIA=['Search on Dell Learning works','Course Description (PDF) works','Enrollment works','Launch URL works',
  'Course launches on first attempt','No error page','No access denied','Completion recorded'];

const answers=i=>i<3?['Yes','N/A','No']:['Yes','No']; // only H–J can be N/A
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
const STAGES=[['all','All'],['audit','Pending audit'],['issues','Unhealthy'],['verify','Ready to revalidate'],['healthy','Healthy'],['disc','Discontinued']];

let S, view={name:'dashboard'}, user=USERS[0], filter='all', myF=false, catFilter='', tkF='', auditedF='', openRecs=new Set(), rejecting=null, search='', histQ='', rptFrom, rptTo, draft=null, page=1, rowTotal=0;

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
// two 7-day clocks: raised -> escalated, then escalated -> fix date set
const slaFrom=t=>t.status==='New'?t.createdAt:(t.status==='Escalated'||t.status==='Retest Failed')&&!t.fixDate?t.escalatedAt:null;
const isOverdue=t=>{const s=slaFrom(t);return !!s&&Date.now()-s>7*DAY};
// a course waiting for audit also has 7 days, counted from when it was added, restored or queued for re-audit
const pendingSince=c=>Math.max(c.createdAt||0,...S.logs.filter(l=>l.courseId===c.id&&['Course registered','Course restored','Re-audit queued'].includes(l.action)).map(l=>l.ts));
const auditLate=c=>stage(c)==='audit'&&Date.now()-pendingSince(c)>7*DAY;
function auditFlag(c){if(stage(c)!=='audit')return '';const d=daysSince(pendingSince(c));
  if(auditLate(c))return `<span class="aud-sla late">${d}d not audited</span>`;
  return `<span class="aud-sla">${7-d>0?`${7-d}d left to audit`:'Last day to audit'}</span>`}
// fix date tracking: how often it moved and whether it was missed
const movesOf=t=>S.logs.filter(l=>l.ticketId===t.id&&l.action==='Fix date changed').length;
const etaMissed=t=>t.fixDate&&WORKING.includes(t.status)?Math.max(0,daysSince(t.fixDate)):0;
const tkFlag=t=>isOverdue(t)?slaLate(t):etaMissed(t)?`ETA missed ${etaMissed(t)}d`:'';
const slaLate=t=>`${daysSince(slaFrom(t))}d ${t.status==='New'?'not escalated':'no fix date'}`;
function slaLeft(t){const s=slaFrom(t);if(!s||isOverdue(t))return '';const d=7-daysSince(s),what=t.status==='New'?'to escalate':'to set a fix date';return d>0?`${d}d left ${what}`:`last day ${what}`}
const isAud=()=>user.role==='Auditor', isSelm=()=>user.role==='SELM', isOwner=()=>user.role==='Course Owner';
// a ticket belongs to the SELM who escalated it; other SELMs can only view it
const mine=t=>!t.escalatedBy||t.escalatedBy===user.name;
// active courses that look like the same one: same code, or the same name ignoring case and extra spaces
const normName=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
const sameCourses=c=>S.courses.filter(x=>x.id!==c.id&&x.health!=='Discontinued'&&(x.code.toLowerCase()===c.code.toLowerCase()||normName(x.name)===normName(c.name)));
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
    'Escalated':'t-info','In Progress':'t-acc','Ready to revalidate':'t-pv',[PV_RES]:'t-pv',[PV_DIS]:'t-pv','Discontinued':'t-gray'})[s]||'t-gray';
}
const pill=s=>`<span class="pill ${tone(s)}">${esc(s)}</span>`;
const healthLabel=c=>stage(c)==='verify'?'Ready to revalidate':c.health;
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
  if(editingT&&mine(ticket(editingT)))stashForm(editingT);
  if(view.name==='course'){animTree=animatedFor!==view.id;animatedFor=view.id}else{animTree=false;animatedFor=null}
  const cur=view.name==='course'?'courses':view.name==='auditor'?'team':view.name;
  $('#tabs').innerHTML=[['dashboard','Dashboard'],['courses','Courses'],['team','Team']] // History tab hidden for now; vHistory() is kept
    .map(([k,l])=>`<button class="tab" data-a="go" data-id="${k}" aria-current="${cur===k}">${l}</button>`).join('');
  $('#view').innerHTML=({courses:vCourses,course:vCourse,dashboard:vDash,history:vHistory,team:vTeam,auditor:vAuditor})[view.name]();
  if(view.name==='course'&&draft)renderIssues();
  if(enterAnim){const v=$('#view');v.classList.remove('enter');void v.offsetWidth;v.classList.add('enter');enterAnim=false}
  rowAnim=false;flashId=null;
  if(animTree)setTimeout(()=>$('#tree')?.classList.remove('anim'),1600);
  paintFocus();
}
// focus view: the ticket card itself moves into a large panel and back, so forms keep what was typed and every action works as usual;
// its place on the page is held, and a redraw simply moves the fresh card in again
let focusT=null;
function paintFocus(){
  const host=$('#focusHost');if(!host)return;
  const card=focusT&&document.querySelector(`#view .tk[data-tid="${focusT}"]`);
  if(!card){focusT=null;host.innerHTML='';return}
  const c=course(ticket(focusT).courseId);
  if(!host.firstChild)host.innerHTML=`<div class="fc-back" data-a="unfocusT"></div><div class="fc-box" role="dialog" aria-modal="true"><div class="fc-head"><span class="fc-course"></span><button type="button" class="x" data-a="unfocusT" aria-label="Close">×</button></div><div class="fc-body"></div></div>`;
  host.querySelector('.fc-course').innerHTML=`<span class="mono muted">${esc(c.code)}</span> ${esc(c.name)}`;
  card.parentElement.style.minHeight=card.offsetHeight+'px';
  host.querySelector('.fc-body').replaceChildren(card);
}
function closeFocus(){
  const id=focusT,host=$('#focusHost'),card=host?.querySelector('.tk');focusT=null;if(!id)return;
  const slot=document.querySelector(`#view [data-slot="${id}"]`);
  if(slot&&card){slot.style.minHeight='';slot.appendChild(card)}
  host.innerHTML='';
}
let draftStart='', leaveNext=null;
function leaveGuard(next,sameCourse){if(!draft||sameCourse||JSON.stringify(draft)===draftStart)return false;leaveNext=next;
  openModal(`<div class="ov-h"><h3>Leave this audit?</h3><button class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="ov-b"><p style="margin:0">What you entered in this audit hasn't been submitted and will be lost.</p></div>
    <div class="ov-f"><button class="btn" data-a="close">Keep auditing</button><button class="btn danger" data-a="leaveAudit">Leave audit</button></div>`);return true}
function go(name,id){
  if(leaveGuard(()=>go(name,id),name==='course'&&id===draft?.courseId))return;
  // leaving the page abandons an unfinished audit: the course goes back to how it was and the next audit starts fresh
  if(draft&&!(name==='course'&&id===draft.courseId)){const c=course(draft.courseId);if(c){c.lockedBy=null;c.lockedAt=null;if(!draft.re)c.auditorStatus='Pending'}draft=null;save()}
  if(editingT)stashForm(editingT);
  closeFocus();view={name,id};editingT=null;enterAnim=true;rowAnim=true;render();window.scrollTo(0,0)}

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
  </tbody></table></div><div class="pager" id="pager">${pagerHtml()}</div>`;
}

const TK_OPTS=[['New','New'],['Escalated','Escalated'],['In Progress','In Progress'],['Retest Failed','Retest Failed'],['verify','Waiting for verification'],['closed','Closed']];
const tkIs=(t,v)=>v==='open'?t.status!==CLOSED:v==='verify'?t.status===PV_RES||t.status===PV_DIS:v==='closed'?t.status===CLOSED:t.status===v;
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
function refreshRows(keepPage){
  if(!keepPage)page=1; // any filter change starts again from the first page
  document.querySelectorAll('.fchip[data-a=filter]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.id===filter));
  $('.fchip.mine')?.setAttribute('aria-pressed',myF);
  document.querySelectorAll('.lchip').forEach(b=>b.setAttribute('aria-pressed',b.dataset.id===tkF));
  const sf=$('#statusF');if(sf){sf.value=filter==='all'?'':filter;sf.classList.toggle('on',filter!=='all')}
  // remember where each row was and what was faded, then let the new rows slide and fade from there
  const body=$('#courseRows'),wrap=body.closest('.tbl-wrap'),h0=wrap.offsetHeight,prev={};
  body.querySelectorAll('tr[data-id]').forEach(tr=>{prev[tr.dataset.id]={top:tr.getBoundingClientRect().top,dim:tr.classList.contains('dim'),
    other:new Set([...tr.querySelectorAll('.ci.other')].map(ci=>ci.title))}});
  body.innerHTML=courseRows();$('#pager').innerHTML=pagerHtml();
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
const PAGE=10;
// "Showing 11–20 of 23" and page buttons; nothing when everything fits on one page
function pagerHtml(){
  const pages=Math.ceil(rowTotal/PAGE);if(pages<=1)return '';
  const from=(page-1)*PAGE+1,to=Math.min(page*PAGE,rowTotal);
  return `<span class="muted small">Showing ${from}–${to} of ${rowTotal}</span><div class="pg">
    <button class="btn sm" data-a="pg" data-id="${page-1}"${page===1?' disabled':''}>‹ Prev</button>
    ${Array.from({length:pages},(_,i)=>i+1).map(n=>`<button class="btn sm${n===page?' on':''}" data-a="pg" data-id="${n}" aria-current="${n===page}">${n}</button>`).join('')}
    <button class="btn sm" data-a="pg" data-id="${page+1}"${page===pages?' disabled':''}>Next ›</button></div>`;
}
function courseRows(){
  const q=search.trim().toLowerCase();
  const list=S.courses.filter(c=>(filter==='all'?stage(c)!=='disc':stage(c)===filter)&&(!q||(c.code+' '+c.name).toLowerCase().includes(q))
      &&auditedOk(c)&&(!(catFilter||myF&&isSelm())||shownOf(c).some(tkKeep)))
    .sort((a,b)=>(tkF?shownOf(b).some(tkHit)-shownOf(a).some(tkHit):0)||(nextStep(b)[1]-nextStep(a)[1])||b.createdAt-a.createdAt);
  // one page of PAGE rows at a time
  rowTotal=list.length;page=Math.min(page,Math.max(1,Math.ceil(list.length/PAGE)));
  const pageList=list.slice((page-1)*PAGE,page*PAGE);
  return `  ${list.length?pageList.map((c,i)=>{const [txt,me]=nextStep(c), shown=shownOf(c), hit=!tkF||shown.some(tkHit), fade=hit&&(catFilter||tkF||myF&&isSelm());return `<tr class="click${hit?'':' dim'}${rowAnim?' row-in':''}${c.id===flashId?' flash':''}" style="--i:${Math.min(i,12)}" data-a="open" data-id="${c.id}" tabindex="0">
    <td><div class="cname"><span class="mono">${esc(c.code)}</span><b>${esc(c.name)}</b></div></td>
    <td>${pill(healthLabel(c))}${auditFlag(c)}</td>
    <td>${shown.length?`<div class="catlist">${shown.map(t=>{const done=t.status===CLOSED,dis=t.closedAs==='Cancelled'||t.closedAs==='Discontinued';
      return `<div class="ci${done?' closed':''}${fade&&!tkHit(t)?' other':''}" title="${t.id}">${done?`<span class="dot chk${dis?' dis':''}">✓</span>`:`<span class="dot ${tone(t.status)}"></span>`}<span class="cn">${esc(t.category)}</span>
      ${done?`<span class="cs ${dis?'':'ok'}">${dis?esc(t.closedAs):'Approved'}</span>`:`<span class="cs${isOverdue(t)||etaMissed(t)?' late':''}">${esc(shortStatus(t.status))}${tkFlag(t)?` · ${tkFlag(t)}`:''}</span>`}</div>`}).join('')}</div>`:'<span class="muted">—</span>'}</td>
    <td class="mono nowrap">${fmtD(c.lastAudited)}</td>
    <td><span class="next${me?' me':''}">${esc(txt)}</span></td></tr>`}).join('')
  :`<tr><td colspan="5" class="empty">${S.courses.length?'No courses match.':'No courses yet. Add the first one with “+ Add course”.'}</td></tr>`}`;
}

/* ---------- course page ---------- */
// changes to the course code, name and type, newest first
function infoLog(c){const ls=S.logs.filter(l=>l.courseId===c.id&&l.action==='Course info updated').reverse(),k='info-'+c.id;if(!ls.length)return '';
  return `<div class="panel"><h3>Course info changes (${ls.length})</h3><div class="info-log">${ls.slice(0,listOpen.has(k)?ls.length:LIST_MAX).map(l=>`<div><span class="mono muted small">${fmtDT(l.ts)}</span> <b>${esc(l.actor)}</b> <span>${esc(l.detail)}</span></div>`).join('')}</div>${moreBtn(ls.length,k)}</div>`}
function vCourse(){
  const c=course(view.id); if(!c){view={name:'courses'};return vCourses()}
  const st=stage(c), open=openOf(c.id), closed=ticketsOf(c.id).filter(t=>t.status===CLOSED);
  // My tickets uses the same switch as the course list; here it fades the other tickets and hides none
  const myOpen=open.filter(t=>t.escalatedBy===user.name), onlyMine=myF&&isSelm();
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
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${pill(healthLabel(c))}${st==='audit'&&c.health==='Healthy'?pill('Re-audit queued'):''}${auditFlag(c)}${discInfo(c)}</div></div>
      <div class="chead-act">${isOwner()&&st!=='disc'?`<button class="btn" data-a="editCourse" data-id="${c.id}">Edit course</button>`:''}${btn}${(isAud()||isOwner())&&st!=='disc'?(!runs.length&&!ticketsOf(c.id).length?(c.lockedBy?'':`<button class="btn danger" data-a="delCourse" data-id="${c.id}">Delete course</button>`)
        :`<button class="btn danger" data-a="discCourse" data-id="${c.id}">Discontinue course</button>`):''}${isAud()&&st==='disc'?`<button class="btn" data-a="restoreCourse" data-id="${c.id}">Restore course</button>`:''}</div></div>
    ${stats}</div>
  ${draft&&draft.courseId===c.id&&c.lockedBy===user.name?`<div class="expander open done">${auditForm(c)}</div>`:''}
  ${open.length||closed.length?`<div class="panel">${open.length?`<div class="panel-h"><h3>Open tickets (${open.length})</h3>${isAud()&&c.cycleAuditId?`<button class="btn sm" data-a="addTk" data-id="${c.id}">+ Add ticket</button>`:''}${isSelm()?`<button class="fchip mine" data-a="toggleMine" aria-pressed="${myF}">My tickets <b>${myOpen.length}</b></button>`:''}</div>
    <div class="tree${animTree?' anim':''}" id="tree"><div class="tree-kids">${open.map((t,i)=>`<div class="tree-kid${onlyMine&&t.escalatedBy!==user.name?' faded':''}" data-slot="${t.id}" style="--i:${i}">${ticketRow(c,t,st)}</div>`).join('')}</div></div>`:''}
    ${closed.length?`<details><summary>Closed tickets (${closed.length})</summary><div class="tree-kids closed-kids">${closed.map(t=>`<div class="tree-kid" data-slot="${t.id}">${ticketRow(c,t,st)}</div>`).join('')}</div></details>`:''}</div>`:''}
  ${infoLog(c)}
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
// pricing and audience come from the audit form; on the card they can only be corrected while tickets are being fixed
const canEditInfo=c=>canPrice()&&c.health==='Unhealthy'&&!c.lockedBy;
// redraw the edit trail under the current audit in place, opened and lit up so the new change is seen
function refreshTrail(c){const a=S.audits.find(x=>x.id===c.cycleAuditId),iter=a&&$('#ck-'+a.id)?.closest('.iter');if(!iter)return;
  openEdits.add(a.id);iter.querySelector('.aedit')?.remove();iter.querySelector('.ainfo').insertAdjacentHTML('afterend',editTrail(a));iter.querySelector('.aedit')?.classList.add('fresh')}
const refreshInfo=c=>{if($('#priceBox'))$('#priceBox').innerHTML=priceView(c);if($('#audBox'))$('#audBox').innerHTML=audView(c)};
const priceView=c=>`Pricing <b>${fmtPrice(c.price)}</b>${canEditInfo(c)?` <button class="link small" data-a="editPrice" data-id="${c.id}">Edit</button>`:''}`;
const audView=c=>`Audience <b>${esc(c.audience||'—')}</b>${canEditInfo(c)?` <button class="link small" data-a="editAud" data-id="${c.id}">Edit</button>`:''}`;
// dashboard breakdown cards can be folded away; the choice is remembered per browser
const FOLD_KEY='course-audit-fold';
let fold=(()=>{try{return JSON.parse(localStorage.getItem(FOLD_KEY))||{}}catch(e){return {}}})();
const foldBtn=k=>`<button class="fold-btn" data-a="fold" data-id="${k}" aria-expanded="${!fold[k]}"><span class="fl"><span>Hide details</span><span>Show details</span></span><i>▾</i></button>`;
// pricing and audience changes belong to the audit round they were made in; older logs without
// an auditId fall back to the latest audit of that course made before the change
const INFO_EDITS={'Pricing updated':'Pricing','Audience updated':'Audience'};
const roundOf=l=>l.auditId||S.audits.filter(a=>a.courseId===l.courseId&&a.date<=l.ts).sort((x,y)=>y.date-x.date)[0]?.id;
const editText=l=>INFO_EDITS[l.action]?`${INFO_EDITS[l.action]} ${l.detail}`:l.detail;
// who changed this audit's answers, pricing or audience afterwards, newest first; the changes unfold under the summary line
function editTrail(a){
  const ed=S.logs.filter(l=>(l.action==='Criteria updated'||l.action==='Ticket removed')&&l.auditId===a.id||INFO_EDITS[l.action]&&l.courseId===a.courseId&&roundOf(l)===a.id).reverse();if(!ed.length)return '';
  const open=openEdits.has(a.id),last=ed[0];
  return `<div class="aedit${open?' open':''}" id="ae-${a.id}"><div class="aedit-h">✎ Edited ${ed.length} time${ed.length>1?'s':''} · last by ${esc(last.actor)}, ${fmtDT(last.ts)}
    <button type="button" class="link small" data-a="toggleEdits" data-id="${a.id}">${open?'Hide changes':'Show changes'}</button></div>
    <ol>${ed.map(l=>`<li><span class="mono">${fmtDT(l.ts)}</span><b>${esc(l.actor)}</b><span class="chg-list">${editText(l).split('; ').map(esc).join('<br>')}</span></li>`).join('')}</ol></div>`;
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
    <div class="tk-btns"><span class="err" id="ckErr-${a.id}" style="margin-right:auto"></span><button class="btn primary sm" data-a="saveCrit" data-id="${a.id}">Save criteria</button><button type="button" class="btn sm tk-back" data-a="cancelCrit" data-id="${a.id}" aria-label="Back without saving" title="Back without saving"><span aria-hidden="true">←</span> Back</button></div></div>`;
}
const tkFoot=h=>`<div class="tk-btns tk-act">${h}</div>`;
const waitText=t=>t.status==='New'?'Waiting for SELM':WORKING.includes(t.status)?`With ${esc(t.escalatedBy||'SELM')}`:'Waiting for auditor';
const approveBox=t=>`<div class="tk-btns tk-act tk-approve"><button class="btn okb sm approve-big" data-a="approve" data-id="${t.id}"><span>${t.status===PV_DIS?'Approve cancel':'Approve'}</span></button><button class="btn sm" data-a="startReject" data-id="${t.id}">Reject</button></div>`;
const rejectBox=t=>`<div class="tk-form"><label class="field grow"><span class="req">Reason for rejecting</span><input type="text" id="rej-${t.id}" placeholder="What still fails"></label>
      <div class="tk-btns"><button class="btn danger sm" data-a="reject" data-id="${t.id}">Send back to SELM</button><button type="button" class="btn sm tk-back" data-a="cancelReject" aria-label="Back without sending" title="Back without sending"><span aria-hidden="true">←</span> Back</button></div></div>`;
// redraw the page, then let each ticket card that is still there slide from where it was to where it is now
function flipRender(closedPing){
  const pos={};document.querySelectorAll('.tree-kid .tk[data-tid]').forEach(k=>pos[k.dataset.tid]=k.parentElement.getBoundingClientRect());
  render();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  document.querySelectorAll('.tree-kid .tk[data-tid]').forEach(k=>{const p=pos[k.dataset.tid];if(!p)return;
    const r=k.parentElement.getBoundingClientRect(),dx=p.left-r.left,dy=p.top-r.top;
    if(dx||dy)k.parentElement.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'none'}],{duration:340,easing:'cubic-bezier(.2,.7,.3,1)'})});
  if(closedPing)document.querySelector('.panel details>summary')?.classList.add('ping');
}
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
  if(!open)stashForm(id);
  const card=document.querySelector(`.tk[data-tid="${id}"]`),part=card?.querySelector('.tk-act,.tk-form');if(!part)return swapCard(id);
  const h0=card.offsetHeight;part.outerHTML=open?selmForm(ticket(id)):selmAct(ticket(id));card.querySelector('.tk-act,.tk-form').classList.add('enter');glide(card,h0);return card;
}
// while a ticket is still New (no SELM has touched it) the auditor can correct or remove it
const audAct=t=>`<div class="tk-btns tk-act tk-aud"><button class="btn sm" data-a="editTk" data-id="${t.id}">Edit</button><button class="btn danger sm" data-a="rmTk" data-id="${t.id}">Remove</button></div>`;
const audEdit=t=>`<div class="tk-form tk-aud"><label class="field"><span>Category</span><select id="ekCat-${t.id}">${CATS.map(x=>`<option${x===t.category?' selected':''}>${x}</option>`).join('')}</select></label>
      <label class="field grow"><span class="req">What is wrong</span><input type="text" id="ekDesc-${t.id}" value="${esc(t.detail)}"></label>
      <div class="tk-btns"><button class="btn primary sm" data-a="saveTk" data-id="${t.id}">Save</button><button type="button" class="btn sm tk-back" data-a="cancelTk" data-id="${t.id}" aria-label="Back without saving" title="Back without saving"><span aria-hidden="true">←</span> Back</button></div>
      <span class="err" id="ekErr-${t.id}"></span></div>`;
// swap the auditor's part at the bottom of a ticket card, letting the card glide to its new height
function swapAud(id,html){const card=document.querySelector(`.tk[data-tid="${id}"]`),part=card?.querySelector('.tk-aud');if(!part)return swapCard(id);
  const h0=card.offsetHeight;part.outerHTML=html;card.querySelector('.tk-aud').classList.add('enter');glide(card,h0);return card}
// a double click on Save must not land on the Edit or Update button that takes its place
const justSaved={};
const formDrafts={}, draftKey=id=>`${user.name}:${id}`;
function stashForm(id){const f=$(`#fix-${id}`),n=$(`#note-${id}`),t=ticket(id);if(!f||!n||!t)return;
  const changed=f.value!==(t.fixDate?toInput(t.fixDate):'');
  if(n.value.trim()||changed)formDrafts[draftKey(id)]={fix:f.value,note:n.value};else delete formDrafts[draftKey(id)]}
const selmAct=t=>`<div class="tk-btns tk-act"><button class="btn updb sm" data-a="openT" data-id="${t.id}">Update <span class="arr" aria-hidden="true">→</span></button>${formDrafts[draftKey(t.id)]?'<span class="tk-unsaved">Unsaved changes</span>':''}</div>`;
// an escalation can be undone by the same SELM until a fix date is set;
// the first escalation's date is kept, so escalating again can't restart the 7-day clock
const canUndoEsc=t=>t.status==='Escalated'&&!t.fixDate&&mine(t);
// checks the fix date and note typed in the form; shows the problem on the form and returns false
function fixFormOk(t,resolving){const id=t.id,fix=fromInput($(`#fix-${id}`).value),note=$(`#note-${id}`).value.trim();
  const stop=(msg,el)=>{$(`#fixErr-${id}`).textContent=msg;$(`#${el}-${id}`).focus();return false};
  const moved=t.fixDate&&(fix?toInput(fix):'')!==toInput(t.fixDate);
  if(moved&&!fix)return stop("A fix date can't be removed. Pick a new date.",'fix');
  // 4. a new date can't be in the past; a past date already saved can stay while a note is added
  if(fix&&fix<dayStart(Date.now())&&(!t.fixDate||moved))return stop('Pick today or a later date.','fix');
  if(resolving&&!fix)return stop('Set a tentative fix date before resolving.','fix');
  if(moved&&!note)return stop('Add a note with the reason for changing the fix date.','note');
  $(`#fixErr-${id}`).textContent='';return true}
const selmForm=t=>`<div class="tk-form">
      <label class="field"><span>Tentative fix date</span><input type="date" id="fix-${t.id}" min="${toInput(Date.now())}" value="${formDrafts[draftKey(t.id)]?.fix??(t.fixDate?toInput(t.fixDate):'')}"></label>
      <label class="field grow"><span>Note</span><input type="text" id="note-${t.id}" placeholder="Progress, owner, or reason to cancel" value="${esc(formDrafts[draftKey(t.id)]?.note||'')}"></label>
      <span class="err" id="fixErr-${t.id}"></span>
      <div class="tk-btns"><button class="btn sm" data-a="saveT" data-id="${t.id}">Save</button><button class="btn okb sm" data-a="resolveT" data-id="${t.id}">Resolved</button><button class="btn danger sm" data-a="discT" data-id="${t.id}">Cancel</button>${canUndoEsc(t)?`<button type="button" class="btn sm" data-a="undoEsc" data-id="${t.id}" title="Put it back to New for any SELM"><span aria-hidden="true">↶</span> Undo escalate</button>`:''}<button type="button" class="btn sm tk-back" data-a="cancelT" aria-label="Back without saving" title="Back without saving (Esc)"><span aria-hidden="true">←</span> Back</button></div></div>`;
// shown only in the focus view: the facts that matter
function focusSummary(t){
  const moves=movesOf(t), esc1=S.logs.find(l=>l.ticketId===t.id&&l.action==='Escalated'), who=S.audits.find(a=>a.id===t.auditId)?.auditor;
  const sub=[moves?`Moved ${moves}×${t.firstFix?` · first was ${fmtD(t.firstFix)}`:''}`:'',slaLeft(t)].filter(Boolean).join(' · ');
  const kv=(k,v)=>`<span>${k}</span><span>${v}</span>`;
  return `<div class="fc-sum"><div class="fc-eta"><span>Tentative fix date</span><b>${t.fixDate?fmtD(t.fixDate):'Not set'}</b>${sub?`<small>${esc(sub)}</small>`:''}</div>
    <div class="fc-kv">${kv('Owner',esc(t.escalatedBy||'—'))}${kv('Raised',`${fmtD(t.createdAt)}${who?` by ${esc(who)}`:''}`)}${t.escalatedAt&&t.status!=='New'?kv('Escalated',`${fmtD(t.escalatedAt)}${esc1?` by ${esc(esc1.actor)}`:''}`):''}${t.closedAt?kv('Closed',`${fmtD(t.closedAt)} · ${esc(t.closedAs||'')}`):''}</div></div>`;
}
function ticketRow(c,t,st){
  const pv=t.status===PV_RES||t.status===PV_DIS;
  let note='';
  if(t.status==='Retest Failed'&&t.rejection)note=`<div class="tk-note bad"><b>Auditor:</b> ${esc(t.rejection)}</div>`;
  else if(t.status===PV_DIS&&t.justification)note=`<div class="tk-note"><b>Reason to cancel:</b> ${esc(t.justification)}</div>`;
  let below='';
  if(t.status===CLOSED)below='';
  else if(isSelm()&&t.status==='New')below=tkFoot(`<button class="btn escb sm" data-a="escalate" data-id="${t.id}"><span aria-hidden="true">↑</span> Escalate</button>`);
  else if(isSelm()&&WORKING.includes(t.status)&&mine(t))below=editingT===t.id?selmForm(t):selmAct(t);
  else if(isSelm()&&WORKING.includes(t.status)&&!mine(t))below=tkFoot(`<span class="muted small">With ${esc(t.escalatedBy)}</span><button class="btn sm tk-undo" data-a="takeOver" data-id="${t.id}"><span aria-hidden="true">⇄</span> Take over</button>`);
  else if(isSelm()&&pv&&mine(t))below=tkFoot(`<span class="muted small">Waiting for auditor</span><button class="btn sm tk-undo" data-a="takeBack" data-id="${t.id}"><span aria-hidden="true">↶</span> Take back</button>`);
  else if(isAud()&&t.status==='New')below=audAct(t);
  else if(isAud()&&pv)below=rejecting===t.id?rejectBox(t):approveBox(t);
  else below=tkFoot(`<span class="muted small">${waitText(t)}</span>`);
  const eta=t.status===CLOSED?`Closed ${fmtD(t.closedAt)} · ${t.closedAs}`:t.fixDate?`ETA ${week(t.fixDate)} · ${fmtD(t.fixDate)}`:'ETA TBD';
  return `<div class="tk${t.id===flashId?' flash':''}" data-tid="${t.id}"><div class="tk-main">
    <div class="tk-top"><span class="mono muted">${t.id}</span><b>${esc(t.category)}</b><span class="st ${tone(t.status)}" title="${esc(t.status)}"><i></i>${esc(shortStatus(t.status))}</span>
      ${isOverdue(t)?`<span class="late">${slaLate(t)}</span>`:etaMissed(t)?`<span class="late">ETA missed ${etaMissed(t)}d</span>`:''}<span class="tk-eta">${eta}</span><button type="button" class="tk-expand" data-a="focusT" data-id="${t.id}" aria-label="Expand ${t.id}" title="Expand"><span aria-hidden="true">⤢</span></button></div>
    <div class="tk-dates">Raised ${fmtD(t.createdAt)}${slaLeft(t)?` · ${slaLeft(t)}`:''}${movesOf(t)?` · Moved ${movesOf(t)}×${t.firstFix?`, first ETA ${fmtD(t.firstFix)}`:''}`:''}</div>
    <div class="tk-desc">${esc(t.detail)}</div>${note}${records(t)}${focusSummary(t)}</div>
    ${below}</div>`;
}

// every action on a ticket, newest first; older entries fold away after the first 3,
// and a closed ticket hides its whole record list until asked
// stored action names stay as they are; on screen every row reads as a short past-tense step
const REC_LABEL={'Ticket created':'Created','Edited by auditor':'Edited','Status → In Progress':'In Progress','Ticket closed':'Closed',
  'Proposed cancellation':'Cancel requested','Proposed discontinuation':'Cancel requested','Cancellation rejected':'Cancel rejected',
  'Discontinuation rejected':'Cancel rejected','Retest failed':'Rejected','Note added':'Note'};
const REC_QUIET=new Set(['Sent for auditor verification','Fix date saved']); // details that only repeat the action
const recDetail=l=>{const d=(l.detail||'').replace(/ · by the auditor$/,'');return REC_QUIET.has(d)?'':d};
function records(t){
  const recs=S.logs.filter(l=>l.ticketId===t.id).reverse(); // logs are stored oldest first
  // a ticket added after the audit already has its own first row; others start with the audit that raised them
  if(!recs.some(l=>l.action==='Added after audit'))recs.push({ts:t.createdAt,actor:S.audits.find(a=>a.id===t.auditId)?.auditor||'',action:'Ticket created',detail:''});
  const closed=t.status===CLOSED, keep=closed?0:3;
  // time · step · person on one line, any detail on the line below; the name shows only where the person changes
  const row=(l,i)=>{const d=recDetail(l);return `<li${i>=keep?' class="old"':''}><span class="mono">${fmtDT(l.ts)}</span><b>${esc(REC_LABEL[l.action]||l.action)}</b>${l.actor&&l.actor!==recs[i-1]?.actor?`<i>${esc(l.actor)}</i>`:''}${d?`<span class="rd">${esc(d)}</span>`:''}</li>`};
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
      <fieldset class="aud"><legend>Catalog audience</legend><div class="aud-opts">${AUDIENCES.map(a=>`<label class="aud-opt"><input type="checkbox" name="fAud" value="${a}"${d.aud.includes(a)?' checked':''}> ${a}</label>`).join('')}</div></fieldset>
    </div>`}
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="sec-label">Criteria <span class="auto-yes" id="autoYes"></span></span><button type="button" class="btn sm" data-a="markAllYes">All Yes</button></div>
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
  const blank=draft.crit.filter(v=>!v).length;if($('#autoYes'))$('#autoYes').textContent=anyNo&&blank?`· ${blank} unanswered will be saved as Yes`:'';
  // with no No the box stays in place but locked, so the auditor still sees where issues are written
  const list=draft.issues.length?draft.issues:[{desc:'',cat:''}],off=anyNo?'':' disabled';
  box.className='issues'+(anyNo?'':' off');
  box.innerHTML=`<div class="sec-label">${anyNo?'Issues · each one becomes a ticket':'Issues · mark a criterion No to add one'}</div>`+list.map((x,i)=>`<div class="issue"><div class="issue-h"><span>Issue ${i+1}</span>${anyNo&&list.length>1?`<button type="button" class="btn sm" data-a="rmIssue" data-id="${i}">Remove</button>`:''}</div>
      <label class="field"><span class="req">What is wrong</span><textarea id="iDesc${i}" data-i="${i}" rows="2" placeholder="Page, module or link, and what happens"${off}>${esc(x.desc)}</textarea></label>
      <label class="field"><span class="req">Category</span><select id="iCat${i}" data-i="${i}"${off}><option value="">Choose…</option>${CATS.map(c=>`<option${x.cat===c?' selected':''}>${c}</option>`).join('')}</select></label></div>`).join('')
      +`<div><button type="button" class="btn sm" data-a="addIssue"${off}>+ Add issue</button></div>`;
}
function submitAudit(){
  const c=course(draft.courseId), err=m=>{$('#formErr').textContent=m};
  const left=draft.crit.filter(v=>!v).length;
  if(left&&!draft.crit.includes('No'))return err(`Answer all criteria (${left} left), or mark the failed ones No.`);
  const price=toPrice(draft.price);
  if(Number.isNaN(price))return err('Docebo pricing must be a number of 0 or more.');
  // a re-audit is saved when it finds a No or changes an answer (e.g. Yes → N/A); otherwise Cancel audit keeps it as it was
  if(draft.re&&!draft.crit.includes('No')&&draft.base&&draft.crit.join()===draft.base.join())
    return err('Nothing changed. Mark a criterion No or N/A, or use Cancel audit to keep it Healthy.');
  const audience=draft.aud.join(', '), info={price,audience}, ts=Date.now();
  const started=c.lockedAt?` · started ${fmtDT(c.lockedAt)}`:'';
  if(draft.crit.includes('No')){
    const bad=draft.issues.findIndex(x=>!x.desc.trim()||!x.cat);
    if(bad>-1)return err(`Issue ${bad+1}: describe it and choose a category.`);
    if(draft.re&&!draft.ok){const n=draft.crit.filter(v=>v==='No').length,k=draft.issues.length;
      return openModal(`<div class="ov-h"><h3>Mark ${esc(c.code)} Unhealthy?</h3><button class="x" data-a="close" aria-label="Close">×</button></div>
        <div class="ov-b"><p style="margin:0">${n} criteri${n>1?'a':'on'} marked No. The course changes from Healthy to Unhealthy and ${k} ticket${k>1?'s are':' is'} created.</p></div>
        <div class="ov-f"><button class="btn" data-a="close">Back to form</button><button class="btn danger" data-a="confirmFail">Mark Unhealthy</button></div>`)}
    c.price=price;c.audience=audience;
    const a=addAudit(c,'Failed',draft.crit.map(v=>v||'Yes'),info,draft.issues.map(x=>({...x})));
    const made=draft.issues.map(x=>{const t={id:'TKT-'+S.seq.t++,courseId:c.id,auditId:a.id,category:x.cat,detail:x.desc.trim(),status:'New',createdAt:ts,createdBy:user.name,
      escalatedAt:null,escalatedBy:null,fixDate:null,notes:[],justification:null,rejection:null,closedAt:null,closedAs:null};S.tickets.push(t);return t});
    c.health='Unhealthy';c.auditorStatus='In Progress';c.cycleAuditId=a.id;c.lastAudited=ts;c.lastAuditor=user.name;
    log({courseId:c.id,ticketIds:made.map(t=>t.id),action:'Audit failed',detail:`${made.length} ticket(s) created: ${made.map(t=>`${t.id} ${t.category}`).join(', ')}${started}`});
    var msg=`Unhealthy · created ${made.map(t=>t.id).join(', ')}`, fill='--bad', label=`${made.length} ticket${made.length>1?'s':''} created`;
  }else{
    c.price=price;c.audience=audience;
    addAudit(c,'Passed',[...draft.crit],info);
    c.health='Healthy';c.auditorStatus='Completed';c.auditCount++;c.lastAudited=ts;c.lastAuditor=user.name;
    log({courseId:c.id,action:'Audit passed',detail:`Iteration ${c.auditCount}${started}`});
    var msg=`Healthy · audit counter now ${c.auditCount}`, fill='--ok', label='Passed ✓';
  }
  c.lockedBy=null;c.lockedAt=null;draft=null;save();
  // fill the button, fold the form away, then land on the Courses list with this row highlighted
  const done=()=>{filter='all';search='';catFilter='';tkF='';auditedF='';page=1;flashId=c.id;go('courses');toast(msg)};
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
// long dashboard lists show the first few; the rest open on request
const LIST_MAX=5, listOpen=new Set();
const moreBtn=(n,k)=>n>LIST_MAX?` <button class="link" data-a="toggleList" data-id="${k}">${listOpen.has(k)?'Show less':`+${n-LIST_MAX} more`}</button>`:'';
// the reason behind a ticket's latest fix date move: the note saved with it
function moveReason(t){const ls=S.logs.filter(l=>l.ticketId===t.id),i=ls.map(l=>l.action).lastIndexOf('Fix date changed');
  return i>-1?ls.slice(i+1).find(l=>l.action==='Note added')?.detail||'':''}
// open tickets whose fix date has moved, most moved first
function movesPanel(open){
  const rows=open.filter(t=>movesOf(t)).sort((a,b)=>movesOf(b)-movesOf(a)||a.fixDate-b.fixDate);
  return `<div class="panel"><h3>Fix date changes (${rows.length})</h3>${rows.length?`<div class="tbl-wrap"><table><thead><tr><th>Ticket</th><th>Course</th><th>SELM</th><th>Moved</th><th>First ETA</th><th>Current ETA</th><th>Latest reason</th></tr></thead><tbody>
    ${rows.slice(0,listOpen.has('moves')?rows.length:LIST_MAX).map(t=>{const c=course(t.courseId),n=movesOf(t);return `<tr><td class="nowrap"><button class="link mono" data-a="open" data-id="${t.courseId}">${t.id}</button></td><td>${c?esc(c.code):'—'}</td><td class="nowrap">${esc(t.escalatedBy||'—')}</td>
      <td class="mono${n>=2?' move-hi':''}">${n}×</td><td class="mono nowrap">${fmtD(t.firstFix)}</td>
      <td class="mono nowrap${etaMissed(t)?' move-hi':''}">${fmtD(t.fixDate)}</td><td class="move-why">${esc(moveReason(t))||'—'}</td></tr>`}).join('')}</tbody></table></div>${moreBtn(rows.length,'moves')}`
    :'<span class="muted">No open ticket has changed its fix date.</span>'}</div>`;
}
function vDash(){
  const cs={};STAGES.forEach(([k])=>cs[k]=0);S.courses.forEach(c=>{if(stage(c)!=='disc')cs.all++;cs[stage(c)]++});
  const open=S.tickets.filter(t=>t.status!==CLOSED), overdue=S.tickets.filter(isOverdue), lateAud=S.courses.filter(auditLate), notEsc=overdue.filter(t=>t.status==='New'), noFix=overdue.filter(t=>t.status!=='New'), missed=open.filter(etaMissed);
  const tkLinks=(l,k)=>{const all=listOpen.has(k);return l.slice(0,all?l.length:LIST_MAX).map(t=>`<button class="link" data-a="open" data-id="${t.courseId}">${t.id}</button>`).join(', ')+moreBtn(l.length,k)};
  const catCounts=CATS.map(c=>[c,open.filter(t=>t.category===c).length]).filter(x=>x[1]);
  const maxC=Math.max(1,...catCounts.map(x=>x[1]));
  const etaT=S.tickets.filter(t=>WORKING.includes(t.status));
  const buckets={};etaT.forEach(t=>{const k=week(t.fixDate);(buckets[k]=buckets[k]||[]).push(t)});
  const bKeys=Object.keys(buckets).sort((a,b)=>a==='TBD'?1:b==='TBD'?-1:Math.min(...buckets[a].map(t=>t.fixDate))-Math.min(...buckets[b].map(t=>t.fixDate)));
  const maxB=Math.max(1,...bKeys.map(k=>buckets[k].length));
  // every card opens the Courses page: course cards filter by status, ticket cards bring those tickets' courses to the top
  const m=(v,l,t,k)=>`<button class="metric" data-a="dashGo" data-id="c:${k}" style="--tone:var(${t})"><b>${v}</b><span>${l}</span></button>`;
  const tm=(v,l,t,k)=>`<button class="metric" data-a="dashGo" data-id="t:${k}" style="--tone:var(${t})"><b>${v}</b><span>${l}</span></button>`;
  const from=rptFrom??dayStart(Date.now()-6*DAY), to=rptTo??dayStart(Date.now());
  const inR=S.logs.filter(l=>l.ts>=from&&l.ts<to+DAY), cnt=a=>inR.filter(l=>l.action===a).length;
  return `<div class="head"><h2>Dashboard</h2><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-a="samples">${S.courses.some(c=>c.sample)?'Remove 7-day samples':'Add 7-day samples'}</button><button class="btn sm" data-a="reset">Clear all data</button></div></div>
  <span class="sec-label">Courses</span>
  <div class="metric hero" style="--tone:var(--accent)"><button class="hero-link" data-a="dashGo" data-id="c:all"><b>${cs.all}</b><span>Active courses</span></button><small class="hero-sla${lateAud.length?' bad':''}">${lateAud.length} not audited in 7d</small>${foldBtn('courses')}</div>
  <div class="fold-box${fold.courses?' shut':''}" id="fold-courses"><div class="metrics">${m(cs.healthy,'Healthy','--ok','healthy')}${m(cs.issues,'Unhealthy','--bad','issues')}${m(cs.verify,'Ready to revalidate','--pv','verify')}${m(cs.audit,'Pending audit','--warn','audit')}</div></div>
  ${lateAud.length?`<div class="alert"><span>⚠</span><div><b>${lateAud.length} course${lateAud.length>1?'s':''} not audited within 7 days.</b> ${lateAud.slice(0,listOpen.has('lateAud')?lateAud.length:LIST_MAX).map(c=>`<button class="link" data-a="open" data-id="${c.id}">${esc(c.code)}</button>`).join(', ')}${moreBtn(lateAud.length,'lateAud')}</div></div>`:''}
  ${notEsc.length?`<div class="alert"><span>⚠</span><div><b>${notEsc.length} ticket${notEsc.length>1?'s':''} not escalated within 7 days.</b> SELM and Auditor groups notified: ${tkLinks(notEsc,'notEsc')}</div></div>`:''}
  ${noFix.length?`<div class="alert"><span>⚠</span><div><b>${noFix.length} ticket${noFix.length>1?'s':''} with no fix date 7 days after escalation.</b> SELM and Auditor groups notified: ${tkLinks(noFix,'noFix')}</div></div>`:''}
  ${missed.length?`<div class="alert"><span>⚠</span><div><b>${missed.length} ticket${missed.length>1?'s':''} past the fix date.</b> ${tkLinks(missed,'missed')}</div></div>`:''}
  <span class="sec-label">Tickets</span>
  <div class="metric hero" style="--tone:var(--accent)"><button class="hero-link" data-a="dashGo" data-id="t:open"><b>${open.length}</b><span>Open tickets</span></button><small class="hero-sla${overdue.length||missed.length?' bad':''}">${notEsc.length} not escalated in 7d · ${noFix.length} no fix date in 7d · ${missed.length} ETA missed</small>${foldBtn('tickets')}</div>
  <div class="fold-box${fold.tickets?' shut':''}" id="fold-tickets"><div class="metrics">${tm(S.tickets.filter(t=>t.status==='New').length,'New','--warn','New')}${tm(S.tickets.filter(t=>t.status==='Retest Failed').length,'Retest Failed','--bad','Retest Failed')}${tm(S.tickets.filter(t=>t.status==='Escalated').length,'Escalated','--info','Escalated')}${tm(S.tickets.filter(t=>t.status==='In Progress').length,'In Progress','--accent','In Progress')}${tm(S.tickets.filter(t=>t.status===PV_RES||t.status===PV_DIS).length,'Waiting for verification','--pv','verify')}</div></div>
  <div class="grid2">
    <div class="panel"><h3>Open tickets by category</h3><div class="bars">${catCounts.length?catCounts.map(([c,n])=>`<div class="bar"><span>${esc(c)}</span><div class="track"><div class="fill" style="width:${n/maxC*100}%"></div></div><span class="v">${n}</span></div>`).join(''):'<span class="muted">No open tickets</span>'}</div></div>
    <div class="panel"><h3>Fix ETA by week</h3><div class="bars">${bKeys.length?bKeys.map(k=>`<div class="bar"><span class="mono">${k}</span><div class="track"><div class="fill" style="width:${buckets[k].length/maxB*100}%;${k==='TBD'?'background:var(--warn)':''}"></div></div><span class="v">${buckets[k].length}</span></div>`).join(''):'<span class="muted">Nothing scheduled</span>'}</div></div>
  </div>
  ${movesPanel(open)}
  ${critPanel()}
  <div class="panel"><div class="panel-h"><h3>Status report</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end"><label class="field"><span>From</span><input type="date" id="rFrom" value="${toInput(from)}"></label>
    <label class="field"><span>To</span><input type="date" id="rTo" value="${toInput(to)}"></label>
    <button class="btn sm" data-a="rToday">Today</button><button class="btn sm" data-a="rWeek">7 days</button></div></div>
    <div class="kv"><div><b>${cnt('Audit passed')+cnt('Re-verification approved')}</b><span>Audits passed</span></div><div><b>${cnt('Audit failed')}</b><span>Audits failed</span></div>
    <div><b>${inR.reduce((n,l)=>n+(l.ticketIds?.length||0),0)+cnt('Added after audit')}</b><span>Tickets opened</span></div><div><b>${cnt('Escalated')}</b><span>Escalated</span></div>
    <div><b>${cnt('Ticket closed')}</b><span>Tickets closed</span></div><div><b>${cnt('Retest failed')+cnt('Cancellation rejected')+cnt('Discontinuation rejected')}</b><span>Sent back</span></div></div></div>`;
}

/* ---------- team ---------- */
// what each auditor has done: audits they submitted (re-verifications after fixes counted apart),
// issues they raised and fixes they approved; the period chips switch between this month and all time
let teamP='month';
const REVERIFY='Re-verification after fixes';
const inPeriod=t=>{if(teamP==='all')return true;const n=new Date();return t>=new Date(n.getFullYear(),n.getMonth(),1).getTime()};
function auditorStats(name){
  const all=S.audits.filter(a=>a.auditor===name), runs=all.filter(a=>a.note!==REVERIFY&&inPeriod(a.date));
  return {audits:runs.length,courses:new Set(runs.map(a=>a.courseId)).size,issues:S.tickets.filter(t=>t.createdBy===name&&inPeriod(t.createdAt)).length,
    verified:S.logs.filter(l=>l.actor===name&&l.action==='Ticket closed'&&ticket(l.ticketId)?.closedAs==='Resolved'&&inPeriod(l.ts)).length,last:all.length?Math.max(...all.map(a=>a.date)):null};
}
const periodChips=()=>`<div class="chips-bar">${[['month','This month'],['all','All time']].map(([k,l])=>`<button class="fchip" data-a="teamP" data-id="${k}" aria-pressed="${teamP===k}">${l}</button>`).join('')}</div>`;
const avatar=(u,cls)=>`<span class="avatar${cls?' '+cls:''}" aria-hidden="true">${esc(u.name[0])}</span>`;
function vTeam(){
  const rows=USERS.filter(u=>u.role==='Auditor').map(u=>({u,s:auditorStats(u.name)})).sort((a,b)=>b.s.audits-a.s.audits||b.s.verified-a.s.verified);
  const max=Math.max(1,...rows.map(r=>r.s.audits));
  return `<div class="head"><h2>Team</h2>${periodChips()}</div>
  <p class="muted small" style="margin:0">Audits each auditor submitted ${teamP==='month'?'this month':'so far'}. Open a card to see their profile.</p>
  <div class="team">${rows.map(({u,s},i)=>`<button class="tm-card" data-a="openAuditor" data-id="${u.id}">
    <div class="tm-top">${avatar(u)}<div><b>${esc(u.name)}${u.id===user.id?'<span class="you">You</span>':''}</b><span class="muted small">Last audit ${fmtD(s.last)}</span></div>${s.audits?`<span class="tm-rank">#${i+1}</span>`:''}</div>
    <div class="tm-big"><b>${s.audits}</b><span>audit${s.audits===1?'':'s'}</span></div>
    <div class="track"><div class="fill" style="width:${s.audits/max*100}%"></div></div>
    <div class="tm-kv"><span><b>${s.courses}</b> course${s.courses===1?'':'s'}</span><span><b>${s.issues}</b> issue${s.issues===1?'':'s'} raised</span><span><b>${s.verified}</b> fix${s.verified===1?'':'es'} verified</span></div>
  </button>`).join('')}</div>`;
}
function vAuditor(){
  const u=USERS.find(x=>x.id===view.id&&x.role==='Auditor')||USERS[0], s=auditorStats(u.name);
  const all=S.audits.filter(a=>a.auditor===u.name).sort((a,b)=>b.date-a.date);
  // audits per month over the last six months, oldest first
  const n=new Date(), per=[...Array(6)].map((_,i)=>{const m=new Date(n.getFullYear(),n.getMonth()-5+i,1),end=new Date(m.getFullYear(),m.getMonth()+1,1).getTime();
    return [`${MONTHS[m.getMonth()]} ${m.getFullYear()}`,all.filter(a=>a.note!==REVERIFY&&a.date>=m.getTime()&&a.date<end).length]});
  const max=Math.max(1,...per.map(p=>p[1])), k=(v,l)=>`<div><b>${v}</b><span>${l}</span></div>`;
  return `<button class="link back" data-a="go" data-id="team">← Team</button>
  <div class="panel"><div class="tm-top">${avatar(u,'lg')}<div><h2>${esc(u.name)}${u.id===user.id?'<span class="you">You</span>':''}</h2><span class="muted small">${u.role} · last audit ${fmtD(s.last)}</span></div>${periodChips()}</div>
    <div class="kv">${k(s.audits,'Audits')}${k(s.courses,'Courses audited')}${k(s.issues,'Issues raised')}${k(s.verified,'Fixes verified')}</div></div>
  <div class="panel"><h3>Audits per month</h3><div class="bars">${per.map(([l,v])=>`<div class="bar"><span class="mono">${l}</span><div class="track"><div class="fill" style="width:${v/max*100}%"></div></div><span class="v">${v}</span></div>`).join('')}</div></div>
  <div class="panel"><h3>All audits (${all.length})</h3>${all.length?`<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Course</th><th>Result</th><th>Issues</th></tr></thead><tbody>
    ${all.map(a=>{const c=course(a.courseId);return `<tr><td class="mono nowrap">${fmtD(a.date)}</td><td>${c?`<button class="link mono" data-a="open" data-id="${c.id}">${esc(c.code)}</button> <span class="muted small">${esc(c.name)}</span>`:'<span class="muted">Deleted course</span>'}</td>
      <td class="nowrap">${pill(a.result)}${a.note===REVERIFY?' <span class="muted small">Fixes verified</span>':''}</td><td class="mono">${a.issues?.length||'—'}</td></tr>`}).join('')}</tbody></table></div>`
    :'<span class="muted">No audits yet.</span>'}</div>`;
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
function addSamples(){const now=Date.now(),ago=d=>now-d*DAY,price=299;
  const addCourse=(code,name,raisedAgo,tickets)=>{
    const c={id:'C'+S.seq.c++,sample:true,code,name,type:'ILT',price,audience:'Partner',health:'Unhealthy',auditorStatus:'In Progress',auditCount:1,lastAudited:ago(raisedAgo),lastAuditor:'Rick',lockedBy:null,lockedAt:null,cycleAuditId:null,createdAt:ago(raisedAgo+5)};
    const a={id:'A'+S.seq.a++,courseId:c.id,date:ago(raisedAgo),result:'Failed',auditor:'Rick',checklist:CRITERIA.map((_,i)=>i?'Yes':'No'),price,audience:'Partner',issues:tickets.map(t=>({cat:t.cat,desc:t.desc})),note:''};
    c.cycleAuditId=a.id;S.courses.push(c);S.audits.push(a);
    log({ts:ago(raisedAgo),actor:'Rick',courseId:c.id,action:'Audit failed',detail:`${tickets.length} ticket(s) created`});
    tickets.forEach(x=>{const t={id:'TKT-'+S.seq.t++,courseId:c.id,auditId:a.id,category:x.cat,detail:x.desc,status:x.status,createdAt:ago(x.raised),createdBy:'Rick',escalatedAt:x.esc?ago(x.esc):null,escalatedBy:x.by||null,fixDate:x.fix?ago(x.fix):null,firstFix:x.first?ago(x.first):null,notes:[],justification:null,rejection:null,closedAt:null,closedAs:null};
      S.tickets.push(t);
      const at=(d,actor,action,detail)=>log({ts:ago(d),actor,courseId:c.id,ticketId:t.id,action,detail});
      if(x.esc)at(x.esc,x.by,'Escalated','');
      (x.moves||[]).forEach(m=>{at(m.d,x.by,'Fix date changed',`${week(ago(m.from))} → ${week(ago(m.to))} (${fmtD(ago(m.to))})`);at(m.d,x.by,'Note added',m.note);t.notes.push({ts:ago(m.d),by:x.by,text:m.note})})})};
  // waiting for their first audit: one past the 7 days, one still inside them
  [['SAMPLE-104','Sample: not audited yet',10],['SAMPLE-105','Sample: added recently',2]].forEach(([code,name,d])=>{
    const c={id:'C'+S.seq.c++,sample:true,code,name,type:'ILT',price:null,audience:'',health:'Pending Audit',auditorStatus:'Pending',auditCount:0,lastAudited:null,lastAuditor:null,lockedBy:null,lockedAt:null,cycleAuditId:null,createdAt:ago(d)};
    S.courses.push(c);log({ts:ago(d),actor:'Rick',courseId:c.id,action:'Course registered',detail:'Manual entry'})});
  addCourse('SAMPLE-101','Sample: not escalated yet',12,[
    {cat:'Pricing',desc:'Price in the catalog is out of date',status:'New',raised:12},
    {cat:'Content',desc:'Lab guide link is broken',status:'New',raised:9},
    {cat:'Course Setup',desc:'Wrong audience on the course page',status:'New',raised:3}]);
  addCourse('SAMPLE-102','Sample: escalated, no fix date',15,[
    {cat:'Edutube',desc:'Video 3 does not play',status:'Escalated',raised:15,esc:10,by:'Gary'},
    {cat:'CD PDF',desc:'PDF is missing chapter 4',status:'Escalated',raised:11,esc:8,by:'Jocelyn'},
    {cat:'IT issue',desc:'Login page times out',status:'Escalated',raised:4,esc:2,by:'Gary'}]);
  addCourse('SAMPLE-103','Sample: fix date moved and missed',20,[
    {cat:'Learning Plan Setup',desc:'Modules are in the wrong order',status:'In Progress',raised:20,esc:18,by:'Gary',first:12,fix:4,
      moves:[{d:11,from:12,to:7,note:'Vendor needs more time'},{d:5,from:7,to:4,note:'Waiting for the new content'}]}]);
}
function removeSamples(){const ids=new Set(S.courses.filter(c=>c.sample).map(c=>c.id));
  S.courses=S.courses.filter(c=>!ids.has(c.id));S.audits=S.audits.filter(a=>!ids.has(a.courseId));S.tickets=S.tickets.filter(t=>!ids.has(t.courseId));S.logs=S.logs.filter(l=>!ids.has(l.courseId));
  if(draft&&ids.has(draft.courseId))draft=null}
function toast(msg){const h=$('#toastHost'),el=document.createElement('div');el.className='toast';el.setAttribute('role','status');el.textContent=msg;
  h.innerHTML='';h.appendChild(el);setTimeout(()=>{el.classList.add('out');setTimeout(()=>el.remove(),300)},2400)}
function tlog(t,action,detail){log({courseId:t.courseId,ticketId:t.id,action,detail:detail||''})}

const A={
  go(id){go(id)},
  open(id){go('course',id)},
  openAuditor(id){go('auditor',id)},
  teamP(id){teamP=id;render()},
  filter(id){filter=id;refreshRows()},
  leaveAudit(){const next=leaveNext;leaveNext=null;closeOv();draftStart=JSON.stringify(draft);next?.()},
  goFilter(id){if(leaveGuard(()=>A.goFilter(id)))return;filter=id;go('courses')},
  addCourse(){openModal(`<form id="addForm" novalidate style="display:contents"><div class="ov-h"><h3>Add a course</h3><button type="button" class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="ov-b"><label class="field"><span class="req">Course code</span><input type="text" id="nCode" placeholder="e.g. ESSTGD04406"></label>
    <label class="field"><span class="req">Course name</span><input type="text" id="nName"></label>
    <label class="field"><span>Type</span><select id="nType"><option>Learning Plan</option><option>ILT</option><option>On-Demand</option></select></label>
    <span class="err" id="nErr"></span></div>
    <div class="ov-f"><button type="button" class="btn" data-a="close">Cancel</button><button type="submit" class="btn primary">Add</button></div></form>`);$('#nCode').focus()},
  saveCourse(){
    const code=$('#nCode').value.trim(),name=$('#nName').value.trim();
    if(!code||!name){$('#nErr').textContent='Course code and course name are required.';return}
    if(S.courses.some(c=>c.code.toLowerCase()===code.toLowerCase())){$('#nErr').textContent=`${code} is already in the masterlist.`;return}
    const c={id:'C'+S.seq.c++,code,name,type:$('#nType').value,price:null,audience:'',health:'Pending Audit',auditorStatus:'Pending',auditCount:0,lastAudited:null,lastAuditor:null,lockedBy:null,lockedAt:null,cycleAuditId:null,createdAt:Date.now()};
    S.courses.push(c);log({courseId:c.id,action:'Course registered',detail:'Manual entry'});save();closeOv();render();toast(`${code} added`)},
  // the course owner keeps the code, name and type right; every change goes in the history
  editCourse(id){const c=course(id);openModal(`<form id="editForm" data-id="${id}" novalidate style="display:contents"><div class="ov-h"><h3>Edit ${esc(c.code)}</h3><button type="button" class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="ov-b"><label class="field"><span class="req">Course code</span><input type="text" id="eCode" value="${esc(c.code)}"></label>
    <label class="field"><span class="req">Course name</span><input type="text" id="eName" value="${esc(c.name)}"></label>
    <label class="field"><span>Type</span><select id="eType">${['Learning Plan','ILT','On-Demand'].map(t=>`<option${t===c.type?' selected':''}>${t}</option>`).join('')}</select></label>
    <span class="err" id="eErr"></span></div>
    <div class="ov-f"><button type="button" class="btn" data-a="close">Cancel</button><button type="submit" class="btn primary">Save</button></div></form>`);$('#eCode').focus()},
  saveEditCourse(id){const c=course(id),code=$('#eCode').value.trim(),name=$('#eName').value.trim(),type=$('#eType').value;
    if(!code||!name){$('#eErr').textContent='Course code and course name are required.';return}
    if(S.courses.some(x=>x.id!==id&&x.code.toLowerCase()===code.toLowerCase())){$('#eErr').textContent=`${code} is already in the masterlist.`;return}
    const changes=[['Code',c.code,code],['Name',c.name,name],['Type',c.type,type]].filter(x=>x[1]!==x[2]);
    closeOv();if(!changes.length)return toast('No changes to save');
    c.code=code;c.name=name;c.type=type;log({courseId:id,action:'Course info updated',detail:changes.map(([k,a,b])=>`${k}: ${a} → ${b}`).join(' · ')});save();render();toast(`${code} updated`)},
  close:closeOv,
  toggleMine(){myF=!myF;if(view.name!=='course')return refreshRows();
    // on a course page only the fading changes, so nothing is redrawn and open forms keep what was typed
    $('.fchip.mine')?.setAttribute('aria-pressed',myF);
    document.querySelectorAll('#tree .tree-kid').forEach(k=>k.classList.toggle('faded',myF&&ticket(k.dataset.slot)?.escalatedBy!==user.name))},
  pg(n){page=+n;refreshRows(true);$('.tbl-wrap')?.scrollIntoView({behavior:'smooth',block:'nearest'})},
  editTk(id){if(Date.now()-(justSaved[id]||0)<500)return;swapAud(id,audEdit(ticket(id)));$('#ekDesc-'+id)?.focus()},
  cancelTk(id){swapAud(id,audAct(ticket(id)))},
  saveTk(id){const t=ticket(id),cat=$('#ekCat-'+id).value,desc=$('#ekDesc-'+id).value.trim();
    if(!desc){$('#ekErr-'+id).textContent='Describe what is wrong.';return $('#ekDesc-'+id).focus()}
    const ch=[cat!==t.category?`Category: ${t.category} → ${cat}`:'',desc!==t.detail?'Description updated':''].filter(Boolean);
    if(!ch.length)return A.cancelTk(id);
    t.category=cat;t.detail=desc;tlog(t,'Edited by auditor',ch.join('; '));save();
    justSaved[id]=Date.now();const nu=swapCard(id,true);nu?.querySelector('.recs li')?.classList.add('new');
    nu?.querySelector('.tk-btns')?.insertAdjacentHTML('beforeend','<span class="tk-saved ok">✓ Saved</span>');toast(`${id} updated`)},
  rmTk(id){const t=ticket(id);
    if(openOf(t.courseId).length<=1)return toast(`${id} is the only open ticket, so it can't be removed. Edit it instead, or let the SELM cancel it.`);
    openModal(`<div class="ov-h"><h3>Remove ${id}?</h3><button class="x" data-a="close" aria-label="Close">×</button></div>
      <div class="ov-b"><p style="margin:0">${esc(t.category)} · ${esc(t.detail)}</p><p class="muted small" style="margin:0">It hasn't been escalated yet, so it's deleted. The removal is kept in the audit history.</p></div>
      <div class="ov-f"><button class="btn" data-a="close">Keep ticket</button><button class="btn danger" data-a="doRmTk" data-id="${id}">Remove ticket</button></div>`)},
  doRmTk(id){const t=ticket(id);if(!t)return closeOv();
    S.tickets=S.tickets.filter(x=>x.id!==id);S.logs=S.logs.filter(l=>l.ticketId!==id);
    log({courseId:t.courseId,auditId:t.auditId,action:'Ticket removed',detail:`Removed ${t.id} (${t.category}): ${t.detail}`});
    save();closeOv();render();toast(`${id} removed`)},
  // an issue the auditor missed can still join the current round as a new ticket
  addTk(id){if($('#tkAdd'))return $('#tkCat').focus();
    document.querySelector(`[data-a=addTk][data-id="${id}"]`).closest('.panel-h').insertAdjacentHTML('afterend',`<div class="tk-add" id="tkAdd">
      <label class="field"><span class="req">Category</span><select id="tkCat"><option value="">Choose…</option>${CATS.map(x=>`<option>${x}</option>`).join('')}</select></label>
      <label class="field grow"><span class="req">What is wrong</span><input type="text" id="tkDesc" placeholder="Page, module or link, and what happens"></label>
      <div class="tk-btns"><button class="btn primary sm" data-a="doAddTk" data-id="${id}">Add ticket</button><button type="button" class="btn sm tk-back" data-a="cancelAddTk" aria-label="Back without adding" title="Back without adding"><span aria-hidden="true">←</span> Back</button></div>
      <span class="err" id="tkErr"></span></div>`);$('#tkCat').focus()},
  cancelAddTk(){$('#tkAdd')?.remove()},
  doAddTk(id){const c=course(id),cat=$('#tkCat').value,desc=$('#tkDesc').value.trim();
    if(!cat||!desc){$('#tkErr').textContent=!cat?'Choose a category.':'Describe what is wrong.';return (!cat?$('#tkCat'):$('#tkDesc')).focus()}
    const t={id:'TKT-'+S.seq.t++,courseId:id,auditId:c.cycleAuditId,category:cat,detail:desc,status:'New',createdAt:Date.now(),createdBy:user.name,
      escalatedAt:null,escalatedBy:null,fixDate:null,notes:[],justification:null,rejection:null,closedAt:null,closedAs:null};
    S.tickets.push(t);c.health='Unhealthy';tlog(t,'Added after audit',cat);flashId=t.id;save();render();toast(`${t.id} added`)},
  toggleEdits(id){const box=$('#ae-'+id),open=!openEdits.has(id);open?openEdits.add(id):openEdits.delete(id);
    box.classList.toggle('open',open);box.querySelector('[data-a=toggleEdits]').textContent=open?'Hide changes':'Show changes'},
  toggleHist(id){const h=$('#hist-'+id),b=document.querySelector(`[data-a=toggleHist][data-id="${id}"]`),open=!openHist.has(id),n=+b.dataset.n;
    open?openHist.add(id):openHist.delete(id);h.classList.add('reveal');h.classList.toggle('open',open);b.textContent=open?'Show less':`Show ${n} earlier audit${n>1?'s':''}`},
  dashGo(id){if(leaveGuard(()=>A.dashGo(id)))return;const [kind,k]=[id.slice(0,1),id.slice(2)];search='';catFilter='';auditedF='';myF=false;page=1;
    filter=kind==='c'?k:'all';tkF=kind==='t'?k:'';go('courses')},
  tkHl(id){tkF=tkF===id?'':id;refreshRows()},
  clearF(){search='';catFilter='';tkF='';auditedF='';filter='all';myF=false;
    $('#search').value='';['statusF','catFilter','auditedF'].forEach(id=>{$('#'+id).value='';$('#'+id).classList.remove('on')});refreshRows()},
  reset(){openModal(`<div class="ov-h"><h3>Clear all data?</h3><button class="x" data-a="close" aria-label="Close">×</button></div><div class="ov-b">All courses, audits, tickets and history in this browser will be removed.</div><div class="ov-f"><button class="btn" data-a="close">Cancel</button><button class="btn danger" data-a="doReset">Clear</button></div>`)},
  // sample courses show every SLA state; they sit beside real data and come out again on their own
  toggleList(k){listOpen.has(k)?listOpen.delete(k):listOpen.add(k);render()},
  samples(){const had=S.courses.some(c=>c.sample);had?removeSamples():addSamples();save();render();
    toast(had?'7-day samples removed':'7-day samples added · 5 courses, 7 tickets')},
  doReset(){fresh();draft=null;closeOv();go('courses');toast('All data cleared')},
  startAudit(id,re){const c=course(id);c.lockedBy=user.name;c.lockedAt=Date.now();if(!re)c.auditorStatus='In Progress';
    const last=re?S.audits.filter(a=>a.courseId===id&&a.checklist?.length===8).sort((a,b)=>b.date-a.date)[0]?.checklist:null;
    const base=last?last.map(v=>v==='N/A'?'N/A':'Yes'):null;
    draft={courseId:id,crit:base?[...base]:Array(8).fill(null),base,price:c.price??'',aud:audList(c.audience),issues:[],re:!!re};draftStart=JSON.stringify(draft);save();
    // open the form in place instead of re-rendering the page
    refreshInfo(c);
    const b=document.querySelector('[data-a=startAudit],[data-a=reaudit]'),p=b?.closest('.panel');if(!p){render();return}
    b.remove();p.insertAdjacentHTML('afterend',`<div class="expander">${auditForm(c)}</div>`);renderIssues();
    const x=p.nextElementSibling;void x.offsetWidth;x.classList.add('open');
    setTimeout(()=>{x.classList.add('done');x.scrollIntoView({behavior:'smooth',block:'nearest'})},460)},
  cancelAudit(id){const c=course(id),re=draft?.re;c.lockedBy=null;c.lockedAt=null;if(!re)c.auditorStatus='Pending';draft=null;save();refreshInfo(c);
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
  discCourse(id){const c=course(id),auditing=c.lockedBy;openModal(`<div class="ov-h"><h3>Discontinue ${esc(c.code)}?</h3><button class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="ov-b"><p style="margin:0">The course is marked as no longer available. It leaves the active queues${openOf(id).length?` and its ${openOf(id).length} open ticket${openOf(id).length>1?'s are':' is'} cancelled`:''}.</p>
      ${auditing?`<p class="warn-line" style="margin:0">${auditing===user.name?'You are':`${esc(auditing)} is`} auditing this course right now. Discontinuing ends that audit and its answers are lost.</p>`:''}
      <label class="field"><span class="req">Reason</span><input type="text" id="discWhy" placeholder="Reason the course is being retired"></label><span class="err" id="discErr"></span></div>
    <div class="ov-f"><button class="btn" data-a="close">Keep course</button><button class="btn danger" data-a="doDiscCourse" data-id="${id}">${auditing?'Discontinue anyway':'Discontinue course'}</button></div>`);$('#discWhy')?.focus()},
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
  restoreCourse(id){const c=course(id),same=sameCourses(c);
    if(same.length)return openModal(`<div class="ov-h"><h3>${esc(c.code)} may already exist</h3><button class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="ov-b"><p style="margin:0">An active course has the same code or name as <b>${esc(c.name)}</b>:</p>
      <ul class="same-list">${same.map(x=>`<li><button class="link mono" data-a="open" data-id="${x.id}">${esc(x.code)}</button> ${esc(x.name)} <span class="muted small">${esc(healthLabel(x))}</span></li>`).join('')}</ul>
      <p class="muted small" style="margin:0">Restoring anyway puts ${esc(c.code)} back in Pending audit next to it, and the record notes this.</p></div>
    <div class="ov-f"><button class="btn" data-a="close">Keep discontinued</button><button class="btn danger" data-a="doRestoreCourse" data-id="${id}">Restore anyway</button></div>`);
    openModal(`<div class="ov-h"><h3>Restore ${esc(c.code)}?</h3><button class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="ov-b"><p style="margin:0">The course goes straight to Pending audit and waits for a fresh audit. Its cancelled tickets stay closed.</p></div>
    <div class="ov-f"><button class="btn" data-a="close">Keep discontinued</button><button class="btn primary" data-a="doRestoreCourse" data-id="${id}">Restore course</button></div>`)},
  doRestoreCourse(id){const c=course(id),same=sameCourses(c);c.health='Pending Audit';c.auditorStatus='Pending';c.cycleAuditId=null;
    log({courseId:id,action:'Course restored',detail:`Back in Pending audit${same.length?`; restored anyway, same as ${same.map(x=>x.code).join(', ')}`:''}`});save();closeOv();render();toast(`${c.code} restored · Pending audit`)},
  reaudit(id){const c=course(id);if(isAud())return A.startAudit(id,true);
    openModal(`<div class="ov-h"><h3>Queue re-audit?</h3><button class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="ov-b"><p style="margin:0">Are you sure you want to re-audit <b>${esc(c.code)}</b> · ${esc(c.name)}? It goes back to the Pending audit queue for an auditor to check again.</p></div>
    <div class="ov-f"><button class="btn" data-a="close">Cancel</button><button class="btn primary" data-a="doReaudit" data-id="${c.id}">Queue re-audit</button></div>`)},
  doReaudit(id){closeOv();const c=course(id);c.auditorStatus='Pending';log({courseId:c.id,action:'Re-audit queued',detail:''});save();render();toast('Queued for re-audit')},
  // a re-audit that finds a No asks once before the healthy course turns Unhealthy
  confirmFail(){if(!draft)return closeOv();draft.ok=true;closeOv();submitAudit()},
  escalate(id){const t=ticket(id);t.status='Escalated';t.escalatedAt=t.escalatedAt||Date.now();t.escalatedBy=user.name;tlog(t,'Escalated');save();
    // go straight on to the fix date: the card opens its form in place
    const prev=editingT;editingT=id;if(prev&&prev!==id)swapSelm(prev,false);
    swapCard(id,true)?.querySelector('.tk-form')?.classList.add('enter');toast(isOverdue(t)?`${id} escalated · the fix date is overdue`:`${id} escalated · ${slaLeft(t)}`)},
  saveT(id,quiet){if(!mine(ticket(id)))return toast(`Only ${ticket(id).escalatedBy} can update ${id}`);const t=ticket(id),fix=fromInput($(`#fix-${id}`).value),note=$(`#note-${id}`).value.trim(),before=S.logs.length;
    if(!fixFormOk(t))return false;
    delete formDrafts[draftKey(id)];
    const moved=t.fixDate&&(fix?toInput(fix):'')!==toInput(t.fixDate);
    if(moved||!t.fixDate&&fix){if(!t.fixDate)t.firstFix=fix;tlog(t,t.fixDate?'Fix date changed':'Fix date set',`${week(t.fixDate)} → ${week(fix)} (${fmtD(fix)})`);t.fixDate=fix}
    if(note){t.notes.push({ts:Date.now(),by:user.name,text:note});tlog(t,'Note added',note)}
    if(t.fixDate&&t.status!=='In Progress'){t.status='In Progress';tlog(t,'Status → In Progress','Fix date saved')}
    if(quiet)return;
    const added=S.logs.length-before, card=document.querySelector(`.tk[data-tid="${id}"]`);
    const say=(el,txt,cls)=>{el.querySelector('.tk-saved')?.remove();el.querySelector('.tk-btns')?.insertAdjacentHTML('beforeend',`<span class="tk-saved ${cls}">${txt}</span>`)};
    if(!added){if(card)say(card,'No changes to save','none');return}
    // close the form; the card comes back with its new record rows lit up and a saved note by Update
    justSaved[id]=Date.now();save();editingT=null;const nu=swapCard(id,true);if(!nu)return toast('Saved');
    [...nu.querySelectorAll('.recs li')].slice(0,added).forEach(li=>li.classList.add('new'));say(nu,'✓ Saved','ok')},
  openT(id){if(Date.now()-(justSaved[id]||0)<500)return;const prev=editingT;editingT=id;if(prev&&prev!==id)swapSelm(prev,false);
    swapSelm(id,true)},
  cancelT(){const id=editingT;if(!id)return;$(`#note-${id}`)&&($(`#note-${id}`).value='');$(`#fix-${id}`)&&($(`#fix-${id}`).value=ticket(id).fixDate?toInput(ticket(id).fixDate):'');editingT=null;swapSelm(id,false)},
  undoEsc(id){const t=ticket(id);if(!canUndoEsc(t))return toast(`${id} can't be undone now`);
    t.status='New';t.escalatedBy=null;tlog(t,'Escalation undone','Back to New');editingT=null;save();
    swapCard(id,true);toast(`${id} is back to New`)},
  takeOver(id){const t=ticket(id);
    openModal(`<div class="ov-h"><h3>Take over ${id}?</h3><button class="x" data-a="close" aria-label="Close">×</button></div>
      <div class="ov-b"><p style="margin:0">${esc(t.category)} · ${esc(t.detail)}</p><p class="muted small" style="margin:0">It moves from ${esc(t.escalatedBy)} to you. The fix date and the SLA clock stay as they are.</p></div>
      <div class="ov-f"><button class="btn" data-a="close">Back</button><button class="btn primary" data-a="doTakeOver" data-id="${id}">Take over</button></div>`)},
  doTakeOver(id){const t=ticket(id);closeOv();
    if(!WORKING.includes(t.status)||mine(t))return toast(`${id} has changed; nothing to take over`);
    const from=t.escalatedBy;t.escalatedBy=user.name;tlog(t,'Taken over',`from ${from}`);save();
    // the new owner goes straight to the form, like after escalating
    const prev=editingT;editingT=id;if(prev&&prev!==id)swapSelm(prev,false);
    swapCard(id,true)?.querySelector('.tk-form')?.classList.add('enter');toast(`${id} is now yours`)},
  takeBack(id){const t=ticket(id);if(!mine(t))return toast(`Only ${t.escalatedBy} can update ${id}`);
    if(t.status!==PV_RES&&t.status!==PV_DIS)return toast(`${id} was already checked by the auditor`);
    const was=shortStatus(t.status);t.status=t.fixDate?'In Progress':'Escalated';t.justification=null;tlog(t,'Taken back',`${was} withdrawn by SELM`);
    editingT=id;flashId=id;save();flipRender();$(`#note-${id}`)?.focus();toast(`${id} taken back · edit and send again`)},
  // Resolved asks once more, since it hands the ticket to the auditor; the form stays open behind the dialog
  resolveT(id){const t=ticket(id);if(!mine(t))return toast(`Only ${t.escalatedBy} can update ${id}`);if(!fixFormOk(t,true))return;
    openModal(`<div class="ov-h"><h3>Mark ${id} as resolved?</h3><button class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="ov-b"><p style="margin:0">${esc(t.category)} · ${esc(t.detail)}</p><p class="muted small" style="margin:0">It goes to the auditor to verify the fix. You can take it back until they check it.</p></div>
    <div class="ov-f"><button class="btn" data-a="close">Back</button><button class="btn okb" data-a="doResolveT" data-id="${id}">Yes, resolved</button></div>`)},
  doResolveT(id){closeOv();if(!$(`#fix-${id}`)||!mine(ticket(id)))return toast(`${id} has changed; nothing was sent`);if(A.saveT(id,true)===false)return;const t=ticket(id);t.status=PV_RES;tlog(t,'Marked resolved','Sent for auditor verification');editingT=null;flashId=id;save();render();toast(`${id} sent for verification`)},
  discT(id){if(!mine(ticket(id)))return toast(`Only ${ticket(id).escalatedBy} can update ${id}`);const note=$(`#note-${id}`).value.trim();if(!note){$(`#note-${id}`).focus();toast('Add a note with the reason');return}
    const t=ticket(id);openModal(`<div class="ov-h"><h3>Ask to cancel ${id}?</h3><button class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="ov-b"><p style="margin:0">${esc(t.category)} · ${esc(t.detail)}</p><p style="margin:0"><b>Reason:</b> ${esc(note)}</p><p class="muted small" style="margin:0">It goes to the auditor, who decides whether to close it. You can take it back until they check it.</p></div>
    <div class="ov-f"><button class="btn" data-a="close">Back</button><button class="btn danger" data-a="doDiscT" data-id="${id}">Yes, cancel ticket</button></div>`)},
  doDiscT(id){closeOv();const t=ticket(id),box=$(`#note-${id}`);if(!box||!mine(t))return toast(`${id} has changed; nothing was sent`);const note=box.value.trim();delete formDrafts[draftKey(id)];t.notes.push({ts:Date.now(),by:user.name,text:note});t.status=PV_DIS;t.justification=note;tlog(t,'Proposed cancellation',note);editingT=null;flashId=id;save();render();toast(`${id} sent for verification`)},
  startReject(id){if(rejecting)A.cancelReject();
    const el=document.querySelector(`[data-a=startReject][data-id="${id}"]`)?.closest('.tk-approve');
    rejecting=id;if(!el)return render();el.outerHTML=rejectBox(ticket(id));relayout();$('#rej-'+id)?.focus()},
  cancelReject(){const id=rejecting,el=$('#rej-'+id)?.closest('.tk-form');rejecting=null;
    if(!el)return render();el.outerHTML=approveBox(ticket(id));relayout()},
  approve(id){const t=ticket(id),last=openOf(t.courseId).length===1;
    openModal(`<div class="ov-h"><h3>${t.status===PV_DIS?`Approve cancelling ${id}?`:`Approve ${id}?`}</h3><button class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="ov-b"><p style="margin:0">${esc(t.category)} · ${esc(t.detail)}</p><p class="muted small" style="margin:0">The ticket closes and can't be reopened.${last?' It is the last open ticket, so the course becomes Healthy.':''}</p></div>
    <div class="ov-f"><button class="btn" data-a="close">Back</button><button class="btn okb" data-a="confirmApprove" data-id="${id}">Yes, approve</button></div>`)},
  confirmApprove(id){closeOv();const b=document.querySelector(`.approve-big[data-id="${id}"]`);
    if(!b||matchMedia('(prefers-reduced-motion: reduce)').matches)return A.doApprove(id);
    if(b.classList.contains('filling'))return;
    b.classList.add('filling');b.disabled=true;
    setTimeout(()=>{b.querySelector('span').textContent='✓ Approved';b.classList.add('done')},650);
    setTimeout(()=>A.doApprove(id),1150)},
  doApprove(id){const t=ticket(id),c=course(t.courseId);
    t.closedAs=t.status===PV_DIS?'Cancelled':'Resolved';t.status=CLOSED;t.closedAt=Date.now();tlog(t,'Ticket closed',`Approved (${t.closedAs})`);
    const r=closeCycle(c);save();
    // the approved card fades out, then the other cards slide into its place and Closed tickets lights up
    const kid=document.querySelector(`.tree-kid .tk[data-tid="${id}"]`)?.parentElement,done=()=>{flipRender(true);toast(`${id} closed`+(r?` · ${r}`:''))};
    if(!kid||matchMedia('(prefers-reduced-motion: reduce)').matches)return done();
    kid.animate([{opacity:1,transform:'none'},{opacity:0,transform:'scale(.95)'}],{duration:260,easing:'ease-in',fill:'forwards'}).onfinish=done},
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
  focusT(id){closeFocus();focusT=id;paintFocus()},
  unfocusT(){closeFocus()},
  toggleRecs(id){const b=document.querySelector(`[data-a=toggleRecs][data-id="${id}"]`),open=!openRecs.has(id);
    open?openRecs.add(id):openRecs.delete(id);b.closest('.recs').classList.toggle('open',open);b.closest('.recs').classList.add('reveal');b.textContent=open?b.dataset.on:b.dataset.off;relayout()},
  editPrice(id){const c=course(id);$('#priceBox').innerHTML=`<span class="price-edit">Pricing <input type="text" id="priceIn" inputmode="decimal" autocomplete="off" value="${c.price??''}" aria-label="Docebo pricing">
      <button class="btn primary sm" data-a="savePrice" data-id="${id}">Save</button><button class="btn sm" data-a="cancelPrice" data-id="${id}">Cancel</button><span class="err" id="priceErr"></span></span>`;
    const i=$('#priceIn');i.focus();i.select()},
  cancelPrice(id){$('#priceBox').innerHTML=priceView(course(id))},
  savePrice(id){const c=course(id),v=toPrice($('#priceIn').value),old=c.price??null;
    if(Number.isNaN(v)){$('#priceErr').textContent='Enter a number of 0 or more.';return}
    if(v!==old){c.price=v;log({courseId:id,auditId:c.cycleAuditId,action:'Pricing updated',detail:`${fmtPrice(old)} → ${fmtPrice(v)}`});save();refreshTrail(c);toast('Pricing updated')}
    A.cancelPrice(id)},
  editAud(id){const c=course(id),cur=audList(c.audience);
    $('#audBox').innerHTML=`<span class="price-edit aud-edit">Audience ${AUDIENCES.map(a=>`<label class="aud-opt"><input type="checkbox" name="eAud" value="${a}"${cur.includes(a)?' checked':''}> ${a}</label>`).join('')}
      <button class="btn primary sm" data-a="saveAud" data-id="${id}">Save</button><button class="btn sm" data-a="cancelAud" data-id="${id}">Cancel</button><span class="err" id="audErr"></span></span>`},
  cancelAud(id){$('#audBox').innerHTML=audView(course(id))},
  saveAud(id){const c=course(id),v=[...document.querySelectorAll('input[name=eAud]:checked')].map(x=>x.value).join(', '),old=c.audience||'';
    if(v!==old){c.audience=v;log({courseId:id,auditId:c.cycleAuditId,action:'Audience updated',detail:`${old||'—'} → ${v||'—'}`});save();refreshTrail(c);toast('Audience updated')}
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
  else if(e.key==='Escape'&&focusT)closeFocus();
  if(e.target.id==='priceIn'&&(e.key==='Enter'||e.key==='Escape')){e.preventDefault();A[e.key==='Enter'?'savePrice':'cancelPrice'](e.target.closest('.price-edit').querySelector('[data-a=savePrice]').dataset.id)}
  if(e.key==='Enter'&&e.target.matches('tr.click'))A.open(e.target.dataset.id);
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.name&&/^c\d$/.test(t.name)){draft.crit[+t.name.slice(1)]=t.value;$('#formErr').textContent='';renderIssues()}
  else if(t.name&&/^e\d$/.test(t.name))t.closest('.crit-row').classList.toggle('no',t.value==='No');
  else if(t.name==='fAud'){draft.aud=[...document.querySelectorAll('input[name=fAud]:checked')].map(x=>x.value);$('#formErr').textContent=''}
  else if(t.id==='userSel'){if(editingT)stashForm(editingT);user=USERS.find(u=>u.id===t.value);closeOv();render();toast(`Now ${user.name} (${user.role})`)}
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
  if(t.id==='fPrice'||t.id==='priceIn'){const v=t.value.replace(/[^\d.-]|(?!^)-/g,'').replace(/(\..*)\./g,'$1').replace(/(\.\d{2})\d+/,'$1');if(v!==t.value)t.value=v}
  if(t.id?.startsWith('iDesc'))draft.issues[+t.dataset.i].desc=t.value;
  else if(t.id==='fPrice'){draft.price=t.value;$('#formErr').textContent=''}
  // only refresh the table body so the search box keeps focus, scroll and IME composition
  else if(t.id==='search'){search=t.value;page=1;$('#courseRows').innerHTML=courseRows();$('#pager').innerHTML=pagerHtml()}
  else if(t.id==='histQ'){histQ=t.value;$('#histRows').innerHTML=histRows()}
});
document.addEventListener('submit',e=>{
  if(e.target.id==='auditForm'){e.preventDefault();submitAudit()}
  else if(e.target.id==='addForm'){e.preventDefault();A.saveCourse()}
  else if(e.target.id==='editForm'){e.preventDefault();A.saveEditCourse(e.target.dataset.id)}
});

/* ---------- boot ---------- */
$('#overlay').insertAdjacentHTML('beforebegin','<div id="focusHost"></div>');
S=load(); if(!S||!S.seq)fresh();
// older data stored pricing as free text; keep it only if it reads as a number
[...S.courses,...S.audits].forEach(x=>{if(typeof x.price==='string'){const p=toPrice(x.price);x.price=Number.isNaN(p)?null:p}});
// the E-Learning course type is now called Learning Plan
S.courses.forEach(c=>{if(c.type==='E-Learning')c.type='Learning Plan'});
// older tickets don't say who opened them: the auditor who added it later, otherwise the auditor of its audit
S.tickets.forEach(t=>{if(!t.createdBy)t.createdBy=S.logs.find(l=>l.ticketId===t.id&&l.action==='Added after audit')?.actor||S.audits.find(a=>a.id===t.auditId)?.auditor||''});
// fix date moves no longer wait for approval; drop any request saved by the earlier version
S.tickets.forEach(t=>{delete t.fixReq});
// older data only recorded passed audits as "last audited"; take the latest audit of any result
S.courses.forEach(c=>{const a=S.audits.filter(x=>x.courseId===c.id).sort((x,y)=>y.date-x.date)[0];
  if(a&&(!c.lastAudited||a.date>c.lastAudited)){c.lastAudited=a.date;c.lastAuditor=a.auditor}});
// an unfinished audit form does not survive a reload, so release its lock
S.courses.forEach(c=>{if(c.lockedBy){c.lockedBy=null;c.lockedAt=null;if(!openOf(c.id).length&&c.auditorStatus==='In Progress')c.auditorStatus='Pending'}});
$('#userSel').innerHTML=USERS.map(u=>`<option value="${u.id}">${u.name} · ${u.role}</option>`).join('');
render();
})();
