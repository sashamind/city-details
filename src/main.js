// ===== ОНБОРДИНГ =====
function closeOnboarding() {
    const onboarding = document.getElementById('onboarding');
    onboarding.classList.add('hidden');
    localStorage.setItem('onboarding_seen', 'true');
    setTimeout(() => {
        onboarding.remove();
    }, 600);
}

window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('onboarding_seen') === 'true') {
        const onboarding = document.getElementById('onboarding');
        if (onboarding) onboarding.remove();
    }
});

// ===== SUPABASE =====
const SUPABASE_URL = 'https://yuqaeoggfbcnrwitdcvp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1cWFlb2dnZmJjbnJ3aXRkY3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkzMTYwODUsImV4cCI6MjA2NDg5MjA4NX0.kkOBSKMkSLqtcrvnMdYQfTzfG1GBStBqraS1E0YJiL8';

// ===== КАРТА =====
const map = L.map('map', {
    zoomControl: false
}).setView([54.193, 37.617], 13);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO',
    maxZoom: 19
}).addTo(map);

// ===== ПЕРЕМЕННЫЕ =====
let markers = [];
let currentFilter = 'all';
let selectedCategory = 'other';
let pendingLatLng = null;

// ===== ИКОНКИ КАТЕГОРИЙ =====
const categoryIcons = {
    architecture: '🏛',
    nature: '🌿',
    art: '🎨',
    history: '📜',
    infrastructure: '🔧',
    other: '📌'
};

const categoryNames = {
    architecture: 'Архитектура',
    nature: 'Природа',
    art: 'Искусство',
    history: 'История',
    infrastructure: 'Инфраструктура',
    other: 'Другое'
};

// ===== СОЗДАНИЕ МАРКЕРА =====
function createIcon(category) {
    const emoji = categoryIcons[category] || '📌';
    return L.divIcon({
        html: `<div style="font-size:28px;text-align:center;line-height:1;">${emoji}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        className: 'custom-marker'
    });
}

// ===== ЗАГРУЗКА ДЕТАЛЕЙ =====
async function loadDetails() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/details?select=*`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        const data = await res.json();

        markers.forEach(m => map.removeLayer(m.marker));
        markers = [];

        data.forEach(detail => {
            const marker = L.marker([detail.lat, detail.lng], {
                icon: createIcon(detail.category)
            });

            marker.on('click', () => showDetail(detail));

            markers.push({
                marker: marker,
                category: detail.category,
                data: detail
            });
        });

        applyFilter();
    } catch (err) {
        console.error('Ошибка загрузки:', err);
    }
}

// ===== ФИЛЬТР =====
function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    applyFilter();
}

function applyFilter() {
    markers.forEach(m => {
        if (currentFilter === 'all' || m.category === currentFilter) {
            m.marker.addTo(map);
        } else {
            map.removeLayer(m.marker);
        }
    });
}

// ===== КЛИК ПО КАРТЕ — ДОБАВИТЬ =====
map.on('click', (e) => {
    pendingLatLng = e.latlng;
    document.getElementById('detailTitle').value = '';
    document.getElementById('detailDesc').value = '';
    document.getElementById('detailAuthor').value = '';
    selectedCategory = 'other';
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.cat-btn[data-cat="other"]').classList.add('active');
    document.getElementById('addPanel').classList.remove('hidden');
});

// ===== ВЫБОР КАТЕГОРИИ =====
function selectCategory(cat) {
    selectedCategory = cat;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.cat-btn[data-cat="${cat}"]`).classList.add('active');
}

// ===== СОХРАНИТЬ ДЕТАЛЬ =====
async function saveDetail() {
    const title = document.getElementById('detailTitle').value.trim();
    const desc = document.getElementById('detailDesc').value.trim();
    const author = document.getElementById('detailAuthor').value.trim() || 'Аноним';

    if (!title) {
        alert('Введите название');
        return;
    }

    if (!pendingLatLng) return;

    const detail = {
        title: title,
        description: desc,
        category: selectedCategory,
        author: author,
        lat: pendingLatLng.lat,
        lng: pendingLatLng.lng
    };

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/details`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(detail)
        });

        if (res.ok) {
            closePanel();
            loadDetails();
        } else {
            alert('Ошибка сохранения');
        }
    } catch (err) {
        console.error('Ошибка:', err);
        alert('Ошибка сети');
    }
}

// ===== ПОКАЗАТЬ ДЕТАЛЬ =====
function showDetail(detail) {
    document.getElementById('viewTitle').textContent = detail.title;
    document.getElementById('viewCategory').textContent =
        `${categoryIcons[detail.category] || '📌'} ${categoryNames[detail.category] || 'Другое'}`;
    document.getElementById('viewDesc').textContent = detail.description || 'Без описания';
    document.getElementById('viewAuthor').textContent = `Автор: ${detail.author || 'Аноним'}`;

    const date = new Date(detail.created_at);
    document.getElementById('viewDate').textContent =
        date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

    document.getElementById('viewPanel').classList.remove('hidden');
}

// ===== ЗАКРЫТЬ ПАНЕЛИ =====
function closePanel() {
    document.getElementById('addPanel').classList.add('hidden');
    pendingLatLng = null;
}

function closeViewPanel() {
    document.getElementById('viewPanel').classList.add('hidden');
}

// ===== ГЕОЛОКАЦИЯ =====
function locateMe() {
    if (!navigator.geolocation) {
        alert('Геолокация не поддерживается');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude } = pos.coords;
            map.setView([latitude, longitude], 16);

            const pulseIcon = L.divIcon({
                html: '<div class="pulse-marker"></div>',
                iconSize: [16, 16],
                className: ''
            });

            L.marker([latitude, longitude], { icon: pulseIcon })
                .addTo(map)
                .bindPopup('Вы здесь')
                .openPopup();
        },
        (err) => {
            alert('Не удалось определить местоположение');
        },
        { enableHighAccuracy: true }
    );
}

// ===== РЕГИСТРАЦИЯ SW =====
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}

// ===== СТАРТ =====
loadDetails();
