import { useEffect, useState } from 'react'
import {
	ActivityIndicator,
	Image,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import {
	importStickerPackFromMetadata,
	isPackInstalledFromMetadata,
} from '../filenameProtocol'
import {
	getStickerPackMetas,
	saveStickerPack,
	useRoreStorage,
} from '../storage'
import { showToast } from '../utils'
import type React from 'react'
import type { StickerFilenamePayload } from '../types'

interface PackInfoModalProps {
	metadata: StickerFilenamePayload
	imageUrl?: string
	onClose: () => void
}

export default function PackInfoModal({
	metadata,
	imageUrl,
	onClose,
}: PackInfoModalProps): React.JSX.Element {
	const storage = useRoreStorage()
	const [isInstalled, setIsInstalled] = useState<boolean>(false)
	const [isInstalling, setIsInstalling] = useState<boolean>(false)

	const packTitle = metadata.data.packTitle || 'Unknown Pack'
	const packSource =
		metadata.source === 'line'
			? `LINE ${metadata.data.type === 'sticker' ? 'Sticker' : 'Emoji'}`
			: `Custom (${metadata.data.host})`

	useEffect(() => {
		let isMounted = true
		void (async () => {
			const metas = await getStickerPackMetas()
			if (isMounted) {
				setIsInstalled(isPackInstalledFromMetadata(metadata, metas))
			}
		})()
		return () => {
			isMounted = false
		}
	}, [metadata, storage.packs])

	const handleInstall = async () => {
		setIsInstalling(true)
		try {
			const pack = await importStickerPackFromMetadata(metadata)
			await saveStickerPack(pack)
			setIsInstalled(true)
			showToast(`Successfully installed "${pack.title}"!`)
			onClose()
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			showToast(`Failed to install pack: ${msg}`, true)
		} finally {
			setIsInstalling(false)
		}
	}

	return (
		<View style={styles.container}>
			<View style={styles.card}>
				<Text style={styles.headerTitle}>Sticker Pack Info</Text>

				{imageUrl && (
					<View style={styles.imageWrapper}>
						<Image
							source={{ uri: imageUrl }}
							style={styles.previewImage}
							resizeMode="contain"
						/>
					</View>
				)}

				<View style={styles.infoRow}>
					<Text style={styles.packTitle}>{packTitle}</Text>
					<Text style={styles.packSource}>Source: {packSource}</Text>
				</View>

				<View style={styles.buttonRow}>
					<TouchableOpacity
						style={[styles.installButton, isInstalled && styles.buttonDisabled]}
						onPress={handleInstall}
						disabled={isInstalled || isInstalling}
					>
						{isInstalling ? (
							<ActivityIndicator color="#ffffff" size="small" />
						) : (
							<Text style={styles.buttonText}>
								{isInstalled ? 'Already Installed' : 'Install Sticker Pack'}
							</Text>
						)}
					</TouchableOpacity>

					<TouchableOpacity style={styles.closeButton} onPress={onClose}>
						<Text style={styles.closeButtonText}>Close</Text>
					</TouchableOpacity>
				</View>
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.6)',
		alignItems: 'center',
		justifyContent: 'center',
		padding: 24,
	},
	card: {
		width: '100%',
		maxWidth: 360,
		backgroundColor: '#2f3136',
		borderRadius: 14,
		padding: 20,
		alignItems: 'center',
	},
	headerTitle: {
		fontSize: 16,
		fontWeight: '700',
		color: '#ffffff',
		marginBottom: 16,
	},
	imageWrapper: {
		width: 100,
		height: 100,
		backgroundColor: '#202225',
		borderRadius: 12,
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 16,
		overflow: 'hidden',
	},
	previewImage: {
		width: 88,
		height: 88,
	},
	infoRow: {
		alignItems: 'center',
		marginBottom: 20,
	},
	packTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#ffffff',
		textAlign: 'center',
		marginBottom: 4,
	},
	packSource: {
		fontSize: 13,
		color: '#b9bbbe',
		textAlign: 'center',
	},
	buttonRow: {
		width: '100%',
		gap: 10,
	},
	installButton: {
		backgroundColor: '#5865f2',
		paddingVertical: 12,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center',
	},
	buttonDisabled: {
		backgroundColor: '#4f545c',
		opacity: 0.8,
	},
	buttonText: {
		color: '#ffffff',
		fontSize: 14,
		fontWeight: '600',
	},
	closeButton: {
		backgroundColor: '#36393f',
		paddingVertical: 12,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center',
	},
	closeButtonText: {
		color: '#dcddde',
		fontSize: 14,
		fontWeight: '600',
	},
})
