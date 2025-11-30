import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.join(__dirname, 'assets', 'icons', 'icon.png');
const squarePath = path.join(__dirname, 'assets', 'icons', 'icon-256.png');
const outputPath = path.join(__dirname, 'assets', 'icons', 'icon.ico');

try {
  // Create a 256x256 square image with white background
  await sharp(inputPath)
    .resize(256, 256, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .toFile(squarePath);
  
  console.log('Created 256x256 square image:', squarePath);
  
  // Now convert to ICO
  const buf = await pngToIco(squarePath);
  fs.writeFileSync(outputPath, buf);
  console.log('ICO file created successfully:', outputPath);
  
  // Clean up
  fs.unlinkSync(squarePath);
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
