import { ActionSheetActionCreators } from '@revenge-mod/discord/actions'
import { Design } from '@revenge-mod/discord/design'
import { before, after } from '@revenge-mod/patcher'
import { findInTree } from '@revenge-mod/utils/tree'
import React from 'react'
import PackInfoModal from './components/PackInfoModal'
import { openStickerPicker } from './discord'
import { parseStickerAttachment } from './filenameProtocol'
import type { IncomingMessageSticker } from './types'
import { logger } from './index'
import { getModules, lookupModule, lookupModules, waitForModules } from "@revenge-mod/modules/finders";
import { createFilterGenerator, FilterScopes, withProps } from '@revenge-mod/modules/finders/filters'

interface ChildrenHolder {
	children: React.ReactNode[]
}

export const RORE_STICKER_TAB_ID = "rore_stickers_category";

export function applyPatches(): () => void {
	const unpatches: Array<() => void> = []
	
	try {
		if (
			ActionSheetActionCreators &&
			typeof ActionSheetActionCreators.openLazy === 'function'
		) {
			const unpatch = before(
				ActionSheetActionCreators,
				'openLazy',
				([sheetPromise, key, props, stackingBehavior]) => {
					const wrappedSheetPromise = (async () => {
						const resolved = await sheetPromise
						const OriginalComponent = resolved.default

						const PatchedComponent: React.FC<
							Record<string, unknown>
						> = componentProps => {
							const res = React.createElement(
								OriginalComponent,
								componentProps,
							) as React.ReactElement<{
								children?: React.ReactNode
							}>

							try {
								const keyStr = String(key || '').toLowerCase()

								// Check if this is a chat action sheet (e.g. "+" button pressed in chat)
								const isChatActionSheet =
									keyStr.includes('chat') ||
									keyStr.includes('textinput') ||
									keyStr.includes('attachment') ||
									keyStr.includes('action')

								// Check if this is a message context menu
								const isMessageContextMenu =
									keyStr.includes('message') || keyStr.includes('context')

								const ActionSheetRow = Design?.ActionSheetRow
								if (!ActionSheetRow) return res

								// Handle chat action sheet
								if (isChatActionSheet) {
									const container = findInTree(
										res as unknown as Record<string, unknown>,
										(tree: Record<string, unknown>) =>
											Array.isArray(tree?.children),
									) as ChildrenHolder | undefined

									if (container && Array.isArray(container.children)) {
										const channelId =
											typeof componentProps?.channelId === 'string'
												? componentProps.channelId
												: undefined

										const moreStickersRow = (
											<ActionSheetRow
												key="rore-stickers-row"
												label="MoreStickers"
												subLabel="Send stickers from LINE and custom packs"
												onPress={() => {
													ActionSheetActionCreators.hideActionSheet(key)
													openStickerPicker(channelId)
												}}
											/>
										)

										container.children.push(moreStickersRow)
									}
								}

								// Handle message context menu with sticker attachment
								if (isMessageContextMenu && componentProps?.message) {
									const msg = componentProps.message as Record<string, unknown>
									const attachments = Array.isArray(msg?.attachments)
										? msg.attachments
										: []

									let stickerAttachment: IncomingMessageSticker | null = null
									for (const att of attachments) {
										const parsed = parseStickerAttachment(att)
										if (parsed) {
											stickerAttachment = parsed
											break
										}
									}

									if (stickerAttachment) {
										const container = findInTree(
											res as unknown as Record<string, unknown>,
											(tree: Record<string, unknown>) =>
												Array.isArray(tree?.children),
										) as ChildrenHolder | undefined

										if (container && Array.isArray(container.children)) {
											const currentSticker = stickerAttachment
											const installRow = (
												<ActionSheetRow
													key="rore-stickers-install-row"
													label="Install Sticker Pack"
													subLabel={`Pack: ${currentSticker.metadata.data.packTitle}`}
													variant="default"
													onPress={() => {
														ActionSheetActionCreators.hideActionSheet(key)
														ActionSheetActionCreators.openLazy(
															Promise.resolve({
																default: (modalProps: {
																	onClose?: () => void
																}) => (
																	<PackInfoModal
																		metadata={currentSticker.metadata}
																		imageUrl={currentSticker.imageUrl}
																		onClose={() => {
																			ActionSheetActionCreators.hideActionSheet(
																				'RoreStickersPackInfoModal',
																			)
																			modalProps.onClose?.()
																		}}
																	/>
																),
															}),
															'RoreStickersPackInfoModal',
															{},
														)
													}}
												/>
											)

											container.children.unshift(installRow)
										}
									}
								}
							} catch (e) {
								logger.warn('[RoreStickers] Error patching ActionSheet:', e)
							}

							return res
						}

						return { default: PatchedComponent }
					})()

					return [wrappedSheetPromise, key, props, stackingBehavior]
				},
			)

			unpatches.push(unpatch)
		}
	} catch (e) {
		logger.warn('Failed to apply patches:', e)
	}

	return () => {
		for (const unpatch of unpatches) {
			try {

				unpatch()
			} catch (e) {
				logger.warn('Failed to remove patches:', e)
			}

		}
	}
}