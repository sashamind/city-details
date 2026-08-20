// Фотографии: карта должна тянуть превью, а полный размер — только там, где он
// виден целиком. Загрузка ничего не отправляет в бакет: место отправки
// подменяется, проверяются сами вызовы.

export const title = 'Фотографии';

export async function run({ page, base, check }) {
  await page.viewport(1440, 900, { mobile: false });
  await page.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.openApp(base);
  await new Promise((r) => setTimeout(r, 4000));

  const photos = page.images.filter((i) => i.url.includes('/storage/v1/object/public/photos/'));
  const originals = photos.filter((i) => !i.url.includes('/photos/thumbs/'));
  const kilobytes = Math.round(photos.reduce((sum, i) => sum + i.size, 0) / 1024);

  check('карта не грузит полноразмерные снимки', originals.length === 0,
    originals.length ? originals.length + ' оригиналов' : 'все ' + photos.length + ' превью');
  check('на карту уходит меньше мегабайта', kilobytes < 1024, kilobytes + ' КБ');
  check('у всех точек с фото есть превью',
    await page.eval(`details.filter(d => d.photo).every(d => !!d.thumb)`),
    await page.eval(`details.filter(d => d.photo && !d.thumb).length + ' без превью'`));
  check('в маркерах стоит превью', await page.eval(`(function(){
    var imgs = Array.from(document.querySelectorAll('.dot-marker img'));
    return imgs.length > 0 && imgs.every(i => i.src.includes('/photos/thumbs/'));
  })()`));

  await page.eval(`openDetail(details.find(d => d.photo))`);
  await new Promise((r) => setTimeout(r, 2000));
  check('в карточке точки — полный размер', await page.eval(`(function(){
    var img = document.getElementById('detail-photo');
    return !!img && img.src.includes('/photos/') && !img.src.includes('/photos/thumbs/');
  })()`));
  await page.eval('closeDetail()');

  // Новая загрузка: рядом с оригиналом должно уходить превью.
  const upload = await page.eval(`(async function(){
    var canvas = document.createElement('canvas');
    canvas.width = 3000; canvas.height = 2000;
    var ctx = canvas.getContext('2d');
    var grd = ctx.createLinearGradient(0, 0, 3000, 2000);
    grd.addColorStop(0, '#8a5a2b'); grd.addColorStop(1, '#2b5a8a');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 3000, 2000);
    for (var i = 0; i < 400; i++) {
      ctx.fillStyle = 'rgba(' + (i * 7 % 255) + ',' + (i * 13 % 255) + ',' + (i * 29 % 255) + ',0.6)';
      ctx.fillRect((i * 137) % 3000, (i * 219) % 2000, 60, 40);
    }
    var blob = await new Promise(function (r) { canvas.toBlob(r, 'image/jpeg', 0.95); });
    var file = new File([blob], 'проверка.jpg', { type: 'image/jpeg' });

    var calls = [];
    var real = window.uploadToBucket;
    window.uploadToBucket = function (path, body, type) {
      calls.push({ path: path, size: body.size, type: type });
      return Promise.resolve('https://example.test/' + path);
    };
    var result = await uploadPhoto(file);
    window.uploadToBucket = real;
    return { calls: calls, result: result };
  })()`);

  check('уходит два файла: оригинал и превью', upload.calls.length === 2);
  check('превью лежит рядом, в thumbs/', upload.calls[1]?.path === 'thumbs/' + upload.calls[0]?.path);
  check('превью в разы легче оригинала', upload.calls[1]?.size < upload.calls[0]?.size / 5,
    Math.round(upload.calls[0]?.size / 1024) + ' КБ → ' + Math.round(upload.calls[1]?.size / 1024) + ' КБ');
  check('адрес превью возвращается наружу', !!upload.result.thumbUrl);

  // Превью не сделалось — точка всё равно должна сохраниться.
  const fallback = await page.eval(`(async function(){
    var file = new File([new Blob([new Uint8Array([1,2,3])], { type: 'image/jpeg' })], 'broken.jpg', { type: 'image/jpeg' });
    var realUpload = window.uploadToBucket, realCompress = window.compressImage;
    window.uploadToBucket = function (path) { return Promise.resolve('https://example.test/' + path); };
    window.compressImage = function () { return Promise.reject(new Error('не вышло')); };
    var result = await uploadPhoto(file);
    window.uploadToBucket = realUpload; window.compressImage = realCompress;
    return result;
  })()`);
  check('без превью загрузка всё равно проходит', !!fallback.url && fallback.thumbUrl === '');

  await page.send('Network.setCacheDisabled', { cacheDisabled: false });
  await page.resetViewport();
}
