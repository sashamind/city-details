// Импортируем функцию serve, которая запускает наш маленький сервер
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Берём пароль из секретов Supabase.
// Если секрет не задан, используем запасной пароль (лучше потом заменить).
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "change-me";

// Запускаем обработчик запросов
serve(async (req: Request) => {
  // Настраиваем CORS, чтобы сайт мог обращаться к этой функции
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Обрабатываем preflight-запрос браузера
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
      status: 200,
    });
  }

  try {
    // Проверяем, что запрос пришёл POST-методом
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, message: "Метод не поддерживается" }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 405,
        }
      );
    }

    // Читаем JSON из запроса
    const body = await req.json();
    const password = body.password;

    // Если пароль совпал — отдаём успех
    if (password === ADMIN_PASSWORD) {
      return new Response(
        JSON.stringify({
          success: true,
          token: "admin_verified",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 200,
        }
      );
    }

    // Если пароль неверный
    return new Response(
      JSON.stringify({
        success: false,
        message: "Неверный пароль",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 401,
      }
    );
  } catch (error) {
    // Если произошла любая ошибка
    return new Response(
      JSON.stringify({
        success: false,
        message: "Ошибка сервера",
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 500,
      }
    );
  }
});