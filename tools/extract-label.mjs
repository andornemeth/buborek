// Usage: node tools/extract-label.mjs <photo.jpg> <left> <top> <width> <height> <out.png> [preview.png] [lumHi] [lumLo]
// Cuts the dark print of a mug label out of a photo (box given in the upright photo's pixels)
// and writes it as a white-on-transparent mask.
import sharp from 'sharp';
const [src, l, t, w, h, out, preview, hi = '0.42', lo = '0.16'] = process.argv.slice(2);
const box = { left: +l, top: +t, width: +w, height: +h };
const { data, info } = await sharp(src).rotate().extract(box).raw().toBuffer({ resolveWithObject: true });
const px = Buffer.alloc(info.width * info.height * 4);
for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
  const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  let a = Math.min(1, Math.max(0, (+hi - lum) / (+hi - +lo)));
  a = a * a * (3 - 2 * a);
  px[j] = px[j + 1] = px[j + 2] = 255; px[j + 3] = Math.round(a * 255);
}
const H = Math.round(1024 * info.height / info.width);
await sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } }).resize(1024, H).png({ compressionLevel: 9, palette: true }).toFile(out);
if (preview) {
  await sharp({ create: { width: 1024, height: H, channels: 3, background: '#e8b030' } })
    .composite([{ input: await sharp(out).negate({ alpha: false }).toBuffer() }]).png().toFile(preview);
}
