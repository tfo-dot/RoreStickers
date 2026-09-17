import { decodeHtmlEntities } from './utils'
import type { LineEmoji, LineEmojiPack, Sticker, StickerPack } from './types'

export function getIdFromUrl(url: string): string | null {
	const trimmed = url.trim()
	if (/^[a-zA-Z0-9]+$/.test(trimmed) && !trimmed.includes('/')) return trimmed

	const match = /emojishop\/product\/([a-zA-Z0-9]+)/i.exec(trimmed)
	return match ? match[1] : null
}

export function toStickerPackId(id: string): string {
	return `MoreStickers:Line:Emoji-Pack:${id}`
}

export function toStickerId(
	stickerId: string,
	lineEmojiPackId: string,
): string {
	return `MoreStickers:Line-Emoji:${lineEmojiPackId}:${stickerId}`
}

export function convertSticker(s: LineEmoji): Sticker {
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

export function convert(sp: LineEmojiPack): StickerPack {
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
		sourceUrl: `https://store.line.me/emojishop/product/${sp.id}/en`,
		stickers: sp.stickers.map(s =>
			convertSticker({
				...s,
				stickerPackId: sp.id,
			}),
		),
	}
}

export function parseHtml(html: string): LineEmojiPack {
	const titleMatch =
		/data-test=["']emoji-name-title["'][^>]*>([^<]+)</i.exec(html) ||
		/<[^>]+class=["'][^"']*emoji-name-title[^"']*["'][^>]*>([^<]+)</i.exec(html)
	const title = titleMatch
		? decodeHtmlEntities(titleMatch[1].trim())
		: 'LINE Emoji Pack'

	const authorMatch =
		/<a[^>]+data-test=["']emoji-author["'][^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/i.exec(
			html,
		) ||
		/<a[^>]+href=["']([^"']+)["'][^>]*data-test=["']emoji-author["'][^>]*>([^<]+)<\/a>/i.exec(
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
	const parsedPreviews: LineEmoji[] = []
	let match: RegExpExecArray | null = previewRegex.exec(html)

	while (match !== null) {
		try {
			const decoded = decodeHtmlEntities(match[2])
			const parsed = JSON.parse(decoded) as LineEmoji
			if (parsed?.id && (parsed.staticUrl || parsed.animationUrl)) {
				parsedPreviews.push(parsed)
			}
		} catch {
			// ignore malformed preview
		}
		match = previewRegex.exec(html)
	}

	if (parsedPreviews.length === 0) {
		throw new Error('No emojis found in LINE store page.')
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

export function isLineEmojiPackHtml(html: string): boolean {
	return (
		html.includes('data-test="emoji-name-title"') ||
		html.includes("data-test='emoji-name-title'")
	)
}

export async function getStickerPackById(
	id: string,
	region = 'en',
): Promise<LineEmojiPack> {
	const res = await fetch(
		`https://store.line.me/emojishop/product/${id}/${region}`,
		{
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			},
		},
	)

	if (!res.ok) {
		throw new Error(`Failed to fetch LINE emoji pack: HTTP ${res.status}`)
	}

	const html = await res.text()
	return parseHtml(html)
}
