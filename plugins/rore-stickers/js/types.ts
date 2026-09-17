export interface Sticker {
	id: string
	title: string
	image: string
	previewImage: string
	stickerPackId: string
	description?: string
	filename?: string
	isAnimated?: boolean
	format?: number
	readyToUpload?: boolean
}

export interface StickerPackMeta {
	id: string
	title: string
	author: {
		name: string
		url?: string
	}
	logo: Sticker
	sourceUrl?: string
	dynamic?: {
		authHeaders?: boolean
		[key: string]: unknown
	}
}

export interface StickerPack extends StickerPackMeta {
	stickers: Sticker[]
}

export interface LineSticker {
	id: string | number
	staticUrl: string
	animationUrl?: string
	popupUrl?: string
	soundUrl?: string
	type?: string
	stickerPackId?: string
}

export interface LineEmoji {
	id: string | number
	staticUrl: string
	animationUrl?: string
	type?: string
	stickerPackId?: string
}

export interface LineStickerPack {
	title: string
	author: {
		name: string
		url: string
	}
	id: string
	mainImage: LineSticker
	stickers: LineSticker[]
}

export interface LineEmojiPack {
	title: string
	author: {
		name: string
		url: string
	}
	id: string
	mainImage: LineEmoji
	stickers: LineEmoji[]
}

export interface StickerFilenamePayloadBase {
	version: string
}

export interface StickerFilenamePayloadLine extends StickerFilenamePayloadBase {
	source: 'line'
	data: {
		type: 'sticker' | 'emoji'
		packId: string
		packTitle: string
	}
}

export interface StickerFilenamePayloadCustom
	extends StickerFilenamePayloadBase {
	source: 'custom'
	data: {
		host: string
		path?: string
		urlName: string
		iconEmoji?: string
		packTitle: string
	}
}

export type StickerFilenamePayload =
	| StickerFilenamePayloadLine
	| StickerFilenamePayloadCustom

export interface IncomingMessageSticker {
	attachment: unknown
	metadata: StickerFilenamePayload
	imageUrl: string
}

export interface PluginSettings {
	promptToUpload: boolean
	sendAsLink: boolean
	showInActionSheet: boolean
	showInstallInMessages: boolean
}

export interface RoreStickersStorage {
	settings: PluginSettings
	packs: StickerPack[]
	recentStickers: Sticker[]
	favoriteStickers: Sticker[]
	collapsedSections: string[]
}
