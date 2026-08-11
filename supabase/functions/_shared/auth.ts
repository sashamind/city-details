// Сессия администратора: короткоживущий токен, подписанный HMAC-SHA256.
//
// Раньше admin-login отдавал строку "admin_verified", и её никто не проверял —
// админом можно было стать, просто выставив переменную в браузере. Теперь логин
// выдаёт подписанный токен с временем жизни, а admin-action проверяет подпись
// перед любой операцией с базой.

const encoder = new TextEncoder();

// Секрет для подписи. Отдельный ADMIN_TOKEN_SECRET предпочтительнее, но если его
// не задали — подписываем самим паролем администратора.
function secret(): string {
  return Deno.env.get("ADMIN_TOKEN_SECRET") || Deno.env.get("ADMIN_PASSWORD") || "";
}

export function isConfigured(): boolean {
  return secret().length > 0;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): string {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return b64urlEncode(new Uint8Array(sig));
}

// Сравнение за постоянное время: не даём подбирать подпись по времени ответа.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createToken(ttlSeconds = 8 * 60 * 60): Promise<string> {
  const payload = b64urlEncode(
    encoder.encode(JSON.stringify({ exp: Date.now() + ttlSeconds * 1000 })),
  );
  return payload + "." + (await sign(payload));
}

export async function verifyToken(token: unknown): Promise<boolean> {
  if (!isConfigured()) return false;
  if (typeof token !== "string" || token.length > 512) return false;

  const dot = token.indexOf(".");
  if (dot <= 0) return false;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, await sign(payload))) return false;

  try {
    const data = JSON.parse(b64urlDecode(payload));
    return typeof data.exp === "number" && Date.now() < data.exp;
  } catch {
    return false;
  }
}
