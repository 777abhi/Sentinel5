const test = require('node:test');
const assert = require('node:assert');
const { stripHtmlTags, formatDateToISO } = require('../utils');

test('stripHtmlTags', async (t) => {
  await t.test('strips standard HTML tags', () => {
    assert.strictEqual(stripHtmlTags('<p>Hello World</p>'), 'Hello World');
  });

  await t.test('strips nested HTML tags', () => {
    assert.strictEqual(stripHtmlTags('<div><span>Content</span></div>'), 'Content');
  });

  await t.test('handles empty or null string', () => {
    assert.strictEqual(stripHtmlTags(''), '');
    assert.strictEqual(stripHtmlTags(null), '');
    assert.strictEqual(stripHtmlTags(undefined), '');
  });

  await t.test('trims whitespace', () => {
    assert.strictEqual(stripHtmlTags('  <p>  Text  </p>  '), 'Text');
  });
});

test('formatDateToISO', async (t) => {
  await t.test('formats valid date string to full ISO 8601', () => {
    const inputDate = '2023-10-27T10:00:00Z';
    const result = formatDateToISO(inputDate);
    assert.strictEqual(result, '2023-10-27T10:00:00.000Z');
  });

  await t.test('formats timestamp', () => {
      const inputDate = 1698400800000;
      const result = formatDateToISO(inputDate);
      assert.strictEqual(result, '2023-10-27T10:00:00.000Z');
  });

  await t.test('returns empty string for invalid date', () => {
    assert.strictEqual(formatDateToISO('invalid-date'), '');
  });

  await t.test('returns empty string for null/undefined/empty', () => {
    assert.strictEqual(formatDateToISO(''), '');
    assert.strictEqual(formatDateToISO(null), '');
    assert.strictEqual(formatDateToISO(undefined), '');
  });
});
