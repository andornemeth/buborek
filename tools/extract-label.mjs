// Usage: node tools/extract-label.mjs <photo.jpg>
// Cuts the dark print (lettering + building drawing) out of the mug photo
// and writes it as a white-on-transparent mask to assets/label.png.
import sharp from 'sharp';
const src = process.argv[2];
const box = { left: 880, top: 1800, width: 1240, height: 1040 }; // in the upright 3000x4000 photo
const { data, info } = await sharp(src).rotate().extract(box).raw().toBuffer({ resolveWithObject: true });
const out = Buffer.alloc(info.width * info.height * 4);
for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
  const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let a = (0.42 - lum) / (0.42 - 0.16);
  a = Math.min(1, Math.max(0, a));
  a = a * a * (3 - 2 * a);
  out[j] = out[j + 1] = out[j + 2] = 255;
  out[j + 3] = Math.round(a * 255);
}
await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
  .resize(1024, Math.round(1024 * info.height / info.width))
  .png({ compressionLevel: 9, palette: true }).toFile('assets/label.png');
// preview on yellow for checking
await sharp({ create: { width: 1024, height: Math.round(1024 * info.height / info.width), channels: 3, background: '#e8b030' } })
  .composite([{ input: await sharp('assets/label.png').negate({ alpha: false }).toBuffer() }])
  .png().toFile(process.argv[3] || '/dev/null');
