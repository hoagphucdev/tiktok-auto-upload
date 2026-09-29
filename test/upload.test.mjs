import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chunkRanges, planChunks } from '../src/upload.mjs'
import { listPending } from '../src/queue.mjs'

const MB = 1024 * 1024

test('file nhỏ gửi 1 chunk', () => {
  assert.deepEqual(planChunks(3 * MB), { chunkSize: 3 * MB, count: 1 })
  assert.deepEqual(planChunks(64 * MB), { chunkSize: 64 * MB, count: 1 })
})

test('file lớn: chunk cuối gánh phần dư, ranges phủ kín file', () => {
  const size = 105 * MB + 123
  const plan = planChunks(size)
  assert.equal(plan.chunkSize, 10 * MB)
  assert.equal(plan.count, 10)
  const ranges = chunkRanges(size, plan)
  assert.equal(ranges[0].start, 0)
  assert.equal(ranges.at(-1).end, size - 1)
  for (let i = 1; i < ranges.length; i++) assert.equal(ranges[i].start, ranges[i - 1].end + 1)
  const last = ranges.at(-1)
  assert.ok(last.end - last.start + 1 <= 128 * MB)
})

test('queue đọc caption từ .txt/.json và bỏ qua video chưa tới giờ', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-queue-'))
  fs.writeFileSync(path.join(dir, 'a.mp4'), 'x')
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hello #fyp\n')
  fs.writeFileSync(path.join(dir, 'b.mp4'), 'x')
  fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ caption: 'later', publishAt: '2999-01-01T00:00:00Z' }))
  fs.writeFileSync(path.join(dir, 'notes.md'), 'ignore')

  const pending = listPending(dir)
  assert.equal(pending.length, 1)
  assert.equal(path.basename(pending[0].file), 'a.mp4')
  assert.equal(pending[0].meta.caption, 'hello #fyp')
})
