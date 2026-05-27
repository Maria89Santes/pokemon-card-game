import { Component, OnInit, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { SupabaseService, Carta, Mazo } from '../../services/supabase';
import { LocalDbService } from '../../services/local-db';
import { NavbarComponent } from '../../components/navbar/navbar';
import { PokemonCardComponent } from '../../components/pokemon-card/pokemon-card';
import { CardDetailModalComponent } from '../../components/card-detail-modal/card-detail-modal';

interface DeckCard extends Carta {
  cantidad: number;
}

@Component({
  selector: 'app-deck-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent, PokemonCardComponent, CardDetailModalComponent],
  templateUrl: './deck-builder.html',
  styleUrl: './deck-builder.css'
})
export class DeckBuilderComponent implements OnInit {
  deckId: string | null = null;
  mazo: Mazo | null = null;
  
  // Catálogo completo y filtrado de cartas disponibles
  cardPool: Carta[] = [];
  filteredPool: Carta[] = [];
  
  // Cartas dentro del mazo actual
  deckCards: DeckCard[] = [];

  // Filtros interactivos de búsqueda
  searchTerm = '';
  selectedType = '';

  // Control de visor de detalle ampliado
  selectedCardForDetail: Carta | null = null;

  // Estados de proceso
  loading = true;
  saving = false;
  saveSuccess = false;
  saveError = '';
  
  // Persistencia SQLite Local: Indica si se ha cargado un borrador de mazo local
  hasLocalDraft = false;

  // Colección de cartas del usuario (id_carta -> cantidad owned)
  userCollection: { [cartaId: string]: number } = {};

  // Modo Sandbox/Libre: si está activo, se desbloquean todas las cartas de forma ilimitada
  sandboxMode = true;

  get profile() {
    return this.supabaseService.userProfileSignal();
  }

  constructor(
    private supabaseService: SupabaseService,
    private route: ActivatedRoute,
    private router: Router,
    private ngZone: NgZone,
    private localDbService: LocalDbService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.deckId = this.route.snapshot.paramMap.get('id');
    if (!this.deckId) {
      this.router.navigate(['/decks']);
      return;
    }

    await this.loadInitialData();
    this.cdr.detectChanges();
  }

  // Cargar cartas del pool global y cartas guardadas del mazo (Sincronizado con SQLite Local)
  async loadInitialData() {
    this.loading = true;
    try {
      const cards = await this.supabaseService.getCards();
      let deckData = null;

      // Obtener colección del usuario autenticado si estamos en línea
      const currentUser = this.supabaseService.currentUserSignal();
      if (currentUser) {
        this.userCollection = await this.supabaseService.getUserCollection(currentUser.id);
      }

      if (this.deckId) {
        deckData = await this.supabaseService.getDeckWithCards(this.deckId);
      }

      this.ngZone.run(() => {
        this.cardPool = cards;
        if (deckData) {
          this.mazo = deckData.mazo;
          
          // Verificar si hay un borrador temporal en SQLite Local (local_mazo_temporal)
          const localDraft = this.localDbService.getMazoTemporal(this.deckId!);
          if (localDraft && localDraft.length > 0) {
            this.deckCards = localDraft;
            this.hasLocalDraft = true;
            console.log(`[SQLite Local] Cargado borrador temporal local para el mazo ${this.deckId}`);
          } else {
            this.deckCards = deckData.cards;
            this.hasLocalDraft = false;
          }
        }
        this.applyFilters();
        this.loading = false;
      });

    } catch (err) {
      console.error('[Deck Builder] Error al inicializar datos:', err);
      // Fallback offline usando base de datos local SQLite (local_cartas y local_mazo_temporal)
      this.ngZone.run(() => {
        this.cardPool = this.localDbService.getLocalCards();
        if (this.deckId) {
          const localDraft = this.localDbService.getMazoTemporal(this.deckId);
          if (localDraft) {
            this.deckCards = localDraft;
            this.hasLocalDraft = true;
          }
        }
        this.applyFilters();
        this.loading = false;
      });
    }
  }

  // Aplicar filtros de texto y chip de tipo al catálogo
  applyFilters() {
    this.filteredPool = this.cardPool.filter(card => {
      const matchSearch = card.nombre.toLowerCase().includes(this.searchTerm.toLowerCase());
      const matchType = !this.selectedType || card.tipo.toLowerCase() === this.selectedType.toLowerCase();
      return matchSearch && matchType;
    });
  }

  // Click en chip de tipo
  selectTypeFilter(type: string) {
    this.selectedType = this.selectedType === type ? '' : type;
    this.applyFilters();
  }

  // Helper para saber la cantidad de copias de una carta en el mazo
  getCardQuantityInDeck(cardId: string): number {
    const existing = this.deckCards.find(c => c.id === cardId);
    return existing ? existing.cantidad : 0;
  }

  // Añadir una carta (Regla estricta: Máximo 4 copias y debe poseer copias suficientes)
  addCard(card: Carta) {
    const ownedQty = this.userCollection[card.id] || 0;
    const isOnline = Object.keys(this.userCollection).length > 0;

    // Solo validar si no estamos en Modo Sandbox
    if (!this.sandboxMode) {
      const existingCard = this.deckCards.find(c => c.id === card.id);
      const currentQtyInDeck = existingCard ? existingCard.cantidad : 0;

      // 1. Validar si está bloqueada en la colección del usuario (online check)
      if (isOnline && ownedQty <= 0) {
        alert(`¡Carta Bloqueada! 🔒 Consigue esta carta abriendo sobres en la Tienda antes de añadirla a tu mazo.`);
        return;
      }

      // 2. Validar que no exceda las copias que posee en su colección
      if (isOnline && currentQtyInDeck >= ownedQty) {
        alert(`Colección TCG: Solo posees ${ownedQty} copia(s) de esta carta en tu inventario. ¡Visita la Tienda para conseguir más sobres! 🛒`);
        return;
      }
    }

    const existing = this.deckCards.find(c => c.id === card.id);
    if (existing) {
      if (existing.cantidad >= 4) {
        alert('Reglas Oficiales TCG: No puedes tener más de 4 copias de la misma carta en tu mazo de batalla.');
        return;
      }
      existing.cantidad++;
    } else {
      this.deckCards.push({
        ...card,
        cantidad: 1
      });
    }
    // Guardar borrador temporal en SQLite Local (local_mazo_temporal)
    if (this.deckId) {
      this.localDbService.saveMazoTemporal(this.deckId, this.deckCards);
      this.hasLocalDraft = true;
    }
  }

  // Quitar o decrementar cantidad de una carta
  removeCard(cardId: string) {
    const existing = this.deckCards.find(c => c.id === cardId);
    
    if (existing) {
      existing.cantidad--;
      if (existing.cantidad <= 0) {
        this.deckCards = this.deckCards.filter(c => c.id !== cardId);
      }
    }
    // Guardar borrador temporal en SQLite Local (local_mazo_temporal)
    if (this.deckId) {
      this.localDbService.saveMazoTemporal(this.deckId, this.deckCards);
      this.hasLocalDraft = this.deckCards.length > 0;
    }
  }

  // Detalle ampliado de la carta (abre modal)
  openCardDetail(card: Carta, event: Event) {
    event.stopPropagation();
    this.selectedCardForDetail = card;
  }

  closeCardDetail() {
    this.selectedCardForDetail = null;
  }

  // Estadísticas reactivas del mazo

  // Conteo total de cartas añadidas
  get totalCards(): number {
    return this.deckCards.reduce((acc, curr) => acc + curr.cantidad, 0);
  }

  // Promedio de ataque del mazo
  get averageAttack(): number {
    if (this.totalCards === 0) return 0;
    const sum = this.deckCards.reduce((acc, curr) => acc + (curr.ataque * curr.cantidad), 0);
    return Math.round((sum / this.totalCards) * 10) / 10;
  }

  // Promedio de defensa del mazo
  get averageDefense(): number {
    if (this.totalCards === 0) return 0;
    const sum = this.deckCards.reduce((acc, curr) => acc + (curr.defensa * curr.cantidad), 0);
    return Math.round((sum / this.totalCards) * 10) / 10;
  }

  // Distribución porcentual o cantidades por elemento en el mazo
  get typeDistribution(): { tipo: string; cantidad: number }[] {
    const map: { [key: string]: number } = {};
    
    this.deckCards.forEach(c => {
      map[c.tipo] = (map[c.tipo] || 0) + c.cantidad;
    });

    return Object.keys(map).map(tipo => ({
      tipo,
      cantidad: map[tipo]
    })).sort((a, b) => b.cantidad - a.cantidad);
  }

  // Guardar composición final en Supabase
  async handleSaveDeck() {
    if (!this.deckId) return;

    this.saving = true;
    this.saveSuccess = false;
    this.saveError = '';

    const payload = this.deckCards.map(c => ({
      id: c.id,
      cantidad: c.cantidad
    }));

    try {
      const success = await this.supabaseService.saveDeckCards(this.deckId, payload);
      if (success) {
        this.saveSuccess = true;
        
        // Limpiar el borrador temporal de SQLite Local ya que se ha subido con éxito
        this.localDbService.clearMazoTemporal(this.deckId);
        this.hasLocalDraft = false;
        
        setTimeout(() => this.saveSuccess = false, 3000);
      } else {
        this.saveError = 'No se pudieron guardar los cambios. Intenta de nuevo.';
      }
    } catch (err: any) {
      console.error('[Deck Builder] Error al guardar:', err);
      this.saveError = err.message || 'Error inesperado al guardar.';
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  // Descartar borrador temporal de SQLite Local y restaurar estado remoto desde Supabase
  async discardLocalDraft() {
    if (!this.deckId) return;
    if (confirm('¿Estás seguro de que deseas descartar el borrador temporal guardado en SQLite local y restaurar el mazo desde Supabase?')) {
      this.localDbService.clearMazoTemporal(this.deckId);
      this.hasLocalDraft = false;
      await this.loadInitialData();
      this.cdr.detectChanges();
    }
  }
}
