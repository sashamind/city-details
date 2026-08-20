// Игра «угадай локацию»: раздача раундов, счёт, фото, финал.
// Таймер в проверках обнуляется вручную — иначе множитель за скорость зависел
// бы от того, сколько грузилось фото, и ожидаемые очки плыли бы от запуска
// к запуску.

export const title = 'Игра';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const answerExactly = `guessTimeLeft = GUESS_ROUND_SECONDS;
  processGuessClick({ lat: guessPoints[guessCurrentIndex].lat, lng: guessPoints[guessCurrentIndex].lng })`;

export async function run({ page, base, check }) {
  await page.viewport(1440, 900, { mobile: false });
  await page.openApp(base);

  check('кнопка «Играть» видна в шапке', await page.eval(`(function(){
    var b = document.getElementById('toggle-guess-mode');
    return !!b && getComputedStyle(b).display !== 'none' && b.offsetParent !== null;
  })()`));
  check('в подписи столько раундов, сколько в коде',
    (await page.eval(`document.getElementById('guess-total').textContent`)) === String(await page.eval('guessTotalRounds')));

  await page.eval(`document.getElementById('toggle-guess-mode').click()`);
  await page.waitFor('guessModeActive === true', { label: 'старт игры' });
  await sleep(2600);

  check('роздано десять раундов', (await page.eval('guessPoints.length')) === 10);
  check('точки не повторяются', await page.eval('new Set(guessPoints.map(p => p.id)).size === guessPoints.length'));
  check('у всех точек есть фото', await page.eval('guessPoints.every(p => !!p.photo)'));
  check('в игру не попали точки из других городов', await page.eval(`
    guessPoints.every(p => haversineDistance(p.lat, p.lng, MAP_CENTER[0], MAP_CENTER[1]) <= GUESS_MAX_DISTANCE_M)`));
  check('карта осталась на уровне города', (await page.eval('map.getZoom()')) >= 10,
    'зум ' + await page.eval('map.getZoom()'));
  check('поиск и фильтры скрыты', await page.eval(`
    getComputedStyle(document.getElementById('search-bar')).display === 'none' &&
    getComputedStyle(document.querySelector('.filters-bar')).display === 'none'`));

  // Таймер: один на экране и идёт.
  check('таймер на экране один', (await page.eval(`document.querySelectorAll('[id=guess-timer]').length`)) === 1);
  const tick = await page.eval(`document.getElementById('guess-timer').textContent`);
  await sleep(2200);
  check('таймер идёт', (await page.eval(`document.getElementById('guess-timer').textContent`)) !== tick);

  // Фото раунда: пока грузится новое, старое не показывается.
  await page.waitFor(`!document.getElementById('guess-image-container').classList.contains('photo-loading')`,
    { timeout: 60000, label: 'фото первого раунда' });
  const firstPhoto = await page.eval(`document.getElementById('guess-image').src`);
  await page.eval(answerExactly);
  await sleep(300);
  await page.send('Network.emulateNetworkConditions',
    { offline: false, latency: 1200, downloadThroughput: 12 * 1024, uploadThroughput: 12 * 1024 });
  await page.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.eval(`document.getElementById('guess-next-btn').click()`);
  await sleep(700);

  const loading = await page.eval(`(function(){
    var c = document.getElementById('guess-image-container');
    return {
      loading: c.classList.contains('photo-loading'),
      imgVisible: getComputedStyle(document.getElementById('guess-image')).visibility === 'visible',
      src: document.getElementById('guess-image').src
    };
  })()`);
  check('фото прошлого раунда не показывается', loading.loading && !loading.imgVisible);
  check('в <img> уже адрес нового раунда', loading.src !== firstPhoto);

  await page.send('Network.emulateNetworkConditions',
    { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await page.send('Network.setCacheDisabled', { cacheDisabled: false });
  await page.waitFor(`!document.getElementById('guess-image-container').classList.contains('photo-loading')`,
    { timeout: 60000, label: 'фото второго раунда' });

  // Карта остаётся там, куда её увёл игрок.
  await page.eval(`map.setView([54.1935, 37.6180], 16, { animate: false })`);
  await sleep(400);
  const view = await page.eval(`JSON.stringify({ z: map.getZoom(), c: map.getCenter() })`);
  await page.eval(answerExactly);
  await sleep(300);
  await page.eval(`document.getElementById('guess-next-btn').click()`);
  await sleep(2000);
  check('карта не отдаляется на каждом раунде',
    (await page.eval(`JSON.stringify({ z: map.getZoom(), c: map.getCenter() })`)) === view);

  // Начисление очков.
  const before = await page.eval('guessScore');
  await page.eval(answerExactly);
  await sleep(400);
  check('быстрое точное попадание даёт максимум за раунд',
    (await page.eval('guessScore')) - before === 180, 'прибавка ' + ((await page.eval('guessScore')) - before));
  check('в результате названа ступень и множитель', await page.eval(`
    /Точно в цель!/.test(guessResult.textContent) && /молниеносно/.test(guessResult.textContent)`),
    await page.eval('guessResult.textContent.trim()'));
  check('шкала убывает, границы растут', await page.eval(`(function(){
    var p = GUESS_SCORE_STEPS.map(s => s.points), d = GUESS_SCORE_STEPS.map(s => s.maxDistance);
    return p.every((v, i) => i === 0 || v < p[i - 1]) && d.every((v, i) => i === 0 || v > d[i - 1]);
  })()`), await page.eval('GUESS_SCORE_STEPS.length + " ступеней"'));
  check('лучшая ступень — пять метров', (await page.eval('GUESS_SCORE_STEPS[0].maxDistance')) === 5);
  check('множитель за скорость только повышает',
    await page.eval('GUESS_SPEED_BONUSES.every(b => b.multiplier >= 1)'));
  check('расстояние в километрах читается',
    await page.eval(`formatDistance(2400) === '2,4 км' && formatDistance(320) === '320 м'`));

  // Доигрываем до конца.
  for (let i = 0; i < 20; i++) {
    if (await page.eval(`!document.getElementById('guess-final').classList.contains('hidden')`)) break;
    await page.eval(`document.getElementById('guess-next-btn').click()`);
    await sleep(250);
    await page.eval(`if (guessModeActive && guessCurrentIndex < guessPoints.length) { ${answerExactly}; }`);
    await sleep(250);
  }

  check('игра доходит до конца', await page.eval(`!document.getElementById('guess-final').classList.contains('hidden')`));
  check('идеальная игра даёт максимум', (await page.eval('guessScore')) === (await page.eval('guessMaxScore()')));
  check('фото последнего раунда убрано', await page.eval(`
    document.getElementById('guess-image-container').classList.contains('finished') &&
    getComputedStyle(document.getElementById('guess-image')).display === 'none'`));
  check('итог стоит на месте фотографии', await page.eval(`(function(){
    var f = document.getElementById('guess-final');
    return document.getElementById('guess-image-container').contains(f) &&
           f.getBoundingClientRect().height > 100;
  })()`));
  check('счёт крупный и с акцентом', await page.eval(`(function(){
    var v = document.getElementById('guess-final-value');
    var st = getComputedStyle(v);
    return parseFloat(st.fontSize) >= 40 && st.color !== 'rgb(0, 0, 0)' && v.textContent === String(guessScore);
  })()`));
  check('фраза соответствует счёту', await page.eval(`
    document.getElementById('guess-final-phrase').textContent === guessEndingFor(guessScore)`),
    await page.eval(`document.getElementById('guess-final-phrase').textContent`));
  check('на финале три кнопки', await page.eval(`
    !!document.getElementById('guess-restart-btn') && !!document.getElementById('guess-share-btn') &&
    !!document.getElementById('guess-final-exit-btn')`));
  check('статистика сохранилась',
    (await page.eval(`JSON.parse(localStorage.getItem('guessStats')).games`)) === 1);

  // Новая игра возвращает обзор, выход возвращает карту.
  await page.eval(`map.setView([54.1935, 37.6180], 17, { animate: false })`);
  await sleep(300);
  await page.eval(`document.getElementById('guess-restart-btn').click()`);
  await sleep(2500);
  check('«сыграть снова» начинает новую игру',
    (await page.eval('guessCurrentIndex')) === 0 && (await page.eval('guessScore')) === 0);
  check('новая игра снова показывает обзор', (await page.eval('map.getZoom()')) < 17,
    'зум ' + await page.eval('map.getZoom()'));
  check('панель вернулась в вид раунда', await page.eval(`
    !document.getElementById('guess-image-container').classList.contains('finished') &&
    !document.querySelector('.guess-stats').classList.contains('hidden')`));

  await page.eval(`window.confirm = function(){ return true; };
                   document.getElementById('guess-exit-btn').click()`);
  await sleep(900);
  check('выход возвращает карту', await page.eval(`
    guessModeActive === false && markerObjects.length > 0 &&
    getComputedStyle(document.querySelector('.filters-bar')).display !== 'none'`));
  check('таймер остановлен', (await page.eval('guessTimer')) === null);

  await page.resetViewport();
}
