import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService, Carta, MisionItem } from '../../services/supabase';
import { LocalDbService } from '../../services/local-db';
import { NavbarComponent } from '../../components/navbar/navbar';
import { PokemonCardComponent } from '../../components/pokemon-card/pokemon-card';
import { AudioService } from '../../services/audio';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent, PokemonCardComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit {
  cards: Carta[] = [];
  filteredCards: Carta[] = [];
  loadingCards = true;
  
  // Filtros interactivos
  searchTerm = '';
  selectedType = '';

  // Progresión del Entrenador (Fase 4)
  recentBattles: any[] = [];

  get dailyMissions(): MisionItem[] {
    return this.profile?.misiones || [
      {id: 'completar_duelo', titulo: 'Duelo del Día 🌅', desc: 'Completa una batalla vs IA.', progreso: 0, objetivo: 1, recompensa: 30, completado: false, reclamado: false},
      {id: 'ganar_duelo', titulo: '¡Victoria! 🥇', desc: 'Gana una batalla vs IA o PvP.', progreso: 0, objetivo: 1, recompensa: 50, completado: false, reclamado: false},
      {id: 'usar_habilidad', titulo: 'Alquimista de Habilidades ✨', desc: 'Usa una habilidad especial en batalla 2 veces.', progreso: 0, objetivo: 2, recompensa: 40, completado: false, reclamado: false}
    ];
  }

  get achievements() {
    const achievementsObj = this.profile?.logros || {
      primer_duelo: {titulo: 'Primer Duelo ⚔️', desc: 'Completa tu primera batalla (vs IA o PvP).', progreso: 0, objetivo: 1, recompensa: 50, completado: false, reclamado: false},
      estratega: {titulo: 'Estratega de la Arena 🏆', desc: 'Gana 5 batallas en total.', progreso: 0, objetivo: 5, recompensa: 150, completado: false, reclamado: false},
      super_efectivo: {titulo: 'Aplastando Rivalidades 💥', desc: 'Inflige un golpe elemental súper efectivo.', progreso: 0, objetivo: 1, recompensa: 80, completado: false, reclamado: false},
      paralizador: {titulo: 'Maestro Paralizador ⚡', desc: 'Paraliza a un oponente 3 veces.', progreso: 0, objetivo: 3, recompensa: 100, completado: false, reclamado: false},
      incendio: {titulo: 'Incendio Forestal 🔥', desc: 'Quema a un oponente 3 veces.', progreso: 0, objetivo: 3, recompensa: 100, completado: false, reclamado: false}
    };
    return Object.keys(achievementsObj).map(key => ({
      id: key,
      ...achievementsObj[key]
    }));
  }

  constructor(
    public supabaseService: SupabaseService,
    private localDbService: LocalDbService,
    public audioService: AudioService,
    private cdr: ChangeDetectorRef
  ) {}

  async claimReward(type: 'misiones' | 'logros', itemId: string) {
    this.audioService.playEnergy();
    const success = await this.supabaseService.claimReward(type, itemId);
    if (success) {
      this.cdr.detectChanges();
    }
  }

  async ngOnInit() {
    // Forzar recarga del perfil desde Supabase para reflejar victorias/derrotas inmediatamente
    await this.supabaseService.forceReloadProfile();
    await this.loadCards();
    await this.loadMissionsAndHistory();
    this.cdr.detectChanges();
  }

  // Obtener perfil del usuario reactivamente de la señal
  get profile() {
    return this.supabaseService.userProfileSignal();
  }

  // Combates jugados en total
  get totalGames() {
    const profile = this.profile;
    if (!profile) return 0;
    return profile.victorias + profile.derrotas;
  }

  // Winrate en porcentaje
  get winrate() {
    const profile = this.profile;
    if (!profile || this.totalGames === 0) return 0;
    return Math.round((profile.victorias / this.totalGames) * 100);
  }

  // XP del nivel actual
  get currentXpProgress() {
    const profile = this.profile;
    if (!profile || profile.total_xp === undefined) return 0;
    return profile.total_xp % 100;
  }

  // Obtener título de rango basado en el nivel
  get playerRankTitle(): string {
    const profile = this.profile;
    if (!profile || !profile.nivel) return 'Entrenador Novato ⛺';
    const level = profile.nivel;
    if (level === 1) return 'Entrenador Novato ⛺';
    if (level === 2) return 'Luchador de Gimnasio 🛡️';
    if (level === 3) return 'Líder de la Arena ⚔️';
    if (level === 4) return 'Campeón de la Liga 🏆';
    return 'Maestro Pokémon 🌌';
  }

  // Obtener 3 cartas destacadas para favoritos
  get favoriteCards(): Carta[] {
    return this.cards.filter(c => c.rareza === 'Legendaria' || c.rareza === 'Épica').slice(0, 3);
  }

  // Obtener colección desde Supabase (Sincronizado con SQLite Local)
  async loadCards() {
    this.loadingCards = true;
    try {
      const fetchedCards = await this.supabaseService.getCards();
      if (fetchedCards && fetchedCards.length > 0) {
        this.cards = fetchedCards;
        this.localDbService.saveLocalCards(this.cards); // Guardar en caché SQLite local
      } else {
        this.cards = this.localDbService.getLocalCards(); // Fallback offline
      }
      this.applyFilters();
    } catch (err) {
      console.error('[Dashboard Component] Error cargando cartas de Supabase, intentando desde SQLite local:', err);
      this.cards = this.localDbService.getLocalCards();
      this.applyFilters();
    } finally {
      this.loadingCards = false;
      this.cdr.detectChanges();
    }
  }

  // Cargar historial de partidas y misiones del jugador
  async loadMissionsAndHistory() {
    const profile = this.profile;
    if (!profile) return;

    try {
      // 1. Cargar las partidas remota (Supabase) y local (SQLite)
      let combinedBattles: any[] = [];
      try {
        const { data, error } = await this.supabaseService.supabase
          .from('partidas')
          .select('*')
          .eq('jugador1_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(10);

        if (data) {
          combinedBattles = data.map((b: any) => ({
            ...b,
            isLocal: false
          }));
        }
      } catch (e) {
        console.warn('[Dashboard] No se pudieron cargar partidas de Supabase, usando SQLite local:', e);
      }

      // Mezclar con partidas locales en la tabla SQLite local_partidas
      try {
        const localMatches = this.localDbService.getLocalMatches();
        const mappedLocal = localMatches.map((m: any) => ({
          id: m.id,
          jugador1_id: profile.id,
          ganador_id: m.resultado === 'victoria' ? profile.id : null,
          created_at: m.fecha,
          modo: m.modo,
          isLocal: true
        }));
        
        combinedBattles = [...combinedBattles, ...mappedLocal]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5); // Tomar las 5 más recientes en total
      } catch (e) {
        console.error('[Dashboard] Error al mezclar partidas locales SQLite:', e);
      }

      this.recentBattles = combinedBattles;

      // Progresión de misiones dinámica cargada desde base de datos.

    } catch (err) {
      console.error('[Dashboard Component] Error cargando datos de progresión:', err);
    } finally {
      this.cdr.detectChanges();
    }
  }

  // Filtrado de cartas reactivo en base a términos de búsqueda y chips de tipo
  applyFilters() {
    this.filteredCards = this.cards.filter(card => {
      const matchSearch = card.nombre.toLowerCase().includes(this.searchTerm.toLowerCase());
      const matchType = !this.selectedType || card.tipo.toLowerCase() === this.selectedType.toLowerCase();
      return matchSearch && matchType;
    });
  }

  // Manejar click en chip de filtro de tipo
  selectTypeFilter(type: string) {
    this.selectedType = this.selectedType === type ? '' : type;
    this.applyFilters();
  }
}
