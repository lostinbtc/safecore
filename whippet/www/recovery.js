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
      const phrase=mode==='komodo'?String(value).trim().replace(/\s+/g,' '):normalize(value),tokens=phrase?phrase.split(' '):[];
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
    function predict(prefix){
      prefix=normalize(prefix);
      const matches=/^[a-z]*$/.test(prefix)?words.filter(word=>word.startsWith(prefix)):[];
      return {matches:prefix?matches.slice(0,8):[],letters:[...new Set(matches.map(word=>word[prefix.length]).filter(Boolean))],word:dictionary.has(prefix)};
    }
    return {inspect,suggest,complete,predict};
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
  // Numbered BIP39 entry. The hidden aggregate input feeds the existing restore
  // pipeline; neither partial words nor suggestions are persisted or transmitted.
  function attachGrid(ethers,{input,grid,count,list,status,keyboard,onValidity,onEdit=()=>{},mode='bip39'}){
    const model=create(ethers,{mode}),legacy=mode==='komodo',counts=legacy?[12,24]:[12,15,18,21,24];
    list.hidden=!legacy;
    let words=Array(12).fill(''),separators=Array(23).fill(' '),active=0,shown=false,dead=false,composing=false,uppercase=false;
    const controller=new AbortController(),signal=controller.signal;
    const normalize=value=>legacy?String(value):String(value).normalize('NFKD').toLowerCase();
    const aggregate=()=>words.map((word,i)=>word+(i<words.length-1?separators[i]:'')).join('').trim();
    const fields=()=>[...grid.querySelectorAll('input')];
    const field=()=>fields()[active];
    const valid=()=>!input.disabled&&words.every(word=>word.length>0&&!/\s/.test(word))&&model.inspect(aggregate()).valid;
    function hide(){shown=false;keyboard.hidden=true;document.body.classList.remove('restore-typing');list.replaceChildren();}
    function ensure(){if(shown&&field()?.isConnected)requestAnimationFrame(()=>{if(!dead&&shown)window.WalletViewport?.ensure(field());});}
    function paint(){
      grid.replaceChildren();count.value=String(words.length);
      words.forEach((word,index)=>{
        const label=document.createElement('label');label.className='restore-word';
        const number=document.createElement('span');number.textContent=String(index+1)+'.';number.setAttribute('aria-hidden','true');
        const el=document.createElement('input');el.type='text';el.value=word;el.dataset.restoreWord=String(index);
        el.id='restore-word-'+index;el.setAttribute('aria-label','Recovery word '+(index+1));el.setAttribute('aria-describedby','phrase-status');
        el.autocomplete='off';el.autocapitalize='off';el.spellcheck=false;el.setAttribute('autocorrect','off');el.inputMode='none';el.maxLength=1000;el.disabled=input.disabled;
        label.append(number,el);grid.append(label);
        el.addEventListener('focus',()=>{active=index;shown=true;keyboard.hidden=false;document.body.classList.add('restore-typing');update();ensure();});
        el.addEventListener('click',()=>{active=index;shown=true;keyboard.hidden=false;document.body.classList.add('restore-typing');update();ensure();});
        el.addEventListener('input',event=>{
          onEdit();
          if(/\s/.test(el.value.trim())){distribute(el.value,index);return;}
          const committed=/\s$/.test(el.value);
          words[index]=normalize(el.value).trim();
          if(!composing)el.value=words[index];
          update();
          if(!event.inputType?.startsWith('delete'))autoAdvance(el,committed);
        });
        el.addEventListener('compositionstart',()=>{composing=true;});
        el.addEventListener('compositionend',()=>{composing=false;words[index]=normalize(el.value).trim();el.value=words[index];update();autoAdvance(el);});
        el.addEventListener('paste',event=>{event.preventDefault();distribute(event.clipboardData?.getData('text/plain')||'',index);});
        el.addEventListener('keydown',event=>{
          if(event.key==='Escape'){event.preventDefault();finish();}
          else if(event.key==='ArrowDown'&&list.querySelector('button')){event.preventDefault();list.querySelector('button').focus();}
          else if(event.key==='Enter'||event.key===' '){event.preventDefault();advance();}
          else if(event.key==='Backspace'&&!el.value&&index>0){event.preventDefault();focus(index-1);}
        });
      });
    }
    function focus(index){active=Math.max(0,Math.min(words.length-1,index));const el=field();el.focus({preventScroll:true});el.setSelectionRange(el.value.length,el.value.length);ensure();}
    function finish(){hide();status.focus({preventScroll:true});}
    function advance(){if(legacy?!words[active]:!model.predict(words[active]).word)return;if(active<words.length-1)focus(active+1);else finish();}
    function autoAdvance(el,committed=false){
      if(legacy||composing||document.activeElement!==el||el.selectionStart!==el.value.length||el.selectionEnd!==el.value.length)return;
      const prediction=model.predict(words[active]);
      // "act" is complete but could still become "action". Never split such
      // words mid-typing; Space/Enter or a suggestion explicitly commits them.
      if(prediction.word&&(committed||!prediction.letters.length))advance();
    }
    function distribute(value,start=0){
      onEdit();
      const text=normalize(value).trim(),parts=text.split(/\s+/).filter(Boolean),gaps=text.match(/\s+/g)||[];
      if(!parts.length){words[start]='';field().value='';update();return;}
      if(start+parts.length>24){fields()[start].value=words[start];status.textContent='Use at most 24 recovery words. The paste was not applied.';return;}
      if(start===0&&counts.includes(parts.length)){words=parts;separators=Array(23).fill(' ');}
      else{
        const size=counts.find(n=>n>=Math.max(words.length,start+parts.length));
        while(words.length<size)words.push('');
        parts.forEach((word,i)=>words[start+i]=word);
      }
      if(legacy)gaps.forEach((gap,i)=>separators[start+i]=gap);
      active=Math.min(words.length-1,start+parts.length-1);paint();update();focus(active);
      if(!legacy&&parts.length===1)advance();
    }
    function update(){
      if(dead)return;
      input.value=aggregate();
      count.disabled=input.disabled;
      const result=model.inspect(input.value),missing=words.flatMap((word,i)=>word?[]:[i+1]);
      const invalid=words.flatMap((word,i)=>word&&!model.predict(word).word?[i+1]:[]);
      fields().forEach((el,i)=>{el.disabled=input.disabled;el.setAttribute('aria-invalid',String(!legacy&&Boolean(words[i])&&!model.predict(words[i]).word));el.parentElement.classList.toggle('is-active',shown&&i===active);});
      if(input.disabled){status.textContent='';hide();onValidity(false);return;}
      if(words.every(word=>!word))status.textContent='';
      else if(!legacy&&invalid.length)status.textContent=`Check ${invalid.length===1?'word':'words'} ${invalid.slice(0,6).join(', ')}: incomplete or misspelled.`;
      else if(missing.length)status.textContent=`${words.length-missing.length} of ${words.length} words entered. Enter word ${missing[0]}.`;
      else if(legacy)status.textContent=result.valid?'Word count accepted, not verified. Check the derived PEP address before sweeping.':'Use the exact 12 or 24 words from your legacy Komodo backup (maximum 2,048 characters).';
      else if(!result.valid)status.textContent='These words do not pass the recovery check. Check their order and spelling.';
      else status.textContent=`${words.length} words · Recovery phrase check passed.`;
      onValidity(valid());
      if(!shown)return;
      const prediction=model.predict(words[active]);
      keyboard.querySelector('[data-word-position]').textContent='Word '+(active+1);
      keyboard.querySelectorAll('[data-letter]').forEach(button=>{button.disabled=!legacy&&!prediction.letters.includes(button.dataset.letter);button.textContent=uppercase?button.dataset.letter.toUpperCase():button.dataset.letter;});
      keyboard.querySelector('[data-next-word]').disabled=legacy?!words[active]:!prediction.word;
      list.replaceChildren();
      for(const word of legacy?prediction.matches:[]){
        const button=document.createElement('button');button.type='button';button.className='recovery-choice';button.textContent=word;
        button.setAttribute('aria-label','Use recovery word '+word);
        button.addEventListener('pointerdown',event=>event.preventDefault());
        button.onclick=()=>{onEdit();composing=false;words[active]=word;field().value=word;update();advance();};list.append(button);
      }
    }
    keyboard.innerHTML='<div class="restore-keyboard-toolbar"><span data-word-position></span>'+(legacy?'<button type="button" data-shift aria-pressed="false" aria-label="Uppercase letters">⇧</button>':'')+'<button type="button" id="restore-done">Done</button></div>'+
      ['qwertyuiop','asdfghjkl','zxcvbnm'].map(row=>'<div class="restore-key-row">'+[...row].map(letter=>`<button type="button" data-letter="${letter}" aria-label="Type ${letter}">${letter}</button>`).join('')+(row==='zxcvbnm'?'<button type="button" data-backspace aria-label="Delete letter">⌫</button>':'')+'</div>').join('')+'<button type="button" class="restore-next" data-next-word aria-label="Next word">Next word →</button>';
    keyboard.append(list);
    keyboard.querySelectorAll('button').forEach(button=>button.addEventListener('pointerdown',event=>event.preventDefault()));
    keyboard.querySelectorAll('[data-letter]').forEach(button=>button.onclick=()=>{
      onEdit();
      const el=field(),start=el.selectionStart??words[active].length,end=el.selectionEnd??start;
      // Keyboard suggestions are prefix-based; moving the caret still permits explicit editing.
      const letter=uppercase?button.dataset.letter.toUpperCase():button.dataset.letter;
      words[active]=words[active].slice(0,start)+letter+words[active].slice(end);el.value=words[active];el.focus({preventScroll:true});el.setSelectionRange(start+1,start+1);update();autoAdvance(el);
    });
    keyboard.querySelector('[data-backspace]').onclick=()=>{
      onEdit();
      const el=field(),start=el.selectionStart??el.value.length,end=el.selectionEnd??start;
      if(!el.value&&active>0){focus(active-1);return;}
      const left=start===end?Math.max(0,start-1):start;
      words[active]=el.value.slice(0,left)+el.value.slice(end);el.value=words[active];el.focus({preventScroll:true});el.setSelectionRange(left,left);update();
    };
    keyboard.querySelector('[data-next-word]').onclick=advance;
    if(legacy)keyboard.querySelector('[data-shift]').onclick=event=>{uppercase=!uppercase;event.currentTarget.setAttribute('aria-pressed',String(uppercase));update();};
    keyboard.querySelector('#restore-done').onclick=finish;
    count.onchange=()=>{
      const size=Number(count.value);
      if(!counts.includes(size))return;
      if(size<words.length&&words.slice(size).some(Boolean)){count.value=String(words.length);status.textContent='Clear the extra words before reducing the word count.';return;}
      words=Array.from({length:size},(_,i)=>words[i]||'');active=Math.min(active,size-1);paint();update();hide();
    };
    const blur=()=>queueMicrotask(()=>{if(!grid.contains(document.activeElement)&&!keyboard.contains(document.activeElement))hide();});
    grid.addEventListener('focusout',blur);keyboard.addEventListener('focusout',blur);
    window.addEventListener('wallet-viewport',ensure,{signal});
    const keyboardSize=new ResizeObserver(()=>{
      const height=keyboard.getBoundingClientRect().height;
      if(height>0){document.body.style.setProperty('--restore-keyboard-height',height+'px');ensure();}
    });
    keyboardSize.observe(keyboard);
    const observer=new MutationObserver(()=>{if(!grid.isConnected)destroy();});
    observer.observe(document.getElementById('main'),{childList:true,subtree:true});
    function destroy(){
      if(dead)return;hide();dead=true;words.fill('');separators.fill(' ');fields().forEach(el=>{el.value='';el.disabled=true;});input.value='';list.replaceChildren();keyboard.replaceChildren();controller.abort();observer.disconnect();keyboardSize.disconnect();document.body.style.removeProperty('--restore-keyboard-height');
      if(!document.querySelector('#restore-grid')||document.querySelector('#restore-grid')===grid)document.body.classList.remove('restore-typing');
    }
    function refresh(){
      if(input.value===aggregate()){update();return;}
      const text=normalize(input.value).trim(),parts=text.split(/\s+/).filter(Boolean);
      separators=Array(23).fill(' ');if(legacy)(text.match(/\s+/g)||[]).forEach((gap,i)=>separators[i]=gap);
      if(parts.length>24){words=Array(12).fill('');paint();hide();update();status.textContent='Use at most 24 recovery words.';return;}
      const size=counts.find(n=>n>=parts.length)||24;
      words=Array.from({length:size},(_,i)=>parts[i]||'');active=0;paint();hide();update();
    }
    status.tabIndex=-1;paint();update();return {refresh,valid,destroy};
  }
  return {create,attach,attachGrid};
});
