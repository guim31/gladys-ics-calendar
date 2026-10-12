// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the message tables of the
// code and the documentation. German says "du", never the polite "Sie";
// Spanish says "usted".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import { ERROR_TEXT, LOCALES, REPORT_TEXT, TEXT } from '../src/i18n.js';
import { WIDGET_TEXT } from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?!\p{L})/u;
// Familiar Spanish where "usted" is the rule.
const FAMILIAR_SPANISH = /(?<!\p{L})(tú|tus|tienes|puedes|quieres|comparte|pega|elige)(?!\p{L})/iu;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  section: 600,
  message: 200,
  short: 40,
};

const sorted = (keys) => [...keys].sort();

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  if (lang === 'es' && FAMILIAR_SPANISH.test(text)) {
    found.push(`${path} uses the familiar form: "${text}"`);
  }
  return found;
}

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key, parent) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key, value));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      let max = MAX[key] ?? MAX.label;
      if (path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)) {
        max = MAX.catalog;
      } else if (/^manifest\.widgets\[\d+\]\.label$/.test(path)) {
        max = MAX.widgetLabel;
      } else if (parent?.type === 'section') {
        max = MAX.section;
      }
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child, value);
    }
  };
  walk(root, 'manifest', null, null);
  return texts;
}

/** Tables written one language at a time: same keys everywhere, no empty text. */
function tableProblems(table, name, max, render = (value) => value) {
  const found = [];
  if (JSON.stringify(sorted(Object.keys(table))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${name} has [${Object.keys(table)}], expected exactly [${LANGS}]`);
  }
  for (const lang of LANGS) {
    const entries = table[lang] ?? {};
    if (
      JSON.stringify(sorted(Object.keys(entries))) !== JSON.stringify(sorted(Object.keys(table.en)))
    ) {
      found.push(`${name}.${lang} does not have the keys of ${name}.en`);
    }
    for (const [key, value] of Object.entries(entries)) {
      found.push(...textProblems(render(value), `${name}.${lang}.${key}`, lang, max));
    }
  }
  return found;
}

const call = (value) => (typeof value === 'function' ? value(12, 30) : value);

test('the configuration offers the four languages', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  assert.deepEqual(Object.keys(LOCALES), LANGS);
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 100, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('every message table of the code has the four languages', () => {
  assert.deepEqual(tableProblems(TEXT, 'TEXT', MAX.message), []);
  assert.deepEqual(tableProblems(ERROR_TEXT, 'ERROR_TEXT', MAX.message, call), []);
  assert.deepEqual(
    tableProblems(REPORT_TEXT, 'REPORT_TEXT', MAX.message, (value) =>
      typeof value === 'function' ? value('Famille', 'Alice', 'HTTP 404') : value,
    ),
    [],
  );
  assert.deepEqual(
    tableProblems(WIDGET_TEXT, 'WIDGET_TEXT', MAX.message, (value) =>
      typeof value === 'function' ? value(7) : value,
    ),
    [],
  );
  // Widget rows and statuses: short.
  for (const key of [
    'allDay',
    'today',
    'tomorrow',
    'unreachable',
    'added',
    'cancelled',
    'rescheduled',
    'updated',
    'syncButton',
  ]) {
    for (const lang of LANGS) {
      assert.ok(TEXT[lang][key].length <= 24, `TEXT.${lang}.${key}`);
    }
  }
});

test('the guard catches a missing language, an empty text and the wrong form of address', () => {
  assert.equal(problems({ en: 'Calendar', fr: 'Calendrier', de: 'Kalender' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: '', es: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of ['Wählen Sie', 'Ihr Kalender', 'Ihre Adresse', 'mit Ihrem']) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'Pega tu dirección' }, 'x', 60).length, 1);
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'Pegue su dirección' }, 'x', 60),
    [],
  );
  const forgotten = structuredClone(manifest);
  delete forgotten.account_schema[2].placeholder.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.account_schema[2].placeholder has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
});

test('the four documentations exist, with the same sections', async () => {
  const headings = {};
  for (const lang of LANGS) {
    const text = await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8');
    assert.ok(text.length > 3000, `docs/${lang}.md is too short`);
    headings[lang] = text
      .split('\n')
      .filter((line) => /^#{1,3} /.test(line))
      .map((line) => line.match(/^#+/)[0]);
    if (lang === 'de') {
      assert.ok(!POLITE_GERMAN.test(text), 'docs/de.md uses the polite form');
    }
  }
  for (const lang of LANGS) {
    assert.deepEqual(
      headings[lang],
      headings.en,
      `docs/${lang}.md does not follow the sections of docs/en.md`,
    );
  }
});
