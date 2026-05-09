import { GenericLanguageDetector } from './generic-language-detector';

describe('GenericLanguageDetector', () => {
  it('flags common generic filler phrases', () => {
    const detector = new GenericLanguageDetector();
    const flags = detector.detect('I am a results-driven professional and a team player.');
    const phrases = flags.map((f) => f.phrase).filter(Boolean);
    expect(phrases).toContain('results-driven');
    expect(phrases).toContain('team player');
  });
});

