import { getCustomStickerPackByUrl } from './customPacks'
import {
	convert as convertLineEP,
	getStickerPackById as getLineEmojiPackById,
} from './lineEmojis'
import {
	convert as convertLineSP,
	getStickerPackById as getLineStickerPackById,
} from './lineStickers'
import { base64UrlDecode, base64UrlEncode } from './utils'
import type {
	IncomingMessageSticker,
	Sticker,
	StickerFilenamePayload,
	StickerFilenamePayloadLine,
	StickerPack,
	StickerPackMeta,
	RoreFilenamePayloadV2,
	ParsedRoreAttachment
} from './types'

const MAGIC_PREFIX = 'morestickers_'
const CUSTOM_PACK_PREFIX = '/stickerpack/'
const VERSION = '1'

const READY_TO_UPLOAD_MIME: Record<string, true> = {
	'image/png': true,
	'image/jpeg': true,
	'image/webp': true,
	'image/gif': true,
	'image/avif': true,
}

export function stickerToFilenamePayload(
	sticker: Sticker,
	packMeta: StickerPackMeta | null,
	overrideExtension?: string,
): string {
	const fallbackFilename = () => {
		let filename = sticker.filename
		if (!filename) {
			try {
				filename =
					new URL(sticker.image).pathname.split('/').pop() || 'sticker.png'
			} catch {
				filename = 'sticker.png'
			}
		}
		if (!overrideExtension) return filename
		const dotIndex = filename.lastIndexOf('.')
		const basename = dotIndex > 0 ? filename.slice(0, dotIndex) : filename
		return `${basename}.${overrideExtension}`
	}

	if (!packMeta) return fallbackFilename()

	const linePack = /^MoreStickers:Line:(Pack|Emoji-Pack):(.+)$/.exec(
		sticker.stickerPackId,
	)
	if ((!linePack && !packMeta.sourceUrl) || packMeta.dynamic?.authHeaders) {
		return fallbackFilename()
	}

	let sourceFilename = sticker.filename
	if (!sourceFilename) {
		try {
			const url = new URL(sticker.image)
			sourceFilename = url.pathname.slice(url.pathname.lastIndexOf('/') + 1)
		} catch {
			sourceFilename = 'sticker.png'
		}
	}
	const dotIdx = sourceFilename.lastIndexOf('.')
	const extension =
		overrideExtension || (dotIdx > 0 ? sourceFilename.slice(dotIdx + 1) : 'png')

	let values: string[]
	if (linePack) {
		values = [
			'line',
			linePack[1] === 'Pack' ? 'sticker' : 'emoji',
			linePack[2],
			packMeta.title,
		]
	} else {
		try {
			const packUrl = new URL(packMeta.sourceUrl as string)
			const filenameIndex = packUrl.pathname.lastIndexOf('/')
			const packPathIndex = packUrl.pathname.indexOf(CUSTOM_PACK_PREFIX)
			if (packPathIndex === -1) return fallbackFilename()

			values = [
				packUrl.host,
				packUrl.pathname.slice(
					packPathIndex + CUSTOM_PACK_PREFIX.length,
					filenameIndex,
				),
				packUrl.pathname.slice(filenameIndex + 1),
				sticker.title,
				packMeta.title,
			]
		} catch {
			return fallbackFilename()
		}
	}

	const rawPayload = [VERSION, ...values].join(';')
	const payload = base64UrlEncode(rawPayload)

	return `${MAGIC_PREFIX}${payload}.${extension}`
}

export function stickerPayloadFromFilename(
	filename: string,
): StickerFilenamePayload | null {
	const extensionIndex = filename.lastIndexOf('.')
	if (
		!filename.startsWith(MAGIC_PREFIX) ||
		extensionIndex <= MAGIC_PREFIX.length
	) {
		return null
	}

	try {
		const payload = filename.slice(MAGIC_PREFIX.length, extensionIndex)
		const decoded = base64UrlDecode(payload)
		const [version, source, ...data] = decoded.split(';')
		if (version !== VERSION) return null

		if (source === 'line') {
			const [type, packId, ...packTitleParts] = data
			const packTitle = packTitleParts.join(';')
			if ((type !== 'sticker' && type !== 'emoji') || !packId || !packTitle) {
				return null
			}
			return {
				version,
				source: 'line',
				data: { type, packId, packTitle },
			}
		}

		const [path, urlName, iconEmoji, ...packTitleParts] = data
		const packTitle = packTitleParts.join(';')
		if (!source || !urlName || !packTitle) return null

		return {
			version,
			source: 'custom',
			data: { host: source, path, urlName, iconEmoji, packTitle },
		}
	} catch {
		return null
	}
}

export function isStickerFilenamePayloadLine(
	payload: StickerFilenamePayload,
): payload is StickerFilenamePayloadLine {
	return payload.source === 'line'
}

export async function importStickerPackFromMetadata(
	metadata: StickerFilenamePayload,
	allowPrivate = false,
): Promise<StickerPack> {
	if (isStickerFilenamePayloadLine(metadata)) {
		const { type, packId } = metadata.data
		if (type === 'sticker') {
			const linePack = await getLineStickerPackById(packId)
			return convertLineSP(linePack)
		}
		const emojiPack = await getLineEmojiPackById(packId)
		return convertLineEP(emojiPack)
	}

	const { host, path, urlName } = metadata.data
	const pathPart = path ? `${path}/` : ''
	const customPack = await getCustomStickerPackByUrl(
		`https://${host}${CUSTOM_PACK_PREFIX}${pathPart}${urlName}`,
	)
	if (customPack.dynamic?.authHeaders && !allowPrivate) {
		throw new Error('Custom sticker pack is private.')
	}
	return customPack
}

export function parseStickerAttachment(
	attachment: unknown,
): IncomingMessageSticker | null {
	if (!attachment || typeof attachment !== 'object') return null
	const att = attachment as Record<string, unknown>

	if (typeof att.filename !== 'string') return null
	const metadata = stickerPayloadFromFilename(att.filename)
	if (!metadata) return null

	if (typeof att.content_type === 'string') {
		const mime = att.content_type.split(';')[0].trim().toLowerCase()
		if (!READY_TO_UPLOAD_MIME[mime]) return null
	}

	const rawImageUrl =
		typeof att.proxy_url === 'string'
			? att.proxy_url
			: typeof att.url === 'string'
				? att.url
				: null
	if (!rawImageUrl) return null

	return {
		attachment,
		metadata,
		imageUrl: rawImageUrl,
	}
}

export function isPackInstalledFromMetadata(
	metadata: StickerFilenamePayload,
	packs: StickerPackMeta[],
): boolean {
	if (isStickerFilenamePayloadLine(metadata)) {
		const id =
			metadata.data.type === 'sticker'
				? `MoreStickers:Line:Pack:${metadata.data.packId}`
				: `MoreStickers:Line:Emoji-Pack:${metadata.data.packId}`

		return packs.some(pack => pack.id === id)
	}

	const { host, path, urlName } = metadata.data
	const pathPart = path ? `${path}/` : ''
	const sourceUrl = `https://${host}${CUSTOM_PACK_PREFIX}${pathPart}${urlName}`

	return packs.some(pack => pack.sourceUrl === sourceUrl)
}


export function parseRoreFilename(
    filename: string,
): RoreFilenamePayloadV2 | null {
    const match =
        /^morestickers_([A-Za-z0-9_-]+)\.([^.]+)$/i.exec(
            filename,
        )

    if (!match) {
        return null
    }

    try {
        const decoded =
            base64UrlDecode(match[1])

        const [
            version,
            hostHash,
            stickerId,
            stickerPackId,
            stickerTitle,
            ...packTitleParts
        ] = decoded.split(";")

        if (
            version !== "2" ||
            !hostHash ||
            !stickerId ||
            !stickerPackId ||
            !stickerTitle ||
            packTitleParts.length === 0
        ) {
            return null
        }

        return {
            version: 2,

            hostHash,

            stickerId,
            stickerPackId,

            stickerTitle,

            packTitle:
                packTitleParts.join(";"),
        }
    } catch {
        return null
    }
}

export function getRoreAttachments(
    rawMessage: any,
) {
    const result:
        ParsedRoreAttachment[] = []

    for (
        const attachment
        of rawMessage?.attachments ?? []
    ) {
        const payload =
            parseRoreFilename(
                attachment?.filename,
            )

        if (!payload) {
            continue
        }

        const imageUrl =
            attachment.proxy_url ??
            attachment.url

        if (
            typeof imageUrl !==
            "string"
        ) {
            continue
        }

        result.push({
            attachmentId:
                attachment.id,

            filename:
                attachment.filename,

            extension:
                attachment.filename
                    .split(".")
                    .pop() ?? "",

            imageUrl,

            payload,
        })
    }

    return result
}