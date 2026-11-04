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
  const spread = $('tomeSpread'), toolbar = $('tomeToolbar');
  const prev = $('tomePrev'), next = $('tomeNext'), indicator = $('tomeProgress');
  const turn = $('tomeTurning'), turnFront = $('tomeTurnFront'), turnBack = $('tomeTurnBack');
  if (![root,shell,cover,left,right,shade,closeButton,prev,next,indicator,turn,turnFront,turnBack,spread,toolbar].every(Boolean)) {
    console.error('Tome HTML incomplete'); return;
  }
  let sessions = [], notesBySession = {}, pages = [], spreadIndex = 0, busy = false;
  let activeTurn = 0, motionToken = 0;
  const drafts = new Map();
  let state = 'closed';
  spread.inert=true;
  toolbar.inert=true;
  closeButton.disabled=true;
  const mobile = () => window.matchMedia('(max-width:740px)').matches;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  const sleep = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const totalSpreads = () => mobile() ? Math.max(1,pages.length) : Math.max(1, Math.ceil(pages.length / 2));
  const spreadOfPage = i => mobile() ? i : Math.floor(i/2);
  const firstSessionPage = id => pages.findIndex(page => page.kind === 'session' && page.session?.id === id);
  const lastSessionPage = id => pages.findLastIndex(page => page.kind === 'session' && page.session?.id === id);
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
    cover.setAttribute('aria-expanded','false');
    spread.setAttribute('aria-hidden','true');
    spread.inert=true;toolbar.inert=true;
    closeButton.disabled=true;
    shade.setAttribute('aria-hidden','true');
  }

  async function open() {
    if (state !== 'closed') return;
    const token = ++motionToken;
    state = 'moving'; root.dataset.state = 'moving';
    document.body.classList.add('book-open');
    cover.disabled = true;
    cover.setAttribute('aria-expanded','true');
    shade.setAttribute('aria-hidden','false');
    spreadIndex = 0;
    render();
    await sleep(reducedMotion()?0:1410);
    if (token !== motionToken) return;
    state = 'opening'; root.dataset.state = 'opening';
    await sleep(reducedMotion()?0:1840);
    if (token !== motionToken) return;
    state = 'open'; root.dataset.state = 'open';
    spread.inert=false;toolbar.inert=false;
    spread.setAttribute('aria-hidden','false');
    closeButton.disabled=false;
    closeButton.focus();
  }

  async function close() {
    if (state !== 'open') return;
    const token = ++motionToken;
    busy = true;
    state = 'closing'; root.dataset.state = 'closing';
    spread.inert=true;toolbar.inert=true;
    spread.setAttribute('aria-hidden','true');
    closeButton.disabled=true;
    await sleep(reducedMotion()?0:1780);
    if (token !== motionToken) return;
    state = 'returning'; root.dataset.state = 'returning';
    await sleep(reducedMotion()?0:1250);
    if (token !== motionToken) return;
    hideForRest();
    busy = false;
    cover.focus();
  }


  function pageHead(folio) {
    const head=el('div','tome-page-head');
    head.append(el('span','tome-overline','THE FAERIE’S FORTUNE'),
      el('span','tome-folio',folio));
    return head;
  }
  function noteElement(fragment) {
    const item=el('li',fragment.continued?'tome-note-continuation':'');
    item.append(el('span','tome-note-author',(fragment.note.user?.display_name||'Someone')+': '),
      document.createTextNode(fragment.text || ''),
      el('span','tome-note-time',timeLabelSafe(fragment.note.created_at)));
    return item;
  }

  // A hidden leaf with the exact same typography, width and footer height.
  // We measure actual rendered height, not character-count guesses. This
  // prevents notes from overflowing or requiring a scrollbar.
  function makeProbe(session,index,isLatest) {
    const probe=el('div','tome-page tome-page--right tome-probe');
    probe.setAttribute('aria-hidden','true');
    probe.appendChild(pageHead('FOLIO'));
    const scroll=el('div','tome-scroll');
    scroll.append(el('h2','tome-heading',session.label||'Session '+(index+1)),
      el('p','tome-date',dateLabel(session.started_at)));
    const list=el('ul','tome-note-list');scroll.appendChild(list);
    probe.appendChild(scroll);
    if(isLatest){
      const footer=el('form','tome-note-form');
      footer.append(el('input'),el('button','','Inscribe'));
      probe.appendChild(footer);
    } else probe.appendChild(el('p','tome-sealed','✦ This chapter is sealed.'));
    shell.appendChild(probe);
    return {probe,scroll,list};
  }
  function hasOverflow(scroll) {
    const available = scroll.clientHeight || Math.max(160,(shell.clientHeight || 650)-250);
    return scroll.scrollHeight > available + 2;
  }

  function splitOversizeNote(probe, note, remaining, isContinued) {
    const chars=Array.from(remaining);
    let low=1,high=chars.length,best=0;
    while(low<=high){
      const middle=Math.floor((low+high)/2);
      const test={note,text:chars.slice(0,middle).join(''),continued:isContinued};
      const row=noteElement(test);
      probe.list.appendChild(row);
      const fits=!hasOverflow(probe.scroll);
      row.remove();
      if(fits){best=middle;low=middle+1;}else high=middle-1;
    }
    const split=Math.max(1,best);
    // Prefer a natural word boundary as long as it doesn't waste most of a leaf.
    const candidate=chars.slice(0,split).join('');
    const space=candidate.lastIndexOf(' ');
    const cut=space>split*.63?Array.from(candidate.slice(0,space+1)).length:split;
    return {
      first:chars.slice(0,cut).join(''),
      rest:chars.slice(cut).join('')
    };
  }

  function paginateSession(session,index) {
    const notes=notesBySession[session.id]||[];
    const isLatest=index===sessions.length-1;
    const {probe,scroll,list}=makeProbe(session,index,isLatest);
    const chunks=[];
    let chunk=[];
    function finishChunk() {
      chunks.push(chunk);
      chunk=[];
      list.replaceChildren();
    }
    if(!notes.length){finishChunk();}
    else for(const note of notes){
      let remaining=String(note.note_text||'');
      if(!remaining)remaining=' ';
      let continued=false;
      let safety=0;
      while(remaining.length && ++safety<500){
        let fragment={note,text:remaining,continued};
        const node=noteElement(fragment);
        list.appendChild(node);
        if(!hasOverflow(scroll)){
          chunk.push(fragment);
          remaining='';
          break;
        }
        node.remove();
        if(chunk.length){
          finishChunk();
          continue;
        }
        // A single unusually long note is broken over several paper leaves.
        const part=splitOversizeNote({list,scroll},note,remaining,continued);
        fragment={note,text:part.first,continued};
        chunk.push(fragment);
        remaining=part.rest;
        continued=true;
        finishChunk();
      }
    }
    if(chunk.length)finishChunk();
    probe.remove();
    return chunks.map((fragments,part)=>({
      kind:'session',session,sessionIndex:index,
      part:part+1,parts:chunks.length,fragments,
      lastPart:part===chunks.length-1
    }));
  }

  function contentsCapacity() {
    const height=shell.clientHeight||700;
    // The contents page also has no scrollbars. Reserve the title,
    // introduction and navigation space, then fit chapter rows.
    return Math.max(2,Math.floor((height-370)/62));
  }

  function rebuildPages() {
    pages=[];
    const cap=contentsCapacity();
    if(!sessions.length)pages.push({kind:'contents',entries:[],part:1,parts:1});
    else {
      const chunks=[];
      for(let i=0;i<sessions.length;i+=cap)chunks.push(
        sessions.map((session,index)=>({session,index})).slice(i,i+cap));
      chunks.forEach((entries,i)=>pages.push({
        kind:'contents',entries,part:i+1,parts:chunks.length
      }));
    }
    sessions.forEach((session,i)=>pages.push(...paginateSession(session,i)));
  }

  function renderContents(target,page,staticOnly=false) {
    target.replaceChildren();
    target.setAttribute('aria-label','Table of contents'+(page.part>1?' continued':''));
    target.appendChild(pageHead('CONTENTS '+(page.parts>1?page.part+'/'+page.parts:'')));
    const content=el('div','tome-scroll');
    content.append(el('div','tome-contents-crest','☾  ✦  ☽'),
      el('h2','tome-contents-title',page.part===1?'Table of Contents':'Contents · Continued'),
      el('p','tome-contents-lead',page.part===1
        ?'Every chapter of your adventure, bound in ink and memory.'
        :'Further adventures await within these leaves.'));
    const list=el('ol','tome-index');
    page.entries.forEach(({session,index})=>{
      const item=el('li'),button=el('button','');
      button.type='button';
      button.append(el('span','',session.label||'Session '+(index+1)),
        el('small','',String(index+1).padStart(2,'0')));
      if(staticOnly){button.disabled=true;button.tabIndex=-1;}
      else button.addEventListener('click',()=>{
        const destination=firstSessionPage(session.id);
        if(destination>=0)changeSpread(spreadOfPage(destination));
      });
      item.appendChild(button);list.appendChild(item);
    });
    if(!sessions.length)list.append(el('li','tome-empty','No sessions have begun.'));
    content.appendChild(list);
    if(page.part===page.parts){
      const nav=el('nav','tome-toc-tools');
      nav.setAttribute('aria-label','Chronicle menu');
      const back=el('a','','← Your Parties');back.href='dashboard.html';
      const logout=el('button','','Log Out');logout.type='button';
      if(!staticOnly)logout.addEventListener('click',()=>{
        if(typeof signOutAndRedirect==='function')signOutAndRedirect();
      });
      else {logout.disabled=true;back.tabIndex=-1;}
      nav.append(back,logout);content.appendChild(nav);
    }
    target.appendChild(content);
  }

  function renderBlank(target) {
    target.replaceChildren();target.setAttribute('aria-label','Blank end page');
    target.appendChild(pageHead(''));
    const blank=el('div','tome-blank-content');
    blank.append(el('span','tome-blank-sigil','✦'),
      el('p','','The next chapter has not yet been written.'));
    target.appendChild(blank);
  }

  function renderSession(target,page,staticOnly=false) {
    const {session,sessionIndex,part,parts,fragments,lastPart}=page;
    const writable=lastPart && sessionIndex===sessions.length-1;
    target.replaceChildren();
    target.setAttribute('aria-label',(session.label||'Session '+(sessionIndex+1))+
      (parts>1?' continued page '+part:''));
    target.appendChild(pageHead('FOLIO '+String(sessionIndex+1).padStart(2,'0')+
      (parts>1?' · '+part+'/'+parts:'')));
    const scroll=el('div','tome-scroll');
    scroll.append(el('h2','tome-heading',(session.label||'Session '+(sessionIndex+1))+
      (part>1?' · continued':'')),
      el('p','tome-date',dateLabel(session.started_at)));
    if(!fragments.length)scroll.append(el('p','tome-empty','No notes have been recorded for this session.'));
    else {
      const list=el('ul','tome-note-list');
      fragments.forEach(fragment=>list.appendChild(noteElement(fragment)));
      scroll.appendChild(list);
    }
    target.appendChild(scroll);
    if(writable){
      const form=el('form','tome-note-form');
      const input=el('input');input.type='text';input.placeholder='Inscribe a memory…';
      input.maxLength=200;input.required=true;input.value=drafts.get(session.id)||'';
      input.setAttribute('aria-label','Write a note for '+(session.label||'Session '+(sessionIndex+1)));
      if(staticOnly){input.disabled=true;}
      else input.addEventListener('input',()=>drafts.set(session.id,input.value));
      const button=el('button','','Inscribe');button.type='submit';
      if(staticOnly)button.disabled=true;
      form.append(input,button);
      if(!staticOnly)form.addEventListener('submit',async event=>{
        event.preventDefault();
        const text=input.value.trim();
        if(!text||button.disabled||sessions[sessions.length-1]?.id!==session.id)return;
        button.disabled=true;
        const result=await new Promise(resolve=>{
          let settled=false;
          const timeout=setTimeout(()=>{
            if(!settled){settled=true;resolve({ok:false,error:'Save timed out. Please retry.'});}
          },13000);
          window.dispatchEvent(new CustomEvent('ff:tome:save-note',{detail:{
            sessionId:session.id,text,
            resolve(value){
              if(settled)return;
              settled=true;clearTimeout(timeout);resolve(value);
            }
          }}));
        });
        button.disabled=false;
        if(result?.ok){drafts.delete(session.id);input.value='';}
        else{
          input.setCustomValidity(result?.error||'Could not save this note.');
          input.reportValidity();input.setCustomValidity('');
        }
      });
      target.appendChild(form);
    }else if(lastPart)target.append(el('p','tome-sealed','✦ This chapter is sealed.'));
  }

  function renderPage(target,page,staticOnly=false){
    if(!page)return renderBlank(target);
    if(page.kind==='contents')return renderContents(target,page,staticOnly);
    renderSession(target,page,staticOnly);
  }
  function pagesForSpread(index){
    if(mobile())return {left:null,right:index};
    return {left:index*2,right:index*2+1};
  }
  function render(){
    spreadIndex=Math.max(0,Math.min(spreadIndex,totalSpreads()-1));
    const pair=pagesForSpread(spreadIndex);
    if(!mobile())renderPage(left,pages[pair.left]);
    renderPage(right,pages[pair.right]);
    prev.disabled=busy||spreadIndex===0;
    next.disabled=busy||spreadIndex>=totalSpreads()-1;
    const label=index=>{
      const page=pages[index];
      if(!page)return '';
      if(page.kind==='contents')return 'Contents'+(page.parts>1?' '+page.part+'/'+page.parts:'');
      return (page.session.label||'Session '+(page.sessionIndex+1))+
        (page.parts>1?' '+page.part+'/'+page.parts:'');
    };
    indicator.textContent=[mobile()?null:pair.left,pair.right]
      .filter(i=>i!==null&&pages[i]).map(label).join(' · ')||'Final leaf';
  }

  function animationFace(target,page,side){
    target.classList.add('tome-page');
    target.classList.toggle('tome-page--left',side==='left');
    target.classList.toggle('tome-page--right',side==='right');
    renderPage(target,page,true);
  }
  // The real contents of the two sides of a turning page are drawn *before*
  // movement starts. Adjacent leaves are changed while hidden under the moving
  // paper. This prevents the mid-flip text snapping that the old code had.
  async function changeSpread(target){
    if(state!=='open'||busy||target===spreadIndex||
      target<0||target>=totalSpreads())return;
    const direction=target>spreadIndex?1:-1;
    const current=pagesForSpread(spreadIndex);
    const destination=pagesForSpread(target);
    busy=true;
    prev.disabled=next.disabled=true;
    const turnId=++activeTurn;
    turn.className='tome-turn is-visible '+(direction>0?'is-next':'is-prev');
    if(mobile()){
      animationFace(turnFront,pages[current.right],'right');
      animationFace(turnBack,pages[destination.right],'right');
    }else if(direction>0){
      animationFace(turnFront,pages[current.right],'right');
      animationFace(turnBack,pages[destination.left],'left');
      renderPage(right,pages[destination.right]); // hidden behind the turning leaf
    }else{
      animationFace(turnFront,pages[current.left],'left');
      animationFace(turnBack,pages[destination.right],'right');
      renderPage(left,pages[destination.left]); // revealed beneath the turning leaf
    }
    void turn.offsetWidth;
    turn.classList.add('is-flipping');
    await sleep(reducedMotion()?0:1080);
    if(turnId!==activeTurn)return;
    spreadIndex=target;
    if(mobile())renderPage(right,pages[destination.right]);
    else if(direction>0)renderPage(left,pages[destination.left]);
    else renderPage(right,pages[destination.right]);
    turn.className='tome-turn';
    busy=false;
    render(); // rebind real inputs and restore independent focusable controls
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

  function reflow(options={}){
    const previous=pages[mobile()?spreadIndex:Math.min(pages.length-1,spreadIndex*2+1)];
    const previousId=previous?.session?.id;
    const previousPart=previous?.part || 1;
    rebuildPages();
    let chosen=-1;
    if(options.selectSessionId)chosen=lastSessionPage(options.selectSessionId);
    else if(previousId){
      chosen=pages.findIndex(page=>page.kind==='session' &&
        page.session.id===previousId && page.part===previousPart);
      if(chosen<0)chosen=lastSessionPage(previousId);
    }
    if(options.selectContents)chosen=0;
    if(chosen>=0)spreadIndex=spreadOfPage(chosen);
    else spreadIndex=Math.min(spreadIndex,totalSpreads()-1);
    render();
  }
  window.addEventListener('ff:tome:content',event=>{
    const d=event.detail||{};
    sessions=d.sessions||[];
    notesBySession=d.notesBySession||{};
    reflow(d);
  });
  window.addEventListener('ff:tome:error',event=>{
    const message=event.detail?.message||'Could not load the Chronicle.';
    right.replaceChildren(el('p','tome-empty',message));
  });
  let lastWidth=window.innerWidth,lastHeight=window.innerHeight;
  let resizeTimer;
  window.addEventListener('resize',()=>{
    computeRestPosition();
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(()=>{
      if(lastWidth!==window.innerWidth||lastHeight!==window.innerHeight){
        lastWidth=window.innerWidth;lastHeight=window.innerHeight;
        reflow();
      }
    },130);
  });
  if(document.fonts?.ready)document.fonts.ready.then(()=>reflow());
  computeRestPosition();
  render();
})();
