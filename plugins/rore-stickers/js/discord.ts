import { ActionSheetActionCreators } from '@revenge-mod/discord/actions'
import { lookupModule } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import StickerPicker from './components/StickerPicker'
import { addRecentSticker } from './storage'
import { showToast } from './utils'
import type { Sticker } from './types'
import { logger } from './index'


export function findByProps<T = Record<string, unknown>>(
	prop: string,
	...props: string[]
): T | undefined {
	try {
		const [mod] = lookupModule(withProps(prop, ...props))
		return mod as T | undefined
	} catch {
		return undefined
	}
}

interface SelectedChannelStoreModule {
	getChannelId(): string | undefined
	getVoiceChannelId(): string | undefined
}

export interface MessageReference {
	guild_id?: string;
	channel_id: string;
	message_id: string;
}

export interface AllowedMentions {
	parse?: Array<"users" | "roles" | "everyone">;
	users?: string[];
	roles?: string[];
	replied_user?: boolean;
}

export interface MessagePayload {
	content: string;
	tts?: boolean;
	invalidEmojis?: unknown[];
	validNonShortcutEmojis?: unknown[];
}

export interface SendMessageOptions {
	openWarning?: boolean;
	skipCheck?: boolean;
	messageReference?: MessageReference;
	allowedMentions?: AllowedMentions;
	nonce?: string;
	flags?: number;
	enforce_nonce?: boolean;
}

export interface MessageActionsModule {
	sendMessage: (
		channelId: string,
		message: MessagePayload,
		promiseOrTrack?: boolean,
		options?: SendMessageOptions
	) => Promise<unknown> | void;

	editMessage: (
		channelId: string,
		messageId: string,
		message: { content: string }
	) => Promise<unknown> | void;

	deleteMessage: (
		channelId: string,
		messageId: string
	) => Promise<unknown> | void;

	startEditMessage: (
		channelId: string,
		messageId: string,
		content: string
	) => void;

	receiveMessage: (
		channelId: string,
		message: Record<string, unknown>
	) => void;

	sendBotMessage: (
		channelId: string,
		content: string
	) => void;

	sendCodedMessage: (
		channelId: string,
		content: string,
		codeType?: string
	) => void;
}

interface DraftStoreModule {
	getDraft(channelId: string, draftType?: number): string | undefined
}

interface DraftActionsModule {
	saveDraft?(channelId: string, draft: string, draftType?: number): void
	changeDraft?(channelId: string, draft: string, draftType?: number): void
}

interface UploadHandlerModule {
	promptToUpload?(files: unknown[], channel: unknown, draftType?: number): void
	uploadFiles?(options: Record<string, unknown>): Promise<unknown>
}

export function getSelectedChannelStore():
	| SelectedChannelStoreModule
	| undefined {
	return findByProps<SelectedChannelStoreModule>(
		'getChannelId',
		'getVoiceChannelId',
	)
}

export function getMessageActions(): MessageActionsModule | undefined {
	let x = findByProps<MessageActionsModule>('sendMessage')!
	console.log(Object.keys(x))
	return x
}

export function getDraftStore(): DraftStoreModule | undefined {
	return findByProps<DraftStoreModule>('getDraft')
}

export function getDraftActions(): DraftActionsModule | undefined {
	return (
		findByProps<DraftActionsModule>('saveDraft') ||
		findByProps<DraftActionsModule>('changeDraft')
	)
}

export function getUploadHandler(): UploadHandlerModule | undefined {
	return (
		findByProps<UploadHandlerModule>('promptToUpload') ||
		findByProps<UploadHandlerModule>('uploadFiles')
	)
}

export function getCurrentChannelId(): string | null {
	try {
		const store = getSelectedChannelStore()
		const id = store?.getChannelId()
		return id || null
	} catch {
		return null
	}
}

export async function insertStickerToDraft(
	sticker: Sticker,
	channelId?: string,
): Promise<void> {
	const targetChannelId = channelId || getCurrentChannelId()
	if (!targetChannelId) {
		showToast('No active channel selected.', true)
		return
	}

	try {
		const draftStore = getDraftStore()
		const draftActions = getDraftActions()

		const currentDraft = draftStore?.getDraft(targetChannelId, 0) || ''
		const separator =
			currentDraft &&
				!currentDraft.endsWith(' ') &&
				!currentDraft.endsWith('\n')
				? ' '
				: ''
		const newDraft = `${currentDraft}${separator}${sticker.image}`

		if (draftActions?.saveDraft) {
			draftActions.saveDraft(targetChannelId, newDraft, 0)
		} else if (draftActions?.changeDraft) {
			draftActions.changeDraft(targetChannelId, newDraft, 0)
		} else {
			showToast('Draft actions unavailable.', true)
			return
		}

		await addRecentSticker(sticker)
		showToast('Sticker added to message draft.')
	} catch (e) {
		console.warn('[RoreStickers] Failed to insert sticker into draft:', e)
		showToast('Failed to insert sticker into draft.', true)
	}
}

export const PICKER_ACTION_SHEET_KEY = 'RoreStickersPickerSheet'

export function openStickerPicker(channelId?: string): void {
	try {
		if (ActionSheetActionCreators?.openLazy) {
			ActionSheetActionCreators.openLazy(
				Promise.resolve({ default: StickerPicker }),
				PICKER_ACTION_SHEET_KEY,
				{
					channelId: channelId || getCurrentChannelId() || undefined,
					onClose: () => closeStickerPicker(),
				},
			)
			return
		}
	} catch (e) {
		logger.warn('[RoreStickers] Failed to open ActionSheet:', e)
	}
	showToast('Could not open sticker picker ActionSheet.', true)
}

export function closeStickerPicker(): void {
	try {
		if (ActionSheetActionCreators?.hideActionSheet) {
			ActionSheetActionCreators.hideActionSheet(PICKER_ACTION_SHEET_KEY)
		}
	} catch {
		// ignore
	}
}