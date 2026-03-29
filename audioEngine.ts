export interface Protocol {
  id: string;
  name: string;
  sub: string;
  carrier: number;
  beat: number;
  evidence: string;
  isochronicNote: string;
  waveformShape?: 'sine' | 'square' | 'sawtooth' | 'triangle';
}

export const DEFAULT_PROTOCOLS: Protocol[] = [
  {
    id: 'gamma40',
    name: '40 هيرتز جاما',
    sub: 'تحفيز معرفي — بروتوكول MIT',
    carrier: 200,
    beat: 40,
    evidence: 'Iaccarino et al. MIT 2016 (طيور). Murdock et al. 2024 (بشر — نتائج أولية واعدة)',
    isochronicNote: 'يحتاج سماعات للـ binaural',
    waveformShape: 'sine',
  },
  {
    id: 'alpha10',
    name: '10 هيرتز ألفا',
    sub: 'استرخاء — تقليل توتر',
    carrier: 432,
    beat: 10,
    evidence: 'Klimesch 1999 (alpha power & relaxation). دراسات EEG متعددة مراجَعة.',
    isochronicNote: 'يحتاج سماعات للـ binaural',
    waveformShape: 'sine',
  },
  {
    id: 'theta6',
    name: '6 هيرتز ثيتا',
    sub: 'استرخاء عميق — نوم',
    carrier: 200,
    beat: 6,
    evidence: 'Hinterberger et al. 2004. Kumano 1996 (تقليل قلق في تجارب خاضعة للمراجعة).',
    isochronicNote: 'يحتاج سماعات للـ binaural',
    waveformShape: 'sine',
  },
  {
    id: 'schumann',
    name: '7.83 هيرتز شومان',
    sub: 'التردد الكوني الأساسي للأرض',
    carrier: 528,
    beat: 7.83,
    evidence: 'König 1974 (EEG-Schumann correlation). نظرية تزامن حيوي — بحثية.',
    isochronicNote: 'يحتاج سماعات للـ binaural',
    waveformShape: 'sine',
  },
  {
    id: 'delta25',
    name: '2.5 هيرتز دلتا',
    sub: 'نوم عميق',
    carrier: 174,
    beat: 2.5,
    evidence: 'Bellesi et al. 2017 (delta & glymphatic system). Walker 2019.',
    isochronicNote: 'يحتاج سماعات للـ binaural',
    waveformShape: 'sine',
  },
];

export function getProtocols(): Protocol[] {
  const saved = localStorage.getItem('omni_protocols');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {}
  }
  return DEFAULT_PROTOCOLS;
}

export function saveProtocols(protocols: Protocol[]) {
  localStorage.setItem('omni_protocols', JSON.stringify(protocols));
}

// Keep PROTOCOLS exported for backward compatibility, but it's better to use getProtocols()
export const PROTOCOLS = DEFAULT_PROTOCOLS;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private nodes: { [key: string]: AudioNode | null } = {};
  private volume = 0.7;

  ensureCtx() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.2;

    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);
  }

  stopNodes() {
    ['osc1', 'osc2', 'lfo', 'lfoGain', 'dc', 'ampGain'].forEach((n) => {
      try {
        if (this.nodes[n]) {
          (this.nodes[n] as any).stop?.();
          this.nodes[n]?.disconnect();
        }
      } catch (e) {}
      this.nodes[n] = null;
    });
  }

  fadeIn(gainNode: GainNode, dur = 0.05) {
    if (!this.ctx) return;
    gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(1, this.ctx.currentTime + dur);
  }

  fadeOut(gainNode: GainNode, dur = 0.1, cb?: () => void) {
    if (!this.ctx) return;
    gainNode.gain.setValueAtTime(gainNode.gain.value, this.ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, this.ctx.currentTime + dur);
    if (cb) setTimeout(cb, dur * 1000 + 50);
  }

  start(proto: Protocol, mode: 'iso' | 'bin' | 'pure') {
    this.ensureCtx();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    this.stopNodes();

    if (!this.ctx || !this.master) return;

    const c = proto.carrier;
    const beat = proto.beat;
    const amp = this.ctx.createGain();
    amp.gain.value = 0;
    this.fadeIn(amp);
    amp.connect(this.master);

    if (mode === 'iso') {
      const osc = this.ctx.createOscillator();
      osc.type = proto.waveformShape || 'sine';
      osc.frequency.value = c;

      const ampG = this.ctx.createGain();
      ampG.gain.value = 0;

      // DC offset + LFO scaled to 0.45 each:
      // ampGain.gain oscillates between 0 and 0.9 — stays below unity, no clipping
      const dc = this.ctx.createConstantSource();
      dc.offset.value = 0.45;

      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      // LFO Frequency Lock — prevent drift
      const lockedBeat = beat > 0 ? beat : 1;
      lfo.frequency.setValueAtTime(lockedBeat, this.ctx.currentTime);
      lfo.frequency.linearRampToValueAtTime(lockedBeat, this.ctx.currentTime + 0.1);

      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 0.45; // ±0.45 swing → net 0–0.9

      lfo.connect(lfoG);
      lfoG.connect(ampG.gain);
      dc.connect(ampG.gain);
      osc.connect(ampG);
      ampG.connect(amp);

      osc.start();
      lfo.start();
      dc.start();

      this.nodes.osc1 = osc;
      this.nodes.lfo = lfo;
      this.nodes.dc = dc;
      this.nodes.lfoGain = lfoG;
      this.nodes.ampGain = ampG;
    } else if (mode === 'bin') {
      const merger = this.ctx.createChannelMerger(2);
      merger.connect(amp);

      const oscL = this.ctx.createOscillator();
      oscL.type = proto.waveformShape || 'sine';
      oscL.frequency.value = c;
      const gL = this.ctx.createGain();
      gL.gain.value = 0.55;
      oscL.connect(gL);
      gL.connect(merger, 0, 0);

      const oscR = this.ctx.createOscillator();
      oscR.type = proto.waveformShape || 'sine';
      oscR.frequency.value = c + beat;
      const gR = this.ctx.createGain();
      gR.gain.value = 0.55;
      oscR.connect(gR);
      gR.connect(merger, 0, 1);

      oscL.start();
      oscR.start();

      this.nodes.osc1 = oscL;
      this.nodes.osc2 = oscR;
    } else {
      const osc = this.ctx.createOscillator();
      osc.type = proto.waveformShape || 'sine';
      osc.frequency.value = c;
      osc.connect(amp);
      osc.start();
      this.nodes.osc1 = osc;
    }
  }

  stop() {
    if (this.master) {
      this.fadeOut(this.master, 0.15, () => this.stopNodes());
    } else {
      this.stopNodes();
    }
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }
}
