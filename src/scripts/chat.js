(function(){
  const shell=document.querySelector('.chat-shell');
  const launcher=document.getElementById('chat-launcher');
  const panel=document.getElementById('chat-panel');
  const closeButton=document.getElementById('chat-close');
  const messages=document.getElementById('chat-messages');
  const choices=document.getElementById('chat-choices');
  const form=document.getElementById('chat-form');
  const input=document.getElementById('chat-input');
  const sendButton=form&&form.querySelector('.chat-send');
  const attachButton=document.getElementById('chat-attach');
  const fileInput=document.getElementById('chat-file');
  const status=document.getElementById('chat-status');
  const endButton=document.getElementById('chat-end');
  const privacyOpen=document.getElementById('chat-privacy-open');
  const privacyClose=document.getElementById('chat-privacy-close');
  const privacy=document.getElementById('chat-privacy');
  if(!shell||!launcher||!panel||!messages||!choices||!form||!input||!endButton||!attachButton||!fileInput)return;

  const starters=[
    "I'm hiring for a role",
    'I need help with a project',
    "I'm looking for technology leadership",
    "I want to learn about Andrew's experience",
    'I want to compare Andrew with a job description',
    "I'm exploring the website template",
    'I have another question'
  ];
  let initialized=false;
  let busy=false;
  let userTurns=0;
  let sessionId='';
  let sessionToken='';
  let conversationEpoch=0;
  let pendingAttachment=null;
  try{
    sessionId=sessionStorage.getItem('ad_chat_session')||'';
    sessionToken=sessionStorage.getItem('ad_chat_token')||'';
  }catch{}

  function syncPlaceholder(){
    input.placeholder=window.matchMedia('(max-width: 700px)').matches
      ? input.dataset.placeholderMobile
      : input.dataset.placeholderDesktop;
  }

  function syncChatViewport(){
    const viewport=window.visualViewport;
    const height=viewport&&viewport.height?viewport.height:window.innerHeight;
    document.documentElement.style.setProperty('--chat-viewport-height',`${Math.round(height)}px`);
  }

  function track(event,props){
    if(typeof window.__track==='function')window.__track(event,props||{});
  }

  function setStatus(text,active){
    status.lastChild.textContent=' '+text;
    status.classList.toggle('active',Boolean(active));
  }

  function addMessage(role,text,meta){
    const article=document.createElement('article');
    article.className=`chat-message ${role}`;
    const label=document.createElement('span');
    label.className='chat-message-label';
    label.textContent=role==='assistant'?"Andrew's AI Assistant":'You';
    const copy=document.createElement('div');
    copy.className='chat-message-copy';
    copy.textContent=text;
    article.append(label,copy);

    const evidence=Array.isArray(meta&&meta.evidence)?meta.evidence:[];
    const sources=Array.isArray(meta&&meta.sources)?meta.sources:[];
    if(evidence.length||sources.length){
      const refs=document.createElement('div');
      refs.className='chat-refs';
      evidence.forEach(item=>{
        const link=document.createElement('a');
        link.className='chat-ref';
        link.href=item.anchor||'#top';
        link.textContent=`Evidence // ${item.title}`;
        link.addEventListener('click',()=>closeChat(false));
        refs.append(link);
      });
      sources.forEach(item=>{
        const link=document.createElement('a');
        link.className='chat-ref web';
        link.href=item.url;
        link.target='_blank';
        link.rel='noopener noreferrer';
        link.textContent=item.title||'Web source';
        refs.append(link);
      });
      article.append(refs);
    }
    messages.append(article);
    messages.scrollTop=messages.scrollHeight;
  }

  function showChoices(items,starterMode){
    choices.replaceChildren();
    (items||[]).forEach(text=>{
      const button=document.createElement('button');
      button.type='button';
      button.textContent=text;
      button.className=starterMode?'chat-choice starter':'chat-choice';
      button.addEventListener('click',()=>send(text));
      choices.append(button);
    });
    choices.hidden=!choices.children.length;
  }

  function initialize(){
    if(initialized)return;
    initialized=true;
    addMessage('assistant',"You're chatting with Andrew's AI Assistant. How can I help you today?");
    showChoices(starters,true);
  }

  function setEndVisible(visible){
    endButton.hidden=!visible;
  }

  function clearAttachment(){
    pendingAttachment=null;
    fileInput.value='';
    attachButton.classList.remove('has');
    attachButton.title='Attach job requirement';
    attachButton.setAttribute('aria-label','Attach job requirement');
  }

  function fileToBase64(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>{
        const value=String(reader.result||'');
        resolve(value.includes(',')?value.split(',').pop():value);
      };
      reader.onerror=()=>reject(reader.error||new Error('file read failed'));
      reader.readAsDataURL(file);
    });
  }

  async function prepareAttachment(file){
    if(!file)return;
    const allowed=/\.(txt|md|pdf|docx?|DOCX?|PDF|TXT|MD)$/;
    if(!allowed.test(file.name||'')){
      setStatus('Attach TXT, PDF, DOCX, or DOC',false);
      track('chat_job_req_rejected',{reason:'type'});
      return;
    }
    if(file.size>5*1024*1024){
      setStatus('Attachment must be under 5 MB',false);
      track('chat_job_req_rejected',{reason:'size'});
      return;
    }
    setStatus('Preparing job requirement...',true);
    try{
      pendingAttachment={name:file.name,type:file.type||'',data:await fileToBase64(file)};
      attachButton.classList.add('has');
      attachButton.title=`Job requirement ready: ${file.name}`;
      attachButton.setAttribute('aria-label',`Job requirement ready: ${file.name}`);
      setStatus('Job requirement ready',false);
      track('chat_job_req_selected',{type:file.type||'unknown',size:file.size});
      if(!input.value.trim())input.value='Please compare Andrew with the attached job requirement.';
      input.focus({preventScroll:true});
    }catch{
      clearAttachment();
      setStatus('Attachment could not be read',false);
      track('chat_job_req_rejected',{reason:'read'});
    }
  }

  function endConversation(){
    const endedTurns=userTurns;
    const hadSession=Boolean(sessionId);
    conversationEpoch+=1;
    sessionId='';
    sessionToken='';
    userTurns=0;
    initialized=false;
    busy=false;
    try{
      sessionStorage.removeItem('ad_chat_session');
      sessionStorage.removeItem('ad_chat_token');
    }catch{}
    hidePrivacy();
    messages.replaceChildren();
    input.value='';
    input.style.height='auto';
    clearAttachment();
    input.disabled=false;
    sendButton.disabled=false;
    setEndVisible(false);
    setStatus('New conversation ready',false);
    track('chat_end',{turns:endedTurns,hadSession});
    initialize();
    input.focus({preventScroll:true});
  }

  function openChat(){
    initialize();
    syncChatViewport();
    panel.hidden=false;
    shell.dataset.chatState='open';
    launcher.setAttribute('aria-expanded','true');
    document.body.classList.add('chat-open');
    requestAnimationFrame(()=>input.focus({preventScroll:true}));
    track('chat_open');
  }

  function closeChat(returnFocus=true){
    panel.hidden=true;
    shell.dataset.chatState='closed';
    launcher.setAttribute('aria-expanded','false');
    document.body.classList.remove('chat-open');
    hidePrivacy();
    if(returnFocus)launcher.focus({preventScroll:true});
  }

  function showPrivacy(){
    privacy.hidden=false;
    privacyOpen.setAttribute('aria-expanded','true');
  }
  function hidePrivacy(){
    privacy.hidden=true;
    privacyOpen.setAttribute('aria-expanded','false');
  }

  function fallbackReply(){
    return "This public clone is running the safe template demonstration. Connect your own Azure AI deployment and private content to enable grounded answers; Andrew's data and credentials are not included in the repository.";
  }

  async function send(raw){
    const message=String(raw||'').trim().slice(0,1200);
    if((!message&&!pendingAttachment)||busy)return;
    busy=true;
    const sendEpoch=conversationEpoch;
    userTurns+=1;
    setEndVisible(true);
    const attachmentForRequest=pendingAttachment;
    const displayedMessage=attachmentForRequest
      ? `${message||'Please compare Andrew with this job requirement.'}\n\nAttached: ${attachmentForRequest.name}`
      : message;
    addMessage('user',displayedMessage);
    showChoices([]);
    input.value='';
    input.style.height='auto';
    input.disabled=true;
    sendButton.disabled=true;
    setStatus('Reviewing approved evidence...',true);
    track('chat_message_sent',{turn:userTurns,hasSession:Boolean(sessionId)});
    if(userTurns===2)track('chat_two_questions');

    try{
      const endpoint=(window.__SITE&&window.__SITE.chatEndpoint)||'/api/chat';
      const requestChat=()=>fetch(endpoint,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          message:message||'Please compare Andrew with this job requirement.',
          sessionId,
          sessionToken,
          website:'',
          attachment:attachmentForRequest
        })
      });
      let response=await requestChat();
      let data=await response.json().catch(()=>({}));
      if(sendEpoch!==conversationEpoch)return;
      if(response.status===401&&sessionId){
        sessionId='';
        sessionToken='';
        try{
          sessionStorage.removeItem('ad_chat_session');
          sessionStorage.removeItem('ad_chat_token');
        }catch{}
        response=await requestChat();
        data=await response.json().catch(()=>({}));
      }
      const templateDemo=response.status===404;
      if(data.sessionId&&data.sessionToken){
        sessionId=data.sessionId;
        sessionToken=data.sessionToken;
        try{
          sessionStorage.setItem('ad_chat_session',sessionId);
          sessionStorage.setItem('ad_chat_token',sessionToken);
        }catch{}
      }
      if(sendEpoch!==conversationEpoch)return;
      const reply=data.reply||(response.status===429
        ? 'This conversation has reached its message limit. Use End conversation to start a fresh chat, or use the inquiry section if you want Andrew to follow up.'
        : (templateDemo||response.ok?fallbackReply():'The AI channel is temporarily unavailable. Please try again shortly.'));
      addMessage('assistant',reply,{evidence:data.evidence,sources:data.sources});
      showChoices(data.blockedOn||data.attachmentPending?[]:data.suggestions||[]);
      setStatus(data.mode==='mock'||templateDemo?'Template demo mode':'Secure channel ready',false);
      if(data.resumeSent)track('chat_resume_sent',{resumeSent:true});
      if(data.intent==='job_fit')track('chat_job_fit_analyzed',{analyzed:true});
      if(data.blockedOn)track('chat_information_gate',{field:data.blockedOn,turn:userTurns});
      if(data.attachmentProcessed||data.attachmentStored||data.attachmentRejected)clearAttachment();
      if(data.attachmentPending&&attachmentForRequest){
        pendingAttachment=attachmentForRequest;
        attachButton.classList.add('has');
        setStatus('Job requirement ready; contact details needed',false);
      }
      if(!response.ok)track('chat_request_failed',{status:response.status});
    }catch{
      if(sendEpoch!==conversationEpoch)return;
      addMessage('assistant',fallbackReply());
      setStatus('Template demo mode',false);
      track('chat_request_failed',{status:0});
    }finally{
      if(sendEpoch!==conversationEpoch)return;
      busy=false;
      input.disabled=false;
      sendButton.disabled=false;
      input.focus({preventScroll:true});
    }
  }

  launcher.addEventListener('click',openChat);
  closeButton.addEventListener('click',()=>closeChat());
  endButton.addEventListener('click',endConversation);
  attachButton.addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',()=>prepareAttachment(fileInput.files&&fileInput.files[0]));
  privacyOpen.addEventListener('click',()=>privacy.hidden?showPrivacy():hidePrivacy());
  privacyClose.addEventListener('click',hidePrivacy);
  form.addEventListener('submit',event=>{event.preventDefault();send(input.value);});
  input.addEventListener('input',()=>{
    input.style.height='auto';
    const maxHeight=window.matchMedia('(max-width: 700px)').matches?72:120;
    input.style.height=`${Math.min(input.scrollHeight,maxHeight)}px`;
  });
  input.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send(input.value);}
  });
  document.addEventListener('pointerdown',event=>{
    if(!privacy.hidden&&!privacy.contains(event.target)&&event.target!==privacyOpen)hidePrivacy();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!privacy.hidden){hidePrivacy();privacyOpen.focus();return;}
    if(event.key==='Escape'&&!panel.hidden)closeChat();
  });
  syncPlaceholder();
  window.addEventListener('resize',syncPlaceholder,{passive:true});
  syncChatViewport();
  window.addEventListener('resize',syncChatViewport,{passive:true});
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',syncChatViewport,{passive:true});
    window.visualViewport.addEventListener('scroll',syncChatViewport,{passive:true});
  }
})();
