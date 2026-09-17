import { getJsonStorage } from '@revenge-mod/json-storage'
import type {
	PluginSettings,
	RoreStickersStorage,
	Sticker,
	StickerPack,
	StickerPackMeta,
} from './types'

const DEFAULT_SETTINGS: PluginSettings = {
	promptToUpload: false,
	sendAsLink: true,
	showInActionSheet: true,
	showInstallInMessages: true,
}

const DEFAULT_STORAGE: RoreStickersStorage = {
	settings: DEFAULT_SETTINGS,
	packs: [],
	recentStickers: [],
	favoriteStickers: [],
	collapsedSections: [],
}

export const storage = getJsonStorage<RoreStickersStorage>(
	'rore-stickers.json',
	{
		default: DEFAULT_STORAGE,
	},
)

export function useRoreStorage(): RoreStickersStorage {
	const data = storage.use()
	return data || DEFAULT_STORAGE
}

export async function getStorageData(): Promise<RoreStickersStorage> {
	const data = await storage.get()
	return {
		settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
		packs: Array.isArray(data.packs) ? data.packs : [],
		recentStickers: Array.isArray(data.recentStickers)
			? data.recentStickers
			: [],
		favoriteStickers: Array.isArray(data.favoriteStickers)
			? data.favoriteStickers
			: [],
		collapsedSections: Array.isArray(data.collapsedSections)
			? data.collapsedSections
			: [],
	}
}

export async function getSettings(): Promise<PluginSettings> {
	const data = await getStorageData()
	return data.settings
}

export async function updateSettings(
	partial: Partial<PluginSettings>,
): Promise<void> {
	const current = await getStorageData()
	await storage.set({
		settings: {
			...current.settings,
			...partial,
		},
	})
}

export async function getStickerPacks(): Promise<StickerPack[]> {
	const data = await getStorageData()
	return data.packs
}

export async function getStickerPack(id: string): Promise<StickerPack | null> {
	const packs = await getStickerPacks()
	return packs.find(p => p.id === id) || null
}

export async function getStickerPackMetas(): Promise<StickerPackMeta[]> {
	const packs = await getStickerPacks()
	return packs.map(p => ({
		id: p.id,
		title: p.title,
		author: p.author,
		logo: p.logo,
		sourceUrl: p.sourceUrl,
		dynamic: p.dynamic,
	}))
}

export async function saveStickerPack(pack: StickerPack): Promise<void> {
	const current = await getStorageData()
	const existingIdx = current.packs.findIndex(p => p.id === pack.id)
	const newPacks = [...current.packs]

	if (existingIdx !== -1) {
		newPacks[existingIdx] = pack
	} else {
		newPacks.push(pack)
	}

	await storage.set({ packs: newPacks })
}

export async function deleteStickerPack(id: string): Promise<void> {
	const current = await getStorageData()
	const newPacks = current.packs.filter(p => p.id !== id)
	const newRecents = current.recentStickers.filter(s => s.stickerPackId !== id)
	const newFavorites = current.favoriteStickers.filter(
		s => s.stickerPackId !== id,
	)

	await storage.set({
		packs: newPacks,
		recentStickers: newRecents,
		favoriteStickers: newFavorites,
	})
}

export async function getRecentStickers(): Promise<Sticker[]> {
	const data = await getStorageData()
	return data.recentStickers
}

export async function addRecentSticker(sticker: Sticker): Promise<void> {
	const current = await getStorageData()
	const filtered = current.recentStickers.filter(s => s.id !== sticker.id)
	const updated = [sticker, ...filtered].slice(0, 32)

	await storage.set({ recentStickers: updated })
}

export async function clearRecentStickers(): Promise<void> {
	await storage.set({ recentStickers: [] })
}

export async function getFavoriteStickers(): Promise<Sticker[]> {
	const data = await getStorageData()
	return data.favoriteStickers
}

export async function isFavoriteSticker(stickerId: string): Promise<boolean> {
	const favorites = await getFavoriteStickers()
	return favorites.some(s => s.id === stickerId)
}

export async function toggleFavoriteSticker(
	sticker: Sticker,
): Promise<boolean> {
	const current = await getStorageData()
	const exists = current.favoriteStickers.some(s => s.id === sticker.id)
	let updated: Sticker[]

	if (exists) {
		updated = current.favoriteStickers.filter(s => s.id !== sticker.id)
	} else {
		updated = [sticker, ...current.favoriteStickers]
	}

	await storage.set({ favoriteStickers: updated })
	return !exists
}

export async function exportBackup(): Promise<string> {
	const packs = await getStickerPacks()
	return JSON.stringify(packs, null, 2)
}

export async function importBackup(jsonString: string): Promise<number> {
	const parsed = JSON.parse(jsonString) as unknown
	if (!Array.isArray(parsed)) {
		throw new Error('Invalid backup: expected an array of sticker packs.')
	}

	let importedCount = 0
	for (const item of parsed) {
		if (
			item &&
			typeof item === 'object' &&
			'id' in item &&
			'stickers' in item
		) {
			await saveStickerPack(item as StickerPack)
			importedCount++
		}
	}

	return importedCount
}
