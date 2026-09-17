import { useMemo, useState } from 'react'
import {
	Image,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import { sendSticker } from '../discord'
import { toggleFavoriteSticker, useRoreStorage } from '../storage'
import { fuzzyScore, showToast } from '../utils'
import { logger } from '../index'

import type React from 'react'
import type { Sticker, StickerPack } from '../types'

interface StickerPickerProps {
	channelId?: string
	onClose?: () => void
	onOpenSettings?: () => void
}

const FAVORITES_ID = '__favorites__'
const RECENTS_ID = '__recents__'

export default function StickerPicker({
	channelId,
	onClose,
	onOpenSettings,
}: StickerPickerProps): React.JSX.Element {
	const storage = useRoreStorage()
	const [selectedTabId, setSelectedTabId] = useState<string>(
		storage.recentStickers.length > 0
			? RECENTS_ID
			: storage.favoriteStickers.length > 0
				? FAVORITES_ID
				: storage.packs[0]?.id || RECENTS_ID,
	)
	const [searchQuery, setSearchQuery] = useState<string>('')

	const packs = storage.packs
	const favorites = storage.favoriteStickers
	const recents = storage.recentStickers

	const searchResults = useMemo(() => {
		const q = searchQuery.trim().toLowerCase()
		if (!q) return null

		const allStickers: Array<{ sticker: Sticker; score: number }> = []
		for (const pack of packs) {
			const packMatch = fuzzyScore(q, pack.title)
			for (const sticker of pack.stickers) {
				const stickerScore = Math.max(
					fuzzyScore(q, sticker.title),
					packMatch > 0 ? packMatch - 100 : 0,
				)
				if (stickerScore > 0) {
					allStickers.push({ sticker, score: stickerScore })
				}
			}
		}

		allStickers.sort((a, b) => b.score - a.score)
		return allStickers.map(item => item.sticker)
	}, [searchQuery, packs])

	const currentStickers = useMemo((): Sticker[] => {
		if (searchResults !== null) {
			return searchResults
		}

		if (selectedTabId === FAVORITES_ID) {
			return favorites
		}

		if (selectedTabId === RECENTS_ID) {
			return recents
		}

		const pack = packs.find((p: StickerPack) => p.id === selectedTabId)
		return pack ? pack.stickers : []
	}, [searchResults, selectedTabId, favorites, recents, packs])

	const handleSelectSticker = async (sticker: Sticker) => {
		try {
			await sendSticker(sticker, channelId)
			onClose?.()
		} catch (e) {
			logger.warn('[RoreStickers] Error selecting sticker:', e)
		}
	}

	const handleLongPressSticker = async (sticker: Sticker) => {
		try {
			const isFav = await toggleFavoriteSticker(sticker)
			showToast(isFav ? 'Added to Favorites!' : 'Removed from Favorites.')
		} catch (e) {
			logger.warn('[RoreStickers] Error favoriting sticker:', e)
		}
	}

	return (
		<View style={styles.container}>
			{/* Header */}
			<View style={styles.header}>
				<View style={styles.headerLeft}>
					<Text style={styles.headerTitle}>RoreStickers</Text>
				</View>
				<View style={styles.headerActions}>
					{onOpenSettings && (
						<TouchableOpacity
							style={styles.headerButton}
							onPress={onOpenSettings}
							accessibilityLabel="Settings"
						>
							<Text style={styles.headerButtonText}>⚙</Text>
						</TouchableOpacity>
					)}
					{onClose && (
						<TouchableOpacity
							style={styles.headerButton}
							onPress={onClose}
							accessibilityLabel="Close"
						>
							<Text style={styles.headerButtonText}>✕</Text>
						</TouchableOpacity>
					)}
				</View>
			</View>

			{/* Search Input */}
			<View style={styles.searchContainer}>
				<TextInput
					style={styles.searchInput}
					placeholder="Search stickers..."
					placeholderTextColor="#8e9297"
					value={searchQuery}
					onChangeText={setSearchQuery}
					returnKeyType="search"
					clearButtonMode="while-editing"
				/>
				{searchQuery.length > 0 && (
					<TouchableOpacity
						style={styles.clearSearchButton}
						onPress={() => setSearchQuery('')}
					>
						<Text style={styles.clearSearchText}>✕</Text>
					</TouchableOpacity>
				)}
			</View>

			{/* Pack Tabs Bar */}
			{!searchQuery && (
				<View style={styles.tabsWrapper}>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						style={styles.tabsScroll}
						contentContainerStyle={styles.tabsContent}
					>
						{/* Favorites Tab */}
						<TouchableOpacity
							style={[
								styles.tabItem,
								selectedTabId === FAVORITES_ID && styles.tabItemActive,
							]}
							onPress={() => setSelectedTabId(FAVORITES_ID)}
						>
							<Text style={styles.tabIcon}>★</Text>
							<Text style={styles.tabBadge}>{favorites.length}</Text>
						</TouchableOpacity>

						{/* Recents Tab */}
						<TouchableOpacity
							style={[
								styles.tabItem,
								selectedTabId === RECENTS_ID && styles.tabItemActive,
							]}
							onPress={() => setSelectedTabId(RECENTS_ID)}
						>
							<Text style={styles.tabIcon}>🕒</Text>
							<Text style={styles.tabBadge}>{recents.length}</Text>
						</TouchableOpacity>

						{/* Installed Packs */}
						{packs.map((pack: StickerPack) => {
							const isActive = selectedTabId === pack.id
							return (
								<TouchableOpacity
									key={pack.id}
									style={[styles.tabItem, isActive && styles.tabItemActive]}
									onPress={() => setSelectedTabId(pack.id)}
								>
									{pack.logo?.image ? (
										<Image
											source={{ uri: pack.logo.previewImage }}
											style={styles.tabLogoImage}
										/>
									) : (
										<Text style={styles.tabIcon}>📦</Text>
									)}
								</TouchableOpacity>
							)
						})}
					</ScrollView>
				</View>
			)}

			{/* Main Sticker Grid */}
			<ScrollView
				style={styles.gridContainer}
				contentContainerStyle={styles.gridContent}
				showsVerticalScrollIndicator={true}
			>
				{currentStickers.length === 0 ? (
					<View style={styles.emptyContainer}>
						<Text style={styles.emptyTitle}>
							{searchResults !== null
								? 'No stickers found'
								: selectedTabId === FAVORITES_ID
									? 'No favorite stickers yet'
									: selectedTabId === RECENTS_ID
										? 'No recently used stickers'
										: 'No stickers in this pack'}
						</Text>
						<Text style={styles.emptySubtitle}>
							{searchResults !== null
								? 'Try a different search keyword.'
								: selectedTabId === FAVORITES_ID
									? 'Long-press any sticker to add it to your favorites.'
									: selectedTabId === RECENTS_ID
										? 'Stickers you send will appear here.'
										: 'Import sticker packs in Settings.'}
						</Text>
					</View>
				) : (
					<View style={styles.stickerGrid}>
						{currentStickers.map((sticker: Sticker) => (
							<TouchableOpacity
								key={sticker.id}
								style={styles.stickerCell}
								onPress={() => handleSelectSticker(sticker)}
								onLongPress={() => handleLongPressSticker(sticker)}
								delayLongPress={400}
								activeOpacity={0.7}
							>
								<Image
									source={{ uri: sticker.previewImage }}
									style={styles.stickerImage}
									resizeMode="contain"
								/>
							</TouchableOpacity>
						))}
					</View>
				)}
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#2f3136',
		minHeight: 380,
		maxHeight: 520,
		borderTopLeftRadius: 16,
		borderTopRightRadius: 16,
		overflow: 'hidden',
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: '#202225',
	},
	headerLeft: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	headerTitle: {
		fontSize: 16,
		fontWeight: '700',
		color: '#ffffff',
	},
	headerActions: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	headerButton: {
		padding: 6,
		borderRadius: 16,
		backgroundColor: '#36393f',
		alignItems: 'center',
		justifyContent: 'center',
		width: 32,
		height: 32,
	},
	headerButtonText: {
		color: '#dcddde',
		fontSize: 14,
		fontWeight: 'bold',
	},
	searchContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 12,
		paddingVertical: 8,
		backgroundColor: '#2f3136',
	},
	searchInput: {
		flex: 1,
		height: 36,
		backgroundColor: '#202225',
		borderRadius: 8,
		paddingHorizontal: 12,
		color: '#ffffff',
		fontSize: 14,
	},
	clearSearchButton: {
		position: 'absolute',
		right: 22,
		padding: 4,
	},
	clearSearchText: {
		color: '#8e9297',
		fontSize: 12,
	},
	tabsWrapper: {
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: '#202225',
		backgroundColor: '#292b2f',
	},
	tabsScroll: {
		flexGrow: 0,
	},
	tabsContent: {
		flexDirection: 'row',
		paddingHorizontal: 8,
		paddingVertical: 6,
		gap: 6,
		alignItems: 'center',
	},
	tabItem: {
		width: 42,
		height: 42,
		borderRadius: 10,
		backgroundColor: '#36393f',
		alignItems: 'center',
		justifyContent: 'center',
		position: 'relative',
	},
	tabItemActive: {
		backgroundColor: '#5865f2',
	},
	tabIcon: {
		fontSize: 20,
		color: '#ffffff',
	},
	tabLogoImage: {
		width: 32,
		height: 32,
		borderRadius: 6,
	},
	tabBadge: {
		position: 'absolute',
		bottom: 2,
		right: 3,
		fontSize: 9,
		fontWeight: 'bold',
		color: '#dcddde',
	},
	gridContainer: {
		flex: 1,
	},
	gridContent: {
		padding: 8,
		flexGrow: 1,
	},
	stickerGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'flex-start',
	},
	stickerCell: {
		width: '25%',
		aspectRatio: 1,
		padding: 4,
		alignItems: 'center',
		justifyContent: 'center',
	},
	stickerImage: {
		width: '100%',
		height: '100%',
	},
	emptyContainer: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 48,
		paddingHorizontal: 24,
	},
	emptyTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#ffffff',
		marginBottom: 6,
		textAlign: 'center',
	},
	emptySubtitle: {
		fontSize: 13,
		color: '#8e9297',
		textAlign: 'center',
		lineHeight: 18,
	},
})
