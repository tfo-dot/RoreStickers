import { Logger } from '@revenge-mod/discord/common/logger';

import PackManager from './components/PackManager'

import { start, stop } from './menu_patch'

export let logger: InstanceType<typeof Logger>;

export default plugin({
	start() {
		logger = new Logger("RoreStickers");
		start()
		logger.info("Plugin started!");
	},
	stop() {
		stop()
	},
	SettingsComponent: PackManager,
})
