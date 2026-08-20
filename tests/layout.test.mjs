// Раскладка: шапка, полосы под ней и панель игры на разных ширинах.
// Всё, что здесь проверяется, когда-то ломалось: строка поиска уезжала под
// перенёсшуюся шапку, панель игры закрывала карту целиком, обзор раунда
// оказывался под шторкой.

export const title = 'Раскладка';

const WIDTHS = [[320, 700], [360, 740], [390, 780], [430, 930], [1024, 800], [1440, 900]];

// Геометрия верхних полос и панели игры одним снимком.
const GEOMETRY = `(function(){
  var header = document.querySelector('.site-header').getBoundingClientRect();
  var search = document.getElementById('search-bar').getBoundingClientRect();
  var filters = document.querySelector('.filters-bar').getBoundingClientRect();
  return {
    headerHeight: Math.round(header.height),
    searchGap: Math.round(search.top - header.bottom),
    filtersAtBottom: window.innerHeight - filters.bottom < 40,
    filtersGap: Math.round(filters.top - search.bottom),
    cssVariable: getComputedStyle(document.documentElement).getPropertyValue('--header-h').trim()
  };
})()`;

export async function run({ page, base, check }) {
  // Все файлы страницы должны отдаваться: иконки, манифест, стили, анимация.
  // Переносы файлов ломаются именно так — молча, одним 404.
  await page.viewport(1440, 900, { mobile: false });
  page.failed.length = 0;
  await page.openApp(base);
  await new Promise((r) => setTimeout(r, 2500));
  await page.eval(`document.getElementById('help-btn').click()`);
  await new Promise((r) => setTimeout(r, 1500));
  await page.eval(`(document.querySelector('.onboarding-close') || { click(){} }).click()`);

  const ownFiles = page.failed.filter((f) => !f.url.includes('/rest/v1/') && !f.url.includes('basemaps'));
  check('все файлы страницы отдаются', ownFiles.length === 0,
    ownFiles.map((f) => f.status + ' ' + f.url.split('/').slice(3).join('/')).join(', ') || 'ни одной битой ссылки');

  // Манифест и анимация приходят не как файлы страницы, а запросом из кода:
  // проверяем, что по их адресам лежит то, что заявлено.
  const assets = await page.eval(`(async function(){
    var manifest = document.querySelector('link[rel=manifest]').href;
    var icons = Array.from(document.querySelectorAll('link[rel=icon], link[rel=apple-touch-icon]')).map(l => l.href);
    var out = { icons: [], manifest: null, lottie: null };
    for (var href of icons) {
      var r = await fetch(href);
      out.icons.push({ href: href, ok: r.ok && (r.headers.get('content-type') || '').indexOf('image') === 0 });
    }
    try { out.manifest = (await (await fetch(manifest)).json()).icons.length; } catch (e) { out.manifest = null; }
    return out;
  })()`);

  check('иконки отдаются картинками', assets.icons.every((i) => i.ok),
    assets.icons.filter((i) => !i.ok).map((i) => i.href).join(', ') || assets.icons.length + ' иконки');
  check('манифест разбирается и содержит иконки', assets.manifest > 0, assets.manifest + ' иконки');
  // Кадры появляются только если файл анимации действительно загрузился:
  // сам объект lottie создаёт в любом случае, даже по битому пути.
  check('анимация логотипа загрузилась', await page.eval('!!lottieAnim && lottieAnim.totalFrames > 0'),
    'кадров: ' + await page.eval('lottieAnim ? lottieAnim.totalFrames : "нет анимации"'));

  for (const [width, height] of WIDTHS) {
    await page.viewport(width, height);
    await page.openApp(base);

    const g = await page.eval(GEOMETRY);
    const where = width + 'px';

    check(`${where}: строка поиска вплотную под шапкой`, g.searchGap === 0, 'зазор ' + g.searchGap);
    check(`${where}: --header-h совпадает с высотой шапки`,
      g.cssVariable === g.headerHeight + 'px', g.cssVariable + ' против ' + g.headerHeight + 'px');
    check(`${where}: фильтры на своём месте`,
      g.filtersAtBottom || g.filtersGap === 0,
      g.filtersAtBottom ? 'внизу экрана' : 'зазор ' + g.filtersGap);
  }

  // Шапка перенеслась — полосы должны переехать следом, без перезагрузки.
  await page.viewport(1440, 900, { mobile: false });
  await page.openApp(base);
  const wide = await page.eval(GEOMETRY);
  await page.viewport(330, 700);
  await new Promise((r) => setTimeout(r, 900));
  const narrow = await page.eval(GEOMETRY);
  check('при смене ширины полосы едут за шапкой',
    narrow.searchGap === 0 && narrow.cssVariable === narrow.headerHeight + 'px',
    wide.headerHeight + 'px → ' + narrow.headerHeight + 'px');

  // Телефон: шторка по содержимому, карта сверху, тап по ней засчитывается.
  await page.viewport(390, 780);
  await page.openApp(base);
  await page.eval(`document.getElementById('toggle-guess-mode').click()`);
  await page.waitFor('guessModeActive === true', { label: 'старт игры' });
  await new Promise((r) => setTimeout(r, 2600));

  const sheet = await page.eval(`(function(){
    var panel = document.getElementById('guess-mode');
    var rect = panel.getBoundingClientRect();
    var header = document.querySelector('.site-header').getBoundingClientRect().height;
    var lastVisible = document.querySelector('.guess-actions').getBoundingClientRect().bottom;
    return {
      mapHeight: Math.round(rect.top - header),
      sheetHeight: Math.round(rect.height),
      deadSpace: Math.round(rect.bottom - lastVisible - parseFloat(getComputedStyle(panel).paddingBottom)),
      scrollable: panel.scrollHeight - panel.clientHeight,
      pointsVisible: guessPoints.every(function (pt) {
        var q = map.latLngToContainerPoint([pt.lat, pt.lng]);
        var insets = mapVisibleInsets();
        return q.x > 0 && q.x < map.getSize().x - insets.right &&
               q.y > insets.top && q.y < map.getSize().y - insets.bottom;
      })
    };
  })()`);

  check('на телефоне карта занимает больше половины экрана', sheet.mapHeight > 390, sheet.mapHeight + ' px');
  check('под шторкой нет пустоты', sheet.deadSpace <= 12, sheet.deadSpace + ' px');
  check('раунд помещается без прокрутки', sheet.scrollable <= 0);
  check('все точки раунда видны над шторкой', sheet.pointsVisible);

  const before = await page.eval('guessScore');
  await page.tap(195, Math.round(sheet.mapHeight / 2 + 45));
  await new Promise((r) => setTimeout(r, 1200));
  check('тап по карте засчитан как ответ',
    await page.eval(`!guessNextBtn.disabled && /очк\\./.test(guessResult.textContent)`),
    'очки ' + before + ' → ' + await page.eval('guessScore'));

  // Десктоп: карта слева, панель справа под шапкой.
  await page.viewport(1440, 900, { mobile: false });
  await page.openApp(base);
  await page.eval(`document.getElementById('toggle-guess-mode').click()`);
  await page.waitFor('guessModeActive === true', { label: 'старт игры на десктопе' });
  await new Promise((r) => setTimeout(r, 2600));

  const desktop = await page.eval(`(function(){
    var panel = document.getElementById('guess-mode').getBoundingClientRect();
    var header = document.querySelector('.site-header').getBoundingClientRect();
    var size = map.getSize();
    return {
      atRight: Math.round(panel.left + panel.width) >= size.x - 1,
      underHeader: Math.abs(panel.top - header.bottom) <= 1,
      widthShare: panel.width / size.x,
      insets: mapVisibleInsets()
    };
  })()`);

  check('панель прижата к правому краю', desktop.atRight);
  check('панель начинается под шапкой', desktop.underHeader);
  check('карта занимает большую часть ширины', desktop.widthShare < 0.45,
    Math.round(desktop.widthShare * 100) + '% отдано панели');
  check('отступ карты считается справа', desktop.insets.right > 0 && desktop.insets.bottom === 0);

  await page.eval(`window.confirm = function(){ return true; };
                   document.getElementById('guess-exit-btn').click()`);
  await page.resetViewport();
}
