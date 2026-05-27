import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Carta } from '../../services/supabase';

@Component({
  selector: 'app-pokemon-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pokemon-card.html',
  styleUrl: './pokemon-card.css'
})
export class PokemonCardComponent {
  @Input({ required: true }) card!: Carta;

  // Propiedades para almacenar el estado del giro 3D e iluminación holográfica
  rotateX = 0;
  rotateY = 0;
  glareX = 50;
  glareY = 50;
  isHovered = false;

  // Capturar el movimiento del cursor para calcular los ángulos
  onMouseMove(event: MouseEvent) {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    
    // Posición del mouse en porcentaje (0 a 1)
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    
    // Inclinación máxima de 15 grados en ejes
    const maxRotation = 15;
    this.rotateY = (px - 0.5) * maxRotation;   // Inclinación horizontal
    this.rotateX = (0.5 - py) * maxRotation;   // Inclinación vertical
    
    // Coordenadas de brillo glare (0% a 100%)
    this.glareX = px * 100;
    this.glareY = py * 100;
  }

  onMouseEnter() {
    this.isHovered = true;
  }

  onMouseLeave() {
    this.isHovered = false;
    // Retornar suavemente al estado de reposo plano
    this.rotateX = 0;
    this.rotateY = 0;
    this.glareX = 50;
    this.glareY = 50;
  }

  // Retorna la clase de CSS correspondiente al tipo del Pokémon
  getTypeClass(type: string): string {
    const normType = type.toLowerCase();
    if (normType.includes('eléctrico') || normType.includes('electrico')) return 'type-electric';
    if (normType.includes('fuego')) return 'type-fire';
    if (normType.includes('agua')) return 'type-water';
    if (normType.includes('planta')) return 'type-grass';
    if (normType.includes('psíquico') || normType.includes('psiquico')) return 'type-psychic';
    return 'type-normal';
  }

  // Retorna la clase de CSS correspondiente a la rareza de la carta
  getRarityClass(rarity: string): string {
    const r = rarity.toLowerCase();
    if (r.includes('legendaria')) return 'legendary-card';
    if (r.includes('épica') || r.includes('epica')) return 'epic-card';
    if (r.includes('rara')) return 'rare-card';
    return 'common-card';
  }
}
