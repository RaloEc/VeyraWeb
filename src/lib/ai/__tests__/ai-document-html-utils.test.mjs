import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPlainTextLength,
  isExplicitMediaDeletionPrompt,
  protectMediaNodesInHtml,
  restoreMediaNodesInHtml,
  sanitizeAiHtmlOutput,
  stripPromptNodesFromHtml,
} from '../ai-document-html-utils.ts';

test('stripPromptNodesFromHtml removes ai-prompt and bookmark-prompt while keeping rich formatting', () => {
  const input =
    '<h1 style="text-align: center"><span style="color: #3B82F6">Título</span></h1>' +
    '<p style="text-align: justify">Texto <u>subrayado</u> y <mark data-color="rgba(250, 204, 21, 0.35)">resaltado</mark>.</p>' +
    '<div data-type="ai-prompt"></div>' +
    '<div data-type="bookmark-prompt"><span>nested</span></div>' +
    '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Hecho</p></li></ul>';

  const cleaned = stripPromptNodesFromHtml(input);
  assert.equal(cleaned.includes('data-type="ai-prompt"'), false);
  assert.equal(cleaned.includes('data-type="bookmark-prompt"'), false);
  assert.equal(cleaned.includes('<h1 style="text-align: center">'), true);
  assert.equal(cleaned.includes('<u>subrayado</u>'), true);
  assert.equal(cleaned.includes('data-type="taskList"'), true);
});

test('protectMediaNodesInHtml and restoreMediaNodesInHtml round-trip images, YouTube embeds, and bookmark cards', () => {
  const imgHtml =
    '<img src="veyra-attachment://user1/note1/img.png" data-caption="Costo $100 &amp; $200" data-width="50" style="width: 50%;">';
  const ytHtml =
    '<div data-youtube-video="" data-video-id="dQw4w9WgXcQ" data-embed="true" class="veyra-youtube-node"><div class="veyra-youtube-wrapper"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe></div></div>';
  const bookmarkHtml =
    '<a href="https://example.com" class="veyra-bookmark-card" data-bookmark-card="" data-bookmark-url="https://example.com"><div class="veyra-bookmark-body"><div class="veyra-bookmark-title">Example</div><img class="veyra-bookmark-favicon" src="https://example.com/fav.ico"></div><div class="veyra-bookmark-cover-wrapper"><img class="veyra-bookmark-cover" src="https://example.com/cover.png"></div></a>';

  const original = `<h1>Notas</h1>${imgHtml}<p>Entre medios</p>${ytHtml}${bookmarkHtml}<div data-type="ai-prompt"></div>`;
  const { protectedHtml, tokens } = protectMediaNodesInHtml(original);

  assert.equal(tokens.size, 3);
  assert.equal(protectedHtml.includes('veyra-attachment://'), false);
  assert.equal(protectedHtml.includes('data-youtube-video'), false);
  assert.equal(protectedHtml.includes('data-bookmark-card'), false);
  assert.equal(protectedHtml.includes('data-type="ai-prompt"'), false);
  assert.equal(protectedHtml.includes('<p>[[VEYRA_MEDIA_0]]</p>'), true);
  assert.equal(protectedHtml.includes('<p>[[VEYRA_MEDIA_1]]</p>'), true);
  assert.equal(protectedHtml.includes('<p>[[VEYRA_MEDIA_2]]</p>'), true);

  // Simulate AI reformatting paragraphs and keeping bare/wrapped markers
  const aiEdited =
    '<h1 style="text-align: center"><span style="color: #3B82F6">Notas</span></h1>' +
    '[[VEYRA_MEDIA_0]]' +
    '<p style="text-align: justify">Entre medios</p>' +
    '<p>[[VEYRA_MEDIA_1]]</p>' +
    '<p>[[VEYRA_MEDIA_2]]</p>';

  const restored = restoreMediaNodesInHtml(aiEdited, tokens, { preserveDroppedMedia: true });
  assert.equal(restored.includes(bookmarkHtml), true);
  assert.equal(restored.includes(ytHtml), true);
  assert.equal(restored.includes(imgHtml), true);
  assert.equal(restored.includes('Costo $100 &amp; $200'), true);
  assert.equal(restored.includes('VEYRA_MEDIA_'), false);
});

test('restoreMediaNodesInHtml recovers dropped media when preserveDroppedMedia is true', () => {
  const imgHtml = '<img src="veyra-attachment://abc/photo.jpg">';
  const { tokens } = protectMediaNodesInHtml(`<p>Texto</p>${imgHtml}`);

  const aiDropped = '<p style="text-align: justify">Texto editado</p>';

  const preserved = restoreMediaNodesInHtml(aiDropped, tokens, { preserveDroppedMedia: true });
  assert.equal(preserved.includes(imgHtml), true);

  const allowedDelete = restoreMediaNodesInHtml(aiDropped, tokens, { preserveDroppedMedia: false });
  assert.equal(allowedDelete.includes(imgHtml), false);
});

test('isExplicitMediaDeletionPrompt detects explicit deletion instructions only', () => {
  assert.equal(isExplicitMediaDeletionPrompt('elimina las imágenes de la nota'), true);
  assert.equal(isExplicitMediaDeletionPrompt('borra el video de youtube'), true);
  assert.equal(isExplicitMediaDeletionPrompt('justifica todo el documento y pon H1 azul'), false);
  assert.equal(isExplicitMediaDeletionPrompt('elimina los errores ortográficos de la nota'), false);
});

test('sanitizeAiHtmlOutput strips markdown fences and accidental prompt divs', () => {
  const dirty = '```html\n<h2>Hola</h2><div data-type="ai-prompt"></div><p>Mundo</p>\n```';
  const clean = sanitizeAiHtmlOutput(dirty);
  assert.equal(clean, '<h2>Hola</h2><p>Mundo</p>');
  assert.equal(extractPlainTextLength('<p>Hola &nbsp; mundo</p>'), 10);
});
