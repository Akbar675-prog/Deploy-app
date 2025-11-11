// app/api/telegram.js
import { GITHUB_TOKEN, VERCEL_TOKEN } from './api_token.js';
import { Octokit } from "https://cdn.skypack.dev/@octokit/rest";
import AdmZip from "https://cdn.skypack.dev/adm-zip";

const TELEGRAM_BOT_TOKEN = "8312193404:AAFK7CV-xHfNsWw8ANeSR8wQZdLiSvp9GVc";
const TELEGRAM_CHAT_ID = "7706220321";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const websiteName = formData.get('websiteName');
    const file = formData.get('file');
    const userAgent = formData.get('userAgent');

    if (!websiteName || !file) {
      return new Response(JSON.stringify({ error: "Lengkapi semua field" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const zip = new AdmZip(Buffer.from(arrayBuffer));
    const entries = zip.getEntries();

    const octokit = new Octokit({ auth: GITHUB_TOKEN });

    // Buat repo
    let repo;
    try {
      const res = await octokit.repos.create({ name: websiteName, auto_init: false, private: false });
      repo = res.data;
    } catch (err) {
      if (err.status === 422) {
        const res = await octokit.repos.get({ owner: (await octokit.users.getAuthenticated()).data.login, repo: websiteName });
        repo = res.data;
      } else throw err;
    }

    // Upload file
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const path = entry.entryName;
      const content = entry.getData();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(content)));

      await octokit.repos.createOrUpdateFileContents({
        owner: repo.owner.login,
        repo: websiteName,
        path,
        message: `Deploy: ${path}`,
        content: base64
      });
    }

    // Deploy ke Vercel
    const vercelRes = await fetch('https://api.vercel.com/v1/projects', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: websiteName,
        gitRepository: { type: 'github', repo: `${repo.owner.login}/${websiteName}` }
      })
    });

    let vercelUrl = `https://${websiteName}.vercel.app`;
    if (!vercelRes.ok && (await vercelRes.json()).error?.code !== 'project_exists') {
      throw new Error('Gagal deploy ke Vercel');
    }

    // Kirim ke Telegram
    const message = `
*Permintaan Pembuatan Website Baru*

*Nama Website:* \`${websiteName}\`
*Nama File:* \`${file.name}\`
*Ukuran File:* \`${(file.size / 1024).toFixed(2)} KB\`
*Website URL:* ${vercelUrl}
*Waktu:* \`${new Date().toLocaleString('id-ID')}\`
*User Agent:* \`${userAgent}\`

Website dibuat melalui *Publish Swamp Platform*.
    `.trim();

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    return new Response(JSON.stringify({ url: vercelUrl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
