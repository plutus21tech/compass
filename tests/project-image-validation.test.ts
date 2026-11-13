import assert from 'node:assert/strict'
import test from 'node:test'
import {
  detectProjectImageMimeType,
  insertMarkdownImage,
  isProjectImageMimeType,
  projectImageExtension,
  transferredImageFiles,
} from '../lib/project-image-validation'

test('project images accept only verified raster formats', () => {
  assert.equal(detectProjectImageMimeType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png')
  assert.equal(detectProjectImageMimeType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg')
  assert.equal(detectProjectImageMimeType(new TextEncoder().encode('GIF89a')), 'image/gif')
  assert.equal(detectProjectImageMimeType(new TextEncoder().encode('RIFF0000WEBP')), 'image/webp')
  assert.equal(detectProjectImageMimeType(new TextEncoder().encode('<svg onload="alert(1)">')), null)
  assert.equal(isProjectImageMimeType('image/svg+xml'), false)
  assert.equal(projectImageExtension('image/jpeg'), 'jpg')
})

function transfer(files: File[], text = '') {
  return { files, getData: (format: string) => (format === 'text/plain' ? text : '') }
}

test('a pasted or dropped screenshot is picked up as an image', () => {
  const shot = new File([new Uint8Array([1])], 'image.png', { type: 'image/png' })
  const doc = new File(['x'], 'notes.pdf', { type: 'application/pdf' })
  assert.deepEqual(transferredImageFiles(transfer([shot])), [shot])
  assert.deepEqual(transferredImageFiles(transfer([doc, shot])), [shot])
  assert.deepEqual(transferredImageFiles(transfer([doc])), [])
  assert.deepEqual(transferredImageFiles(transfer([])), [])
})

test('a paste that also has text stays a text paste', () => {
  const shot = new File([new Uint8Array([1])], 'image.png', { type: 'image/png' })
  assert.deepEqual(transferredImageFiles(transfer([shot], 'A1\tB1')), [])
})

test('an image goes in at the cursor on its own paragraph', () => {
  assert.equal(insertMarkdownImage('', '/i.png'), '![image](/i.png)')
  assert.equal(insertMarkdownImage('Steps:\n', '/i.png'), 'Steps:\n\n![image](/i.png)')
  assert.equal(insertMarkdownImage('before after', '/i.png', 6), 'before\n\n![image](/i.png)\n\nafter')
  assert.equal(insertMarkdownImage('top', '/i.png', 0), '![image](/i.png)\n\ntop')
  assert.equal(insertMarkdownImage('abc', '/i.png', 99), 'abc\n\n![image](/i.png)')
})
