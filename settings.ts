/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const DEFAULT_TRANSLATION_LANGUAGE = "en";

export const TRANSLATION_LANGUAGE_OPTIONS = [
    { label: "English (en)", value: "en", default: true },
    { label: "Japanese (ja)", value: "ja" },
    { label: "Japanese alias (jp)", value: "jp" },
    { label: "Korean (ko)", value: "ko" },
    { label: "Korean alias (kr)", value: "kr" },
    { label: "Chinese Simplified (zh)", value: "zh" },
    { label: "Chinese Simplified alias (cn)", value: "cn" },
    { label: "Chinese Traditional (tw)", value: "tw" },
    { label: "Ukrainian (uk)", value: "uk" },
    { label: "Ukrainian alias (ua)", value: "ua" },
    { label: "Spanish (es)", value: "es" },
    { label: "French (fr)", value: "fr" },
    { label: "German (de)", value: "de" },
    { label: "Portuguese (pt)", value: "pt" },
    { label: "Italian (it)", value: "it" },
    { label: "Russian (ru)", value: "ru" },
] as const;

const LANGUAGE_CODE_REGEX = /^[a-z]{2}(?:-[a-z]{2})?$/i;

export function getTranslationLanguageCode(language: unknown) {
    const code = typeof language === "string" ? language.trim().toLowerCase() : "";
    return LANGUAGE_CODE_REGEX.test(code) ? code : DEFAULT_TRANSLATION_LANGUAGE;
}

export const settings = definePluginSettings({
    preferredLanguage: {
        type: OptionType.SELECT,
        description: "Preferred FxTwitter translation language",
        options: TRANSLATION_LANGUAGE_OPTIONS,
    },
});
