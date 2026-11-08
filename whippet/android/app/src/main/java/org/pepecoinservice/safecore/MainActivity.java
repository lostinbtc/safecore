package org.pepecoinservice.safecore;

import android.app.Activity;
import android.app.AlertDialog;
import android.Manifest;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.Button;
import android.widget.LinearLayout;
import android.os.SystemClock;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Bundled code only; no remote pages, generic JavaScript bridge or analytics. */
public final class MainActivity extends Activity {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    static final String START = ORIGIN + "/assets/wallet/index.html";
    private static final int IMPORT = 10, EXPORT = 11, CAMERA = 12;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private boolean importPending;
    private String exportData;
    private JavaScriptReplyProxy exportReply;
    private long exportId;
    private boolean foreground;
    private final ExecutorService walletIO = Executors.newSingleThreadExecutor();
    private boolean walletIOPending;
    private DeviceAuthentication deviceAuthentication;
    private boolean deviceAuthEnabled, authPrompt, sessionAuthenticated;
    private long lastAuthentication;
    private AlertDialog authenticationDialog;
    private Runnable pendingAuthentication;
    private long pendingAuthenticationAt;

    private boolean hasWallets(JSONObject state) throws Exception {
        if(state==null)return false;
        JSONObject records=state.getJSONObject("records");
        if(!records.isNull("whippet.dev.encrypted.v1"))return true;
        return !records.isNull("corevault.wallets.v1") && new JSONObject(records.getString("corevault.wallets.v1")).getJSONArray("wallets").length()>0;
    }
    private void rememberAuthenticationChoice() throws Exception {
        if(getSharedPreferences("device_authentication",MODE_PRIVATE).getBoolean("setup_handled",false))return;
        if(!getSharedPreferences("device_authentication",MODE_PRIVATE).edit().putBoolean("setup_handled",true).commit())throw new IllegalStateException("Could not save authentication preference");
    }
    private boolean firstWalletAuthentication() throws Exception {
        return !deviceAuthEnabled && deviceAuthentication.available()
            && !getSharedPreferences("device_authentication",MODE_PRIVATE).getBoolean("setup_handled",false)
            && !hasWallets(new DeviceWalletStore(this).read());
    }
    private boolean authenticationChangeAllowed(WebView view, String value) throws Exception {
        String route=Uri.parse(view.getUrl()).getFragment();
        return "security".equals(route) || ("setup".equals(route) && new JSONObject(value).getBoolean("enabled") && firstWalletAuthentication());
    }
    private void authenticationStatus(JavaScriptReplyProxy reply,long id) {
        try { reply.postMessage(new JSONObject().put("id",id).put("ok",true)
            .put("enabled",deviceAuthEnabled).put("available",deviceAuthentication.available()).put("firstWalletDefault",firstWalletAuthentication()).toString()); }
        catch(Exception e) { respond(reply,id,false,"Device authentication status is unavailable."); }
    }
    private void authenticationCancelled(JavaScriptReplyProxy reply,long id) {
        try { reply.postMessage(new JSONObject().put("id",id).put("ok",false)
            .put("code","AUTH_CANCELLED").put("error","Device authentication cancelled. Nothing was changed.").toString()); }
        catch(Exception ignored) { }
    }
    private void authenticate(String title,Runnable success,Runnable cancelled) {
        if(authPrompt || !foreground || !deviceAuthentication.available()){cancelled.run();return;}
        authPrompt=true;
        Runnable launch=()->{
            if(!foreground){authPrompt=false;cancelled.run();return;}
            deviceAuthentication.authenticate(title,ok->{
                Runnable completion=()->{
                    authPrompt=false;
                    if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('safecore-auth-end'))",null);
                    // Cancellation can also mean Home was pressed while the OS credential
                    // activity covered us. Never resume a protected plaintext session then.
                    if(!ok&&deviceAuthEnabled){cancelled.run();destroyWalletView();if(foreground&&!isDestroyed())showDeviceLock("Authentication cancelled. Your wallets remain protected.");return;}
                    if(ok && foreground && !isDestroyed()) { lastAuthentication=SystemClock.elapsedRealtime();success.run(); }
                    else { cancelled.run();if(deviceAuthEnabled && !foreground)destroyWalletView(); }
                };
                if(!foreground&&!isDestroyed()){pendingAuthentication=completion;pendingAuthenticationAt=SystemClock.elapsedRealtime();}
                else completion.run();
            });
        };
        if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('safecore-auth-prompt'))",ignored->launch.run());
        else launch.run();
    }
    private void destroyWalletView() {
        sessionAuthenticated=false;lastAuthentication=0;
        if(web!=null){
            WebView previous=web;web=null;
            if(fileCallback!=null){fileCallback.onReceiveValue(null);fileCallback=null;}
            if(previous.getParent() instanceof android.view.ViewGroup)((android.view.ViewGroup)previous.getParent()).removeView(previous);
            previous.stopLoading();previous.destroy();
        }
    }
    private void showDeviceLock(String message) {
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        int padding=(int)(24*getResources().getDisplayMetrics().density);
        LinearLayout panel=new LinearLayout(this);panel.setOrientation(LinearLayout.VERTICAL);panel.setGravity(android.view.Gravity.CENTER);panel.setPadding(padding,padding*2,padding,padding*2);
        panel.setBackgroundColor(Color.rgb(11,16,24));
        TextView title=new TextView(this);title.setText("SafeCore locked");title.setTextColor(Color.WHITE);title.setTextSize(24);panel.addView(title);
        TextView notice=new TextView(this);notice.setText(deviceAuthentication.available()?message:"Phone authentication is unavailable. If its screen lock was removed, you will need a separate recovery backup. Do not clear app data unless every wallet is backed up.");notice.setTextColor(Color.LTGRAY);notice.setPadding(0,24,0,24);panel.addView(notice);
        Button unlock=new Button(this);unlock.setText("Unlock SafeCore");panel.addView(unlock);setContentView(panel);
        unlock.setEnabled(deviceAuthentication.available());
        unlock.setOnClickListener(v->{unlock.setEnabled(false);authenticate("Unlock SafeCore",()->{
            walletIO.execute(()->{
                try { new DeviceWalletStore(this).read(); }
                catch(Exception e){runOnUiThread(()->showDeviceLock("Wallet storage could not be unlocked. Do not clear app data. Keep your separate recovery backup."));return;}
                runOnUiThread(()->{if(foreground&&!isDestroyed()){sessionAuthenticated=true;buildWalletView();}});
            });
        },()->{if(foreground)showDeviceLock("Confirm your fingerprint or phone screen lock to open your wallets.");});});
    }
    private void walletRequest(String action,String value,WebView view,JavaScriptReplyProxy reply,long id) {
        if(walletIOPending || authPrompt){respond(reply,id,false,"Wallet storage is busy. Try again.");return;}
        walletIOPending=true;
        Runnable operation=()->{
            boolean allowed=false;
            try {allowed=foreground&&view==web&&view.getUrl()!=null&&localPage(Uri.parse(view.getUrl()))
                && (!action.equals("setDeviceAuthentication")||authenticationChangeAllowed(view,value));}catch(Exception ignored){}
            if(!allowed){
                walletIOPending=false;authenticationCancelled(reply,id);return;
            }
            walletIO.execute(()->{
            JSONObject result=new JSONObject();
            try {
                DeviceWalletStore store=new DeviceWalletStore(this);
                result.put("id",id).put("ok",true);
                if(action.equals("readWalletStore")) {
                    if(!value.isEmpty())throw new IllegalArgumentException();
                    JSONObject saved=store.read();if(hasWallets(saved))rememberAuthenticationChoice();result.put("state",saved==null?JSONObject.NULL:saved);
                } else if(action.equals("writeWalletStore")) {
                    JSONObject request=new JSONObject(value);
                    if(!request.has("revision")||(!request.isNull("revision")&&!(request.get("revision") instanceof String)))throw new IllegalArgumentException();
                    result.put("revision",store.write(request.isNull("revision")?null:request.getString("revision"),request.getJSONObject("records")));
                    if(hasWallets(store.read()))rememberAuthenticationChoice();
                } else if(action.equals("setDeviceAuthentication")) {
                    JSONObject request=new JSONObject(value);
                    result.put("revision",store.setAuthentication(request.getString("revision"),request.getBoolean("enabled")));
                    rememberAuthenticationChoice();
                } else { store.read(); } // Confirm that the authentication really authorizes the Keystore key.
            } catch(Exception e) {
                runOnUiThread(()->{walletIOPending=false;respond(reply,id,false,"Device wallet storage is unavailable. Reopen the app; do not clear its data.");});return;
            }
            runOnUiThread(()->{
                walletIOPending=false;
                if(action.equals("setDeviceAuthentication")) {
                    try {deviceAuthEnabled=new DeviceWalletStore(this).authenticationRequired();sessionAuthenticated=foreground&&view==web;if(deviceAuthEnabled&&!foreground)destroyWalletView();}
                    catch(Exception e){destroyWalletView();showDeviceLock("Wallet storage needs attention. Do not clear app data.");return;}
                }
                if(!foreground||isDestroyed()||view!=web||view.getUrl()==null||!localPage(Uri.parse(view.getUrl()))) {
                    respond(reply,id,false,"Wallet storage operation interrupted. Reopen the app.");return;
                }
                try {reply.postMessage(result.toString());}catch(Exception ignored){}
            });
            });
        };
        boolean fresh=action.equals("authenticateWalletAction")||action.equals("setDeviceAuthentication");
        if(fresh || (deviceAuthEnabled && SystemClock.elapsedRealtime()-lastAuthentication>45000)) {
            walletIOPending=false; // The modal prompt itself serializes requests.
            authenticate(fresh?"Confirm wallet action":"Unlock wallet storage",()->{walletIOPending=true;operation.run();},()->authenticationCancelled(reply,id));
        } else operation.run();
    }
    private String importedBackup;
    private PermissionRequest cameraRequest;
    private boolean cameraPrompt, cameraResultReady;
    private AlertDialog screenProtectionDialog;
    private static final String SCREEN_PREFS = "screen_privacy", SCREEN_PROTECTED = "protected";

    private boolean screenProtected() {
        return getSharedPreferences(SCREEN_PREFS, MODE_PRIVATE).getBoolean(SCREEN_PROTECTED, true);
    }
    private void applyScreenProtection() {
        if(!foreground || screenProtected())getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
    private void respondScreenProtection(JavaScriptReplyProxy reply, long id) {
        try { reply.postMessage(new JSONObject().put("id",id).put("ok",true).put("enabled",screenProtected()).toString()); }
        catch(Exception ignored) { }
    }
    private void saveScreenProtection(boolean enabled, JavaScriptReplyProxy reply, long id) {
        // The native setting is device-wide, not part of any seed/backup.
        if(!foreground || web==null || web.getUrl()==null || !localPage(Uri.parse(web.getUrl()))
            || !"security".equals(Uri.parse(web.getUrl()).getFragment())) {
            respond(reply,id,false,"Open Settings to change screenshot protection.");return;
        }
        boolean previous=screenProtected();
        if(!getSharedPreferences(SCREEN_PREFS,MODE_PRIVATE).edit().putBoolean(SCREEN_PROTECTED,enabled).commit()) {
            getSharedPreferences(SCREEN_PREFS,MODE_PRIVATE).edit().putBoolean(SCREEN_PROTECTED,previous).commit();
            applyScreenProtection();respond(reply,id,false,"Could not save screenshot protection.");return;
        }
        applyScreenProtection();respondScreenProtection(reply,id);
    }

    static boolean cameraResources(Uri origin, String[] resources) {
        return origin != null && (ORIGIN.equals(origin.toString()) || (ORIGIN+"/").equals(origin.toString()))
            && resources.length == 1 && PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resources[0]);
    }
    static boolean transactionPage(Uri uri) {
        return uri != null && "https".equals(uri.getScheme()) && "pepecoinservice.org".equals(uri.getHost())
            && uri.getPort() == -1 && uri.getUserInfo() == null && uri.getQuery() == null && uri.getFragment() == null
            && uri.getEncodedPath() != null && uri.getEncodedPath().matches("/explorer/tx/[0-9a-f]{64}/");
    }
    private boolean cameraPage() {
        if(web == null || web.getUrl() == null)return false;
        Uri page=Uri.parse(web.getUrl());
        return localPage(page) && ("send".equals(page.getFragment()) || "sweep".equals(page.getFragment()));
    }
    private void denyCamera() {
        PermissionRequest request=cameraRequest;cameraRequest=null;cameraPrompt=false;cameraResultReady=false;
        if(request!=null)request.deny();
        endCameraPrompt();
    }
    private void endCameraPrompt() {
        if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('safecore-camera-prompt-end'))",null);
    }
    private void grantCameraIfActive() {
        if(cameraRequest==null||!foreground)return;
        if(!cameraPage()||checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){denyCamera();return;}
        PermissionRequest request=cameraRequest;
        web.evaluateJavascript("Boolean(document.getElementById('scan-panel') && !document.getElementById('scan-panel').hidden && !document.hidden)", active->{
            if(cameraRequest!=request)return;
            if(!foreground||!cameraPage()||!"true".equals(active)){denyCamera();return;}
            cameraRequest=null;cameraPrompt=false;cameraResultReady=false;
            request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            endCameraPrompt();
        });
    }

    static boolean localPage(Uri uri) {
        return "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())
            && uri.getPort() == -1 && "/assets/wallet/index.html".equals(uri.getPath())
            && uri.getQuery() == null && uri.getUserInfo() == null;
    }
    private static WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked",
            Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        deviceAuthentication=new DeviceAuthentication(this);
        try {deviceAuthEnabled=new DeviceWalletStore(this).authenticationRequired();}
        catch(Exception e){showDeviceLock("Wallet storage needs attention. Do not clear app data.");return;}
        if(deviceAuthEnabled){showDeviceLock("Confirm your fingerprint or phone screen lock to open your wallets.");return;}
        buildWalletView();
    }
    private void buildWalletView() {
        // Secure before the first frame; debugging never changes this preference.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        if(android.os.Build.VERSION.SDK_INT>=33)setRecentsScreenshotEnabled(false);
        web = new WebView(this);
        web.setId(View.generateViewId());
        web.setSaveEnabled(false);
        web.setSaveFromParentEnabled(false);
        web.setBackgroundColor(Color.rgb(11, 16, 24));
        web.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG_TOOLS_ENABLED);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        // The user already taps Scan and grants camera permission. Do not require
        // a second playback gesture after asynchronous camera startup.
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setGeolocationEnabled(false);
        settings.setSaveFormData(false);
        CookieManager.getInstance().setAcceptCookie(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(11,16,24));
        root.addView(web, new FrameLayout.LayoutParams(-1,-1));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            // Keep controls outside status/navigation bars, cutouts and the keyboard.
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars()
                    | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(i.left, i.top, i.right, i.bottom);
            } else v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            web.postOnAnimation(()->{if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('safecore-resize'))",null);});
            return android.os.Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
        });
        setContentView(root);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if(request.isForMainFrame() && request.hasGesture() && foreground && view.getUrl() != null && localPage(Uri.parse(view.getUrl())) && transactionPage(request.getUrl())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW,request.getUrl()).addCategory(Intent.CATEGORY_BROWSABLE)); }
                    catch(Exception e) { Toast.makeText(MainActivity.this,"No browser available to open this transaction.",Toast.LENGTH_SHORT).show(); }
                    return true;
                }
                return !localPage(request.getUrl());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("https".equals(u.getScheme()) && "appassets.androidplatform.net".equals(u.getHost()) && u.getPort() == -1) {
                    WebResourceResponse response = assets.shouldInterceptRequest(u);
                    return response == null ? blocked() : response;
                }
                if ("https".equals(u.getScheme()) && "api.kraken.com".equals(u.getHost()) && u.getPort() == -1
                    && "/0/public/Ticker".equals(u.getPath()) && "pair=PEPUSD,USDTUSD".equals(u.getQuery()) && "GET".equals(request.getMethod())) return null;
                return blocked(); // WSS is allowed by CSP; WalletNetwork selects default/user-approved endpoints.
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) { handler.cancel(); }
            @Override public void onPageFinished(WebView view, String url) {
                if (url == null || !localPage(Uri.parse(url))) return;
                publishSystemTheme();
                deliverImportedBackup(100);
                view.evaluateJavascript("Boolean(window.isSecureContext && window.crypto?.subtle && navigator.locks && typeof BigInt === 'function')", value -> {
                    if (!"true".equals(value)) showUnsupported();
                });
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public Bitmap getDefaultVideoPoster() { return Bitmap.createBitmap(1,1,Bitmap.Config.ARGB_8888); }
            @Override public boolean onConsoleMessage(ConsoleMessage message) { return true; } // Never log wallet content.
            @Override public void onPermissionRequest(PermissionRequest request) {
                if(!foreground||!cameraPage()||!cameraResources(request.getOrigin(),request.getResources())||cameraRequest!=null){request.deny();return;}
                cameraRequest=request;
                // Permission is available only to an explicitly opened send/sweep scanner.
                web.evaluateJavascript("Boolean(document.getElementById('scan-panel') && !document.getElementById('scan-panel').hidden)", active->{
                    if(cameraRequest!=request)return;
                    if(!foreground||!cameraPage()||!"true".equals(active)){denyCamera();return;}
                    if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)grantCameraIfActive();
                    else {
                        cameraPrompt=true;
                        // WebView also reports hidden while this OS sheet is up.
                        // Mark that narrow transition before opening it; onStop
                        // still locks and cancels if the actual app is backgrounded.
                        web.evaluateJavascript("window.dispatchEvent(new Event('safecore-camera-prompt'))", ignored->{
                            if(cameraRequest!=request||!foreground){denyCamera();return;}
                            try{requestPermissions(new String[]{Manifest.permission.CAMERA},CAMERA);}
                            catch(Exception e){denyCamera();}
                        });
                    }
                });
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if(cameraRequest==request){cameraRequest=null;cameraPrompt=false;cameraResultReady=false;endCameraPrompt();}
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!foreground || view.getUrl() == null || !localPage(Uri.parse(view.getUrl()))) return false;
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json");
                    importPending = true;
                    startActivityForResult(intent, IMPORT);
                } catch (Exception e) { importPending=false;fileCallback.onReceiveValue(null); fileCallback = null; }
                return true;
            }
        });
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) { showUnsupported(); return; }
        WebViewCompat.addWebMessageListener(web, "SafeCoreNative", Collections.singleton(ORIGIN),
            (view, message, origin, mainFrame, reply) -> {
                if (!mainFrame || !ORIGIN.equals(origin.toString()) || !foreground || view.getUrl() == null || !localPage(Uri.parse(view.getUrl()))) return;
                long id = 0;
                try {
                    String raw = message.getData();
                    if (raw == null || raw.length() > DeviceWalletStore.MAX_BYTES * 2) return;
                    JSONObject payload = new JSONObject(raw);
                    id = payload.getLong("id");
                    String action = payload.getString("action"), value = payload.getString("value");
                    if (action.equals("readWalletStore") || action.equals("writeWalletStore")) {
                        walletRequest(action,value,view,reply,id);
                    } else if(action.equals("getDeviceAuthentication")) {
                        if(!value.isEmpty())throw new IllegalArgumentException();
                        authenticationStatus(reply,id);
                    } else if(action.equals("authenticateWalletAction")) {
                        String route=Uri.parse(view.getUrl()).getFragment();
                        if(!(value.equals("reveal")&&"reveal".equals(route)) && !(value.equals("send")&&("send".equals(route)||"sweep".equals(route)||"komodo-sweep".equals(route))))throw new IllegalArgumentException();
                        if(!deviceAuthEnabled)respond(reply,id,true,"");else walletRequest(action,value,view,reply,id);
                    } else if(action.equals("setDeviceAuthentication")) {
                        if(!authenticationChangeAllowed(view,value) || authenticationDialog!=null || walletIOPending || authPrompt)throw new IllegalArgumentException();
                        JSONObject request=new JSONObject(value);
                        if(!(request.get("enabled") instanceof Boolean)||!(request.get("revision") instanceof String)||!deviceAuthentication.available())throw new IllegalArgumentException();
                        boolean enabled=request.getBoolean("enabled");final long requestId=id;
                        authenticationDialog=new AlertDialog.Builder(this).setTitle(enabled?"Use device authentication?":"Turn off device authentication?")
                            .setMessage(enabled?"Keep a separate backup for every wallet. Removing your phone screen lock can make this device's wallet data inaccessible. Your recovery phrases and exported backups will still work.":"Anyone using your unlocked phone could open password-free wallets. Local storage will remain encrypted.")
                            .setPositiveButton(enabled?"Enable":"Turn off",(d,w)->{
                                authenticationDialog=null;
                                if(!foreground||view!=web)return;
                                if(enabled) {
                                    try {new DeviceWalletStore(this).prepareAuthenticationKey();}
                                    catch(Exception e){respond(reply,requestId,false,"Could not prepare device authentication. Your current storage is unchanged.");return;}
                                }
                                walletRequest(action,value,view,reply,requestId);
                            }).setNegativeButton("Cancel",(d,w)->authenticationCancelled(reply,requestId))
                            .setOnCancelListener(d->authenticationCancelled(reply,requestId)).create();
                        authenticationDialog.setOnDismissListener(d->authenticationDialog=null);authenticationDialog.show();
                    } else if (action.equals("copyAddress")) {
                        if (!value.matches("[1-9A-HJ-NP-Za-km-z]{26,50}")) throw new IllegalArgumentException();
                        ((ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("SafeCore receiving address", value));
                        respond(reply, id, true, "");
                    } else if (action.equals("getScreenProtection")) {
                        if(!value.isEmpty())throw new IllegalArgumentException();
                        respondScreenProtection(reply,id);
                    } else if (action.equals("setScreenProtection")) {
                        if(!"security".equals(Uri.parse(view.getUrl()).getFragment()) || screenProtectionDialog!=null
                            || !(value.equals("true")||value.equals("false")))throw new IllegalArgumentException();
                        if(value.equals("true"))saveScreenProtection(true,reply,id);
                        else {
                            final long requestId=id;
                            screenProtectionDialog=new AlertDialog.Builder(this).setTitle("Allow screenshots?")
                                .setMessage("Screenshots and recordings may expose balances or recovery phrases. Keep them private.")
                                .setPositiveButton("Allow",(d,w)->saveScreenProtection(false,reply,requestId))
                                .setNegativeButton("Cancel",(d,w)->respond(reply,requestId,false,"Screenshot setting unchanged."))
                                .setOnCancelListener(d->respond(reply,requestId,false,"Screenshot setting unchanged."))
                                .create();
                            screenProtectionDialog.setOnDismissListener(d->screenProtectionDialog=null);
                            screenProtectionDialog.show();
                        }
                    } else if (action.equals("exportBackup")) {
                        if (exportData != null || value.length() > 65536 || value.isEmpty()) throw new IllegalArgumentException();
                        final long requestId=id;
                        if(deviceAuthEnabled)authenticate("Export wallet backup",()->walletIO.execute(()->{
                            try {new DeviceWalletStore(this).read();}
                            catch(Exception e){runOnUiThread(()->respond(reply,requestId,false,"Wallet storage could not be unlocked."));return;}
                            runOnUiThread(()->{if(foreground&&view==web)beginNativeExport(value,reply,requestId);});
                        }),()->authenticationCancelled(reply,requestId));
                        else beginNativeExport(value,reply,id);
                    } else respond(reply,id,false,"Unsupported Android action.");
                } catch (Exception e) { respond(reply,id,false,"Android action could not be completed."); }
            });
        // Never restore WebView state/bundles that might contain displayed recovery words.
        web.loadUrl(START);
        if(foreground)web.onResume();
        applyScreenProtection();
    }
    private void showUnsupported() {
        TextView notice = new TextView(this);
        notice.setText("Update Android System WebView / Chrome, then reopen SafeCore. This WebView lacks required wallet security features.");
        notice.setTextColor(Color.WHITE); notice.setPadding(24,48,24,24); setContentView(notice);
    }
    private void beginNativeExport(String value,JavaScriptReplyProxy reply,long id) {
        if(exportData!=null){respond(reply,id,false,"A backup export is already open.");return;}
        exportData=value;exportReply=reply;exportId=id;
        new AlertDialog.Builder(this).setTitle("Save wallet backup?")
            .setMessage("This file may contain an unencrypted recovery phrase. Choose a private location; avoid shared or cloud folders.")
            .setPositiveButton("Choose location",(d,w)->{
                try {startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("application/json").putExtra(Intent.EXTRA_TITLE,"safecore-backup.json"),EXPORT);}
                catch(Exception e){finishExport(false,"Could not open the file picker.");}
            }).setNegativeButton("Cancel",(d,w)->finishExport(false,"Backup cancelled."))
            .setOnCancelListener(d->finishExport(false,"Backup cancelled.")).show();
    }
    private void respond(JavaScriptReplyProxy reply, long id, boolean ok, String error) {
        try { reply.postMessage(new JSONObject().put("id",id).put("ok",ok).put("error",error).toString()); }
        catch(Exception ignored) { /* No sensitive payload logging. */ }
    }
    private void finishExport(boolean ok, String error) {
        if(exportReply != null) respond(exportReply, exportId, ok, error);
        exportData = null; exportReply = null; exportId = 0;
        Toast.makeText(this, ok ? "Backup saved. Keep it private." : error, Toast.LENGTH_SHORT).show();
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request,result,data);
        if(request==DeviceAuthentication.REQUEST){deviceAuthentication.result(result);return;}
        if(request == IMPORT && importPending) {
            importPending=false;
            Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
            // Backgrounding intentionally discarded the old input DOM and any seed text.
            // Deliver a bounded, explicitly chosen backup to the new form on resume.
            if(fileCallback!=null)fileCallback.onReceiveValue(null);
            fileCallback = null;
            if(uri != null && "content".equals(uri.getScheme())) {
                try(InputStream in = getContentResolver().openInputStream(uri); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    if(in == null) throw new IllegalStateException();
                    byte[] buffer = new byte[4096]; int n;
                    while((n = in.read(buffer)) != -1) {
                        if(out.size()+n > 65536) throw new IllegalArgumentException();
                        out.write(buffer,0,n);
                    }
                    importedBackup = out.toString("UTF-8");
                } catch(Exception e) { Toast.makeText(this,"Could not read backup (maximum 64 KB).",Toast.LENGTH_LONG).show(); }
            }
        }
        if(request == EXPORT && exportData != null) {
            Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
            if(uri == null || !"content".equals(uri.getScheme())) { finishExport(false,"Backup cancelled."); return; }
            try(OutputStream out = getContentResolver().openOutputStream(uri,"wt")) {
                if(out == null) throw new IllegalStateException();
                out.write(exportData.getBytes(StandardCharsets.UTF_8)); out.flush();
                finishExport(true, "");
            } catch(Exception e) { finishExport(false,"Backup was not saved completely. Retry to a new file."); }
        }
    }
    @Override protected void onPause() {
        foreground = false;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        if(screenProtectionDialog!=null)screenProtectionDialog.cancel();
        if(authenticationDialog!=null)authenticationDialog.cancel();
        // The in-app OS permission sheet must not discard the send form. A real
        // background transition still locks in onStop, even with a sheet open.
        if(web != null) { if(!cameraPrompt&&!authPrompt)web.evaluateJavascript("window.dispatchEvent(new Event('safecore-pause'))",null); web.onPause(); }
        if(deviceAuthEnabled&&!authPrompt&&!cameraPrompt)destroyWalletView();
        super.onPause();
    }
    @Override protected void onStop() {
        denyCamera();
        if(!authPrompt) {
            if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('safecore-pause'))",null);
            if(deviceAuthEnabled)destroyWalletView();
        }
        super.onStop();
    }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results) {
        super.onRequestPermissionsResult(requestCode,permissions,results);
        if(requestCode==CAMERA&&cameraRequest!=null){
            cameraResultReady=true;
            if(foreground){cameraPrompt=false;grantCameraIfActive();}
        }
    }
    @Override protected void onResume() {
        super.onResume(); foreground = true;
        try {
            boolean required=new DeviceWalletStore(this).authenticationRequired();
            if(required!=deviceAuthEnabled){deviceAuthEnabled=required;destroyWalletView();}
        } catch(Exception e){destroyWalletView();showDeviceLock("Wallet storage needs attention. Do not clear app data.");return;}
        deviceAuthentication.resume();
        if(pendingAuthentication!=null){
            Runnable completion=pendingAuthentication;pendingAuthentication=null;
            if(SystemClock.elapsedRealtime()-pendingAuthenticationAt<5000)completion.run();
            else {authPrompt=false;destroyWalletView();}
        }
        if(deviceAuthEnabled&&!sessionAuthenticated&&web==null&&!authPrompt)showDeviceLock("Confirm your fingerprint or phone screen lock to open your wallets.");
        else if(!deviceAuthEnabled&&web==null&&!authPrompt)buildWalletView();
        applyScreenProtection();
        publishSystemTheme();
        if(web != null) { web.onResume(); if(!authPrompt)web.evaluateJavascript("window.dispatchEvent(new Event('safecore-resume'))",null); }
    }
    // WebView's media query can reflect the Activity theme instead of the device.
    // Send only a light/dark value to our bundled page; never reload wallet state.
    private void publishSystemTheme() {
        if(web==null||web.getUrl()==null||!localPage(Uri.parse(web.getUrl())))return;
        boolean dark=(getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES;
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('safecore-theme',{detail:'"+(dark?"dark":"light")+"'}))",null);
    }
    @Override public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        publishSystemTheme();
    }
    @Override protected void onPostResume() {
        super.onPostResume();
        if(cameraResultReady){cameraPrompt=false;grantCameraIfActive();}
        deliverImportedBackup(100);
    }
    private void deliverImportedBackup(int remaining) {
        if(importedBackup==null||web==null||!foreground||remaining<=0)return;
        WebView target=web;
        target.evaluateJavascript("Boolean(document.documentElement.dataset.walletState)",ready->{
            if(target!=web||!foreground||importedBackup==null)return;
            if(!"true".equals(ready)){target.postDelayed(()->deliverImportedBackup(remaining-1),100);return;}
            String raw=importedBackup;importedBackup=null;
            target.evaluateJavascript("window.dispatchEvent(new CustomEvent('safecore-import',{detail:"+JSONObject.quote(raw)+"}))",null);
        });
    }
    @Override public void onBackPressed() {
        if(web==null){moveTaskToBack(true);return;}
        if(web != null) web.evaluateJavascript("location.hash === '#wallet' || !location.hash", value -> {
            if("true".equals(value)) moveTaskToBack(true);
            else web.evaluateJavascript("location.hash='wallet'",null);
        });
    }
    @Override protected void onDestroy() {
        if(deviceAuthentication!=null)deviceAuthentication.cancel();
        walletIO.shutdown(); // Finish an accepted atomic save; never interrupt it halfway.
        if(screenProtectionDialog!=null)screenProtectionDialog.cancel();
        denyCamera();
        if(fileCallback != null) fileCallback.onReceiveValue(null);
        exportData = null; exportReply = null; importedBackup = null;
        if(web != null) { web.stopLoading(); web.destroy(); web = null; }
        super.onDestroy();
    }
}
