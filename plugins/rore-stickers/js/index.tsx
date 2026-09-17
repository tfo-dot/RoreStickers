import { Logger } from '@revenge-mod/discord/common/logger';

import PackManager from './components/PackManager'
import { applyPatches } from './patches'

import {start, stop} from './menu_patch'

let unpatch: (() => void) | null = null
export let logger: InstanceType<typeof Logger>;

export default plugin({
	start() {
		logger = new Logger("RoreStickers");
		unpatch = applyPatches()
		start()
        logger.info("Plugin started!");
	},
	stop() {
		if (unpatch) {
			unpatch()
			unpatch = null
		}
		stop()
	},
	SettingsComponent: PackManager,
})
