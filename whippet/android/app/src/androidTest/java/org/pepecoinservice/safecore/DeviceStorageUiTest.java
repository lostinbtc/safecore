package org.pepecoinservice.safecore;

import android.test.ActivityInstrumentationTestCase2;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.util.AtomicFile;
import java.io.File;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** Run only on a freshly installed QA app in a disposable emulator. Public fixtures only. */
public class DeviceStorageUiTest extends ActivityInstrumentationTestCase2<MainActivity> {
    public DeviceStorageUiTest() { super(MainActivity.class); }
    private WebView web;
    private WebView find(View v) {
        if(v instanceof WebView)return (WebView)v;
        if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){
            WebView result=find(((ViewGroup)v).getChildAt(i));if(result!=null)return result;
        }
        return null;
    }
    private String js(String code) throws Exception {
        CountDownLatch done=new CountDownLatch(1);String[] result={null};
        getInstrumentation().runOnMainSync(()->web.evaluateJavascript(code,v->{result[0]=v;done.countDown();}));
        assertTrue(done.await(15,TimeUnit.SECONDS));return result[0];
    }
    private void until(String condition) throws Exception {
        for(int i=0;i<150;i++){if("true".equals(js("Boolean("+condition+")")))return;Thread.sleep(200);}
        // Never dump DOM, vaults, phrases or native payloads on failure.
        fail("Condition not reached: "+condition);
    }
    public void testMigrationCreateReloadAndProtection() throws Exception {
        MainActivity activity=getActivity();assertTrue(activity.getPackageName().endsWith(".qa"));
        getInstrumentation().runOnMainSync(()->web=find(activity.getWindow().getDecorView()));
        until("document.documentElement.dataset.walletState === 'demo'");
        DeviceWalletStore nativeStore=new DeviceWalletStore(activity);
        JSONObject empty=nativeStore.read().getJSONObject("records");
        assertTrue("Fresh disposable app only",empty.isNull("whippet.dev.encrypted.v1")&&empty.isNull("corevault.wallets.v1"));
        // Seed old-version localStorage with known public words, then discard ONLY
        // the verified empty native document to exercise first-upgrade migration.
        js("window.__seeded=false;(async()=>{const recipe=WalletEngine.recipe(ethers,'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');const a=WalletEngine.unprotected(crypto,recipe),b=await WalletEngine.encrypt(crypto,recipe,'Public-test-password-123');const legacy=WalletLibrary.create(localStorage);legacy.save(a,'Open fixture');legacy.save(b,'Protected fixture');legacy.activate(WalletLibrary.id(a));window.__seeded=true;})()");
        until("__seeded");
        new AtomicFile(new File(activity.getNoBackupFilesDir(),"wallets-v1.enc")).delete();
        js("localStorage.removeItem('corevault.device-storage.v1');location.hash='wallets'");
        getInstrumentation().runOnMainSync(()->web.reload());
        until("document.documentElement.dataset.walletState === 'unlocked' && document.querySelectorAll('.saved-wallet').length===2");
        assertEquals("true",js("localStorage.getItem('whippet.dev.encrypted.v1')===null && localStorage.getItem('corevault.wallets.v1')===null"));
        assertEquals(2,new JSONObject(nativeStore.read().getJSONObject("records").getString("corevault.wallets.v1")).getJSONArray("wallets").length());
        // Disable actual discovery before accepting the risk notice; no network fixture funding.
        js("WalletNetwork.scan=async()=>{throw Error('Offline fixture')};document.getElementById('risk-ack').checked=true;document.getElementById('risk-ack').dispatchEvent(new Event('change'));document.getElementById('risk-continue').click();location.hash='security'");
        until("document.getElementById('password-protection')?.textContent.includes('Device-encrypted storage')");
        js("location.hash='wallets'");until("document.querySelectorAll('.saved-wallet').length===2");
        js("document.querySelectorAll('[data-open-wallet]')[1].click()");until("document.getElementById('unlock-password')");
        js("document.getElementById('unlock-password').value='Public-test-password-123';document.getElementById('unlock-submit').click()");
        until("document.documentElement.dataset.walletState === 'unlocked'");
        js("location.hash='wallets'");until("document.getElementById('add-wallet')");js("document.getElementById('add-wallet').click()");until("document.getElementById('ack')");
        js("document.getElementById('ack').checked=true;document.getElementById('submit-setup').click()");until("document.getElementById('recovery-words')");
        assertEquals(3,new JSONObject(nativeStore.read().getJSONObject("records").getString("corevault.wallets.v1")).getJSONArray("wallets").length());
        assertEquals("true",js("localStorage.getItem('whippet.dev.encrypted.v1')===null && localStorage.getItem('corevault.wallets.v1')===null"));
        getInstrumentation().runOnMainSync(()->getInstrumentation().callActivityOnPause(activity));
        until("!document.getElementById('recovery-words')");
        getInstrumentation().runOnMainSync(()->getInstrumentation().callActivityOnResume(activity));
        js("localStorage.removeItem('corevault.risk-ack.v1');location.hash='wallets'");
        getInstrumentation().runOnMainSync(()->web.reload());
        until("document.querySelectorAll('.saved-wallet').length===3");
    }
}
