import { Component, OnInit, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { SupabaseService, Mazo } from '../../services/supabase';
import { NavbarComponent } from '../../components/navbar/navbar';
import { ToastService } from '../../services/toast';
import { AudioService } from '../../services/audio';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent],
  templateUrl: './lobby.html',
  styleUrl: './lobby.css'
})
export class LobbyComponent implements OnInit, OnDestroy {
  decks: Mazo[] = [];
  selectedDeckId: string | null = null;
  availableMatches: any[] = [];
  loading = true;
  onlineCount = 0;

  // Estado del creador esperando
  waitingMatchId: string | null = null;
  private realtimeSubscription: any = null;
  private lobbyRealtimeSub: any = null;

  constructor(
    public supabaseService: SupabaseService,
    private router: Router,
    private toastService: ToastService,
    public audioService: AudioService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.audioService.playBgm('lobby-theme.mp3', 0.4);
    await this.loadDecks();
    await this.loadAvailableMatches();
    this.subscribeToLobbyRealtime();
  }

  ngOnDestroy() {
    this.unsubscribeRealtime();
    if (this.lobbyRealtimeSub) {
      this.supabaseService.supabase.removeChannel(this.lobbyRealtimeSub);
    }
  }

  async loadDecks() {
    const user = this.supabaseService.currentUserSignal();
    if (user) {
      const fetchedDecks = await this.supabaseService.getDecks(user.id);
      this.decks = fetchedDecks;
      if (this.decks.length > 0) {
        this.selectedDeckId = this.decks[0].id;
      }
    }
  }

  async loadAvailableMatches() {
    try {
      const matches = await this.supabaseService.getAvailableMatches();
      this.ngZone.run(() => {
        const user = this.supabaseService.currentUserSignal();
        this.availableMatches = matches
          .filter((m: any) => m.jugador1_id !== user?.id)
          .map((m: any) => ({
            ...m,
            waitSeconds: this.calcWaitSeconds(m.created_at)
          }));
        this.onlineCount = matches.length + 1;
        this.loading = false;
        this.cdr.detectChanges();
      });
    } catch (err) {
      console.error('[Lobby] Error cargando partidas:', err);
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  /** Supabase Realtime — escuchar cambios en la tabla partidas para refrescar el lobby en vivo */
  private subscribeToLobbyRealtime() {
    this.lobbyRealtimeSub = this.supabaseService.supabase
      .channel('lobby-public-rooms')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'partidas'
      }, () => {
        this.ngZone.run(() => {
          this.loadAvailableMatches();
        });
      })
      .subscribe();
  }

  // Crear Sala Multijugador
  async handleCreateRoom() {
    if (!this.selectedDeckId) {
      this.toastService.show('Por favor, selecciona un mazo primero.', 'warning');
      return;
    }

    const deckDetails = await this.supabaseService.getDeckWithCards(this.selectedDeckId);
    if (!deckDetails || deckDetails.cards.length === 0) {
      this.toastService.show('El mazo seleccionado no tiene cartas. Añade cartas en el Deck Builder.', 'error');
      return;
    }

    this.audioService.playClick();
    const user = this.supabaseService.currentUserSignal();
    if (!user) return;

    this.loading = true;
    this.cdr.detectChanges();
    const matchId = await this.supabaseService.createMultiplayerMatch(user.id);
    if (matchId) {
      this.waitingMatchId = matchId;
      this.toastService.show('Sala creada con éxito. Esperando rival...', 'success');
      this.subscribeRealtime(matchId);
    } else {
      this.toastService.show('Error al crear sala. Verifica tu conexión.', 'error');
    }
    this.loading = false;
    this.cdr.detectChanges();
  }

  // Cancelar Sala Creada
  async handleCancelWaiting() {
    if (this.waitingMatchId) {
      this.audioService.playClick();
      await this.supabaseService.cancelMatch(this.waitingMatchId);
      this.unsubscribeRealtime();
      this.waitingMatchId = null;
      this.toastService.show('Búsqueda cancelada con éxito.', 'info');
      await this.loadAvailableMatches();
    }
  }

  // Unirse a una Sala Existente
  async handleJoinMatch(match: any) {
    if (!this.selectedDeckId) {
      this.toastService.show('Selecciona un mazo antes de unirte.', 'warning');
      return;
    }

    const deckDetails = await this.supabaseService.getDeckWithCards(this.selectedDeckId);
    if (!deckDetails || deckDetails.cards.length === 0) {
      this.toastService.show('El mazo no tiene cartas. Visita el Deck Builder.', 'error');
      return;
    }

    this.audioService.playClick();
    const user = this.supabaseService.currentUserSignal();
    if (!user) return;

    this.loading = true;
    const success = await this.supabaseService.joinMultiplayerMatch(match.id, user.id);
    if (success) {
      this.toastService.show('¡Te has unido al combate online! Prepárate.', 'success');
      this.router.navigate(['/battle', this.selectedDeckId], {
        queryParams: { matchId: match.id }
      });
    } else {
      this.toastService.show('No se pudo unir a la sala. Es posible que ya esté llena.', 'error');
      await this.loadAvailableMatches();
    }
    this.loading = false;
  }

  // Suscribirse a cambios en tiempo real en partidas para el Creador
  private subscribeRealtime(matchId: string) {
    this.unsubscribeRealtime();

    this.realtimeSubscription = this.supabaseService.supabase
      .channel(`room-${matchId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'partidas',
        filter: `id=eq.${matchId}`
      }, (payload: any) => {
        this.ngZone.run(() => {
          const updatedMatch = payload.new;
          if (updatedMatch.jugador2_id && updatedMatch.estado === 'en_progreso') {
            this.toastService.show('¡Un oponente ha ingresado! Entrando a la arena...', 'success');
            this.unsubscribeRealtime();
            this.router.navigate(['/battle', this.selectedDeckId], {
              queryParams: { matchId: matchId }
            });
          }
        });
      })
      .subscribe();
  }

  private unsubscribeRealtime() {
    if (this.realtimeSubscription) {
      this.supabaseService.supabase.removeChannel(this.realtimeSubscription);
      this.realtimeSubscription = null;
    }
  }

  calcWaitSeconds(createdAt: string): number {
    if (!createdAt) return 0;
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  }

  formatWait(seconds: number): string {
    if (seconds < 60) return `${seconds}s esperando`;
    const m = Math.floor(seconds / 60);
    return `${m}m esperando`;
  }

  playHover() {
    this.audioService.playHover();
  }
}
