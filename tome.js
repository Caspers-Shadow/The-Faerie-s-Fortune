/* Faerie's Fortune Tome
 * One moving physical book, a real left/right spread, and one session per leaf.
 * Database access is delegated to party-room.js via ff:tome:* events.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = $('tomeRoot'), shell = $('tomeShell'), cover = $('tomeCover');
  const left = $('tomeLeftPage'), right = $('tomeRightPage');
  const shade = $('tomeShade'), closeButton = $('tomeClose');
  const prev = $('tomePrev'), next = $('tomeNext'), indicator = $('tomeProgress');
  const turn = $('tomeTurning'), turnFront = $('tomeTurnFront'), turnBack = $('tomeTurnBack');
  if (![root,shell,cover,left,right,shade,closeButton,prev,next,indicator,turn,turnFront,turnBack].every(Boolean)) {
    console.error('Tome HTML incomplete'); return;
  }
  let sessions = [], notesBySession = {}, spreadIndex = 0, busy = false;
  let activeTurn = 0, motionToken = 0;
  let state = 'closed';
  const mobile = () => window.matchMedia('(max-width:740px)').matches;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  const sleep = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const totalSpreads = () => mobile() ? sessions.length + 1 : Math.max(1, Math.ceil((sessions.length + 1) / 2));
  const sessionSpread = index => mobile() ? index + 1 : Math.floor((index + 1) / 2);
  const dateLabel = value => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.valueOf())
      ? date.toLocaleString(undefined,{year:'numeric',month:'long',day:'numeric'}) : '';
  };
  const timeLabelSafe = value => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.valueOf())
      ? date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}) : '';
  };

  function computeRestPosition() {
    // Physical cover (right half of the open spread) is the only visible part
    // when shut. This computes its correct position without negative overflow.
    const w = shell.offsetWidth, h = shell.offsetHeight;
    const onePage = mobile();
    const marginRight = onePage ? 29 : 47;
    const marginBottom = onePage ? 40 : 51;
    const desiredCoverWidth = onePage ? 150 : 228;
    const scale = Math.min(.63, Math.max(.22, desiredCoverWidth / Math.max(1,(onePage ? w : w/2))));
    const x = window.innerWidth / 2 - marginRight - w * scale / 2;
    const y = window.innerHeight / 2 - marginBottom - h * scale / 2;
    root.style.setProperty('--tome-rest-x', x.toFixed(1) + 'px');
    root.style.setProperty('--tome-rest-y', y.toFixed(1) + 'px');
    root.style.setProperty('--tome-rest-scale', scale.toFixed(4));
  }

  function hideForRest() {
    root.dataset.state = 'closed';
    state = 'closed';
    document.body.classList.remove('book-open');
    cover.disabled = false;
    shade.setAttribute('aria-hidden','true');
  }

  async function open() {
    if (state !== 'closed') return;
    const token = ++motionToken;
    state = 'moving'; root.dataset.state = 'moving';
    document.body.classList.add('book-open');
    cover.disabled = true;
    shade.setAttribute('aria-hidden','false');
    spreadIndex = 0;
    render();
    await sleep(reducedMotion()?0:1250);
    if (token !== motionToken) return;
    state = 'opening'; root.dataset.state = 'opening';
    await sleep(reducedMotion()?0:1780);
    if (token !== motionToken) return;
    state = 'open'; root.dataset.state = 'open';
    closeButton.focus();
  }

  async function close() {
    if (state !== 'open') return;
    const token = ++motionToken;
    busy = true;
    state = 'closing'; root.dataset.state = 'closing';
    await sleep(reducedMotion()?0:1780);
    if (token !== motionToken) return;
    state = 'returning'; root.dataset.state = 'returning';
    await sleep(reducedMotion()?0:1250);
    if (token !== motionToken) return;
    hideForRest();
    busy = false;
    cover.focus();
  }

  function pageHead(side, folio) {
    const head = el('div','tome-page-head');
    head.append(el('span','tome-overline','THE FAERIE’S FORTUNE'),
      el('span','tome-folio',folio));
    return head;
  }

  function renderContents(target) {
    target.replaceChildren();
    target.setAttribute('aria-label','Table of contents');
    target.append(pageHead('left','CONTENTS'));
    const scroll = el('div','tome-scroll');
    scroll.append(el('div','tome-contents-crest','☾  ✦  ☽'),
      el('h2','tome-contents-title','Table of Contents'),
      el('p','tome-contents-lead','Every chapter of your adventure, bound in ink and memory.'));
    const list = el('ol','tome-index');
    sessions.forEach((session,i) => {
      const item=el('li');
      const button=el('button','');
      button.type='button';
      button.append(el('span','',session.label || 'Session '+(i+1)),
        el('small','',''+String(i+1).padStart(2,'0')));
      button.addEventListener('click',()=>changeSpread(sessionSpread(i)));
      item.appendChild(button);list.appendChild(item);
    });
    if(!sessions.length) list.append(el('li','tome-empty','No sessions have begun.'));
    scroll.appendChild(list);
    const links=el('nav','tome-toc-tools');
    links.setAttribute('aria-label','Chronicle menu');
    const back=el('a','','← Your Parties');back.href='dashboard.html';
    const logout=el('button','','Log Out');logout.type='button';
    logout.addEventListener('click',()=>{ if(typeof signOutAndRedirect === 'function') signOutAndRedirect(); });
    links.append(back,logout);scroll.appendChild(links);
    target.appendChild(scroll);
  }

  function renderBlank(target) {
    target.replaceChildren();
    target.setAttribute('aria-label','Blank end page');
    target.append(pageHead('', ''));
    const blank=el('div','tome-blank-content');
    blank.append(el('span','tome-blank-sigil','✦'),
      el('p','','The next chapter has not yet been written.'));
    target.appendChild(blank);
  }

  function renderSession(target, index) {
    const session=sessions[index];
    if(!session) { renderBlank(target);return; }
    const writable=index===sessions.length-1;
    target.replaceChildren();
    target.setAttribute('aria-label',(session.label || 'Session '+(index+1))+' notes');
    target.append(pageHead('', 'FOLIO '+String(index+1).padStart(2,'0')));
    const scroll=el('div','tome-scroll');
    scroll.append(el('h2','tome-heading',session.label || 'Session '+(index+1)),
      el('p','tome-date',dateLabel(session.started_at)));
    const notes=notesBySession[session.id]||[];
    if (!notes.length) scroll.append(el('p','tome-empty','No notes have been recorded for this session.'));
    else {
      const list=el('ul','tome-note-list');
      notes.forEach(note=>{
        const item=el('li');
        item.append(el('span','tome-note-author',(note.user?.display_name||'Someone')+': '),
          document.createTextNode(note.note_text||''),
          el('span','tome-note-time',timeLabelSafe(note.created_at)));
        list.appendChild(item);
      });
      scroll.appendChild(list);
    }
    target.appendChild(scroll);
    if(!writable) target.append(el('p','tome-sealed','✦ This chapter is sealed.'));
    else {
      const form=el('form','tome-note-form');
      const input=el('input');input.type='text';input.placeholder='Inscribe a memory…';
      input.maxLength=200;input.required=true;input.setAttribute('aria-label','Write a note for '+(session.label||'Session '+(index+1)));
      const button=el('button','','Inscribe');button.type='submit';
      form.append(input,button);
      form.addEventListener('submit',async event=>{
        event.preventDefault();
        const text=input.value.trim();
        if (!text||button.disabled) return;
        if (sessions[sessions.length-1]?.id!==session.id) return;
        button.disabled=true;
        const result=await new Promise(resolve=>{
          let settled=false;
          const timeout=setTimeout(()=>{if(!settled){settled=true;resolve({ok:false,error:'Save timed out. Please retry.'});}},13000);
          window.dispatchEvent(new CustomEvent('ff:tome:save-note',{detail:{
            sessionId:session.id,text,
            resolve(value){if(settled)return;settled=true;clearTimeout(timeout);resolve(value);}
          }}));
        });
        button.disabled=false;
        if(result?.ok) input.value='';
        else {
          input.setCustomValidity(result?.error||'Could not save this note.');
          input.reportValidity();input.setCustomValidity('');
        }
      });
      target.appendChild(form);
    }
  }

  function pagesForSpread(index) {
    if(mobile()) return {left:null,right:index===0?null:index-1};
    return {left:index===0?null:2*index-1,right:2*index};
  }

  function render() {
    spreadIndex=Math.max(0,Math.min(spreadIndex,totalSpreads()-1));
    const pages=pagesForSpread(spreadIndex);
    if(!mobile()) {
      if(pages.left===null) renderContents(left);
      else renderSession(left,pages.left);
    }
    if(pages.right===null) renderContents(right);
    else renderSession(right,pages.right);
    prev.disabled=busy || spreadIndex===0;
    next.disabled=busy || spreadIndex>=totalSpreads()-1;
    if(spreadIndex===0) indicator.textContent=mobile()?'Contents':'Contents · Session 1';
    else {
      const labels=[pages.left,pages.right].filter(i=>i!==null && sessions[i]).map(i=>'Session '+(i+1));
      indicator.textContent=labels.join(' · ')||'Final leaf';
    }
  }

  function paintTurnFace(target, index) {
    target.replaceChildren();
    if(index===null) {
      target.append(el('p','tome-overline','THE FAERIE’S FORTUNE'),el('h2','tome-turn-title','Contents'));
    } else if (sessions[index]) {
      target.append(el('p','tome-overline','THE PARTY CHRONICLE'),
        el('h2','tome-turn-title',sessions[index].label||'Session '+(index+1)));
      const notes=notesBySession[sessions[index].id]||[];
      target.append(el('p','tome-turn-small',notes.length?notes.slice(0,2).map(n=>n.note_text||'').join('  ·  ').slice(0,170):'The parchment is quiet.'));
    } else target.append(el('p','tome-turn-small','Unwritten parchment'));
  }

  async function changeSpread(target) {
    if(state!=='open'||busy||target===spreadIndex||target<0||target>=totalSpreads())return;
    const direction=target>spreadIndex?1:-1;
    const oldPages=pagesForSpread(spreadIndex);
    const newPages=pagesForSpread(target);
    busy=true;prev.disabled=next.disabled=true;
    const turnId=++activeTurn;
    turn.className='tome-turn is-visible '+(direction>0?'is-next':'is-prev');
    paintTurnFace(turnFront,direction>0?oldPages.right:oldPages.left);
    paintTurnFace(turnBack,direction>0?newPages.left:newPages.right);
    // The next spread is exposed behind the moving leaf at the halfway point.
    void turn.offsetWidth;
    turn.classList.add('is-flipping');
    await sleep(reducedMotion()?0:430);
    if(turnId!==activeTurn)return;
    spreadIndex=target;render();
    await sleep(reducedMotion()?0:510);
    if(turnId!==activeTurn)return;
    turn.className='tome-turn';
    busy=false;render();
  }

  root.addEventListener('keydown',event=>{
    if(state!=='open')return;
    if(event.key==='Escape'){event.preventDefault();close();return;}
    const tag=event.target?.tagName;
    if(tag==='INPUT'||tag==='TEXTAREA')return;
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){
      event.preventDefault();changeSpread(spreadIndex+(event.key==='ArrowRight'?1:-1));
    }
  });
  cover.addEventListener('click',open);
  closeButton.addEventListener('click',close);
  shade.addEventListener('click',close);
  prev.addEventListener('click',()=>changeSpread(spreadIndex-1));
  next.addEventListener('click',()=>changeSpread(spreadIndex+1));
  window.addEventListener('ff:tome:content',event=>{
    const d=event.detail||{};
    sessions=d.sessions||[];
    notesBySession=d.notesBySession||{};
    if(d.selectContents)spreadIndex=0;
    else if(d.selectSessionId){
      const i=sessions.findIndex(s=>s.id===d.selectSessionId);
      if(i>=0)spreadIndex=sessionSpread(i);
    }
    render();
  });
  let mobileWas=mobile();
  window.addEventListener('resize',()=>{
    computeRestPosition();
    const isMobile=mobile();
    if(isMobile!==mobileWas){
      const previousPages=mobileWas?{right:spreadIndex?spreadIndex-1:null}:{
        right:spreadIndex*2
      };
      mobileWas=isMobile;
      const representative=previousPages.right;
      spreadIndex=representative===null?0:sessionSpread(Math.min(representative,Math.max(0,sessions.length-1)));
      render();
    }
  });
  computeRestPosition();
  render();
})();
