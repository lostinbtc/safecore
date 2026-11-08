package org.pepecoinservice.safecore;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Device-bound at-rest encryption, NOT a hardware transaction signer.
 * All instances serialize read/CAS/write across Activity recreation. No logs,
 * plaintext files, portable device keys, or silent key replacement on read. */
final class DeviceWalletStore {
    static final class KeyUnavailableException extends java.security.GeneralSecurityException {}
    static final int MAX_BYTES = 2 * 1024 * 1024;
    private static final Object LOCK = new Object();
    private static final byte[] HEADER = "SafeCore-device-wallet-v1\n".getBytes(StandardCharsets.UTF_8);
    private static final byte[] AUTH_HEADER = "SafeCore-device-auth-v1\n".getBytes(StandardCharsets.UTF_8);
    private static final String ACTIVE = "whippet.dev.encrypted.v1", COLLECTION = "corevault.wallets.v1";
    private final AtomicFile file;
    private final String alias;

    DeviceWalletStore(Context context) {
        this(new File(context.getNoBackupFilesDir(), "wallets-v1.enc"), "safecore.wallet-storage.v1");
    }
    // Package-private injection for isolated instrumentation fixtures only.
    DeviceWalletStore(File path, String keyAlias) { file = new AtomicFile(path); alias = keyAlias; }

    private SecretKey key(boolean create, boolean authenticated) throws Exception {
        String keyAlias = alias + (authenticated ? ".auth" : "");
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(keyAlias)) return (SecretKey)store.getKey(keyAlias, null);
        if (!create) throw new KeyUnavailableException();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true);
        if (authenticated) {
            spec.setUserAuthenticationRequired(true).setInvalidatedByBiometricEnrollment(false);
            if (android.os.Build.VERSION.SDK_INT >= 30) spec.setUserAuthenticationParameters(60, KeyProperties.AUTH_BIOMETRIC_STRONG | KeyProperties.AUTH_DEVICE_CREDENTIAL);
            else spec.setUserAuthenticationValidityDurationSeconds(60);
        }
        generator.init(spec.build());
        return generator.generateKey();
    }
    private byte[] encoded() throws Exception {
        if (!file.getBaseFile().exists() && !new File(file.getBaseFile().getPath() + ".bak").exists()) return null;
        byte[] data = file.readFully();
        if (data.length > MAX_BYTES + 128) throw new IllegalArgumentException();
        return data;
    }
    private static byte[] header(byte[] data) {
        for (byte[] prefix : new byte[][]{HEADER, AUTH_HEADER})
            if (data.length >= prefix.length + 28 && Arrays.equals(prefix,Arrays.copyOf(data,prefix.length))) return prefix;
        throw new IllegalArgumentException("Invalid device wallet header");
    }
    boolean authenticationRequired() throws Exception {
        synchronized (LOCK) { byte[] data=encoded(); return data!=null && header(data)==AUTH_HEADER; }
    }
    void prepareAuthenticationKey() throws Exception {
        synchronized (LOCK) {
            if (authenticationRequired()) { key(false,true); return; }
            // Only an UNUSED auth key may be replaced. Never replace the key of an active store.
            KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);keys.deleteEntry(alias+".auth");
            key(true,true);
        }
    }
    private static void validateRecords(JSONObject records) throws Exception {
        if (records.length() != 2 || !records.has(ACTIVE) || !records.has(COLLECTION)) throw new IllegalArgumentException();
        for (String name : new String[]{ACTIVE, COLLECTION}) {
            Object value = records.get(name);
            if (value != JSONObject.NULL && !(value instanceof String)) throw new IllegalArgumentException();
        }
    }
    private JSONObject readLocked() throws Exception {
        byte[] encoded = encoded();
        if (encoded == null) return null;
        byte[] prefix = header(encoded);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(false,prefix==AUTH_HEADER), new GCMParameterSpec(128, encoded, prefix.length, 12));
        cipher.updateAAD(prefix);
        byte[] clear = cipher.doFinal(encoded, prefix.length + 12, encoded.length - prefix.length - 12);
        try {
            JSONObject state = new JSONObject(new String(clear, StandardCharsets.UTF_8));
            if (state.getInt("version") != 1 || !state.getString("revision").matches("[0-9a-f-]{36}")) throw new IllegalArgumentException();
            validateRecords(state.getJSONObject("records"));
            return state;
        } finally { Arrays.fill(clear, (byte)0); }
    }
    JSONObject read() throws Exception { synchronized (LOCK) { return readLocked(); } }

    String write(String expectedRevision, JSONObject records) throws Exception {
        synchronized (LOCK) { return writeLocked(expectedRevision,records,authenticationRequired()); }
    }
    String setAuthentication(String expectedRevision, boolean enabled) throws Exception {
        synchronized (LOCK) {
            JSONObject previous=readLocked();
            if(previous==null)throw new IllegalStateException("No wallet store");
            return writeLocked(expectedRevision,previous.getJSONObject("records"),enabled);
        }
    }
    private String writeLocked(String expectedRevision, JSONObject records, boolean authenticated) throws Exception {
            validateRecords(records);
            JSONObject previous = readLocked(); // A missing/broken key never creates a replacement.
            String current = previous == null ? null : previous.getString("revision");
            if (!java.util.Objects.equals(current, expectedRevision)) throw new IllegalStateException("Wallet storage changed");
            String revision = UUID.randomUUID().toString();
            JSONObject next = new JSONObject().put("version", 1).put("revision", revision).put("records", records);
            byte[] clear = next.toString().getBytes(StandardCharsets.UTF_8);
            if (clear.length > MAX_BYTES) { Arrays.fill(clear, (byte)0); throw new IllegalArgumentException(); }
            byte[] encoded;
            try {
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                byte[] prefix = authenticated ? AUTH_HEADER : HEADER;
                cipher.init(Cipher.ENCRYPT_MODE, key(previous == null && !authenticated,authenticated));
                cipher.updateAAD(prefix);
                byte[] encrypted = cipher.doFinal(clear), iv = cipher.getIV();
                if (iv.length != 12) throw new IllegalStateException();
                encoded = ByteBuffer.allocate(prefix.length + iv.length + encrypted.length).put(prefix).put(iv).put(encrypted).array();
            } finally { Arrays.fill(clear, (byte)0); }
            FileOutputStream out = null;
            try {
                out = file.startWrite(); out.write(encoded); out.getFD().sync();
                file.finishWrite(out); out = null;
            } catch (Exception e) { if (out != null) file.failWrite(out); throw e; }
            JSONObject verified = readLocked();
            if (verified == null || !revision.equals(verified.getString("revision"))
                || !records.toString().equals(verified.getJSONObject("records").toString())) throw new IllegalStateException("Wallet write verification failed");
            return revision;
    }
}
