package org.pepecoinservice.safecore;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.CancellationSignal;
import java.util.function.Consumer;

/** OS-owned authentication. Never collect, store or compare a phone PIN in the app. */
final class DeviceAuthentication {
    static final int REQUEST = 14;
    private final Activity activity;
    private Consumer<Boolean> callback;
    private CancellationSignal signal;
    private Boolean credentialResult;
    private long generation;
    boolean credentialPrompt;
    DeviceAuthentication(Activity activity) { this.activity=activity; }
    boolean available() { return ((KeyguardManager)activity.getSystemService(Activity.KEYGUARD_SERVICE)).isDeviceSecure(); }
    boolean pending() { return callback!=null; }
    void authenticate(String title, Consumer<Boolean> completion) {
        if(pending() || !available()){completion.accept(false);return;}
        callback=completion;
        final long request=++generation;
        try {
            if(Build.VERSION.SDK_INT>=30) {
                signal=new CancellationSignal();
                new BiometricPrompt.Builder(activity).setTitle(title)
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL)
                    .build().authenticate(signal,activity.getMainExecutor(),new BiometricPrompt.AuthenticationCallback(){
                        @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result){if(request==generation)finish(true);}
                        @Override public void onAuthenticationError(int code,CharSequence message){if(request==generation)finish(false);}
                    });
            } else {
                Intent intent=((KeyguardManager)activity.getSystemService(Activity.KEYGUARD_SERVICE))
                    .createConfirmDeviceCredentialIntent(title,"Confirm your phone screen lock to continue.");
                if(intent==null){finish(false);return;}
                credentialPrompt=true;
                activity.startActivityForResult(intent,REQUEST);
            }
        } catch(Exception e){finish(false);}
    }
    void result(int result) { if(credentialPrompt&&pending())credentialResult=result==Activity.RESULT_OK; }
    void resume() { if(credentialResult!=null){boolean success=credentialResult;credentialResult=null;finish(success);} }
    void cancel() {
        if(signal!=null)signal.cancel();
        finish(false);
    }
    private void finish(boolean success) {
        generation++;
        Consumer<Boolean> completion=callback;callback=null;signal=null;credentialPrompt=false;
        if(completion!=null)completion.accept(success);
    }
}
