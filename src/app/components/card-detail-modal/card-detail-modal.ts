import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Carta } from '../../services/supabase';

@Component({
  selector: 'app-card-detail-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './card-detail-modal.html',
  styleUrl: './card-detail-modal.css'
})
export class CardDetailModalComponent {
  @Input({ required: true }) card: Carta | null = null;
  @Output() close = new EventEmitter<void>();

  // Cerrar el modal
  onClose() {
    this.close.emit();
  }

  // Mapeo CSS de colores por tipo de Pokémon
  getTypeClass(type: string): string {
    if (!type) return 'type-normal';
    const normType = type.toLowerCase();
    if (normType.includes('eléctrico') || normType.includes('electrico')) return 'type-electric';
    if (normType.includes('fuego')) return 'type-fire';
    if (normType.includes('agua')) return 'type-water';
    if (normType.includes('planta')) return 'type-grass';
    if (normType.includes('psíquico') || normType.includes('psiquico')) return 'type-psychic';
    return 'type-normal';
  }
}
