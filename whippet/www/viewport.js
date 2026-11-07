/* Keep focused wallet inputs and their caret above the soft keyboard. */
(() => {
  'use strict';
  function bounds(){
    const v=window.visualViewport,top=v?.offsetTop||0,left=v?.offsetLeft||0;
    const visibleRect=selector=>{const el=document.querySelector(selector);return el?.getClientRects().length?el.getBoundingClientRect():null;};
    const header=visibleRect('.topbar'),nav=visibleRect('.bottom-navigation'),keyboard=visibleRect('#restore-keyboard');
    const entry=document.body.classList.contains('restore-mode')?visibleRect('#main'):null;
    return {left:left+8,right:left+(v?.width||innerWidth)-8,
      top:Math.max(top+8,header?.bottom||0,entry?.top||0)+8,
      bottom:Math.min(top+(v?.height||innerHeight)-8,nav?.top??Infinity,keyboard?.top??Infinity,entry?.bottom??Infinity)-8};
  }
  function caret(input){
    const box=input.getBoundingClientRect(),style=getComputedStyle(input);
    if(input.tagName!=='TEXTAREA')return {left:box.left+12,top:box.top,bottom:box.bottom,height:box.height};
    // Ephemeral, invisible measurement only. Never persist or log input text.
    const mirror=document.createElement('div');mirror.className='caret-measure';mirror.setAttribute('aria-hidden','true');
    for(const prop of ['font','letterSpacing','lineHeight','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','boxSizing','wordSpacing','tabSize'])mirror.style[prop]=style[prop];
    mirror.style.width=box.width+'px';
    mirror.textContent=input.value.slice(0,input.selectionEnd);
    const marker=document.createElement('span');marker.textContent='\u200b';mirror.append(marker);document.body.append(mirror);
    const point=marker.getBoundingClientRect(),base=mirror.getBoundingClientRect(),height=parseFloat(style.lineHeight)||24;
    const result={left:box.left+point.left-base.left-input.scrollLeft,top:box.top+point.top-base.top-input.scrollTop,height};
    result.bottom=result.top+height;mirror.remove();return result;
  }
  function ensure(input){
    if(!input?.isConnected||input.disabled)return;
    const b=bounds();if(b.bottom-b.top<45)return;
    const area=input.tagName==='TEXTAREA'?caret(input):input.getBoundingClientRect();
    const scroll=top=>(document.body.classList.contains('restore-mode')?document.getElementById('main'):window).scrollBy({top,behavior:'instant'});
    if(input.dataset.focusPosition==='upper'){
      const target=b.top+Math.min(40,(b.bottom-b.top-area.height)/4);
      if(Math.abs(area.top-target)>1)scroll(area.top-target);
      return;
    }
    const room=input.id==='phrase'?Math.min(100,(b.bottom-b.top)/3):12;
    if(area.bottom+room>b.bottom)scroll(area.bottom+room-b.bottom);
    else if(area.top<b.top)scroll(area.top-b.top);
  }
  const editable=el=>el?.matches('textarea, input:not([type="checkbox"]):not([type="file"]):not([type="hidden"]):not([type="button"]):not([type="submit"]), select');
  let frame=0;
  function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;const el=document.activeElement;if(editable(el))ensure(el);window.dispatchEvent(new Event('wallet-viewport'));});}
  document.addEventListener('focusin',event=>{
    if(!editable(event.target))return;
    // Retain the extra scroll room until navigation: collapsing it on blur
    // moves the acknowledgment checkbox underneath an in-progress tap.
    if(event.target.dataset.focusPosition==='upper')event.target.closest('.delete-confirmation')?.classList.add('focus-raised');
    schedule();
  });
  document.addEventListener('input',event=>{if(editable(event.target))schedule();});
  for(const event of ['resize','safecore-resize'])window.addEventListener(event,schedule);
  window.visualViewport?.addEventListener('resize',schedule);
  window.WalletViewport={bounds,caret,ensure};
})();
