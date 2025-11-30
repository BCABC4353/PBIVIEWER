import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import png2icons from 'png2icons';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.join(__dirname, 'assets', 'icons', 'icon.png');
const icoPath = path.join(__dirname, 'assets', 'icons', 'icon.ico');
const icnsPath = path.join(__dirname, 'assets', 'icons', 'icon.icns');

async function createIcons() {
  try {
    // First create a 512x512 PNG for best quality icons
    const pngBuffer = await sharp(inputPath)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toBuffer();
    
    // Create ICO (256x256 for Windows)
    const ico256 = await sharp(pngBuffer)
      .resize(256, 256)
      .png()
      .toBuffer();
    
    const tempPngPath = path.join(__dirname, 'assets', 'icons', 'temp-256.png');
    fs.writeFileSync(tempPngPath, ico256);
    
    const icoBuffer = await pngToIco(tempPngPath);
    fs.writeFileSync(icoPath, icoBuffer);
    console.log('Created ICO:', icoPath);
    
    fs.unlinkSync(tempPngPath);
    
    // Create ICNS (for macOS)
    const icnsBuffer = png2icons.createICNS(pngBuffer, png2icons.BICUBIC, 0);
    if (icnsBuffer) {
      fs.writeFileSync(icnsPath, icnsBuffer);
      console.log('Created ICNS:', icnsPath);
    } else {
      console.error('Failed to create ICNS');
    }
    
    console.log('All icons created successfully!');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

createIcons();
