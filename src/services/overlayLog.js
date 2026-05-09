const EVENT_NAME = 'LogLine'
const MESSAGE_PREFIX = '正在確認「'
const MESSAGE_SUFFIX = '」的持有數量。'

function isDecoration(character) {
  const code = character.charCodeAt(0)
  return (
    /\s/.test(character) ||
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0xe000 && code <= 0xf8ff)
  )
}

function cleanItemName(name) {
  let start = 0
  let end = name.length - 1

  while (start <= end && isDecoration(name[start])) start++
  while (end >= start && isDecoration(name[end])) end--

  return start > end ? '' : name.slice(start, end + 1)
}

function parseMessage(message) {
  if (!message.startsWith(MESSAGE_PREFIX) || !message.endsWith(MESSAGE_SUFFIX)) {
    return null
  }

  return cleanItemName(
    message.slice(MESSAGE_PREFIX.length, message.length - MESSAGE_SUFFIX.length),
  )
}

function parseFromLineArray(line) {
  if (!Array.isArray(line) || line.length < 5) return null
  if (line[0] !== '00' || line[2] !== '0039') return null
  return parseMessage(line[4] ?? '')
}

function parseFromRawLine(rawLine) {
  if (typeof rawLine !== 'string' || rawLine.length === 0) return null

  if (rawLine.includes('|')) {
    const fields = rawLine.split('|')
    if (fields.length >= 5 && fields[0] === '00' && fields[2] === '0039') {
      return parseMessage(fields[4] ?? '')
    }
  }

  const marker = 'ChatLog 00:0039::'
  const markerIndex = rawLine.indexOf(marker)
  if (markerIndex >= 0) return parseMessage(rawLine.slice(markerIndex + marker.length))

  return null
}

export function parseItemFromLogLine(event) {
  return parseFromLineArray(event?.line) ?? parseFromRawLine(event?.rawLine)
}

function callOverlayHandler(message) {
  return new Promise((resolve, reject) => {
    window.OverlayPluginApi.callHandler(JSON.stringify(message), (data) => {
      if (data === null) {
        resolve(null)
        return
      }

      const response = JSON.parse(data)
      if (response.$error) reject(response)
      else resolve(response)
    })
  })
}

export function subscribeToItemLog({ onItem, onStatus, onError }) {
  let active = true
  let retryTimer = null
  let seen = 0
  let matched = 0
  const previousOverlayCallback = window.__OverlayCallback

  const dispatchOverlayEvent = (event) => {
    if (!active || event?.type !== EVENT_NAME) return

    seen++
    const itemName = parseItemFromLogLine(event)

    onStatus?.({
      connected: true,
      seen,
      matched,
      message: `seen: ${seen} | matched: ${matched}`,
    })

    if (!itemName) return
    matched++

    onStatus?.({
      connected: true,
      seen,
      matched,
      message: `seen: ${seen} | matched: ${matched}`,
    })
    onItem?.({
      name: itemName,
      rawLine: event.rawLine ?? '',
      source: 'OverlayPlugin LogLine',
      seen,
      matched,
    })
  }

  const start = () => {
    if (!active) return

    if (!window.OverlayPluginApi?.ready) {
      onStatus?.({
        connected: false,
        seen,
        matched,
        message: '等待 OverlayPlugin API',
      })
      retryTimer = window.setTimeout(start, 250)
      return
    }

    window.__OverlayCallback = dispatchOverlayEvent
    callOverlayHandler({ call: 'subscribe', events: [EVENT_NAME] })
      .then(() => {
        if (!active) return
        onStatus?.({
          connected: true,
          seen,
          matched,
          message: '已訂閱 OverlayPlugin LogLine',
        })
      })
      .catch((error) => {
        if (!active) return
        onError?.(error)
        onStatus?.({
          connected: false,
          seen,
          matched,
          message: '訂閱 OverlayPlugin LogLine 失敗',
        })
      })
  }

  start()

  return () => {
    active = false
    if (retryTimer) window.clearTimeout(retryTimer)
    if (window.__OverlayCallback === dispatchOverlayEvent) {
      window.__OverlayCallback = previousOverlayCallback
    }
  }
}