package org.pepecoinservice.safecore;

import android.test.ActivityInstrumentationTestCase2;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import android.net.Uri;
import android.provider.DocumentsContract;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** Only the runner's fresh emulator. Generated disposable wallets, no logging of data. */
public class RecoveryCopyUiTest extends ActivityInstrumentationTestCase2<MainActivity> {
    public RecoveryCopyUiTest(){super(MainActivity.class);}
    private MainActivity activity;private WebView web;
    private static final String NAME="SafeCore-disposable-recovery.json";
    private WebView find(View view){if(view instanceof WebView)return (WebView)view;if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){WebView found=find(((ViewGroup)view).getChildAt(i));if(found!=null)return found;}return null;}
    private String js(String code)throws Exception{CountDownLatch done=new CountDownLatch(1);String[] result={null};getInstrumentation().runOnMainSync(()->web.evaluateJavascript(code,value->{result[0]=value;done.countDown();}));assertTrue(done.await(15,TimeUnit.SECONDS));return result[0];}
    private void until(String code)throws Exception{for(int i=0;i<150;i++){if("true".equals(js("Boolean("+code+")")))return;Thread.sleep(200);}fail("Disposable recovery-copy condition not reached");}
    @Override protected void setUp()throws Exception{
        super.setUp();assertTrue(Build.HARDWARE.equals("ranchu")||Build.HARDWARE.equals("goldfish"));
        android.accessibilityservice.AccessibilityServiceInfo service=getInstrumentation().getUiAutomation().getServiceInfo();
        service.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;getInstrumentation().getUiAutomation().setServiceInfo(service);
        activity=getActivity();assertTrue(activity.getPackageName().endsWith(".qa"));getInstrumentation().runOnMainSync(()->web=find(activity.getWindow().getDecorView()));
        until("document.documentElement.dataset.walletState==='demo'");
        js("WalletNetwork.scan=async()=>{throw Error('Offline fixture')};if(document.getElementById('risk-notice')?.open){document.getElementById('risk-ack').checked=true;document.getElementById('risk-ack').dispatchEvent(new Event('change'));document.getElementById('risk-continue').click();}");
    }
    private AccessibilityNodeInfo control(String id)throws Exception{
        for(int i=0;i<100;i++){AccessibilityNodeInfo root=getInstrumentation().getUiAutomation().getRootInActiveWindow();if(root!=null){String resolved=id;if(id.startsWith("com.google.android.documentsui:")&&root.getPackageName()!=null&&root.getPackageName().toString().endsWith("documentsui"))resolved=root.getPackageName()+id.substring(id.indexOf(':'));for(AccessibilityNodeInfo node:root.findAccessibilityNodeInfosByViewId(resolved))return node;}Thread.sleep(100);}fail("Missing disposable picker control: "+id);return null;
    }
    private void clickText(String text)throws Exception{
        for(int i=0;i<100;i++){AccessibilityNodeInfo root=getInstrumentation().getUiAutomation().getRootInActiveWindow();if(root!=null)for(AccessibilityNodeInfo node:root.findAccessibilityNodeInfosByText(text)){boolean match=node.getText()!=null&&text.contentEquals(node.getText())||text.equals(NAME)&&node.getContentDescription()!=null&&node.getContentDescription().toString().startsWith(NAME);if(!match)continue;for(AccessibilityNodeInfo target=node;target!=null;target=target.getParent())if(target.isClickable()&&target.performAction(AccessibilityNodeInfo.ACTION_CLICK)){getInstrumentation().getUiAutomation().waitForIdle(300,5000);return;}}Thread.sleep(100);}fail("Missing disposable document entry");
    }
    private void clickControl(String id)throws Exception{
        for(int i=0;i<100;i++){AccessibilityNodeInfo node=control(id);if(node.isEnabled()&&node.performAction(AccessibilityNodeInfo.ACTION_CLICK))return;Thread.sleep(100);}fail("Disposable picker button did not become ready");
    }
    private void tap(String selector)throws Exception{
        js("document.querySelector("+JSONObject.quote(selector)+").scrollIntoView({block:'center'})");Thread.sleep(300);
        org.json.JSONArray point=new org.json.JSONArray(js("(()=>{const r=document.querySelector("+JSONObject.quote(selector)+").getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()"));
        int[] offset=new int[2];float[] scale=new float[1];getInstrumentation().runOnMainSync(()->{web.getLocationOnScreen(offset);scale[0]=web.getScale();});
        float x=offset[0]+(float)point.getDouble(0)*scale[0],y=offset[1]+(float)point.getDouble(1)*scale[0];long now=SystemClock.uptimeMillis();
        for(int action:new int[]{MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP}){MotionEvent event=MotionEvent.obtain(now,SystemClock.uptimeMillis(),action,x,y,0);getInstrumentation().getUiAutomation().injectInputEvent(event,true);event.recycle();}
    }
    public void testSaveEncryptedCopy()throws Exception{
        assertFalse(new DeviceWalletStore(activity).authenticationRequired());
        js("location.hash='setup'");until("document.getElementById('ack')");
        js("document.getElementById('use-passphrase').click();document.getElementById('passphrase').value='Public-fixture-passphrase';document.getElementById('ack').checked=true;document.getElementById('submit-setup').click()");until("document.getElementById('recovery-copy-yes')");
        JSONObject original=new JSONObject(new DeviceWalletStore(activity).read().getJSONObject("records").getString("whippet.dev.encrypted.v1")).getJSONObject("recipe");
        js("document.getElementById('recovery-copy-yes').click();document.getElementById('recovery-copy-password').value='Disposable-recovery-password-123';document.getElementById('recovery-copy-confirm').value='Disposable-recovery-password-123';document.getElementById('save-recovery-copy').click()");
        AccessibilityNodeInfo field=control("android:id/title");Bundle args=new Bundle();args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,NAME);assertTrue(field.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,args));
        clickControl("android:id/button1");
        String saved="";for(int i=0;i<150;i++){saved=activity.getSharedPreferences(LocalRecoveryCopy.PREFS,0).getString(LocalRecoveryCopy.LAST_URI,"");if(!saved.isEmpty())break;Thread.sleep(200);}assertFalse("Verified save must remember a local URI",saved.isEmpty());
        Uri uri=Uri.parse(saved);assertTrue(LocalRecoveryCopy.localDocument(uri));assertTrue(DocumentsContract.getDocumentId(uri).endsWith("/"+NAME));
        String data;try(InputStream in=activity.getContentResolver().openInputStream(uri);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[4096];int count;while((count=in.read(buffer))!=-1){assertTrue(out.size()+count<65536);out.write(buffer,0,count);}data=out.toString("UTF-8");}
        LocalRecoveryCopy.validate(data);assertFalse(data.contains(original.getString("mnemonic")));assertFalse(data.contains("Public-fixture-passphrase"));assertFalse(data.contains("Disposable-recovery-password"));
        assertEquals(uri,LocalRecoveryCopy.picker(activity).getParcelableExtra(DocumentsContract.EXTRA_INITIAL_URI));
        until("!document.getElementById('recovery-words')");
        js("window.__copyVerified=false;(async()=>{const recovered=WalletEngine.validateRecipe(ethers,await WalletEngine.decrypt(crypto,JSON.parse("+JSONObject.quote(data)+"),'Disposable-recovery-password-123'));const original=JSON.parse("+JSONObject.quote(original.toString())+");const a=WalletEngine.accounts(ethers,recovered),b=WalletEngine.accounts(ethers,original);window.__copyVerified=recovered.mnemonic===original.mnemonic&&recovered.passphrase===original.passphrase&&['pep','btc','doge','ltc','shic','wht'].every(c=>a[c].address===b[c].address);})()");until("__copyVerified");
    }
    public void testRestoreAfterUninstall()throws Exception{
        assertTrue("Reinstalled app must have no remembered access",activity.getSharedPreferences(LocalRecoveryCopy.PREFS,0).getAll().isEmpty());
        assertTrue(new DeviceWalletStore(activity).read().getJSONObject("records").isNull("whippet.dev.encrypted.v1"));
        js("location.hash='setup'");until("document.querySelector('[data-setup=import]')");js("document.querySelector('[data-setup=import]').click()");until("document.getElementById('backup-file')");js("document.getElementById('restore-options').open=true");tap("#backup-file");
        // Reinstall intentionally loses the app's picker hint. Navigate to the
        // known fixture folder instead of assuming Android's Recents lists it.
        AccessibilityNodeInfo toolbar=control("com.google.android.documentsui:id/toolbar");
        for(int i=0;i<toolbar.getChildCount();i++){AccessibilityNodeInfo child=toolbar.getChild(i);if("Show roots".contentEquals(child.getContentDescription())){assertTrue(child.performAction(AccessibilityNodeInfo.ACTION_CLICK));break;}}
        clickText("sdk_gphone64_x86_64");clickText("Documents");
        clickText(NAME);
        until("document.getElementById('file-status')?.textContent.includes('Encrypted')");
        js("document.getElementById('password').value='Disposable-recovery-password-123';document.getElementById('confirm').value='Disposable-recovery-password-123';document.getElementById('submit-setup').click()");until("document.documentElement.dataset.walletState==='unlocked'");
        assertFalse(new DeviceWalletStore(activity).read().getJSONObject("records").isNull("whippet.dev.encrypted.v1"));
    }
}
