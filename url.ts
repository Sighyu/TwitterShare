/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const SUPPORTED_HOSTS = new Set([
    "twitter.com",
    "x.com",
    "fxtwitter.com",
    "fixupx.com",
]);

const STATUS_ID_REGEX = /(?:^|\/)status(?:es)?\/(\d{5,25})(?:[/?#]|$)/i;
const URL_IN_TEXT_REGEX = /https?:\/\/[^\s<>'"]+/i;

export interface ParsedTweetUrl {
    tweetId: string;
    sourceUrl: string;
}

function normalizeHost(host: string) {
    return host.toLowerCase().replace(/^(?:www\.|mobile\.)/, "");
}

export function parseTweetUrl(input: string): ParsedTweetUrl | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    const candidate = trimmed.match(URL_IN_TEXT_REGEX)?.[0] ?? trimmed;

    try {
        const parsed = new URL(candidate);
        const host = normalizeHost(parsed.hostname);
        if (!SUPPORTED_HOSTS.has(host)) return null;

        const tweetId = parsed.pathname.match(STATUS_ID_REGEX)?.[1];
        if (!tweetId) return null;

        return {
            tweetId,
            sourceUrl: parsed.toString(),
        };
    } catch {
        return null;
    }
}
