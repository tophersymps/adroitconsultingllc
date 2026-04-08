import sharp from "sharp";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "..", "public");
const SVG_PATH = join(PUBLIC, "adroit-logo-fullcolor-lightbg.svg");

const svgBuffer = readFileSync(SVG_PATH);

const ICON_SIZES = [16, 32, 64, 128, 180, 256, 512];

async function generateIcons() {
  for (const size of ICON_SIZES) {
    let name;
    if (size === 180) name = `adroit-apple-touch-icon-${size}.png`;
    else if (size <= 32) name = `adroit-favicon-${size}.png`;
    else name = `adroit-logo-fullcolor-${size}.png`;

    await sharp(svgBuffer, { density: 300 })
      .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(join(PUBLIC, name));

    console.log(`  ✓ ${name}`);
  }
}

async function generateIco() {
  const png32 = await sharp(svgBuffer, { density: 300 })
    .resize(32, 32, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();

  // Minimal ICO container wrapping a single 32×32 PNG
  const dir = Buffer.alloc(6 + 16);
  dir.writeUInt16LE(0, 0);    // reserved
  dir.writeUInt16LE(1, 2);    // ICO type
  dir.writeUInt16LE(1, 4);    // 1 image
  dir[6] = 32;                // width
  dir[7] = 32;                // height
  dir[8] = 0;                 // color palette
  dir[9] = 0;                 // reserved
  dir.writeUInt16LE(1, 10);   // color planes
  dir.writeUInt16LE(32, 12);  // bits per pixel
  dir.writeUInt32LE(png32.length, 14); // image size
  dir.writeUInt32LE(22, 18);  // offset to image data

  writeFileSync(join(PUBLIC, "adroit-favicon.ico"), Buffer.concat([dir, png32]));
  console.log("  ✓ adroit-favicon.ico");
}

async function generateOgImage() {
  // 1200×630 branded OG image: navy background with centered logo
  const logoSize = 280;
  const logoPng = await sharp(svgBuffer, { density: 300 })
    .resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const tagline = "Salesforce · Automation · Web Development";

  const svgOverlay = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <text x="600" y="480" text-anchor="middle"
          font-family="system-ui, -apple-system, sans-serif"
          font-size="28" font-weight="500" fill="#CBD5E1"
          letter-spacing="2">${tagline}</text>
    <line x1="460" y1="430" x2="740" y2="430" stroke="#334155" stroke-width="1"/>
  </svg>`;

  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: { r: 0, g: 77, b: 152, alpha: 255 }, // navy #004D98
    },
  })
    .composite([
      {
        input: logoPng,
        top: Math.round((380 - logoSize) / 2) + 60,
        left: Math.round((1200 - logoSize) / 2),
      },
      {
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toFile(join(PUBLIC, "adroit-og-image-1200x630.png"));

  console.log("  ✓ adroit-og-image-1200x630.png");
}

console.log("Generating favicon and OG assets...\n");
await generateIcons();
await generateIco();
await generateOgImage();
console.log("\nDone!");
