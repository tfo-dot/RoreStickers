import { useMemo, useState } from 'react'
import {
	Image,
	ScrollView,
	Pressable,
	View, useWindowDimensions
} from 'react-native'
import { toggleFavoriteSticker, useRoreStorage } from '../storage'
import { base64UrlEncode, fuzzyScore, showToast } from '../utils'
import { logger } from '../index'

import SearchInput from '@revenge-mod/components/SearchInput'
import { Tokens } from '@revenge-mod/discord/common/tokens'
import { Design } from '@revenge-mod/discord/design'
import {
	lookupGeneratedIconComponent,
} from '@revenge-mod/utils/discord'

import type React from 'react'
import type { Sticker, StickerPack } from '../types'
import { downloadSticker, xxh64 } from '../native'

import { FlashList } from "@shopify/flash-list";

interface StickerPickerProps {
	channelId?: string
	onClose?: () => void
	messageActionCreators?: any
	uploadOrigin?: any
	cloudUpload?: any
	uploadPlatform?: any
}

const FAVORITES_ID = '__favorites__'
const RECENTS_ID = '__recents__'

export default function StickerPicker({
	channelId,
	onClose,
	messageActionCreators,
	uploadOrigin,
	cloudUpload,
	uploadPlatform
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
			const filename =
				sticker.image.split("/").pop() ?? "";

			const extension = 
				sticker.image.split(".").pop() ?? "";

			const url = new URL(sticker.image)

			const uri = await downloadSticker(
				sticker.image,
				`${sticker.id.replaceAll(":", "_")}.${extension}`
			);

			if (!messageActionCreators) {
				throw new Error(
					"MessageActionCreators not ready",
				);
			}

			if (!cloudUpload) {
				throw new Error(
					"CloudUpload not ready",
				);
			}

			if (!uploadPlatform) {
				throw new Error(
					"UploadPlatform not ready",
				);
			}

			/*
				Protocol for encoding sticker pack information into a filename
				to make stickers discoverable by other users
				It uses the format: morestickers_<base64urlPayload>.<extension>
				base64urlPayload is a base64url-encoded csv
				where first values always are: version

				LINE values: line, sticker|emoji, stickerId, packId, packTitle
				stickerId is LINE's internal ID number

				Custom sticker values: host, stickerId, stickerPackId, iconEmoji, packTitle
				"MoreStickers:" prefix is always stripped in stickerId and stickerPackId

				"line" is constant, host is the hostname of the custom sticker pack

				Semicolons are legal in packTitle (its always the last value)
			*/

			const sid = sticker.id.replace("MoreStickers:", "")
			const spid = sticker.stickerPackId.replace("MoreStickers:", "") 

			const spack = packs.find(elt => elt.id == sticker.stickerPackId && new URL(elt.logo.image).hostname == url.hostname)

			const sdata = base64UrlEncode(`2;${await xxh64(url.hostname)};${sid};${spid};${sticker.title};${spack!.title}`)

			const stickerName = `morestickers_${sdata}.${extension}`

			const item = {
				id: uri,
				origin:
					uploadOrigin?.IMAGE_PICKER
					?? 1,
				uri,
				originalUri: uri,

				mimeType:
					"image/avif",
				filename: stickerName,
				platform:
					uploadPlatform.REACT_NATIVE,
				width: null,
				height: null,
				playableDuration: 0,
				createdUsingInAppCamera:
					false,
			};

			console.log(
				"[Rore] upload item",
				item,
			);

			const upload =
				new cloudUpload(
					item,
					channelId,
				);

			messageActionCreators
				.sendMessage(
					channelId,
					{
						content: "",
						tts: false,

						invalidEmojis: [],
						validNonShortcutEmojis: [],
					},
					undefined,
					{
						location:
							"chat_input",
						attachmentsToUpload: [
							upload,
						],
						onAttachmentUploadError(
							file: any,
							code: any,
							reason: any,
						) {
							console.error(
								"[Rore] upload failed",
								{
									file,
									code,
									reason,
								},
							);
						},
					},
				);
			
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

	const selectedPack =
		packs.find(
			pack =>
				pack.id === selectedTabId,
		)

	const sectionTitle =
		searchResults !== null
			? 'Search results'
			: selectedTabId === FAVORITES_ID
				? 'Favorites'
				: selectedTabId === RECENTS_ID
					? 'Recently used'
					: selectedPack?.title
					?? 'Stickers'


	const { width } =
		useWindowDimensions()

	const columns =
		width >= 400
			? 5
			: 4

	const horizontalPadding = 24
	const itemWidth =
		(width - horizontalPadding)
		/ columns

	const CloseIcon =
		lookupGeneratedIconComponent(
			'CircleXIcon',
		)

	const StarIcon =
		lookupGeneratedIconComponent(
			'StarIcon',
		)

	const ClockIcon =
		lookupGeneratedIconComponent(
			'ClockIcon',
		)

	const styles = Design.createStyles({
		container: {
			flex: 1,

			backgroundColor:
				Tokens.default.colors
					.BACKGROUND_BASE_LOWER,
		},

		topArea: {
			paddingHorizontal: 12,
			paddingBottom: 8,
		},

		searchRow: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 8,
		},

		search: {
			flex: 1,
		},

		sectionHeader: {
			height: 34,
			paddingHorizontal: 12,

			flexDirection: 'row',
			alignItems: 'center',
			justifyContent:
				'space-between',
		},

		gridContent: {
			paddingHorizontal: 12,
			paddingBottom: 8,
			flexGrow: 1,
		},

		stickerCell: {
			height: 76,
			alignItems: 'center',
			justifyContent: 'center',
			borderRadius: 12,
		},

		stickerPressed: {
			backgroundColor:
				Tokens.default.colors
					.INTERACTIVE_BACKGROUND_ACTIVE,
		},

		stickerImage: {
			width: 64,
			height: 64,
		},

		categoryBar: {
			height: 56,

			borderTopWidth: 1,
			borderTopColor:
				Tokens.default.colors
					.BORDER_SUBTLE,

			backgroundColor:
				Tokens.default.colors
					.BACKGROUND_BASE_LOW,
		},

		categoryContent: {
			paddingHorizontal: 6,
			alignItems: 'center',
		},

		categoryButton: {
			width: 48,
			height: 56,
			alignItems: 'center',
			justifyContent: 'center',
		},

		categoryInner: {
			width: 40,
			height: 40,

			borderRadius: 20,

			alignItems: 'center',
			justifyContent: 'center',
		},

		categoryActive: {
			backgroundColor:
				Tokens.default.colors
					.INTERACTIVE_BACKGROUND_ACTIVE,
		},

		packIcon: {
			width: 30,
			height: 30,
			borderRadius: 8,
		},

		empty: {
			flex: 1,
			alignItems: 'center',
			justifyContent: 'center',
			paddingHorizontal: 32,
		},
	})()

	return (
		<View style={styles.container}>
			<View style={styles.searchRow}>
				<View style={styles.search}>
					<SearchInput
						placeholder="Search Rore stickers"
						onChange={setSearchQuery}
						size="md"
					/>
				</View>

				{onClose && CloseIcon && (
					<Design.IconButton
						icon={0}
						// icon={CloseIcon}
						variant="tertiary"
						onPress={onClose}
					/>
				)}
			</View>

			<View style={styles.sectionHeader}>
				<Design.Text
					variant="text-sm/semibold"
					color="text-default"
				>
					{sectionTitle}
				</Design.Text>

				<Design.Text
					variant="text-xs/medium"
					color="text-muted"
				>
					{currentStickers.length}
				</Design.Text>
			</View>

			<FlashList
				key={`stickers-${columns}`}
				data={currentStickers}
				numColumns={columns}

				keyExtractor={(sticker: Sticker) =>
					sticker.id
				}

				keyboardShouldPersistTaps="always"

				showsVerticalScrollIndicator={
					false
				}

				contentContainerStyle={
					styles.gridContent
				}

				renderItem={({ item }: { item: Sticker }) => (
					<Pressable
						onPress={() =>
							handleSelectSticker(
								item,
							)
						}
						onLongPress={() =>
							handleLongPressSticker(
								item,
							)
						}
						delayLongPress={350}
						style={({ pressed }) => [
							styles.stickerCell,
							{
								width:
									itemWidth,
							},
							pressed &&
							styles.stickerPressed,
						]}
					>
						<Image
							source={{
								uri:
									item.previewImage,
							}}
							style={
								styles.stickerImage
							}
							resizeMode="contain"
						/>
					</Pressable>
				)}

				ListEmptyComponent={
					<></>
				}
			/>

			
			<View style={styles.categoryBar}>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={
						false
					}
					contentContainerStyle={
						styles.categoryContent
					}
				>
					<CategoryButton
						active={
							selectedTabId ===
							FAVORITES_ID
						}
						onPress={() => {
							setSearchQuery('')
							setSelectedTabId(
								FAVORITES_ID,
							)
						}}
					>
						{StarIcon && (
							<StarIcon size="sm" />
						)}
					</CategoryButton>

					<CategoryButton
						active={
							selectedTabId ===
							RECENTS_ID
						}
						onPress={() => {
							setSearchQuery('')
							setSelectedTabId(
								RECENTS_ID,
							)
						}}
					>
						{ClockIcon && (
							<ClockIcon size="sm" />
						)}
					</CategoryButton>

					{packs.map(pack => (
						<CategoryButton
							key={pack.id}
							active={
								selectedTabId ===
								pack.id
							}
							onPress={() => {
								setSearchQuery('')
								setSelectedTabId(
									pack.id,
								)
							}}
						>
							{pack.logo?.previewImage ? (
								<Image
									source={{
										uri:
											pack.logo
												.previewImage,
									}}
									style={
										styles.packIcon
									}
								/>
							) : (
								<Design.Text
									variant="text-sm/bold"
								>
									{pack.title
										.slice(0, 1)
										.toUpperCase()}
								</Design.Text>
							)}
						</CategoryButton>
					))}
				</ScrollView>
			</View>
		</View>
	)
}

function CategoryButton({
	active,
	onPress,
	children,
}: {
	active: boolean
	onPress(): void
	children: React.ReactNode
}) {
	const styles = Design.createStyles({
		container: {
			flex: 1,

			backgroundColor:
				Tokens.default.colors
					.BACKGROUND_BASE_LOWER,
		},

		topArea: {
			paddingHorizontal: 12,
			paddingBottom: 8,
		},

		searchRow: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 8,
		},

		search: {
			flex: 1,
		},

		sectionHeader: {
			height: 34,
			paddingHorizontal: 12,

			flexDirection: 'row',
			alignItems: 'center',
			justifyContent:
				'space-between',
		},

		gridContent: {
			paddingHorizontal: 12,
			paddingBottom: 8,
			flexGrow: 1,
		},

		stickerCell: {
			height: 76,
			alignItems: 'center',
			justifyContent: 'center',
			borderRadius: 12,
		},

		stickerPressed: {
			backgroundColor:
				Tokens.default.colors
					.INTERACTIVE_BACKGROUND_ACTIVE,
		},

		stickerImage: {
			width: 64,
			height: 64,
		},

		categoryBar: {
			height: 56,

			borderTopWidth: 1,
			borderTopColor:
				Tokens.default.colors
					.BORDER_SUBTLE,

			backgroundColor:
				Tokens.default.colors
					.BACKGROUND_BASE_LOW,
		},

		categoryContent: {
			paddingHorizontal: 6,
			alignItems: 'center',
		},

		categoryButton: {
			width: 48,
			height: 56,
			alignItems: 'center',
			justifyContent: 'center',
		},

		categoryInner: {
			width: 40,
			height: 40,

			borderRadius: 20,

			alignItems: 'center',
			justifyContent: 'center',
		},

		categoryActive: {
			backgroundColor:
				Tokens.default.colors
					.INTERACTIVE_BACKGROUND_ACTIVE,
		},

		packIcon: {
			width: 30,
			height: 30,
			borderRadius: 8,
		},

		empty: {
			flex: 1,
			alignItems: 'center',
			justifyContent: 'center',
			paddingHorizontal: 32,
		},
	})()

	return (
		<Pressable
			accessibilityRole="tab"
			accessibilityState={{
				selected: active,
			}}
			onPress={onPress}
			style={styles.categoryButton}
		>
			<View
				style={[
					styles.categoryInner,
					active &&
					styles.categoryActive,
				]}
			>
				{children}
			</View>
		</Pressable>
	)
}