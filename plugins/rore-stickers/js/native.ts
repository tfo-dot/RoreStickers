import { callNativeMethod } from "@revenge-mod/modules/native";

declare module "@revenge-mod/modules/native" {
    export interface NativeMethods {
        "com.tfo.rorestickers.downloadSticker": [
            args: [url: string, filename: string],
            returnValue: string, // absolute file path
        ];

        "com.tfo.rorestickers.xxh64": [
            args: [input: string],
            returnValue: string, // hex string e.g. "ef46db3751d8e999"
        ]
    }
}

export async function downloadSticker(
    url: string,
    filename: string
): Promise<string> {
    const path = await callNativeMethod(
        "com.tfo.rorestickers.downloadSticker",
        [url, filename],
    );
    return `file://${path}`;
}

export async function xxh64(input: string): Promise<string> {
    return await callNativeMethod("com.tfo.rorestickers.xxh64", [input])
}