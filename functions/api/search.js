// File: functions/api/search.js

export async function onRequest(context) {
    // 1. Mengambil kredensial rahasia dari Environment Variables
    const CLIENT_EMAIL = context.env.G_CLIENT_EMAIL;
    let PRIVATE_KEY = context.env.G_PRIVATE_KEY;
    const SHEET_ID = context.env.GOOGLE_SHEET_ID;

    // 2. Tangkap parameter '?sheet=' dari URL (Dari Frontend)
    const { searchParams } = new URL(context.request.url);
    const sheetName = searchParams.get('sheet');

    // Validasi Parameter
    if (!sheetName) {
        return new Response(JSON.stringify({ error: "Parameter nama sheet tidak ditemukan." }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // PEMBERSIHAN KUNCI: Memastikan format Private Key tereksekusi dengan benar
    if (PRIVATE_KEY) {
        PRIVATE_KEY = PRIVATE_KEY.replace(/\\n/g, '\n').replace(/^"|"$/g, '');
    }

    try {
        // 3. Meminta token autentikasi (Service Account)
        const accessToken = await getGoogleAccessToken(CLIENT_EMAIL, PRIVATE_KEY);

        // 4. Bangun URL Asli ke Google Sheets
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}`;

        // 5. Minta data ke Google secara tertutup
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        // Tangkap error spesifik dari Google (misal: Sheet tidak ditemukan)
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(`Google API Error: ${JSON.stringify(errData)}`);
        }

        const data = await response.json();

        // 6. Kembalikan data ke Browser (Client)
        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache' // Fitur Search tidak boleh di-cache
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

/*
==========================================
MESIN KRIPTOGRAFI JWT (SERVICE ACCOUNT)
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

    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    if (!key.includes(pemHeader)) throw new Error("Format Private Key salah.");
    
    const pemContents = key.substring(key.indexOf(pemHeader) + pemHeader.length, key.indexOf(pemFooter)).replace(/\s/g, '');
    const binaryDerString = atob(pemContents);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
        binaryDer[i] = binaryDerString.charCodeAt(i);
    }

    const signatureKey = await crypto.subtle.importKey(
        "pkcs8",
        binaryDer.buffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        signatureKey,
        new TextEncoder().encode(unsignedJwt)
    );

    const signedJwt = `${unsignedJwt}.${base64UrlEncodeBuffer(signature)}`;

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

function base64UrlEncode(str) {
    return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

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