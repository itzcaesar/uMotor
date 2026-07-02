import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const svgPath = path.join(root, 'assets', 'Apps-Logo.svg');
const svgBuf = fs.readFileSync(svgPath);

const targets = [
  path.join(root, 'apps/consumer/assets/images'),
  path.join(root, 'apps/partner/assets/images'),
];

async function makeIcons(dir) {
  const logoSize = Math.round(1024 * 0.72);
  const logoBuffer = await sharp(svgBuf)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();

  // icon.png – white background
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } },
  })
    .composite([{ input: logoBuffer, gravity: 'centre' }])
    .png()
    .toFile(path.join(dir, 'icon.png'));

  // Android foreground – transparent, logo at 60% to respect safe zone
  const fgSize = Math.round(1024 * 0.60);
  const fgBuf = await sharp(svgBuf)
    .resize(fgSize, fgSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: fgBuf, gravity: 'centre' }])
    .png()
    .toFile(path.join(dir, 'android-icon-foreground.png'));

  // Android monochrome – solid white logo for themed/monochrome icons
  const monoSvg = fs.readFileSync(svgPath, 'utf8').replace(/#0E4DA4/g, '#FFFFFF');
  const monoBuf = await sharp(Buffer.from(monoSvg))
    .resize(fgSize, fgSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: monoBuf, gravity: 'centre' }])
    .png()
    .toFile(path.join(dir, 'android-icon-monochrome.png'));

  console.log('Generated icons in:', dir);
}

for (const t of targets) await makeIcons(t);
console.log('All done.');
