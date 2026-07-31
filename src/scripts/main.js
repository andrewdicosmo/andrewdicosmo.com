  // ---- analytics and funnel telemetry ----
  (function(){
    const site=window.__SITE||{};
    const analytics=site.analytics||{};
    const params=new URLSearchParams(window.location.search);
    const utm={};
    ['source','medium','campaign','term','content'].forEach(key=>{
      const value=params.get('utm_'+key);
      if(value)utm[key]=value.slice(0,180);
    });
    function randomId(){
      if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();
      return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
    }
    function sessionId(){
      try{
        const key='ad_site_session';
        let value=window.sessionStorage.getItem(key);
        if(!value){value=randomId();window.sessionStorage.setItem(key,value);}
        return value;
      }catch{return randomId();}
    }
    function visitorId(){
      try{
        const key='ad_site_visitor';
        let value=window.localStorage.getItem(key);
        if(!value){value=randomId();window.localStorage.setItem(key,value);}
        return value;
      }catch{return '';}
    }
    const sid=sessionId();
    const vid=visitorId();
    const pageContext={
      sessionId:sid,
      visitorId:vid,
      path:window.location.pathname,
      title:document.title,
      referrer:document.referrer||'',
      search:window.location.search||'',
      utm
    };
    function cleanProps(props){
      const out={};
      Object.entries(props||{}).forEach(([key,value])=>{
        if(value===undefined||value===null||value==='')return;
        if(typeof value==='string')out[key]=value.slice(0,240);
        else if(typeof value==='number'||typeof value==='boolean')out[key]=value;
        else out[key]=String(value).slice(0,240);
      });
      return out;
    }
    function firstParty(event,props){
      if(!analytics.firstPartyEnabled||!site.metricsEndpoint)return;
      const payload=JSON.stringify({
        event,
        props:cleanProps(props),
        sessionId:sid,
        page:pageContext,
        clientTime:new Date().toISOString()
      });
      try{
        if(navigator.sendBeacon){
          if(navigator.sendBeacon(site.metricsEndpoint,new Blob([payload],{type:'application/json'})))return;
        }
      }catch{}
      fetch(site.metricsEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:payload,keepalive:true}).catch(()=>{});
    }
    function thirdParty(event,props){
      const clean=cleanProps(props);
      if(typeof window.gtag==='function')window.gtag('event',event,clean);
      if(typeof window.clarity==='function'){
        window.clarity('event',event);
        Object.entries(clean).slice(0,8).forEach(([key,value])=>window.clarity('set',key,String(value)));
      }
    }
    window.__analyticsContext=function(){
      return {
        sessionId:sid,
        visitorId:vid,
        landingPage:pageContext.path,
        referrer:pageContext.referrer,
        utm
      };
    };
    window.__track=function(event,props){
      if(!event)return;
      firstParty(event,props);
      thirdParty(event,props);
    };
    window.__track('page_view',{path:window.location.pathname});
  })();

  // Open every off-site destination, including the canonical site domain, in a separate tab.
  document.querySelectorAll('a[href]').forEach(link=>{
    const rawHref=link.getAttribute('href');
    if(!rawHref||rawHref.startsWith('#'))return;
    try{
      const destination=new URL(rawHref,window.location.href);
      const isHttp=destination.protocol==='http:'||destination.protocol==='https:';
      const isPortfolioDomain=['andrewdicosmo.com','www.andrewdicosmo.com'].includes(destination.hostname);
      if(destination.protocol==='mailto:'||destination.protocol==='tel:'){
        link.addEventListener('click',()=>window.__track&&window.__track('contact_click',{
          method:destination.protocol.slice(0,-1)
        }));
      }
      if(isHttp&&(isPortfolioDomain||destination.origin!==window.location.origin)){
        link.target='_blank';
        link.rel='noopener noreferrer';
        link.addEventListener('click',()=>window.__track&&window.__track('external_link_click',{
          href:destination.href,
          text:link.textContent.trim().slice(0,80)
        }));
      }
    }catch{}
  });

  // ---- sector radar sweep detection ----
  (function(){
    const sec=document.getElementById('sectors');
    const rot=document.getElementById('sweep-rot');
    const count=document.getElementById('radar-count');
    if(!sec||!rot)return;
    sec.classList.add('scanning');
    let started=false, t0=0, found=0;
    // The sweep keeps rotating forever, but detection is monotonic: sectors
    // reveal on the first spin, contact boxes fill over the next three, and
    // then everything holds. No reset — wiping the table a reader is mid-way
    // through felt like the site taking the payoff back.
    function frame(now){
      if(!t0)t0=now;
      const deg=((now-t0)/7000*360);
      rot.setAttribute('transform','rotate('+(deg%360)+' 220 220)');
      if(deg<=362){
        const SCn=(window.__SITE&&window.__SITE.sectorCount)||8;const STEPn=360/SCn;const n=Math.min(SCn,Math.floor(deg/STEPn)+ (deg%STEPn>2?1:0));
        for(let i=found;i<n;i++){
          const b=document.getElementById('sb-'+i), r=document.getElementById('sr-'+i);
          if(b)b.classList.add('on'); if(r)r.classList.add('found');
          found=i+1;
          const SC=(window.__SITE&&window.__SITE.sectorCount)||8;const DONE=(window.__SITE&&window.__SITE.radarDone)||'ALL SECTORS';count.textContent=found<SC?(found+' OF '+SC):DONE;
        }
      }
      // contact strength: one box per beam pass over each sector's bearing
      const SCT=(window.__SITE&&window.__SITE.sectorCount)||8;const STEP=360/SCT;let full=true;for(let i=0;i<SCT;i++){
        const bearing=i*STEP+2;
        const passes=deg>=bearing?Math.min(4,Math.floor((deg-bearing)/360)+1):0;
        if(passes<4)full=false;
        const sig=document.getElementById('sig-'+i);
        if(sig){const boxes=sig.children;
          for(let k=0;k<4;k++){boxes[k].classList.toggle('lit',k<passes);}
        }
      }
      // once every sector is revealed and at full contact strength the state
      // is stable; keep spinning the beam only (cheaper frame)
      if(full){ (function spin(t){ rot.setAttribute('transform','rotate('+(((t-t0)/7000*360)%360)+' 220 220)'); requestAnimationFrame(spin); })(now); return; }
      requestAnimationFrame(frame);
    }
    const io=new IntersectionObserver(es=>{
      es.forEach(e=>{ if(e.isIntersecting&&!started){started=true;requestAnimationFrame(frame);io.disconnect();} });
    },{threshold:.35});
    io.observe(sec);
  })();

  // ---- hero door routing ----
  function goDoor(id){
    const el=document.getElementById(id);
    el.scrollIntoView({behavior:'smooth',block:'center'});
    el.classList.remove('hl');void el.offsetWidth;el.classList.add('hl');
  }
  window.goDoor=goDoor;
  const paths={w2:false,c2c:false,cto:false};
  function toggleDoor(k){
    if(!(k in paths))return;
    paths[k]=!paths[k];
    const ids={w2:'door-hire',c2c:'door-firm',cto:'door-leadership'};
    const d=document.getElementById(ids[k]);
    d.classList.toggle('sel',paths[k]);
    d.setAttribute('aria-pressed',paths[k]);
    document.getElementById('dsel-'+k).textContent=paths[k]?'Selected':'Select';
    if(window.__track)window.__track('engagement_path_toggle',{path:k,selected:paths[k],w2:paths.w2,c2c:paths.c2c,cto:paths.cto});
    buildBrief();
  }
  window.toggleDoor=toggleDoor;
  function buildBrief(){
    const any=paths.w2||paths.c2c||paths.cto;
    document.getElementById('brief-empty').style.display=any?'none':'block';
    document.getElementById('brief-form').style.display=any?'flex':'none';
    document.getElementById('fs-w2').classList.toggle('show',paths.w2);
    document.getElementById('fs-c2c').classList.toggle('show',paths.c2c);
    document.getElementById('fs-cto').classList.toggle('show',paths.cto);
    const t=document.getElementById('brief-title');
    const m=document.getElementById('bmsg');
    const ml=document.getElementById('bmsg-label');
    const resumeMatch=document.getElementById('resume-match-name');
    const selected=[paths.w2?'Full-Time Role':'',paths.c2c?'Consulting Project':'',paths.cto?'Technology Leadership':''].filter(Boolean);
    if(resumeMatch)resumeMatch.textContent=paths.cto?'Technology Executive Resume':'Engineering & Delivery Resume';
    if(selected.length>1){t.textContent='Your Inquiry \u00b7 '+selected.join(' + ');m.placeholder='Tell me what you need, your priorities, timing, and what a successful outcome would look like.';if(ml)ml.textContent='Tell me about the opportunity \u00b7 required';}
    else if(paths.w2){t.textContent='Your Inquiry \u00b7 Full-Time Role';m.placeholder='Tell me about the role, team, timing, and what success would look like.';if(ml)ml.textContent='Tell me about the role \u00b7 required';}
    else if(paths.c2c){t.textContent='Your Inquiry \u00b7 Consulting Project';m.placeholder='Tell me about the problem, desired outcome, timing, and any important constraints.';if(ml)ml.textContent='Tell me about the project \u00b7 required';}
    else if(paths.cto){t.textContent='Your Inquiry \u00b7 Technology Leadership';m.placeholder='Tell me about the organization, leadership need, priorities, team, and timing.';if(ml)ml.textContent='Tell me about the leadership need \u00b7 required';}
    else{t.textContent='How Would You Like to Work Together?';}
  }
  function startBrief(type){
    if(window.__track)window.__track('hero_cta_click',{path:type});
    if(!paths[type])toggleDoor(type);
    goDoor('brief');
    setTimeout(()=>document.getElementById('bname').focus({preventScroll:true}),600);
  }
  window.startBrief=startBrief;
  let briefSending=false;
  function setBriefSending(sending){
    briefSending=sending;
    const button=document.getElementById('brief-submit');
    if(!button)return;
    button.disabled=sending;
    button.textContent=sending?'Sending inquiry...':'Send inquiry · Receive the resume';
    button.setAttribute('aria-busy',String(sending));
  }
  document.querySelectorAll('[data-brief-path]').forEach(button=>{
    button.addEventListener('click',()=>startBrief(button.dataset.briefPath));
  });
  const inquiryForm=document.getElementById('brief-form');
  if(inquiryForm){
    inquiryForm.addEventListener('focusin',()=>{
      if(window.__track)window.__track('inquiry_form_started',{w2:paths.w2,c2c:paths.c2c,cto:paths.cto});
    },{once:true});
  }
  function showBriefErrors(messages){
    const box=document.getElementById('brief-errors');
    if(!box)return;
    box.replaceChildren();
    box.hidden=!messages.length;
    if(!messages.length)return;
    const title=document.createElement('b');
    title.textContent='Complete the inquiry';
    const list=document.createElement('ul');
    messages.forEach(message=>{const item=document.createElement('li');item.textContent=message;list.appendChild(item);});
    box.append(title,list);
  }
  function validateBrief(form){
    form.querySelectorAll('.err').forEach(el=>{el.classList.remove('err');el.removeAttribute('aria-invalid');});
    const errors=[];
    let firstTarget=null;
    const add=(message,target)=>{
      errors.push(message);
      if(target){target.classList.add('err');target.setAttribute('aria-invalid','true');if(!firstTarget)firstTarget=target;}
    };
    const name=document.getElementById('bname');
    const email=document.getElementById('bemail');
    const company=document.getElementById('bcompany');
    const role=document.getElementById('brole');
    const msg=document.getElementById('bmsg');
    const jrFile=document.getElementById('jrfile');
    const jrLink=document.getElementById('jr-link');
    const reqWrap=document.getElementById('job-requirement');
    const workAreas=document.getElementById('work-areas');
    const selectedChips=[...form.querySelectorAll('.pchip.on')].map(c=>c.textContent.trim());
    const specificChips=selectedChips.filter(chip=>chip.toLowerCase()!=='not sure yet');
    const context=msg.value.trim();
    const validEmail=/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim());
    const file=jrFile&&jrFile.files&&jrFile.files[0];
    const fileTooLarge=!!(file&&file.size>=5*1024*1024);
    const linkValue=(jrLink&&jrLink.value.trim())||'';
    let validLink=!linkValue;
    if(linkValue){
      try{validLink=new URL(linkValue).protocol==='https:';}catch{validLink=false;}
    }
    const hasContext=context.length>=40;

    if(!paths.w2&&!paths.c2c&&!paths.cto)add('Select at least one way you would like to work together.');
    if(!name.value.trim())add('Enter your name.',name);
    if(!validEmail)add('Enter a valid email address.',email);
    if(!company.value.trim())add('Enter your company or organization.',company);
    if(!role.value.trim())add('Enter your title or role.',role);
    if(fileTooLarge)add('Keep the job description attachment under 5 MB.',reqWrap);
    if(!validLink)add('Enter a valid link to the job posting.',jrLink);

    const selectedPathCount=Number(paths.w2)+Number(paths.c2c)+Number(paths.cto);
    if(paths.w2&&selectedPathCount===1&&!hasContext){
      add('Please describe the role in at least 40 characters.',msg);
    }else if(paths.c2c&&selectedPathCount===1){
      if(!specificChips.length)add('Select at least one type of help you need.',workAreas);
      if(!hasContext)add('Please describe the project in at least 40 characters.',msg);
    }else if(paths.cto&&selectedPathCount===1&&!hasContext){
      add('Please describe the leadership need in at least 40 characters.',msg);
    }else if(selectedPathCount>1&&!hasContext){
      add('Please describe the opportunity in at least 40 characters.',msg);
    }

    showBriefErrors(errors);
    if(errors.length&&window.__track)window.__track('inquiry_validation_failed',{w2:paths.w2,c2c:paths.c2c,cto:paths.cto,errorCount:errors.length});
    if(firstTarget){
      if(typeof firstTarget.focus==='function')firstTarget.focus({preventScroll:true});
      firstTarget.scrollIntoView({behavior:'smooth',block:'center'});
    }
    return {ok:!errors.length,name,email,company,role,msg,jrFile,jrLink,selectedChips};
  }
  function sendBrief(){
    if(briefSending)return;
    const form=document.getElementById('brief-form');
    const validation=validateBrief(form);
    if(!validation.ok)return;
    const {name,email,company,role,msg,jrFile,jrLink,selectedChips}=validation;
    const fields=[...form.querySelectorAll('select')]
      .filter(sel=>{
        const group=sel.closest('.fs');
        return (!group||group.classList.contains('show'))&&sel.selectedIndex>0;
      })
      .map(sel=>({label:sel.closest('div')?.querySelector('label')?.textContent||'',value:sel.value}));
    const payload={
      paths:{w2:paths.w2,c2c:paths.c2c,cto:paths.cto},
      fields,
      chips:selectedChips,
      name:name.value.trim(), email:email.value.trim(),
      company:company.value.trim(), role:role.value.trim(),
      reqLink:(jrLink&&jrLink.value.trim())||'', brief:(msg&&msg.value.trim())||'',
      analytics:window.__analyticsContext?window.__analyticsContext():undefined
    };
    const finish=(bookingsUrl,resumeType,emailAccepted,contactEmail)=>{
      const sw=document.getElementById('sched-wrap');
      const executiveResume=resumeType==='executive';
      const successTitle=document.getElementById('brief-success-title');
      const successCopy=document.getElementById('brief-success-copy');
      // only offer the scheduler when a bookings page actually exists;
      // otherwise the anchor would point at "#" and go nowhere
      sw.style.display=bookingsUrl?'block':'none';
      if(bookingsUrl){
        const a=sw.querySelector('a');
        if(a){
          a.href=bookingsUrl;
          if(!a.dataset.bookingTracked){
            a.dataset.bookingTracked='true';
            a.addEventListener('click',()=>window.__track&&window.__track('booking_click'));
          }
        }
      }
      if(successTitle)successTitle.textContent=emailAccepted
        ?(executiveResume?'Technology Executive Resume Sent':'Engineering & Delivery Resume Sent')
        :'Inquiry Received';
      if(successCopy)successCopy.textContent=emailAccepted
        ?(executiveResume
          ?'Check your inbox. The Technology Executive resume is on its way, and I will follow up within one business day. If it does not arrive, check spam or write me directly.'
          :'Check your inbox. The Engineering & Delivery resume is on its way, and I will follow up within one business day. If it does not arrive, check spam or write me directly.')
        :`Your inquiry was saved, but the resume email could not be sent.${contactEmail?` Please email ${contactEmail} directly.`:' Please contact Andrew directly.'}`;
      form.style.display='none';
      document.getElementById('brief-done').style.display='block';
      if(window.__track)window.__track('inquiry_submit_success',{w2:paths.w2,c2c:paths.c2c,cto:paths.cto,resumeType:resumeType||'standard',hasBookingUrl:!!bookingsUrl});
      goDoor('brief');
    };
    const send=(fileB64,fileName)=>{
      if(fileB64){payload.attachment={name:fileName,data:fileB64};}
      setBriefSending(true);
      if(window.__track)window.__track('inquiry_submit_attempt',{w2:paths.w2,c2c:paths.c2c,cto:paths.cto,hasAttachment:!!fileB64,hasJobLink:!!payload.reqLink});
      fetch((window.__SITE&&window.__SITE.apiEndpoint)||'/api/brief',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
        .then(async r=>{
          const data=await r.json().catch(()=>({}));
          if(!r.ok){const error=new Error(data.error||'Submission failed');error.messages=data.missing;error.status=r.status;throw error;}
          return data;
        })
        .then(d=>finish(d&&d.bookingsUrl,d&&d.resumeType,d&&d.emailAccepted,d&&d.contactEmail))
        .catch(error=>{
          if(window.__track)window.__track('inquiry_submit_failed',{w2:paths.w2,c2c:paths.c2c,cto:paths.cto,hasServerMessages:Array.isArray(error.messages)&&error.messages.length>0});
          showBriefErrors(Array.isArray(error.messages)&&error.messages.length
            ?error.messages
            :[Number(error.status)>=500||!error.status
              ?'The inquiry service had a temporary error. Your information may already be saved; wait a moment before trying again.'
              :'The inquiry could not be sent. Please review the fields and try again.']);
        })
        .finally(()=>setBriefSending(false));
    };
    if(jrFile&&jrFile.files&&jrFile.files[0]&&jrFile.files[0].size<5*1024*1024){
      const rd=new FileReader();
      rd.onload=()=>send(String(rd.result).split(',')[1],jrFile.files[0].name);
      rd.onerror=()=>send(null,null);
      rd.readAsDataURL(jrFile.files[0]);
    } else send(null,null);
  }
  window.sendBrief=sendBrief;
  function jrPicked(inp){
    const b=document.getElementById('jrbtn');
    if(inp.files&&inp.files[0]){
      const name=inp.files[0].name||'';
      const ext=name.includes('.')?name.split('.').pop().toLowerCase():'unknown';
      b.textContent=inp.files[0].name;b.classList.add('has');
      if(window.__track)window.__track('job_attachment_selected',{extension:ext,sizeBucket:inp.files[0].size>1024*1024?'1mb_plus':'under_1mb'});
    }
    else{b.textContent='Attach job description';b.classList.remove('has');}
  }
  window.jrPicked=jrPicked;

  // ---- theme switcher ----
  document.querySelectorAll('.tbtn').forEach(b=>{
    b.addEventListener('click',()=>{
      document.body.dataset.theme=b.dataset.t;
      document.querySelectorAll('.tbtn').forEach(x=>x.classList.toggle('on',x===b));
      if(window.__track)window.__track('theme_change',{theme:b.dataset.t});
    });
  });

  // ---- typewriter ----
  const msg=(window.__SITE&&window.__SITE.typedBrief)||"MISSION STATUS // READ ON";
  const t=document.getElementById('typed');let ti=0;
  (function type(){ if(ti<=msg.length){t.textContent=msg.slice(0,ti++);setTimeout(type,34);} })();

  // ---- redaction ----
  // hover reveals on desktop; click covers touch, focus covers keyboard.
  // Most visitors never think to hover, so the bars also auto-declassify a
  // beat after the typewriter finishes, staggered so it plays as a reveal.
  const redactions=[...document.querySelectorAll('.redact')];
  const resetRedactions=()=>redactions.forEach(r=>{
    r.classList.remove('open');
    r.setAttribute('aria-expanded','false');
  });
  redactions.forEach((r,i)=>{
    r.setAttribute('tabindex','0');
    r.setAttribute('role','button');
    r.setAttribute('aria-expanded','false');
    const reveal=()=>{
      r.classList.add('open');
      r.setAttribute('aria-expanded','true');
    };
    r.addEventListener('mouseenter',reveal);
    r.addEventListener('focus',reveal);
    r.addEventListener('click',()=>{
      r.classList.toggle('open');
      r.setAttribute('aria-expanded',String(r.classList.contains('open')));
    });
    setTimeout(reveal,msg.length*34+900+i*400);
  });
  setTimeout(resetRedactions,msg.length*34+12000);

  // ---- grid ----
  const grid=document.getElementById('grid');
  for(let x=0;x<=420;x+=42){grid.innerHTML+=`<line class="grid-line" x1="${x}" y1="0" x2="${x}" y2="300"/>`}
  for(let y=0;y<=300;y+=42){grid.innerHTML+=`<line class="grid-line" x1="0" y1="${y}" x2="420" y2="${y}"/>`}

  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- satellite pass ----
  const sat=document.getElementById('sat'),scan=document.getElementById('scan'),beam=document.getElementById('beam');
  const conf=document.getElementById('conf'),xlog=document.getElementById('xlog');
  const targets=[
    {x:100,b:'b2',t:'t2',f:'veh1G',log:['&gt; CLASS: <span class="hl">VEHICLE</span> · CONF <span class="ok">96.2%</span> · MOVING','&gt; TRACK INITIATED ... <span class="ok">OK</span>']},
    {x:112,b:'b1',t:'t1',f:'baseG',log:['&gt; TARGET LOCK 41.62N 87.09W','&gt; CLASS: <span class="hl">BASE STRUCTURES</span> · CONF <span class="ok">97.4%</span>','&gt; EXTRACT → FEATURE DB ... <span class="ok">OK</span>']},
    {x:221,b:'b3',t:'t3',f:'conG',log:['&gt; CLASS: <span class="hl">NEW CONSTRUCTION</span> · CONF <span class="ok">93.1%</span>','&gt; DIFF vs PASS 2026.05 ... <span class="ok">+1 HANGAR FOOTPRINT</span>']},
    {x:302,b:'b4',t:'t4',log:['&gt; CLOUD COVER <span class="hl">18% OF SCENE</span> · PIXELS MASKED','&gt; RE-COLLECT <span class="ok">QUEUED</span>']},
    {x:308,b:'b4v',t:'t4v',f:'veh2G',log:['&gt; PARTIAL RETURN AT CLOUD EDGE','&gt; CLASS: <span class="hl">VEHICLE</span> · CONF <span class="ok">41%</span> · <span class="hl">LOW CONF</span> · AWAITING RE-COLLECT']},
    {x:344,b:'b5',t:'t5',f:'jetG',log:['&gt; TARGET LOCK 41.64N 86.98W','&gt; CLASS: <span class="hl">AIRCRAFT</span> · CONF <span class="ok">98.8%</span> · ON APRON','&gt; EXTRACT → FEATURE DB ... <span class="ok">OK</span>']}
  ];
  let logQueue=[],logging=false;
  function pushLog(lines){logQueue.push(...lines);if(!logging)drain();}
  function drain(){
    logging=true;
    (function next(){
      if(!logQueue.length){logging=false;return}
      const div=document.createElement('div');
      div.innerHTML=logQueue.shift();
      xlog.appendChild(div);
      while(xlog.children.length>5)xlog.removeChild(xlog.firstChild);
      setTimeout(next,340);
    })();
  }
  function resetPass(){
    targets.forEach(tg=>{document.getElementById(tg.b).classList.remove('lock');document.getElementById(tg.t).classList.remove('lock');if(tg.f)document.getElementById(tg.f).classList.remove('feat-hot');tg.done=false});
    resetRedactions();
  }
  // ---- imagery view modes ----
  const viewCfg={
    eo:  {sensor:'SENSOR  OPTICAL · EO',       layers:{Lndvi:false,Lvector:false,Lshadow:true, LshadowDrift:true, Lglint:true }},
    ndvi:{sensor:'SENSOR  MULTISPECTRAL·NDVI', layers:{Lndvi:true, Lvector:false,Lshadow:false,LshadowDrift:false,Lglint:false}},
    gis: {sensor:'SENSOR  SAR + VECTOR · GIS', layers:{Lndvi:false,Lvector:true, Lshadow:false,LshadowDrift:false,Lglint:false}}
  };
  const hudSensor=document.getElementById('hudSensor');
  const viewButtons=[...document.querySelectorAll('.vm')];
  let viewTourTimer=null;
  function stopViewTour(){
    if(viewTourTimer)clearTimeout(viewTourTimer);
    viewTourTimer=null;
  }
  function setView(m,source='manual'){
    const cfg=viewCfg[m];
    Object.entries(cfg.layers).forEach(([id,on])=>{
      const el=document.getElementById(id);
      if(el)el.style.display=on?'':'none';
    });
    hudSensor.textContent=cfg.sensor;
    viewButtons.forEach(b=>{
      const active=b.dataset.m===m;
      b.classList.toggle('on',active);
      b.setAttribute('aria-pressed',String(active));
    });
    if(source==='manual'&&window.__track)window.__track('hero_view_selected',{view:m});
  }
  viewButtons.forEach(b=>b.addEventListener('click',()=>{
    stopViewTour();
    setView(b.dataset.m);
  }));
  setView('eo','initial');
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    const guidedViews=['ndvi','gis','eo'];
    let guidedIndex=0;
    const advanceViewTour=()=>{
      if(guidedIndex>=guidedViews.length){stopViewTour();return;}
      setView(guidedViews[guidedIndex++],'tour');
      viewTourTimer=setTimeout(advanceViewTour,3200);
    };
    viewTourTimer=setTimeout(advanceViewTour,2600);
  }

  // ---- HUD: ticking timestamp ----
  const hudTime=document.getElementById('hudTime');
  const t0=Date.now(), base=Date.UTC(2026,6,7,21,9,15);
  setInterval(()=>{
    const d=new Date(base+(Date.now()-t0));
    hudTime.textContent=d.toISOString().replace(/\.\d+Z$/,'Z');
  },1000);

  const hudll=document.getElementById('hudll');
  let px=-40;
  function frame(){
    px+=0.9; if(px>470){px=-40;resetPass();pushLog(['&gt; PASS COMPLETE · RE-TASKING ...'])}
    const y=22+Math.sin(px/90)*5;
    sat.setAttribute('transform',`translate(${px},${y})`);
    scan.setAttribute('x1',px);scan.setAttribute('x2',px);scan.setAttribute('y1',y+14);
    beam.setAttribute('points',`${px-1},${y+12} ${px+1},${y+12} ${px+26},300 ${px-26},300`);
    // live coordinates track the sensor footprint
    const s=Math.max(2,Math.min(59,24-((px-210)*0.045)));
    hudll.textContent=`41°37'12.4"N 87°05'${s.toFixed(1).padStart(4,'0')}"W`;
    targets.forEach(tg=>{
      if(!tg.done && px>=tg.x){
        tg.done=true;
        document.getElementById(tg.b).classList.add('lock');
        document.getElementById(tg.t).classList.add('lock');
        if(tg.f)document.getElementById(tg.f).classList.add('feat-hot');
        conf.textContent='CV MODEL · DETECTING';
        pushLog(tg.log);
      }
    });
    requestAnimationFrame(frame);
  }
  if(!reduced){
    pushLog(['&gt; UPLINK ESTABLISHED','&gt; CV MODEL LOADED · <span class="ok">READY</span>']);
    requestAnimationFrame(frame);
  }else{
    targets.forEach(tg=>{document.getElementById(tg.b).classList.add('lock');document.getElementById(tg.t).classList.add('lock');if(tg.f)document.getElementById(tg.f).classList.add('feat-hot')});
    xlog.innerHTML='<div>&gt; 5 TARGETS · 1 OBSCURED BY CLOUD → RE-COLLECT · <span class="ok">OK</span></div>';
  }

  // ---- InstaMapp pipeline state machine ----
  const iscan=document.getElementById('iscan'),ibrk=document.getElementById('ibrk'),itag=document.getElementById('itag');
  const ifields=document.getElementById('ifields'),istate=document.getElementById('istate'),iverdict=document.getElementById('iverdict');
  const mrows=[...document.querySelectorAll('.m-row')];
  const steps=[...document.querySelectorAll('.step')];
  const fieldLines=[
    'ITEM&nbsp;&nbsp;&nbsp;&nbsp;<b>SAMPLE CARD · “HOLO VARIANT”</b>',
    'SET&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>SERIES 4 · #087</b>',
    'ATTRS&nbsp;&nbsp;&nbsp;<b>NEAR MINT · 1ST EDITION</b> ... <span class="ok">EXTRACTED</span>'
  ];
  function setStep(n){steps.forEach(s=>s.classList.toggle('on',+s.dataset.s===n));}
  function iReset(){
    iscan.style.opacity=0;ibrk.classList.remove('lock');itag.classList.remove('lock');
    ifields.innerHTML='';mrows.forEach(r=>r.classList.remove('on'));iverdict.classList.remove('on');
  }
  function runPipeline(){
    iReset();
    // STEP 1: scan sweep
    setStep(0);istate.textContent='SCANNING';
    iscan.style.opacity=1;
    iscan.animate([{top:'14px'},{top:'168px'},{top:'14px'}],{duration:1800,easing:'ease-in-out'});
    setTimeout(()=>{
      // STEP 2: recognize
      iscan.style.opacity=0;setStep(1);istate.textContent='RECOGNIZING';
      ibrk.classList.add('lock');itag.classList.add('lock');
    },1900);
    setTimeout(()=>{
      // STEP 3: extract fields
      setStep(2);istate.textContent='EXTRACTING';
      fieldLines.forEach((ln,i)=>setTimeout(()=>{
        const d=document.createElement('div');d.innerHTML='&gt; '+ln;ifields.appendChild(d);
      },i*500));
    },2900);
    setTimeout(()=>{
      // STEP 4: market check
      setStep(3);istate.textContent='CHECKING MARKET';
      mrows.forEach((r,i)=>setTimeout(()=>r.classList.add('on'),i*380));
    },4800);
    setTimeout(()=>{
      // STEP 5: verdict
      setStep(4);istate.textContent='PRICED';
      iverdict.classList.add('on');
    },6600);
    setTimeout(runPipeline,10200); // loop
  }
  if(!reduced){runPipeline();}
  else{
    setStep(4);ibrk.classList.add('lock');itag.classList.add('lock');
    ifields.innerHTML=fieldLines.map(l=>'<div>&gt; '+l+'</div>').join('');
    mrows.forEach(r=>r.classList.add('on'));iverdict.classList.add('on');
    istate.textContent='PRICED';
  }

  // ---- DCOSMOS dual lifecycle animation (customer + hiring) ----
  const stagesG=document.getElementById('stages');
  const STG_Y=100,STG_W=64,STG_H=46;
  const STG_X=[8,76,144,212,280,348];
  STG_X.forEach((x,i)=>{
    stagesG.innerHTML+=`<rect class="mod" id="stg${i}" x="${x}" y="${STG_Y}" width="${STG_W}" height="${STG_H}" rx="3"/>
      <text class="mod-lbl" id="stgl${i}" x="${x+STG_W/2}" y="${STG_Y+27}" text-anchor="middle"></text>`;
  });
  const stg=i=>document.getElementById('stg'+i), stgl=i=>document.getElementById('stgl'+i);
  const cdot=document.getElementById('cdot');
  const inPaths=[0,1,2].map(i=>document.getElementById('in'+i));
  const srcLbls=[0,1,2].map(i=>document.getElementById('src'+i));
  const jname=document.getElementById('jname');
  const aiBoxes=[...document.querySelectorAll('svg rect')].filter(r=>+r.getAttribute('y')===222);
  const dclog=document.getElementById('dclog');

  let hireW2=true; // alternate W2 / C2C on hiring cycles
  const journeys=[
    { // customer lifecycle
      name:'CUSTOMER LIFECYCLE',
      sources:['WEB FORM','MARKETPLACE','REFERRAL'],
      sourceLogs:[
        '&gt; WEB FORM FILLED → <span class="hl">LEAD CREATED</span> · <span class="ok">PIPELINE</span>',
        '&gt; MARKETPLACE INQUIRY → <span class="hl">LEAD CREATED</span> · <span class="ok">PIPELINE</span>',
        '&gt; REFERRAL RECEIVED → <span class="hl">LEAD CREATED</span> · <span class="ok">PIPELINE</span>'
      ],
      stages:['LEAD','CRM','QUOTE','CUSTOMER','NURTURE','INVOICE'],
      info:[
        '<b>LEAD</b> · Every source lands here: web forms, marketplace inquiries, referrals. The sales pipeline is the single front door, and AI can go find similar prospects.',
        '<b>CRM</b> · Contact and company records enriched automatically. Every interaction from here forward is logged against one record.',
        '<b>QUOTE</b> · AI drafts the quote, you approve, the system sends it and tracks the open.',
        '<b>CUSTOMER</b> · Won deals convert with full history intact. No retyping data into a second tool.',
        '<b>NURTURE</b> · Marketing automation and the customer data platform grow the relationship: segments stay current, AI builds the campaigns.',
        '<b>INVOICE</b> · Invoicing is built in. Send, track, and reconcile without leaving the platform, then the cycle feeds the next one.'
      ],
      events:()=>[
        ['&gt; AI FOUND SIMILAR PROSPECTS · <span class="ok">QUEUED</span>',0],
        ['&gt; CONTACT ENRICHED · <span class="ok">CRM</span>',-1],
        ['&gt; AI DRAFTED QUOTE → <span class="hl">SENT</span> · <span class="ok">QUOTE</span>',1],
        ['&gt; QUOTE ACCEPTED → <span class="hl">CUSTOMER</span> · <span class="ok">WON</span>',-1],
        ['&gt; AI BUILT GROWTH CAMPAIGN → <span class="hl">EMAIL SENT</span> · <span class="ok">NURTURE</span>',2],
        ['&gt; INVOICE SENT → <span class="hl">PAID</span> · <span class="ok">CYCLE COMPLETE</span>',-1]
      ]
    },
    { // hiring lifecycle
      name:'HIRING LIFECYCLE',
      sources:['JOB SEEKER','MARKETPLACE','REFERRAL'],
      sourceLogs:[
        '&gt; JOB SEEKER APPLIED → <span class="hl">CANDIDATE IN PIPELINE</span> · <span class="ok">ATS</span>',
        '&gt; ROLE FOUND ON MARKETPLACE → <span class="hl">CANDIDATE APPLIED</span> · <span class="ok">ATS</span>',
        '&gt; REFERRAL SUBMITTED → <span class="hl">CANDIDATE IN PIPELINE</span> · <span class="ok">ATS</span>'
      ],
      stages:['APPLICANT','SCREEN','INTERVIEW','OFFER','HIRE W2/C2C','ONBOARD'],
      info:[
        '<b>APPLICANT</b> · People find jobs on DCOSMOS; companies post roles to the marketplace. Candidates land straight in the built in ATS.',
        '<b>SCREEN</b> · Applications screened and shortlisted, with AI matching role requirements to candidates.',
        '<b>INTERVIEW</b> · AI drafts the outreach; scheduling and notes live on the candidate record.',
        '<b>OFFER</b> · Offers generated, sent, and accepted inside the system.',
        '<b>HIRE W2/C2C</b> · Hire as a W2 employee or a C2C contractor. Both paths are supported and tracked on the same platform.',
        '<b>ONBOARD</b> · Onboarding tasks, documents, and the complete hiring history in one place. The entire process, tracked end to end.'
      ],
      events:()=>{
        const type=hireW2?'W2':'C2C';hireW2=!hireW2;
        return [
          ['&gt; AI MATCHED ROLE ↔ CANDIDATE · <span class="ok">SHORTLISTED</span>',0],
          ['&gt; APPLICATION SCREENED · <span class="ok">ATS</span>',-1],
          ['&gt; AI DRAFTED OUTREACH → <span class="hl">INTERVIEW SET</span>',1],
          ['&gt; OFFER SENT → <span class="hl">ACCEPTED</span>',-1],
          ['&gt; HIRED AS <span class="hl">'+type+'</span> · <span class="ok">TRACKED IN DCOSMOS</span>',-1],
          ['&gt; ONBOARDED · <span class="hl">ENTIRE PROCESS TRACKED</span> · <span class="ok">CYCLE COMPLETE</span>',2]
        ];
      }
    }
  ];
  let jIdx=0,curEvents=null,curJ=journeys[0];
  function loadJourney(j){
    curJ=j;
    jname.textContent=j.name;
    j.sources.forEach((s,i)=>srcLbls[i].textContent=s);
    j.stages.forEach((s,i)=>stgl(i).textContent=s);
    curEvents=j.events();
  }
  // drill-down: click a stage for detail
  const stageInfo=document.getElementById('stageInfo');
  let infoIdx=-1;
  function showInfo(i){
    if(infoIdx===i){infoIdx=-1;stageInfo.classList.remove('show');return}
    infoIdx=i;
    stageInfo.innerHTML=curJ.info[i];
    stageInfo.classList.add('show');
  }
  STG_X.forEach((_,i)=>{
    stg(i).addEventListener('click',()=>showInfo(i));
    stgl(i).addEventListener('click',()=>showInfo(i));
  });

  let dcQ=[],dcLogging=false;
  function dcPush(l){dcQ.push(l);if(!dcLogging)dcDrain();}
  function dcDrain(){
    dcLogging=true;
    (function next(){
      if(!dcQ.length){dcLogging=false;return}
      const div=document.createElement('div');div.innerHTML=dcQ.shift();
      dclog.appendChild(div);
      while(dclog.children.length>5)dclog.removeChild(dclog.firstChild);
      setTimeout(next,340);
    })();
  }
  function setStage(n){
    STG_X.forEach((_,i)=>{stg(i).classList.toggle('hot',i===n);stgl(i).classList.toggle('hot',i===n)});
  }
  function pulseAI(i){
    aiBoxes.forEach((b,j)=>b.setAttribute('stroke',j===i?'var(--ac)':'var(--ac-dim)'));
    if(i>=0)setTimeout(()=>aiBoxes[i].setAttribute('stroke','var(--ac-dim)'),1400);
  }
  const stageCenters=STG_X.map(x=>({x:x+STG_W/2,y:STG_Y+STG_H/2}));
  let srcIdx=0;
  function runCycle(){
    const j=journeys[jIdx];
    loadJourney(j);
    const p=inPaths[srcIdx],len=p.getTotalLength();
    dcPush(j.sourceLogs[srcIdx]);
    let t=0;
    (function down(){
      t+=0.03;
      if(t>=1){arrive(0);return}
      const pt=p.getPointAtLength(t*len);
      cdot.setAttribute('cx',pt.x);cdot.setAttribute('cy',pt.y);
      requestAnimationFrame(down);
    })();
    srcIdx=(srcIdx+1)%3;
    jIdx=(jIdx+1)%journeys.length; // alternate customer / hiring each cycle
  }
  function arrive(n){
    const c=stageCenters[n];
    cdot.setAttribute('cx',c.x);cdot.setAttribute('cy',c.y);
    setStage(n);
    const [log,ai]=curEvents[n];
    dcPush(log);pulseAI(ai);
    if(n<stageCenters.length-1){
      setTimeout(()=>travel(n,n+1),1500);
    }else{
      setTimeout(()=>{setStage(-1);runCycle()},2200);
    }
  }
  function travel(a,b){
    const A=stageCenters[a],B=stageCenters[b];let t=0;
    (function step(){
      t+=0.05;
      if(t>=1){arrive(b);return}
      cdot.setAttribute('cx',A.x+(B.x-A.x)*t);
      cdot.setAttribute('cy',A.y);
      requestAnimationFrame(step);
    })();
  }
  if(!reduced){
    dcPush('&gt; ONE PLATFORM · SELL <span class="hl">AND</span> HIRE · <span class="ok">PAY FOR WHAT YOU USE</span>');
    setTimeout(runCycle,900);
  }else{
    loadJourney(journeys[0]);
    STG_X.forEach((_,i)=>{stg(i).classList.add('hot');stgl(i).classList.add('hot')});
    cdot.setAttribute('cx',-10);cdot.setAttribute('cy',-10);
    dclog.innerHTML='<div>&gt; CUSTOMER CYCLE + HIRING CYCLE (W2 OR C2C) · <span class="ok">ONE PLATFORM</span></div>';
  }

  // ---- scroll-in phases + caps + spine fill ----
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('vis')}),{threshold:.2});
  document.querySelectorAll('.phase,.cap,.intel').forEach(p=>io.observe(p));
  const wrapEl=document.querySelector('.spine-wrap'),fill=document.getElementById('fill');
  function onScroll(){
    const r=wrapEl.getBoundingClientRect();
    const done=Math.min(Math.max((window.innerHeight*0.7-r.top)/r.height,0),1);
    fill.style.height=(done*100)+'%';
  }
  window.addEventListener('scroll',onScroll,{passive:true});onScroll();

  // ---- audience lens ----
  function applyLens(l){
    document.querySelectorAll('.op[data-aud], .intel[data-aud]').forEach(el=>{
      el.classList.toggle('dimmed', l!=='all' && el.dataset.aud!==l);
    });
    document.querySelectorAll('.phase[data-aud]').forEach(el=>{
      const hasMatchingOp=!!el.querySelector(`.op[data-aud="${l}"]`);
      el.classList.toggle('dimmed', l!=='all' && el.dataset.aud!==l && !hasMatchingOp);
    });
    document.querySelectorAll('.lb').forEach(b=>b.classList.toggle('on',b.dataset.l===l));
  }
  document.querySelectorAll('.lb').forEach(b=>b.addEventListener('click',()=>applyLens(b.dataset.l)));

  // ---- op expand ----
  document.querySelectorAll('.op').forEach(o=>{
    const head=o.querySelector('.op-head');
    const caret=document.createElement('span');
    caret.className='op-caret';caret.textContent='▶';
    head.appendChild(caret);
    // the heads are plain divs, so give them button semantics for
    // keyboard and screen reader users
    head.setAttribute('role','button');
    head.setAttribute('tabindex','0');
    head.setAttribute('aria-expanded','false');
    const flip=()=>{const open=o.classList.toggle('open');head.setAttribute('aria-expanded',open);};
    head.addEventListener('click',flip);
    head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();flip();}});
  });
  // Open the first case by default so visitors see the expand pattern.
  const firstOp=document.querySelector('.op');
  if(firstOp){firstOp.classList.add('open');firstOp.querySelector('.op-head')?.setAttribute('aria-expanded','true');}
