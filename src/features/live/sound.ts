// The room's sound. Synthesized, never a file.
//
// The 2026-08-19 spec said "No sound. Ever. It is a classroom." This module
// reverses that rule, and the class that reversed it is the whole argument: the
// end-of-class quiz ran with a real group and every student kept their head
// down on a phone for all ten rounds. Ten rounds of visual choreography reach
// nobody who is not looking. Sound is the only channel that reaches a student
// whose eyes are down, and `close` — the two-note sting at the instant a round
// shuts — is the cue that lifts twenty-six heads at once. Everything else here
// is texture around that one cue.
//
// Synthesized with the Web Audio API rather than shipped as audio: Kahoot's
// music is licensed and cannot be used, and a tick that accelerates is a few
// dozen lines with no licensing question attached. The verifier asserts that no
// audio file extension is ever named in this file — which is why this sentence
// does not name one either.
//
// Every export is a harmless no-op when the professor has muted, when the
// context has not been unlocked by a gesture, or when the browser has no Web
// Audio at all. Run Class is the only teaching display in the room; a screen
// that white-screens for a missing oscillator is far worse than a silent one,
// so nothing in here throws into the render path.

export type CueName = "tick" | "hurry" | "close" | "burst" | "pop";

/** The same `cp.` namespace the language and the instructor preferences use. */
const MUTED_KEY = "cp.subida-muted";
const VOLUME_KEY = "cp.subida-volume";

/** Loud enough to carry over a room, short of the level where a ceiling
 *  projector's speaker starts to distort. The professor can move it; this is
 *  only where it starts. */
const DEFAULT_VOLUME = 0.7;

/** How long the ramp to a new master level takes. A gain that steps straight to
 *  zero mid-tone clicks, and a click is the one thing a mute button must not
 *  produce. */
const FADE_S = 0.01;

type AudioCtor = new () => AudioContext;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();
let volume = readVolume();

/** Muted survives a reload. Unmuted is the default and the safe one: the button
 *  is visible on the layer, so a professor who wants silence can always reach
 *  it, whereas a screen that starts silent for no visible reason reads as
 *  broken. */
function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "on";
  } catch {
    // Private browsing, or storage disabled. The default still applies.
    return false;
  }
}

function readVolume(): number {
  try {
    const stored = localStorage.getItem(VOLUME_KEY);
    // The null check is not decoration. `Number(null)` is 0, 0 is inside the
    // valid range, and a first-ever load would have come up silent with the
    // slider parked at the far left and no explanation on screen.
    if (stored === null) return DEFAULT_VOLUME;
    const value = Number(stored);
    if (Number.isFinite(value) && value >= 0 && value <= 1) return value;
  } catch {
    // Same as above: fall through to the default.
  }
  return DEFAULT_VOLUME;
}

/** The constructor, or null on a browser that has no Web Audio at all.
 *
 *  Read as a property of `window` rather than as a bare identifier: a bare
 *  `AudioContext` where the API does not exist is a ReferenceError, not
 *  `undefined`, and that error would be thrown straight out of the layer's
 *  first render. `typeof window` covers the other end — this module is imported
 *  by a verifier and by the build, neither of which has a window. */
function audioCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  const host = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return host.AudioContext || host.webkitAudioContext || null;
}

/** Open the context, or wake a suspended one.
 *
 *  Browsers drop every sound scheduled before a user gesture. The professor's
 *  click on **Start the quiz** is the gesture this screen is built around, and
 *  EndOfClass calls this from inside that click handler. The layer calls it
 *  again on mount, which is the only chance a reloaded Run Class gets, and the
 *  mute button calls it too — a press of that button is itself a gesture.
 *
 *  Safe to call any number of times: one context is built and kept. */
export function unlock(): void {
  try {
    if (!ctx) {
      const Ctor = audioCtor();
      if (!Ctor) return;
      const created = new Ctor();
      const gain = created.createGain();
      gain.gain.value = muted ? 0 : volume;
      gain.connect(created.destination);
      ctx = created;
      master = gain;
    }
    // A context built without a gesture comes up suspended and stays there.
    // resume() does nothing when it is already running, so calling it on every
    // gesture costs nothing and is what eventually catches the reload case. It
    // is also what brings the room back after a browser suspends a backgrounded
    // tab, which Safari always does and Chrome does for a hidden tab.
    if (ctx.state !== "running") {
      ctx.resume().catch(() => { /* still no gesture; the next one may land */ });
    }
    // Restores the level silence() took away at the last layer's unmount. The
    // room's screen is the only caller, and it always unlocks on mount, so this
    // is where a silenced mixer comes back rather than a flag the cues check.
    applyLevel();
  } catch {
    // No Web Audio, or a browser that refused to build a context. Every cue
    // below then falls through to nothing.
    ctx = null;
    master = null;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = Boolean(next);
  applyLevel();
  try {
    localStorage.setItem(MUTED_KEY, muted ? "on" : "off");
  } catch {
    // The choice still holds for this class.
  }
}

/** 0 to 1. */
export function volumeLevel(): number {
  return volume;
}

export function setVolume(next: number): void {
  const value = Number(next);
  volume = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_VOLUME;
  applyLevel();
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // As above.
  }
}

/** Mute and volume take effect NOW, not on the next cue.
 *
 *  Everything is scheduled through this one node, so the sting that is already
 *  ringing when the professor reaches for the button is cut with it. A mixer
 *  that only checked `muted` at the top of `cue()` would leave the room still
 *  hearing the thing the professor just silenced. */
function applyLevel(): void {
  if (!ctx || !master) return;
  const target = muted ? 0 : volume;
  try {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(target, ctx.currentTime, FADE_S);
  } catch {
    master.gain.value = target;
  }
}

/** Cut everything that is already sounding.
 *
 *  Called when the room's screen closes. The layer can cancel the timers it has
 *  not fired yet, but a cue already handed to the audio clock is beyond any
 *  timer — a `close` runs 780 ms and a `burst` 775 ms, and either would ring on
 *  into a room whose screen the professor just shut. The master gain is the one
 *  thing that reaches a note already in flight. `unlock()` puts the level back,
 *  which is why the layer's mount is the other half of this pair. */
export function silence(): void {
  if (!ctx || !master) return;
  try {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0, ctx.currentTime, FADE_S);
  } catch {
    master.gain.value = 0;
  }
}

/** One note: an oscillator and its own envelope, through the master gain. */
interface Note {
  type: OscillatorType;
  /** Hertz at the start of the note. */
  from: number;
  /** Swept to by the end of the note, when the note slides. */
  to?: number;
  /** Seconds after the cue begins. */
  at: number;
  ms: number;
  /** Peak gain before the master level scales it. */
  peak: number;
}

function play(audio: AudioContext, out: GainNode, start: number, note: Note): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const from = start + note.at;
  const to = from + note.ms / 1000;

  osc.type = note.type;
  osc.frequency.setValueAtTime(note.from, from);
  if (note.to !== undefined) osc.frequency.exponentialRampToValueAtTime(note.to, to);

  // A few milliseconds of attack and an exponential tail. A gain that starts at
  // its peak clicks on every note, which over four hundred cues in a quiz is
  // the difference between a bed and a rattle. exponentialRamp cannot reach
  // zero, so the tail lands below hearing and the node is stopped there.
  gain.gain.setValueAtTime(0.0001, from);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, note.peak), from + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, to);

  osc.connect(gain);
  gain.connect(out);
  osc.start(from);
  // Stopped explicitly. An oscillator left running is a node that is never
  // collected, and this screen fires a cue roughly every second for ten rounds.
  osc.stop(to + 0.02);
}

type Voice = (audio: AudioContext, out: GainNode, start: number) => void;

const VOICES: Record<CueName, Voice> = {
  // Once a second through the forty. Short and dry on purpose — anything with a
  // tail has become a drone by round three, and this has to survive ten rounds
  // in the same room without anyone asking for it to stop.
  tick: (audio, out, start) => {
    play(audio, out, start, { type: "square", from: 880, to: 660, at: 0, ms: 45, peak: 0.12 });
  },

  // The last ten seconds: higher AND faster. Two clicks inside the same second
  // is what makes it faster, and it is deliberately built into the cue rather
  // than into a second timer — the layer already runs a one-second clock for
  // the countdown, and a second interval would drift out of step with the
  // number the room is reading.
  hurry: (audio, out, start) => {
    play(audio, out, start, { type: "square", from: 1320, to: 990, at: 0, ms: 40, peak: 0.16 });
    play(audio, out, start, { type: "square", from: 1320, to: 990, at: 0.24, ms: 40, peak: 0.16 });
  },

  // THE cue, and the reason this module exists. Two notes a fifth apart, rising
  // — a rise reads as "look up" where a fall reads as "that is over" — each one
  // a triangle for body with a quiet square stacked on it for the upper
  // harmonics that carry through room noise. The second note holds far longer
  // than anything else here: it has to still be sounding while twenty-six
  // students are lifting their heads.
  close: (audio, out, start) => {
    play(audio, out, start, { type: "triangle", from: 659.25, at: 0, ms: 170, peak: 0.5 });
    play(audio, out, start, { type: "square", from: 659.25, at: 0, ms: 170, peak: 0.14 });
    play(audio, out, start, { type: "triangle", from: 987.77, at: 0.16, ms: 620, peak: 0.5 });
    play(audio, out, start, { type: "square", from: 987.77, at: 0.16, ms: 620, peak: 0.16 });
  },

  // The piñata. A four-note major arpeggio climbing an octave, the last note
  // ringing on — the shape a room already reads as "something was won".
  //
  // Held at 0.30 rather than the 0.34 it started at because this cue is the one
  // that can land ON TOP of the sting: the piñata bursts on the settle, which
  // happens inside the break, so the poll that reports it can arrive while the
  // 780 ms close is still ringing. At 0.34 the two summed just past 1.0 at full
  // volume, which is where a cheap projector speaker starts to distort. The
  // verifier scans every alignment of the pair rather than trusting this note.
  burst: (audio, out, start) => {
    const arpeggio = [523.25, 659.25, 783.99, 1046.5];
    arpeggio.forEach((freq, index) => {
      const last = index === arpeggio.length - 1;
      play(audio, out, start, {
        type: "triangle", from: freq, at: index * 0.085, ms: last ? 520 : 200, peak: 0.3
      });
    });
  },

  // One animal in the finale wave. Soft and low-peaked because a whole room's
  // worth of these overlap: sixty lanes compress to about a twenty-millisecond
  // step, so four can be sounding at once and four at 0.14 is still headroom.
  pop: (audio, out, start) => {
    play(audio, out, start, { type: "sine", from: 920, to: 420, at: 0, ms: 90, peak: 0.14 });
  }
};

/** Fire one cue. Silent and harmless when muted, when nothing has unlocked the
 *  context, or when this browser has no Web Audio. */
export function cue(name: CueName): void {
  // Muted first and cheapest: it is the state a professor who wants a quiet
  // room leaves this screen in for a whole class.
  if (muted) return;
  const audio = ctx;
  const out = master;
  if (!audio || !out) return;
  // Not yet unlocked. Scheduling into a suspended context does not fail, it
  // QUEUES — so a quiz whose start click never reached us would fire a whole
  // round's worth of stored ticks in one burst the moment anything resumed it.
  if (audio.state !== "running") return;
  const voice = VOICES[name];
  if (!voice) return;
  try {
    voice(audio, out, audio.currentTime);
  } catch {
    // One dropped cue is invisible; a thrown one takes the room's screen with
    // it. This is the last guard before the render path.
  }
}
