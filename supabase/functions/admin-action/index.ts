// Все действия администратора: чтение очереди модерации, одобрение, удаление,
// порядок фото, создание записей от имени админа.
//
// Зачем функция: с анонимного ключа запись и модерация в базе закрыты политиками
// RLS. Здесь запросы идут под service-role ключом, но только после проверки
// подписанного токена из admin-login.

import { json, preflight } from "../_shared/cors.ts";
import { verifyToken } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PHOTO_BUCKET = "photos";

type Row = Record<string, unknown>;

async function db(path: string, init: RequestInit & { prefer?: string } = {}): Promise<unknown> {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: init.method || "GET",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      Prefer: init.prefer || "return=representation",
    },
    body: init.body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("db " + res.status + ": " + text.slice(0, 300));
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Из публичного URL достаём имя файла в бакете, чтобы удалить его вместе с записью.
function storageObjectName(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const marker = "/storage/v1/object/public/" + PHOTO_BUCKET + "/";
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const name = url.slice(i + marker.length).split("?")[0];
  return name ? decodeURIComponent(name) : null;
}

async function removeStorageFile(url: unknown): Promise<void> {
  const name = storageObjectName(url);
  if (!name) return;

  try {
    await fetch(
      SUPABASE_URL + "/storage/v1/object/" + PHOTO_BUCKET + "/" + encodeURIComponent(name),
      {
        method: "DELETE",
        headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY },
      },
    );
  } catch (e) {
    // файл мог быть удалён раньше — запись из базы всё равно убираем
    console.warn("storage delete failed:", e);
  }
}

function id(payload: Row): string {
  const value = payload.id;
  if (typeof value !== "string" || !value) throw new Error("Не передан id");
  return encodeURIComponent(value);
}

const actions: Record<string, (payload: Row) => Promise<unknown>> = {
  // --- чтение ---

  async list_details() {
    return await db("details?select=*&order=created_at.desc");
  },

  async list_pending() {
    const [notes, photos] = await Promise.all([
      db("notes?status=eq.pending&order=created_at.asc"),
      db("photos?status=eq.pending&order=created_at.asc"),
    ]);
    return { notes, photos };
  },

  async list_notes(payload) {
    return await db(
      "notes?detail_id=eq." + encodeURIComponent(String(payload.detail_id)) + "&order=created_at.asc",
    );
  },

  async list_photos(payload) {
    return await db(
      "photos?detail_id=eq." + encodeURIComponent(String(payload.detail_id)) +
        "&order=sort_order.asc,created_at.asc",
    );
  },

  // --- точки ---

  async create_detail(payload) {
    const row = payload.row as Row;
    return await db("details", { method: "POST", body: JSON.stringify({ ...row, status: "approved" }) });
  },

  async approve_detail(payload) {
    return await db("details?id=eq." + id(payload), {
      method: "PATCH",
      body: JSON.stringify({ status: "approved" }),
    });
  },

  // Удаляем точку вместе с её описаниями, фотографиями и файлами в хранилище,
  // иначе в базе остаются висячие записи, а в бакете — файлы навсегда.
  async delete_detail(payload) {
    const key = id(payload);

    const details = (await db("details?select=photo_url&id=eq." + key)) as Row[] | null;
    const photos = (await db("photos?select=id,photo_url&detail_id=eq." + key)) as Row[] | null;

    await db("notes?detail_id=eq." + key, { method: "DELETE", prefer: "return=minimal" });
    await db("photos?detail_id=eq." + key, { method: "DELETE", prefer: "return=minimal" });
    await db("details?id=eq." + key, { method: "DELETE", prefer: "return=minimal" });

    for (const p of photos || []) await removeStorageFile(p.photo_url);
    for (const d of details || []) await removeStorageFile(d.photo_url);

    return { ok: true };
  },

  // --- описания ---

  async create_note(payload) {
    const row = payload.row as Row;
    return await db("notes", { method: "POST", body: JSON.stringify({ ...row, status: "approved" }) });
  },

  async approve_note(payload) {
    return await db("notes?id=eq." + id(payload), {
      method: "PATCH",
      body: JSON.stringify({ status: "approved" }),
    });
  },

  async delete_note(payload) {
    await db("notes?id=eq." + id(payload), { method: "DELETE", prefer: "return=minimal" });
    return { ok: true };
  },

  // --- фото ---

  async create_photo(payload) {
    const row = payload.row as Row;
    return await db("photos", { method: "POST", body: JSON.stringify({ ...row, status: "approved" }) });
  },

  async approve_photo(payload) {
    return await db("photos?id=eq." + id(payload), {
      method: "PATCH",
      body: JSON.stringify({ status: "approved" }),
    });
  },

  async delete_photo(payload) {
    const key = id(payload);
    const rows = (await db("photos?select=photo_url&id=eq." + key)) as Row[] | null;
    await db("photos?id=eq." + key, { method: "DELETE", prefer: "return=minimal" });
    for (const p of rows || []) await removeStorageFile(p.photo_url);
    return { ok: true };
  },

  async reorder_photos(payload) {
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length > 200) throw new Error("Слишком много записей");

    for (const item of items as Row[]) {
      await db("photos?id=eq." + encodeURIComponent(String(item.id)), {
        method: "PATCH",
        body: JSON.stringify({ sort_order: Number(item.sort_order) || 0 }),
        prefer: "return=minimal",
      });
    }
    return { ok: true };
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ success: false, message: "Метод не поддерживается" }, 405);

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Нет SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    return json({ success: false, message: "Функция не настроена" }, 500);
  }

  let body: Row;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: "Некорректный запрос" }, 400);
  }

  if (!(await verifyToken(body.token))) {
    return json({ success: false, message: "Сессия администратора истекла" }, 401);
  }

  const handler = actions[String(body.action)];
  if (!handler) return json({ success: false, message: "Неизвестное действие" }, 400);

  try {
    const data = await handler((body.payload as Row) || {});
    return json({ success: true, data });
  } catch (error) {
    console.error("admin-action " + body.action + " failed:", error);
    return json({ success: false, message: "Не удалось выполнить действие" }, 500);
  }
});
