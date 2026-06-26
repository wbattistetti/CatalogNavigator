import { describe, expect, it } from 'vitest';
import {
  buildSavedChatTitle,
  chatMessagesToTranscript,
  createSavedChatTest,
  parseSavedChatTests,
  mergeSavedChatTests,
  preserveSavedChatTestsOnReload,
} from './savedChatTests';

describe('buildSavedChatTitle', () => {
  it('formats sequence number and final path', () => {
    expect(buildSavedChatTitle(1, 'cardiologica.over 17 anni.prima.ecg')).toBe(
      '# 1 cardiologica.over 17 anni.prima.ecg',
    );
  });

  it('uses fallback when path is missing', () => {
    expect(buildSavedChatTitle(3, null)).toBe('# 3 (senza percorso)');
  });
});

describe('chatMessagesToTranscript', () => {
  it('skips opening agent message and pairs user/agent turns', () => {
    const transcript = chatMessagesToTranscript(
      [
        { role: 'agent', text: 'Buongiorno, quale esame?' },
        { role: 'user', text: 'Visita cardiologica' },
        { role: 'agent', text: 'Qual è l\'età del paziente?' },
        { role: 'user', text: '30 anni' },
        { role: 'agent', text: 'Confermato.', isResult: true },
      ],
      'cardiologica.over 17 anni.prima.ecg',
    );

    expect(transcript).toHaveLength(2);
    expect(transcript[0].userText).toBe('Visita cardiologica');
    expect(transcript[0].spokenHint).toBe('Qual è l\'età del paziente?');
    expect(transcript[1].userText).toBe('30 anni');
    expect(transcript[1].spokenHint).toBe('Confermato.');
    expect(transcript[1].action).toBe('confirm');
    expect(transcript[1].selectedPath).toBe('cardiologica.over 17 anni.prima.ecg');
  });
});

describe('createSavedChatTest', () => {
  it('increments title sequence from existing count', () => {
    const saved = createSavedChatTest(
      [{ role: 'user', text: 'Visita' }],
      'path.a',
      2,
    );
    expect(saved.title).toBe('# 3 path.a');
    expect(saved.transcript).toHaveLength(1);
  });
});

describe('parseSavedChatTests', () => {
  it('returns empty array for invalid input', () => {
    expect(parseSavedChatTests(null)).toEqual([]);
    expect(parseSavedChatTests({})).toEqual([]);
  });

  it('parses valid rows', () => {
    const parsed = parseSavedChatTests([
      {
        id: 'a',
        title: '# 1 path',
        finalPath: 'path',
        savedAt: '2026-01-01T00:00:00.000Z',
        transcript: [{ userText: 'ciao' }],
      },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe('# 1 path');
  });
});

describe('mergeSavedChatTests', () => {
  it('keeps session entries when ids collide', () => {
    const session = [{
      id: 'a',
      title: '# 1 session',
      finalPath: 'x',
      savedAt: '2026-01-02T00:00:00.000Z',
      transcript: [{ userText: 'ciao' }],
    }];
    const fromDb = [{
      id: 'a',
      title: '# 1 db',
      finalPath: 'y',
      savedAt: '2026-01-01T00:00:00.000Z',
      transcript: [{ userText: 'old' }],
    }];
    expect(mergeSavedChatTests(session, fromDb)[0].title).toBe('# 1 session');
  });
});

describe('preserveSavedChatTestsOnReload', () => {
  it('keeps session when db returns empty', () => {
    const session = [{
      id: 'a',
      title: '# 1 path',
      finalPath: 'path',
      savedAt: '2026-01-01T00:00:00.000Z',
      transcript: [{ userText: 'ciao' }],
    }];
    expect(preserveSavedChatTestsOnReload(session, [])).toEqual(session);
  });
});
