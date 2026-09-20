package com.tfo.rorestickers.plugin

import android.app.Dialog
import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.util.Base64
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import de.robv.android.xposed.XposedHelpers
import java.nio.charset.StandardCharsets

private const val MAGIC_PREFIX = "morestickers_"
private const val SPOILER_PREFIX = "SPOILER_"
private const val MESSAGE_PROTOCOL_VERSION = "2"
private const val STICKER_SIZE_DP = 160

/**
 * Filename protocol emitted by StickerPicker.tsx:
 *
 * morestickers_<base64url("2;<hostHash>;<stickerId>;<stickerPackId>;<emoji>;<packTitle>")>.<ext>
 *
 * `emoji` is Sticker.title. It is already a Unicode emoji, not a sticker name.
 * `packTitle` is the last field and may itself contain semicolons.
 */
internal data class RoreMessageSticker(
    val hostHash: String,
    val stickerId: String,
    val stickerPackId: String,
    val emoji: String,
    val packTitle: String,
    val extension: String,
)

internal object RoreFilenameProtocol {
    fun parse(rawFilename: String?): RoreMessageSticker? {
        if (rawFilename.isNullOrBlank()) return null

        // Keep the protocol working if Discord ever prefixes an attachment marked as spoiler.
        val filename = rawFilename.removePrefix(SPOILER_PREFIX)
        if (!filename.startsWith(MAGIC_PREFIX)) return null

        val extensionIndex = filename.lastIndexOf('.')
        if (
            extensionIndex <= MAGIC_PREFIX.length ||
            extensionIndex >= filename.length - 1
        ) {
            return null
        }

        val encoded = filename.substring(MAGIC_PREFIX.length, extensionIndex)
        val extension = filename.substring(extensionIndex + 1)

        return runCatching {
            // Android Base64 accepts unpadded URL-safe input. NO_WRAP prevents whitespace rules
            // from changing how the filename payload is interpreted.
            val decoded = String(
                Base64.decode(encoded, Base64.URL_SAFE or Base64.NO_WRAP),
                StandardCharsets.UTF_8,
            )

            // Limit to six elements so semicolons inside packTitle survive intact.
            val fields = decoded.split(';', limit = 6)
            if (fields.size != 6) return@runCatching null

            val version = fields[0]
            val hostHash = fields[1]
            val stickerId = fields[2]
            val stickerPackId = fields[3]
            val emoji = fields[4]
            val packTitle = fields[5]

            if (version != MESSAGE_PROTOCOL_VERSION) return@runCatching null
            if (hostHash.isBlank()) return@runCatching null
            if (stickerId.isBlank()) return@runCatching null
            if (stickerPackId.isBlank()) return@runCatching null
            if (emoji.isBlank()) return@runCatching null
            if (packTitle.isBlank()) return@runCatching null

            RoreMessageSticker(
                hostHash = hostHash,
                stickerId = stickerId,
                stickerPackId = stickerPackId,
                emoji = emoji,
                packTitle = packTitle,
                extension = extension,
            )
        }.getOrNull()
    }
}

/**
 * Installs the Android-side Rore message renderer.
 *
 * We intentionally do NOT create a fake Discord Sticker and do NOT modify result.stickers.
 * Discord keeps the object as an ImageAttachmentMessageAccessory, which means its bridge schema
 * remains valid. We only intercept the native image ViewHolder after the bridge has deserialized
 * the message and give the Rore attachment sticker-like layout + interaction.
 */
internal fun installRoreMessageRenderer(
    classLoader: ClassLoader,
): Set<XC_MethodHook.Unhook> {
    val hooks = linkedSetOf<XC_MethodHook.Unhook>()

    try {
        hooks += installImageViewHolderHook(classLoader)
        hooks += installMosaicSizeHook(classLoader)
        return hooks
    } catch (error: Throwable) {
        // Do not leave a half-installed renderer behind if one of Discord's private classes
        // changed in a future build.
        hooks.forEach { runCatching { it.unhook() } }
        throw error
    }
}

/**
 * Every image attachment inside Discord's current mosaic eventually goes through
 * MediaImageViewHolder.bind(...). The current method has 26 parameters; filename is argument 24.
 *
 * We leave Discord's own MediaImageView and image loading pipeline in place. This avoids a second
 * HTTP fetch, keeps signed CDN URLs working, and lets Discord handle AVIF/WebP decoding. The only
 * custom child is a transparent interaction layer that opens Rore's info sheet.
 */
private fun installImageViewHolderHook(
    classLoader: ClassLoader,
): Set<XC_MethodHook.Unhook> {
    val holderClass = classLoader.loadClass(
        "com.discord.chat.presentation.message.viewholder.MediaImageViewHolder",
    )

    return XposedBridge.hookAllMethods(
        holderClass,
        "bind",
        object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                if (param.args.size < 26) return

                val itemView = getItemView(param.thisObject) ?: return
                removeRoreOverlay(itemView)

                val filename = param.args[24] as? String ?: return
                val sticker = RoreFilenameProtocol.parse(filename) ?: return

                param.setObjectExtra("rore.sticker", sticker)

                // Give MediaImageView a 1:1 sticker source size. The companion mosaic hook below
                // constrains a single Rore attachment to 160dp instead of the normal full width.
                param.args[1] = STICKER_SIZE_DP
                param.args[2] = STICKER_SIZE_DP

                // Remove normal attachment affordances that do not belong on a sticker.
                param.args[11] = false // showDescription
                param.args[12] = null  // description
                param.args[13] = null  // descriptionHint
                param.args[14] = false // useNewAltTextButton
                param.args[15] = null  // onAltTextButtonClicked
                param.args[16] = 0     // radiusPx
                param.args[23] = false // shouldAutoPlayGif -> no GIF badge
                param.args[25] = false // srcIsAnimated -> no GIF badge for AVIF/WebP

                // Replace Discord's "open media viewer" callback with the Rore info popout.
                param.args[19] = View.OnClickListener { anchor ->
                    showStickerInfoSheet(anchor, sticker, classLoader)
                }
                param.args[20] = View.OnLongClickListener { anchor ->
                    showStickerInfoSheet(anchor, sticker, classLoader)
                    true
                }
            }

            override fun afterHookedMethod(param: MethodHookParam) {
                val sticker =
                    param.getObjectExtra("rore.sticker") as? RoreMessageSticker ?: return
                val itemView = getItemView(param.thisObject) ?: return

                // MediaImageViewHolder already loaded and laid out the image. Add only a transparent
                // overlay so the rendered accessory is still Discord's efficient native image view,
                // while all interaction belongs to Rore.
                itemView.addView(
                    RoreStickerInteractionView(itemView.context, sticker, classLoader),
                    FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    ),
                )
            }
        },
    )
}

/**
 * A single Discord image mosaic normally expands to the whole message width. For a Rore sticker
 * that would still look like an attachment even if its source dimensions are 160x160.
 *
 * AttachmentMediaMosaicContainerView.setAttachments(...) is called before layout. After Discord
 * has configured the mosaic, override its internal available width to exactly 160dp, but ONLY when
 * the mosaic contains exactly one valid Rore attachment. Mixed/normal attachment messages retain
 * stock Discord geometry.
 */
private fun installMosaicSizeHook(
    classLoader: ClassLoader,
): Set<XC_MethodHook.Unhook> {
    val containerClass = classLoader.loadClass(
        "com.discord.chat.presentation.message.view.mosaic.AttachmentMediaMosaicContainerView",
    )

    return XposedBridge.hookAllMethods(
        containerClass,
        "setAttachments",
        object : XC_MethodHook() {
            override fun afterHookedMethod(param: MethodHookParam) {
                if (param.args.isEmpty()) return

                val attachments = param.args[0] as? List<*> ?: return
                if (attachments.size != 1) return

                val filename = accessoryFilename(attachments[0]) ?: return
                if (RoreFilenameProtocol.parse(filename) == null) return

                val container = param.thisObject as? View ?: return
                val layoutManager = findFieldValueByClassName(
                    param.thisObject,
                    "com.discord.chat.presentation.message.view.mosaic_recycler.MosaicLayoutManager",
                ) ?: return

                XposedHelpers.callMethod(
                    layoutManager,
                    "setAvailableWidth",
                    dp(container.context, STICKER_SIZE_DP),
                )

                container.requestLayout()
            }
        },
    )
}

private fun getItemView(holder: Any): ViewGroup? {
    return runCatching {
        XposedHelpers.getObjectField(holder, "itemView") as? ViewGroup
    }.getOrNull()
}

private fun accessoryFilename(accessory: Any?): String? {
    if (accessory == null) return null

    val attachment = runCatching {
        XposedHelpers.callMethod(accessory, "getAttachment")
    }.getOrNull() ?: return null

    return runCatching {
        XposedHelpers.callMethod(attachment, "getFilename") as? String
    }.getOrNull()
}

/**
 * Avoid depending on private field names such as `mosaicLayoutManager`. Discord may rename fields
 * without changing the class type. Walking the hierarchy by runtime type is more resilient.
 */
private fun findFieldValueByClassName(instance: Any, className: String): Any? {
    var type: Class<*>? = instance.javaClass

    while (type != null) {
        for (field in type.declaredFields) {
            val value = runCatching {
                field.isAccessible = true
                field.get(instance)
            }.getOrNull() ?: continue

            if (value.javaClass.name == className) return value
        }

        type = type.superclass
    }

    return null
}

private fun removeRoreOverlay(parent: ViewGroup) {
    for (index in parent.childCount - 1 downTo 0) {
        if (parent.getChildAt(index) is RoreStickerInteractionView) {
            parent.removeViewAt(index)
        }
    }
}

/** Transparent custom component placed over Discord's image accessory. */
private class RoreStickerInteractionView(
    context: Context,
    private val sticker: RoreMessageSticker,
    private val classLoader: ClassLoader,
) : FrameLayout(context) {
    init {
        isClickable = true
        isFocusable = true
        setBackgroundColor(Color.TRANSPARENT)

        // Accessibility also exposes the protocol metadata without pretending this is a Discord
        // native sticker.
        contentDescription = "${sticker.emoji}, ${sticker.packTitle}"

        setOnClickListener { anchor ->
            showStickerInfoSheet(anchor, sticker, classLoader)
        }
        setOnLongClickListener { anchor ->
            showStickerInfoSheet(anchor, sticker, classLoader)
            true
        }
    }
}

/**
 * Discord-like bottom sheet shown after tapping a Rore sticker.
 *
 * The sheet intentionally does not pretend that this is a native Discord sticker. It uses the
 * filename payload for the pack name and Unicode emoji, and explicitly says that the sticker comes
 * from an external server.
 *
 * At runtime we prefer Material's BottomSheetDialog through reflection, because Discord ships
 * Material Components but the Revenge plugin compiles only against Android/Xposed APIs. If the
 * Material class ever disappears, this gracefully falls back to a normal bottom-gravity Dialog.
 */
private fun showStickerInfoSheet(
    anchor: View,
    sticker: RoreMessageSticker,
    classLoader: ClassLoader,
) {
    val context = anchor.context
    val palette = discordPalette(context, classLoader)

    val sheet = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(
            dp(context, 20),
            dp(context, 10),
            dp(context, 20),
            dp(context, 24),
        )
        background = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            val radius = dp(context, 28).toFloat()
            cornerRadii = floatArrayOf(
                radius, radius,
                radius, radius,
                0f, 0f,
                0f, 0f,
            )
            setColor(palette.sheetBackground)
        }
    }

    val handle = View(context).apply {
        background = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(context, 3).toFloat()
            setColor(palette.handle)
        }
    }
    sheet.addView(
        handle,
        LinearLayout.LayoutParams(
            dp(context, 48),
            dp(context, 5),
        ).apply {
            gravity = Gravity.CENTER_HORIZONTAL
            bottomMargin = dp(context, 28)
        },
    )

    val header = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.TOP
    }

    val emojiCard = FrameLayout(context).apply {
        background = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(context, 12).toFloat()
            setColor(palette.emojiBackground)
        }
        clipToOutline = true
        contentDescription = sticker.emoji
    }
    val emojiView = createDiscordEmojiView(
        context = context,
        classLoader = classLoader,
        emoji = sticker.emoji,
        sizeDp = 52,
    )
    emojiCard.addView(
        emojiView,
        FrameLayout.LayoutParams(
            dp(context, 52),
            dp(context, 52),
            Gravity.CENTER,
        ),
    )
    header.addView(
        emojiCard,
        LinearLayout.LayoutParams(
            dp(context, 76),
            dp(context, 76),
        ).apply {
            marginEnd = dp(context, 16)
        },
    )

    val headerText = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
    }

    val packName = TextView(context).apply {
        text = sticker.packTitle
        setTextColor(palette.headerPrimary)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
        setTypeface(typeface, Typeface.BOLD)
        maxLines = 2
    }

    val description = TextView(context).apply {
        text = "Ta naklejka pochodzi z zewnętrznego serwera. " +
            "Nie jest natywną naklejką Discorda."
        setTextColor(palette.textNormal)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        setLineSpacing(0f, 1.08f)
        maxLines = 4
    }

    headerText.addView(packName)
    headerText.addView(
        description,
        LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply {
            topMargin = dp(context, 6)
        },
    )

    header.addView(
        headerText,
        LinearLayout.LayoutParams(
            0,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            1f,
        ),
    )

    sheet.addView(header)

    val sectionTitle = TextView(context).apply {
        text = "TA NAKLEJKA JEST Z:"
        setTextColor(palette.headerPrimary)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        setTypeface(typeface, Typeface.BOLD)
        letterSpacing = 0.035f
    }
    sheet.addView(
        sectionTitle,
        LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply {
            topMargin = dp(context, 34)
            bottomMargin = dp(context, 14)
        },
    )

    val sourceRow = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
    }

    val sourceIcon = FrameLayout(context).apply {
        background = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(context, 14).toFloat()
            setColor(palette.sourceIconBackground)
        }
    }
    sourceIcon.addView(
        createDiscordEmojiView(
            context = context,
            classLoader = classLoader,
            emoji = "🌐",
            sizeDp = 38,
        ),
        FrameLayout.LayoutParams(
            dp(context, 38),
            dp(context, 38),
            Gravity.CENTER,
        ),
    )
    sourceRow.addView(
        sourceIcon,
        LinearLayout.LayoutParams(
            dp(context, 64),
            dp(context, 64),
        ).apply {
            marginEnd = dp(context, 16)
        },
    )

    val sourceText = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
    }

    sourceText.addView(
        TextView(context).apply {
            text = "Zewnętrzny serwer"
            setTextColor(palette.headerPrimary)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            setTypeface(typeface, Typeface.BOLD)
        },
    )
    sourceText.addView(
        TextView(context).apply {
            text = "Źródło spoza Discorda • Rore Stickers"
            setTextColor(palette.textMuted)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        },
        LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply {
            topMargin = dp(context, 3)
        },
    )

    sourceRow.addView(
        sourceText,
        LinearLayout.LayoutParams(
            0,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            1f,
        ),
    )
    sheet.addView(sourceRow)

    // Preserve enough breathing room above gesture navigation / 3-button navigation.
    installBottomInsetPadding(sheet, dp(context, 24))

    val dialog = createBottomSheetDialog(context, classLoader)
    dialog.setContentView(sheet)
    dialog.setCancelable(true)
    dialog.setCanceledOnTouchOutside(true)

    dialog.setOnShowListener {
        configureSheetWindow(dialog, sheet, context)
        configureMaterialBottomSheet(dialog, sheet, context)
    }

    dialog.show()
}

/**
 * Returns Discord's actual Unicode emoji asset whenever the private emoji renderer is available.
 * This makes the large emoji match Discord rather than the device manufacturer's emoji font.
 */
private fun createDiscordEmojiView(
    context: Context,
    classLoader: ClassLoader,
    emoji: String,
    sizeDp: Int,
): View {
    return runCatching {
        val renderableClass = classLoader.loadClass("com.discord.emoji.RenderableEmoji")
        val companion = XposedHelpers.getStaticObjectField(renderableClass, "Companion")
        val renderable = XposedHelpers.callMethod(companion, "unicode", emoji)
        val url = XposedHelpers.callMethod(
            renderable,
            "getUrl",
            false,
            dp(context, sizeDp),
        ) as String

        val draweeClass = classLoader.loadClass("com.facebook.drawee.view.SimpleDraweeView")
        val view = draweeClass
            .getConstructor(Context::class.java)
            .newInstance(context) as View

        XposedHelpers.callMethod(view, "setImageURI", url)
        view.contentDescription = emoji
        view
    }.getOrElse {
        // Safe fallback for future Discord builds where private emoji classes move.
        TextView(context).apply {
            text = emoji
            gravity = Gravity.CENTER
            setTextSize(TypedValue.COMPLEX_UNIT_SP, (sizeDp * 0.75f))
        }
    }
}

private fun createBottomSheetDialog(
    context: Context,
    classLoader: ClassLoader,
): Dialog {
    return runCatching {
        val clazz = classLoader.loadClass(
            "com.google.android.material.bottomsheet.BottomSheetDialog",
        )
        clazz.getConstructor(Context::class.java).newInstance(context) as Dialog
    }.getOrElse {
        Dialog(context)
    }
}

private fun configureSheetWindow(
    dialog: Dialog,
    sheet: View,
    context: Context,
) {
    val window = dialog.window ?: return

    window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
    window.setDimAmount(0.62f)
    window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
    window.setGravity(Gravity.BOTTOM)
    window.setLayout(
        WindowManager.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.WRAP_CONTENT,
    )

    // For the fallback plain Dialog. Material's BottomSheetDialog ignores this gravity but uses its
    // own slide animation/drag behavior.
    if (!dialog.javaClass.name.contains("BottomSheetDialog")) {
        window.setWindowAnimations(android.R.style.Animation_Dialog)
    }

    sheet.post {
        window.setLayout(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
        )
    }
}

private fun configureMaterialBottomSheet(
    dialog: Dialog,
    sheet: View,
    context: Context,
) {
    if (!dialog.javaClass.name.contains("BottomSheetDialog")) return

    // BottomSheetDialog puts our rounded view inside its own FrameLayout. Make that wrapper
    // transparent so our Discord-like rounded top corners remain visible.
    val idCandidates = listOf(
        context.resources.getIdentifier("design_bottom_sheet", "id", context.packageName),
        context.resources.getIdentifier("design_bottom_sheet", "id", "com.google.android.material"),
    )

    idCandidates
        .firstOrNull { it != 0 }
        ?.let { dialog.findViewById<View>(it) }
        ?.setBackgroundColor(Color.TRANSPARENT)

    // Expand immediately and keep drag-to-dismiss. These methods are invoked reflectively so the
    // plugin still compiles without a Material Components dependency.
    runCatching {
        val behavior = XposedHelpers.callMethod(dialog, "getBehavior") ?: return@runCatching
        runCatching { XposedHelpers.callMethod(behavior, "setSkipCollapsed", true) }
        runCatching { XposedHelpers.callMethod(behavior, "setDraggable", true) }
        runCatching { XposedHelpers.callMethod(behavior, "setState", 3) } // STATE_EXPANDED
    }

    sheet.requestLayout()
}

private fun installBottomInsetPadding(
    view: View,
    baseBottomPadding: Int,
) {
    val left = view.paddingLeft
    val top = view.paddingTop
    val right = view.paddingRight

    view.setOnApplyWindowInsetsListener { target, insets ->
        target.setPadding(
            left,
            top,
            right,
            baseBottomPadding + insets.systemWindowInsetBottom,
        )
        insets
    }
    view.requestApplyInsets()
}

private data class RoreSheetPalette(
    val sheetBackground: Int,
    val emojiBackground: Int,
    val sourceIconBackground: Int,
    val headerPrimary: Int,
    val textNormal: Int,
    val textMuted: Int,
    val handle: Int,
)

private fun discordPalette(
    context: Context,
    classLoader: ClassLoader,
): RoreSheetPalette {
    val dark =
        (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES

    fun color(getter: String, darkFallback: Int, lightFallback: Int): Int {
        return runCatching {
            val themeManagerKt = classLoader.loadClass("com.discord.theme.ThemeManagerKt")
            val theme = XposedHelpers.callStaticMethod(themeManagerKt, "getTheme")
            XposedHelpers.callMethod(theme, getter) as Int
        }.getOrElse {
            if (dark) darkFallback else lightFallback
        }
    }

    return RoreSheetPalette(
        sheetBackground = color(
            "getBackgroundMobilePrimary",
            Color.rgb(49, 51, 56),
            Color.rgb(255, 255, 255),
        ),
        emojiBackground = color(
            "getBackgroundSecondary",
            Color.rgb(43, 45, 49),
            Color.rgb(242, 243, 245),
        ),
        sourceIconBackground = color(
            "getBackgroundSecondary",
            Color.rgb(43, 45, 49),
            Color.rgb(242, 243, 245),
        ),
        headerPrimary = color(
            "getHeaderPrimary",
            Color.rgb(242, 243, 245),
            Color.rgb(6, 6, 7),
        ),
        textNormal = color(
            "getTextNormal",
            Color.rgb(219, 222, 225),
            Color.rgb(49, 51, 56),
        ),
        textMuted = color(
            "getTextMuted",
            Color.rgb(148, 155, 164),
            Color.rgb(78, 80, 88),
        ),
        handle = color(
            "getBackgroundModifierAccent",
            Color.rgb(78, 80, 88),
            Color.rgb(209, 210, 215),
        ),
    )
}

private fun dp(context: Context, value: Int): Int {
    return TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        value.toFloat(),
        context.resources.displayMetrics,
    ).toInt()
}
