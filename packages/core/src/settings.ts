import { createCensorLexicon, type CensorLexicon } from './censor';

export const CensorSource = {
  CAPTIONS: 'captions',
  ML: 'ml',
} as const;

export const CensorEffect = {
  BEEP: 'beep',
  SILENCE: 'silence',
} as const;

export type CensorSourceValue = (typeof CensorSource)[keyof typeof CensorSource];
export type CensorEffectValue = (typeof CensorEffect)[keyof typeof CensorEffect];

export type CensorSettings = {
  source: CensorSourceValue;
  effect: CensorEffectValue;
  delaySeconds: number;
  literalAdditions: string[];
  patterns: string[];
  whitelist: string[];
};

export type CensorSettingsValidation =
  | { ok: true; settings: CensorSettings }
  | { ok: false; error: string };

const DEFAULT_DELAY_SECONDS = 1.2;
const MIN_DELAY_SECONDS = 0.6;
const MAX_DELAY_SECONDS = 3;
const MAX_PATTERN_LENGTH = 256;

const DEFAULT_RUSSIAN_CENSOR_WORDS = [
  'блядь',
  'блядюга',
  'блять',
  'ебать',
  'ебал',
  'ебался',
  'еблан',
  'ебаный',
  'ебанутая',
  'ебануть',
  'мудак',
  'дурак',
  'ты',
  'дружочек',
  'пизда',
  'пиздец',
  'пиздёж',
  'сука',
  'хуй',
  'хуя',
  'хуйлан',
  'хуе',
] as const;

// https://www.youtube.com/watch?v=wls9_A9WfJ8

export function createDefaultCensorSettings(): CensorSettings {
  return {
    source: CensorSource.CAPTIONS,
    effect: CensorEffect.BEEP,
    delaySeconds: DEFAULT_DELAY_SECONDS,
    literalAdditions: [],
    patterns: [],
    whitelist: [],
  };
}

export function validateCensorSettings(value: unknown): CensorSettingsValidation {
  if (!isCensorSettingsShape(value)) {
    return { ok: false, error: 'Invalid Censor settings' };
  }
  const settings = value;
  if (!Object.values(CensorSource).includes(settings.source)) {
    return { ok: false, error: 'Invalid Censor source' };
  }
  if (!Object.values(CensorEffect).includes(settings.effect)) {
    return { ok: false, error: 'Invalid Censor effect' };
  }
  if (
    !Number.isFinite(settings.delaySeconds) ||
    settings.delaySeconds < MIN_DELAY_SECONDS ||
    settings.delaySeconds > MAX_DELAY_SECONDS
  ) {
    return { ok: false, error: 'Censor delay must be between 0.6 and 3 seconds' };
  }

  const overlongPattern = settings.patterns.find((pattern) => pattern.length > MAX_PATTERN_LENGTH);
  if (overlongPattern) {
    return { ok: false, error: `RegExp must not exceed ${MAX_PATTERN_LENGTH} characters` };
  }

  try {
    settings.patterns.forEach((pattern) => new RegExp(pattern, 'u'));
  } catch {
    const invalidPattern = settings.patterns.find((pattern) => {
      try {
        new RegExp(pattern, 'u');
        return false;
      } catch {
        return true;
      }
    });
    return { ok: false, error: `Invalid RegExp: ${invalidPattern}` };
  }

  return { ok: true, settings };
}

function isCensorSettingsShape(value: unknown): value is CensorSettings {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const settings = value as Partial<CensorSettings>;
  return (
    typeof settings.source === 'string' &&
    typeof settings.effect === 'string' &&
    typeof settings.delaySeconds === 'number' &&
    Array.isArray(settings.literalAdditions) &&
    settings.literalAdditions.every((item) => typeof item === 'string') &&
    Array.isArray(settings.patterns) &&
    settings.patterns.every((item) => typeof item === 'string') &&
    Array.isArray(settings.whitelist) &&
    settings.whitelist.every((item) => typeof item === 'string')
  );
}

export function createCensorLexiconFromSettings(settings: CensorSettings): CensorLexicon {
  return createCensorLexicon({
    literalWords: [...DEFAULT_RUSSIAN_CENSOR_WORDS, ...settings.literalAdditions],
    patterns: settings.patterns.map((pattern) => new RegExp(pattern, 'u')),
    whitelist: settings.whitelist,
  });
}

export function createDefaultRussianCensorLexicon(): CensorLexicon {
  return createCensorLexiconFromSettings(createDefaultCensorSettings());
}
