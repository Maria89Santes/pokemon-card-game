import { Injectable, signal, effect } from '@angular/core';
import { LocalDbService } from './local-db';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  // Signals reactivas para el control de audio
  muted = signal<boolean>(false);
  volume = signal<number>(0.3);

  // Instancia de audio para la música de fondo (BGM)
  private bgmAudio: HTMLAudioElement | null = null;
  private currentBgmPath = '';

  constructor(private localDbService: LocalDbService) {
    // 1. Cargar preferencias guardadas desde la base de datos local SQLite emulada
    const config = this.localDbService.getLocalConfig();
    if (config) {
      this.muted.set(config.muted || false);
      this.volume.set(config.sfx_volume !== undefined ? config.sfx_volume : 0.3);
    }

    // 2. Efecto reactivo: Guardar estado en base de datos local e instrumentar volumen en BGM activo
    effect(() => {
      const isMuted = this.muted();
      const currentVol = this.volume();

      this.localDbService.saveLocalConfig({
        sfx_volume: currentVol,
        bgm_volume: currentVol,
        muted: isMuted,
        fullscreen: this.localDbService.getLocalConfig().fullscreen || false
      });

      if (this.bgmAudio) {
        this.bgmAudio.muted = isMuted;
        this.bgmAudio.volume = currentVol;
      }
    });
  }

  // Alternar el estado de silenciado
  toggleMute() {
    this.muted.set(!this.muted());
    this.playClick();
  }

  // Modificar el nivel de volumen
  setVolume(val: number) {
    // Normalizar volumen entre 0.0 y 1.0
    const clamped = Math.max(0, Math.min(1, val));
    this.volume.set(clamped);
  }

  // =========================================================================
  // EFECTOS DE SONIDO (SFX PLAYBACK)
  // =========================================================================

  private playSfx(fileName: string, relativeVolume = 1.0) {
    if (this.muted()) return;

    try {
      const audio = new Audio(`assets/sounds/${fileName}`);
      audio.volume = this.volume() * relativeVolume;
      audio.play().catch(() => {
        // Captura y silencia de forma segura bloqueos por autoplay del navegador
        console.warn(`[Audio Service] Reproducción bloqueada por navegador para: ${fileName}`);
      });
    } catch (e) {
      console.error('[Audio Service] Error en reproducción SFX:', e);
    }
  }

  playClick() {
    this.playSfx('click.mp3', 0.6);
  }

  playHover() {
    this.playSfx('hover.mp3', 0.35);
  }

  playAttack() {
    this.playSfx('attack.mp3', 1.0);
  }

  playDamage() {
    this.playSfx('damage.mp3', 1.0);
  }

  playFaint() {
    this.playSfx('faint.mp3', 1.0);
  }

  playVictory() {
    this.playSfx('victory.mp3', 1.2);
  }

  playDefeat() {
    this.playSfx('defeat.mp3', 1.2);
  }

  playEnergy() {
    this.playSfx('energy.mp3', 0.85);
  }

  // =========================================================================
  // MÚSICA DE FONDO (BACKGROUND MUSIC - BGM)
  // =========================================================================

  playBgm(bgmFileName: string, relativeVolume = 0.5) {
    const bgmPath = `assets/sounds/${bgmFileName}`;
    if (this.currentBgmPath === bgmPath) {
      // Si la música solicitada ya está sonando, no la reiniciamos
      return;
    }

    this.stopBgm();

    try {
      this.currentBgmPath = bgmPath;
      this.bgmAudio = new Audio(bgmPath);
      this.bgmAudio.loop = true;
      this.bgmAudio.muted = this.muted();
      this.bgmAudio.volume = this.volume() * relativeVolume;
      
      this.bgmAudio.play().catch(() => {
        console.warn('[Audio Service] Autoplay bloqueado para música de fondo.');
        
        // Reintentar la reproducción ante la primera interacción del usuario en pantalla
        const retryOnInteraction = () => {
          if (this.bgmAudio) {
            this.bgmAudio.play().catch(() => {});
          }
          document.removeEventListener('click', retryOnInteraction);
        };
        document.addEventListener('click', retryOnInteraction);
      });
    } catch (err) {
      console.error('[Audio Service] Error iniciando música de fondo BGM:', err);
    }
  }

  stopBgm() {
    if (this.bgmAudio) {
      try {
        this.bgmAudio.pause();
      } catch (e) {}
      this.bgmAudio = null;
      this.currentBgmPath = '';
    }
  }
}
