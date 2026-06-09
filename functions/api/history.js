// File: functions/api/history.js

export async function onRequest(context) {
    const CLIENT_EMAIL = context.env.G_CLIENT_EMAIL;
    let PRIVATE_KEY = context.env.G_PRIVATE_KEY;
    const SHEET_ID = context.env.GOOGLE_SHEET_ID;
    const SHEET_NAME = 'HISTORY_JUARA';

    // PEMBERSIHAN KUNCI: Memastikan format newline (\n) tereksekusi dengan benar
    // dan menghapus tanda kutip jika terbawa dari Dashboard Cloudflare
    if (PRIVATE_KEY) {
        PRIVATE_KEY = PRIVATE_KEY.replace(/\\n/g, '\n').replace(/^"|"$/g, '');
    }

    try {
        // 1. Meminta token sementara (Berlaku 1 jam)
        const accessToken = await getGoogleAccessToken(CLIENT_EMAIL, PRIVATE_KEY);

        // 2. Mengambil data dari Sheet menggunakan Token tersebut
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        // Tangkap error jika Sheet ID salah atau Google API menolak
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(`Google API Error: ${JSON.stringify(errData)}`);
        }

        const data = await response.json();
        return new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json' }
        });
        
    } catch (error) {
        // Tampilkan error 500 ke Frontend agar mudah dilacak
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}

/*
==========================================
MESIN KRIPTOGRAFI JWT (BASE64URL FIX)
==========================================
*/

async function getGoogleAccessToken(email, key) {
    const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;
    const payloadObj = {
        iss: email,
        scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
        aud: "https://oauth2.googleapis.com/token",
        exp: exp,
        iat: iat
    };
    const payload = base64UrlEncode(JSON.stringify(payloadObj));
    const unsignedJwt = `${header}.${payload}`;

    // Ekstraksi isi kunci murni (Membuang Header & Footer PEM)
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    if (!key.includes(pemHeader)) throw new Error("Format Private Key salah. Pastikan mencakup -----BEGIN PRIVATE KEY-----");
    
    const pemContents = key.substring(key.indexOf(pemHeader) + pemHeader.length, key.indexOf(pemFooter)).replace(/\s/g, '');
    const binaryDerString = atob(pemContents);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
        binaryDer[i] = binaryDerString.charCodeAt(i);
    }

    // Mengimpor kunci ke Web Crypto API Cloudflare
    const signatureKey = await crypto.subtle.importKey(
        "pkcs8",
        binaryDer.buffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
    );

    // Menandatangani (Sign) JWT
    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        signatureKey,
        new TextEncoder().encode(unsignedJwt)
    );

    const signedJwt = `${unsignedJwt}.${base64UrlEncodeBuffer(signature)}`;

    // Meminta Access Token ke Google
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedJwt}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    const tokenData = await res.json();
    if (!tokenData.access_token) {
        throw new Error(`Gagal mendapatkan token: ${JSON.stringify(tokenData)}`);
    }
    
    return tokenData.access_token;
}

// Fungsi Helper 1: Ubah String ke Base64URL
function base64UrlEncode(str) {
    return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// Fungsi Helper 2: Ubah ArrayBuffer (Hasil Kriptografi) ke Base64URL
function base64UrlEncodeBuffer(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}