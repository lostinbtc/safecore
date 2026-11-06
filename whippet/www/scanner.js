/* Camera frames stay in memory. QR content is untrusted input, never navigation. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.WalletScanner=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  function address(raw,coin,validate){
    if(typeof raw!=='string'||raw.length>2048)throw Error('This QR code is not a supported payment address.');
    const text=raw.trim(),scheme={pep:'pepecoin',wht:'whippet'}[coin];
    if(!scheme)throw Error('Select a supported coin first.');
    let result=text;
    if(text.includes(':')){
      const match=/^([a-z][a-z0-9+.-]*):([1-9A-HJ-NP-Za-km-z]+)(?:\?([^#]*))?$/i.exec(text);
      if(!match||match[1].toLowerCase()!==scheme)throw Error('This QR code is not for the selected coin.');
      const query=new URLSearchParams(match[3]||'');
      for(const key of query.keys())if(key.toLowerCase().startsWith('req-'))throw Error('This QR code requires unsupported payment options.');
      result=match[2]; // Amount/label/message never control the send form.
    }
    validate(coin,result);return result;
  }
  function start({video,status,hint,coin,validate,onAddress,onClose,parseValue,privateKey=false}){
    let stopped=false,stream=null,timer=0,frameDeadline=0,frames=0,detections=0;
    const message=text=>{status.textContent=text;if(hint)hint.textContent=text;};
    video.dataset.ready='false';video.muted=true;video.autoplay=true;video.playsInline=true;
    video.dataset.scanFrames='0';video.dataset.qrDetections='0';
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
    const controller=new AbortController(),options={signal:controller.signal};
    function stop(){
      if(stopped)return;stopped=true;clearTimeout(timer);controller.abort();observer.disconnect();
      if(stream)for(const track of stream.getTracks())track.stop();
      video.pause();video.srcObject=null;video.dataset.ready='false';canvas.width=canvas.height=0;onClose();
    }
    const observer=new MutationObserver(()=>{if(!video.isConnected)stop();});
    observer.observe(document.getElementById('main'),{childList:true,subtree:true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&!window.SafeCorePlatform?.cameraPermissionPending)stop();},options);
    for(const event of ['pagehide','hashchange','safecore-pause'])window.addEventListener(event,stop,options);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();stop();}},options);
    function tick(){
      if(stopped)return;
      if(video.readyState>=2&&video.videoWidth&&video.videoHeight){
        if(video.dataset.ready!=='true'){
          video.dataset.ready='true';
          message(`Scanning ${coin==='wht'?'WHT':'PEP'} QR code… Keep the whole code in view.`);
        }
        // Match the square object-fit:cover preview. Downscaling the entire
        // portrait frame made its visible QR too small and wasted side space.
        const side=Math.min(video.videoWidth,video.videoHeight),size=Math.min(960,side);
        canvas.width=canvas.height=size;
        try{
          ctx.drawImage(video,(video.videoWidth-side)/2,(video.videoHeight-side)/2,side,side,0,0,size,size);
          const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
          video.dataset.scanFrames=String(++frames);
          const qr=jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'});
          if(qr){
            video.dataset.qrDetections=String(++detections);
            let recipient;
            try{recipient=parseValue?parseValue(qr.data):address(qr.data,coin,validate);}
            catch(_){message(privateKey?'Not a supported WIF private key. Try another QR code.':'Not a valid address for this coin. Try another QR code.');}
            if(recipient){stop();onAddress(recipient);return;}
          }
        }catch(_){message('Could not read the camera. Cancel and try again.');stop();return;}
      }else if(frameDeadline&&performance.now()>frameDeadline){
        message('Camera preview did not start. Close other camera apps, then try again.');stop();return;
      }
      timer=setTimeout(tick,180);
    }
    void (async()=>{
      try{
        if(!navigator.mediaDevices?.getUserMedia)throw Error('unsupported');
        const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
        if(stopped){acquired.getTracks().forEach(track=>track.stop());return;}
        stream=acquired;video.srcObject=stream;frameDeadline=performance.now()+10000;
        for(const track of stream.getTracks())track.addEventListener('ended',stop,options);
        const camera=stream.getVideoTracks()[0];
        // Focus support is optional; a camera without it must still scan.
        try{if(camera.getCapabilities?.().focusMode?.includes('continuous'))void camera.applyConstraints({advanced:[{focusMode:'continuous'}]}).catch(()=>{});}catch(_){}
        message('Starting camera…');
        // Frame readiness, not the play() promise, drives decoding. Some WebViews
        // can supply frames while that promise remains pending.
        void video.play().catch(()=>{
          if(!stopped&&video.dataset.ready!=='true')message('Tap the camera view to start the preview.');
        });
        video.addEventListener('click',()=>{if(!stopped)void video.play().catch(()=>{});},options);
        tick();
      }catch(e){
        if(stopped)return;
        message(e.name==='NotAllowedError'?'Camera access denied. Allow camera access in app or browser settings, or paste the address.':e.name==='NotFoundError'?'No camera found. You can paste the address instead.':'Camera unavailable. Close other camera apps or paste the address.');
        stop();
      }
    })();
    return stop;
  }
  return {address,start};
});
