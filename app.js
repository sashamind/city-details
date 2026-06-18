// ================================
// Константы и глобальные переменные
// ================================

var SUPABASE_URL = 'https://yzvigrtnwmkwkpmqmdzh.supabase.co';
var SUPABASE_KEY = 'sb_publishable__AIRJSDqAYUK_vxwYhXmRA_4-QzSKkR'; // поменяй на актуальный, если нужно
var ADMIN_LOGIN_FUNCTION_URL = SUPABASE_URL + '/functions/v1/admin-login';

var isAdmin = false;

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
var guessTotalRounds = 5;
var guessScore = 0;
var guessMarkers = [];
var guessCorrectMarker = null;
var guessTimer = null;
var guessTimeLeft = 60;

var guessBtn = null;
var guessPanel = null;
var guessImage = null;
var guessCurrentEl = null;
var guessScoreEl = null;
var guessNextBtn = null;
var guessExitBtn = null;
var guessResult = null;
var guessCenterBtn = null;
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

function createMarkerIcon(detail) {
  const hasPhoto = detail.photo && detail.photo.trim() !== '';

  if (hasPhoto) {
    const imgHtml = `<img src="${escapeHtml(detail.photo)}" alt="" style="width:20px; height:20px; border-radius:4px;" />`;
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

function mapDetailRow(d) {
  return {
    id: d.id,
    title: d.title || '',
    description: d.description || '',
    category: d.category,
    lat: d.lat,
    lng: d.lng,
    photo: d.photo_url || '',
    status: d.status,
    author: d.author || '',
    created_at: d.created_at || ''
  };
}

function loadDetails() {
  var query = isAdmin
    ? 'details?select=*&order=created_at.desc'
    : 'details?select=*&status=eq.approved&order=created_at.desc';

  return supaFetch(query).then(function (data) {
    if (Array.isArray(data)) details = data.map(mapDetailRow);
    updateBadge();
  });
}

function loadAllForAdmin() {
  return supaFetch('details?select=*&order=created_at.desc').then(function (data) {
    if (Array.isArray(data)) details = data.map(mapDetailRow);
    updateBadge();
  });
}

function loadNotes(detailId) {
  var query = isAdmin
    ? 'notes?detail_id=eq.' + detailId + '&order=created_at.asc'
    : 'notes?detail_id=eq.' + detailId + '&status=eq.approved&order=created_at.asc';

  return supaFetch(query).then(data => {
    currentNotes = Array.isArray(data) ? data : [];
    renderNotes();
  }).catch(() => {
    currentNotes = [];
    renderNotes();
  });
}

function loadPendingNotes() {
  return supaFetch('notes?status=eq.pending&order=created_at.asc').then(data => {
    pendingNotes = Array.isArray(data) ? data : [];
  }).catch(() => {
    pendingNotes = [];
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

function uploadPhoto(file) {
  var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '') || 'photo.jpg';
  var fileName = Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '_' + safeName;
  // На некоторых мобильных file.type пустой — без явного типа загрузка падает.
  var contentType = file.type || 'image/jpeg';

  return fetch(SUPABASE_URL + '/storage/v1/object/photos/' + fileName, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': contentType
    },
    body: file
  }).then(async function (r) {
    if (r.ok) return SUPABASE_URL + '/storage/v1/object/public/photos/' + fileName;
    var errText = await r.text().catch(function () { return ''; });
    throw new Error('Upload ' + r.status + ': ' + errText.slice(0, 200));
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
    Promise.all([loadPendingNotes(), loadPendingPhotos()]).then(() => {
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
    var count = details.filter(d => d.status === 'pending').length;
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
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

  supaFetch('notes', { method: 'POST', body: row }).then(data => {
    if (data && data[0]) currentNotes.push(data[0]);
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
  supaFetch('notes?id=eq.' + id, { method: 'PATCH', body: { status: 'approved' } }).then(() => {
    var n = currentNotes.find(x => x.id === id);
    if (n) n.status = 'approved';
    pendingNotes = pendingNotes.filter(x => x.id !== id);
    renderNotes();
    updateBadge();
    renderModList();
  }).catch(() => showToast('Не удалось одобрить описание', 'error'));
}

function deleteNote(id) {
  if (!confirm('Удалить описание?')) return;
  supaFetch('notes?id=eq.' + id, { method: 'DELETE', prefer: 'return=minimal' }).then(() => {
    currentNotes = currentNotes.filter(n => n.id !== id);
    pendingNotes = pendingNotes.filter(n => n.id !== id);
    renderNotes();
    updateBadge();
    renderModList();
  }).catch(() => showToast('Не удалось удалить описание', 'error'));
}

// ================================
// Фото-слайдер (хронология)
// ================================

function comparePhotos(a, b) {
  if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
  return new Date(a.created_at || 0) - new Date(b.created_at || 0);
}

function loadPhotos(detailId, focusId) {
  var base = 'photos?detail_id=eq.' + encodeURIComponent(detailId);
  var query = isAdmin
    ? base + '&order=sort_order.asc,created_at.asc'
    : base + '&status=eq.approved&order=sort_order.asc,created_at.asc';

  return supaFetch(query).then(data => {
    currentPhotos = Array.isArray(data) ? data : [];
    rebuildSlides(focusId);
  }).catch(() => {
    currentPhotos = [];
    rebuildSlides(focusId);
  });
}

function loadPendingPhotos() {
  return supaFetch('photos?status=eq.pending&order=created_at.asc').then(data => {
    pendingPhotos = Array.isArray(data) ? data : [];
  }).catch(() => {
    pendingPhotos = [];
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
    img.style.display = 'none';
    img.src = '';
    counter.textContent = '';
    caption.innerHTML = '';
    bar.innerHTML = '';
    sliderEl.classList.remove('has-many');
    return;
  }

  var s = photoSlides[photoIndex];
  img.style.display = '';
  img.src = s.url;
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
    .then(url => supaFetch('photos', {
      method: 'POST',
      body: {
        detail_id: detailId,
        photo_url: url,
        author: author,
        status: isAdmin ? 'approved' : 'pending',
        sort_order: nextOrder
      }
    }))
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
  supaFetch('photos?id=eq.' + id, { method: 'PATCH', body: { status: 'approved' } }).then(() => {
    pendingPhotos = pendingPhotos.filter(p => p.id !== id);
    var p = currentPhotos.find(x => x.id === id);
    if (p) p.status = 'approved';
    rebuildSlides(id);
    updateBadge();
    renderModList();
  }).catch(() => showToast('Не удалось одобрить фото', 'error'));
}

function deletePhoto(id) {
  if (!confirm('Удалить фото?')) return;
  supaFetch('photos?id=eq.' + id, { method: 'DELETE', prefer: 'return=minimal' }).then(() => {
    pendingPhotos = pendingPhotos.filter(p => p.id !== id);
    currentPhotos = currentPhotos.filter(p => p.id !== id);
    rebuildSlides();
    updateBadge();
    renderModList();
  }).catch(() => showToast('Не удалось удалить фото', 'error'));
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

  Promise.all(changed.map(p =>
    supaFetch('photos?id=eq.' + p.id, { method: 'PATCH', body: { sort_order: p.sort_order }, prefer: 'return=minimal' })
  )).catch(() => {
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
  if (detail.photo) html += '<img src="' + escapeHtml(detail.photo) + '" alt="">';
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
    if (d.photo) html += '<img class="search-result-photo" src="' + escapeHtml(d.photo) + '" alt="">';
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
        map.flyTo([d.lat, d.lng], 17, { duration: 0.8 });
        setTimeout(() => openDetail(d), 900);
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
  gallery = buildGallery();
  galleryIndex = 0;

  for (var i = 0; i < gallery.length; i++) {
    if (gallery[i].id === d.id) {
      galleryIndex = i;
      break;
    }
  }

  showGalleryItem(galleryIndex);
  document.getElementById('detail-panel').classList.remove('hidden');
  document.getElementById('add-btn').style.display = 'none';
  document.getElementById('geo-float').style.display = 'none';
}

function closeDetail() {
  document.getElementById('detail-panel').classList.add('hidden');
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

  function saveToDb(photoUrl) {
    var row = {
      title: title,
      description: desc,
      category: cat,
      lat: pendingCoords.lat,
      lng: pendingCoords.lng,
      photo_url: photoUrl || '',
      status: isAdmin ? 'approved' : 'pending',
      author: author || 'Аноним'
    };

    supaFetch('details', { method: 'POST', body: row }).then(data => {
      if (data && data[0]) {
        var d = data[0];
        details.push({
          id: d.id,
          title: d.title,
          description: d.description || '',
          category: d.category,
          lat: d.lat,
          lng: d.lng,
          photo: d.photo_url || '',
          status: d.status,
          author: d.author || '',
          created_at: d.created_at || ''
        });
      }

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
      .then(url => saveToDb(url))
      .catch(err => {
        // Не сохраняем точку без фото молча — даём пользователю переотправить.
        console.error('Photo upload failed:', err);
        showToast('Не удалось загрузить фото. Попробуйте ещё раз или другое фото.', 'error');
        btn.disabled = false;
        btn.textContent = 'Отправить';
      });
  } else {
    saveToDb('');
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
    isAdmin = false;
    document.body.classList.remove('admin-mode');
    document.getElementById('admin-btn').classList.remove('active');
    closeModPanel();
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

    if (response.ok && data.success) {
      isAdmin = true;
      document.body.classList.add('admin-mode');
      document.getElementById('admin-btn').classList.add('active');
      await loadAllForAdmin();
      renderMarkers();
      updateBadge();
      if (getPendingCount() > 0) openModPanel();
    } else {
      showToast(data.message || ('Неверный код или ошибка сервера (' + response.status + ')'), 'error');
    }
  } catch (e) {
    console.error('Admin login error:', e);
    showToast('Ошибка подключения к серверу', 'error');
  }
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
      if (d.photo) html += '<img class="mod-card-photo" src="' + escapeHtml(d.photo) + '" alt="">';
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
      html += '<img class="mod-card-photo" src="' + escapeHtml(p.photo_url) + '" alt="">';
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
var ONBOARDING_DAYS = 7;
var onboardingSeen = localStorage.getItem('textula_onboarding');

function startApp() {
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
  document.getElementById('loading').classList.remove('hidden');
  onb.style.transition = 'opacity 0.5s ease';
  onb.style.opacity = '0';
  setTimeout(() => {
    onb.style.display = 'none';
    onb.classList.add('hidden');
    startApp();
  }, 500);
}

function initOnboarding() {
  var step1 = document.getElementById('step-1');
  var step2 = document.getElementById('step-2');
  var step3 = document.getElementById('step-3');
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

  btnNext.addEventListener('click', () => {
    step1.style.display = 'none';
    step2.style.display = 'block';
    setTimeout(() => { step2.style.opacity = '1'; }, 50);
  });

  btnNext2.addEventListener('click', () => {
    step2.style.display = 'none';
    step3.style.display = 'block';
    setTimeout(() => { step3.style.opacity = '1'; }, 50);
  });

  btnFinish.addEventListener('click', dismissOnboarding);

  document.addEventListener('keydown', function handler(e) {
    if (document.getElementById('onboarding').classList.contains('hidden')) {
      document.removeEventListener('keydown', handler);
      return;
    }
    // листаем шаги только по Enter/пробелу, чтобы Escape и Tab не закрывали онбординг
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (step1.style.display !== 'none') btnNext.click();
    else if (step2.style.display !== 'none') btnNext2.click();
    else {
      dismissOnboarding();
      document.removeEventListener('keydown', handler);
    }
  });
}

if (onboardingSeen && (Date.now() - parseInt(onboardingSeen, 10)) < ONBOARDING_DAYS * 24 * 60 * 60 * 1000) {
  document.getElementById('onboarding').style.display = 'none';
  document.getElementById('onboarding').classList.add('hidden');
  document.getElementById('loading').classList.remove('hidden');
  startApp();
} else {
  var lottieAnim = lottie.loadAnimation({
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

  initOnboarding();
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
  guessCenterBtn = document.getElementById('guess-guess-center-btn');

  if (!guessPanel || !guessImage || !guessCurrentEl || !guessScoreEl || !guessNextBtn || !guessExitBtn || !guessResult || !guessBtn) return;

  if (!guessTimerEl) {
    guessTimerEl = document.createElement('div');
    guessTimerEl.id = 'guess-timer';
    guessTimerEl.style.textAlign = 'center';
    guessTimerEl.style.fontFamily = "'IBM Plex Mono', monospace";
    guessTimerEl.style.fontSize = '14px';
    guessTimerEl.style.margin = '10px 0 14px';
    guessTimerEl.style.fontWeight = '600';

    var container = document.getElementById('guess-mode');
    if (container) {
      container.insertBefore(guessTimerEl, guessResult);
    }
  }

  if (guessCenterBtn) {
    guessCenterBtn.style.display = 'block';
  }

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

  if (guessCenterBtn) {
    guessCenterBtn.addEventListener('click', () => {
      if (!guessModeActive) return;
      processGuessClick(map.getCenter());
    });
  }

  updateGuessTimerUI();
}

function startGuessTimer() {
  clearGuessTimer();
  guessTimeLeft = 60;
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

function updateScoreUI() {
  guessScoreEl.textContent = guessScore;
  var percent = Math.min(guessScore / (guessTotalRounds * 150), 1);
  var color = 'hsl(' + Math.round(percent * 120) + ', 80%, 45%)';
  guessScoreEl.style.color = color;
  guessScoreEl.style.fontWeight = '700';
  guessScoreEl.style.fontSize = '18px';
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

  var shareText = `Я набрал ${guessScore} очков в игре "Угадай локацию" на textula. Средний результат: ${avgScore}. Попробуй сам: https://textula.ru`;

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
  var pool = details.filter(d => d.status === 'approved' && d.photo);
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
}

function renderCurrentGuess() {
  var point = guessPoints[guessCurrentIndex];
  guessImage.src = point.photo;
  guessCurrentEl.textContent = (guessCurrentIndex + 1);
  guessResult.textContent = '';
  guessNextBtn.disabled = true;

  if (guessCorrectMarker) {
    map.removeLayer(guessCorrectMarker);
    guessCorrectMarker = null;
  }

  guessMarkers.forEach(m => map.removeLayer(m));
  guessMarkers = [];

  // показываем обзор всех точек игры, а не загаданную — иначе ответ виден сразу
  var bounds = L.latLngBounds(guessPoints.map(p => [p.lat, p.lng]));
  map.flyToBounds(bounds, { padding: [60, 60], duration: 1 });
  startGuessTimer();
}

function processGuessClick(latlng) {
  if (!guessModeActive) return;
  if (!guessNextBtn.disabled) return;

  var point = guessPoints[guessCurrentIndex];
  var dist = haversineDistance(latlng.lat, latlng.lng, point.lat, point.lng);

  var pointsEarned = 0;
  if (dist <= 50) pointsEarned = 150;
  else if (dist <= 150) pointsEarned = 100;
  else if (dist <= 500) pointsEarned = 75;
  else if (dist <= 1000) pointsEarned = 50;
  else pointsEarned = 25;

  guessScore += pointsEarned;
  updateScoreUI();

  guessResult.innerHTML = 'Вы набрали <strong>' + pointsEarned + '</strong> очков! Расстояние: ' + dist.toFixed(0) + ' м';
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

function finishGuessGame() {
  clearGuessTimer();
  saveGuessStats(guessScore);

  var obj = getGuessStats();
  var avgScore = obj.games > 0 ? Math.round(obj.totalScore / obj.games) : 0;

  guessResult.innerHTML = `
    <div style="text-align:center; padding: 10px 0;">
      <div style="font-size:18px; font-weight:700; margin-bottom:8px;">Игра окончена!</div>
      <div style="margin-bottom:12px;">Ваш итоговый счёт: <strong>${guessScore}</strong></div>
      <div style="margin-bottom:18px; color:#666;">Средний счёт: ${avgScore} · Игр сыграно: ${obj.games}</div>
      <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
        <button id="guess-restart-btn" style="background:#000;color:#fff;border:none;padding:12px 18px;font-family:'IBM Plex Mono', monospace;font-size:12px;letter-spacing:0.05em;cursor:pointer;">Сыграть снова</button>
        <button id="guess-share-btn" style="background:#fff;color:#000;border:1px solid #000;padding:12px 18px;font-family:'IBM Plex Mono', monospace;font-size:12px;letter-spacing:0.05em;cursor:pointer;">Поделиться</button>
      </div>
    </div>
  `;

  guessNextBtn.disabled = true;

  setTimeout(() => {
    var restartBtn = document.getElementById('guess-restart-btn');
    var shareBtn = document.getElementById('guess-share-btn');

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
  }, 0);
}

// ================================
// Одобрение / удаление деталей
// ================================

function approveDetail(id) {
  if (!id) id = currentDetailId;
  if (!id) return;

  supaFetch('details?id=eq.' + id, { method: 'PATCH', body: { status: 'approved' } }).then(() => {
    var d = details.find(x => x.id === id);
    if (d) d.status = 'approved';
    updateBadge();
    renderMarkers();
    renderModList();
    if (id === currentDetailId) showGalleryItem(galleryIndex);
  }).catch(() => showToast('Не удалось одобрить деталь', 'error'));
}

function rejectDetail(id) {
  if (!id) id = currentDetailId;
  if (!id) return;
  if (!confirm('Отклонить и удалить деталь?')) return;

  supaFetch('details?id=eq.' + id, { method: 'DELETE', prefer: 'return=minimal' }).then(() => {
    details = details.filter(d => d.id !== id);
    updateBadge();
    renderMarkers();
    renderModList();
    closeDetail();
  }).catch(() => showToast('Не удалось удалить деталь', 'error'));
}

function deleteDetail() {
  if (!currentDetailId) return;
  if (!confirm('Удалить деталь?')) return;
  rejectDetail(currentDetailId);
}