package org.pepecoinservice.safecore;

import android.app.Activity;
import android.graphics.Color;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Presentation only. Never authenticates, reads storage or changes wallet state. */
final class AppSplash {
    static final long DURATION_MS = 2300;
    private final Activity activity;
    private LinearLayout panel;
    private View content;
    private int previousAccessibility;
    private long shownAt;
    private final Runnable finish = this::dismiss;

    AppSplash(Activity activity) { this.activity = activity; }
    boolean isShowing() { return panel != null; }
    long shownAt() { return shownAt; }

    void show() {
        dismiss();
        float density = activity.getResources().getDisplayMetrics().density;
        panel = new LinearLayout(activity);
        panel.setTag("safecore-splash");
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setBackgroundColor(Color.rgb(11, 16, 24));
        panel.setClickable(true);
        panel.setFocusableInTouchMode(true);
        panel.setElevation(100 * density);
        ImageView logo = new ImageView(activity);
        logo.setTag("safecore-splash-logo");
        logo.setImageResource(R.drawable.safecore_logo);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        logo.setContentDescription("SafeCore logo");
        int size = (int) (Math.min(192, activity.getResources().getConfiguration().screenWidthDp * .55f) * density);
        panel.addView(logo, new LinearLayout.LayoutParams(size, size));
        TextView name = new TextView(activity);
        name.setTag("safecore-splash-name");
        name.setText("SafeCore");
        android.util.TypedValue accent = new android.util.TypedValue();
        activity.getTheme().resolveAttribute(android.R.attr.colorAccent, accent, true);
        name.setTextColor(accent.data);
        name.setTextSize(28);
        name.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams nameLayout = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        nameLayout.topMargin = Math.round(16 * density);
        panel.addView(name, nameLayout);
        TextView tagline = new TextView(activity);
        tagline.setTag("safecore-splash-tagline");
        tagline.setText("Your Keys. Your Coins.");
        tagline.setTextColor(accent.data);
        tagline.setTextSize(14);
        tagline.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams taglineLayout = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        taglineLayout.topMargin = Math.round(6 * density);
        panel.addView(tagline, taglineLayout);
        // Keep the overlay outside android.R.id.content: replacing a lock panel
        // or WebView must not remove it, and hidden content must not be accessible.
        content = activity.findViewById(android.R.id.content);
        if (content != null) {
            previousAccessibility = content.getImportantForAccessibility();
            content.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        }
        ((ViewGroup) activity.getWindow().getDecorView()).addView(panel,
                new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        panel.requestFocus();
        shownAt = SystemClock.uptimeMillis();
        panel.postDelayed(finish, DURATION_MS);
    }

    void dismiss() {
        if (panel == null) return;
        panel.removeCallbacks(finish);
        if (panel.getParent() instanceof ViewGroup) ((ViewGroup) panel.getParent()).removeView(panel);
        panel = null;
        if (content != null) content.setImportantForAccessibility(previousAccessibility);
        content = null;
    }
}
