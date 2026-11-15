"""MIDI type 1 via mido. 60 BPM, so one beat is one second."""

import io

import mido

from earth_sound.domain.aerosols.layers import LAYERS
from earth_sound.domain.music.score import NoteEvent, Score

PPQ = 480
BED_CHANNEL = 4
BED_PROGRAM = 89


def _latin1(text: str) -> str:
    # mido writes text meta events as Latin-1
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _track(name: str, channel: int, program: int, pan: int, notes: list[NoteEvent]) -> mido.MidiTrack:
    track = mido.MidiTrack()
    track.append(mido.MetaMessage("track_name", name=_latin1(name), time=0))
    track.append(mido.Message("program_change", channel=channel, program=program, time=0))
    track.append(mido.Message("control_change", channel=channel, control=10, value=pan, time=0))
    track.append(mido.Message("control_change", channel=channel, control=91, value=92, time=0))
    track.append(mido.Message("control_change", channel=channel, control=93, value=38, time=0))
    events: list[tuple[int, int, mido.Message]] = []
    for n in notes:
        on = round(n.time * PPQ)
        off = max(on + 1, round((n.time + n.duration) * PPQ))
        velocity = min(127, max(1, n.velocity))
        events.append((on, 1, mido.Message("note_on", channel=channel, note=n.pitch, velocity=velocity)))
        events.append((off, 0, mido.Message("note_off", channel=channel, note=n.pitch, velocity=0)))
    events.sort(key=lambda e: (e[0], e[1]))  # note-off before note-on on the same tick
    previous = 0
    for tick, _, message in events:
        track.append(message.copy(time=tick - previous))
        previous = tick
    track.append(mido.MetaMessage("end_of_track", time=0))
    return track


class MidoMidiEncoder:
    media_type = "audio/midi"

    def encode(self, score: Score, enabled_layers: tuple[int, ...], include_bed: bool, source_text: str) -> bytes:
        midi = mido.MidiFile(type=1, ticks_per_beat=PPQ)
        conductor = mido.MidiTrack()
        conductor.append(mido.MetaMessage("track_name", name="Earth Jukebox / tempo", time=0))
        conductor.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(60), time=0))
        conductor.append(mido.MetaMessage("time_signature", numerator=4, denominator=4, time=0))
        conductor.append(mido.MetaMessage("text", text=_latin1(source_text), time=0))
        conductor.append(mido.MetaMessage("end_of_track", time=0))
        midi.tracks.append(conductor)
        for k in enabled_layers:
            layer = LAYERS[k]
            notes = [n for n in score.notes if n.layer == k]
            midi.tracks.append(_track(layer.label, k, layer.program, layer.pan, notes))
        if include_bed:
            midi.tracks.append(_track("Harmony bed", BED_CHANNEL, BED_PROGRAM, 64, list(score.bed)))
        buffer = io.BytesIO()
        midi.save(file=buffer)
        return buffer.getvalue()
