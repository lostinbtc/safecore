package org.pepecoinservice.safecore;

import android.test.ActivityInstrumentationTestCase2;
import android.app.KeyguardManager;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import android.widget.Button;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.security.KeyStore;
import javax.crypto.SecretKeyFactory;
import android.security.keystore.KeyInfo;

/** Disposable emulator only. Its throwaway screen PIN is 24682468, never a user's PIN.
 * Run no-lock test, set emulator PIN, run lifecycle, clear PIN, run invalidation. */
public class DeviceAuthenticationTest extends ActivityInstrumentationTestCase2<MainActivity> {
    public DeviceAuthenticationTest(){super(MainActivity.class);}
    private MainActivity activity;
    private WebView web;
    @Override protected void setUp() throws Exception {
        super.setUp();assertTrue("Emulator only",Build.HARDWARE.equals("ranchu")||Build.HARDWARE.equals("goldfish"));
        android.accessibilityservice.AccessibilityServiceInfo service=getInstrumentation().getUiAutomation().getServiceInfo();
        service.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
        getInstrumentation().getUiAutomation().setServiceInfo(service);
        activity=getActivity();assertTrue(activity.getPackageName().endsWith(".qa"));refreshWeb();
        KeyguardManager keyguard=(KeyguardManager)activity.getSystemService(MainActivity.KEYGUARD_SERVICE);
        if(keyguard.isKeyguardLocked()){
            getInstrumentation().runOnMainSync(()->keyguard.requestDismissKeyguard(activity,null));pin();refreshWeb();
        }
    }
    private WebView find(View v){if(v instanceof WebView)return (WebView)v;if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){WebView w=find(((ViewGroup)v).getChildAt(i));if(w!=null)return w;}return null;}
    private void refreshWeb(){getInstrumentation().runOnMainSync(()->web=find(activity.getWindow().getDecorView()));}
    private String js(String code)throws Exception{
        CountDownLatch done=new CountDownLatch(1);String[] value={null};assertNotNull(web);
        getInstrumentation().runOnMainSync(()->web.evaluateJavascript(code,v->{value[0]=v;done.countDown();}));
        if(!done.await(15,TimeUnit.SECONDS)){
            StringBuilder flags=new StringBuilder();for(String name:new String[]{"foreground","authPrompt","sessionAuthenticated","deviceAuthEnabled","walletIOPending"}){java.lang.reflect.Field field=MainActivity.class.getDeclaredField(name);field.setAccessible(true);flags.append(name).append('=').append(field.get(activity)).append(' ');}
            fail("WebView did not reply; "+flags);
        }return value[0];
    }
    private void until(String code)throws Exception{for(int i=0;i<150;i++){if("true".equals(js("Boolean("+code+")")))return;Thread.sleep(200);}fail("Condition not reached: "+code+"; controls="+js("JSON.stringify({route:location.hash,disabled:document.getElementById('device-authentication')?.disabled,note:document.getElementById('device-authentication-note')?.textContent,error:document.getElementById('error')?.textContent,pending:SafeCorePlatform.deviceAuthenticationPending})"));}
    private void settings()throws Exception{
        until("document.documentElement.dataset.walletState");
        js("WalletNetwork.scan=async()=>{throw Error('Offline fixture')};if(document.getElementById('risk-notice')?.open){document.getElementById('risk-ack').checked=true;document.getElementById('risk-ack').dispatchEvent(new Event('change'));document.getElementById('risk-continue').click();}location.hash='security'");
        until("document.getElementById('device-authentication-note') && document.getElementById('device-authentication-note').textContent!=='Loading…'");
    }
    private void clickSystem(String id)throws Exception{
        for(int i=0;i<100;i++){
            AccessibilityNodeInfo root=getInstrumentation().getUiAutomation().getRootInActiveWindow();
            if(root!=null)for(AccessibilityNodeInfo node:root.findAccessibilityNodeInfosByViewId(id))if(node.performAction(AccessibilityNodeInfo.ACTION_CLICK))return;
            Thread.sleep(100);
        }
        StringBuilder flags=new StringBuilder();for(String name:new String[]{"foreground","authPrompt","sessionAuthenticated","deviceAuthEnabled","walletIOPending","authenticationDialog"}){java.lang.reflect.Field field=MainActivity.class.getDeclaredField(name);field.setAccessible(true);flags.append(name).append('=').append(field.get(activity)).append(' ');}
        fail("Missing system button: "+id+"; native="+flags+"; status="+js("JSON.stringify({route:location.hash,disabled:document.getElementById('device-authentication')?.disabled,note:document.getElementById('device-authentication-note')?.textContent,error:document.getElementById('error')?.textContent,risk:document.getElementById('risk-notice')?.open})"));
    }
    private AccessibilityNodeInfo editable(AccessibilityNodeInfo node){
        if(node==null)return null;if(node.isEditable())return node;
        for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo field=editable(node.getChild(i));if(field!=null)return field;}return null;
    }
    private void pin()throws Exception{
        for(int i=0;i<150;i++){
            AccessibilityNodeInfo root=getInstrumentation().getUiAutomation().getRootInActiveWindow();
            AccessibilityNodeInfo field=root!=null&&!activity.getPackageName().contentEquals(root.getPackageName())?editable(root):null;
            if(field!=null){
                field.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
                field.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                Thread.sleep(150);
                Bundle args=new Bundle();args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,"24682468");
                if(field.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,args)){
                    long now=SystemClock.uptimeMillis();
                    getInstrumentation().getUiAutomation().injectInputEvent(new KeyEvent(now,now,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_ENTER,0),true);
                    getInstrumentation().getUiAutomation().injectInputEvent(new KeyEvent(now,now,KeyEvent.ACTION_UP,KeyEvent.KEYCODE_ENTER,0),true);
                    for(int wait=0;wait<100;wait++){
                        AccessibilityNodeInfo current=getInstrumentation().getUiAutomation().getRootInActiveWindow();
                        if(current!=null&&activity.getPackageName().contentEquals(current.getPackageName())){getInstrumentation().getUiAutomation().waitForIdle(500,5000);return;}
                        Thread.sleep(100);
                    }fail("System PIN prompt did not finish");
                }
            }
            if(root!=null)for(AccessibilityNodeInfo node:root.findAccessibilityNodeInfosByText("Use PIN"))if(node.isClickable())node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            Thread.sleep(100);
        }fail("No system PIN field");
    }
    private void cancelPrompt()throws Exception{
        // The first Back can dismiss only the OS keyboard, not the PIN activity.
        boolean sawSystem=false;
        for(int i=0;i<100;i++){
            AccessibilityNodeInfo root=getInstrumentation().getUiAutomation().getRootInActiveWindow();
            boolean ours=root!=null&&activity.getPackageName().contentEquals(root.getPackageName());
            if(sawSystem&&ours){getInstrumentation().getUiAutomation().waitForIdle(500,5000);return;}
            if(root!=null&&!ours){sawSystem=true;getInstrumentation().getUiAutomation().performGlobalAction(1);Thread.sleep(400);}
            else Thread.sleep(100);
        }fail("OS authentication did not cancel");
    }
    private void toggle(boolean enabled,boolean confirm)throws Exception{
        js("document.getElementById('device-authentication').click()");clickSystem(confirm?"android:id/button1":"android:id/button2");
        if(confirm)pin();
        until("!document.getElementById('device-authentication').disabled && document.getElementById('device-authentication').checked==="+enabled);
    }
    private void unlockApp()throws Exception{
        for(int i=0;i<100;i++){refreshWeb();if(web==null)break;Thread.sleep(100);}assertNull(web);
        getInstrumentation().runOnMainSync(()->{
            ViewGroup root=(ViewGroup)activity.getWindow().getDecorView().findViewById(android.R.id.content);
            ViewGroup panel=(ViewGroup)root.getChildAt(0);((Button)panel.getChildAt(2)).performClick();
        });pin();
        for(int i=0;i<150;i++){refreshWeb();if(web!=null)break;Thread.sleep(100);}until("document.documentElement.dataset.walletState");
    }
    public void testNoScreenLock()throws Exception{
        assertFalse(((KeyguardManager)activity.getSystemService(MainActivity.KEYGUARD_SERVICE)).isDeviceSecure());settings();
        assertEquals("true",js("document.getElementById('device-authentication').disabled && document.getElementById('device-authentication-note').textContent.includes('Set up')"));
        String revision=new DeviceWalletStore(activity).read().getString("revision");
        js("window.__denied=false;SafeCorePlatform.setDeviceAuthentication('invalid',true).catch(()=>__denied=true)");until("__denied");
        assertEquals(revision,new DeviceWalletStore(activity).read().getString("revision"));
    }
    public void testFirstWalletDefault()throws Exception{
        assertTrue(((KeyguardManager)activity.getSystemService(MainActivity.KEYGUARD_SERVICE)).isDeviceSecure());
        settings();
        DeviceWalletStore store=new DeviceWalletStore(activity);
        assertTrue("Fresh disposable app only",store.read().getJSONObject("records").isNull("whippet.dev.encrypted.v1"));
        js("window.__first=null;SafeCorePlatform.getDeviceAuthentication().then(s=>__first=s.firstWalletDefault)");until("__first===true");
        js("location.hash='setup'");until("document.getElementById('ack')");
        js("document.getElementById('ack').checked=true;document.getElementById('submit-setup').click()");
        clickSystem("android:id/button2");until("!document.getElementById('submit-setup').disabled");
        assertFalse(store.authenticationRequired());assertTrue(store.read().getJSONObject("records").isNull("whippet.dev.encrypted.v1"));
        js("document.getElementById('submit-setup').click()");clickSystem("android:id/button1");cancelPrompt();
        until("!document.getElementById('submit-setup').disabled");assertFalse(store.authenticationRequired());
        assertTrue(store.read().getJSONObject("records").isNull("whippet.dev.encrypted.v1"));
        js("document.getElementById('submit-setup').click()");clickSystem("android:id/button1");pin();
        until("document.getElementById('recovery-words')");assertTrue(store.authenticationRequired());
        assertFalse(store.read().getJSONObject("records").isNull("whippet.dev.encrypted.v1"));
        settings();toggle(false,true);
        // Emulate deleting the last disposable wallet, retaining the explicit opt-out.
        org.json.JSONObject saved=store.read(),empty=new org.json.JSONObject().put("whippet.dev.encrypted.v1",org.json.JSONObject.NULL).put("corevault.wallets.v1",org.json.JSONObject.NULL);
        store.write(saved.getString("revision"),empty);
        getInstrumentation().runOnMainSync(()->web.reload());until("document.documentElement.dataset.walletState==='demo'");settings();
        js("window.__first=null;SafeCorePlatform.getDeviceAuthentication().then(s=>__first=s.firstWalletDefault)");until("__first===false");
        js("location.hash='setup'");until("document.getElementById('ack')");
        js("document.getElementById('ack').checked=true;document.getElementById('submit-setup').click()");until("document.getElementById('recovery-words')");
        assertFalse("Preserve opt-out",store.authenticationRequired());
    }
    public void testFirstWalletWithoutScreenLock()throws Exception{
        assertFalse(((KeyguardManager)activity.getSystemService(MainActivity.KEYGUARD_SERVICE)).isDeviceSecure());settings();
        DeviceWalletStore store=new DeviceWalletStore(activity);
        assertTrue("Fresh disposable app only",store.read().getJSONObject("records").isNull("whippet.dev.encrypted.v1"));
        js("window.__first=null;SafeCorePlatform.getDeviceAuthentication().then(s=>__first=s.firstWalletDefault)");until("__first===false");
        js("location.hash='setup'");until("document.getElementById('ack')");
        js("document.getElementById('ack').checked=true;document.getElementById('submit-setup').click()");until("document.getElementById('recovery-words')");
        assertFalse(store.authenticationRequired());assertFalse(store.read().getJSONObject("records").isNull("whippet.dev.encrypted.v1"));
        assertTrue(activity.getSharedPreferences("device_authentication",MainActivity.MODE_PRIVATE).getBoolean("setup_handled",false));
    }
    public void testAuthenticationLifecycle()throws Exception{
        assertTrue(((KeyguardManager)activity.getSystemService(MainActivity.KEYGUARD_SERVICE)).isDeviceSecure());
        if(web==null)unlockApp();settings();
        if(new DeviceWalletStore(activity).authenticationRequired())toggle(false,true);
        DeviceWalletStore store=new DeviceWalletStore(activity);String records=store.read().getJSONObject("records").toString();
        toggle(false,false);assertFalse(store.authenticationRequired());
        js("document.getElementById('device-authentication').click()");clickSystem("android:id/button1");cancelPrompt();
        until("!document.getElementById('device-authentication').disabled");assertFalse(store.authenticationRequired());
        toggle(true,true);assertTrue(store.authenticationRequired());assertEquals(records,store.read().getJSONObject("records").toString());
        KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);
        KeyInfo info=(KeyInfo)SecretKeyFactory.getInstance("AES","AndroidKeyStore").getKeySpec((javax.crypto.SecretKey)keys.getKey("safecore.wallet-storage.v1.auth",null),KeyInfo.class);
        assertTrue(info.isUserAuthenticationRequired());assertEquals(60,info.getUserAuthenticationValidityDurationSeconds());
        js("location.hash='reveal'");until("document.getElementById('reveal-seed')");js("document.getElementById('reveal-seed').click()");cancelPrompt();
        unlockApp();js("location.hash='reveal'");until("document.getElementById('reveal-seed')");assertEquals("true",js("!document.getElementById('revealed-words')"));
        js("document.getElementById('reveal-seed').click()");pin();until("document.getElementById('revealed-words')");
        getInstrumentation().runOnMainSync(()->getInstrumentation().callActivityOnPause(activity));refreshWeb();assertNull("Background destroys secret-bearing WebView",web);
        getInstrumentation().runOnMainSync(()->getInstrumentation().callActivityOnResume(activity));refreshWeb();assertNull(web);
        unlockApp();settings();
        js("location.hash='send';window.__approved=false;window.__cancelled=false");until("location.hash==='#send'");
        js("SafeCorePlatform.authenticateWalletAction('send').then(()=>__approved=true).catch(()=>__cancelled=true)");cancelPrompt();unlockApp();
        js("location.hash='send';window.__approved=false");until("location.hash==='#send'");
        js("SafeCorePlatform.authenticateWalletAction('send').then(()=>__approved=true)");pin();until("__approved");
        settings();toggle(true,false);assertTrue(store.authenticationRequired());toggle(false,true);assertFalse(store.authenticationRequired());
        assertEquals(records,store.read().getJSONObject("records").toString());
        toggle(true,true); // Leave enabled for expiry and screen-lock-removal tests.
    }
    public void testCredentialRemovedFailsClosed()throws Exception{
        DeviceWalletStore store=new DeviceWalletStore(activity);assertTrue(store.authenticationRequired());
        assertFalse(((KeyguardManager)activity.getSystemService(MainActivity.KEYGUARD_SERVICE)).isDeviceSecure());
        java.nio.file.Path path=new java.io.File(activity.getNoBackupFilesDir(),"wallets-v1.enc").toPath();byte[] before=java.nio.file.Files.readAllBytes(path);
        try{store.read();fail("Removed credential unlocked store");}catch(java.security.GeneralSecurityException|IllegalStateException expected){}
        assertTrue(java.util.Arrays.equals(before,java.nio.file.Files.readAllBytes(path)));
        refreshWeb();assertNull(web);
    }
    public void testProtectedExportAndImportReturn()throws Exception{
        if(web==null)unlockApp();settings();
        DeviceWalletStore store=new DeviceWalletStore(activity);assertTrue(store.authenticationRequired());
        String raw=store.read().getJSONObject("records").getString("whippet.dev.encrypted.v1");
        js("location.hash='wallets'");until("document.querySelector('[data-export-wallet]')");
        js("document.querySelector('[data-export-wallet]').click()");until("document.getElementById('confirm-export')");
        js("document.getElementById('confirm-export').click()");cancelPrompt();unlockApp();
        js("location.hash='wallets'");until("document.querySelector('[data-export-wallet]')");
        js("document.querySelector('[data-export-wallet]').click()");until("document.getElementById('confirm-export')");
        js("document.getElementById('confirm-export').click()");pin();clickSystem("android:id/button2");
        until("document.getElementById('error').textContent.includes('Backup cancelled')");
        int count=new org.json.JSONObject(store.read().getJSONObject("records").getString("corevault.wallets.v1")).getJSONArray("wallets").length();
        // Simulate return from the native document picker with disposable JSON.
        // The native parser is unchanged; this verifies delivery AFTER gate/rebuild.
        getInstrumentation().runOnMainSync(()->getInstrumentation().callActivityOnPause(activity));
        java.lang.reflect.Field imported=MainActivity.class.getDeclaredField("importedBackup");imported.setAccessible(true);imported.set(activity,raw);
        getInstrumentation().runOnMainSync(()->getInstrumentation().callActivityOnResume(activity));
        unlockApp();until("document.getElementById('file-status')?.textContent.includes('Unprotected backup selected')");
        js("document.getElementById('submit-setup').click()");until("location.hash==='#wallet'");
        org.json.JSONObject after=store.read().getJSONObject("records");
        assertEquals(count+1,new org.json.JSONObject(after.getString("corevault.wallets.v1")).getJSONArray("wallets").length());
        assertEquals(new org.json.JSONObject(raw).getJSONObject("recipe").toString(),new org.json.JSONObject(after.getString("whippet.dev.encrypted.v1")).getJSONObject("recipe").toString());
    }
    public void testExpiredAuthorizationCannotDecrypt()throws Exception{
        DeviceWalletStore store=new DeviceWalletStore(activity);assertTrue(store.authenticationRequired());
        java.nio.file.Path path=new java.io.File(activity.getNoBackupFilesDir(),"wallets-v1.enc").toPath();
        byte[] before=java.nio.file.Files.readAllBytes(path);
        Thread.sleep(65000); // No OS authentication during the whole key-authorization interval.
        try{store.read();fail("Expired authorization decrypted wallet");}catch(android.security.keystore.UserNotAuthenticatedException expected){}
        assertTrue(java.util.Arrays.equals(before,java.nio.file.Files.readAllBytes(path)));refreshWeb();assertNull(web);
    }
}
