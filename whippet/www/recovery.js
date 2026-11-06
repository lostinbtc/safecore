/* Local BIP39 suggestions only. Never complete a word without an explicit choice. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.WalletRecovery=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  function create(ethers,{mode='bip39'}={}){
    if(!['bip39','komodo'].includes(mode))throw Error('Unsupported recovery entry mode.');
    const words=Array.from({length:2048},(_,i)=>ethers.wordlists.en.getWord(i));
    const dictionary=new Set(words),counts=[12,15,18,21,24];
    const normalize=value=>String(value).normalize('NFKD').trim().toLowerCase().replace(/\s+/g,' ');
    function inspect(value){
      const phrase=normalize(value),tokens=phrase?phrase.split(' '):[];
      const invalid=tokens.flatMap((word,i)=>dictionary.has(word)?[]:[i+1]);
      const supported=(mode==='komodo'?[12,24]:counts).includes(tokens.length);
      const valid=mode==='komodo'?supported&&value.length<=2048:!invalid.length&&supported&&ethers.utils.isValidMnemonic(phrase,ethers.wordlists.en);
      return {count:tokens.length,invalid,supported,valid};
    }
    function suggest(value,caret,end=caret){
      if(!Number.isInteger(caret)||caret<0||caret>value.length||end<caret||end>value.length)return null;
      let start=caret,finish=end;
      while(start>0&&!/\s/.test(value[start-1]))start--;
      while(finish<value.length&&!/\s/.test(value[finish]))finish++;
      if(/\s/.test(value.slice(caret,end)))return null;
      const prefix=value.slice(start,caret).normalize('NFKD').toLowerCase();
      if(!/^[a-z]+$/.test(prefix))return null;
      return {start,end:finish,prefix,matches:words.filter(w=>w.startsWith(prefix)).slice(0,8)};
    }
    function complete(value,caret,end,word){
      const match=suggest(value,caret,end);
      if(!match||!dictionary.has(word)||!word.startsWith(match.prefix))return null;
      const suffix=value.slice(match.end),space=suffix?'':' ';
      const text=value.slice(0,match.start)+word+space+suffix;
      return {text,caret:match.start+word.length+(suffix?1:space.length)};
    }
    return {inspect,suggest,complete};
  }
  function attach(ethers,{input,list,status,onValidity,mode='bip39'}){
    const model=create(ethers,{mode});let composing=false,dismissed=false,frame=0;
    function hide(){list.replaceChildren();list.hidden=true;}
    function position(){
      if(!input.isConnected||list.hidden)return;
      const area=WalletViewport.caret(input),b=WalletViewport.bounds();
      const width=Math.min(320,b.right-b.left);
      list.style.width=width+'px';
      list.style.left=Math.max(b.left,Math.min(area.left,b.right-width))+'px';
      const below=b.bottom-area.bottom-4,above=area.top-b.top-4;
      const useBelow=below>=100||below>=above,maxHeight=Math.max(44,Math.min(150,useBelow?below:above));
      list.style.maxHeight=maxHeight+'px';
      const height=list.getBoundingClientRect().height;
      list.style.top=Math.max(b.top,Math.min(useBelow?area.bottom+4:area.top-height-4,b.bottom-height))+'px';
    }
    function schedulePosition(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;position();});}
    function refresh(){
      if(!input.isConnected)return;
      const result=model.inspect(input.value);
      input.setAttribute('aria-invalid',String(input.value.trim().length>0&&!result.valid));
      if(input.disabled){status.textContent='';hide();onValidity(false);return;}
      if(mode==='komodo')status.textContent=!result.count?'Enter the old Komodo words exactly as backed up.':!result.valid?'Use the exact 12 or 24 words from the legacy Komodo backup.':result.invalid.length?'Some words are outside the standard list. Keep the original spelling and verify the derived PEP address.':'Word count accepted. This does not verify the phrase: check the derived PEP address.';
      else if(!result.count)status.textContent='Enter your recovery words in order.';
      else if(result.invalid.length)status.textContent=`Check ${result.invalid.length===1?'word':'words'} ${result.invalid.slice(0,6).join(', ')}: incomplete or misspelled.`;
      else if(!result.supported)status.textContent=`${result.count} words entered. Use the exact words from your backup (usually 12 or 24).`;
      else if(!result.valid)status.textContent='These words do not pass the recovery check. Check their order and spelling.';
      else status.textContent=`${result.count} words · Recovery phrase check passed.`;
      onValidity(result.valid);
      if(dismissed||document.activeElement!==input){hide();return;}
      const match=model.suggest(input.value,composing?input.selectionEnd:input.selectionStart,input.selectionEnd);
      hide();if(!match?.matches.length)return;
      for(const word of match.matches){
        const button=document.createElement('button');button.type='button';button.className='recovery-choice';button.textContent=word;
        button.setAttribute('aria-label',`Use recovery word ${word}`);
        // Keep the caret/keyboard stable for touch and mouse selection.
        button.addEventListener('pointerdown',event=>event.preventDefault());
        button.onclick=()=>{
          const next=model.complete(input.value,composing?input.selectionEnd:input.selectionStart,input.selectionEnd,word);if(!next)return;
          composing=false;
          input.value=next.text;input.focus({preventScroll:true});input.setSelectionRange(next.caret,next.caret);
          input.dispatchEvent(new Event('input',{bubbles:true}));
        };
        list.append(button);
      }
      list.hidden=false;
      position();
    }
    const resume=()=>{dismissed=false;refresh();};
    input.addEventListener('input',resume);
    for(const event of ['click','focus'])input.addEventListener(event,resume);
    // A caret select event can arrive after ArrowDown has focused a choice.
    // Do not rebuild/remove that focused button; blur handles leaving the field.
    input.addEventListener('select',()=>{if(document.activeElement===input)refresh();});
    input.addEventListener('keyup',event=>{if(!['Escape','ArrowDown'].includes(event.key))refresh();});
    input.addEventListener('compositionstart',()=>{composing=true;refresh();});
    input.addEventListener('compositionupdate',()=>queueMicrotask(refresh));
    input.addEventListener('compositionend',()=>{composing=false;refresh();});
    input.addEventListener('keydown',event=>{
      if(event.key==='Escape'){dismissed=true;hide();event.preventDefault();}
      if(event.key==='ArrowDown'&&!list.hidden){event.preventDefault();list.querySelector('button')?.focus();}
    });
    // Do not leave word suggestions visible after moving into a different field.
    const blur=()=>setTimeout(()=>{if(document.activeElement!==input&&!list.contains(document.activeElement))hide();},0);
    input.addEventListener('blur',blur);list.addEventListener('focusout',blur);
    // Global listeners must not retain a removed phrase input and its contents.
    const controller=new AbortController(),options={signal:controller.signal,passive:true};
    window.addEventListener('scroll',schedulePosition,options);window.addEventListener('wallet-viewport',schedulePosition,options);
    input.addEventListener('scroll',schedulePosition,options);
    const cleanup=new MutationObserver(()=>{if(!input.isConnected){controller.abort();cleanup.disconnect();cancelAnimationFrame(frame);hide();}});
    cleanup.observe(document.getElementById('main'),{childList:true,subtree:true});
    refresh();return {refresh,valid:()=>model.inspect(input.value).valid};
  }
  return {create,attach};
});
