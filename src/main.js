import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

var CATEGORIES = {
  texture:     { label: 'Текстура',     color: '#c8a86e' },
  sign:        { label: 'Вывеска',      color: '#6ec8a8' },
  element:     { label: 'Элемент',      color: '#8e9ec8' },
  trace:       { label: 'След времени', color: '#c87e6e' },
  composition: { label: 'Композиция',   color: '#b86ec8' },
  other:       { label: 'Другое',       color: '#888888' }
};

var DEMO_DETAILS = [
  {
    id: '1',
    title: 'Чугунная решётка 1880-х',
    description: 'Ограда палисадника. Литьё Путиловского завода — узор не повторяется.',
    category: 'element',
    lat: 59.9343,
    lng: 30.3351,
    photo: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600&q=80'
  },
  {
    id: '2',
    title: 'Десять слоёв краски',
    description: 'Двор-колодец. Каждый слой — эпоха: охра, бирюза, казённый зелёный.',
    category: 'texture',
    lat: 59.9310,
    lng: 30.3420,
    photo: 'https://images.unsplash.com/photo-1509803874385-db7c23652552?w=600&q=80'
  },
  {
    id: '3',
    title: 'Жестяная вывеска «Бакалея»',
    description: 'Шрифт модерн начала XX века. Краска выцвела до призрачного голубого.',
    category: 'sign',
    lat: 59.9370,
    lng: 30.3280,
    photo: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80'
  },
  {
    id: '4',
    title: 'Тень трубы на брандмауэре',
    description: 'Около 15:00 труба отбрасывает диагональ через три этажа глухой стены.',
    category: 'composition',
    lat: 59.9290,
    lng: 30.3380,
    photo: 'https://images.unsplash.com/photo-1494548162494-384bba4ab999?w=600&q=80'
  },
  {
    id: '5',
    title: 'Замурованная дверь с номером «3»',
    description: 'Вход заложен кирпичом в 50-х, но табличку оставили.',
    category: 'trace',
    lat: 59.9355,
    lng: 30.3300,
    photo: 'https://images.unsplash.com/photo-1517331156700-3c241d2b4d83?w=600&q=80'
  }
];

var details = [];
var markerObjects = [];
var activeFilter = 'all';
var isAddingMode = false;
var pendingCoords = null;
var tempMarker = null;
var map;
var STORAGE_KEY = 'city-details-data';

// ===== ЗАГРУЗКА / СОХРАНЕНИЕ =====
function loadDetails() {
  var stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    details = JSON.parse(stored);
  } else {
    details = DEMO_DETAILS.slice();
    saveDetails();
  }
}

function saveDetails() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(details));
}

// ===== КАРТА =====
function initMap() {
  map = L.map('map', {
    center: [59.9343, 30.3351],
    zoom: 14,
    zoomControl: false
  });

  L.control.zoom({ position: 'bottomleft' }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 19
  }).addTo(map);

  // Клик по карте
  map.on('click', function (e) {
    if (isAddingMode) {
      pendingCoords = { lat: e.latlng.lat, lng: e.latlng.lng };

      // Убираем старый временный маркер
      if (tempMarker) {
        map.removeLayer(tempMarker);
      }

      // Ставим новый временный маркер
      var tempIcon = L.divIcon({
        html: '<div class="temp-marker"></div>',
        className: '',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });

      tempMarker = L.marker([e.latlng.lat, e.latlng.lng], { icon: tempIcon }).addTo(map);

      // Обновляем подсказку в панели
      document.getElementById('hint-click').style.display = 'none';
      document.getElementById('hint-coords').style.display = 'block';
      document.getElementById('coords-display').textContent =
        e.latlng.lat.toFixed(5) + ', ' + e.latlng.lng.toFixed(5);
    }
  });

  renderMarkers();
}

// ===== МАРКЕРЫ =====
function renderMarkers() {
  markerObjects.forEach(function (m) { map.removeLayer(m); });
  markerObjects = [];

  var filtered;
  if (activeFilter === 'all') {
    filtered = details;
  } else {
    filtered = details.filter(function (d) { return d.category === activeFilter; });
  }

  filtered.forEach(function (detail) {
    var markerHtml;
    if (detail.photo) {
      markerHtml = '<div class="detail-marker" data-category="' + detail.category +
        '" style="background-image: url(' + detail.photo + ')"></div>';
    } else {
      markerHtml = '<div class="detail-marker" data-category="' + detail.category + '"></div>';
    }

    var icon = L.divIcon({
      html: markerHtml,
      className: '',
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });

    var marker = L.marker([detail.lat, detail.lng], { icon: icon }).addTo(map);

    marker.on('click', function () {
      if (!isAddingMode) {
        openDetail(detail);
        map.flyTo([detail.lat, detail.lng], 16, { duration: 0.8 });
      }
    });

    markerObjects.push(marker);
  });
}

// ===== ПАНЕЛЬ ДЕТАЛИ =====
function openDetail(detail) {
  document.getElementById('detail-photo').src = detail.photo || '';
  document.getElementById('detail-title').textContent = detail.title;
  document.getElementById('detail-description').textContent = detail.description;

  var catInfo = CATEGORIES[detail.category] || CATEGORIES.other;
  var tag = document.getElementById('detail-category');
  tag.textContent = catInfo.label;
  tag.style.borderColor = catInfo.color;
  tag.style.color = catInfo.color;

  document.getElementById('detail-panel').classList.remove('hidden');
}

function closeDetail() {
  document.getElementById('detail-panel').classList.add('hidden');
}

// ===== ДОБАВЛЕНИЕ =====
function openAddForm() {
  isAddingMode = true;

  // Показываем боковую панель
  document.getElementById('add-panel').classList.add('open');
  document.getElementById('add-btn').classList.add('hidden');
  document.getElementById('map-hint').classList.add('visible');

  // Закрываем панель детали если открыта
  closeDetail();

  // Меняем курсор
  document.getElementById('map').style.cursor = 'crosshair';
}

function closeAddForm() {
  isAddingMode = false;
  pendingCoords = null;

  // Убираем временный маркер
  if (tempMarker) {
    map.removeLayer(tempMarker);
    tempMarker = null;
  }

  // Прячем панель
  document.getElementById('add-panel').classList.remove('open');
  document.getElementById('add-btn').classList.remove('hidden');
  document.getElementById('map-hint').classList.remove('visible');
  document.getElementById('map').style.cursor = '';

  // Сбрасываем форму
  document.getElementById('input-title').value = '';
  document.getElementById('input-description').value = '';
  document.getElementById('input-category').value = 'texture';
  document.getElementById('input-photo').value = '';
  document.getElementById('photo-preview').innerHTML = '';
  document.getElementById('hint-click').style.display = 'block';
  document.getElementById('hint-coords').style.display = 'none';
}

function submitDetail() {
  var title = document.getElementById('input-title').value.trim();
  var description = document.getElementById('input-description').value.trim();
  var category = document.getElementById('input-category').value;
  var fileInput = document.getElementById('input-photo');

  if (!title) {
    alert('Укажите название');
    return;
  }

  if (!pendingCoords) {
    alert('Кликните на карту чтобы выбрать место');
    return;
  }

  function saveAndClose(photoData) {
    var newDetail = {
      id: Date.now().toString(),
      title: title,
      description: description,
      category: category,
      lat: pendingCoords.lat,
      lng: pendingCoords.lng,
      photo: photoData || ''
    };
    details.push(newDetail);
    saveDetails();
    renderMarkers();
    closeAddForm();
  }

  if (fileInput.files && fileInput.files[0]) {
    var reader = new FileReader();
    reader.onload = function (e) { saveAndClose(e.target.result); };
    reader.readAsDataURL(fileInput.files[0]);
  } else {
    saveAndClose('');
  }
}

// ===== ФИЛЬТРЫ =====
function setFilter(filter) {
  activeFilter = filter;

  var buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(function (btn) {
    if (btn.dataset.filter === filter) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  renderMarkers();
}

// ===== ПРИВЯЗКА СОБЫТИЙ =====
function initEvents() {
  // Закрыть панель детали
  document.getElementById('close-panel').addEventListener('click', closeDetail);

  // Кнопка "+"
  document.getElementById('add-btn').addEventListener('click', openAddForm);

  // Кнопки формы
  document.getElementById('cancel-form').addEventListener('click', closeAddForm);
  document.getElementById('submit-detail').addEventListener('click', submitDetail);

  // Превью фото
  document.getElementById('input-photo').addEventListener('change', function () {
    var file = this.files[0];
    if (file) {
      var reader = new FileReader();
      reader.onload = function (e) {
        document.getElementById('photo-preview').innerHTML =
          '<img src="' + e.target.result + '" alt="Превью">';
      };
      reader.readAsDataURL(file);
    } else {
      document.getElementById('photo-preview').innerHTML = '';
    }
  });

  // Фильтры
  document.querySelectorAll('.filter-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setFilter(btn.dataset.filter);
    });
  });

  // Escape — закрывает всё
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeDetail();
      if (isAddingMode) {
        closeAddForm();
      }
    }
  });
}

// ===== ЗАПУСК =====
loadDetails();
initMap();
initEvents();
