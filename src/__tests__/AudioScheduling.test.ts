import {
  scheduleScorePlayback,
  scheduleTonePlayback,
  stopTonePlayback,
} from '@/engines/toneEngine';
import { createTimeline } from '@/services/TimelineService';
import { parseABC } from '@/importers/abcImporter';

const mockAttack = jest.fn();
const mockRelease = jest.fn();
const mockStart = jest.fn().mockResolvedValue(undefined);
const mockTransportStart = jest.fn();
const mockOnce = jest.fn();
const mockDispose = jest.fn();
const mockPart = jest.fn().mockImplementation(() => ({ start: jest.fn(), dispose: mockDispose }));
jest.mock('tone', () => ({
  start: () => mockStart(),
  PolySynth: jest.fn().mockImplementation(() => ({
    toDestination() {
      return this;
    },
    volume: { value: 0 },
    triggerAttackRelease: mockAttack,
    releaseAll: mockRelease,
  })),
  FMSynth: jest.fn(),
  Synth: jest.fn(),
  Part: function (...args: unknown[]) {
    return mockPart(...args);
  },
  Draw: { schedule: (callback: () => void) => callback() },
  Transport: {
    start: mockTransportStart,
    stop: jest.fn(),
    cancel: jest.fn(),
    bpm: { value: 120 },
    scheduleOnce: mockOnce,
  },
}));

beforeEach(() => {
  stopTonePlayback();
  jest.clearAllMocks();
  mockStart.mockResolvedValue(undefined);
});
afterEach(() => stopTonePlayback());

it('a stop during ordinary playback initialization prevents a late transport start', async () => {
  const scheduling = scheduleTonePlayback([], 120);
  stopTonePlayback();
  await scheduling;
  expect(mockPart).not.toHaveBeenCalled();
  expect(mockTransportStart).not.toHaveBeenCalled();
});

it.each([
  ['"C"z4 |', 0, 2],
  ['"C"C z3 | "G"z4 |', 0, 4],
  ['"C"C z3 |', 1, 1],
])('plays all accompaniment for %s from offset %s', async (music, offset, duration) => {
  const parsed = parseABC(`X:1\nM:4/4\nL:1/4\nK:C\n${music}`);
  if (!parsed.ok) throw new Error(parsed.error);
  const onComplete = jest.fn();
  await scheduleScorePlayback(
    createTimeline(parsed.score, 120),
    parsed.score,
    120,
    { enabled: true, velocity: 50 },
    offset,
    undefined,
    onComplete
  );
  expect(onComplete).not.toHaveBeenCalled();
  expect(mockTransportStart).toHaveBeenCalledTimes(1);
  expect(mockOnce.mock.calls[0][1]).toBeCloseTo(duration + 0.1);
  const chordCall = mockPart.mock.calls.find(([, events]) => events[0]?.notes);
  expect(chordCall).toBeDefined();
  const [callback, chords] = chordCall!;
  expect(chords[0].time).toBe(0);
  expect(chords.at(-1).time + chords.at(-1).duration).toBe(duration);
  for (const order of mockPart.mock.invocationCallOrder) {
    expect(order).toBeLessThan(mockTransportStart.mock.invocationCallOrder[0]);
  }
  for (const event of chords) callback(event.time, event);
  expect(mockAttack).toHaveBeenCalled();
  expect(mockDispose).not.toHaveBeenCalled();
  mockOnce.mock.calls[0][0](duration + 0.1);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(mockDispose).toHaveBeenCalledTimes(mockPart.mock.calls.length);
});

it('completes an empty melody immediately when accompaniment is disabled', async () => {
  const parsed = parseABC('X:1\nM:4/4\nL:1/4\nK:C\n"C"z4 |');
  if (!parsed.ok) throw new Error(parsed.error);
  const onComplete = jest.fn();
  await scheduleScorePlayback(
    [],
    parsed.score,
    120,
    { enabled: false, velocity: 50 },
    0,
    undefined,
    onComplete
  );
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(mockTransportStart).not.toHaveBeenCalled();
});

it('cancels a combined start while chord scheduling is pending', async () => {
  const parsed = parseABC('X:1\nM:4/4\nL:1/4\nK:C\n"C"C z3 |');
  if (!parsed.ok) throw new Error(parsed.error);
  const onComplete = jest.fn();
  const onCancel = jest.fn();
  mockPart.mockImplementationOnce(() => {
    void Promise.resolve().then(() => stopTonePlayback());
    return { start: jest.fn(), dispose: mockDispose };
  });
  await scheduleScorePlayback(
    createTimeline(parsed.score, 120),
    parsed.score,
    120,
    { enabled: true, velocity: 50 },
    0,
    undefined,
    onComplete,
    { onCancel }
  );
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
  expect(mockTransportStart).not.toHaveBeenCalled();
  expect(mockPart).toHaveBeenCalledTimes(1);
  expect(mockDispose).toHaveBeenCalledTimes(1);
});
