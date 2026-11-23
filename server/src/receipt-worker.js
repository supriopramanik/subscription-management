import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import { extractReceiptFields } from './receipt-fields.js';

const require = createRequire(import.meta.url);
let ocr;
async function recognize(bytes) {
  if (!ocr) {
    ocr = await createWorker('eng+ben', 1, {
      langPath: workerData.languageDirectory,
      cacheMethod: 'none',
      errorHandler: () => {},
    });
  }
  return (await ocr.recognize(bytes)).data.text;
}

try {
  let text = '';
  const bytes = Buffer.from(workerData.bytes);
  if (workerData.mime === 'application/pdf') {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const root = dirname(require.resolve('pdfjs-dist/package.json'));
    const assetUrl = (folder) => pathToFileURL(join(root, folder)).href + '/';
    const task = getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      useSystemFonts: true,
      standardFontDataUrl: assetUrl('standard_fonts'),
      cMapUrl: assetUrl('cmaps'),
      cMapPacked: true,
      wasmUrl: assetUrl('wasm'),
      maxImageSize: 16000000,
    });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 10) throw new Error('Use a receipt PDF with 10 pages or fewer.');
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        let pageText = content.items.map((item) => item.str + (item.hasEOL ? '\n' : ' ')).join('');
        if (pageText.replace(/\s/g, '').length < 30) {
          const natural = page.getViewport({ scale: 1 });
          const scale = Math.min(2, 2400 / Math.max(natural.width, natural.height));
          const viewport = page.getViewport({ scale });
          const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          pageText = await recognize(canvas.toBuffer('image/png'));
        }
        text += '\n' + pageText;
        page.cleanup();
      }
    } finally {
      await task.destroy();
    }
  } else {
    const image = await loadImage(bytes);
    if (image.width * image.height > 24000000)
      throw new Error('This image is too large. Use an image below 24 megapixels.');
    // Small invoice text needs enough pixels for punctuation and table cells.
    const scale = Math.min(2, 2600 / Math.max(image.width, image.height));
    const canvas = createCanvas(
      Math.max(1, Math.round(image.width * scale)),
      Math.max(1, Math.round(image.height * scale))
    );
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    text = await recognize(canvas.toBuffer('image/png'));
  }
  if (text.trim().length < 4)
    throw new Error('No readable text found. Try a clearer receipt or screenshot.');
  const result = extractReceiptFields(text);
  if (!Object.keys(result.fields).length)
    result.warnings.unshift(
      'No subscription fields could be identified. Enter the details manually.'
    );
  parentPort.postMessage({
    type: 'receipt:result',
    result: { ...result, text: text.slice(0, 16000) },
  });
} catch (error) {
  parentPort.postMessage({
    type: 'receipt:error',
    error: /password/i.test(error.message)
      ? 'This PDF is password protected. Upload an unlocked copy.'
      : error.message || 'Could not read this document.',
  });
} finally {
  await ocr?.terminate();
}
