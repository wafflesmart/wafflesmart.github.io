#!/usr/bin/env node
/**
 * Runs the intake script against sample JPEGs that carry GPS, a camera name,
 * and a capture date. Checks that drafts can name the place, and that
 * published files and photos.json do not contain coordinates or camera EXIF.
 */

import { spawn, execFileSync } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const piexif = require('piexifjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'intake-photos.mjs');
const repoRoot = path.resolve(here, '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`exit ${code}\n${out}\n${err}`));
      else resolve(out);
    });
  });
}

async function sampleJpeg(file, { date, latRef, lat, lonRef, lon }) {
  const plain = await sharp({
    create: {
      width: 2400,
      height: 1600,
      channels: 3,
      background: { r: 30, g: 70, b: 120 },
    },
  }).jpeg().toBuffer();
  const dumped = piexif.dump({
    '0th': {
      [piexif.ImageIFD.Make]: 'TestCamZX9',
      [piexif.ImageIFD.Model]: 'TestCamZX9',
      [piexif.ImageIFD.DateTime]: date,
    },
    Exif: {
      [piexif.ExifIFD.DateTimeOriginal]: date,
    },
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: latRef,
      [piexif.GPSIFD.GPSLatitude]: lat,
      [piexif.GPSIFD.GPSLongitudeRef]: lonRef,
      [piexif.GPSIFD.GPSLongitude]: lon,
    },
  });
  const inserted = piexif.insert(dumped, plain.toString('binary'));
  await fs.writeFile(file, Buffer.from(inserted, 'binary'));
}

function forbidden(text, label) {
  if (/latitude|longitude/i.test(text)) throw new Error(`${label} contains a coordinate field`);
  if (/\bGPS\b/.test(text)) throw new Error(`${label} contains GPS`);
  if (/\b-?\d{1,3}\.\d{3,}/.test(text)) throw new Error(`${label} contains a precise coordinate: ${text.match(/\b-?\d{1,3}\.\d{3,}/)[0]}`);
  if (text.includes('TestCamZX9') && label.startsWith('public')) {
    throw new Error(`${label} still names the camera`);
  }
}

async function main() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mke-intake-'));
  const originals = path.join(tmp, 'originals');
  const privateDir = path.join(tmp, 'private');
  const drafts = path.join(tmp, 'drafts');
  const publicDir = path.join(tmp, 'public');
  const photosJson = path.join(tmp, 'photos.json');
  const review = path.join(drafts, 'REVIEW.md');
  await fs.mkdir(originals);
  await fs.writeFile(photosJson, '[]\n');

  await sampleJpeg(path.join(originals, 'berlin.jpg'), {
    date: '2025:11:25 15:04:00',
    latRef: 'N',
    lat: [[52, 1], [31, 1], [12, 1]],
    lonRef: 'E',
    lon: [[13, 1], [24, 1], [18, 1]],
  });
  await sampleJpeg(path.join(originals, 'paris.jpg'), {
    date: '2025:11:27 12:00:00',
    latRef: 'N',
    lat: [[48, 1], [51, 1], [24, 1]],
    lonRef: 'E',
    lon: [[2, 1], [21, 1], [8, 1]],
  });
  await sampleJpeg(path.join(originals, 'london.jpg'), {
    date: '2024:01:02 09:00:00',
    latRef: 'N',
    lat: [[51, 1], [30, 1], [27, 1]],
    lonRef: 'W',
    lon: [[0, 1], [7, 1], [40, 1]],
  });

  const env = {
    INTAKE_ROOT: tmp,
    INTAKE_ORIGINALS: originals,
    INTAKE_PRIVATE: privateDir,
    INTAKE_DRAFTS: drafts,
    INTAKE_PUBLIC: publicDir,
    INTAKE_PHOTOS_JSON: photosJson,
    INTAKE_REVIEW: review,
    INTAKE_GEOCODE_CACHE: path.join(privateDir, 'geocode-cache.json'),
  };

  await run([], env);

  const privateFiles = (await fs.readdir(privateDir)).filter((name) => name.endsWith('.json') && name !== 'geocode-cache.json');
  assert(privateFiles.length === 3, `expected 3 private sidecars, got ${privateFiles.length}`);
  const privates = [];
  for (const name of privateFiles) {
    privates.push(JSON.parse(await fs.readFile(path.join(privateDir, name), 'utf8')));
  }
  const berlinPrivate = privates.find((record) => record.sourceFile === 'berlin.jpg');
  assert(berlinPrivate, 'missing private record for berlin.jpg');
  assert(Math.abs(berlinPrivate.latitude - 52.52) < 0.01, `berlin latitude not read (${berlinPrivate.latitude})`);
  assert(Math.abs(berlinPrivate.longitude - 13.405) < 0.01, `berlin longitude not read (${berlinPrivate.longitude})`);
  assert(berlinPrivate.camera === 'TestCamZX9 TestCamZX9', `camera not read (${berlinPrivate.camera})`);

  const draftFiles = (await fs.readdir(drafts)).filter((name) => name.endsWith('.json'));
  assert(draftFiles.length === 3, `expected 3 drafts, got ${draftFiles.length}`);
  const draftList = [];
  for (const name of draftFiles) {
    const text = await fs.readFile(path.join(drafts, name), 'utf8');
    forbidden(text, `draft ${name}`);
    assert(text.includes('TestCamZX9'), 'draft should keep the camera name for labeling');
    draftList.push(JSON.parse(text));
  }
  const berlin = draftList.find((draft) => draft.sourceFile === 'berlin.jpg');
  const paris = draftList.find((draft) => draft.sourceFile === 'paris.jpg');
  const london = draftList.find((draft) => draft.sourceFile === 'london.jpg');
  assert(berlin.location === 'Berlin', `berlin place was ${berlin.location}`);
  assert(paris.location === 'Paris', `paris place was ${paris.location}`);
  assert(london.location === 'London', `london place was ${london.location}`);
  assert(berlin.section === '11.25 | BER-PAR', `berlin series was ${berlin.section}`);
  assert(paris.section === '11.25 | BER-PAR', `paris series was ${paris.section}`);
  assert(london.section === '01.24 | LON', `london series was ${london.section}`);
  assert(berlin.tags.includes('berlin'), 'expected a berlin tag');
  assert(berlin.date === '2025-11-25', `berlin date was ${berlin.date}`);
  assert(berlin.status === 'draft', 'new photos should stay drafts');

  const reviewText = await fs.readFile(review, 'utf8');
  forbidden(reviewText, 'REVIEW.md');
  assert(reviewText.includes('Berlin'), 'review should name the suggested place');

  let photos = JSON.parse(await fs.readFile(photosJson, 'utf8'));
  assert(photos.length === 3, `expected 3 catalog drafts, got ${photos.length}`);
  assert(photos.every((photo) => photo.status === 'draft'), 'nothing should publish before approval');
  forbidden(JSON.stringify(photos), 'public photos.json');
  const publicEntries = await fs.readdir(publicDir).catch(() => []);
  assert(publicEntries.length === 0, 'approved nothing, so no public images yet');

  berlin.status = 'approved';
  berlin.caption = 'Evening light';
  await fs.writeFile(path.join(drafts, `${berlin.id}.json`), JSON.stringify(berlin, null, 2) + '\n');
  await run([], env);

  photos = JSON.parse(await fs.readFile(photosJson, 'utf8'));
  forbidden(JSON.stringify(photos), 'public photos.json');
  const published = photos.filter((photo) => photo.status === 'published');
  const stillDraft = photos.filter((photo) => photo.status === 'draft');
  assert(published.length === 1, `expected one published photo, got ${published.length}`);
  assert(stillDraft.length === 2, 'unapproved photos should remain drafts');
  assert(published[0].caption === 'Evening light', 'approved caption was not kept');
  assert(published[0].location === 'Berlin', 'published location missing');
  assert(published[0].thumb && published[0].display, 'published entry needs thumb and display');
  assert(!('camera' in published[0]), 'camera must not be published');
  assert(published[0].width > published[0].thumbWidth, 'display copy should be larger than the thumb');
  assert(Math.max(published[0].thumbWidth, published[0].thumbHeight) <= 600, 'thumb exceeds 600px');
  assert(Math.max(published[0].width, published[0].height) <= 2000, 'display copy exceeds 2000px');

  for (const relative of [published[0].thumb, published[0].display]) {
    const buf = await fs.readFile(path.join(publicDir, relative));
    const text = buf.toString('latin1');
    assert(!text.includes('Exif'), `${relative} still has EXIF`);
    assert(!text.includes('TestCamZX9'), `${relative} still names the camera`);
    assert(!text.includes('GPS'), `${relative} still has a GPS marker`);
    const meta = await sharp(buf).metadata();
    assert(!meta.exif && !meta.xmp && !meta.icc, `${relative} still has metadata according to sharp`);
    const edge = Math.max(meta.width, meta.height);
    const limit = relative.startsWith('thumbs/') ? 600 : 2000;
    assert(edge <= limit && meta.width === (relative.startsWith('thumbs/') ? published[0].thumbWidth : published[0].width), `${relative} dimensions were not recorded`);
  }

  const original = await fs.readFile(path.join(originals, 'berlin.jpg'));
  assert(original.toString('latin1').includes('TestCamZX9'), 'the original should keep its metadata');
  const display = await fs.readFile(path.join(publicDir, published[0].display));
  assert(display.length < original.length, 'display copy should be smaller than the original sample');

  await run(['--check-public'], env);
  await run([], env);
  const again = JSON.parse(await fs.readFile(photosJson, 'utf8'));
  assert(again.filter((photo) => photo.status === 'published').length === 1, 'a second run published a duplicate');

  execFileSync('git', ['check-ignore', '-q', '--', 'photo-intake/originals/sample.jpg'], { cwd: repoRoot });
  execFileSync('git', ['check-ignore', '-q', '--', 'photo-intake/private/sample.json'], { cwd: repoRoot });
  let keepIgnored = false;
  try {
    execFileSync('git', ['check-ignore', '-q', '--', 'photo-intake/originals/.gitkeep'], { cwd: repoRoot });
    keepIgnored = true;
  } catch {
    keepIgnored = false;
  }
  assert(!keepIgnored, '.gitkeep in originals should stay tracked so the folder exists');

  await fs.rm(tmp, { recursive: true, force: true });
  console.log('Intake test passed on 3 sample images (1 published, 2 left as drafts).');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
