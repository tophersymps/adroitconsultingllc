/**
 * Sync generated constellation figure plates into public/constellations/.
 *
 * Plates are produced one at a time by an image model into the Cursor assets
 * directory as `<slug>-figure.png` (~1.5MB colour). This script is the second
 * half of that pipeline: it downscales to 640px, drops to grayscale (the chart
 * luma-keys them anyway — see `ghostFilter` in `chart/StarChart.tsx`) and writes
 * `public/constellations/<slug>.webp` at ~75KB.
 *
 * Grayscale WebP at q90 is the shipped format. The chart never shows a plate
 * directly: it reads luminance through `feColorMatrix` and blurs the result, so
 * the encoder's artifacts land far below anything that survives to the screen.
 * The lossless originals stay in the assets directory, outside the repo.
 *
 * It exists because generation is long and interruptible. Running it after
 * every batch means a dropped provider connection costs one batch, not the
 * whole run. Idempotent: already-synced plates are skipped unless --force.
 *
 * Usage:
 *   node scripts/sync-constellation-plates.js [--src <dir>] [--force] [--remaining]
 *
 *   --remaining  print the slugs still missing, one per line, and exit
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

/** The IAU canonical 88. Slug = lowercase name, hyphenated, diacritics folded. */
const IAU_88 = [
  "Andromeda", "Antlia", "Apus", "Aquarius", "Aquila", "Ara", "Aries",
  "Auriga", "Bootes", "Caelum", "Camelopardalis", "Cancer", "Canes Venatici",
  "Canis Major", "Canis Minor", "Capricornus", "Carina", "Cassiopeia",
  "Centaurus", "Cepheus", "Cetus", "Chamaeleon", "Circinus", "Columba",
  "Coma Berenices", "Corona Australis", "Corona Borealis", "Corvus", "Crater",
  "Crux", "Cygnus", "Delphinus", "Dorado", "Draco", "Equuleus", "Eridanus",
  "Fornax", "Gemini", "Grus", "Hercules", "Horologium", "Hydra", "Hydrus",
  "Indus", "Lacerta", "Leo", "Leo Minor", "Lepus", "Libra", "Lupus", "Lynx",
  "Lyra", "Mensa", "Microscopium", "Monoceros", "Musca", "Norma", "Octans",
  "Ophiuchus", "Orion", "Pavo", "Pegasus", "Perseus", "Phoenix", "Pictor",
  "Pisces", "Piscis Austrinus", "Puppis", "Pyxis", "Reticulum", "Sagitta",
  "Sagittarius", "Scorpius", "Sculptor", "Scutum", "Serpens", "Sextans",
  "Taurus", "Telescopium", "Triangulum", "Triangulum Australe", "Tucana",
  "Ursa Major", "Ursa Minor", "Vela", "Virgo", "Volans", "Vulpecula",
];

const slugOf = (name) => name.toLowerCase().replace(/\s+/g, "-");
const SLUGS = IAU_88.map(slugOf);

const DEST = path.join("public", "constellations");
/** Shipped format. Must stay in step with PLATE_EXT in chart-figures.ts. */
const OUT_EXT = "webp";
const DEFAULT_SRC =
  process.env.CURSOR_ASSETS_DIR ||
  path.join(
    process.env.USERPROFILE || process.env.HOME || "",
    ".cursor", "projects",
    "c-Users-chris-Desktop-Adroit-Consulting", "assets",
  );

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const src = opt("--src", DEFAULT_SRC);
const force = flag("--force");

function synced() {
  if (!fs.existsSync(DEST)) return new Set();
  return new Set(
    fs.readdirSync(DEST)
      .filter((f) => f.endsWith(`.${OUT_EXT}`))
      .map((f) => f.replace(new RegExp(`\\.${OUT_EXT}$`), "")),
  );
}

if (flag("--remaining")) {
  const have = synced();
  const raw = fs.existsSync(src)
    ? new Set(
        fs.readdirSync(src)
          .filter((f) => f.endsWith("-figure.png"))
          .map((f) => f.replace(/-figure\.png$/, "")),
      )
    : new Set();
  for (const s of SLUGS) if (!have.has(s) && !raw.has(s)) console.log(s);
  process.exit(0);
}

(async () => {
  if (!fs.existsSync(src)) {
    console.error(`source directory not found: ${src}`);
    process.exit(1);
  }
  fs.mkdirSync(DEST, { recursive: true });

  const have = synced();
  const plates = fs.readdirSync(src)
    .filter((f) => f.endsWith("-figure.png"))
    .map((f) => ({ slug: f.replace(/-figure\.png$/, ""), file: path.join(src, f) }))
    .filter((p) => force || !have.has(p.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  let bytes = 0;
  const unknown = [];
  for (const { slug, file } of plates) {
    if (!SLUGS.includes(slug)) unknown.push(slug);
    const buf = await sharp(file)
      .resize(640, 640, { fit: "inside" })
      .grayscale()
      .webp({ quality: 90 })
      .toBuffer();
    fs.writeFileSync(path.join(DEST, `${slug}.${OUT_EXT}`), buf);
    bytes += buf.length;
    console.log(`  + ${slug}  ${Math.round(buf.length / 1024)}KB`);
  }

  const after = synced();
  const missing = SLUGS.filter((s) => !after.has(s));
  const extra = [...after].filter((s) => !SLUGS.includes(s));

  console.log(
    `\nsynced ${plates.length} plate(s), ${Math.round(bytes / 1024)}KB`,
  );
  console.log(`coverage ${SLUGS.length - missing.length}/${SLUGS.length}`);
  if (unknown.length) console.log(`off-list plates: ${unknown.join(", ")}`);
  if (extra.length) console.log(`extra files: ${extra.join(", ")}`);
  if (missing.length) {
    console.log(`\nmissing ${missing.length}:`);
    console.log(missing.join(" "));
  } else {
    console.log("\nall 88 IAU figures present.");
  }
})();
