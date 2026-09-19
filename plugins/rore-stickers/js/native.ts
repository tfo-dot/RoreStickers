import { callNativeMethod } from "@revenge-mod/modules/native";

declare module "@revenge-mod/modules/native" {
    export interface NativeMethods {
        "com.tfo.rorestickers.downloadSticker": [
            args: [url: string, filename: string],
            returnValue: string, // absolute file path
        ];
    }
}

export async function downloadSticker(
    url: string,
    filename: string,
): Promise<string> {
    const path = await callNativeMethod(
        "com.tfo.rorestickers.downloadSticker",
        [url, filename],
    );
    return `file://${path}`;
}