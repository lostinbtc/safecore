package org.pepecoinservice.safecore;

import android.test.ActivityInstrumentationTestCase2;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.MotionEvent;
import android.os.SystemClock;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import android.webkit.PermissionRequest;
import android.view.accessibility.AccessibilityNodeInfo;
import android.net.Uri;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.IntentFilter;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Run ONLY in a disposable QA app on an emulator. No seed logging or mainnet broadcasts. */
public class WalletSmokeTest extends ActivityInstrumentationTestCase2<MainActivity> {
    public WalletSmokeTest() { super(MainActivity.class); }
    private WebView web;
    private WebView find(View v) {
        if(v instanceof WebView) return (WebView)v;
        if(v instanceof ViewGroup) for(int i=0;i<((ViewGroup)v).getChildCount();i++) {
            WebView found = find(((ViewGroup)v).getChildAt(i)); if(found != null)return found;
        }
        return null;
    }
    private String js(String code) throws Exception {
        CountDownLatch done=new CountDownLatch(1);String[] result={null};
        getInstrumentation().runOnMainSync(()->web.evaluateJavascript(code,value->{result[0]=value;done.countDown();}));
        assertTrue("WebView JS timeout",done.await(15,TimeUnit.SECONDS));return result[0];
    }
    private void until(String condition) throws Exception {
        until(condition,150);
    }
    private void until(String condition,int checks) throws Exception {
        for(int i=0;i<checks;i++){if("true".equals(js("Boolean("+condition+")")))return;Thread.sleep(200);}
        fail("Condition failed: "+condition+"; state="+js("JSON.stringify({route:location.hash,file:!!document.getElementById('backup-file'),error:document.getElementById('error')?.textContent,jsError:window.__qaError||'',events:window.__qaCameraEvents})"));
    }
    private void cameraPermissionButton(String... names) throws Exception {
        // Only the emulator's Android permission dialog, never the user's phone.
        for(int attempt=0;attempt<75;attempt++){
            AccessibilityNodeInfo root=getInstrumentation().getUiAutomation().getRootInActiveWindow();
            if(root!=null)for(String name:names)for(AccessibilityNodeInfo node:root.findAccessibilityNodeInfosByViewId("com.android.permissioncontroller:id/"+name)){
                if(node.isClickable()&&node.performAction(AccessibilityNodeInfo.ACTION_CLICK))return;
            }
            Thread.sleep(200);
        }
        fail("Expected camera permission dialog button");
    }
    public void testExplorerOpensOutsideWallet() throws Exception {
        MainActivity activity=getActivity();
        getInstrumentation().runOnMainSync(()->web=find(activity.getWindow().getDecorView()));
        until("window.WalletEngine && document.getElementById('main')");
        // Block the external intent: no actual browser request or wallet data.
        IntentFilter filter=new IntentFilter(Intent.ACTION_VIEW);filter.addCategory(Intent.CATEGORY_BROWSABLE);filter.addDataScheme("https");
        Instrumentation.ActivityMonitor monitor=getInstrumentation().addMonitor(filter,new Instrumentation.ActivityResult(Activity.RESULT_OK,null),true);
        try {
            js("document.getElementById('main').innerHTML='<a id=qa-explorer href=https://pepecoinservice.org/explorer/tx/'+ 'a'.repeat(64) +'/ style=display:block;padding:24px>Public fixture transaction</a>';window.scrollTo(0,0)");
            double cssWidth=Double.parseDouble(js("innerWidth"));
            double cssX=Double.parseDouble(js("document.getElementById('qa-explorer').getBoundingClientRect().left+30"));
            double cssY=Double.parseDouble(js("document.getElementById('qa-explorer').getBoundingClientRect().top+25"));
            int[] origin=new int[2];getInstrumentation().runOnMainSync(()->web.getLocationOnScreen(origin));
            float scale=(float)(web.getWidth()/cssWidth),x=origin[0]+(float)cssX*scale,y=origin[1]+(float)cssY*scale;
            long down=SystemClock.uptimeMillis();MotionEvent press=MotionEvent.obtain(down,down,MotionEvent.ACTION_DOWN,x,y,0),release=MotionEvent.obtain(down,down+50,MotionEvent.ACTION_UP,x,y,0);
            getInstrumentation().sendPointerSync(press);getInstrumentation().sendPointerSync(release);press.recycle();release.recycle();
            for(int i=0;i<50&&monitor.getHits()==0;i++)Thread.sleep(100);
            assertEquals(1,monitor.getHits());
            assertEquals("true",js("location.origin==='https://appassets.androidplatform.net' && !!document.getElementById('qa-explorer')"));
        } finally { getInstrumentation().removeMonitor(monitor); }
    }
    public void testScannerFrameDecoding() throws Exception {
        MainActivity activity=getActivity();
        getInstrumentation().runOnMainSync(()->web=find(activity.getWindow().getDecorView()));
        until("window.WalletScanner && window.jsQR && window.QRCode");
        // Public address fixture only. Verify the actual WebView decoder reaches
        // its callback, not merely that a camera stream has dimensions.
        js("document.getElementById('main').innerHTML='<video id=scan-video autoplay muted playsinline></video><p id=scan-status></p>';window.__qrExpected=WalletEngine.accounts(ethers,WalletEngine.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')).pep.address;const qr=document.createElement('div');new QRCode(qr,{text:__qrExpected,width:320,height:320});window.__qrScene=document.createElement('canvas');__qrScene.width=__qrScene.height=480;const ctx=__qrScene.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,480,480);ctx.drawImage(qr.querySelector('canvas'),80,80);window.__qrStream=__qrScene.captureStream(10);window.__qrPulse=setInterval(()=>{ctx.fillStyle='white';ctx.fillRect(0,0,1,1)},100);navigator.mediaDevices.getUserMedia=async()=>__qrStream;window.__qrRead=false;window.__qrStop=WalletScanner.start({video:document.getElementById('scan-video'),status:document.getElementById('scan-status'),coin:'pep',validate:WalletTransactions.script,onClose:()=>{},onAddress:a=>__qrRead=a===__qrExpected})");
        try {
            until("__qrRead");
            assertEquals("true",js("__qrStream.getTracks().every(t=>t.readyState==='ended')"));
        } finally {
            // No image, seed or decoded address is printed.
            if(!"true".equals(js("__qrRead")))System.out.println("Scanner state: "+js("JSON.stringify({status:document.getElementById('scan-status')?.textContent,paused:document.getElementById('scan-video')?.paused,muted:document.getElementById('scan-video')?.muted,ready:document.getElementById('scan-video')?.readyState})"));
            js("__qrStop();clearInterval(__qrPulse)");
        }
    }
    public void testFreshWalletAndNativeRuntime() throws Exception {
        MainActivity activity=getActivity();
        getInstrumentation().runOnMainSync(()->web=find(activity.getWindow().getDecorView()));
        assertNotNull(web);
        until("window.WalletEngine && document.documentElement.dataset.walletState");
        assertEquals("true",js("isSecureContext && !!crypto.subtle && !!navigator.locks && !!SafeCorePlatform"));
        assertEquals("true",js("localStorage.getItem('whippet.dev.encrypted.v1') === null"));
        assertTrue((activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE)!=0);
        assertFalse(MainActivity.localPage(Uri.parse("https://example.com/assets/wallet/index.html")));
        assertFalse(MainActivity.localPage(Uri.parse("file:///assets/wallet/index.html")));
        assertTrue(MainActivity.localPage(Uri.parse(MainActivity.START+"#receive")));
        String explorer="https://pepecoinservice.org/explorer/tx/"+"a".repeat(64)+"/";
        assertTrue(MainActivity.transactionPage(Uri.parse(explorer)));
        for(String bad:new String[]{explorer.replace("https:","http:"),explorer.replace(".org/",".org.evil.invalid/"),explorer.replace(".org/",".org:443/"),explorer.replace("https://","https://user@"),explorer+"?redirect=1",explorer+"#fragment",explorer.replace("/tx/","/address/"),explorer.replace("a".repeat(64),"bad"),MainActivity.START})assertFalse(MainActivity.transactionPage(Uri.parse(bad)));
        assertTrue(MainActivity.cameraResources(Uri.parse(MainActivity.ORIGIN),new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE}));
        assertFalse(MainActivity.cameraResources(Uri.parse("https://example.com"),new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE}));
        assertFalse(MainActivity.cameraResources(Uri.parse(MainActivity.ORIGIN),new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE}));
        assertFalse(MainActivity.cameraResources(Uri.parse(MainActivity.ORIGIN),new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE,PermissionRequest.RESOURCE_AUDIO_CAPTURE}));
        // Read-only actual TLS/genesis checks from Android, no address queries or sends.
        js("window.__chains={};for(const c of ['pep','wht'])WalletNetwork.client(c).call('server.features',[]).then(f=>__chains[c]=f.genesis_hash===WalletNetwork.CONFIG[c].genesis).catch(()=>__chains[c]=false)");
        until("__chains.pep !== undefined && __chains.wht !== undefined");
        assertEquals("true",js("__chains.pep && __chains.wht"));
        // Use deterministic empty transport for wallet state tests; never broadcast.
        js("WalletNetwork.close();WalletNetwork.scan=async(coin,accounts)=>({coin,tip:500,at:Date.now(),everUsed:[0],confirmed:0n,unconfirmed:0n,feeRate:1000000n,rows:accounts.map((account,i)=>({account,confirmed:0n,unconfirmed:0n,history:i?[]:[{tx_hash:'a'.repeat(64),height:499}],utxos:[]}))});location.hash='setup'");
        until("document.getElementById('ack')");
        js("window.__fullHeight=innerHeight;document.querySelector('[data-setup=import]').click();document.getElementById('phrase').focus()");
        assertEquals("true",js("!document.getElementById('ack')"));
        until("WalletViewport.caret(document.getElementById('phrase')).top>=WalletViewport.bounds().top-1");
        // Touch only this disposable emulator's QA WebView. Programmatic DOM
        // focus alone does not reliably request Android's soft keyboard.
        double cssWidth=Double.parseDouble(js("innerWidth"));
        double cssX=Double.parseDouble(js("(()=>{const r=document.getElementById('phrase').getBoundingClientRect();return r.left+20})()"));
        double cssY=Double.parseDouble(js("(()=>{const r=document.getElementById('phrase').getBoundingClientRect();return r.top+20})()"));
        int[] origin=new int[2];getInstrumentation().runOnMainSync(()->web.getLocationOnScreen(origin));
        float scale=(float)(web.getWidth()/cssWidth),x=origin[0]+(float)cssX*scale,y=origin[1]+(float)cssY*scale;
        long down=SystemClock.uptimeMillis();
        MotionEvent press=MotionEvent.obtain(down,down,MotionEvent.ACTION_DOWN,x,y,0),release=MotionEvent.obtain(down,down+50,MotionEvent.ACTION_UP,x,y,0);
        getInstrumentation().sendPointerSync(press);getInstrumentation().sendPointerSync(release);press.recycle();release.recycle();
        InputConnection[] connection={null};
        getInstrumentation().runOnMainSync(()->{
            web.requestFocus();
            ((InputMethodManager)activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE)).showSoftInput(web,InputMethodManager.SHOW_IMPLICIT);
            connection[0]=web.onCreateInputConnection(new EditorInfo());
        });
        assertNotNull(connection[0]);
        // Actual Android composing input, not a committed word or synthetic DOM event.
        getInstrumentation().runOnMainSync(()->connection[0].setComposingText("wo",1));
        until("[...document.querySelectorAll('.recovery-choice')].some(b=>b.textContent==='wool')");
        assertEquals("true",js("[...document.querySelectorAll('.recovery-choice')].some(b=>b.textContent==='wood')"));
        until("innerHeight < __fullHeight");
        until("(()=>{const c=WalletViewport.caret(document.getElementById('phrase')),r=document.getElementById('phrase-suggestions').getBoundingClientRect(),b=WalletViewport.bounds();return c.top>=b.top-1&&c.bottom<=b.bottom+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1})()");
        js("[...document.querySelectorAll('.recovery-choice')].find(b=>b.textContent==='wool').click()");
        assertEquals("true",js("document.getElementById('phrase').value==='wool '"));
        getInstrumentation().runOnMainSync(()->((InputMethodManager)activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(web.getWindowToken(),0));
        js("document.querySelector('[data-setup=create]').click()");
        until("document.getElementById('ack')");
        js("document.getElementById('ack').checked=true;document.getElementById('submit-setup').click()");
        until("document.getElementById('recovery-words')");
        assertEquals("true",js("localStorage.getItem('whippet.dev.encrypted.v1')===null && localStorage.getItem('corevault.wallets.v1')===null"));
        js("window.__nativeSaved=false;SafeCorePlatform.readWalletStore().then(s=>__nativeSaved=!!s.records['whippet.dev.encrypted.v1'])");
        until("__nativeSaved");
        // Native lifecycle must hide the phrase without deleting the saved wallet.
        getInstrumentation().runOnMainSync(()->getInstrumentation().callActivityOnPause(activity));
        until("!document.getElementById('recovery-words')");
        getInstrumentation().runOnMainSync(()->getInstrumentation().callActivityOnResume(activity));
        js("location.hash='receive'");
        until("document.getElementById('receive-coin')");
        assertEquals("true",js("!document.getElementById('address') && !document.getElementById('qr')"));
        js("document.getElementById('receive-coin').click();document.querySelector('[data-coin=pep]').click()");
        until("document.getElementById('address')");
        js("document.getElementById('reuse-first').click()");
        until("document.getElementById('reuse-first').checked");
        assertEquals("true",js("document.getElementById('address-number').textContent==='Address #1' && document.getElementById('next-address').disabled && document.getElementById('previous-address').disabled"));
        assertEquals("true",js("!document.getElementById('main').textContent.includes('Testing wallet')"));
        // Check adapter plus native clipboard, only a public receiving address.
        js("window.__copied=false;SafeCorePlatform.copyAddress(document.getElementById('address').textContent).then(()=>__copied=true)");
        until("__copied");
        js("window.__beforeReload=true");
        getInstrumentation().runOnMainSync(()->web.reload());
        until("window.__beforeReload === undefined && document.readyState==='complete' && window.WalletEngine");
        js("document.getElementById('receive-coin').click();document.querySelector('[data-coin=pep]').click()");
        until("document.getElementById('reuse-first')?.checked && document.getElementById('address')");
        assertEquals("true",js("document.getElementById('address-number').textContent==='Address #1'"));
        assertEquals("true",js("document.documentElement.scrollWidth <= innerWidth"));
        // A send starts with an explicit funded-asset choice. Fixture-only funds.
        js("WalletNetwork.close();WalletNetwork.scan=async(coin,accounts)=>({coin,tip:500,at:Date.now(),everUsed:[0],confirmed:500000000n,unconfirmed:0n,feeRate:1000000n,rows:accounts.map((account,i)=>({account,confirmed:i?0n:500000000n,unconfirmed:0n,history:[],utxos:[]}))});location.hash='send'");
        until("document.getElementById('send-coin')");
        assertEquals("true",js("!document.getElementById('send-form')"));
        // The cached zero must pass the normal poll plus 4-second stability gate.
        until("document.querySelector('[data-send-coin=pep]')",300);
        js("document.getElementById('send-coin').click();document.querySelector('[data-send-coin=pep]').click()");
        until("document.getElementById('scan-address')");
        js("window.__qaCameraEvents=[];document.addEventListener('visibilitychange',()=>__qaCameraEvents.push('hidden:'+document.hidden));for(const name of ['safecore-pause','safecore-resume'])window.addEventListener(name,()=>__qaCameraEvents.push(name))");
        js("document.getElementById('scan-address').click()");
        cameraPermissionButton("permission_deny_button");
        until("document.getElementById('scan-status')?.textContent.includes('Camera access denied')");
        js("document.getElementById('scan-address').click()");
        cameraPermissionButton("permission_allow_foreground_only_button","permission_allow_button");
        until("document.getElementById('scan-video')?.srcObject?.active && document.getElementById('scan-video').videoWidth > 0");
        assertEquals("true",js("document.getElementById('scan-video').srcObject.getAudioTracks().length===0"));
        js("window.__qaCameraTracks=document.getElementById('scan-video').srcObject.getTracks();document.getElementById('cancel-scan').click()");
        until("__qaCameraTracks.every(t=>t.readyState==='ended')");
        js("document.getElementById('scan-address').click()");
        until("document.getElementById('scan-video')?.srcObject?.active");
        js("window.__qaCameraTracks=document.getElementById('scan-video').srcObject.getTracks()");
        getInstrumentation().runOnMainSync(()->getInstrumentation().callActivityOnPause(activity));
        until("__qaCameraTracks.every(t=>t.readyState==='ended')");
        getInstrumentation().runOnMainSync(()->getInstrumentation().callActivityOnResume(activity));
        // Simulate the native file-picker return with an app-generated backup, never print it.
        js("window.addEventListener('error',e=>window.__qaError=e.message);window.dispatchEvent(new Event('safecore-pause'));window.dispatchEvent(new Event('safecore-resume'));SafeCorePlatform.readWalletStore().then(s=>window.dispatchEvent(new CustomEvent('safecore-import',{detail:s.records['whippet.dev.encrypted.v1']})))");
        until("document.getElementById('file-status')?.textContent.includes('Unprotected backup selected')");
        // Deliberately preserve this disposable QA wallet; uninstall only this test app later.
    }
    public void testScreenProtectionPreference() throws Exception {
        MainActivity activity=getActivity();
        assertTrue("Disposable QA app only",activity.getPackageName().endsWith(".qa"));
        getInstrumentation().runOnMainSync(()->web=find(activity.getWindow().getDecorView()));
        until("window.SafeCorePlatform && document.getElementById('main')");
        js("localStorage.setItem('corevault.risk-ack.v1','acknowledged');location.hash='security';dispatchEvent(new StorageEvent('storage',{key:'corevault.risk-ack.v1'}))");
        until("document.getElementById('screen-protection') && !document.getElementById('screen-protection').disabled");
        assertEquals("true",js("document.getElementById('screen-protection').checked"));
        assertTrue((activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE)!=0);
        try {
            js("document.getElementById('screen-protection').click()");
            screenDialogButton(activity,android.content.DialogInterface.BUTTON_NEGATIVE);
            until("!document.getElementById('screen-protection').disabled");
            assertEquals("true",js("document.getElementById('screen-protection').checked"));
            js("document.getElementById('screen-protection').click()");
            screenDialogButton(activity,android.content.DialogInterface.BUTTON_POSITIVE);
            until("!document.getElementById('screen-protection').disabled && !document.getElementById('screen-protection').checked");
            assertFalse((activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE)!=0);
            getInstrumentation().runOnMainSync(()->web.reload());
            until("document.getElementById('screen-protection') && !document.getElementById('screen-protection').disabled");
            assertEquals("false",js("document.getElementById('screen-protection').checked"));
            getInstrumentation().runOnMainSync(()->getInstrumentation().callActivityOnPause(activity));
            assertTrue((activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE)!=0);
            getInstrumentation().runOnMainSync(()->getInstrumentation().callActivityOnResume(activity));
            assertFalse((activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE)!=0);
            js("location.hash='wallet'");until("location.hash==='#wallet'");
            js("window.__screenRejected=false;SafeCorePlatform.setScreenProtection(false).catch(()=>__screenRejected=true)");until("__screenRejected");
            js("location.hash='security'");until("document.getElementById('screen-protection') && !document.getElementById('screen-protection').disabled");
            js("document.getElementById('screen-protection').click()");
            until("!document.getElementById('screen-protection').disabled && document.getElementById('screen-protection').checked");
            assertTrue((activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE)!=0);
        } finally {
            activity.getSharedPreferences("screen_privacy",0).edit().putBoolean("protected",true).commit();
            getInstrumentation().runOnMainSync(()->getInstrumentation().callActivityOnResume(activity));
        }
    }
    private void screenDialogButton(MainActivity activity,int button) throws Exception {
        java.lang.reflect.Field field=MainActivity.class.getDeclaredField("screenProtectionDialog");field.setAccessible(true);
        for(int i=0;i<50;i++){
            android.app.AlertDialog[] dialog={null};
            getInstrumentation().runOnMainSync(()->{try{dialog[0]=(android.app.AlertDialog)field.get(activity);}catch(Exception e){throw new RuntimeException(e);}});
            if(dialog[0]!=null){getInstrumentation().runOnMainSync(()->dialog[0].getButton(button).performClick());return;}
            Thread.sleep(100);
        }
        fail("Expected native screenshot confirmation");
    }
}
