// File: functions/api/history.js

export async function onRequest(context) {
    // Mengambil kredensial dari Environment Variables Cloudflare (Aman & Tersembunyi)
    const API_KEY = context.env.GOOGLE_API_KEY;
    const SHEET_ID = context.env.GOOGLE_SHEET_ID;
    const SHEET_NAME = 'HISTORY_JUARA';

    // Membentuk URL tujuan
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}?key=${API_KEY}`;

    try {
        // Melakukan fetch dari server Cloudflare ke server Google
        const response = await fetch(url);
        const data = await response.json();

        // Mengembalikan hasil ke browser pengguna dengan header yang sesuai
        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 's-maxage=60' // (Opsional) Cache hasil selama 60 detik di Cloudflare Edge
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
    }
}