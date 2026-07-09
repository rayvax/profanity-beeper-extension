export const triggerWords = [' ', '\u00A0'].flatMap((before) =>
  [' ', '\u00A0'].map((after) => `[${before}__${after}]`),
);

export function isTriggerWord(word: string): boolean {
  const caseInsensitiveWord = word.toLowerCase();
  return triggerWords.some((triggerWord) =>
    caseInsensitiveWord.includes(triggerWord.toLowerCase()),
  );
}
