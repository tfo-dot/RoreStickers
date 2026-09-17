import { Clipboard } from '@revenge-mod/externals/react-native-clipboard'
import { useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	Image,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import { getCustomStickerPackByUrl } from '../customPacks'
import { openStickerPicker } from '../discord'
import {
	convert as convertLineEP,
	getStickerPackById as getLineEmojiPackById,
	getIdFromUrl as getLineEmojiPackIdFromUrl,
	isLineEmojiPackHtml,
	parseHtml as parseLineEmojiHtml,
} from '../lineEmojis'
import {
	convert as convertLineSP,
	getStickerPackById as getLineStickerPackById,
	getIdFromUrl as getLineStickerPackIdFromUrl,
	isLineStickerPackHtml,
	parseHtml as parseLineStickerHtml,
} from '../lineStickers'
import {
	clearRecentStickers,
	deleteStickerPack,
	exportBackup,
	importBackup,
	saveStickerPack,
	updateSettings,
	useRoreStorage,
} from '../storage'
import { isValidHttpsUrl, showToast } from '../utils'
import type React from 'react'
import type { Sticker, StickerPack } from '../types'

enum TabKey {
	PACKS = 'packs',
	ADD = 'add',
	SETTINGS = 'settings',
	BACKUP = 'backup',
}

export default function PackManager(): React.JSX.Element {
	const storage = useRoreStorage()
	const [activeTab, setActiveTab] = useState<TabKey>(TabKey.PACKS)
	const [previewPackId, setPreviewPackId] = useState<string | null>(null)

	// Add pack state
	const [inputUrl, setInputUrl] = useState<string>('')
	const [inputHtml, setInputHtml] = useState<string>('')
	const [isLoading, setIsLoading] = useState<boolean>(false)

	// Backup state
	const [backupInput, setBackupInput] = useState<string>('')

	const handleImportFromUrl = async () => {
		const trimmed = inputUrl.trim()
		if (!trimmed) {
			showToast('Please enter a URL or ID.', true)
			return
		}

		setIsLoading(true)
		try {
			// Check if custom pack JSON URL
			if (trimmed.endsWith('.json') || trimmed.includes('/stickerpack/')) {
				const customPack = await getCustomStickerPackByUrl(trimmed)
				await saveStickerPack(customPack)
				showToast(`Imported custom pack "${customPack.title}"!`)
				setInputUrl('')
				setActiveTab(TabKey.PACKS)
				return
			}

			// Check if LINE sticker URL or numeric ID
			const lineStickerId = getLineStickerPackIdFromUrl(trimmed)
			if (lineStickerId) {
				const linePack = await getLineStickerPackById(lineStickerId)
				const converted = convertLineSP(linePack)
				await saveStickerPack(converted)
				showToast(`Imported LINE sticker pack "${converted.title}"!`)
				setInputUrl('')
				setActiveTab(TabKey.PACKS)
				return
			}

			// Check if LINE emoji URL
			const lineEmojiId = getLineEmojiPackIdFromUrl(trimmed)
			if (lineEmojiId) {
				const lineEmojiPack = await getLineEmojiPackById(lineEmojiId)
				const converted = convertLineEP(lineEmojiPack)
				await saveStickerPack(converted)
				showToast(`Imported LINE emoji pack "${converted.title}"!`)
				setInputUrl('')
				setActiveTab(TabKey.PACKS)
				return
			}

			// Fallback: try as custom pack JSON if valid HTTPS URL
			if (isValidHttpsUrl(trimmed)) {
				const customPack = await getCustomStickerPackByUrl(trimmed)
				await saveStickerPack(customPack)
				showToast(`Imported custom pack "${customPack.title}"!`)
				setInputUrl('')
				setActiveTab(TabKey.PACKS)
				return
			}

			showToast('Unrecognized sticker pack URL or ID.', true)
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			showToast(`Import failed: ${msg}`, true)
		} finally {
			setIsLoading(false)
		}
	}

	const handleImportFromHtml = async () => {
		const trimmed = inputHtml.trim()
		if (!trimmed) {
			showToast('Please paste HTML content.', true)
			return
		}

		setIsLoading(true)
		try {
			if (isLineStickerPackHtml(trimmed)) {
				const pack = parseLineStickerHtml(trimmed)
				const converted = convertLineSP(pack)
				await saveStickerPack(converted)
				showToast(`Imported LINE sticker pack "${converted.title}"!`)
				setInputHtml('')
				setActiveTab(TabKey.PACKS)
				return
			}

			if (isLineEmojiPackHtml(trimmed)) {
				const pack = parseLineEmojiHtml(trimmed)
				const converted = convertLineEP(pack)
				await saveStickerPack(converted)
				showToast(`Imported LINE emoji pack "${converted.title}"!`)
				setInputHtml('')
				setActiveTab(TabKey.PACKS)
				return
			}

			showToast('Could not recognize sticker pack from provided HTML.', true)
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			showToast(`Import failed: ${msg}`, true)
		} finally {
			setIsLoading(false)
		}
	}

	const handleDeletePack = (pack: StickerPack) => {
		Alert.alert(
			'Delete Sticker Pack',
			`Are you sure you want to delete "${pack.title}"?`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: async () => {
						try {
							await deleteStickerPack(pack.id)
							showToast(`Deleted "${pack.title}".`)
						} catch {
							showToast('Failed to delete pack.', true)
						}
					},
				},
			],
		)
	}

	const handleExportBackup = async () => {
		try {
			const backup = await exportBackup()
			Clipboard.setString(backup)
			showToast('Backup copied to clipboard!')
		} catch {
			showToast('Failed to export backup.', true)
		}
	}

	const handleImportBackup = async () => {
		const trimmed = backupInput.trim()
		if (!trimmed) {
			showToast('Please paste backup JSON.', true)
			return
		}

		try {
			const count = await importBackup(trimmed)
			showToast(`Successfully imported ${count} sticker pack(s)!`)
			setBackupInput('')
			setActiveTab(TabKey.PACKS)
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			showToast(`Failed to import backup: ${msg}`, true)
		}
	}

	const handleClearRecents = async () => {
		Alert.alert(
			'Clear Recent Stickers',
			'Are you sure you want to clear your recently used stickers?',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Clear',
					style: 'destructive',
					onPress: async () => {
						await clearRecentStickers()
						showToast('Recent stickers cleared.')
					},
				},
			],
		)
	}

	return (
		<View style={styles.container}>
			{/* Top Tabs */}
			<View style={styles.navBar}>
				<TouchableOpacity
					style={[
						styles.navTab,
						activeTab === TabKey.PACKS && styles.navTabActive,
					]}
					onPress={() => setActiveTab(TabKey.PACKS)}
				>
					<Text
						style={[
							styles.navTabText,
							activeTab === TabKey.PACKS && styles.navTabTextActive,
						]}
					>
						Packs ({storage.packs.length})
					</Text>
				</TouchableOpacity>

				<TouchableOpacity
					style={[
						styles.navTab,
						activeTab === TabKey.ADD && styles.navTabActive,
					]}
					onPress={() => setActiveTab(TabKey.ADD)}
				>
					<Text
						style={[
							styles.navTabText,
							activeTab === TabKey.ADD && styles.navTabTextActive,
						]}
					>
						+ Add Pack
					</Text>
				</TouchableOpacity>

				<TouchableOpacity
					style={[
						styles.navTab,
						activeTab === TabKey.SETTINGS && styles.navTabActive,
					]}
					onPress={() => setActiveTab(TabKey.SETTINGS)}
				>
					<Text
						style={[
							styles.navTabText,
							activeTab === TabKey.SETTINGS && styles.navTabTextActive,
						]}
					>
						Settings
					</Text>
				</TouchableOpacity>

				<TouchableOpacity
					style={[
						styles.navTab,
						activeTab === TabKey.BACKUP && styles.navTabActive,
					]}
					onPress={() => setActiveTab(TabKey.BACKUP)}
				>
					<Text
						style={[
							styles.navTabText,
							activeTab === TabKey.BACKUP && styles.navTabTextActive,
						]}
					>
						Backup
					</Text>
				</TouchableOpacity>
			</View>

			<ScrollView
				style={styles.scrollArea}
				contentContainerStyle={styles.scrollContent}
			>
				{/* PACKS TAB */}
				{activeTab === TabKey.PACKS && (
					<View>
						<View style={styles.actionRow}>
							<TouchableOpacity
								style={styles.primaryButton}
								onPress={() => openStickerPicker()}
							>
								<Text style={styles.primaryButtonText}>
									Open Sticker Picker
								</Text>
							</TouchableOpacity>
						</View>

						{storage.packs.length === 0 ? (
							<View style={styles.emptyCard}>
								<Text style={styles.emptyTitle}>
									No Sticker Packs Installed
								</Text>
								<Text style={styles.emptySubtitle}>
									Tap "+ Add Pack" above to import LINE stickers, LINE emojis,
									or custom sticker packs!
								</Text>
							</View>
						) : (
							storage.packs.map((pack: StickerPack) => {
								const isExpanded = previewPackId === pack.id
								return (
									<View key={pack.id} style={styles.packCard}>
										<View style={styles.packHeader}>
											{pack.logo?.image ? (
												<Image
													source={{ uri: pack.logo.previewImage }}
													style={styles.packLogo}
												/>
											) : (
												<View style={styles.packLogoPlaceholder}>
													<Text style={styles.packLogoPlaceholderText}>📦</Text>
												</View>
											)}
											<View style={styles.packInfo}>
												<Text style={styles.packTitle} numberOfLines={1}>
													{pack.title}
												</Text>
											</View>
											<View style={styles.packActions}>
												<TouchableOpacity
													style={styles.actionIconBtn}
													onPress={() =>
														setPreviewPackId(isExpanded ? null : pack.id)
													}
												>
													<Text style={styles.actionIconBtnText}>
														{isExpanded ? '▲' : '▼'}
													</Text>
												</TouchableOpacity>
												<TouchableOpacity
													style={[styles.actionIconBtn, styles.deleteBtn]}
													onPress={() => handleDeletePack(pack)}
												>
													<Text style={styles.deleteBtnText}>🗑</Text>
												</TouchableOpacity>
											</View>
										</View>

										{/* Expanded preview grid */}
										{isExpanded && (
											<View style={styles.previewGrid}>
												{pack.stickers.map((stk: Sticker) => (
													<View key={stk.id} style={styles.previewItem}>
														<Image
															source={{ uri: stk.previewImage }}
															style={styles.previewImage}
															resizeMode="contain"
														/>
													</View>
												))}
											</View>
										)}
									</View>
								)
							})
						)}
					</View>
				)}

				{/* ADD PACK TAB */}
				{activeTab === TabKey.ADD && (
					<View style={styles.addSection}>
						<Text style={styles.sectionHeader}>Import by URL or ID</Text>
						<Text style={styles.sectionDescription}>
							Paste a LINE Sticker Store URL, LINE Emoji URL, numeric ID, or a
							custom sticker pack JSON URL.
						</Text>

						<TextInput
							style={styles.textInput}
							placeholder="e.g. 22814489 or https://store.line.me/stickershop/product/..."
							placeholderTextColor="#72767d"
							value={inputUrl}
							onChangeText={setInputUrl}
							autoCapitalize="none"
							autoCorrect={false}
						/>

						<TouchableOpacity
							style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
							onPress={handleImportFromUrl}
							disabled={isLoading}
						>
							{isLoading ? (
								<ActivityIndicator color="#ffffff" size="small" />
							) : (
								<Text style={styles.primaryButtonText}>
									Import from URL / ID
								</Text>
							)}
						</TouchableOpacity>

						<View style={styles.divider} />

						<Text style={styles.sectionHeader}>Import from Raw HTML</Text>
						<Text style={styles.sectionDescription}>
							If the URL is blocked by network or CORS, copy and paste the page
							HTML here.
						</Text>

						<TextInput
							style={[styles.textInput, styles.textArea]}
							placeholder="Paste LINE store page HTML here..."
							placeholderTextColor="#72767d"
							value={inputHtml}
							onChangeText={setInputHtml}
							multiline={true}
							numberOfLines={4}
							autoCapitalize="none"
							autoCorrect={false}
						/>

						<TouchableOpacity
							style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
							onPress={handleImportFromHtml}
							disabled={isLoading}
						>
							{isLoading ? (
								<ActivityIndicator color="#ffffff" size="small" />
							) : (
								<Text style={styles.primaryButtonText}>Import from HTML</Text>
							)}
						</TouchableOpacity>
					</View>
				)}

				{/* SETTINGS TAB */}
				{activeTab === TabKey.SETTINGS && (
					<View style={styles.settingsSection}>
						<View style={styles.settingRow}>
							<View style={styles.settingTextCol}>
								<Text style={styles.settingLabel}>
									Insert to Draft / Prompt
								</Text>
								<Text style={styles.settingSublabel}>
									Inserts the sticker image into your message input instead of
									sending it immediately.
								</Text>
							</View>
							<Switch
								value={storage.settings.promptToUpload}
								onValueChange={val => updateSettings({ promptToUpload: val })}
								trackColor={{ false: '#4f545c', true: '#5865f2' }}
							/>
						</View>

						<View style={styles.settingRow}>
							<View style={styles.settingTextCol}>
								<Text style={styles.settingLabel}>Send Sticker Directly</Text>
								<Text style={styles.settingSublabel}>
									Sends sticker as a full-resolution image message directly into
									the chat.
								</Text>
							</View>
							<Switch
								value={storage.settings.sendAsLink}
								onValueChange={val => updateSettings({ sendAsLink: val })}
								trackColor={{ false: '#4f545c', true: '#5865f2' }}
							/>
						</View>

						<View style={styles.settingRow}>
							<View style={styles.settingTextCol}>
								<Text style={styles.settingLabel}>
									Show in Chat Action Sheet
								</Text>
								<Text style={styles.settingSublabel}>
									Adds a "MoreStickers" option when opening the chat actions (+)
									menu.
								</Text>
							</View>
							<Switch
								value={storage.settings.showInActionSheet}
								onValueChange={val =>
									updateSettings({ showInActionSheet: val })
								}
								trackColor={{ false: '#4f545c', true: '#5865f2' }}
							/>
						</View>

						<View style={styles.settingRow}>
							<View style={styles.settingTextCol}>
								<Text style={styles.settingLabel}>
									Message Menu Pack Installer
								</Text>
								<Text style={styles.settingSublabel}>
									Shows "Install Sticker Pack" in message context menus for
									MoreStickers attachments.
								</Text>
							</View>
							<Switch
								value={storage.settings.showInstallInMessages}
								onValueChange={val =>
									updateSettings({ showInstallInMessages: val })
								}
								trackColor={{ false: '#4f545c', true: '#5865f2' }}
							/>
						</View>

						<View style={styles.divider} />

						<TouchableOpacity
							style={styles.dangerButton}
							onPress={handleClearRecents}
						>
							<Text style={styles.dangerButtonText}>Clear Recent Stickers</Text>
						</TouchableOpacity>
					</View>
				)}

				{/* BACKUP TAB */}
				{activeTab === TabKey.BACKUP && (
					<View style={styles.backupSection}>
						<Text style={styles.sectionHeader}>Export Sticker Packs</Text>
						<Text style={styles.sectionDescription}>
							Export all your installed sticker packs as a JSON backup string
							and copy it to your clipboard.
						</Text>

						<TouchableOpacity
							style={styles.primaryButton}
							onPress={handleExportBackup}
						>
							<Text style={styles.primaryButtonText}>
								Copy Backup to Clipboard
							</Text>
						</TouchableOpacity>

						<View style={styles.divider} />

						<Text style={styles.sectionHeader}>Import Sticker Packs</Text>
						<Text style={styles.sectionDescription}>
							Paste a previously exported JSON backup to restore your packs.
						</Text>

						<TextInput
							style={[styles.textInput, styles.textArea]}
							placeholder="Paste JSON backup here..."
							placeholderTextColor="#72767d"
							value={backupInput}
							onChangeText={setBackupInput}
							multiline={true}
							numberOfLines={5}
							autoCapitalize="none"
							autoCorrect={false}
						/>

						<TouchableOpacity
							style={styles.primaryButton}
							onPress={handleImportBackup}
						>
							<Text style={styles.primaryButtonText}>Restore Backup</Text>
						</TouchableOpacity>
					</View>
				)}
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#36393f',
	},
	navBar: {
		flexDirection: 'row',
		backgroundColor: '#2f3136',
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: '#202225',
	},
	navTab: {
		flex: 1,
		paddingVertical: 12,
		alignItems: 'center',
		justifyContent: 'center',
		borderBottomWidth: 2,
		borderBottomColor: 'transparent',
	},
	navTabActive: {
		borderBottomColor: '#5865f2',
	},
	navTabText: {
		color: '#8e9297',
		fontSize: 13,
		fontWeight: '600',
	},
	navTabTextActive: {
		color: '#ffffff',
	},
	scrollArea: {
		flex: 1,
	},
	scrollContent: {
		padding: 16,
		paddingBottom: 40,
	},
	actionRow: {
		marginBottom: 16,
	},
	primaryButton: {
		backgroundColor: '#5865f2',
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center',
	},
	primaryButtonText: {
		color: '#ffffff',
		fontSize: 14,
		fontWeight: '600',
	},
	buttonDisabled: {
		opacity: 0.6,
	},
	dangerButton: {
		backgroundColor: '#ed4245',
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center',
		marginTop: 8,
	},
	dangerButtonText: {
		color: '#ffffff',
		fontSize: 14,
		fontWeight: '600',
	},
	emptyCard: {
		padding: 32,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#2f3136',
		borderRadius: 12,
	},
	emptyTitle: {
		color: '#ffffff',
		fontSize: 16,
		fontWeight: '700',
		marginBottom: 8,
		textAlign: 'center',
	},
	emptySubtitle: {
		color: '#8e9297',
		fontSize: 13,
		textAlign: 'center',
		lineHeight: 18,
	},
	packCard: {
		backgroundColor: '#2f3136',
		borderRadius: 10,
		marginBottom: 10,
		overflow: 'hidden',
	},
	packHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
	},
	packLogo: {
		width: 44,
		height: 44,
		borderRadius: 8,
		backgroundColor: '#202225',
	},
	packLogoPlaceholder: {
		width: 44,
		height: 44,
		borderRadius: 8,
		backgroundColor: '#202225',
		alignItems: 'center',
		justifyContent: 'center',
	},
	packLogoPlaceholderText: {
		fontSize: 22,
	},
	packInfo: {
		flex: 1,
		marginLeft: 12,
	},
	packTitle: {
		color: '#ffffff',
		fontSize: 15,
		fontWeight: '600',
	},
	packAuthor: {
		color: '#b9bbbe',
		fontSize: 12,
		marginTop: 2,
	},
	packActions: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
	},
	actionIconBtn: {
		width: 34,
		height: 34,
		borderRadius: 6,
		backgroundColor: '#40444b',
		alignItems: 'center',
		justifyContent: 'center',
	},
	actionIconBtnText: {
		color: '#dcddde',
		fontSize: 12,
	},
	deleteBtn: {
		backgroundColor: '#4f2b2d',
	},
	deleteBtnText: {
		fontSize: 14,
	},
	previewGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		padding: 8,
		backgroundColor: '#202225',
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: '#2f3136',
	},
	previewItem: {
		width: '20%',
		aspectRatio: 1,
		padding: 4,
	},
	previewImage: {
		width: '100%',
		height: '100%',
	},
	addSection: {
		backgroundColor: '#2f3136',
		borderRadius: 12,
		padding: 16,
	},
	settingsSection: {
		backgroundColor: '#2f3136',
		borderRadius: 12,
		padding: 16,
	},
	backupSection: {
		backgroundColor: '#2f3136',
		borderRadius: 12,
		padding: 16,
	},
	sectionHeader: {
		color: '#ffffff',
		fontSize: 15,
		fontWeight: '700',
		marginBottom: 4,
	},
	sectionDescription: {
		color: '#b9bbbe',
		fontSize: 13,
		lineHeight: 18,
		marginBottom: 12,
	},
	textInput: {
		backgroundColor: '#202225',
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
		color: '#ffffff',
		fontSize: 14,
		marginBottom: 12,
	},
	textArea: {
		height: 100,
		textAlignVertical: 'top',
	},
	divider: {
		height: StyleSheet.hairlineWidth,
		backgroundColor: '#40444b',
		marginVertical: 18,
	},
	settingRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: 10,
	},
	settingTextCol: {
		flex: 1,
		marginRight: 16,
	},
	settingLabel: {
		color: '#ffffff',
		fontSize: 14,
		fontWeight: '600',
		marginBottom: 2,
	},
	settingSublabel: {
		color: '#b9bbbe',
		fontSize: 12,
		lineHeight: 16,
	},
})
