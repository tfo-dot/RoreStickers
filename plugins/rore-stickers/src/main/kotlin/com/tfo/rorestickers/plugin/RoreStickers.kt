@file:JvmName("RoreStickers")

package com.tfo.rorestickers.plugin

import android.app.AlertDialog
import io.github.revenge.bridge.asDelegate
import io.github.revenge.plugins.plugin
import io.github.revenge.xposed.api.registerNativeMethod
import android.content.Intent
import java.io.File
import java.net.URL

private val messageRendererHooks = mutableSetOf<de.robv.android.xposed.XC_MethodHook.Unhook>()

@Suppress("UNUSED")
val roreStickersPlugin = plugin {
    start {
        val cacheDir = File(storageDir, "sticker_cache").also { it.mkdirs() }

        runCatching {
            messageRendererHooks += installRoreMessageRenderer(classLoader)
            log.i("Installed Rore message renderer (${messageRendererHooks.size} hooks)")
        }.onFailure {
            log.e("Failed to install Rore message renderer", it)
        }

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

        registerNativeMethod("${manifest.id}.xxh64") { rawArgs ->
            val args = rawArgs.asDelegate()
            val input: String by args.string()
            val seed: Long = 0L

            val hash = xxh64(input.toByteArray(Charsets.UTF_8), seed)
            java.lang.Long.toUnsignedString(hash, 16).padStart(16, '0')
        }

        log.i("Loaded ${manifest.id}")
    }

    stop {
        messageRendererHooks.forEach { runCatching { it.unhook() } }
        messageRendererHooks.clear()
        log.i("Unloaded ${manifest.id}")
    }
}

fun xxh64(input: ByteArray, seed: Long = 0L): Long {
    val PRIME1 = -7046029288634856825L
    val PRIME2 = -4417276706812531889L
    val PRIME3 =  1609587929392839161L
    val PRIME4 = -8796714831421723037L
    val PRIME5 =  2870177450012600261L

    var pos = 0
    var h64: Long
    val len = input.size

    if (len >= 32) {
        var v1 = seed + PRIME1 + PRIME2
        var v2 = seed + PRIME2
        var v3 = seed
        var v4 = seed - PRIME1

        do {
            v1 = java.lang.Long.rotateLeft(v1 + java.nio.ByteBuffer.wrap(input, pos, 8).order(java.nio.ByteOrder.LITTLE_ENDIAN).long * PRIME2, 31) * PRIME1; pos += 8
            v2 = java.lang.Long.rotateLeft(v2 + java.nio.ByteBuffer.wrap(input, pos, 8).order(java.nio.ByteOrder.LITTLE_ENDIAN).long * PRIME2, 31) * PRIME1; pos += 8
            v3 = java.lang.Long.rotateLeft(v3 + java.nio.ByteBuffer.wrap(input, pos, 8).order(java.nio.ByteOrder.LITTLE_ENDIAN).long * PRIME2, 31) * PRIME1; pos += 8
            v4 = java.lang.Long.rotateLeft(v4 + java.nio.ByteBuffer.wrap(input, pos, 8).order(java.nio.ByteOrder.LITTLE_ENDIAN).long * PRIME2, 31) * PRIME1; pos += 8
        } while (pos <= len - 32)

        h64 = java.lang.Long.rotateLeft(v1, 1) +
              java.lang.Long.rotateLeft(v2, 7) +
              java.lang.Long.rotateLeft(v3, 12) +
              java.lang.Long.rotateLeft(v4, 18)

        fun mergeRound(acc: Long, v: Long): Long {
            val vv = java.lang.Long.rotateLeft(v * PRIME2, 31) * PRIME1
            return (java.lang.Long.rotateLeft(acc xor vv, 27) + java.lang.Long.rotateLeft(v1, 1)) * PRIME1 + PRIME4
        }

        h64 = mergeRound(h64, v1)
        h64 = mergeRound(h64, v2)
        h64 = mergeRound(h64, v3)
        h64 = mergeRound(h64, v4)
    } else {
        h64 = seed + PRIME5
    }

    h64 += len.toLong()

    val buf = java.nio.ByteBuffer.wrap(input).order(java.nio.ByteOrder.LITTLE_ENDIAN)
    buf.position(pos)

    while (buf.remaining() >= 8) {
        h64 = java.lang.Long.rotateLeft(h64 xor (java.lang.Long.rotateLeft(buf.long * PRIME2, 31) * PRIME1), 27) * PRIME1 + PRIME4
    }
    while (buf.remaining() >= 4) {
        h64 = java.lang.Long.rotateLeft(h64 xor (Integer.toUnsignedLong(buf.int) * PRIME1), 23) * PRIME2 + PRIME3
    }
    while (buf.hasRemaining()) {
        h64 = java.lang.Long.rotateLeft(h64 xor ((buf.get().toLong() and 0xFF) * PRIME5), 11) * PRIME1
    }

    h64 = h64 xor (h64 ushr 33)
    h64 *= PRIME2
    h64 = h64 xor (h64 ushr 29)
    h64 *= PRIME3
    h64 = h64 xor (h64 ushr 32)

    return h64
}