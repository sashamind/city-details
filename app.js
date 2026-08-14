// ================================
// Константы и глобальные переменные
// ================================

var SUPABASE_URL = 'https://yzvigrtnwmkwkpmqmdzh.supabase.co';
var SUPABASE_KEY = 'sb_publishable__AIRJSDqAYUK_vxwYhXmRA_4-QzSKkR'; // поменяй на актуальный, если нужно
var ADMIN_LOGIN_FUNCTION_URL = SUPABASE_URL + '/functions/v1/admin-login';
var ADMIN_ACTION_FUNCTION_URL = SUPABASE_URL + '/functions/v1/admin-action';
var ADMIN_TOKEN_KEY = 'textula_admin_token';

// Публичный ключ ниже даёт право только читать одобренное и присылать записи на
// модерацию — это ограничено политиками RLS. Всё, что меняет или удаляет данные,
// идёт через функцию admin-action с токеном сессии администратора.
var isAdmin = false;
var adminToken = null;

var MAP_CENTER = [54.1935, 37.6180];
var MAP_ZOOM = 15;

var CATEGORIES = {
  texture: { label: 'Текстура', color: '#000' },
  sign: { label: 'Знак', color: '#000' },
  art: { label: 'Арт', color: '#000' },
  detail: { label: 'Деталь', color: '#000' },
  other: { label: 'Другое', color: '#000' }
};

var details = [], markerObjects = [], activeFilter = 'all';

var isAddingMode = false, pendingCoords = null, tempMarker = null, currentDetailId = null, map;
var userMarker = null, mouseLatLng = null, proximityRAF = null, clusterGroup = null;

var gallery = [], galleryIndex = 0, previewTimeout = null;
var isTouchDevice = ('ontouchstart' in window);

var searchQuery = '', connectLine = null, lastSearchMatches = [];
var currentNotes = [], pendingNotes = [];

// Фото-слайдер: обложка детали (details.photo_url) — самое старое фото,
// плюс дополнительные из таблицы photos. currentPhotos — фото открытой точки,
// pendingPhotos — все фото на модерации (для бейджа и панели модерации).
var currentDetail = null, currentPhotos = [], pendingPhotos = [];
var photoSlides = [], photoIndex = 0;

var EMAILJS_PUBLIC_KEY = 'Vvny9RUBFyNXNw6nn';
var EMAILJS_SERVICE_ID = 'service_textula';
var EMAILJS_TEMPLATE_ID = 'template_0d0q9ed';

// ================================
// Игровой режим “Угадай локацию”
// ================================

var guessModeActive = false;
var guessPoints = [];
var guessCurrentIndex = 0;
var guessTotalRounds = 10;
var GUESS_MAX_DISTANCE_M = 50000; // дальше от центра города точки в игру не берём

// Шкала очков за раунд. Ступеней много и они частые вблизи цели: попасть в дом
// и попасть в район — разный результат, и это должно быть видно по счёту.
// Первая строка задаёт максимум за раунд, из неё же считается идеальная игра.
var GUESS_SCORE_STEPS = [
  { maxDistance: 5, points: 150, label: 'Точно в цель!' },
  { maxDistance: 20, points: 130, label: 'Почти в точку' },
  { maxDistance: 50, points: 115, label: 'Очень близко' },
  { maxDistance: 100, points: 100, label: 'Тот же дом' },
  { maxDistance: 200, points: 85, label: 'Соседний двор' },
  { maxDistance: 350, points: 70, label: 'Пара минут пешком' },
  { maxDistance: 600, points: 55, label: 'Тот же квартал' },
  { maxDistance: 1000, points: 40, label: 'Район угадан' },
  { maxDistance: 2000, points: 25, label: 'Мимо, но в городе' },
  { maxDistance: 4000, points: 15, label: 'Совсем другой район' },
  { maxDistance: Infinity, points: 5, label: 'Далеко' }
];

var GUESS_ROUND_SECONDS = 60;

// Премия за скорость. Только вверх: штрафа за медленный ответ нет, иначе игра
// превращается в гонку, а разглядывать фотографию — это половина удовольствия.
var GUESS_SPEED_BONUSES = [
  { maxSeconds: 10, multiplier: 1.2, label: 'молниеносно' },
  { maxSeconds: 20, multiplier: 1.1, label: 'быстро' },
  { maxSeconds: 35, multiplier: 1.05, label: 'бодро' },
  { maxSeconds: Infinity, multiplier: 1, label: '' }
];

// Фраза по итогам игры — по доле от максимума.
var GUESS_ENDINGS = [
  { minShare: 0.95, text: 'Вы либо выросли в этих дворах, либо подсматривали в геолокацию.' },
  { minShare: 0.85, text: 'Навигатор нервно сворачивается.' },
  { minShare: 0.70, text: 'Уверенный горожанин: пара промахов не в счёт.' },
  { minShare: 0.55, text: 'Дорогу до дома найдёте. За дом — уже спорно.' },
  { minShare: 0.40, text: 'Где-то в Туле — и то хлеб.' },
  { minShare: 0.25, text: 'Кажется, вы гуляли по соседнему городу.' },
  { minShare: 0, text: 'Тыкать пальцем в карту тоже надо уметь. У вас получилось.' }
];
var guessScore = 0;
var guessMarkers = [];
var guessCorrectMarker = null;
var guessTimer = null;
var guessTimeLeft = GUESS_ROUND_SECONDS;

var guessBtn = null;
var guessPanel = null;
var guessImage = null;
var guessCurrentEl = null;
var guessScoreEl = null;
var guessNextBtn = null;
var guessExitBtn = null;
var guessResult = null;
var guessTimerEl = null;

// ================================
// Вспомогательные функции
// ================================

function escapeHtml(str) {
  str = String(str || '');
  return str.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

var toastTimeout = null;

function showToast(message, type) {
  var el = document.getElementById('app-toast');

  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    el.style.cssText = 'position:fixed;left:50%;bottom:30px;transform:translateX(-50%);' +
      'max-width:90vw;padding:12px 20px;background:#000;color:#fff;' +
      "font-family:'IBM Plex Mono', monospace;font-size:12px;letter-spacing:0.03em;" +
      'z-index:10000;opacity:0;transition:opacity 0.25s ease;pointer-events:none;text-align:center;';
    document.body.appendChild(el);
  }

  el.textContent = message;
  el.style.background = type === 'error' ? '#b00020' : '#000';
  el.style.opacity = '1';

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(function () { el.style.opacity = '0'; }, 3500);
}

// Маленькие картинки берут превью и откатываются на оригинал, если превью ещё
// нет (старые записи или неудачная генерация).
function previewSrc(item) {
  if (!item) return '';
  return (item.thumb && item.thumb.trim()) || (item.photo && item.photo.trim()) || '';
}

function createMarkerIcon(detail) {
  const photo = previewSrc(detail);
  const hasPhoto = photo !== '';

  if (hasPhoto) {
    const imgHtml = `<img src="${escapeHtml(photo)}" alt="" loading="lazy" style="width:20px; height:20px; border-radius:4px;" />`;
    return L.divIcon({
      html: `<div class="dot-marker${detail.status === 'pending' ? ' pending' : ''}" style="display:flex; align-items:center; gap:4px; cursor:pointer;">
        <div class="dot" style="width:20px; height:20px; overflow:hidden;">${imgHtml}</div>
        <div class="label" style="font-size:10px;">${escapeHtml(detail.title.length > 18 ? detail.title.substring(0, 18) + '…' : detail.title)}</div>
      </div>`,
      className: '',
      iconSize: [150, 20],
      iconAnchor: [10, 10]
    });
  } else {
    const title = detail.title.length > 18 ? detail.title.substring(0, 18) + '…' : detail.title;
    return L.divIcon({
      html: `<div class="dot-marker${detail.status === 'pending' ? ' pending' : ''}">
        <div class="dot"></div>
        <div class="label">${escapeHtml(title)}</div>
      </div>`,
      className: '',
      iconSize: [150, 20],
      iconAnchor: [4, 10]
    });
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  var months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function isReservedName(name) {
  var blocked = ['админ', 'администратор', 'admin', 'administrator', 'модератор', 'moderator', 'сашь'];
  var lower = String(name || '').toLowerCase().trim();

  for (var i = 0; i < blocked.length; i++) {
    if (lower === blocked[i] || lower.indexOf(blocked[i]) !== -1) return true;
  }
  return false;
}

function getSelectedCategories() {
  var checks = document.querySelectorAll('#input-categories input:checked');
  var cats = [];
  checks.forEach(function (c) { cats.push(c.value); });
  return cats;
}

function clearCategoryCheckboxes() {
  document.querySelectorAll('#input-categories input').forEach(function (c) {
    c.checked = false;
  });
  document.querySelectorAll('.cat-check').forEach(function (l) {
    l.classList.remove('checked');
  });
}

function compressImage(file, maxWidth = 1000, quality = 0.5) {
  return new Promise(function (resolve) {
    var reader = new FileReader();

    // при любой ошибке отдаём оригинал, чтобы отправка не зависала
    reader.onerror = function () { resolve(file); };

    reader.onload = function (e) {
      var img = new Image();

      img.onerror = function () { resolve(file); };

      img.onload = function () {
        var canvas = document.createElement('canvas');
        var w = img.width;
        var h = img.height;

        if (w > maxWidth) {
          h = Math.round(h * maxWidth / w);
          w = maxWidth;
        }

        canvas.width = w;
        canvas.height = h;

        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(function (blob) {
          if (!blob) { resolve(file); return; }
          var compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(compressed);
        }, 'image/jpeg', quality);
      };

      img.src = e.target.result;
    };

    reader.readAsDataURL(file);
  });
}

// ================================
// Supabase
// ================================

function supaFetch(path, options = {}) {
  var headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': options.prefer || 'return=representation'
  };

  return fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: options.method || 'GET',
    headers: headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  }).then(async function (r) {
    if (!r.ok) {
      var errText = await r.text().catch(function () { return ''; });
      throw new Error('Supabase ' + r.status + ': ' + errText.slice(0, 200));
    }

    if (r.status === 204) return null;

    var text = await r.text();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch (e) {
      return text;
    }
  });
}

// Любое действие администратора: сервер проверит токен и сделает работу сам.
function adminAction(action, payload) {
  if (!adminToken) return Promise.reject(new Error('Нет сессии администратора'));

  return fetch(ADMIN_ACTION_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: adminToken, action: action, payload: payload || {} })
  }).then(async function (r) {
    var data = null;
    try { data = await r.json(); } catch (e) { data = null; }

    if (r.status === 401) {
      endAdminSession(true);
      var expired = new Error('Сессия администратора истекла');
      expired.sessionExpired = true;
      throw expired;
    }

    if (!r.ok || !data || !data.success) {
      throw new Error((data && data.message) || ('admin-action ' + r.status));
    }

    return data.data;
  });
}

// Про истёкшую сессию пользователю уже сказали — не перекрываем это сообщение
// частной ошибкой вроде «не удалось одобрить».
function adminError(message) {
  return function (err) {
    if (err && err.sessionExpired) return;
    showToast(message, 'error');
  };
}

function endAdminSession(expired) {
  isAdmin = false;
  adminToken = null;

  try { sessionStorage.removeItem(ADMIN_TOKEN_KEY); } catch (e) { /* приватный режим */ }

  document.body.classList.remove('admin-mode');
  var btn = document.getElementById('admin-btn');
  if (btn) btn.classList.remove('active');
  closeModPanel();

  if (expired) showToast('Сессия администратора истекла — войдите заново', 'error');
}

function mapDetailRow(d) {
  return {
    id: d.id,
    title: d.title || '',
    description: d.description || '',
    category: d.category,
    lat: d.lat,
    lng: d.lng,
    photo: d.photo_url || '',
    thumb: d.thumb_url || '',
    status: d.status,
    author: d.author || '',
    created_at: d.created_at || ''
  };
}

// Публичная загрузка точек. Всё, что на модерации, анониму не отдаст и сам
// сервер — админка грузит данные через loadAllForAdmin.
function loadDetails() {
  var query = 'details?select=*&status=eq.approved&order=created_at.desc';

  return supaFetch(query).then(function (data) {
    if (Array.isArray(data)) details = data.map(mapDetailRow);
    updateBadge();
  });
}

function loadAllForAdmin() {
  return adminAction('list_details').then(function (data) {
    if (Array.isArray(data)) details = data.map(mapDetailRow);
    updateBadge();
  });
}

function loadNotes(detailId) {
  var request = isAdmin
    ? adminAction('list_notes', { detail_id: detailId })
    : supaFetch('notes?detail_id=eq.' + encodeURIComponent(detailId) + '&status=eq.approved&order=created_at.asc');

  return request.then(data => {
    currentNotes = Array.isArray(data) ? data : [];
    renderNotes();
  }).catch(() => {
    currentNotes = [];
    renderNotes();
  });
}

// Очередь модерации целиком: одним запросом и только для админа.
function loadPendingQueue() {
  if (!isAdmin) {
    pendingNotes = [];
    pendingPhotos = [];
    return Promise.resolve();
  }

  return adminAction('list_pending').then(data => {
    pendingNotes = data && Array.isArray(data.notes) ? data.notes : [];
    pendingPhotos = data && Array.isArray(data.photos) ? data.photos : [];
  }).catch(() => {
    pendingNotes = [];
    pendingPhotos = [];
  });
}

function sendEmailNotification(detail) {
  if (isAdmin) return;

  try {
    emailjs.init(EMAILJS_PUBLIC_KEY);
    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      title: detail.title,
      author: detail.author || 'Аноним',
      category: detail.category,
      lat: detail.lat,
      lng: detail.lng,
      description: detail.description || '—'
    }).then(() => {
      console.log('Email sent');
    }).catch(err => {
      console.log('Email error:', err);
    });
  } catch (e) {
    console.log('Email init/send error:', e);
  }
}

// Превью: ширина с запасом под ретину для маркеров, поиска и списка находок.
var THUMB_WIDTH = 480;
var THUMB_QUALITY = 0.6;

function uploadToBucket(path, file, contentType) {
  return fetch(SUPABASE_URL + '/storage/v1/object/photos/' + path, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': contentType
    },
    body: file
  }).then(async function (r) {
    if (r.ok) return SUPABASE_URL + '/storage/v1/object/public/photos/' + path;
    var errText = await r.text().catch(function () { return ''; });
    throw new Error('Upload ' + r.status + ': ' + errText.slice(0, 200));
  });
}

// Кладём рядом с оригиналом уменьшенную копию: карта показывает фото в маркерах
// 20×20, и тянуть ради этого мегабайтные снимки незачем. Если превью сделать не
// удалось, точка всё равно сохранится — клиент подставит оригинал.
function uploadPhoto(file) {
  var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '') || 'photo.jpg';
  var fileName = Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '_' + safeName;
  // На некоторых мобильных file.type пустой — без явного типа загрузка падает.
  var contentType = file.type || 'image/jpeg';

  return uploadToBucket(fileName, file, contentType).then(function (url) {
    return compressImage(file, THUMB_WIDTH, THUMB_QUALITY)
      .then(function (thumb) {
        // compressImage при ошибке отдаёт оригинал — такой «превью» не нужен
        if (thumb === file || thumb.size >= file.size) return { url: url, thumbUrl: '' };
        return uploadToBucket('thumbs/' + fileName, thumb, 'image/jpeg')
          .then(function (thumbUrl) { return { url: url, thumbUrl: thumbUrl }; });
      })
      .catch(function (e) {
        console.warn('Не удалось сделать превью:', e);
        return { url: url, thumbUrl: '' };
      });
  });
}

function getPendingCount() {
  var detailsPending = details.filter(d => d.status === 'pending').length;
  return detailsPending + pendingNotes.length + pendingPhotos.length;
}

var badgeRequestToken = 0;

function updateBadge() {
  var badge = document.getElementById('pending-badge');
  if (!badge) return;

  if (isAdmin) {
    var token = ++badgeRequestToken;
    loadPendingQueue().then(() => {
      if (token !== badgeRequestToken) return;
      var count = getPendingCount();
      if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    });
  } else {
    // Не-админ вообще не видит записи на модерации, показывать нечего.
    badge.classList.add('hidden');
  }
}

// ================================
// Заметки
// ================================

function renderNotes() {
  var list = document.getElementById('notes-list');
  var countEl = document.getElementById('notes-count');
  if (!list || !countEl) return;

  var approved = currentNotes.filter(n => n.status === 'approved');
  var pending = isAdmin ? currentNotes.filter(n => n.status === 'pending') : [];
  var total = approved.length + pending.length;

  countEl.textContent = total > 0 ? '(' + total + ')' : '';

  if (total === 0) {
    list.innerHTML = '<div class="notes-empty">Пока нет описаний. Будьте первым!</div>';
    return;
  }

  var html = '';

  approved.forEach(n => {
    html += '<div class="note-item">';
    html += '<div class="note-text">' + escapeHtml(n.text) + '</div>';
    html += '<div class="note-meta">' + escapeHtml(n.author || 'Аноним') + ' · ' + formatDate(n.created_at);
    if (isAdmin) {
      html += '<span class="note-admin-actions">';
      html += '<button class="note-admin-btn" onclick="deleteNote(\'' + n.id + '\')" title="Удалить">✕</button>';
      html += '</span>';
    }
    html += '</div></div>';
  });

  pending.forEach(n => {
    html += '<div class="note-item" style="opacity:0.5;border-left:2px dashed #000;padding-left:10px;">';
    html += '<div class="note-text">' + escapeHtml(n.text) + '</div>';
    html += '<div class="note-meta">' + escapeHtml(n.author || 'Аноним') + ' · ' + formatDate(n.created_at);
    html += '<span class="note-status pending">На модерации</span>';
    if (isAdmin) {
      html += '<span class="note-admin-actions">';
      html += '<button class="note-admin-btn" onclick="approveNote(\'' + n.id + '\')" title="Одобрить">✓</button>';
      html += '<button class="note-admin-btn" onclick="deleteNote(\'' + n.id + '\')" title="Удалить">✕</button>';
      html += '</span>';
    }
    html += '</div></div>';
  });

  list.innerHTML = html;
}

function submitNote() {
  var text = document.getElementById('note-text').value.trim();
  var author = document.getElementById('note-author').value.trim() || 'Аноним';
  if (!text) { showToast('Введите описание', 'error'); return; }
  if (!currentDetailId) return;
  if (!isAdmin && isReservedName(author)) { showToast('Это имя зарезервировано', 'error'); return; }

  var btn = document.getElementById('note-submit');
  btn.disabled = true;
  btn.textContent = '...';

  var row = {
    detail_id: currentDetailId,
    text: text,
    author: author,
    status: isAdmin ? 'approved' : 'pending'
  };

  // Аноним может только прислать запись на модерацию, поэтому и ответа с ней
  // не получает (RLS не даёт прочитать неодобренное). Админ пишет через сервер.
  var request = isAdmin
    ? adminAction('create_note', { row: row })
    : supaFetch('notes', { method: 'POST', body: row, prefer: 'return=minimal' });

  request.then(data => {
    if (isAdmin && data && data[0]) currentNotes.push(data[0]);
    renderNotes();
    document.getElementById('note-text').value = '';
    document.getElementById('note-author').value = '';
    document.getElementById('note-form').classList.remove('open');
    btn.disabled = false;
    btn.textContent = 'Отправить';

    if (!isAdmin) showToast('Спасибо! Описание отправлено на модерацию.');

    updateBadge();
  }).catch(() => {
    showToast('Ошибка отправки', 'error');
    btn.disabled = false;
    btn.textContent = 'Отправить';
  });
}

function approveNote(id) {
  adminAction('approve_note', { id: id }).then(() => {
    var n = currentNotes.find(x => x.id === id);
    if (n) n.status = 'approved';
    pendingNotes = pendingNotes.filter(x => x.id !== id);
    renderNotes();
    updateBadge();
    renderModList();
  }).catch(adminError('Не удалось одобрить описание'));
}

function deleteNote(id) {
  if (!confirm('Удалить описание?')) return;
  adminAction('delete_note', { id: id }).then(() => {
    currentNotes = currentNotes.filter(n => n.id !== id);
    pendingNotes = pendingNotes.filter(n => n.id !== id);
    renderNotes();
    updateBadge();
    renderModList();
  }).catch(adminError('Не удалось удалить описание'));
}

// ================================
// Фото-слайдер (хронология)
// ================================

function comparePhotos(a, b) {
  if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
  return new Date(a.created_at || 0) - new Date(b.created_at || 0);
}

function loadPhotos(detailId, focusId) {
  var request = isAdmin
    ? adminAction('list_photos', { detail_id: detailId })
    : supaFetch('photos?detail_id=eq.' + encodeURIComponent(detailId) +
        '&status=eq.approved&order=sort_order.asc,created_at.asc');

  return request.then(data => {
    currentPhotos = Array.isArray(data) ? data : [];
    rebuildSlides(focusId);
  }).catch(() => {
    currentPhotos = [];
    rebuildSlides(focusId);
  });
}

function buildPhotoSlides(d) {
  var slides = [];

  // Обложка детали — самое первое (старое) фото.
  if (d && d.photo) {
    slides.push({ url: d.photo, date: d.created_at, author: d.author, status: 'approved', id: null, isCover: true });
  }

  currentPhotos.filter(p => p.status === 'approved').sort(comparePhotos).forEach(p => {
    slides.push({ url: p.photo_url, date: p.created_at, author: p.author, status: 'approved', id: p.id, isCover: false });
  });

  // Фото на модерации видит только админ — в конце слайдера.
  if (isAdmin) {
    currentPhotos.filter(p => p.status === 'pending').sort(comparePhotos).forEach(p => {
      slides.push({ url: p.photo_url, date: p.created_at, author: p.author, status: 'pending', id: p.id, isCover: false });
    });
  }

  return slides;
}

function rebuildSlides(focusId) {
  photoSlides = buildPhotoSlides(currentDetail);
  if (focusId) {
    var i = photoSlides.findIndex(s => s.id === focusId);
    if (i >= 0) photoIndex = i;
  }
  if (photoIndex >= photoSlides.length) photoIndex = Math.max(0, photoSlides.length - 1);
  renderPhotoSlider();
}

// Показ фото с ожиданием загрузки: пока новое не приехало, старое не видно.
// Токен у каждой картинки свой — медленно догрузившийся прошлый снимок не
// должен перебить уже показанный следующий.
var photoLoadTokens = new WeakMap();

function nextPhotoToken(img) {
  var token = (photoLoadTokens.get(img) || 0) + 1;
  photoLoadTokens.set(img, token);
  return token;
}

function showPhoto(container, img, url) {
  var token = nextPhotoToken(img);
  var alreadyShown = img.getAttribute('src') === url && img.complete && img.naturalWidth > 0;

  container.classList.remove('photo-failed');
  img.onload = null;
  img.onerror = null;

  if (alreadyShown) {
    container.classList.remove('photo-loading');
    return;
  }

  container.classList.add('photo-loading');

  img.onload = function () {
    if (photoLoadTokens.get(img) !== token) return;
    container.classList.remove('photo-loading');
  };

  // Фото у нас тяжёлые (в среднем больше мегабайта), и на плохой связи загрузка
  // иногда обрывается. Одна повторная попытка спасает раунд игры или карточку
  // от пустого места.
  var retried = false;

  img.onerror = function () {
    if (photoLoadTokens.get(img) !== token) return;

    if (!retried) {
      retried = true;
      setTimeout(function () {
        if (photoLoadTokens.get(img) !== token) return;
        img.src = url + (url.indexOf('?') === -1 ? '?' : '&') + 'retry=1';
      }, 1200);
      return;
    }

    container.classList.remove('photo-loading');
    container.classList.add('photo-failed');
  };

  img.src = url;

  // фото из кэша может быть готово ещё до подписки на onload
  if (img.complete && img.naturalWidth > 0) {
    container.classList.remove('photo-loading');
  }
}

function renderPhotoSlider() {
  var sliderEl = document.getElementById('photo-slider');
  var img = document.getElementById('detail-photo');
  var counter = document.getElementById('photo-counter');
  var caption = document.getElementById('photo-caption');
  var bar = document.getElementById('photo-admin-bar');
  if (!sliderEl || !img) return;

  if (photoIndex < 0) photoIndex = 0;
  if (photoIndex >= photoSlides.length) photoIndex = Math.max(0, photoSlides.length - 1);

  if (photoSlides.length === 0) {
    nextPhotoToken(img); // отменяем ожидание фото прошлой точки
    img.style.display = 'none';
    img.removeAttribute('src');
    counter.textContent = '';
    caption.innerHTML = '';
    bar.innerHTML = '';
    sliderEl.classList.remove('has-many', 'photo-loading', 'photo-failed');
    return;
  }

  var s = photoSlides[photoIndex];
  img.style.display = '';
  showPhoto(sliderEl, img, s.url);
  sliderEl.classList.toggle('has-many', photoSlides.length > 1);
  counter.textContent = (photoIndex + 1) + '/' + photoSlides.length;

  var capParts = [];
  if (s.date) capParts.push(formatDate(s.date));
  if (s.author) capParts.push(escapeHtml(s.author));
  var cap = capParts.join(' · ');
  if (s.status === 'pending') cap += '<span class="photo-pending">на модерации</span>';
  caption.innerHTML = cap;

  bar.innerHTML = '';
  if (isAdmin && s.id && !s.isCover) {
    if (s.status === 'pending') {
      bar.innerHTML =
        '<button class="pa-approve" onclick="approvePhoto(\'' + s.id + '\')">✓ одобрить</button>' +
        '<button class="pa-delete" onclick="deletePhoto(\'' + s.id + '\')">✕ удалить</button>';
    } else {
      var approved = photoSlides.filter(x => x.status === 'approved' && !x.isCover);
      var pos = approved.findIndex(x => x.id === s.id);
      var firstDis = pos <= 0 ? ' disabled' : '';
      var lastDis = pos >= approved.length - 1 ? ' disabled' : '';
      bar.innerHTML =
        '<button onclick="movePhoto(\'' + s.id + '\',-1)"' + firstDis + '>← раньше</button>' +
        '<button onclick="movePhoto(\'' + s.id + '\',1)"' + lastDis + '>позже →</button>' +
        '<button class="pa-delete" onclick="deletePhoto(\'' + s.id + '\')">✕</button>';
    }
  }
}

function photoSliderNav(direction) {
  if (photoSlides.length <= 1) return;
  photoIndex = (photoIndex + direction + photoSlides.length) % photoSlides.length;
  renderPhotoSlider();
}

function resetPhotoForm() {
  var form = document.getElementById('photo-form');
  if (form) form.classList.remove('open');
  var input = document.getElementById('photo-input');
  if (input) input.value = '';
  var author = document.getElementById('photo-author');
  if (author) author.value = '';
  var agree = document.getElementById('photo-agree');
  if (agree) agree.checked = false;
  var preview = document.getElementById('photo-form-preview');
  if (preview) preview.innerHTML = '';
}

function submitPhoto() {
  if (!currentDetailId) return;

  var fileInput = document.getElementById('photo-input');
  var author = document.getElementById('photo-author').value.trim() || 'Аноним';
  var agreed = document.getElementById('photo-agree').checked;

  if (!fileInput.files || !fileInput.files[0]) { showToast('Выберите фото', 'error'); return; }
  if (!isAdmin && isReservedName(author)) { showToast('Это имя зарезервировано', 'error'); return; }
  if (!agreed) { showToast('Подтвердите согласие с условиями', 'error'); return; }

  var btn = document.getElementById('photo-submit');
  btn.disabled = true;
  btn.textContent = '...';

  var detailId = currentDetailId;
  var nextOrder = currentPhotos.reduce((m, p) => Math.max(m, p.sort_order || 0), 0) + 1;

  compressImage(fileInput.files[0], 1000, 0.5)
    .then(uploadPhoto)
    .then(uploaded => {
      var row = {
        detail_id: detailId,
        photo_url: uploaded.url,
        thumb_url: uploaded.thumbUrl,
        author: author,
        status: isAdmin ? 'approved' : 'pending',
        sort_order: nextOrder
      };

      return isAdmin
        ? adminAction('create_photo', { row: row })
        : supaFetch('photos', { method: 'POST', body: row, prefer: 'return=minimal' });
    })
    .then(() => {
      resetPhotoForm();
      btn.disabled = false;
      btn.textContent = 'Отправить';
      if (detailId === currentDetailId) loadPhotos(detailId);
      updateBadge();
      showToast(isAdmin ? 'Фото добавлено' : 'Спасибо! Фото отправлено на модерацию.');
    })
    .catch(() => {
      btn.disabled = false;
      btn.textContent = 'Отправить';
      showToast('Не удалось загрузить фото', 'error');
    });
}

function approvePhoto(id) {
  adminAction('approve_photo', { id: id }).then(() => {
    pendingPhotos = pendingPhotos.filter(p => p.id !== id);
    var p = currentPhotos.find(x => x.id === id);
    if (p) p.status = 'approved';
    rebuildSlides(id);
    updateBadge();
    renderModList();
  }).catch(adminError('Не удалось одобрить фото'));
}

function deletePhoto(id) {
  if (!confirm('Удалить фото?')) return;
  adminAction('delete_photo', { id: id }).then(() => {
    pendingPhotos = pendingPhotos.filter(p => p.id !== id);
    currentPhotos = currentPhotos.filter(p => p.id !== id);
    rebuildSlides();
    updateBadge();
    renderModList();
  }).catch(adminError('Не удалось удалить фото'));
}

function movePhoto(id, direction) {
  var list = currentPhotos.filter(p => p.status === 'approved').sort(comparePhotos);
  var i = list.findIndex(p => p.id === id);
  var j = i + direction;
  if (i < 0 || j < 0 || j >= list.length) return;

  var tmp = list[i];
  list[i] = list[j];
  list[j] = tmp;

  // Нормализуем порядок (0,1,2,…) и сохраняем только изменившиеся записи.
  var changed = [];
  list.forEach((p, idx) => {
    if ((p.sort_order || 0) !== idx) {
      p.sort_order = idx;
      changed.push(p);
    }
  });

  rebuildSlides(id); // мгновенный отклик в UI

  adminAction('reorder_photos', {
    items: changed.map(p => ({ id: p.id, sort_order: p.sort_order }))
  }).catch(() => {
    showToast('Не удалось сохранить порядок', 'error');
    loadPhotos(currentDetailId, id);
  });
}

// ================================
// Детали / галерея
// ================================

function buildGallery() {
  var bounds = map.getBounds();
  return details.filter(d => {
    if (!isAdmin && d.status !== 'approved') return false;
    if (activeFilter !== 'all') {
      var cats = (d.category || '').split(',');
      if (cats.indexOf(activeFilter) === -1) return false;
    }
    if (!bounds.contains([d.lat, d.lng])) return false;
    return true;
  }).sort((a, b) => {
    var dy = b.lat - a.lat;
    if (Math.abs(dy) > 0.0005) return dy;
    return a.lng - b.lng;
  });
}

function highlightActiveMarker(activeId) {
  markerObjects.forEach(item => {
    var el = item.marker.getElement();
    if (!el) return;
    var div = el.querySelector('.dot-marker');
    if (!div) return;
    if (activeId && item.detail.id === activeId) div.classList.add('active-marker');
    else div.classList.remove('active-marker');
  });
}

function showGalleryItem(idx) {
  galleryIndex = idx;
  var d = gallery[idx];
  currentDetailId = d.id;
  syncUrlToDetail(d.id, true); // листание галереи не должно засорять историю

  currentDetail = d;
  currentPhotos = [];
  photoIndex = 0;
  resetPhotoForm();
  photoSlides = buildPhotoSlides(d);
  renderPhotoSlider();
  loadPhotos(d.id);

  document.getElementById('detail-title').textContent = d.title;
  document.getElementById('detail-description').textContent = d.description;

  var catLabels = (d.category || 'other').split(',').map(c => (CATEGORIES[c.trim()] || CATEGORIES.other).label);
  document.getElementById('detail-category').textContent = catLabels.join(' · ');

  var st = document.getElementById('detail-status');
  if (d.status === 'pending') {
    st.textContent = 'На модерации';
    st.className = 'status-tag pending';
    st.style.display = '';
  } else if (isAdmin) {
    st.textContent = 'Одобрено';
    st.className = 'status-tag approved';
    st.style.display = '';
  } else {
    st.style.display = 'none';
  }

  var subParts = [];
  if (d.author) subParts.push(d.author);
  if (d.created_at) subParts.push(formatDate(d.created_at));
  document.getElementById('detail-sub').textContent = subParts.join(' · ');

  document.getElementById('btn-approve-detail').style.display = (d.status === 'pending') ? '' : 'none';
  document.getElementById('panel-counter').textContent = (idx + 1) + ' из ' + gallery.length;

  var hasMany = gallery.length > 1;
  document.getElementById('nav-prev').disabled = !hasMany;
  document.getElementById('nav-next').disabled = !hasMany;

  highlightActiveMarker(d.id);

  document.getElementById('note-form').classList.remove('open');
  loadNotes(d.id);
}

function navigateDetail(direction) {
  if (gallery.length <= 1) return;
  galleryIndex += direction;
  if (galleryIndex < 0) galleryIndex = gallery.length - 1;
  if (galleryIndex >= gallery.length) galleryIndex = 0;
  showGalleryItem(galleryIndex);
}

function showPreview(detail, markerEl) {
  if (isTouchDevice) return;
  var prev = document.getElementById('marker-preview');
  var rect = markerEl.getBoundingClientRect();
  var html = '';
  if (previewSrc(detail)) html += '<img src="' + escapeHtml(previewSrc(detail)) + '" alt="">';
  else html += '<div class="preview-no-photo">нет фото</div>';
  html += '<div class="preview-title">' + escapeHtml(detail.title) + '</div>';
  prev.innerHTML = html;
  var left = rect.left;
  prev.style.left = left + 'px';
  prev.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
  prev.style.top = 'auto';
  if (left + 200 > window.innerWidth) prev.style.left = (window.innerWidth - 210) + 'px';
  prev.classList.add('visible');
}

function hidePreview() {
  var el = document.getElementById('marker-preview');
  if (el) el.classList.remove('visible');
}

// ================================
// Карта
// ================================

function geoLocate() {
  if (!navigator.geolocation) { showToast('Геолокация не поддерживается', 'error'); return; }
  var btn = document.getElementById('geo-float');
  btn.classList.add('locating');

  navigator.geolocation.getCurrentPosition(function (pos) {
    var lat = pos.coords.latitude, lng = pos.coords.longitude;
    map.flyTo([lat, lng], 17, { duration: 1.2 });
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([lat, lng], {
      icon: L.divIcon({ html: '<div class="user-marker"></div>', className: '', iconSize: [14, 14], iconAnchor: [7, 7] })
    }).addTo(map);
    btn.classList.remove('locating');
  }, function (err) {
    btn.classList.remove('locating');
    if (err.code === 1) showToast('Разрешите доступ к геолокации', 'error');
    else showToast('Не удалось определить местоположение', 'error');
  }, { enableHighAccuracy: true, timeout: 10000 });
}

function initMap() {
  map = L.map('map', { center: MAP_CENTER, zoom: MAP_ZOOM, zoomControl: false });
  L.control.zoom({ position: 'bottomleft' }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 19
  }).on('tileerror', function (e) {
    console.warn('Ошибка загрузки тайла карты', e);
  }).addTo(map);

  map.on('mousemove', function (e) {
    mouseLatLng = e.latlng;
    if (!proximityRAF) proximityRAF = requestAnimationFrame(updateProximity);
  });

  map.on('click', function (e) {
    if (!isAddingMode) return;
    pendingCoords = { lat: e.latlng.lat, lng: e.latlng.lng };

    if (tempMarker) map.removeLayer(tempMarker);
    tempMarker = L.marker([e.latlng.lat, e.latlng.lng], {
      icon: L.divIcon({ html: '<div class="temp-marker"></div>', className: '', iconSize: [16, 16], iconAnchor: [8, 8] })
    }).addTo(map);

    var box = document.getElementById('status-box');
    box.className = 'status-box status-ready';
    box.textContent = '✓ ' + e.latlng.lat.toFixed(4) + ', ' + e.latlng.lng.toFixed(4);
    document.getElementById('add-panel').classList.add('expanded');
    document.getElementById('map-hint').classList.remove('visible');
  });
}

function updateProximity() {
  proximityRAF = null;
  if (!mouseLatLng) return;
  var mousePoint = map.latLngToContainerPoint(mouseLatLng);

  markerObjects.forEach(function (item) {
    var el = item.marker.getElement();
    if (!el) return;
    var div = el.querySelector('.dot-marker');
    if (!div) return;
    var markerPoint = map.latLngToContainerPoint([item.detail.lat, item.detail.lng]);
    var dx = mousePoint.x - markerPoint.x, dy = mousePoint.y - markerPoint.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    div.classList.remove('prox-1', 'prox-2', 'prox-3');
    if (dist < 60) div.classList.add('prox-1');
    else if (dist < 120) div.classList.add('prox-2');
    else if (dist < 200) div.classList.add('prox-3');
  });
}

function renderMarkers() {
  if (clusterGroup) map.removeLayer(clusterGroup);

  clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    iconCreateFunction: function (cluster) {
      var count = cluster.getChildCount();
      return L.divIcon({
        html: '<div class="marker-cluster-inner">' + count + '</div>',
        className: 'marker-cluster marker-cluster-' + (count < 5 ? 'small' : count < 15 ? 'medium' : 'large'),
        iconSize: [40, 40]
      });
    }
  });

  markerObjects = [];

  details.filter(function (d) {
    if (!isAdmin && d.status !== 'approved') return false;
    if (activeFilter !== 'all') {
      var cats = (d.category || '').split(',');
      if (cats.indexOf(activeFilter) === -1) return false;
    }
    return true;
  }).forEach(function (detail) {
    var marker = L.marker([detail.lat, detail.lng], {
      icon: createMarkerIcon(detail)
    });

    marker.on('click', function () {
      if (isAddingMode) return;
      hidePreview();
      openDetail(detail);
    });

    (function (det) {
      marker.on('mouseover', function () {
        if (isAddingMode || isTouchDevice) return;
        previewTimeout = setTimeout(function () {
          var el = marker.getElement();
          if (el) showPreview(det, el);
        }, 300);
      });
      marker.on('mouseout', function () {
        clearTimeout(previewTimeout);
        hidePreview();
      });
    })(detail);

    clusterGroup.addLayer(marker);
    markerObjects.push({ marker: marker, detail: detail });
  });

  map.addLayer(clusterGroup);
}

// ================================
// Поиск / фильтры
// ================================

function doSearch(query) {
  searchQuery = query.toLowerCase().trim();
  var clearBtn = document.getElementById('search-clear');
  var resultsEl = document.getElementById('search-results');

  if (!searchQuery) {
    clearBtn.classList.add('hidden');
    resultsEl.classList.add('hidden');
    resultsEl.innerHTML = '';
    lastSearchMatches = [];
    removeConnectLine();
    return;
  }

  clearBtn.classList.remove('hidden');

  var matches = details.filter(d => {
    if (!isAdmin && d.status !== 'approved') return false;
    var hay = (d.title + ' ' + d.description + ' ' + d.author).toLowerCase();
    return hay.indexOf(searchQuery) !== -1;
  });

  lastSearchMatches = matches;

  if (matches.length === 0) {
    resultsEl.innerHTML = '<div class="search-no-results">Ничего не найдено</div>';
    resultsEl.classList.remove('hidden');
    removeConnectLine();
    return;
  }

  var html = '<div class="search-count">Найдено: ' + matches.length + '</div>';
  var show = matches.slice(0, 7);

  show.forEach(d => {
    var title = escapeHtml(d.title);
    var re = new RegExp('(' + escapeHtml(searchQuery).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    var highlighted = title.replace(re, '<mark>$1</mark>');
    var catLabels = (d.category || 'other').split(',').map(c => (CATEGORIES[c.trim()] || CATEGORIES.other).label);
    var cat = { label: catLabels.join(' · ') };

    html += '<div class="search-result-item" data-id="' + escapeHtml(d.id) + '">';
    if (previewSrc(d)) html += '<img class="search-result-photo" src="' + escapeHtml(previewSrc(d)) + '" alt="" loading="lazy">';
    else html += '<div class="search-result-nophoto">●</div>';
    html += '<div class="search-result-info"><div class="search-result-title">' + highlighted + '</div>';
    html += '<div class="search-result-meta">' + cat.label + (d.author ? ' · ' + escapeHtml(d.author) : '') + '</div></div></div>';
  });

  if (matches.length >= 2) {
    var isActive = connectLine ? ' active' : '';
    html += '<button class="search-connect' + isActive + '" id="search-connect-btn"><span class="search-connect-icon">⟋</span> ' + (connectLine ? 'Убрать связь' : 'Связать · ' + matches.length + ' точек') + '</button>';
  }

  resultsEl.innerHTML = html;
  resultsEl.classList.remove('hidden');

  resultsEl.querySelectorAll('.search-result-item').forEach(el => {
    el.addEventListener('click', () => {
      var id = el.getAttribute('data-id');
      var d = details.find(x => x.id === id);
      if (d) {
        resultsEl.classList.add('hidden');
        focusDetail(d);
      }
    });
  });

  var connectBtn = document.getElementById('search-connect-btn');
  if (connectBtn) {
    connectBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (connectLine) {
        removeConnectLine();
        doSearch(document.getElementById('search-input').value);
      } else {
        drawConnectLine(matches);
        doSearch(document.getElementById('search-input').value);
      }
    });
  }
}

function drawConnectLine(matches) {
  removeConnectLine();
  if (matches.length < 2) return;
  lastSearchMatches = matches;
  updateConnectLines();
  map.on('moveend', updateConnectLines);
  map.on('zoomend', updateConnectLines);
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').classList.add('hidden');
  document.getElementById('search-results').classList.add('hidden');
  document.getElementById('search-results').innerHTML = '';
  searchQuery = '';
  lastSearchMatches = [];
  removeConnectLine();
}

function updateConnectLines() {
  if (!lastSearchMatches.length) return;
  if (connectLine) {
    map.removeLayer(connectLine);
    connectLine = null;
  }

  var bounds = map.getBounds();
  var visible = lastSearchMatches.filter(d => bounds.contains([d.lat, d.lng]));
  if (visible.length < 2) return;

  var lines = [];
  for (var i = 0; i < visible.length; i++) {
    for (var j = i + 1; j < visible.length; j++) {
      lines.push([[visible[i].lat, visible[i].lng], [visible[j].lat, visible[j].lng]]);
    }
  }

  connectLine = L.layerGroup(lines.map(pair => L.polyline(pair, { color: '#000', weight: 1, opacity: 0.4 }))).addTo(map);
}

function removeConnectLine() {
  map.off('moveend', updateConnectLines);
  map.off('zoomend', updateConnectLines);
  if (connectLine) {
    map.removeLayer(connectLine);
    connectLine = null;
  }
}

// ================================
// Открытие/закрытие форм
// ================================

function openDetail(d) {
  if (!d) return;

  // Поиск ищет по всем точкам и фильтр категорий не учитывает, поэтому открытая
  // точка может быть им скрыта. Сбрасываем фильтр, иначе на карте не будет даже
  // её маркера.
  if (activeFilter !== 'all' && (d.category || '').split(',').indexOf(activeFilter) === -1) {
    setFilter('all');
  }

  gallery = buildGallery();
  galleryIndex = gallery.findIndex(x => x.id === d.id);

  // Точка может не попасть в галерею: она строится по видимой области карты, а
  // карта, например, ещё летит к ней. Раньше в этом случае открывалась чужая
  // деталь по индексу 0 (или падало на пустой галерее) — показываем саму точку.
  if (galleryIndex === -1) {
    gallery = [d];
    galleryIndex = 0;
  }

  syncUrlToDetail(d.id, false);
  showGalleryItem(galleryIndex);
  document.getElementById('detail-panel').classList.remove('hidden');
  document.getElementById('add-btn').style.display = 'none';
  document.getElementById('geo-float').style.display = 'none';
}

// ================================
// Ссылки на конкретную точку
// ================================

function detailPath(id) {
  return window.location.pathname + '?d=' + encodeURIComponent(id);
}

// Держим адресную строку в согласии с открытой точкой, чтобы ссылкой можно было
// поделиться, а «Назад» на телефоне закрывал панель.
function syncUrlToDetail(id, replace) {
  if (!window.history || !window.history.pushState) return;

  var url = id ? detailPath(id) : window.location.pathname;
  if (window.location.pathname + window.location.search === url) return;

  try {
    if (replace) window.history.replaceState({ d: id || null }, '', url);
    else window.history.pushState({ d: id || null }, '', url);
  } catch (e) { /* file:// и подобные — просто не трогаем адрес */ }
}

function detailIdFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('d');
  } catch (e) {
    return null;
  }
}

// Перелетаем к точке и открываем её, дождавшись конца анимации: иначе точка
// может ещё не попасть в видимую область, из которой строится галерея.
function focusDetail(d) {
  var opened = false;

  function open() {
    if (opened) return;
    opened = true;
    openDetail(d);
  }

  map.once('moveend', open);
  setTimeout(open, 1000); // подстраховка, если карта уже стоит на месте
  map.flyTo([d.lat, d.lng], Math.max(map.getZoom(), 17), { duration: 0.8 });
}

function openDetailFromUrl() {
  var id = detailIdFromUrl();
  if (!id) return;

  var d = details.find(x => x.id === id);
  if (!d) {
    showToast('Точка не найдена — возможно, она ещё на модерации', 'error');
    syncUrlToDetail(null, true);
    return;
  }

  focusDetail(d);
}

function shareCurrentDetail() {
  if (!currentDetail) return;

  var url = window.location.origin + detailPath(currentDetail.id);
  var title = currentDetail.title || 'textula';

  if (navigator.share) {
    navigator.share({ title: 'textula — ' + title, text: title, url: url })
      .catch(() => { /* пользователь отменил */ });
    return;
  }

  if (navigator.clipboard) {
    navigator.clipboard.writeText(url)
      .then(() => showToast('Ссылка скопирована'))
      .catch(() => showToast('Не удалось скопировать ссылку', 'error'));
    return;
  }

  showToast('Ссылка: ' + url);
}

function closeDetail() {
  document.getElementById('detail-panel').classList.add('hidden');
  syncUrlToDetail(null, true);
  currentDetailId = null;
  gallery = [];
  galleryIndex = 0;
  highlightActiveMarker(null);
  currentNotes = [];
  currentDetail = null;
  currentPhotos = [];
  photoSlides = [];
  photoIndex = 0;
  resetPhotoForm();
  document.getElementById('add-btn').style.display = '';
  document.getElementById('geo-float').style.display = '';
}

function openAddForm() {
  isAddingMode = true;
  closeDetail();
  closeModPanel();
  document.getElementById('add-panel').classList.add('open');
  document.getElementById('add-btn').classList.add('hidden');
  document.getElementById('geo-float').style.display = 'none';
  document.getElementById('map-hint').classList.add('visible');
  document.getElementById('map').style.cursor = 'crosshair';
}

function closeAddForm() {
  isAddingMode = false;
  pendingCoords = null;

  if (tempMarker) {
    map.removeLayer(tempMarker);
    tempMarker = null;
  }

  document.getElementById('add-panel').classList.remove('open');
  document.getElementById('add-panel').classList.remove('expanded');
  document.getElementById('add-btn').classList.remove('hidden');
  document.getElementById('geo-float').style.display = '';
  document.getElementById('map-hint').classList.remove('visible');
  document.getElementById('map').style.cursor = '';
  document.getElementById('input-title').value = '';
  document.getElementById('input-description').value = '';
  document.getElementById('input-author').value = '';
  clearCategoryCheckboxes();
  document.getElementById('input-photo').value = '';
  document.getElementById('photo-preview').innerHTML = '';
  document.getElementById('input-agree').checked = false;

  var box = document.getElementById('status-box');
  box.className = 'status-box status-waiting';
  box.textContent = '← Кликните на карту чтобы выбрать место';
}

// ================================
// Отправка детали
// ================================

function submitDetail() {
  var title = document.getElementById('input-title').value.trim();
  var desc = document.getElementById('input-description').value.trim();
  var author = document.getElementById('input-author').value.trim();
  var cats = getSelectedCategories();

  if (!title) { showToast('Укажите название', 'error'); return; }
  if (!pendingCoords) { showToast('Кликните на карту, чтобы выбрать место', 'error'); return; }
  if (cats.length === 0) { showToast('Выберите хотя бы одну категорию', 'error'); return; }
  var cat = cats.join(',');
  var fileInput = document.getElementById('input-photo');

  if (!isAdmin && isReservedName(author)) { showToast('Это имя зарезервировано', 'error'); return; }

  var agreed = document.getElementById('input-agree').checked;
  if (!agreed) { showToast('Пожалуйста, подтвердите согласие с условиями', 'error'); return; }

  var btn = document.getElementById('submit-detail');
  btn.disabled = true;
  btn.textContent = 'Отправка...';

  function saveToDb(uploaded) {
    var row = {
      title: title,
      description: desc,
      category: cat,
      lat: pendingCoords.lat,
      lng: pendingCoords.lng,
      photo_url: (uploaded && uploaded.url) || '',
      thumb_url: (uploaded && uploaded.thumbUrl) || '',
      status: isAdmin ? 'approved' : 'pending',
      author: author || 'Аноним'
    };

    // Аноним отправляет точку на модерацию и ответа с ней не получает: читать
    // неодобренное ему нельзя. Свою точку он всё равно не увидел бы на карте.
    var request = isAdmin
      ? adminAction('create_detail', { row: row })
      : supaFetch('details', { method: 'POST', body: row, prefer: 'return=minimal' });

    request.then(data => {
      if (isAdmin && data && data[0]) details.push(mapDetailRow(data[0]));

      sendEmailNotification({
        title,
        author: author || 'Аноним',
        category: cat,
        lat: pendingCoords.lat,
        lng: pendingCoords.lng,
        description: desc
      });

      renderMarkers();
      closeAddForm();
      updateBadge();
      btn.disabled = false;
      btn.textContent = 'Отправить';

      if (!isAdmin) showToast('Спасибо! Деталь отправлена на модерацию.');
    }).catch(() => {
      showToast('Ошибка отправки. Попробуйте ещё раз.', 'error');
      btn.disabled = false;
      btn.textContent = 'Отправить';
    });
  }

  if (fileInput.files && fileInput.files[0]) {
    compressImage(fileInput.files[0], 1000, 0.5)
      .then(compressed => uploadPhoto(compressed))
      .then(uploaded => saveToDb(uploaded))
      .catch(err => {
        // Не сохраняем точку без фото молча — даём пользователю переотправить.
        console.error('Photo upload failed:', err);
        showToast('Не удалось загрузить фото. Попробуйте ещё раз или другое фото.', 'error');
        btn.disabled = false;
        btn.textContent = 'Отправить';
      });
  } else {
    saveToDb(null);
  }
}

// ================================
// Фильтры
// ================================

function setFilter(f) {
  activeFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === f);
  });
  renderMarkers();
}

// ================================
// Админка
// ================================

async function toggleAdmin() {
  if (isAdmin) {
    endAdminSession(false);
    try {
      await loadDetails();
    } catch (e) {
      showToast('Не удалось обновить данные', 'error');
    }
    renderMarkers();
    return;
  }

  var code = prompt('Код администратора:');
  if (code === null) return;

  try {
    var response = await fetch(ADMIN_LOGIN_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: code })
    });

    var rawText = await response.text();
    var data = {};

    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (err) {
      data = { message: rawText };
    }

    if (response.ok && data.success && data.token) {
      adminToken = data.token;
      try { sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token); } catch (e) { /* приватный режим */ }
      await enterAdminMode();
    } else {
      showToast(data.message || ('Неверный код или ошибка сервера (' + response.status + ')'), 'error');
    }
  } catch (e) {
    console.error('Admin login error:', e);
    showToast('Ошибка подключения к серверу', 'error');
  }
}

async function enterAdminMode() {
  isAdmin = true;
  document.body.classList.add('admin-mode');
  document.getElementById('admin-btn').classList.add('active');

  try {
    await loadAllForAdmin();
  } catch (e) {
    // токен не приняли — endAdminSession уже вызван внутри adminAction
    if (!isAdmin) return;
    endAdminSession(false);
    showToast('Не удалось загрузить данные админки', 'error');
    return;
  }

  renderMarkers();
  updateBadge();
  if (getPendingCount() > 0) openModPanel();
}

// Токен живёт в sessionStorage: перезагрузка страницы больше не выкидывает из
// админки, но и не оставляет вход открытым после закрытия вкладки.
function restoreAdminSession() {
  var saved = null;
  try { saved = sessionStorage.getItem(ADMIN_TOKEN_KEY); } catch (e) { saved = null; }
  if (!saved) return;

  adminToken = saved;
  enterAdminMode();
}

function openModPanel() {
  document.getElementById('mod-panel').classList.add('open');
  closeAddForm();
  closeDetail();
  renderModList();
}

function closeModPanel() {
  document.getElementById('mod-panel').classList.remove('open');
}

function renderModList() {
  var list = document.getElementById('mod-list');
  var pendingDetails = details.filter(d => d.status === 'pending');
  var exitBtnHtml = '<button onclick="toggleAdmin()" style="width:100%;margin-top:20px;padding:12px;background:none;border:1px solid #000;font-size:11px;cursor:pointer;font-family:\'IBM Plex Mono\', monospace;text-transform:uppercase;letter-spacing:0.05em;">Выйти из админки</button>';
  var html = '';

  if (pendingDetails.length > 0) {
    html += '<div class="mod-section-title">Точки (' + pendingDetails.length + ')</div>';
    pendingDetails.forEach(d => {
      var catLabels = (d.category || 'other').split(',').map(c => (CATEGORIES[c.trim()] || CATEGORIES.other).label);
      var cat = { label: catLabels.join(' · ') };
      html += '<div class="mod-card">';
      if (previewSrc(d)) html += '<img class="mod-card-photo" src="' + escapeHtml(previewSrc(d)) + '" alt="" loading="lazy">';
      html += '<h3>' + escapeHtml(d.title) + '</h3>';
      if (d.description) html += '<p>' + escapeHtml(d.description) + '</p>';
      html += '<div class="mod-card-cat">' + cat.label + ' · ' + escapeHtml(d.author || 'Аноним') + ' · ' + formatDate(d.created_at) + '</div>';
      html += '<div class="mod-card-actions"><button class="mod-btn-approve" onclick="approveDetail(\'' + d.id + '\')">✓ Одобрить</button><button class="mod-btn-reject" onclick="rejectDetail(\'' + d.id + '\')">✕ Отклонить</button></div></div>';
    });
  }

  if (pendingNotes.length > 0) {
    html += '<div class="mod-section-title">Описания (' + pendingNotes.length + ')</div>';
    pendingNotes.forEach(n => {
      var parentDetail = details.find(d => d.id === n.detail_id);
      var parentTitle = parentDetail ? parentDetail.title : 'Неизвестная точка';
      html += '<div class="mod-note-card">';
      html += '<div class="mod-note-text">' + escapeHtml(n.text) + '</div>';
      html += '<div class="mod-note-meta">К точке: ' + escapeHtml(parentTitle) + ' · ' + escapeHtml(n.author || 'Аноним') + ' · ' + formatDate(n.created_at) + '</div>';
      html += '<div class="mod-note-actions"><button class="mod-btn-approve" onclick="approveNote(\'' + n.id + '\')">✓ Одобрить</button><button class="mod-btn-reject" onclick="deleteNote(\'' + n.id + '\')">✕ Отклонить</button></div></div>';
    });
  }

  if (pendingPhotos.length > 0) {
    html += '<div class="mod-section-title">Фото (' + pendingPhotos.length + ')</div>';
    pendingPhotos.forEach(p => {
      var parentDetail = details.find(d => d.id === p.detail_id);
      var parentTitle = parentDetail ? parentDetail.title : 'Неизвестная точка';
      html += '<div class="mod-card">';
      html += '<img class="mod-card-photo" src="' + escapeHtml(p.thumb_url || p.photo_url) + '" alt="" loading="lazy">';
      html += '<div class="mod-card-cat">К точке: ' + escapeHtml(parentTitle) + ' · ' + escapeHtml(p.author || 'Аноним') + ' · ' + formatDate(p.created_at) + '</div>';
      html += '<div class="mod-card-actions"><button class="mod-btn-approve" onclick="approvePhoto(\'' + p.id + '\')">✓ Одобрить</button><button class="mod-btn-reject" onclick="deletePhoto(\'' + p.id + '\')">✕ Отклонить</button></div></div>';
    });
  }

  if (pendingDetails.length === 0 && pendingNotes.length === 0 && pendingPhotos.length === 0) {
    html = '<div class="mod-empty"><div class="mod-empty-icon">✓</div><p>Нет заявок</p></div>';
  }

  list.innerHTML = html + exitBtnHtml;
}

// ================================
// Инициализация событий
// ================================

function initEvents() {
  document.getElementById('close-panel').addEventListener('click', closeDetail);
  document.getElementById('share-detail').addEventListener('click', shareCurrentDetail);

  // «Назад» в браузере закрывает панель или возвращает к предыдущей точке.
  window.addEventListener('popstate', () => {
    var id = detailIdFromUrl();

    if (!id) {
      if (currentDetailId) closeDetail();
      return;
    }

    if (id === currentDetailId) return;
    var d = details.find(x => x.id === id);
    if (d) focusDetail(d);
  });

  document.getElementById('nav-prev').addEventListener('click', () => navigateDetail(-1));
  document.getElementById('nav-next').addEventListener('click', () => navigateDetail(1));
  document.getElementById('add-btn').addEventListener('click', openAddForm);
  document.getElementById('cancel-form').addEventListener('click', closeAddForm);
  document.getElementById('submit-detail').addEventListener('click', submitDetail);
  document.getElementById('btn-delete-detail').addEventListener('click', deleteDetail);
  document.getElementById('btn-approve-detail').addEventListener('click', () => { if (currentDetailId) approveDetail(currentDetailId); });
  document.getElementById('geo-float').addEventListener('click', geoLocate);

  document.getElementById('admin-btn').addEventListener('click', () => {
    if (isAdmin) {
      var p = document.getElementById('mod-panel');
      if (p.classList.contains('open')) closeModPanel();
      else openModPanel();
    } else {
      toggleAdmin();
    }
  });

  document.getElementById('mod-close').addEventListener('click', closeModPanel);

  document.getElementById('input-photo').addEventListener('change', function () {
    var f = this.files[0];
    if (f) {
      var r = new FileReader();
      r.onload = function (e) {
        document.getElementById('photo-preview').innerHTML = '<img src="' + e.target.result + '">';
      };
      r.readAsDataURL(f);
    }
  });

  document.querySelectorAll('.cat-check').forEach(label => {
    label.addEventListener('click', () => {
      var cb = label.querySelector('input');
      cb.checked = !cb.checked;
      label.classList.toggle('checked', cb.checked);
    });
  });

  document.querySelectorAll('.filter-btn').forEach(b => {
    b.addEventListener('click', () => setFilter(b.dataset.filter));
  });

  var searchInput = document.getElementById('search-input');
  var searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => doSearch(searchInput.value), 200);
  });

  document.getElementById('search-clear').addEventListener('click', clearSearch);

  document.addEventListener('click', e => {
    var bar = document.getElementById('search-bar');
    if (!bar.contains(e.target)) document.getElementById('search-results').classList.add('hidden');
  });

  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) doSearch(searchInput.value);
  });

  document.getElementById('btn-add-note').addEventListener('click', () => {
    var form = document.getElementById('note-form');
    form.classList.toggle('open');
    if (form.classList.contains('open')) {
      document.getElementById('note-text').focus();
    }
  });

  document.getElementById('note-submit').addEventListener('click', submitNote);

  document.getElementById('note-cancel').addEventListener('click', () => {
    document.getElementById('note-form').classList.remove('open');
    document.getElementById('note-text').value = '';
    document.getElementById('note-author').value = '';
  });

  // --- Фото-слайдер ---
  document.getElementById('photo-prev').addEventListener('click', () => photoSliderNav(-1));
  document.getElementById('photo-next').addEventListener('click', () => photoSliderNav(1));

  document.getElementById('btn-add-photo').addEventListener('click', () => {
    var form = document.getElementById('photo-form');
    form.classList.toggle('open');
    if (form.classList.contains('open')) document.getElementById('photo-input').focus();
  });

  document.getElementById('photo-submit').addEventListener('click', submitPhoto);
  document.getElementById('photo-cancel').addEventListener('click', resetPhotoForm);

  document.getElementById('photo-input').addEventListener('change', function () {
    var f = this.files[0];
    if (f) {
      var r = new FileReader();
      r.onload = function (e) {
        document.getElementById('photo-form-preview').innerHTML = '<img src="' + e.target.result + '">';
      };
      r.readAsDataURL(f);
    }
  });

  document.getElementById('photo-terms-link').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('terms-modal').classList.add('open');
  });

  // Свайп по фото на тач-устройствах.
  var slider = document.getElementById('photo-slider');
  var swipeX = null;
  slider.addEventListener('touchstart', e => { swipeX = e.changedTouches[0].clientX; }, { passive: true });
  slider.addEventListener('touchend', e => {
    if (swipeX === null) return;
    var dx = e.changedTouches[0].clientX - swipeX;
    if (Math.abs(dx) > 40) photoSliderNav(dx < 0 ? 1 : -1);
    swipeX = null;
  }, { passive: true });

  document.getElementById('terms-link').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('terms-modal').classList.add('open');
  });

  document.getElementById('terms-close').addEventListener('click', () => {
    document.getElementById('terms-modal').classList.remove('open');
  });

  document.getElementById('terms-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });

  document.addEventListener('keydown', e => {
    // пока открыт онбординг, клавиши обрабатывает он
    if (!document.getElementById('onboarding').classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      closeDetail();
      closeModPanel();
      if (isAddingMode) closeAddForm();
      clearSearch();
      document.getElementById('terms-modal').classList.remove('open');
    }
    if (e.key === 'ArrowLeft' && gallery.length > 0) navigateDetail(-1);
    if (e.key === 'ArrowRight' && gallery.length > 0) navigateDetail(1);
  });
}

// ================================
// PWA
// ================================

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(e => console.log('SW skip:', e));
}

// ================================
// Старт приложения и онбординг
// ================================

var mapReady = false;
var appStarted = false;
var ONBOARDING_DAYS = 7;
var onboardingSeen = localStorage.getItem('textula_onboarding');

// Строка поиска, фильтры и панель игры стоят под шапкой на fixed-позициях.
// Высота самой шапки не постоянна: на узком экране название переносится на
// вторую строку, и раньше строка поиска уезжала под неё. Держим фактическую
// высоту в переменной --header-h, чтобы всё под шапкой ехало следом.
function syncHeaderHeight() {
  var header = document.querySelector('.site-header');
  if (!header) return;

  var apply = function () {
    document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  };

  apply();

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(apply).observe(header);
  } else {
    window.addEventListener('resize', apply);
  }

  // шрифты подгружаются позже и меняют высоту строки
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(apply).catch(function () {});
}

function startApp() {
  if (appStarted) return;

  // Без Leaflet рисовать нечего: раньше в этом случае был просто белый экран.
  if (typeof L === 'undefined') {
    document.getElementById('loading').classList.add('hidden');
    showToast('Не удалось загрузить карту. Обновите страницу.', 'error');
    return;
  }

  appStarted = true;
  syncHeaderHeight();
  initMap();
  initEvents();
  initGuessElements();

  const loadingEl = document.getElementById('loading');

  // не финальная ошибка: данные могут догрузиться, поэтому только предупреждаем
  const loadingTimeout = setTimeout(() => {
    loadingEl.classList.add('hidden');
    showToast('Загрузка занимает дольше обычного…');
  }, 15000);

  loadDetails().then(() => {
    clearTimeout(loadingTimeout);
    renderMarkers();
    mapReady = true;
    loadingEl.classList.add('hidden');
    restoreAdminSession();
    openDetailFromUrl();
  }).catch(err => {
    clearTimeout(loadingTimeout);
    loadingEl.classList.add('hidden');
    showToast('Не удалось загрузить данные. Обновите страницу.', 'error');
    console.error(err);
  });
}

function dismissOnboarding() {
  var onb = document.getElementById('onboarding');
  if (onb.classList.contains('hidden')) return;
  localStorage.setItem('textula_onboarding', Date.now().toString());
  // при первом показе за онбордингом ещё нет приложения — показываем лоадер и стартуем
  if (!appStarted) document.getElementById('loading').classList.remove('hidden');
  onb.style.transition = 'opacity 0.5s ease';
  onb.style.opacity = '0';
  setTimeout(() => {
    onb.style.display = 'none';
    onb.classList.add('hidden');
    startApp();
  }, 500);
}

var onboardingStep = 1;

function goToOnboardingStep(step) {
  onboardingStep = step;
  for (var i = 1; i <= 3; i++) {
    document.getElementById('step-' + i).classList.toggle('active', i === step);
  }
}

// повторный показ онбординга по кнопке «?» — приложение при этом уже работает
function showOnboarding() {
  var onb = document.getElementById('onboarding');
  if (!onb.classList.contains('hidden')) return;

  goToOnboardingStep(1);
  document.getElementById('onboarding-close').classList.remove('hidden');
  initOnboardingLottie();

  onb.classList.remove('hidden');
  onb.style.display = 'flex';
  onb.style.opacity = '0';
  requestAnimationFrame(() => {
    onb.style.transition = 'opacity 0.4s ease';
    onb.style.opacity = '1';
  });
}

function initOnboarding() {
  var btnNext = document.getElementById('btn-next');
  var btnNext2 = document.getElementById('btn-next2');
  var btnFinish = document.getElementById('btn-finish');

  var onbTerms = document.getElementById('onb-terms-link');
  if (onbTerms) {
    onbTerms.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('terms-modal').classList.add('open');
    });
  }

  btnNext.addEventListener('click', () => goToOnboardingStep(2));
  btnNext2.addEventListener('click', () => goToOnboardingStep(3));

  btnFinish.addEventListener('click', dismissOnboarding);

  document.getElementById('onboarding-close').addEventListener('click', dismissOnboarding);

  document.addEventListener('keydown', function (e) {
    if (document.getElementById('onboarding').classList.contains('hidden')) return;
    // закрыть по Escape можно только при повторном показе: на первом нужно принять условия
    if (e.key === 'Escape') {
      if (appStarted) {
        e.preventDefault();
        dismissOnboarding();
      }
      return;
    }
    // Подсказка обещает «или нажмите любую клавишу» — значит, листаем по любой
    // осмысленной: буквы, цифры, знаки (у них key длиной 1), Enter, пробел и
    // стрелки. Tab оставляем навигации по фокусу, модификаторы и сочетания вроде
    // Cmd+R не трогаем, F1–F12 тоже.
    var navKeys = ['Enter', ' ', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Backspace'];
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.length !== 1 && navKeys.indexOf(e.key) === -1) return;

    // пока открыты «условия», клавиши относятся к модалке, а не к онбордингу
    if (document.getElementById('terms-modal').classList.contains('open')) return;

    e.preventDefault();

    // стрелками влево/вверх листаем назад, на первом шаге дальше некуда
    if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].indexOf(e.key) !== -1) {
      if (onboardingStep > 1) goToOnboardingStep(onboardingStep - 1);
      return;
    }

    if (onboardingStep === 1) btnNext.click();
    else if (onboardingStep === 2) btnNext2.click();
    else dismissOnboarding();
  });
}

var lottieAnim = null;

function initOnboardingLottie() {
  if (lottieAnim) return; // анимация зациклена сама по себе, второй раз грузить не нужно

  lottieAnim = lottie.loadAnimation({
    container: document.getElementById('lottie-container'),
    renderer: 'svg',
    loop: false,
    autoplay: false,
    path: 'textula.json'
  });

  var lottieDirection = 1;
  lottieAnim.addEventListener('complete', () => {
    setTimeout(() => {
      lottieDirection *= -1;
      lottieAnim.setDirection(lottieDirection);
      lottieAnim.play();
    }, 3000);
  });

  lottieAnim.addEventListener('DOMLoaded', () => {
    setTimeout(() => {
      lottieAnim.play();
    }, 3000);
  });
}

initOnboarding();
document.getElementById('help-btn').addEventListener('click', showOnboarding);

if (onboardingSeen && (Date.now() - parseInt(onboardingSeen, 10)) < ONBOARDING_DAYS * 24 * 60 * 60 * 1000) {
  document.getElementById('onboarding').style.display = 'none';
  document.getElementById('onboarding').classList.add('hidden');
  document.getElementById('loading').classList.remove('hidden');
  startApp();
} else {
  initOnboardingLottie();
}

// ================================
// Игровой режим
// ================================

function haversineDistance(lat1, lng1, lat2, lng2) {
  var R = 6371e3;
  var toRad = Math.PI / 180;
  var φ1 = lat1 * toRad, φ2 = lat2 * toRad;
  var Δφ = (lat2 - lat1) * toRad;
  var Δλ = (lng2 - lng1) * toRad;

  var a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function initGuessElements() {
  guessBtn = document.getElementById('toggle-guess-mode');
  guessPanel = document.getElementById('guess-mode');
  guessImage = document.getElementById('guess-image');
  guessCurrentEl = document.getElementById('guess-current');
  guessScoreEl = document.getElementById('guess-score');
  guessNextBtn = document.getElementById('guess-next-btn');
  guessExitBtn = document.getElementById('guess-exit-btn');
  guessResult = document.getElementById('guess-result');

  if (!guessPanel || !guessImage || !guessCurrentEl || !guessScoreEl || !guessNextBtn || !guessExitBtn || !guessResult || !guessBtn) return;

  // Таймер уже есть в разметке, в строке со счётом. Раньше рядом создавался
  // второй такой же div с тем же id — на экране висели два «Время: 60 с»,
  // причём верхнее навсегда застывало на 60.
  guessTimerEl = document.getElementById('guess-timer');

  // число раундов живёт в одном месте — в guessTotalRounds
  var totalEl = document.getElementById('guess-total');
  if (totalEl) totalEl.textContent = guessTotalRounds;

  guessBtn.addEventListener('click', () => {
    if (guessModeActive) {
      if (confirm('Выйти из игрового режима?')) {
        endGuessMode();
      }
    } else {
      startGuessMode();
    }
  });

  guessExitBtn.addEventListener('click', () => {
    if (confirm('Выйти из игрового режима?')) {
      endGuessMode();
    }
  });

  guessNextBtn.addEventListener('click', () => {
    guessCurrentIndex++;

    if (guessCurrentIndex >= guessTotalRounds) {
      finishGuessGame();
      return;
    }

    renderCurrentGuess();
  });

  updateGuessTimerUI();
}

function guessStepFor(distance) {
  for (var i = 0; i < GUESS_SCORE_STEPS.length; i++) {
    if (distance <= GUESS_SCORE_STEPS[i].maxDistance) return GUESS_SCORE_STEPS[i];
  }
  return GUESS_SCORE_STEPS[GUESS_SCORE_STEPS.length - 1];
}

function guessSpeedFor(seconds) {
  for (var i = 0; i < GUESS_SPEED_BONUSES.length; i++) {
    if (seconds <= GUESS_SPEED_BONUSES[i].maxSeconds) return GUESS_SPEED_BONUSES[i];
  }
  return GUESS_SPEED_BONUSES[GUESS_SPEED_BONUSES.length - 1];
}

// Идеальная игра: точное попадание и самый быстрый ответ в каждом раунде.
function guessMaxScore() {
  return guessTotalRounds * Math.round(GUESS_SCORE_STEPS[0].points * GUESS_SPEED_BONUSES[0].multiplier);
}

function formatMultiplier(value) {
  return String(value).replace('.', ',');
}

function guessEndingFor(score) {
  var share = guessMaxScore() > 0 ? score / guessMaxScore() : 0;
  for (var i = 0; i < GUESS_ENDINGS.length; i++) {
    if (share >= GUESS_ENDINGS[i].minShare) return GUESS_ENDINGS[i].text;
  }
  return GUESS_ENDINGS[GUESS_ENDINGS.length - 1].text;
}

function formatDistance(meters) {
  if (meters >= 1000) return (meters / 1000).toFixed(1).replace('.', ',') + ' км';
  return Math.round(meters) + ' м';
}

// Сколько пикселей карты закрыто интерфейсом с каждой стороны: сверху шапка,
// панель игры — справа на широком экране и снизу на узком.
function mapVisibleInsets() {
  var insets = { top: 0, right: 0, bottom: 0 };
  if (!map) return insets;

  var header = document.querySelector('.site-header');
  if (header) insets.top = header.offsetHeight;

  // Панель приезжает через transform, и сразу после показа её реальный
  // прямоугольник ещё за краем экрана — обзор тогда строился как будто панели
  // нет, и часть точек оказывалась под ней. Размеры из раскладки от анимации
  // не зависят, а прижата панель всегда к правому краю или к нижнему.
  if (guessPanel && !guessPanel.classList.contains('hidden')) {
    var size = map.getSize();

    if (guessPanel.offsetWidth < size.x - 1) insets.right = Math.min(guessPanel.offsetWidth, size.x);
    else insets.bottom = Math.min(guessPanel.offsetHeight, size.y);
  }

  return insets;
}

function startGuessTimer() {
  clearGuessTimer();
  guessTimeLeft = GUESS_ROUND_SECONDS;
  updateGuessTimerUI();

  guessTimer = setInterval(() => {
    guessTimeLeft--;
    updateGuessTimerUI();

    if (guessTimeLeft <= 0) {
      clearGuessTimer();
      guessResult.innerHTML = '<em>Время вышло! Нажмите «Следующая».</em>';
      guessNextBtn.disabled = false;
    }
  }, 1000);
}

function updateGuessTimerUI() {
  if (guessTimerEl) {
    guessTimerEl.textContent = 'Время: ' + guessTimeLeft + ' с';
    guessTimerEl.style.color = guessTimeLeft <= 5 ? '#b00020' : '#000';
  }
}

function clearGuessTimer() {
  if (guessTimer) {
    clearInterval(guessTimer);
    guessTimer = null;
  }
}

// Счёт красится от красного к зелёному по мере приближения к идеальной игре.
function guessScoreColor(score) {
  var share = guessMaxScore() > 0 ? Math.min(score / guessMaxScore(), 1) : 0;
  return 'hsl(' + Math.round(share * 120) + ', 80%, 45%)';
}

// Размер задан в стилях — на телефоне он меньше; отсюда только цвет.
function updateScoreUI() {
  guessScoreEl.textContent = guessScore;
  guessScoreEl.style.color = guessScoreColor(guessScore);
}

function getGuessStats() {
  try {
    var stats = JSON.parse(localStorage.getItem('guessStats'));
    if (stats && typeof stats.games === 'number' && typeof stats.totalScore === 'number') return stats;
  } catch (e) { /* битые данные — начинаем заново */ }
  return { games: 0, totalScore: 0 };
}

function saveGuessStats(score) {
  var obj = getGuessStats();
  obj.games++;
  obj.totalScore += score;
  try {
    localStorage.setItem('guessStats', JSON.stringify(obj));
  } catch (e) { /* приватный режим — статистика не сохранится */ }
}

function shareGuessResult() {
  var obj = getGuessStats();
  var avgScore = obj.games > 0 ? (obj.totalScore / obj.games).toFixed(0) : '—';

  var shareText = `Я набрал ${guessScore} из ${guessMaxScore()} очков в игре "Угадай локацию" на textula. ${guessEndingFor(guessScore)} Средний результат: ${avgScore}. Попробуй сам: https://textula.ru`;

  if (navigator.share) {
    navigator.share({
      title: 'textula — игра "Угадай локацию"',
      text: shareText,
      url: 'https://textula.ru'
    }).catch(() => { /* пользователь отменил шаринг */ });
  } else {
    navigator.clipboard.writeText(shareText).then(() => {
      showToast('Результат скопирован в буфер обмена');
    }).catch(() => {
      showToast('Ваш браузер не поддерживает шаринг', 'error');
    });
  }
}

function startGuessMode() {
  // Только находки в пределах города: одна точка из другого города растягивала
  // обзор раунда на пол-страны, а угадать её на городской карте невозможно.
  var pool = details.filter(function (d) {
    if (d.status !== 'approved' || !d.photo) return false;
    return haversineDistance(d.lat, d.lng, MAP_CENTER[0], MAP_CENTER[1]) <= GUESS_MAX_DISTANCE_M;
  });

  if (pool.length < guessTotalRounds) {
    showToast('Недостаточно точек с фото для игры', 'error');
    return;
  }

  guessModeActive = true;
  guessScore = 0;
  guessCurrentIndex = 0;
  updateScoreUI();

  pool.sort(() => Math.random() - 0.5);
  guessPoints = pool.slice(0, guessTotalRounds);

  guessPanel.classList.remove('hidden');
  document.body.classList.add('guess-mode');
  resetGuessFinalScreen();

  document.getElementById('detail-panel').classList.add('hidden');
  document.getElementById('add-panel').classList.remove('open');
  document.getElementById('search-bar').classList.add('hidden');
  document.querySelector('.filters-bar').classList.add('hidden');
  document.getElementById('add-btn').style.display = 'none';
  document.getElementById('geo-float').style.display = 'none';

  if (clusterGroup) map.removeLayer(clusterGroup);
  markerObjects.forEach(obj => map.removeLayer(obj.marker));
  markerObjects = [];

  guessMarkers.forEach(m => map.removeLayer(m));
  guessMarkers = [];
  if (guessCorrectMarker) {
    map.removeLayer(guessCorrectMarker);
    guessCorrectMarker = null;
  }

  renderCurrentGuess();
  map.on('click', onMapGuessClick);

  guessNextBtn.disabled = true;
  guessResult.textContent = '';
  startGuessTimer();
}

function endGuessMode() {
  guessModeActive = false;
  guessPoints = [];
  guessCurrentIndex = 0;

  guessPanel.classList.add('hidden');
  document.body.classList.remove('guess-mode');
  resetGuessFinalScreen();

  document.getElementById('search-bar').classList.remove('hidden');
  document.querySelector('.filters-bar').classList.remove('hidden');
  document.getElementById('add-btn').style.display = '';
  document.getElementById('geo-float').style.display = '';

  renderMarkers();

  guessMarkers.forEach(m => map.removeLayer(m));
  guessMarkers = [];
  if (guessCorrectMarker) {
    map.removeLayer(guessCorrectMarker);
    guessCorrectMarker = null;
  }

  clearGuessTimer();
  map.off('click', onMapGuessClick);

  // не оставляем висеть ожидание фото последнего раунда
  nextPhotoToken(guessImage);
  guessImage.removeAttribute('src');
  document.getElementById('guess-image-container').classList.remove('photo-loading', 'photo-failed');
}

function renderCurrentGuess() {
  var point = guessPoints[guessCurrentIndex];
  showPhoto(document.getElementById('guess-image-container'), guessImage, point.photo);
  guessCurrentEl.textContent = (guessCurrentIndex + 1);
  guessResult.textContent = '';
  guessNextBtn.disabled = true;

  if (guessCorrectMarker) {
    map.removeLayer(guessCorrectMarker);
    guessCorrectMarker = null;
  }

  guessMarkers.forEach(m => map.removeLayer(m));
  guessMarkers = [];

  // Обзор показываем только в начале игры: дальше карта остаётся там, куда её
  // увёл игрок. Отдалять на каждом раунде — значит каждый раз заново
  // возвращаться в свой угол города.
  //
  // Показываем именно обзор всех точек, а не загаданную, иначе ответ виден
  // сразу. Часть карты закрыта: сверху шапкой, а панелью игры — справа на
  // широком экране или снизу на узком; отдаём это в отступы, чтобы обзор
  // целиком попал в видимую часть.
  if (guessCurrentIndex === 0) {
    var bounds = L.latLngBounds(guessPoints.map(p => [p.lat, p.lng]));
    var insets = mapVisibleInsets();

    map.flyToBounds(bounds, {
      paddingTopLeft: [40, insets.top + 40],
      paddingBottomRight: [insets.right + 40, insets.bottom + 40],
      maxZoom: 16,
      duration: 1
    });
  }
  startGuessTimer();
}

function processGuessClick(latlng) {
  if (!guessModeActive) return;
  if (!guessNextBtn.disabled) return;

  var point = guessPoints[guessCurrentIndex];
  var dist = haversineDistance(latlng.lat, latlng.lng, point.lat, point.lng);

  var step = guessStepFor(dist);
  var speed = guessSpeedFor(GUESS_ROUND_SECONDS - guessTimeLeft);
  var pointsEarned = Math.round(step.points * speed.multiplier);

  guessScore += pointsEarned;
  updateScoreUI();

  guessResult.innerHTML = '<strong>' + step.label + '</strong> +' + pointsEarned + ' очк.' +
    (speed.multiplier > 1 ? ' <span style="color:#666;">×' + formatMultiplier(speed.multiplier) + ' ' + speed.label + '</span>' : '') +
    ' · промах ' + formatDistance(dist);
  clearGuessTimer();

  guessCorrectMarker = L.marker([point.lat, point.lng], {
    icon: L.divIcon({
      html: '<div style="width:22px;height:22px;border:4px solid limegreen;border-radius:50%;background:rgba(0,255,0,0.3);"></div>',
      className: '',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    })
  }).addTo(map);

  var guessMarker = L.marker(latlng, {
    icon: L.divIcon({
      html: '<div style="width:22px;height:22px;border:4px solid red;border-radius:50%;background:rgba(255,0,0,0.3);"></div>',
      className: '',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    })
  }).addTo(map);

  guessMarkers.push(guessMarker);
  guessNextBtn.disabled = false;
}

function onMapGuessClick(e) {
  processGuessClick(e.latlng);
}

// Показать итог вместо фотографии. Прячем и строку раунда с таймером, и
// «Следующую» — раундов больше нет.
function showGuessFinalScreen(score, avgScore, games) {
  var container = document.getElementById('guess-image-container');
  var final = document.getElementById('guess-final');
  var stats = document.querySelector('.guess-stats');
  var value = document.getElementById('guess-final-value');

  if (!container || !final || !value) return;

  value.textContent = score;
  value.style.color = guessScoreColor(score);
  document.getElementById('guess-final-max').textContent = guessMaxScore();
  document.getElementById('guess-final-phrase').textContent = guessEndingFor(score);
  document.getElementById('guess-final-stats').textContent =
    'Средний счёт: ' + avgScore + ' · Игр сыграно: ' + games;

  container.classList.add('finished');
  final.classList.remove('hidden');
  if (stats) stats.classList.add('hidden');
  guessNextBtn.classList.add('hidden');

  // Кнопки раунда убираем целиком: свои кнопки итог рисует сам, ниже карточки.
  var actions = document.querySelector('.guess-actions');
  if (actions) actions.classList.add('hidden');
}

// Вернуть панель к обычному раунду: перед новой игрой и при выходе.
function resetGuessFinalScreen() {
  var container = document.getElementById('guess-image-container');
  var final = document.getElementById('guess-final');
  var stats = document.querySelector('.guess-stats');

  var actions = document.querySelector('.guess-actions');

  if (container) container.classList.remove('finished');
  if (final) final.classList.add('hidden');
  if (stats) stats.classList.remove('hidden');
  if (actions) actions.classList.remove('hidden');
  if (guessNextBtn) guessNextBtn.classList.remove('hidden');
}

function finishGuessGame() {
  clearGuessTimer();
  saveGuessStats(guessScore);

  var obj = getGuessStats();
  var avgScore = obj.games > 0 ? Math.round(obj.totalScore / obj.games) : 0;

  // Итог встаёт на место фотографии: снимок последнего раунда там уже ни к
  // чему, а счёт и фраза — то, ради чего играли.
  showGuessFinalScreen(guessScore, avgScore, obj.games);

  guessResult.innerHTML = `
    <div class="guess-actions">
      <button id="guess-restart-btn" class="guess-btn guess-btn-dark">Сыграть снова</button>
      <button id="guess-share-btn" class="guess-btn guess-btn-light">Поделиться</button>
      <button id="guess-final-exit-btn" class="guess-btn guess-btn-light">Выйти</button>
    </div>
  `;

  guessNextBtn.disabled = true;

  setTimeout(() => {
    var restartBtn = document.getElementById('guess-restart-btn');
    var shareBtn = document.getElementById('guess-share-btn');
    var exitBtn = document.getElementById('guess-final-exit-btn');

    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        startGuessMode();
      });
    }

    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        shareGuessResult();
      });
    }

    // Игра уже закончена — спрашивать «точно выйти?» не о чем
    if (exitBtn) {
      exitBtn.addEventListener('click', () => {
        endGuessMode();
      });
    }
  }, 0);
}

// ================================
// Одобрение / удаление деталей
// ================================

function approveDetail(id) {
  if (!id) id = currentDetailId;
  if (!id) return;

  adminAction('approve_detail', { id: id }).then(() => {
    var d = details.find(x => x.id === id);
    if (d) d.status = 'approved';
    updateBadge();
    renderMarkers();
    renderModList();
    if (id === currentDetailId) showGalleryItem(galleryIndex);
  }).catch(adminError('Не удалось одобрить деталь'));
}

function rejectDetail(id) {
  if (!id) id = currentDetailId;
  if (!id) return;
  if (!confirm('Отклонить и удалить деталь?')) return;

  // Сервер заодно удалит описания, фото и файлы этой точки.
  adminAction('delete_detail', { id: id }).then(() => {
    details = details.filter(d => d.id !== id);
    updateBadge();
    renderMarkers();
    renderModList();
    closeDetail();
  }).catch(adminError('Не удалось удалить деталь'));
}

function deleteDetail() {
  if (!currentDetailId) return;
  if (!confirm('Удалить деталь?')) return;
  rejectDetail(currentDetailId);
}