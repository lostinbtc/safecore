package org.pepecoinservice.safecore;

import android.os.Build;
import android.os.SystemClock;
import android.test.ActivityInstrumentationTestCase2;
import android.view.View;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.lang.reflect.Field;

/** Owned emulator QA only; no real wallets, credentials or network submissions. */
public class SplashScreenTest extends ActivityInstrumentationTestCase2<MainActivity> {
    private MainActivity activity;
    private AppSplash splash;
    public SplashScreenTest() { super(MainActivity.class); }
    @Override protected void setUp() throws Exception {
        super.setUp();
        assertTrue(Build.HARDWARE.equals("ranchu") || Build.HARDWARE.equals("goldfish"));
        activity = getActivity();
        assertTrue(activity.getPackageName().endsWith(".qa"));
        Field field = MainActivity.class.getDeclaredField("appSplash");field.setAccessible(true);
        splash = (AppSplash) field.get(activity);
    }
    private boolean showing() {
        boolean[] result = {false};
        getInstrumentation().runOnMainSync(() -> result[0] = splash.isShowing());
        return result[0];
    }
    private void waitUntilHidden() throws Exception {
        long deadline = SystemClock.uptimeMillis() + 6000;
        while (showing() && SystemClock.uptimeMillis() < deadline) Thread.sleep(50);
        assertFalse("Splash must not remain stuck", showing());
    }
    private void flag(String name, Object value) throws Exception {
        Field field = MainActivity.class.getDeclaredField(name);field.setAccessible(true);field.set(activity, value);
    }
    private void background() {
        getInstrumentation().runOnMainSync(() -> {
            getInstrumentation().callActivityOnPause(activity);
            getInstrumentation().callActivityOnStop(activity);
        });
    }
    private void resume() { getInstrumentation().runOnMainSync(() -> getInstrumentation().callActivityOnResume(activity)); }
    public void testColdOpenFullLogoAndRequestedDuration() throws Exception {
        assertEquals(2300L, AppSplash.DURATION_MS);
        assertTrue("Cold opening must show branding", showing());
        getInstrumentation().runOnMainSync(() -> {
            ImageView logo = activity.getWindow().getDecorView().findViewWithTag("safecore-splash-logo");
            assertNotNull(logo);assertEquals(ImageView.ScaleType.FIT_CENTER, logo.getScaleType());
            TextView name = activity.getWindow().getDecorView().findViewWithTag("safecore-splash-name");
            assertNotNull(name);assertEquals(Gravity.CENTER, name.getGravity());
            assertEquals(android.graphics.Color.rgb(87, 186, 255), name.getCurrentTextColor());
            LinearLayout.LayoutParams layout = (LinearLayout.LayoutParams) name.getLayoutParams();
            assertEquals(LinearLayout.LayoutParams.MATCH_PARENT, layout.width);
            assertEquals(Math.round(16 * activity.getResources().getDisplayMetrics().density), layout.topMargin);
            TextView tagline = activity.getWindow().getDecorView().findViewWithTag("safecore-splash-tagline");
            assertNotNull(tagline);assertEquals("Your Keys. Your Coins.", tagline.getText().toString());
            assertEquals(Gravity.CENTER, tagline.getGravity());
            assertEquals(name.getCurrentTextColor(), tagline.getCurrentTextColor());
            assertTrue(tagline.getTextSize()<name.getTextSize());
            assertEquals(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS,
                    activity.findViewById(android.R.id.content).getImportantForAccessibility());
        });
        long started = splash.shownAt();
        Thread.sleep(300);
        if (SystemClock.uptimeMillis() - started < AppSplash.DURATION_MS) assertTrue(showing());
        waitUntilHidden();
        assertTrue(SystemClock.uptimeMillis() - started >= AppSplash.DURATION_MS);
    }
    public void testBackgroundAndReopenRestartsWithoutDelayingProtection() throws Exception {
        background();assertFalse(showing());
        assertTrue((activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0);
        resume();assertTrue(showing());
        long started = splash.shownAt();
        waitUntilHidden();assertTrue(SystemClock.uptimeMillis() - started >= AppSplash.DURATION_MS);
        assertFalse(activity.findViewById(android.R.id.content).getImportantForAccessibility()
                == View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
    }
    public void testSystemFlowReturnsDoNotReplaySplash() throws Exception {
        waitUntilHidden();
        for (String name : new String[]{"importPending", "authPrompt", "cameraPrompt", "exportData"}) {
            flag(name, name.equals("exportData") ? "public-test-export" : true);
            background();
            flag(name, name.equals("exportData") ? null : false);
            resume();assertFalse("No extra splash after " + name, showing());
        }
    }
}
