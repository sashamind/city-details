// Вход в админку: проверяем пароль и выдаём подписанный токен сессии.
// Сам токен ничего не открывает — им пользуется функция admin-action.

import { json, preflight } from "../_shared/cors.ts";
import { createToken, isConfigured, safeEqual } from "../_shared/auth.ts";

const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "";
const TOKEN_TTL_SECONDS = 8 * 60 * 60;

// Простой троттлинг попыток по IP: пароль один на всех, перебор недопустим.
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) return false;
  return rec.count >= MAX_ATTEMPTS;
}

function registerFailure(ip: string): void {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else rec.count++;

  // не даём мапе расти бесконечно
  if (attempts.size > 1000) {
    for (const [key, value] of attempts) {
      if (now > value.resetAt) attempts.delete(key);
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ success: false, message: "Метод не поддерживается" }, 405);

  if (!ADMIN_PASSWORD || !isConfigured()) {
    console.error("ADMIN_PASSWORD не задан в секретах проекта");
    return json({ success: false, message: "Админка не настроена на сервере" }, 500);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (tooManyAttempts(ip)) {
    return json({ success: false, message: "Слишком много попыток. Подождите 10 минут." }, 429);
  }

  try {
    const body = await req.json();
    const password = typeof body?.password === "string" ? body.password : "";

    if (!safeEqual(password, ADMIN_PASSWORD)) {
      registerFailure(ip);
      return json({ success: false, message: "Неверный пароль" }, 401);
    }

    return json({
      success: true,
      token: await createToken(TOKEN_TTL_SECONDS),
      expiresIn: TOKEN_TTL_SECONDS,
    });
  } catch (error) {
    console.error("admin-login error:", error);
    return json({ success: false, message: "Ошибка сервера" }, 500);
  }
});
