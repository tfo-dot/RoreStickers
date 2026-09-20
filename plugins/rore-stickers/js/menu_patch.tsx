import { getModules } from "@revenge-mod/modules/finders";
import { withProps } from "@revenge-mod/modules/finders/filters";
import {
    getModuleWithImportedPath
} from "@revenge-mod/discord/utils/modules/finders";
import { instead } from "@revenge-mod/patcher";

import React, { ReactNode } from "react";
import {
    Text,
    Pressable,
} from "react-native";
import StickerPicker from "./components/StickerPicker";

const MY_VIEW_KEY = "rore-stickers";

const unpatches: Array<() => void> = [];
const cleanups: Array<() => void> = [];

let pendingRoreChannelId: string | undefined;
let activeRoreChannelId:
    | string
    | undefined;
let ChatInputUtils: any;

const renderItemCache =
    new WeakMap<Function, Function>();

let PortalKeyboardUIStore: any;

function MyPanel({
    chatInputRef,
    channelId

}: {
    chatInputRef: any;
    channelId: string;
}) {
    return (
        <StickerPicker
            channelId={channelId}
            messageActionCreators={MessageActionCreators}
            uploadOrigin={UploadOrigin}
            cloudUpload={CloudUpload}
            uploadPlatform={UploadPlatform}
            onClose={() => {
                console.log(
                    "[Rore] closing",
                );

                const input =
                    chatInputRef?.current;

                /*
                 * Najpierw prawidłowo zamykamy
                 * custom keyboard + portal.
                 */
                input
                    ?.closeCustomKeyboard
                    ?.();
            }} />
    );
}

function wrapPortalRenderItem(
    original: Function,
) {
    const cached =
        renderItemCache.get(original);

    if (cached) {
        return cached;
    }

    const wrapped = (
        key: any,
        item: any,
        state: any,
        cleanUp: any,
    ) => {
        if (item?.type === MY_VIEW_KEY) {
            /*
             * TransitionStates.YEETED === 2
             *
             * Gdy portal usuwa element, MUSIMY
             * zwrócić null albo sami wywołać cleanUp().
             */
            if (state === 2) {
                console.log(
                    "[Rore] MyPanel YEETED",
                );

                return null;
            }

            console.log(
                "[Rore] rendering MyPanel",
                {
                    key,
                    state,
                    channelId:
                        item.channelId,
                },
            );

            return (
                <MyPanel
                    chatInputRef={
                        item.chatInputRef
                    }
                    channelId={item.channelId}
                />
            );
        }

        return original(
            key,
            item,
            state,
            cleanUp,
        );
    };

    renderItemCache.set(
        original,
        wrapped,
    );

    return wrapped;
}

let MessageActionCreators: any;
let CloudUpload: any;
let UploadPlatform: any;
let UploadAttachmentActionCreators: any;
let DraftType: any;
let UploadOrigin: any;

export function start() {
    console.log("[Rore] starting");

    cleanups.push(
        getModuleWithImportedPath<any>(
            "modules/expression_picker/native/ExpressionPicker.tsx",
            (mod, id) => {
                console.log(
                    "[Rore] ExpressionPicker found",
                    id,
                );

                const memo =
                    mod?.default ?? mod;

                if (
                    typeof memo?.type !==
                    "function"
                ) {
                    console.warn(
                        "[Rore] ExpressionPicker.type missing",
                    );

                    return;
                }

                unpatches.push(
                    instead(
                        memo,
                        "type",
                        (
                            args,
                            original,
                        ) => {
                            const props =
                                args[0];

                            const channelId =
                                props
                                    ?.channel
                                    ?.id;

                            /*
                             * Zwykły Discord picker.
                             */
                            if (
                                !channelId ||
                                activeRoreChannelId
                                !== channelId
                            ) {
                                return original(
                                    ...args,
                                );
                            }

                            console.log(
                                "[Rore] replacing ExpressionPicker",
                                channelId,
                            );

                            return (
                                <StickerPicker
                                    channelId={
                                        channelId
                                    }
                                    messageActionCreators={
                                        MessageActionCreators
                                    }
                                    uploadOrigin={
                                        UploadOrigin
                                    }
                                    cloudUpload={
                                        CloudUpload
                                    }
                                    uploadPlatform={
                                        UploadPlatform
                                    }
                                    onClose={() => {
                                        activeRoreChannelId =
                                            undefined;

                                        const input =
                                            ChatInputUtils
                                                ?.getBestActiveInputForChannelId
                                                ?.(
                                                    channelId,
                                                );

                                        input
                                            ?.closeCustomKeyboard
                                            ?.();
                                    }}
                                />
                            );
                        },
                    ),
                );
            },
        ),
    );

    cleanups.push(
        getModules(
            withProps(
                "openPortalKeyboard",
                "closePortalKeyboard",
                "PortalKeyboardUIStore",
            ),
            mod => {
                PortalKeyboardUIStore = mod;

                console.log("[Rore] PortalKeyboardUIStore", mod);

                unpatches.push(
                    instead(
                        mod,
                        "openPortalKeyboard",
                        function (
                            args,
                            original,
                        ) {
                            const [
                                type,
                                channelId,
                                chatInputRef,
                            ] = args;

                            console.log(
                                "[Rore] openPortalKeyboard called",
                                {
                                    type,
                                    channelId,
                                    pendingRoreChannelId,
                                },
                            );

                            if (type === "expression") {
                                if (
                                    consumeRoreOpen(channelId)
                                ) {
                                    console.log(
                                        "[Rore] expression belongs to Rore",
                                        channelId,
                                    );

                                    activeRoreChannelId =
                                        channelId;
                                } else {
                                    /*
                                     * Normalne otwarcie Emoji/GIF/
                                     * Stickers przez Discorda.
                                     */
                                    activeRoreChannelId =
                                        undefined;
                                }
                            }

                            return original(...args);

                            // if (
                            //     type === "expression" && consumeRoreOpen(channelId)
                            // ) {
                            //     console.log(
                            //         "[Rore] hijacking expression -> rore-stickers",
                            //     );

                            //     return original(
                            //         MY_VIEW_KEY,
                            //         channelId,
                            //         chatInputRef,
                            //     );
                            // }

                            // return original(...args);
                        },
                    ),

                );

                console.log("[Rore] openPortalKeyboard patched");
            },
        )
    );

    cleanups.push(
        getModuleWithImportedPath<any>(
            "actions/MessageActionCreators.tsx",
            mod => {
                MessageActionCreators =
                    mod?.default ?? mod;

                instead(MessageActionCreators, "_sendMessage", function (args, originalFn) {
                    const options = args[2];
                    const attachments = options?.attachmentsToUpload;
                    if (attachments?.length) {
                        console.log("[Rore] final attachment status:", 
                            JSON.stringify(attachments.map((a: any) => ({
                                status: a.status,
                                mimeType: a.mimeType,
                                filename: a.filename,
                                reactNativeFilePrepped: a.reactNativeFilePrepped,
                                uploadedFilename: a.uploadedFilename,
                                currentSize: a.currentSize,
                            })))
                        );
                    }
                    return originalFn(...args);
                });
            },
        ),
    );

    cleanups.push(
        getModuleWithImportedPath<any>(
            "lib/uploader/CloudUpload.tsx",
            mod => {
                CloudUpload =
                    mod?.CloudUpload;
            },
        ),
    );

    cleanups.push(
        getModuleWithImportedPath<any>(
            "lib/uploader/Upload.tsx",
            mod => {
                UploadPlatform =
                    mod?.UploadPlatform;

                UploadOrigin =
                    mod?.UploadOrigin;
            },
        ),
    );

    cleanups.push(
        getModuleWithImportedPath<any>(
            "actions/UploadAttachmentActionCreators.tsx",
            (mod, id) => {
                UploadAttachmentActionCreators =
                    mod?.default ?? mod;

                console.log(
                    "[Rore] UploadAttachmentActionCreators",
                    id,
                    Object.keys(
                        UploadAttachmentActionCreators ?? {},
                    ),
                );

                instead(mod?.default ?? mod, "addFile", function (args, originalFn) {
                    console.log("[Rore] addFile args:", 
                        JSON.stringify(args, (_, v) => typeof v === "function" ? "[fn]" : v)
                    );
                    return originalFn(...args);
                });
            },
        ),
    );

    cleanups.push(
        getModuleWithImportedPath<any>(
            "stores/DraftStore.tsx",
            (mod, id) => {
                DraftType =
                    mod?.DraftType;

                console.log(
                    "[Rore] DraftType",
                    id,
                    DraftType,
                );
            },
        ),
    );

    cleanups.push(
        getModuleWithImportedPath<any>(
            "lib/uploader/Upload.tsx",
            (mod, id) => {
                UploadPlatform =
                    mod?.UploadPlatform;

                console.log(
                    "[Rore] Upload",
                    id,
                    UploadPlatform,
                );
            },
        ),
    );

    cleanups.push(
        getModuleWithImportedPath<any>(
            "utils/native/ChatInputUtils.tsx",
            (mod, id) => {
                ChatInputUtils = mod;

                console.log(
                    "[Rore] ChatInputUtils found",
                    id,
                    Object.keys(mod),
                );
            },
        ),
    );

    cleanups.push(
        getModules(
            withProps("usePortalState"),
            mod => {
                console.log(
                    "[Rore] portal module found",
                );

                unpatches.push(
                    instead(
                        mod,
                        "usePortalState",
                        function (
                            args,
                            original,
                        ) {
                            const result =
                                original(...args);

                            if (
                                !Array.isArray(result)
                            ) {
                                return result;
                            }

                            return result.map(
                                (entry: any) => {
                                    const node =
                                        entry?.node;

                                    const props =
                                        node?.props;

                                    if (
                                        typeof props?.renderItem !==
                                        "function"
                                    ) {
                                        return entry;
                                    }

                                    return {
                                        ...entry,

                                        node:
                                            React.cloneElement(
                                                node,
                                                {
                                                    renderItem:
                                                        wrapPortalRenderItem(
                                                            props.renderItem,
                                                        ),
                                                },
                                            ),
                                    };
                                },
                            );
                        },
                    ),
                );
            },
        ),
    );

    cleanups.push(
        getModuleWithImportedPath<any>(
            "modules/chat_input/native/action_buttons/ChatInputRightActions.tsx",
            (mod, id) => {
                console.log(
                    "[Rore] ChatInputRightActions module found",
                    id,
                );

                const memo = mod?.default ?? mod;
                const forwardRef = memo?.type;

                console.log(
                    "[Rore] forwardRef keys:",
                    forwardRef
                        ? Object.keys(forwardRef)
                        : null,
                );

                console.log(
                    "[Rore] typeof forwardRef.render:",
                    typeof forwardRef?.render,
                );

                if (
                    typeof forwardRef?.render !==
                    "function"
                ) {
                    console.warn(
                        "[Rore] render function not found",
                    );

                    return;
                }

                unpatches.push(
                    instead(
                        forwardRef,
                        "render",
                        function (
                            args,
                            original,
                        ) {
                            const props = args[0];

                            const result =
                                original(...args);

                            console.log(
                                "[Rore] RightActions rendered",
                            );

                            console.log(
                                "[Rore] props keys:",
                                props
                                    ? Object.keys(props)
                                    : null,
                            );

                            console.log(
                                "[Rore] channel:",
                                props?.channel?.id,
                            );

                            if (
                                !React.isValidElement(
                                    result,
                                )
                            ) {
                                return result;
                            }

                            const children =
                                React.Children.toArray(
                                    (result.props as { children: ReactNode | ReactNode[] })?.children,
                                );

                            children.push(
                                <Pressable
                                    key="rore-button"
                                    onPress={() => {
                                        const channelId =
                                            props?.channel?.id;

                                        console.log(
                                            "[Rore] BUTTON PRESSED",
                                            channelId,
                                        );

                                        if (!channelId) {
                                            console.warn(
                                                "[Rore] no channel id",
                                            );
                                            return;
                                        }

                                        const input =
                                            ChatInputUtils
                                                ?.getBestActiveInputForChannelId
                                                ?.(channelId);

                                        if (
                                            !input ||
                                            typeof input.openCustomKeyboard !==
                                            "function"
                                        ) {
                                            console.warn(
                                                "[Rore] active input unavailable",
                                            );
                                            return;
                                        }

                                        pendingRoreChannelId =
                                            channelId;

                                        console.log(
                                            "[Rore] requesting expression keyboard for Rore",
                                        );

                                        try {
                                            armRoreOpen(channelId);

                                            input.openCustomKeyboard({
                                                type: "expression",
                                            });
                                        } catch (error) {
                                            pendingRoreChannelId =
                                                undefined;

                                            console.error(
                                                "[Rore] openCustomKeyboard failed",
                                                error,
                                            );
                                        }
                                    }}
                                    style={{
                                        width: 32,
                                        height: 32,
                                        alignItems:
                                            "center",
                                        justifyContent:
                                            "center",
                                        borderRadius: 8,
                                        backgroundColor:
                                            "rgba(255,255,255,0.08)",
                                    }}
                                >
                                    <Text
                                        style={{
                                            color:
                                                "white",
                                            fontSize: 14,
                                            fontWeight:
                                                "700",
                                        }}
                                    >
                                        R
                                    </Text>
                                </Pressable>,
                            );

                            return React.cloneElement(
                                result,
                                {},
                                ...children,
                            );
                        },
                    ),
                );

                console.log(
                    "[Rore] ChatInputRightActions patched",
                );
            }
        ),
    );

    console.log(
        "[Rore] all finders registered",
    );
}

let pendingRoreTimer: ReturnType<typeof setTimeout> | undefined;

function armRoreOpen(channelId: string) {
    pendingRoreChannelId = channelId;

    if (pendingRoreTimer) {
        clearTimeout(pendingRoreTimer);
    }

    pendingRoreTimer = setTimeout(() => {
        if (pendingRoreChannelId === channelId) {
            pendingRoreChannelId = undefined;
        }

        pendingRoreTimer = undefined;
    }, 2000);
}

function consumeRoreOpen(channelId: string) {
    if (pendingRoreChannelId !== channelId) {
        return false;
    }

    pendingRoreChannelId = undefined;

    if (pendingRoreTimer) {
        clearTimeout(pendingRoreTimer);
        pendingRoreTimer = undefined;
    }

    return true;
}

export function stop() {
    for (const unpatch of unpatches) {
        try {
            unpatch();
        } catch {}
    }

    unpatches.length = 0;

    for (const cleanup of cleanups) {
        try {
            cleanup();
        } catch {}
    }

    cleanups.length = 0;

    pendingRoreChannelId = undefined;
    ChatInputUtils = undefined;

    console.log("[Rore] stopped");
}