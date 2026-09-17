import { getModules } from "@revenge-mod/modules/finders";
import { withProps } from "@revenge-mod/modules/finders/filters";
import {
    getModuleWithImportedPath
} from "@revenge-mod/discord/utils/modules/finders";
import { instead } from "@revenge-mod/patcher";

import React from "react";
import {
    View,
    Text,
    Pressable,
} from "react-native";
import StickerPicker from "./components/StickerPicker";

const MY_VIEW_KEY = "rore-stickers";

const unpatches: Array<() => void> = [];
const cleanups: Array<() => void> = [];

let pendingRoreChannelId: string | undefined;

let PortalKeyboardUIStore: any;
let ChatInputUtils: any;

const renderItemCache =
    new WeakMap<Function, Function>();

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
        // <View
        //     style={{
        //         flex: 1,
        //         backgroundColor:
        //             "#1e1e2e",
        //         padding: 16,
        //     }}
        // >
        //     <Text
        //         style={{
        //             color: "white",
        //             fontSize: 20,
        //             fontWeight: "700",
        //         }}
        //     >
        //         Rore Stickers
        //     </Text>

        //     <Pressable
        //         onPress={() => {
        //             console.log(
        //                 "[Rore] closing",
        //             );

        //             const input =
        //                 chatInputRef?.current;

        //             /*
        //              * Najpierw prawidłowo zamykamy
        //              * custom keyboard + portal.
        //              */
        //             input
        //                 ?.closeCustomKeyboard
        //                 ?.();

        //             /*
        //              * Potem pokazujemy zwykłą
        //              * klawiaturę tekstową.
        //              */
        //             input
        //                 ?.openSystemKeyboard
        //                 ?.();
        //         }}
        //     >
        //         <Text style={{ color: "white" }}>
        //             Close
        //         </Text>
        //     </Pressable>

        //     <View
        //         style={{
        //             flex: 1,
        //             alignItems: "center",
        //             justifyContent: "center",
        //         }}
        //     >
        //         <Text
        //             style={{
        //                 color: "white",
        //             }}
        //         >
        //             My Panel
        //         </Text>
        //     </View>
        // </View>
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

export function start() {
    console.log("[Rore] starting");

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
            withProps(
                "openPortalKeyboard",
                "closePortalKeyboard",
                "PortalKeyboardUIStore",
            ),
            mod => {
                PortalKeyboardUIStore = mod;

                console.log(
                    "[Rore] PortalKeyboardUIStore",
                    mod,
                );

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

                            if (
                                type === "expression" && consumeRoreOpen(channelId)
                            ) {
                                console.log(
                                    "[Rore] hijacking expression -> rore-stickers",
                                );

                                return original(
                                    MY_VIEW_KEY,
                                    channelId,
                                    chatInputRef,
                                );
                            }

                            return original(...args);
                        },
                    ),
                );

                console.log(
                    "[Rore] openPortalKeyboard patched",
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
                                    result.props?.children,
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

    PortalKeyboardUIStore =
        undefined;

    pendingRoreChannelId = undefined;
    PortalKeyboardUIStore = undefined;
    ChatInputUtils = undefined;

    console.log("[Rore] stopped");
}