import {
  faker,
  fakerEN, fakerEN_GB, fakerDE, fakerFR, fakerIT, fakerES,
  fakerPT_BR, fakerJA, fakerZH_CN, fakerKO, fakerEN_IN,
  fakerRU, fakerTR
} from "@faker-js/faker";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 🌍 Diverse locales for realistic data
const fakerPool = [
  fakerEN, fakerEN_GB, fakerDE, fakerFR, fakerIT, fakerES,
  fakerPT_BR, fakerJA, fakerZH_CN, fakerKO, fakerEN_IN,
  fakerRU, fakerTR, faker
];

// Deterministic seeding (same data every run)
fakerPool.forEach((fx, idx) => fx.seed(2025 + idx));

const COUNT = 3000; // total institutions to generate
const IMAGES_PER = 6;

// 🎓 Institution types
const TYPES = [
  "School",
  "College",
  "University",
  "Institute",
  "Polytechnic",
  "High School",
  "Academy",
  "Training Center",
  "Vocational School",
  "Research Institute",
];

// 🎨 Realistic education-related image keywords
const SCHOOL_IMAGE_KEYWORDS = [
  "college campus",
  "university students",
  "classroom learning",
  "graduation ceremony",
  "school building exterior",
  "library interior",
  "science lab",
  "students studying",
  "university lecture hall",
  "school courtyard",
];

// Helper: sanitize for email prefix
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24);
}

// ✅ Helper: get random Unsplash education image
function getSchoolImage() {
  const keyword = faker.helpers.arrayElement(SCHOOL_IMAGE_KEYWORDS);
  return `https://picsum.photos/seed/${encodeURIComponent(
    keyword + Math.random()
  )}/800/600`;
}


const records = [];

for (let i = 0; i < COUNT; i++) {
  const f = faker.helpers.arrayElement(fakerPool);

  const city = f.location.city();
  const country = f.location.country();
  const state = f.location.state();

  const suffix = f.helpers.arrayElement([
    "Public School",
    "College",
    "Institute",
    "University",
    "Academy",
    "High School",
    "Polytechnic",
    "Research Center",
  ]);

  const baseName = `${city} ${suffix}`;
  const type = f.helpers.arrayElement(TYPES);

  const emailLocal = `${slugify(baseName)}${i}`;
  const email = `${emailLocal}@gmail.com`;

  const phone = f.phone.number();
  const address = f.location.streetAddress();

  // 🖼️ Multiple Unsplash education images
  const imageUrls = Array.from({ length: IMAGES_PER }, getSchoolImage);

  // 📘 Description
  const description = f.lorem.paragraphs({ min: 1, max: 3 });

  // ⭐ Random rating (3.0–5.0)
  const rating = f.number.float({ min: 3, max: 5, precision: 0.1 });

  // 🏆 Awards (1–3 items)
  const awardCount = f.number.int({ min: 1, max: 3 });
  const awards = Array.from({ length: awardCount }, () => ({
    title: `${f.company.catchPhrase()} Award`,
    year: f.date.past({ years: 10 }).getFullYear(),
    issuedBy: f.company.name(),
  }));

  const createdAt = f.date.past({ years: 5 });

  records.push({
    name: baseName,
    type,
    email,
    phone,
    country,
    state,
    city,
    address,
    imageUrls,
    description,
    rating,
    awards,
    createdAt,
  });
}

// --- Write output ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.join(__dirname, "data");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "institutions.json");

fs.writeFileSync(outPath, JSON.stringify(records, null, 2), "utf-8");

console.log(
  `✅ Wrote ${COUNT} institution records with education images, rating & awards to`,
  outPath
);
