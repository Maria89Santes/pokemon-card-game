import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SupabaseService, Carta } from '../../services/supabase';
import { AudioService } from '../../services/audio';
import { NavbarComponent } from '../../components/navbar/navbar';

interface FlippedCard extends Carta {
  flipped: boolean;
}

@Component({
  selector: 'app-shop',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent],
  templateUrl: './shop.html',
  styleUrl: './shop.css'
})
export class ShopComponent implements OnInit {
  // Lista de sobres disponibles en la tienda
  packs = [
    {
      id: 'planta',
      name: 'Sobre Elemental Planta 🍃',
      desc: 'Enfocado en robustez y absorción de vida. Alta probabilidad de cartas tipo Planta.',
      cost: 80,
      badge: 'Básico',
      bgGradient: 'linear-gradient(135deg, #1b5e20, #4caf50)',
      accentColor: '#00e676'
    },
    {
      id: 'fuego',
      name: 'Sobre Elemental Fuego 🔥',
      desc: 'Desata llamaradas feroces para quemar y mermar defensas. Alta probabilidad de cartas tipo Fuego.',
      cost: 80,
      badge: 'Básico',
      bgGradient: 'linear-gradient(135deg, #b71c1c, #f44336)',
      accentColor: '#ff1744'
    },
    {
      id: 'agua',
      name: 'Sobre Elemental Agua 🌊',
      desc: 'Estrategia defensiva y chorros a alta presión. Alta probabilidad de cartas tipo Agua.',
      cost: 80,
      badge: 'Básico',
      bgGradient: 'linear-gradient(135deg, #0d47a1, #2196f3)',
      accentColor: '#00b0ff'
    },
    {
      id: 'trueno',
      name: 'Sobre Elemental Trueno ⚡',
      desc: 'Impactos eléctricos de alta velocidad y aturdimiento. Alta probabilidad de cartas tipo Eléctrico.',
      cost: 80,
      badge: 'Básico',
      bgGradient: 'linear-gradient(135deg, #f57f17, #ffeb3b)',
      accentColor: '#ffd600'
    },
    {
      id: 'legends',
      name: 'Sobre Leyendas Pokémon 🌌',
      desc: '¡El sobre supremo! Garantiza 1 carta Rara/Épica o superior y la mayor tasa de Legendarias (Charizard, Mewtwo, Dragonite).',
      cost: 150,
      badge: 'Premium',
      bgGradient: 'linear-gradient(135deg, #4a148c, #8e24aa, #d500f9)',
      accentColor: '#d500f9'
    }
  ];

  // Estados del flujo
  state: 'shop' | 'ripping' | 'revealing' = 'shop';
  selectedPack: any = null;
  openedCards: FlippedCard[] = [];
  buying = false;
  packRipped = false;

  // Control de pestañas en la tienda
  activeTab: 'packs' | 'sleeves' = 'packs';

  // Catálogo de reversos / fundas de cartas a la venta
  sleeves = [
    {
      id: 'default',
      name: 'Funda Clásica TCG 🔵',
      desc: 'El reverso de cartas clásico con tecnología cyberpunk azul neón.',
      cost: 0,
      badge: 'Inicial',
      bgClass: 'default',
      accentColor: '#00b0ff'
    },
    {
      id: 'electric',
      name: 'Funda Eléctrica ⚡',
      desc: 'Siente los voltios fluir con un circuito relampagueante amarillo neón.',
      cost: 120,
      badge: 'Rara',
      bgClass: 'electric',
      accentColor: '#ffd600'
    },
    {
      id: 'fire',
      name: 'Funda Ígnea 🔥',
      desc: 'Un manto de llamas y plasma ardiente de color rojo neón.',
      cost: 120,
      badge: 'Rara',
      bgClass: 'fire',
      accentColor: '#ff1744'
    },
    {
      id: 'water',
      name: 'Funda Acuática 🌊',
      desc: 'Sumérgete en la corriente de la arena con olas de color azul cian neón.',
      cost: 120,
      badge: 'Rara',
      bgClass: 'water',
      accentColor: '#00e5ff'
    },
    {
      id: 'astral',
      name: 'Funda Astral 🌌',
      desc: 'Constelaciones y nebulosas holográficas del vacío cósmico púrpura.',
      cost: 200,
      badge: 'Épica',
      bgClass: 'astral',
      accentColor: '#d500f9'
    },
    {
      id: 'gold',
      name: 'Funda Campeón Dorado 🏆',
      desc: 'Oro cepillado y texturas metálicas para el maestro supremo de la arena.',
      cost: 300,
      badge: 'Leyenda',
      bgClass: 'gold',
      accentColor: '#ffa000'
    }
  ];

  // Comprar reverso de cartas
  async buySleeve(sleeve: any) {
    const profile = this.profile;
    if (!profile) return;

    if ((profile.monedas || 0) < sleeve.cost) {
      alert('¡Monedas Insuficientes! 🪙 Completa misiones diarias y combate en la arena para ganar más monedas.');
      this.audioService.playClick();
      return;
    }

    this.buying = true;
    this.audioService.playClick();

    try {
      const success = await this.supabaseService.buyCosmetic(sleeve.id, sleeve.cost);
      if (success) {
        // Reproducir sonido retro premium de monedas / energía
        this.audioService.playEnergy();
      } else {
        alert('Ocurrió un error al adquirir la funda. Intenta de nuevo.');
      }
    } catch (err) {
      console.error('[Shop Component] Error en buySleeve:', err);
      alert('Error de conexión.');
    } finally {
      this.buying = false;
      this.cdr.detectChanges();
    }
  }

  // Equipar reverso de cartas
  async equipSleeve(sleeve: any) {
    this.audioService.playClick();
    this.buying = true;

    try {
      const success = await this.supabaseService.equipCosmetic(sleeve.id);
      if (success) {
        this.audioService.playEnergy();
      } else {
        alert('Ocurrió un error al equipar la funda.');
      }
    } catch (err) {
      console.error('[Shop Component] Error en equipSleeve:', err);
    } finally {
      this.buying = false;
      this.cdr.detectChanges();
    }
  }

  // Comprobar posesión
  hasSleeve(sleeveId: string): boolean {
    const profile = this.profile;
    if (!profile || !profile.cosmeticos) return sleeveId === 'default';
    return profile.cosmeticos.includes(sleeveId);
  }

  // Comprobar equipación
  isSleeveEquipped(sleeveId: string): boolean {
    const profile = this.profile;
    if (!profile) return sleeveId === 'default';
    return (profile.reverso_equipado || 'default') === sleeveId;
  }

  constructor(
    public supabaseService: SupabaseService,
    private audioService: AudioService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    // Forzar recarga del perfil para asegurar balance de monedas al día
    await this.supabaseService.forceReloadProfile();
    this.cdr.detectChanges();
  }

  get profile() {
    return this.supabaseService.userProfileSignal();
  }

  // Comprar booster pack
  async buyPack(pack: any) {
    const profile = this.profile;
    if (!profile) return;

    if ((profile.monedas || 0) < pack.cost) {
      alert('¡Monedas Insuficientes! 🪙 Completa misiones diarias y combate contra la IA para acumular riquezas.');
      this.audioService.playClick();
      return;
    }

    this.buying = true;
    this.audioService.playClick();
    this.selectedPack = pack;

    try {
      const cards = await this.supabaseService.buyBoosterPack(pack.id, pack.cost);
      if (cards && cards.length === 5) {
        this.openedCards = cards.map(c => ({ ...c, flipped: false }));
        this.packRipped = false;
        this.state = 'ripping';
        this.audioService.playClick();
      } else {
        alert('Ocurrió un error al procesar la compra en el servidor. Intenta de nuevo.');
      }
    } catch (err) {
      console.error('[Shop Component] Error en buyPack:', err);
      alert('Error de conexión. Intenta de nuevo.');
    } finally {
      this.buying = false;
      this.cdr.detectChanges();
    }
  }

  // Animación de rasgar sobre
  ripPack() {
    if (this.packRipped) return;
    this.packRipped = true;
    
    // Reproducir sonido retro impactante (fainted) para simular el rasgado
    this.audioService.playFaint();
    
    setTimeout(() => {
      this.state = 'revealing';
      this.cdr.detectChanges();
    }, 1200);
  }

  // Voltear carta individualmente
  flipCard(index: number) {
    const card = this.openedCards[index];
    if (card.flipped) return;

    card.flipped = true;
    
    // SFX de revelado
    this.audioService.playEnergy();

    // Si es legendaria o épica, reproducimos un SFX extra para denotar un pull increíble
    if (card.rareza === 'Legendaria' || card.rareza === 'Épica') {
      setTimeout(() => {
        this.audioService.playFaint(); // Sonido épico secundario
      }, 250);
    }
    
    this.cdr.detectChanges();
  }

  // Voltear todas las cartas de una vez
  flipAll() {
    this.openedCards.forEach((c, idx) => {
      setTimeout(() => {
        this.flipCard(idx);
      }, idx * 200);
    });
  }

  // Saber si todas las cartas han sido ya volteadas
  get allFlipped(): boolean {
    return this.openedCards.length > 0 && this.openedCards.every(c => c.flipped);
  }

  // Volver a la vitrina de la tienda
  resetShop() {
    this.state = 'shop';
    this.selectedPack = null;
    this.openedCards = [];
    this.packRipped = false;
    this.cdr.detectChanges();
  }
}
