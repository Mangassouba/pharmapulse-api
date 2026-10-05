const IMAGE_MAX_BYTES = 512 * 1024

// Magic bytes per accepted type: the declared MIME must match the actual content
const SIGNATURES = {
  'image/png':  buf => buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': buf => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  'image/webp': buf => buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP',
}

/**
 * Validate a logo sent as a data URL (PNG, JPEG or WebP, max 512 KB).
 * Returns { mime, data } with data re-encoded as base64; throws a 400 otherwise.
 */
export function parseImageDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '')
  if (!match) throw { statusCode: 400, message: 'Format non supporté (PNG, JPEG ou WebP).' }

  const [, mime, base64] = match
  const buf = Buffer.from(base64, 'base64')
  if (!buf.length || !SIGNATURES[mime](buf)) throw { statusCode: 400, message: 'Le fichier n\'est pas une image valide.' }
  if (buf.length > IMAGE_MAX_BYTES) throw { statusCode: 400, message: 'Le logo ne doit pas dépasser 512 Ko.' }

  return { mime, data: buf.toString('base64'), bytes: buf.length }
}

// Send a stored base64 image; `versioned` = the URL carries ?v=, so it can be cached forever
export function sendImage(res, { mime, data }, versioned) {
  res.set({
    'Content-Type': mime,
    'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
    // Served from the API origin but displayed by the front origin
    'Cross-Origin-Resource-Policy': 'cross-origin',
  })
  res.send(Buffer.from(data, 'base64'))
}
