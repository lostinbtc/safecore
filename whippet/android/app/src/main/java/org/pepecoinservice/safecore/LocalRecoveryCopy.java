package org.pepecoinservice.safecore;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** User-selected local documents only. Never persists a password or device key. */
final class LocalRecoveryCopy {
    static final String PREFS="local_recovery_copy", LAST_URI="last_document";
    static final Uri DEFAULT_LOCATION=DocumentsContract.buildDocumentUri("com.android.externalstorage.documents","primary:Documents");
    static void validate(String data) throws Exception {
        if(data==null||data.length()>65536)throw new IllegalArgumentException();
        JSONObject v=new JSONObject(data);
        if(v.length()!=7||!"pepecoin-whippet-encrypted-v1".equals(v.getString("format"))
            ||!"PBKDF2-SHA256".equals(v.getString("kdf"))||v.getInt("iterations")!=600000
            ||!"AES-256-GCM".equals(v.getString("cipher"))
            ||!v.getString("salt").matches("[0-9a-f]{32}")||!v.getString("iv").matches("[0-9a-f]{24}")
            ||!v.getString("data").matches("(?:[0-9a-f]{2}){16,16384}"))throw new IllegalArgumentException();
    }
    static boolean localDocument(Uri uri) {
        if(uri==null||!"content".equals(uri.getScheme())||uri.getQuery()!=null||uri.getFragment()!=null)return false;
        String authority=uri.getAuthority();
        if(!"com.android.externalstorage.documents".equals(authority)
            &&!"com.android.providers.downloads.documents".equals(authority))return false;
        try {
            String id=DocumentsContract.getDocumentId(uri);
            if(id.isEmpty())return false;
            String lower=id.toLowerCase(java.util.Locale.ROOT);
            // App-specific folders are deleted on uninstall even on older Android.
            return !lower.contains("android/data")&&!lower.contains("android/obb")&&!lower.contains("android/media")&&!lower.contains("..");
        } catch(Exception e) {return false;}
    }
    static Intent picker(Context context) {
        String remembered=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getString(LAST_URI,"");
        Uri initial=Uri.parse(remembered);
        if(!localDocument(initial))initial=DEFAULT_LOCATION;
        return new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
            .setType("application/json").putExtra(Intent.EXTRA_LOCAL_ONLY,true)
            .putExtra(Intent.EXTRA_TITLE,"safecore-recovery-"+System.currentTimeMillis()+".json")
            .putExtra(DocumentsContract.EXTRA_INITIAL_URI,initial);
    }
    static void save(Context context,Uri uri,String data) throws Exception {
        validate(data);
        if(!localDocument(uri))throw new IllegalArgumentException("Choose a local device folder.");
        byte[] expected=data.getBytes(StandardCharsets.UTF_8);
        try(OutputStream out=context.getContentResolver().openOutputStream(uri,"wt")){
            if(out==null)throw new IllegalStateException();
            out.write(expected);out.flush();
        }
        // A completed picker/write is not enough: verify the saved encrypted bytes.
        try(InputStream in=context.getContentResolver().openInputStream(uri);ByteArrayOutputStream out=new ByteArrayOutputStream()){
            if(in==null)throw new IllegalStateException();
            byte[] buffer=new byte[4096];int n;
            while((n=in.read(buffer))!=-1){if(out.size()+n>65536)throw new IllegalStateException();out.write(buffer,0,n);}
            if(!Arrays.equals(expected,out.toByteArray()))throw new IllegalStateException();
        }
        // This URI is a picker hint, not automatic access or a backup credential.
        context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString(LAST_URI,uri.toString()).apply();
    }
}
