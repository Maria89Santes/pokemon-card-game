import { Component, OnInit, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { SupabaseService, Mazo } from '../../services/supabase';
import { NavbarComponent } from '../../components/navbar/navbar';

@Component({
  selector: 'app-decks',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent],
  templateUrl: './decks.html',
  styleUrl: './decks.css'
})
export class DecksComponent implements OnInit {
  decks: Mazo[] = [];
  loading = true;

  // Modal para la creación
  showCreateModal = false;
  newDeckName = '';
  creatingDeck = false;

  constructor(
    public supabaseService: SupabaseService,
    private router: Router,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.loadDecks();
    this.cdr.detectChanges();
  }

  get user() {
    return this.supabaseService.currentUserSignal();
  }

  // Cargar todos los mazos del jugador
  async loadDecks() {
    this.loading = true;
    const currentUser = this.user;
    if (currentUser) {
      try {
        const fetchedDecks = await this.supabaseService.getDecks(currentUser.id);
        this.ngZone.run(() => {
          this.decks = fetchedDecks;
          this.loading = false;
        });
      } catch (err) {
        console.error('[Decks Component] Error al cargar mazos:', err);
        this.ngZone.run(() => {
          this.loading = false;
        });
      }
    } else {
      this.loading = false;
    }
  }

  openCreateModal() {
    this.newDeckName = '';
    this.showCreateModal = true;
  }

  closeCreateModal() {
    this.showCreateModal = false;
  }

  // Crear un mazo nuevo y redirigir de inmediato al Deck Builder
  async handleCreateDeck() {
    if (!this.newDeckName.trim()) return;

    const currentUser = this.user;
    if (!currentUser) return;

    this.creatingDeck = true;
    try {
      const newDeck = await this.supabaseService.createDeck(currentUser.id, this.newDeckName.trim());
      if (newDeck) {
        this.closeCreateModal();
        this.router.navigate(['/decks/build', newDeck.id]);
      }
    } catch (err) {
      console.error('[Decks Component] Error al crear mazo:', err);
    } finally {
      this.creatingDeck = false;
      this.cdr.detectChanges();
    }
  }

  // Redirigir a la batalla vs CPU
  startBattle(deckId: string, event: Event) {
    event.stopPropagation(); // Evitar click en la tarjeta de enrutamiento
    this.router.navigate(['/battle', deckId]);
  }

  // Borrar mazo con advertencia previa
  async handleDeleteDeck(deckId: string, event: Event) {
    event.stopPropagation(); // Evitar click en la tarjeta de enrutamiento

    const confirmDelete = confirm('¿Estás seguro de que deseas eliminar este mazo de batalla? Esta acción no se puede deshacer.');
    if (!confirmDelete) return;

    try {
      const success = await this.supabaseService.deleteDeck(deckId);
      if (success) {
        this.decks = this.decks.filter(d => d.id !== deckId);
      }
    } catch (err) {
      console.error('[Decks Component] Error eliminando mazo:', err);
    } finally {
      this.cdr.detectChanges();
    }
  }
}
