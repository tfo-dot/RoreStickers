import { ToastActionCreators } from '@revenge-mod/discord/actions'
import { logger } from './index'

const B64_CHARS =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_LOOKUP = new Uint8Array(256)
for (let i = 0; i < B64_CHARS.length; i++) {
	B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i
}

export function uint8ToBase64Url(bytes: Uint8Array): string {
	let result = ''
	let i = 0
	const len = bytes.length
	for (; i + 2 < len; i += 3) {
		result += B64_CHARS[bytes[i] >> 2]
		result += B64_CHARS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)]
		result += B64_CHARS[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)]
		result += B64_CHARS[bytes[i + 2] & 63]
	}
	if (i < len) {
		result += B64_CHARS[bytes[i] >> 2]
		if (i + 1 < len) {
			result += B64_CHARS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)]
			result += B64_CHARS[(bytes[i + 1] & 15) << 2]
		} else {
			result += B64_CHARS[(bytes[i] & 3) << 4]
		}
	}
	return result.replace(/\+/g, '-').replace(/\//g, '_')
}

export function base64UrlToUint8(str: string): Uint8Array {
	let s = str.replace(/-/g, '+').replace(/_/g, '/')
	while (s.length % 4) s += '='
	const len = s.length
	let placeHolders = 0
	if (s.endsWith('==')) placeHolders = 2
	else if (s.endsWith('=')) placeHolders = 1

	const byteLength = Math.max(0, (len * 3) / 4 - placeHolders)
	const bytes = new Uint8Array(byteLength)
	let l = 0
	for (let i = 0; i < len; i += 4) {
		const a = B64_LOOKUP[s.charCodeAt(i)]
		const b = B64_LOOKUP[s.charCodeAt(i + 1)]
		const c = B64_LOOKUP[s.charCodeAt(i + 2)]
		const d = B64_LOOKUP[s.charCodeAt(i + 3)]
		if (l < byteLength) bytes[l++] = (a << 2) | (b >> 4)
		if (l < byteLength) bytes[l++] = ((b & 15) << 4) | (c >> 2)
		if (l < byteLength) bytes[l++] = ((c & 3) << 6) | d
	}
	return bytes
}

export function base64UrlEncode(str: string): string {
	return uint8ToBase64Url(new TextEncoder().encode(str))
}

export function base64UrlDecode(str: string): string {
	return new TextDecoder().decode(base64UrlToUint8(str))
}

export function decodeHtmlEntities(input: string): string {
	return input
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/&nbsp;/g, ' ')
}

export function fuzzyScore(query: string, text: string): number {
	const q = query.toLowerCase().trim()
	const t = text.toLowerCase()
	if (!q || !t) return 0

	if (t === q) return 1000
	if (t.startsWith(q)) return 800 + Math.max(0, 60 - t.length)

	const wordIndex = t.indexOf(` ${q}`)
	if (wordIndex !== -1) return 650 - Math.min(wordIndex, 100)

	const subIndex = t.indexOf(q)
	if (subIndex !== -1) return 450 - Math.min(subIndex, 200)

	let ti = 0
	let first = -1
	for (const char of q) {
		ti = t.indexOf(char, ti)
		if (ti === -1) return 0
		if (first === -1) first = ti
		ti += 1
	}
	const span = ti - first
	const density = q.length / span
	return 100 + Math.round(density * 100)
}

export function isValidHttpsUrl(value: unknown): value is string {
	if (typeof value !== 'string') return false
	try {
		const url = new URL(value)
		return (
			url.protocol === 'https:' && url.username === '' && url.password === ''
		)
	} catch {
		return false
	}
}

export function showToast(content: string, isError = false): void {
	try {
		if (ToastActionCreators?.open) {
			ToastActionCreators.open({
				key: `rore-stickers-${Date.now()}`,
				content,
				iconColor: isError ? '#f04747' : '#43b581',
			})
			return
		}
	} catch (e) {
		logger.warn('[RoreStickers] Toast error:', e)
	}
	logger.log(`[RoreStickers] ${isError ? 'Error: ' : ''}${content}`)
}