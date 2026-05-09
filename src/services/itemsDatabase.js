import { decode } from '@msgpack/msgpack'

const DATA_BASE = `${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/data`

let twItemsCache = null
let twItemsLoadPromise = null
let twNameIndex = null

export function normalizeItemName(value) {
  return String(value ?? '')
    .split('')
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code > 0x1f && (code < 0x7f || code > 0x9f) && (code < 0xe000 || code > 0xf8ff)
    })
    .join('')
    .trim()
    .toLocaleLowerCase('zh-Hant')
}

async function loadTwItems(signal) {
  if (twItemsCache) return twItemsCache
  if (twItemsLoadPromise) return twItemsLoadPromise

  twItemsLoadPromise = (async () => {
    const response = await fetch(`${DATA_BASE}/tw-items.msgpack`, { signal })
    if (!response.ok) {
      throw new Error(`物品資料載入失敗 (${response.status})`)
    }

    const buffer = await response.arrayBuffer()
    twItemsCache = decode(new Uint8Array(buffer))
    return twItemsCache
  })()

  return twItemsLoadPromise
}

function buildTwNameIndex(itemsMap) {
  if (twNameIndex) return twNameIndex

  twNameIndex = new Map()
  Object.entries(itemsMap).forEach(([itemId, item]) => {
    const name = item?.tw
    const normalizedName = normalizeItemName(name)
    if (!normalizedName || twNameIndex.has(normalizedName)) return

    twNameIndex.set(normalizedName, {
      id: Number(itemId),
      name,
      raw: item,
    })
  })

  return twNameIndex
}

export async function findTwItemByName(itemName, signal = null) {
  const normalizedName = normalizeItemName(itemName)
  if (!normalizedName) return null

  const itemsMap = await loadTwItems(signal)
  const nameIndex = buildTwNameIndex(itemsMap)
  return nameIndex.get(normalizedName) ?? null
}

export async function searchTwItemCandidates(itemName, limit = 6, signal = null) {
  const normalizedName = normalizeItemName(itemName)
  if (!normalizedName) return []

  const itemsMap = await loadTwItems(signal)
  const candidates = []

  for (const [itemId, item] of Object.entries(itemsMap)) {
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError')

    const name = item?.tw
    const candidateName = normalizeItemName(name)
    if (!candidateName || !candidateName.includes(normalizedName)) continue

    candidates.push({ id: Number(itemId), name, raw: item })
    if (candidates.length >= limit) break
  }

  return candidates
}