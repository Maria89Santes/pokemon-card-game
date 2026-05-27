import { Component, OnInit } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { SupabaseService } from './services/supabase';
import { AudioService } from './services/audio';
import { ToastService } from './services/toast';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  showSplash = true;
  showSettings = false;
  isFullscreen = false;
  isLightTheme = false;
  splashMessage = 'Estableciendo conexión encriptada...';

  constructor(
    public supabaseService: SupabaseService,
    public audioService: AudioService,
    public toastService: ToastService,
    private router: Router
  ) {
    console.log('Pokémon Card Game: Supabase Inicializado 🔥');
  }

  ngOnInit() {
    // Cargar preferencia de tema visual (Modo Claro / Oscuro)
    const savedTheme = localStorage.getItem('light-theme');
    if (savedTheme === 'true') {
      this.isLightTheme = true;
      document.body.classList.add('light-theme');
    }

    // Escuchar cambios de pantalla completa
    document.addEventListener('fullscreenchange', () => {
      this.isFullscreen = !!document.fullscreenElement;
    });

    // Suscribirse a los cambios de ruta para reanudar automáticamente la música de menús al salir del combate
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        const url = event.urlAfterRedirects || event.url;
        if (!url.includes('/battle')) {
          // Reanudar música alegre y relajante en menús
          this.audioService.playBgm('lobby-theme.mp3', 0.4);
        }
      }
    });

    // Simular un cargado cinematico
    setTimeout(() => {
      this.splashMessage = 'Cargando recursos gráficos en HD y audio premium...';
    }, 1000);

    setTimeout(() => {
      this.splashMessage = '¡Listo para la batalla! Cargando mazo activo...';
    }, 2000);

    setTimeout(() => {
      this.showSplash = false;
      // Tratar de iniciar música de fondo lobby/dashboard si no hay autoplay block o el usuario ya interactuó
      this.audioService.playBgm('lobby-theme.mp3', 0.4);
      this.toastService.show('¡Bienvenido a Pokémon Card Game! ⚔️', 'success');
    }, 3000);
  }

  get userSignalVal(): string {
    const user = this.supabaseService.currentUserSignal();
    return user ? `${user.email} (${user.id.substring(0, 8)})` : 'NULL (Logged Out)';
  }

  get profileSignalVal(): string {
    const profile = this.supabaseService.userProfileSignal();
    return profile ? `${profile.username} (Nivel ${profile.nivel})` : 'NULL';
  }

  get initSignalVal(): boolean {
    return this.supabaseService.isInitialized();
  }

  toggleSettings() {
    this.audioService.playClick();
    this.showSettings = !this.showSettings;
  }

  toggleFullscreen() {
    this.audioService.playClick();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
        .then(() => {
          this.isFullscreen = true;
          this.toastService.show('Modo pantalla completa activado 🖥️', 'info');
        })
        .catch(err => {
          console.error('Error al activar pantalla completa:', err);
          this.toastService.show('No se pudo activar pantalla completa', 'error');
        });
    } else {
      document.exitFullscreen()
        .then(() => {
          this.isFullscreen = false;
          this.toastService.show('Modo pantalla completa desactivado', 'info');
        })
        .catch(err => console.error(err));
    }
  }

  toggleTheme() {
    this.audioService.playClick();
    this.isLightTheme = !this.isLightTheme;
    if (this.isLightTheme) {
      document.body.classList.add('light-theme');
      localStorage.setItem('light-theme', 'true');
      this.toastService.show('Tema claro activado ☀️', 'info');
    } else {
      document.body.classList.remove('light-theme');
      localStorage.setItem('light-theme', 'false');
      this.toastService.show('Tema oscuro activado 🌙', 'info');
    }
  }

  closeSettings() {
    this.audioService.playClick();
    this.showSettings = false;
  }

  playHover() {
    this.audioService.playHover();
  }

  playClick() {
    this.audioService.playClick();
  }

  forceLogout() {
    this.audioService.playClick();
    localStorage.clear();
    sessionStorage.clear();
    this.supabaseService.signOut().then(() => {
      window.location.href = '/login';
    }).catch(() => {
      window.location.href = '/login';
    });
  }
}