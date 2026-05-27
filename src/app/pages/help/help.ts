import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from '../../components/navbar/navbar';

interface HelpSection {
  id: string;
  icon: string;
  title: string;
  content: string;
  extra?: { label: string; value: string; class?: string }[];
  open: boolean;
}

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [CommonModule, RouterModule, NavbarComponent],
  templateUrl: './help.html',
  styleUrl: './help.css'
})
export class HelpComponent {
  sections: HelpSection[] = [
    {
      id: 'flow',
      icon: '🎮',
      title: '¿Cómo se juega una partida?',
      open: true,
      content: `Cada partida enfrenta a dos Entrenadores con sus mazos de cartas Pokémon. El objetivo es debilitar todos los Pokémon del rival antes de que él debilite los tuyos.

<strong>Flujo básico:</strong>
<ol>
  <li><strong>Selección Inicial:</strong> Cada Entrenador elige un Pokémon de su mano inicial (5 cartas) para colocarlo como Activo en la arena.</li>
  <li><strong>Fase de Robo:</strong> Al inicio de cada turno robas 1 carta de tu mazo.</li>
  <li><strong>Fase Principal:</strong> Puedes colocar cartas en la Banca (hasta 3 reservas) y usar habilidades especiales.</li>
  <li><strong>Fase de Ataque:</strong> Ataca al Pokémon Activo del rival gastando 1 Energía.</li>
  <li><strong>Fase Final:</strong> Los estados alterados activos aplican su daño/efecto al terminar tu turno.</li>
</ol>
La partida termina cuando un Entrenador no tiene más Pokémon disponibles (Activo + Banca agotados).`
    },
    {
      id: 'energy',
      icon: '⚡',
      title: 'Sistema de Energía',
      open: false,
      content: `La Energía es el recurso principal para realizar acciones en batalla.

<strong>Cómo funciona:</strong>
<ul>
  <li>Al inicio de cada turno ganas <strong>+1 Energía</strong> automáticamente.</li>
  <li>Atacar cuesta <strong>1 Energía</strong>.</li>
  <li>Defender (escudo 50%) cuesta <strong>1 Energía</strong>.</li>
  <li>Usar una Habilidad Especial cuesta <strong>1 Energía</strong>.</li>
  <li>Realizar una <strong>Retirada Táctica</strong> desde la Banca cuesta <strong>1 Energía</strong>.</li>
</ul>
Administra tu energía sabiamente: a veces es mejor defender que atacar.`
    },
    {
      id: 'types',
      icon: '🌀',
      title: 'Tipos Elementales y Ventajas',
      open: false,
      content: `Cada Pokémon tiene un tipo elemental que determina sus fortalezas y debilidades en combate. Un ataque <em>Súper Efectivo</em> añade <strong>+20 de daño adicional</strong>.`,
      extra: [
        { label: '🔥 Fuego', value: 'Super efectivo vs → 🌿 Planta', class: 'type-fire' },
        { label: '🌿 Planta', value: 'Super efectivo vs → 💧 Agua', class: 'type-grass' },
        { label: '💧 Agua',  value: 'Super efectivo vs → 🔥 Fuego', class: 'type-water' },
        { label: '⚡ Eléctrico', value: 'Super efectivo vs → 💧 Agua', class: 'type-electric' },
        { label: '🔮 Psíquico', value: 'Sin ventaja especial actualmente', class: 'type-psychic' },
        { label: '⬜ Normal', value: 'Sin ventaja especial actualmente', class: 'type-normal' },
      ]
    },
    {
      id: 'abilities',
      icon: '✨',
      title: 'Habilidades Especiales por Pokémon',
      open: false,
      content: `Cada Pokémon tiene una habilidad única que puede activarse una vez por turno gastando 1 Energía:`,
      extra: [
        { label: '🦎 Charizard', value: '🔥 Llamarada — 25 daño + aplica QUEMADURA permanente al rival', class: 'ability-item' },
        { label: '⚡ Pikachu',   value: '⚡ Impactrueno — 25 daño + 40% de PARALIZAR al rival', class: 'ability-item' },
        { label: '🌿 Bulbasaur', value: '🌿 Látigo Cepa — 20 daño + ENVENENA al rival', class: 'ability-item' },
        { label: '💧 Squirtle',  value: '💧 Pistola Agua — Cura 30 HP a tu Pokémon activo', class: 'ability-item' },
        { label: '🔮 Mewtwo',    value: '🔮 Tormenta Psíquica — 30 daño + limpia tu propio estado', class: 'ability-item' },
        { label: '🦊 Eevee',     value: '🌀 Adaptación — Carga +2 Energía extra', class: 'ability-item' },
        { label: '🌊 Gyarados',  value: '🌊 Hidrobomba — 35 daño directo', class: 'ability-item' },
        { label: '⬜ Otros',     value: '💥 Poder Oculto — 25 de daño directo genérico', class: 'ability-item' },
      ]
    },
    {
      id: 'status',
      icon: '☠️',
      title: 'Estados Alterados',
      open: false,
      content: `Los estados alterados penalizan al Pokémon afectado hasta que sean curados.`,
      extra: [
        { label: '🤢 Veneno',    value: 'Pierde 15 HP al FINAL de cada uno de tus turnos. Se mantiene hasta curación.', class: 'status-poison' },
        { label: '🥵 Quemadura', value: 'Pierde 15 HP al FINAL de cada turno y su Ataque se reduce en 15 pts.', class: 'status-burn' },
        { label: '⚡ Parálisis', value: '50% de no poder ATACAR ni USAR HABILIDADES. Se cura sola al terminar el turno.', class: 'status-paralysis' },
      ]
    },
    {
      id: 'bench',
      icon: '🪑',
      title: 'Banca de Combate y Retiradas',
      open: false,
      content: `La Banca te permite tener hasta <strong>3 Pokémon de reserva</strong> listos para entrar al combate.

<strong>Mecánicas de Banca:</strong>
<ul>
  <li><strong>Colocar en Banca:</strong> Durante tu turno, desde tu mano puedes enviar un Pokémon a la Banca usando el botón "Banca" en la carta.</li>
  <li><strong>Retirada Táctica:</strong> Puedes intercambiar tu Activo por un Pokémon de la Banca gastando 1 Energía. Esto también <em>limpia cualquier estado alterado</em> del retirado.</li>
  <li><strong>Promoción Forzada:</strong> Si tu Pokémon Activo cae, <em>debes</em> promover uno de la Banca usando el botón "⚔️ Activar".</li>
  <li><strong>IA Táctica:</strong> La CPU también realiza retiradas cuando su Pokémon tiene menos del 25% de HP y tiene un reserva más saludable.</li>
</ul>`
    },
    {
      id: 'decks',
      icon: '🎴',
      title: 'Reglas de Mazo',
      open: false,
      content: `Para participar en batallas necesitas un mazo válido.

<strong>Reglas:</strong>
<ul>
  <li>Un mazo puede tener cartas de tu colección.</li>
  <li>Puedes ajustar las cantidades de cada carta en el Deck Builder.</li>
  <li>Asegúrate de que el mazo tenga al menos <strong>1 carta</strong> para poder iniciar batalla.</li>
  <li>Los mazos con <strong>diversidad de tipos</strong> cubren mejor las debilidades elementales.</li>
  <li>Combina Pokémon con alta defensa para la Banca y alto ataque como Activo.</li>
</ul>

<strong>Consejo Pro:</strong> Incluye al menos un Pokémon curador (Squirtle) o un Pokémon que otorgue energía extra (Eevee) para crear combos devastadores.`
    },
    {
      id: 'pvp',
      icon: '🌐',
      title: 'Partida en Línea (PvP)',
      open: false,
      content: `El modo PvP Online permite batallas en tiempo real contra otros Entrenadores.

<strong>Cómo iniciar una partida PvP:</strong>
<ol>
  <li>Ve al menú <strong>Lobby PvP</strong> desde la barra de navegación.</li>
  <li>Selecciona el mazo con el que quieres jugar.</li>
  <li>Haz clic en <strong>"Crear Sala"</strong> para esperar a un rival, o en <strong>"Unirse"</strong> para entrar a una sala abierta.</li>
  <li>Una vez que ambos jugadores estén listos, la batalla comenzará automáticamente.</li>
</ol>

<strong>Diferencias vs IA:</strong>
<ul>
  <li>Ambos jugadores juegan simultáneamente en tiempo real vía <strong>Supabase Realtime</strong>.</li>
  <li>Los turnos se sincronizan automáticamente — espera tu turno antes de actuar.</li>
  <li>Las victorias PvP dan el doble de XP.</li>
</ul>`
    },
    {
      id: 'rewards',
      icon: '🏆',
      title: 'Progresión, XP y Recompensas',
      open: false,
      content: `Ganar partidas y completar misiones te otorga recompensas para progresar.

<strong>Sistema de XP y Niveles:</strong>
<ul>
  <li>Cada <strong>victoria</strong> otorga XP al perfil del Entrenador.</li>
  <li>Al acumular 100 XP subes de nivel (Novato → Gimnasio → Arena → Liga → Maestro).</li>
</ul>

<strong>Misiones Diarias:</strong>
<ul>
  <li>🌅 Duelo del Día: Completa 1 batalla.</li>
  <li>🥇 ¡Victoria!: Gana 1 batalla.</li>
  <li>✨ Alquimista: Usa habilidades especiales 2 veces.</li>
</ul>

<strong>Logros Permanentes:</strong>
<ul>
  <li>⚔️ Primer Duelo: Completa tu primera batalla.</li>
  <li>🏆 Estratega: Gana 5 batallas en total.</li>
  <li>💥 Aplastando: Inflige un golpe Súper Efectivo.</li>
</ul>

Reclama tus recompensas de monedas en el Dashboard para comprar fundas cosméticas en la Tienda.`
    }
  ];

  toggle(section: HelpSection) {
    section.open = !section.open;
  }
}
