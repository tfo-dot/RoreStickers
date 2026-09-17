import { isValidHttpsUrl } from './utils'
import type { Sticker, StickerPack } from './types'

function isSticker(value: unknown): value is Sticker {
	if (!value || typeof value !== 'object') return false
	const candidate = value as Record<string, unknown>
	return (
		typeof candidate.id === 'string' &&
		typeof candidate.title === 'string' &&
		typeof candidate.image === 'string' &&
		typeof candidate.stickerPackId === 'string'
	)
}

export function isStickerPack(value: unknown): value is StickerPack {
	if (!value || typeof value !== 'object') return false
	const candidate = value as Record<string, unknown>

	if (
		typeof candidate.id !== 'string' ||
		typeof candidate.title !== 'string' ||
		!isSticker(candidate.logo) ||
		!Array.isArray(candidate.stickers)
	) {
		return false
	}

	for (const item of candidate.stickers) {
		if (!isSticker(item)) return false
	}

	return true
}

export async function getCustomStickerPackByUrl(
	url: string,
): Promise<StickerPack> {
	if (!isValidHttpsUrl(url)) {
		throw new Error('Invalid HTTPS URL.')
	}

	const res = await fetch(url)
	if (!res.ok) {
		throw new Error(`Failed to fetch custom sticker pack: HTTP ${res.status}`)
	}

	const json = (await res.json()) as unknown
	if (!isStickerPack(json)) {
		throw new Error('Invalid sticker pack JSON format.')
	}

	json.sourceUrl = url
	return json
}
