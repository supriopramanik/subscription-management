import { Worker } from 'node:worker_threads';
import { fileTypeFromBuffer } from 'file-type';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);

let active = false;
export async function extractReceipt(file) {
  if (!file?.buffer?.length)
    throw Object.assign(new Error('Choose a receipt image or PDF.'), { status: 400 });
  const type = await fileTypeFromBuffer(file.buffer);
  if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(type?.mime))
    throw Object.assign(new Error('Choose a PDF, PNG, JPEG or WebP receipt.'), { status: 400 });
  if (active)
    throw Object.assign(new Error('Another receipt is being read. Please try again shortly.'), {
      status: 429,
    });
  active = true;
  let worker;
  let languageDirectory;
  try {
    languageDirectory = await mkdtemp(join(tmpdir(), 'subtrack-ocr-'));
    for (const language of ['eng', 'ben']) {
      await copyFile(
        require.resolve(`@tesseract.js-data/${language}/4.0.0/${language}.traineddata.gz`),
        join(languageDirectory, `${language}.traineddata.gz`)
      );
    }
    return await new Promise((resolve, reject) => {
      worker = new Worker(new URL('./receipt-worker.js', import.meta.url), {
        workerData: { bytes: file.buffer, mime: type.mime, languageDirectory },
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      });
      const timer = setTimeout(
        () =>
          finish(
            reject,
            Object.assign(
              new Error('Reading took too long. Try a clearer image or a shorter PDF.'),
              { status: 422 }
            )
          ),
        90000
      );
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      worker.on('message', (message) => {
        // Node --watch also sends dependency messages through this channel.
        // Only our explicit receipt protocol can complete an extraction.
        if (message?.type === 'receipt:error') {
          finish(
            reject,
            Object.assign(new Error(message.error || 'Could not read this receipt.'), {
              status: 422,
            })
          );
        } else if (message?.type === 'receipt:result') {
          const result = message.result;
          if (
            !result?.fields ||
            typeof result.fields !== 'object' ||
            Array.isArray(result.fields) ||
            !Array.isArray(result.warnings) ||
            typeof result.text !== 'string'
          ) {
            finish(
              reject,
              Object.assign(
                new Error('The receipt reader returned an invalid result. Please try again.'),
                { status: 422 }
              )
            );
          } else finish(resolve, result);
        }
      });
      worker.once('error', () =>
        finish(
          reject,
          Object.assign(
            new Error('Could not read this receipt. Try a clearer image or another PDF.'),
            { status: 422 }
          )
        )
      );
      worker.once('exit', () => {
        if (!settled)
          finish(
            reject,
            Object.assign(new Error('Receipt reader stopped. Try a smaller file.'), { status: 422 })
          );
      });
    });
  } finally {
    try {
      await worker?.terminate();
      if (languageDirectory) await rm(languageDirectory, { recursive: true, force: true });
    } finally {
      active = false;
    }
  }
}
