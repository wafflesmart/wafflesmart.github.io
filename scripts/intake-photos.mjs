#!/usr/bin/env node
/**
 * Photo intake for the MKE site.
 *
 * Originals stay in photo-intake/originals/ (gitignored).
 * GPS and the rest of the EXIF stay in photo-intake/private/ (gitignored).
 * Draft labels in photo-intake/drafts/ are safe to commit: place, date,
 * series, caption, tags, and camera — never coordinates.
 * Published files are resized JPEGs with metadata removed.
 *
 *   node scripts/intake-photos.mjs                 # draft, then publish approved
 *   node scripts/intake-photos.mjs --geocode       # also ask Nominatim for unknown places
 *   node scripts/intake-photos.mjs --strip-existing
 *   node scripts/intake-photos.mjs --check-public
 */

import crypto from 'crypto';
import { execFileSync } from 'child_process';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import exifr from 'exifr';
import sharp from 'sharp';

const THUMB_EDGE = 600;
const DISPLAY_EDGE = 2000;
const THUMB_QUALITY = 72;
const DISPLAY_QUALITY = 80;
const CITY_RADIUS_KM = 80;
const CLUSTER_KM = 30;
const TRIP_GAP_DAYS = 3;
const INPUT_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.heic', '.heif']);

const GPS_KEYS = new Set([
  'latitude', 'longitude', 'lat', 'lon', 'lng',
  'gps', 'gpslatitude', 'gpslongitude', 'gpslatituderef', 'gpslongituderef',
  'altitude', 'gpsaltitude', 'coordinates', 'coords', 'locationraw', 'rawgps',
  'exif', 'xmp', 'makernote',
]);

const PUBLISHED_EXTRA_FORBIDDEN = new Set(['camera', 'make', 'model']);

const COORD_PAIR = /\b-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/;

// Offline city list so a place name can be suggested without sending GPS anywhere.
// Nominatim is optional (--geocode) and only the city name is kept.
const PLACES = [
  ['Berlin', 'BER', 52.52, 13.405],
  ['Potsdam', 'POT', 52.3906, 13.0645],
  ['Hamburg', 'HAM', 53.5511, 9.9937],
  ['Munich', 'MUC', 48.1351, 11.582],
  ['Cologne', 'CGN', 50.9375, 6.9603],
  ['Frankfurt', 'FRA', 50.1109, 8.6821],
  ['Dresden', 'DRS', 51.0504, 13.7373],
  ['Leipzig', 'LEJ', 51.3397, 12.3731],
  ['Paris', 'PAR', 48.8566, 2.3522],
  ['Lyon', 'LYS', 45.764, 4.8357],
  ['Marseille', 'MRS', 43.2965, 5.3698],
  ['London', 'LON', 51.5074, -0.1278],
  ['Edinburgh', 'EDI', 55.9533, -3.1883],
  ['Dublin', 'DUB', 53.3498, -6.2603],
  ['Amsterdam', 'AMS', 52.3676, 4.9041],
  ['Brussels', 'BRU', 50.8503, 4.3517],
  ['Prague', 'PRG', 50.0755, 14.4378],
  ['Vienna', 'VIE', 48.2082, 16.3738],
  ['Warsaw', 'WAW', 52.2297, 21.0122],
  ['Budapest', 'BUD', 47.4979, 19.0402],
  ['Rome', 'ROM', 41.9028, 12.4964],
  ['Milan', 'MIL', 45.4642, 9.19],
  ['Madrid', 'MAD', 40.4168, -3.7038],
  ['Barcelona', 'BCN', 41.3874, 2.1686],
  ['Lisbon', 'LIS', 38.7223, -9.1393],
  ['Zurich', 'ZRH', 47.3769, 8.5417],
  ['Geneva', 'GVA', 46.2044, 6.1432],
  ['Copenhagen', 'CPH', 55.6761, 12.5683],
  ['Stockholm', 'STO', 59.3293, 18.0686],
  ['Oslo', 'OSL', 59.9139, 10.7522],
  ['Helsinki', 'HEL', 60.1699, 24.9384],
  ['Athens', 'ATH', 37.9838, 23.7275],
  ['Istanbul', 'IST', 41.0082, 28.9784],
  ['Reykjavik', 'REK', 64.1466, -21.9426],
  ['New York', 'NYC', 40.7128, -74.006],
  ['Washington', 'WDC', 38.9072, -77.0369],
  ['Boston', 'BOS', 42.3601, -71.0589],
  ['Chicago', 'CHI', 41.8781, -87.6298],
  ['Los Angeles', 'LAX', 34.0522, -118.2437],
  ['San Francisco', 'SFO', 37.7749, -122.4194],
  ['Toronto', 'YTO', 43.6532, -79.3832],
  ['Montreal', 'YUL', 45.5017, -73.5673],
  ['Mexico City', 'MEX', 19.4326, -99.1332],
  ['Tokyo', 'TYO', 35.6762, 139.6503],
  ['Kyoto', 'KYO', 35.0116, 135.7681],
  ['Seoul', 'SEL', 37.5665, 126.978],
  ['Beijing', 'BJS', 39.9042, 116.4074],
  ['Shanghai', 'SHA', 31.2304, 121.4737],
  ['Hong Kong', 'HKG', 22.3193, 114.1694],
  ['Singapore', 'SIN', 1.3521, 103.8198],
  ['Bangkok', 'BKK', 13.7563, 100.5018],
  ['Sydney', 'SYD', -33.8688, 151.2093],
  ['Melbourne', 'MEL', -37.8136, 144.9631],
  ['Cairo', 'CAI', 30.0444, 31.2357],
  ['Cape Town', 'CPT', -33.9249, 18.4241],
  ['Marrakesh', 'RAK', 31.6295, -7.9811],
  ['Dubai', 'DXB', 25.2048, 55.2708],
].map(([name, code, lat, lon]) => ({ name, code, lat, lon }));

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function pathsFromEnv() {
  const root = process.env.INTAKE_ROOT
    ? path.resolve(process.env.INTAKE_ROOT)
    : rootDir;
  return {
    root,
    originals: process.env.INTAKE_ORIGINALS || path.join(root, 'photo-intake', 'originals'),
    privateDir: process.env.INTAKE_PRIVATE || path.join(root, 'photo-intake', 'private'),
    drafts: process.env.INTAKE_DRAFTS || path.join(root, 'photo-intake', 'drafts'),
    publicDir: process.env.INTAKE_PUBLIC || path.join(root, 'photos'),
    photosJson: process.env.INTAKE_PHOTOS_JSON || path.join(root, 'captures', 'photos', 'photos.json'),
    review: process.env.INTAKE_REVIEW || path.join(root, 'photo-intake', 'drafts', 'REVIEW.md'),
    geocodeCache: process.env.INTAKE_GEOCODE_CACHE || path.join(root, 'photo-intake', 'private', 'geocode-cache.json'),
  };
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function posixJoin(...parts) {
  return parts.join('/').replace(/\\/g, '/');
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file, fallback) {
  if (!(await exists(file))) return fallback;
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const text = JSON.stringify(value, null, 2) + '\n';
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, text);
  await fs.rename(tmp, file);
}

function assertNoGps(value, where, trail = '') {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoGps(item, where, `${trail}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (GPS_KEYS.has(key.toLowerCase())) {
        throw new Error(`Refusing to write ${where}: GPS field "${key}" at ${trail || 'root'}`);
      }
      assertNoGps(child, where, trail ? `${trail}.${key}` : key);
    }
    return;
  }
  if (typeof value === 'string' && COORD_PAIR.test(value)) {
    throw new Error(`Refusing to write ${where}: coordinate pair in ${trail || 'text'}`);
  }
}

function assertPublished(value, where) {
  assertNoGps(value, where);
  const walk = (node, trail) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${trail}[${i}]`));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        if (PUBLISHED_EXTRA_FORBIDDEN.has(key.toLowerCase())) {
          throw new Error(`Refusing to publish ${where}: field "${key}"`);
        }
        walk(child, trail ? `${trail}.${key}` : key);
      }
    }
  };
  walk(value, '');
}

function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function dayNumber(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function dayDiff(a, b) {
  return Math.abs(dayNumber(a) - dayNumber(b));
}

function nearestPlace(lat, lon) {
  let best = null;
  let bestKm = Infinity;
  for (const place of PLACES) {
    const km = haversineKm(lat, lon, place.lat, place.lon);
    if (km < bestKm) {
      best = place;
      bestKm = km;
    }
  }
  if (!best || bestKm > CITY_RADIUS_KM) return null;
  return { name: best.name, code: best.code, km: Math.round(bestKm) };
}

function placeCode(name) {
  const known = PLACES.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (known) return known.code;
  const letters = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();
  return letters.slice(0, 3) || 'UNK';
}

function placeTag(name) {
  if (!name || name === 'Unknown place') return [];
  const tag = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return tag ? [tag] : [];
}

function slugBase(filename) {
  const base = filename.replace(/\.[^.]+$/i, '');
  const slug = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'photo';
}

function exifDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function cleanString(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\0/g, '').trim();
}

async function readCaptureMeta(filePath) {
  let parsed = {};
  try {
    parsed = await exifr.parse(filePath, {
      gps: true,
      reviveValues: false,
      mergeOutput: true,
    }) || {};
  } catch {
    parsed = {};
  }
  const date = exifDate(parsed.DateTimeOriginal)
    || exifDate(parsed.CreateDate)
    || exifDate(parsed.DateTime)
    || null;
  const latitude = typeof parsed.latitude === 'number' ? parsed.latitude : null;
  const longitude = typeof parsed.longitude === 'number' ? parsed.longitude : null;
  const make = cleanString(parsed.Make);
  const model = cleanString(parsed.Model);
  const camera = [make, model].filter(Boolean).join(' ') || null;
  let dateSource = date ? 'exif' : null;
  let resolvedDate = date;
  if (!resolvedDate) {
    const stat = await fs.stat(filePath);
    resolvedDate = stat.mtime.toISOString().slice(0, 10);
    dateSource = 'file-modified';
  }
  return { date: resolvedDate, dateSource, latitude, longitude, camera };
}

async function walkImages(dir) {
  if (!(await exists(dir))) return [];
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walkImages(full));
    else if (INPUT_EXT.has(path.extname(ent.name).toLowerCase())) out.push(full);
  }
  return out;
}

function relativePosix(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

async function loadGeocodeCache(file) {
  const data = await readJson(file, {});
  return data && typeof data === 'object' ? data : {};
}

async function nominatimCity(lat, lon, cache, cacheFile) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('zoom', '10');
  url.searchParams.set('addressdetails', '1');
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'mke-photo-intake/1.0 (personal photography archive)',
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    cache[key] = null;
    await writeJson(cacheFile, cache);
    return null;
  }
  const body = await response.json();
  const address = body.address || {};
  const name = address.city || address.town || address.village || address.municipality || null;
  cache[key] = name;
  await writeJson(cacheFile, cache);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  return name;
}

async function placesForRecords(records, { geocode, cache, cacheFile }) {
  const located = records.filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
  const parent = new Map(located.map((r) => [r.id, r.id]));
  const find = (id) => {
    let cursor = id;
    while (parent.get(cursor) !== cursor) {
      parent.set(cursor, parent.get(parent.get(cursor)));
      cursor = parent.get(cursor);
    }
    return cursor;
  };
  const union = (a, b) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent.set(pa, pb);
  };
  for (let i = 0; i < located.length; i++) {
    for (let j = i + 1; j < located.length; j++) {
      const a = located[i];
      const b = located[j];
      if (a.date && b.date && dayDiff(a.date, b.date) > 14) continue;
      if (haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) <= CLUSTER_KM) {
        union(a.id, b.id);
      }
    }
  }
  const groups = new Map();
  for (const record of located) {
    const key = find(record.id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const placeById = new Map();
  for (const members of groups.values()) {
    const lat = members.reduce((sum, r) => sum + r.latitude, 0) / members.length;
    const lon = members.reduce((sum, r) => sum + r.longitude, 0) / members.length;
    let place = nearestPlace(lat, lon);
    if (!place && geocode) {
      const city = await nominatimCity(lat, lon, cache, cacheFile);
      if (city) place = { name: city, code: placeCode(city) };
    }
    const resolved = place
      ? { name: place.name, code: place.code }
      : { name: 'Unknown place', code: 'UNK' };
    for (const member of members) placeById.set(member.id, resolved);
  }
  for (const record of records) {
    if (!placeById.has(record.id)) {
      placeById.set(record.id, { name: 'Unknown place', code: 'UNK' });
    }
  }
  return placeById;
}

function sectionsForRecords(records, placeById) {
  const dated = records
    .filter((r) => r.date)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const trips = [];
  for (const record of dated) {
    const last = trips[trips.length - 1];
    if (!last || dayDiff(last.end, record.date) > TRIP_GAP_DAYS) {
      trips.push({ start: record.date, end: record.date, ids: [record.id] });
    } else {
      last.end = record.date;
      last.ids.push(record.id);
    }
  }
  const sectionById = new Map();
  for (const trip of trips) {
    const codes = [];
    for (const id of trip.ids) {
      const code = placeById.get(id).code;
      if (code !== 'UNK' && !codes.includes(code)) codes.push(code);
    }
    const [year, month] = trip.start.split('-');
    const label = codes.length
      ? `${month}.${year.slice(2)} | ${codes.join('-')}`
      : `${month}.${year.slice(2)}`;
    for (const id of trip.ids) sectionById.set(id, label);
  }
  for (const record of records) {
    if (!sectionById.has(record.id)) sectionById.set(record.id, 'undated');
  }
  return sectionById;
}

function sameList(a, b) {
  return JSON.stringify(a || []) === JSON.stringify(b || []);
}

function buildDraft(record, suggestion, previous) {
  if (!previous) {
    const draft = {
      id: record.id,
      sourceFile: record.sourceFile,
      sha256: record.sha256,
      status: 'draft',
      date: record.date,
      suggested: suggestion,
      location: suggestion.location,
      section: suggestion.section,
      caption: '',
      tags: suggestion.tags.slice(),
    };
    if (record.camera) draft.camera = record.camera;
    if (record.dateSource === 'file-modified') {
      draft.dateNote = 'No capture date in the file. This is the file modified date — correct it before approving.';
    }
    assertNoGps(draft, `draft ${record.id}`);
    return draft;
  }
  if (previous.status === 'published') return previous;
  const sectionUntouched = previous.section === previous.suggested?.section;
  const locationUntouched = previous.location === previous.suggested?.location;
  const tagsUntouched = sameList(previous.tags, previous.suggested?.tags);
  const next = {
    ...previous,
    date: record.date || previous.date,
    suggested: suggestion,
  };
  if (record.camera) next.camera = record.camera;
  if (locationUntouched) next.location = suggestion.location;
  if (sectionUntouched) next.section = suggestion.section;
  if (tagsUntouched) next.tags = suggestion.tags.slice();
  if (record.dateSource === 'file-modified' && !next.dateNote) {
    next.dateNote = 'No capture date in the file. This is the file modified date — correct it before approving.';
  }
  assertNoGps(next, `draft ${record.id}`);
  return next;
}

function reviewMarkdown(drafts) {
  const open = drafts.filter((d) => d.status !== 'published');
  const lines = [
    '# Draft labels',
    '',
    'Generated by `scripts/intake-photos.mjs`. Edit the JSON sidecar, not this file.',
    'Set `"status": "approved"` when the place, series, caption, and tags look right, then run the script again.',
    'The viewer already shows "Place, Month Year". Write a caption only when you want words beyond that.',
    'Coordinates are not stored here. They stay in `photo-intake/private/` on the machine that ran the script, and that folder is gitignored.',
    '',
  ];
  if (open.length === 0) {
    lines.push('No drafts waiting.');
    lines.push('');
    return lines.join('\n');
  }
  for (const draft of open) {
    lines.push(`## ${draft.id} — ${draft.status}`);
    lines.push('');
    lines.push(`- Source: ${draft.sourceFile}`);
    lines.push(`- Date: ${draft.date || 'unknown'}`);
    if (draft.camera) lines.push(`- Camera: ${draft.camera}`);
    if (draft.dateNote) lines.push(`- Date note: ${draft.dateNote}`);
    lines.push(`- Suggested place: ${draft.suggested?.location || ''}`);
    lines.push(`- Suggested series: ${draft.suggested?.section || ''}`);
    lines.push(`- Suggested tags: ${(draft.suggested?.tags || []).join(', ') || '(none)'}`);
    lines.push(`- Caption: ${draft.caption || '(blank — viewer will use place and date)'}`);
    lines.push(`- Sidecar: \`photo-intake/drafts/${draft.id}.json\``);
    lines.push('');
  }
  const text = lines.join('\n');
  if (COORD_PAIR.test(text) || /latitude|longitude|\bGPS\b/i.test(text)) {
    throw new Error('Refusing to write REVIEW.md because it contains location coordinates');
  }
  return text;
}

function jpegHasPrivateMetadata(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return true;
  let i = 2;
  while (i < buf.length - 3) {
    if (buf[i] !== 0xff) return true;
    const marker = buf[i + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0xff) {
      i += 1;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return true;
    // APP0 (JFIF) is format data, not camera metadata. Everything else in APP/COM is refused.
    const isApp = marker >= 0xe1 && marker <= 0xef;
    const isComment = marker === 0xfe;
    if (isApp || isComment) return true;
    i += 2 + len;
  }
  const head = buf.subarray(0, Math.min(buf.length, 65536)).toString('latin1');
  if (head.includes('Exif') || head.includes('http://ns.adobe.com/xap') || head.includes('ICC_PROFILE') || head.includes('GPSInfo')) {
    return true;
  }
  return false;
}

async function assertCleanJpeg(file) {
  const buf = await fs.readFile(file);
  if (jpegHasPrivateMetadata(buf)) {
    throw new Error(`Metadata remains in ${path.basename(file)}`);
  }
  const meta = await sharp(buf).metadata();
  if (meta.exif || meta.xmp || meta.icc || meta.iptc) {
    throw new Error(`Metadata remains in ${path.basename(file)}`);
  }
  return { width: meta.width, height: meta.height, bytes: buf.length };
}

async function writeDerivative(input, output, maxEdge, quality) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  const tmp = `${output}.tmp`;
  try {
    await sharp(input, { failOn: 'none' })
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:2:0' })
      .toFile(tmp);
    const info = await assertCleanJpeg(tmp);
    await fs.rename(tmp, output);
    return info;
  } catch (error) {
    await fs.rm(tmp, { force: true });
    throw error;
  }
}

function seedSlugs(photos) {
  const used = new Set();
  for (const photo of photos) {
    for (const key of ['thumb', 'display']) {
      if (!photo[key]) continue;
      const base = path.basename(photo[key]).replace(/\.jpe?g$/i, '');
      used.add(base);
    }
  }
  return used;
}

function allocateSlug(filename, used) {
  const base = slugBase(filename);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  const next = `${base}-${n}`;
  used.add(next);
  return next;
}

async function publishImages(draft, paths, slugUsed) {
  const source = path.join(paths.originals, ...draft.sourceFile.split('/'));
  if (!(await exists(source))) {
    throw new Error(`Missing original for ${draft.sourceFile}. It belongs in the originals folder, which is not deployed.`);
  }
  if (!draft.slug) draft.slug = allocateSlug(path.basename(draft.sourceFile), slugUsed);
  else slugUsed.add(draft.slug);
  const thumbAbs = path.join(paths.publicDir, 'thumbs', `${draft.slug}.jpg`);
  const displayAbs = path.join(paths.publicDir, 'display', `${draft.slug}.jpg`);
  const thumb = await writeDerivative(source, thumbAbs, THUMB_EDGE, THUMB_QUALITY);
  const display = await writeDerivative(source, displayAbs, DISPLAY_EDGE, DISPLAY_QUALITY);
  if (Math.max(thumb.width, thumb.height) > THUMB_EDGE) {
    throw new Error(`Thumb for ${draft.sourceFile} is larger than ${THUMB_EDGE}px`);
  }
  if (Math.max(display.width, display.height) > DISPLAY_EDGE) {
    throw new Error(`Display copy for ${draft.sourceFile} is larger than ${DISPLAY_EDGE}px`);
  }
  return {
    thumb: posixJoin('thumbs', `${draft.slug}.jpg`),
    display: posixJoin('display', `${draft.slug}.jpg`),
    width: display.width,
    height: display.height,
    thumbWidth: thumb.width,
    thumbHeight: thumb.height,
  };
}

function upsertPublic(photos, draft, images) {
  const entry = {
    id: draft.id,
    file: draft.sourceFile,
    sourceSha256: draft.sha256,
    status: images ? 'published' : 'draft',
    section: draft.section || '',
    date: draft.date || '',
    location: draft.location || '',
    caption: draft.caption || '',
    tags: Array.isArray(draft.tags) ? draft.tags : [],
  };
  if (images) Object.assign(entry, images);
  assertPublished(entry, draft.sourceFile);
  const index = photos.findIndex((photo) => photo.id === draft.id || photo.sourceSha256 === draft.sha256);
  if (index === -1) photos.push(entry);
  else photos[index] = { ...photos[index], ...entry };
}

async function loadPrivateRecords(dir) {
  if (!(await exists(dir))) return [];
  const names = await fs.readdir(dir);
  const records = [];
  for (const name of names) {
    if (!name.endsWith('.json') || name === 'geocode-cache.json') continue;
    const record = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
    if (record && record.id && record.sha256) records.push(record);
  }
  return records;
}

async function intake({ geocode }) {
  const paths = pathsFromEnv();
  await fs.mkdir(paths.originals, { recursive: true });
  await fs.mkdir(paths.privateDir, { recursive: true });
  await fs.mkdir(paths.drafts, { recursive: true });

  const existingPublic = await readJson(paths.photosJson, []);
  const publishedHashes = new Set(
    (Array.isArray(existingPublic) ? existingPublic : [])
      .filter((photo) => photo.status !== 'draft' && photo.sourceSha256)
      .map((photo) => photo.sourceSha256),
  );

  const files = await walkImages(paths.originals);
  const seen = new Set();
  let added = 0;
  for (const file of files) {
    const buf = await fs.readFile(file);
    const digest = sha256(buf);
    const sourceFile = relativePosix(paths.originals, file);
    if (seen.has(digest)) {
      console.log(`Skipping duplicate file ${sourceFile}`);
      continue;
    }
    seen.add(digest);
    if (publishedHashes.has(digest)) {
      console.log(`Already in the archive: ${sourceFile}`);
      continue;
    }
    const id = digest.slice(0, 12);
    const privatePath = path.join(paths.privateDir, `${id}.json`);
    if (await exists(privatePath)) continue;
    const meta = await readCaptureMeta(file);
    const record = {
      id,
      sha256: digest,
      sourceFile,
      bytes: buf.length,
      date: meta.date,
      dateSource: meta.dateSource,
      camera: meta.camera,
      latitude: meta.latitude,
      longitude: meta.longitude,
    };
    await writeJson(privatePath, record);
    added += 1;
    console.log(`Read metadata for ${record.sourceFile} (${meta.dateSource === 'exif' ? 'date from EXIF' : 'no EXIF date'})`);
  }

  const records = await loadPrivateRecords(paths.privateDir);
  const cache = geocode ? await loadGeocodeCache(paths.geocodeCache) : {};
  const placeById = await placesForRecords(records, {
    geocode,
    cache,
    cacheFile: paths.geocodeCache,
  });
  const sectionById = sectionsForRecords(records, placeById);

  const drafts = [];
  for (const record of records) {
    const place = placeById.get(record.id);
    const suggestion = {
      location: place.name,
      section: sectionById.get(record.id),
      caption: '',
      tags: placeTag(place.name),
    };
    const draftPath = path.join(paths.drafts, `${record.id}.json`);
    const previous = await readJson(draftPath, null);
    const draft = buildDraft(record, suggestion, previous);
    await writeJson(draftPath, draft);
    drafts.push(draft);
  }
  drafts.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id));
  await fs.writeFile(paths.review, reviewMarkdown(drafts));

  const photos = await readJson(paths.photosJson, []);
  if (!Array.isArray(photos)) throw new Error('photos.json is not an array');
  const slugUsed = seedSlugs(photos);
  let published = 0;
  for (const draft of drafts) {
    if (draft.status === 'published') {
      slugUsed.add(draft.slug);
      continue;
    }
    if (draft.status !== 'approved') {
      upsertPublic(photos, draft, null);
      continue;
    }
    if (!draft.location || draft.location === 'Unknown place' || !draft.section) {
      console.warn(`Not publishing ${draft.sourceFile}: set a real place and series, then approve again.`);
      upsertPublic(photos, draft, null);
      continue;
    }
    const images = await publishImages(draft, paths, slugUsed);
    draft.status = 'published';
    assertNoGps(draft, `draft ${draft.id}`);
    await writeJson(path.join(paths.drafts, `${draft.id}.json`), draft);
    upsertPublic(photos, draft, images);
    published += 1;
    console.log(`Published ${draft.sourceFile} → ${images.display}`);
  }
  assertPublished(photos, 'photos.json');
  await writeJson(paths.photosJson, photos);
  await fs.writeFile(paths.review, reviewMarkdown(drafts));

  console.log(`Originals scanned: ${files.length}. New metadata files: ${added}. Published this run: ${published}. Drafts still open: ${drafts.filter((d) => d.status !== 'published').length}.`);
}

function decodePhotoUrl(urlPath) {
  if (!urlPath.startsWith('/photos/')) return null;
  const rel = urlPath.slice('/photos/'.length);
  if (rel.includes('/')) return null;
  try {
    return decodeURIComponent(rel);
  } catch {
    return null;
  }
}

function rewriteHtml(html, lookup) {
  let next = html.replace(/<img\b([^>]*?)\bsrc="(\/photos\/[^"]+)"([^>]*)>/gi, (match, pre, src, post) => {
    const name = decodePhotoUrl(src);
    const info = name && lookup.get(name);
    if (!info) return match;
    const attrs = `${pre} ${post}`;
    const lazy = !/about-photo/.test(attrs);
    let extra = '';
    if (!/\swidth\s*=/.test(attrs)) extra += ` width="${info.thumbWidth}"`;
    if (!/\sheight\s*=/.test(attrs)) extra += ` height="${info.thumbHeight}"`;
    if (lazy && !/\sloading\s*=/.test(attrs)) extra += ' loading="lazy"';
    if (!/\sdecoding\s*=/.test(attrs)) extra += ' decoding="async"';
    return `<img${pre}src="/photos/${info.thumb}"${post}${extra}>`;
  });
  next = next.replace(/\bhref="(\/photos\/[^"]+)"/gi, (match, href) => {
    const name = decodePhotoUrl(href);
    const info = name && lookup.get(name);
    if (!info) return match;
    return `href="/photos/${info.display}"`;
  });
  return next;
}

async function htmlFiles(root) {
  const found = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === 'node_modules' || ent.name === '.git' || ent.name.startsWith('.')) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (ent.name.endsWith('.html')) found.push(full);
    }
  }
  await walk(root);
  return found;
}

async function referencedNames(root, photos) {
  const names = new Set();
  for (const photo of photos) {
    if (photo.file && !String(photo.file).includes('/')) names.add(photo.file);
  }
  for (const file of await htmlFiles(root)) {
    const html = await fs.readFile(file, 'utf8');
    const re = /\/photos\/([^"'\s]+)/g;
    let match;
    while ((match = re.exec(html))) {
      const rel = match[1];
      if (rel.includes('/')) continue;
      try {
        names.add(decodeURIComponent(rel));
      } catch {
        names.add(rel);
      }
    }
  }
  return names;
}

async function stripExisting() {
  const paths = pathsFromEnv();
  await fs.mkdir(paths.originals, { recursive: true });
  const photos = await readJson(paths.photosJson, []);
  if (!Array.isArray(photos)) throw new Error('photos.json is not an array');
  const names = await referencedNames(paths.root, photos);
  const rootFiles = (await fs.readdir(paths.publicDir))
    .filter((name) => INPUT_EXT.has(path.extname(name).toLowerCase()))
    .map((name) => path.join(paths.publicDir, name));

  let beforeBytes = 0;
  const byHash = new Map();
  for (const file of rootFiles) {
    const buf = await fs.readFile(file);
    beforeBytes += buf.length;
    const digest = sha256(buf);
    if (!byHash.has(digest)) byHash.set(digest, { digest, file, names: [] });
    byHash.get(digest).names.push(path.basename(file));
  }

  const catalogNames = new Set(photos.map((photo) => photo.file));
  const lookup = new Map();
  const slugUsed = seedSlugs(photos);
  let publishedBytes = 0;
  let publishedFiles = 0;

  for (const group of byHash.values()) {
    const linked = group.names.filter((name) => names.has(name));
    const destination = path.join(paths.originals, path.basename(group.file));
    if (!(await exists(destination))) await fs.copyFile(group.file, destination);
    if (linked.length === 0) {
      console.log(`Unlinked, not republished: ${group.names.join(', ')}`);
      continue;
    }
    const canonical = linked.find((name) => catalogNames.has(name)) || linked[0];
    const slug = allocateSlug(canonical, slugUsed);
    const thumbAbs = path.join(paths.publicDir, 'thumbs', `${slug}.jpg`);
    const displayAbs = path.join(paths.publicDir, 'display', `${slug}.jpg`);
    const thumb = await writeDerivative(group.file, thumbAbs, THUMB_EDGE, THUMB_QUALITY);
    const display = await writeDerivative(group.file, displayAbs, DISPLAY_EDGE, DISPLAY_QUALITY);
    publishedBytes += thumb.bytes + display.bytes;
    publishedFiles += 2;
    const info = {
      thumb: posixJoin('thumbs', `${slug}.jpg`),
      display: posixJoin('display', `${slug}.jpg`),
      width: display.width,
      height: display.height,
      thumbWidth: thumb.width,
      thumbHeight: thumb.height,
      sha256: group.digest,
    };
    for (const name of linked) lookup.set(name, info);
    console.log(`Stripped ${canonical} → ${info.thumb}, ${info.display}`);
  }

  for (const photo of photos) {
    const info = lookup.get(photo.file);
    if (!info) {
      console.warn(`No source file for catalog entry ${photo.file}`);
      continue;
    }
    photo.thumb = info.thumb;
    photo.display = info.display;
    photo.width = info.width;
    photo.height = info.height;
    photo.thumbWidth = info.thumbWidth;
    photo.thumbHeight = info.thumbHeight;
    photo.sourceSha256 = info.sha256;
    if (!photo.status) photo.status = 'published';
  }
  assertPublished(photos, 'photos.json');
  await writeJson(paths.photosJson, photos);

  for (const file of await htmlFiles(paths.root)) {
    const html = await fs.readFile(file, 'utf8');
    const next = rewriteHtml(html, lookup);
    if (next !== html) {
      await fs.writeFile(file, next);
      console.log(`Updated image paths in ${path.relative(paths.root, file)}`);
    }
  }

  for (const file of rootFiles) {
    await fs.rm(file);
  }

  const captures = photos.filter((photo) => photo.status !== 'draft' && photo.thumb);
  const thumbBytes = await sumExisting(captures.map((photo) => path.join(paths.publicDir, photo.thumb)));
  const displayBytes = await sumExisting(captures.map((photo) => path.join(paths.publicDir, photo.display)));
  const report = {
    originalFiles: rootFiles.length,
    originalBytes: beforeBytes,
    uniqueOriginals: byHash.size,
    derivativeFiles: publishedFiles,
    derivativeBytes: publishedBytes,
    captures: captures.length,
    capturesThumbBytes: thumbBytes,
    capturesDisplayBytes: displayBytes,
  };
  console.log('PAYLOAD ' + JSON.stringify(report));
}

async function sumExisting(files) {
  let total = 0;
  for (const file of files) {
    if (await exists(file)) total += (await fs.stat(file)).size;
  }
  return total;
}

async function checkPublic() {
  const paths = pathsFromEnv();
  const photos = await readJson(paths.photosJson, []);
  assertPublished(photos, 'photos.json');
  const problems = [];
  if (await exists(paths.drafts)) {
    for (const name of await fs.readdir(paths.drafts)) {
      const full = path.join(paths.drafts, name);
      if (name.endsWith('.json')) {
        try {
          assertNoGps(JSON.parse(await fs.readFile(full, 'utf8')), name);
        } catch (error) {
          problems.push(error.message);
        }
      } else if (name.endsWith('.md')) {
        const text = await fs.readFile(full, 'utf8');
        if (COORD_PAIR.test(text) || /latitude|longitude|\bGPS\b/i.test(text)) {
          problems.push(`${name} contains coordinates`);
        }
      }
    }
  }
  async function walkPublic(dir) {
    if (!(await exists(dir))) return;
    for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walkPublic(full);
        continue;
      }
      if (!/\.jpe?g$/i.test(ent.name)) continue;
      try {
        await assertCleanJpeg(full);
      } catch (error) {
        problems.push(error.message);
      }
    }
  }
  await walkPublic(paths.publicDir);
  const rootImages = existsSync(paths.publicDir)
    ? (await fs.readdir(paths.publicDir)).filter((name) => INPUT_EXT.has(path.extname(name).toLowerCase()))
    : [];
  if (rootImages.length) {
    problems.push(`Full-size images are still in the public photos folder: ${rootImages.join(', ')}`);
  }
  if (paths.root === rootDir) {
    try {
      const tracked = execFileSync(
        'git',
        ['ls-files', '--', 'photo-intake/originals', 'photo-intake/private'],
        { cwd: rootDir, encoding: 'utf8' },
      );
      const leaked = tracked.split('\n').map((line) => line.trim()).filter((line) => line && !line.endsWith('.gitkeep'));
      if (leaked.length) problems.push(`Tracked private files:\n${leaked.join('\n')}`);
    } catch (error) {
      problems.push(`Could not ask git about private paths: ${error.message}`);
    }
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log('Public images and photo data have no GPS or other embedded metadata.');
}

const args = new Set(process.argv.slice(2));
const run = args.has('--strip-existing')
  ? stripExisting
  : args.has('--check-public')
    ? checkPublic
    : () => intake({ geocode: args.has('--geocode') });

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
