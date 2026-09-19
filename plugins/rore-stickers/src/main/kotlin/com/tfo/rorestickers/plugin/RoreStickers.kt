@file:JvmName("RoreStickers")

package com.tfo.rorestickers.plugin

import android.app.AlertDialog
import io.github.revenge.bridge.asDelegate
import io.github.revenge.plugins.plugin
import io.github.revenge.xposed.api.registerNativeMethod
import android.content.Intent
import java.io.File
import java.net.URL

@Suppress("UNUSED")
val roreStickersPlugin = plugin {
    start {
        val cacheDir = File(storageDir, "sticker_cache").also { it.mkdirs() }

        registerNativeMethod("${manifest.id}.downloadSticker") { rawArgs ->
            val args = rawArgs.asDelegate()
            val url: String by args.string()
            val filename: String by args.string()

            val file = File(cacheDir, filename)

            // Use cache if already downloaded
            if (!file.exists()) {
                URL(url).openStream().use { input ->
                    file.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }
            }

            // Return absolute path — JS side will use it as a URI directly
            // on Android file:// works for Discord's own upload picker
            file.absolutePath
        }

        log.i("Loaded ${manifest.id}")
    }

    stop {
        log.i("Unloaded ${manifest.id}")
    }
}