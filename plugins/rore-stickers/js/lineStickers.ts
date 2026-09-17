import { decodeHtmlEntities } from './utils'
import type {
	LineSticker,
	LineStickerPack,
	Sticker,
	StickerPack,
} from './types'

export function getIdFromUrl(url: string): string | null {
	const trimmed = url.trim()
	if (/^\d+$/.test(trimmed)) return trimmed

	const match = /stickershop\/product\/(\d+)/i.exec(trimmed)
	return match ? match[1] : null
}

export function toStickerPackId(id: string): string {
	return `MoreStickers:Line:Pack:${id}`
}

export function toStickerId(
	stickerId: string,
	lineStickerPackId: string,
): string {
	return `MoreStickers:Line:Sticker:${lineStickerPackId}:${stickerId}`
}

export function convertSticker(s: LineSticker): Sticker {
	const stickerPackId = s.stickerPackId || ''
	const stickerId = String(s.id)
	const imageUrl =
		s.animationUrl && s.animationUrl.length > 0 ? s.animationUrl : s.staticUrl

	return {
		id: toStickerId(stickerId, stickerPackId),
		title: stickerId,
		image: imageUrl,
		stickerPackId: toStickerPackId(stickerPackId),
		isAnimated: Boolean(s.animationUrl && s.animationUrl.length > 0),
		readyToUpload: true,
	}
}

export function convert(sp: LineStickerPack): StickerPack {
	const packId = toStickerPackId(sp.id)
	const logoSticker = convertSticker({
		...sp.mainImage,
		stickerPackId: sp.id,
	})

	return {
		id: packId,
		title: sp.title === 'null' || !sp.title ? sp.id : sp.title,
		author: sp.author,
		logo: logoSticker,
		sourceUrl: `https://store.line.me/stickershop/product/${sp.id}/en`,
		stickers: sp.stickers.map(s =>
			convertSticker({
				...s,
				stickerPackId: sp.id,
			}),
		),
	}
}

export function parseHtml(html: string): LineStickerPack {
	const titleMatch =
		/data-test=["']sticker-name-title["'][^>]*>([^<]+)</i.exec(html) ||
		/<[^>]+class=["'][^"']*sticker-name-title[^"']*["'][^>]*>([^<]+)</i.exec(
			html,
		)
	const title = titleMatch
		? decodeHtmlEntities(titleMatch[1].trim())
		: 'LINE Sticker Pack'

	const authorMatch =
		/<a[^>]+data-test=["']sticker-author["'][^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/i.exec(
			html,
		) ||
		/<a[^>]+href=["']([^"']+)["'][^>]*data-test=["']sticker-author["'][^>]*>([^<]+)<\/a>/i.exec(
			html,
		)
	const authorName = authorMatch
		? decodeHtmlEntities(authorMatch[2].trim())
		: 'Unknown Author'
	const authorHref = authorMatch ? authorMatch[1].trim() : ''
	const authorUrl = authorHref.startsWith('http')
		? authorHref
		: `https://store.line.me${authorHref.startsWith('/') ? '' : '/'}${authorHref}`

	const previewRegex = /data-preview=(['"])(.*?)\1/gi
	const parsedPreviews: LineSticker[] = []
	let match: RegExpExecArray | null = previewRegex.exec(html)

	while (match !== null) {
		try {
			const decoded = decodeHtmlEntities(match[2])
			const parsed = JSON.parse(decoded) as LineSticker
			if (parsed?.id && (parsed.staticUrl || parsed.animationUrl)) {
				parsedPreviews.push(parsed)
			}
		} catch {
			// ignore malformed preview
		}
		match = previewRegex.exec(html)
	}

	if (parsedPreviews.length === 0) {
		throw new Error('No stickers found in LINE store page.')
	}

	const mainImage = parsedPreviews[0]
	const packId = String(mainImage.id)
	const stickers = parsedPreviews.map(p => ({
		...p,
		stickerPackId: packId,
	}))

	return {
		id: packId,
		title,
		author: {
			name: authorName,
			url: authorUrl,
		},
		mainImage,
		stickers,
	}
}

export function isLineStickerPackHtml(html: string): boolean {
	return (
		html.includes('data-test="sticker-name-title"') ||
		html.includes("data-test='sticker-name-title'")
	)
}

export async function getStickerPackById(
	id: string,
	region = 'en',
): Promise<LineStickerPack> {
	const res = await fetch(
		`https://store.line.me/stickershop/product/${id}/${region}`,
		{
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			},
		},
	)

	if (!res.ok) {
		throw new Error(`Failed to fetch LINE sticker pack: HTTP ${res.status}`)
	}

	const html = await res.text()
	return parseHtml(html)
}
