import { Component, OnInit, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { SupabaseService, Carta, Mazo } from '../../services/supabase';
import { LocalDbService } from '../../services/local-db';
import { NavbarComponent } from '../../components/navbar/navbar';
import { AudioService } from '../../services/audio';

interface CombatCard extends Carta {
  instanceId: number;
  currentHp: number;
}

type BattleState = 'loading' | 'selecting_active' | 'player_turn' | 'cpu_turn' | 'game_over';

@Component({
  selector: 'app-battle',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent],
  templateUrl: './battle.html',
  styleUrl: './battle.css'
})
export class BattleComponent implements OnInit, OnDestroy {
  deckId: string | null = null;
  matchId: string | null = null;
  mazo: Mazo | null = null;

  // Estados del juego
  state: BattleState = 'loading';
  winner: 'player' | 'cpu' | null = null;
  loadingMessage = 'Inicializando campo de batalla...';
  
  // Bitácora de combate (Battle Log)
  logs: string[] = [];

  // Mazo, mano y activo del Jugador
  playerDeck: CombatCard[] = [];
  playerHand: CombatCard[] = [];
  playerActive: CombatCard | null = null;
  playerEnergy = 0;
  playerBench: CombatCard[] = [];

  // Mazo, mano y activo de la CPU / Rival
  cpuDeck: CombatCard[] = [];
  cpuHand: CombatCard[] = [];
  cpuActive: CombatCard | null = null;
  cpuEnergy = 0;
  cpuBench: CombatCard[] = [];

  // Temporizadores de la IA
  private aiTimeout: any = null;

  // Flags para animaciones de combate
  playerAttacking = false;
  cpuAttacking = false;
  playerDamaged = false;
  cpuDamaged = false;

  // Popups flotantes de daño
  playerDamagePopup = '';
  cpuDamagePopup = '';

  // Flags para animaciones de combate
  showTurnBanner = false;
  turnBannerText = '';
  energyCharged = false;
  cpuEnergyCharged = false;
  
  // Progresión y Recompensas (XP / Level Up)
  initialLevel = 1;
  initialXp = 0;
  showLevelUpSplash = false;

  // Posturas Defensivas (Escudos) y Habilidades Tácticas (IA Rúbrica)
  cpuShieldActive = false;
  playerShieldActive = false;
  cpuAbilityUsedThisTurn = false;
  playerAbilityUsedThisTurn = false;

  // Estados Alterados (Fase 2)
  playerStatus: 'poisoned' | 'burned' | 'paralyzed' | null = null;
  cpuStatus: 'poisoned' | 'burned' | 'paralyzed' | null = null;

  // =========================================================================
  // MULTIPLAYER PvP PROPERTIES
  // =========================================================================
  isPvP = false;
  myRole: 'jugador1' | 'jugador2' = 'jugador1';
  opponentRole: 'jugador1' | 'jugador2' = 'jugador2';
  myId = '';
  opponentId = '';
  opponentUsername = 'Rival';
  realtimeSubscription: any = null;
  profile: any = null;

  constructor(
    public supabaseService: SupabaseService,
    private route: ActivatedRoute,
    private router: Router,
    public audioService: AudioService,
    private ngZone: NgZone,
    private localDbService: LocalDbService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.deckId = this.route.snapshot.paramMap.get('deckId');
    if (!this.deckId) {
      this.router.navigate(['/decks']);
      return;
    }
    
    // Comprobar si es una sala multijugador PvP activa
    const queryMatchId = this.route.snapshot.queryParamMap.get('matchId');
    if (queryMatchId) {
      // Si es PvP, reproducimos la música de combate emocionante de Pokémon
      this.audioService.playBgm('battle-theme.mp3', 0.3);
    } else {
      // Si es una partida vs CPU, detenemos la música de fondo por completo
      // para que solo se escuchen los sutiles efectos de sonido retro
      this.audioService.stopBgm();
    }
    
    await this.initBattle();
    this.cdr.detectChanges();
  }

  ngOnDestroy() {
    if (this.aiTimeout) {
      clearTimeout(this.aiTimeout);
    }
    // Detener música al salir de la arena
    this.audioService.stopBgm();
    // Desvincular suscripción de canal en tiempo real
    if (this.realtimeSubscription) {
      this.supabaseService.supabase.removeChannel(this.realtimeSubscription);
    }
  }

  // Inicializar combate
  async initBattle() {
    this.state = 'loading';
    this.loadingMessage = 'Armando la arena y cargando mazos...';
    this.logs = ['¡Bienvenidos a la Arena de Batalla Pokémon! ⚔️'];

    const currentUser = this.supabaseService.currentUserSignal();
    if (!currentUser) {
      this.router.navigate(['/login']);
      return;
    }

    this.profile = this.supabaseService.userProfileSignal();
    if (!this.profile) {
      this.profile = await this.supabaseService.loadUserProfile(currentUser.id);
    }
    if (this.profile) {
      this.initialLevel = this.profile.nivel || 1;
      this.initialXp = (this.profile.total_xp || 0) % 100;
    }

    // Comprobar si venimos de sala multijugador online PvP
    const queryMatchId = this.route.snapshot.queryParamMap.get('matchId');
    if (queryMatchId) {
      this.matchId = queryMatchId;
      const matchDetails = await this.supabaseService.getMatchDetails(queryMatchId);
      if (matchDetails && matchDetails.modo !== 'vs_ia') {
        this.isPvP = true;
        await this.initOnlineBattle();
        return;
      }
    }

    // ==================== FLUJO INDIVIDUAL VS COMPUTADORA (IA) ====================
    try {
      // 1. Obtener cartas de tu mazo
      const deckData = await this.supabaseService.getDeckWithCards(this.deckId!);
      if (!deckData || deckData.cards.length === 0) {
        alert('Este mazo no tiene cartas. Añade cartas en el Deck Builder primero.');
        this.router.navigate(['/decks']);
        return;
      }
      this.mazo = deckData.mazo;

      // 2. Crear un registro de partida en Supabase y duplicar en SQLite Local
      this.matchId = await this.supabaseService.createMatch(currentUser.id, 'vs_ia');
      if (!this.matchId) {
        throw new Error('No se pudo registrar la partida en el servidor.');
      }
      this.localDbService.saveLocalMatch(this.matchId, this.deckId!, 'vs_ia');

      // 3. Poblar mazo del jugador en base a las cantidades
      let instanceId = 0;
      const pDeck: CombatCard[] = [];
      deckData.cards.forEach(c => {
        for (let i = 0; i < c.cantidad; i++) {
          pDeck.push({
            ...c,
            instanceId: ++instanceId,
            currentHp: c.vida
          });
        }
      });
      this.playerDeck = this.shuffle(pDeck);

      // 4. Poblar mazo de la CPU de forma aleatoria (10 cartas aleatorias del catálogo global)
      const globalCards = await this.supabaseService.getCards();
      if (globalCards.length === 0) {
        throw new Error('Catálogo de cartas vacío en servidor.');
      }
      
      const cDeck: CombatCard[] = [];
      for (let i = 0; i < 10; i++) {
        const randCard = globalCards[Math.floor(Math.random() * globalCards.length)];
        cDeck.push({
          ...randCard,
          instanceId: ++instanceId,
          currentHp: randCard.vida
        });
      }
      this.cpuDeck = this.shuffle(cDeck);

      // 5. Repartir manos iniciales (Hasta 5 cartas de forma segura)
      for (let i = 0; i < 5; i++) {
        if (this.playerDeck.length > 0) this.playerHand.push(this.playerDeck.shift()!);
        if (this.cpuDeck.length > 0) this.cpuHand.push(this.cpuDeck.shift()!);
      }

      this.addLog('Se han barajado los mazos y repartido 3 cartas iniciales.');
      this.addLog('Fase de selección: Elige tu Pokémon Activo inicial desde tu mano.');
      
      this.state = 'selecting_active';
      this.cdr.detectChanges();
    } catch (err) {
      console.error('[Battle Component] Error al iniciar:', err);
      alert('Ocurrió un error al preparar la batalla.');
      this.router.navigate(['/decks']);
    }
  }

  // =========================================================================
  // MULTIPLAYER PvP INITIALIZATION & REALTIME CORE
  // =========================================================================
  async initOnlineBattle() {
    this.state = 'loading';
    this.loadingMessage = 'Estableciendo conexión táctica PvP...';

    const currentUser = this.supabaseService.currentUserSignal();
    if (!currentUser) {
      this.router.navigate(['/login']);
      return;
    }

    this.myId = currentUser.id;

    try {
      if (!this.profile) {
        this.profile = await this.supabaseService.loadUserProfile(currentUser.id);
      }

      if (!this.profile) {
        throw new Error('No se pudo cargar el perfil de usuario.');
      }

      const match = await this.supabaseService.getMatchDetails(this.matchId!);
      if (!match) throw new Error('Sala no encontrada.');

      // Determinar Roles
      if (currentUser.id === match.jugador1_id) {
        this.myRole = 'jugador1';
        this.opponentRole = 'jugador2';
        this.opponentId = match.jugador2_id || '';
      } else {
        this.myRole = 'jugador2';
        this.opponentRole = 'jugador1';
        this.opponentId = match.jugador1_id || '';
      }

      // Cargar cartas de nuestro mazo
      const deckData = await this.supabaseService.getDeckWithCards(this.deckId!);
      if (!deckData || deckData.cards.length === 0) {
        throw new Error('El mazo seleccionado no tiene cartas.');
      }
      this.mazo = deckData.mazo;

      let instanceId = 0;
      const pDeck: CombatCard[] = [];
      deckData.cards.forEach(c => {
        for (let i = 0; i < c.cantidad; i++) {
          pDeck.push({
            ...c,
            instanceId: ++instanceId,
            currentHp: c.vida
          });
        }
      });
      const myShuffledDeck = this.shuffle(pDeck);
      
      // Robar mano inicial (Hasta 5 cartas de forma segura en base al tamaño del mazo)
      const myHand: CombatCard[] = [];
      for (let i = 0; i < 5; i++) {
        if (myShuffledDeck.length > 0) {
          myHand.push(myShuffledDeck.shift()!);
        }
      }

      // Sincronizar nuestro lado en Supabase
      let state = match.estado_juego || {};
      if (!state.logs) {
        state.logs = [];
      }
      state[this.myRole] = {
        id: currentUser.id,
        username: this.profile.username,
        deck: myShuffledDeck,
        hand: myHand,
        active: null,
        energy: 1
      };

      if (this.myRole === 'jugador1') {
        state.turn = match.jugador1_id;
        state.logs.push('⚔️ ¡Arena Multijugador Online iniciada!');
        state.logs.push(`Esperando a que ${match.jugador2?.username || 'oponente'} se conecte...`);
      } else {
        state.logs.push(`¡${this.profile.username} ha cargado sus cartas en el duelo!`);
      }

      // Actualizar estado general en Supabase
      await this.supabaseService.updateMatchGameState(this.matchId!, state);

      // Suscribirse al canal en tiempo real
      this.subscribeMatchRealtime(this.matchId!);

      // Sincronizar localmente
      this.syncPvPState(state);
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error iniciando batalla PvP:', err);
      alert('No se pudo conectar con la partida multijugador.');
      this.router.navigate(['/lobby']);
    }
  }

  // Suscribirse a cambios en tiempo real en partidas
  private subscribeMatchRealtime(matchId: string) {
    this.realtimeSubscription = this.supabaseService.supabase
      .channel(`match-${matchId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'partidas',
        filter: `id=eq.${matchId}`
      }, (payload: any) => {
        this.ngZone.run(() => {
          const updatedMatch = payload.new;
          if (updatedMatch.estado_juego) {
            this.syncPvPState(updatedMatch.estado_juego);
          }
        });
      })
      .subscribe();
  }

  // Sincronizar estado local en base al estado de Supabase
  private syncPvPState(state: any) {
    if (!state) return;

    const currentUser = this.supabaseService.currentUserSignal();
    if (!currentUser) return;

    // Actualizar datos del oponente
    const oppState = state[this.opponentRole];
    if (oppState) {
      this.opponentUsername = oppState.username;
      this.opponentId = oppState.id;
    }

    // Quitar loading si ambos lados ya cargaron cartas
    if (this.state === 'loading' && state.jugador1 && state.jugador2) {
      this.state = 'selecting_active';
    }

    // Sincronizar nuestro lado
    const myState = state[this.myRole];
    if (myState) {
      this.playerDeck = myState.deck || [];
      this.playerHand = myState.hand || [];
      this.playerActive = myState.active || null;
      this.playerEnergy = myState.energy || 0;
      this.playerStatus = myState.status || null;
      this.playerBench = myState.bench || [];
    }

    // Sincronizar oponente
    if (oppState) {
      this.cpuDeck = oppState.deck || [];
      this.cpuHand = oppState.hand || [];
      this.cpuActive = oppState.active || null;
      this.cpuEnergy = oppState.energy || 0;
      this.cpuStatus = oppState.status || null;
      this.cpuBench = oppState.bench || [];
    }

    // Historial logs
    this.logs = state.logs || [];

    // Turnos - Solo si ambos jugadores ya han seleccionado e invocado su Pokémon Activo inicial
    if (state.turn && state.jugador1?.active && state.jugador2?.active) {
      const oldState = this.state;
      if (state.turn === currentUser.id) {
        this.state = 'player_turn';
        if (oldState !== 'player_turn' && oldState !== 'loading' && oldState !== 'selecting_active') {
          this.turnBannerText = '¡TU TURNO!';
          this.showTurnBanner = true;
          this.audioService.playEnergy();
          setTimeout(() => this.showTurnBanner = false, 1500);
        }
      } else {
        this.state = 'cpu_turn';
        if (oldState !== 'cpu_turn' && oldState !== 'loading' && oldState !== 'selecting_active') {
          this.turnBannerText = `TURNO DE ${this.opponentUsername.toUpperCase()}`;
          this.showTurnBanner = true;
          setTimeout(() => this.showTurnBanner = false, 1500);
        }
      }
    } else if (state.jugador1 && state.jugador2) {
      this.state = 'selecting_active';
    }

    // Ganador
    if (state.winnerId) {
      this.winner = state.winnerId === currentUser.id ? 'player' : 'cpu';
      this.state = 'game_over';
    }

    // Auto-scroll
    setTimeout(() => {
      const panel = document.getElementById('battle-logs-panel');
      if (panel) {
        panel.scrollTop = panel.scrollHeight;
      }
    }, 100);
    this.cdr.detectChanges();
  }

  // =========================================================================
  // COMBATE & DUELO
  // =========================================================================

  // Barajar mazo (Fisher-Yates Shuffle)
  private shuffle(array: CombatCard[]): CombatCard[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Invocar Pokémon Activo
  selectActive(card: CombatCard) {
    // Branch para Duelo Online PvP
    if (this.isPvP) {
      const currentUser = this.supabaseService.currentUserSignal();
      if (!currentUser || !this.matchId) return;

      if (this.playerActive && this.playerActive.currentHp > 0) {
        this.addLog(`¡Ya tienes a ${this.playerActive.nombre} en combate!`);
        return;
      }

      this.playerActive = card;
      this.playerHand = this.playerHand.filter(c => c.instanceId !== card.instanceId);
      this.playAudio('energy');
      this.cdr.detectChanges();

      // Sincronizar con Supabase en background
      this.supabaseService.getMatchDetails(this.matchId).then(match => {
        if (!match) return;
        const state = match.estado_juego || {};
        state[this.myRole].active = this.playerActive;
        state[this.myRole].hand = this.playerHand;
        state[this.myRole].deck = this.playerDeck;
        if (!state.logs) state.logs = [];
        state.logs.push(`¡${this.profile.username} ha invocado a ${card.nombre} como Pokémon Activo! ⚡`);
        
        this.supabaseService.updateMatchGameState(this.matchId!, state);
      });
      return;
    }

    // Flujo Singleplayer vs IA
    if (this.state !== 'selecting_active' && this.state !== 'player_turn') return;
    
    if (this.playerActive && this.playerActive.currentHp > 0) {
      this.addLog(`¡Ya tienes a ${this.playerActive.nombre} en combate!`);
      return;
    }

    this.playerActive = card;
    this.playerHand = this.playerHand.filter(c => c.instanceId !== card.instanceId);
    this.addLog(`¡Has invocado a ${card.nombre} como tu Pokémon Activo! ⚡`);

    if (this.state === 'selecting_active') {
      this.state = 'loading';
      this.loadingMessage = 'La CPU está seleccionando su Pokémon...';
      
      this.aiTimeout = setTimeout(() => {
        this.ngZone.run(() => {
          this.cpuSelectActive();
          this.startPlayerTurn();
        });
      }, 1500);
    }
  }

  // Jugar carta de mano a la banca (máximo 3)
  playToBench(card: CombatCard) {
    if (this.state !== 'player_turn' && this.state !== 'selecting_active') return;
    if (this.playerBench.length >= 3) {
      alert('La banca está llena. Máximo 3 Pokémon en reserva.');
      return;
    }

    this.playerHand = this.playerHand.filter(c => c.instanceId !== card.instanceId);
    this.playerBench.push(card);
    this.playAudio('energy');
    this.addLog(`¡Pones a ${card.nombre} en tu Banca de Combate! 📥`);
    this.cdr.detectChanges();

    // Sincronizar PvP
    if (this.isPvP && this.matchId) {
      this.supabaseService.getMatchDetails(this.matchId).then(match => {
        if (!match) return;
        const state = match.estado_juego || {};
        state[this.myRole].hand = this.playerHand;
        state[this.myRole].bench = this.playerBench;
        if (!state.logs) state.logs = [];
        state.logs.push(`¡${this.profile.username} colocó a ${card.nombre} en su banca!`);
        this.supabaseService.updateMatchGameState(this.matchId!, state);
      });
    }
  }

  // Ascender Pokémon de banca a activo (cuando faimtó el principal)
  promoteFromBench(index: number) {
    if (index < 0 || index >= this.playerBench.length) return;
    const card = this.playerBench[index];

    this.playerActive = card;
    this.playerBench.splice(index, 1);
    this.playAudio('energy');
    this.addLog(`¡Asciendes a ${card.nombre} de la banca a Pokémon Activo! ⚔️`);

    if (this.state === 'selecting_active') {
      this.state = 'player_turn';
    }
    this.cdr.detectChanges();

    // Sincronizar PvP
    if (this.isPvP && this.matchId) {
      this.supabaseService.getMatchDetails(this.matchId).then(match => {
        if (!match) return;
        const state = match.estado_juego || {};
        state[this.myRole].active = this.playerActive;
        state[this.myRole].bench = this.playerBench;
        if (!state.logs) state.logs = [];
        state.logs.push(`¡${this.profile.username} ha promovido a ${card.nombre} como Pokémon Activo!`);
        this.supabaseService.updateMatchGameState(this.matchId!, state);
      });
    }
  }

  // Retirada táctica a la banca por costo de 1 energía y limpieza de estados
  retreatActive(benchIndex: number) {
    if (this.state !== 'player_turn' || !this.playerActive) return;
    if (this.playerEnergy < 1) {
      alert('No tienes suficiente energía para realizar una retirada (Costo: 1 Energía).');
      return;
    }
    if (this.playerStatus === 'paralyzed') {
      alert('¡Tu Pokémon está Paralizado y no puede retirarse!');
      return;
    }
    if (benchIndex < 0 || benchIndex >= this.playerBench.length) return;

    const oldActive = this.playerActive;
    const newActive = this.playerBench[benchIndex];

    this.playerEnergy--;
    this.playerStatus = null; // Limpiar veneno/quemadura/paralizado

    this.playerActive = newActive;
    this.playerBench[benchIndex] = oldActive;

    this.playAudio('energy');
    this.addLog(`🔄 ¡Retirada Táctica! Cambias a ${oldActive.nombre} por ${newActive.nombre}. Se limpian sus estados alterados.`);
    this.cdr.detectChanges();

    // Sincronizar PvP
    if (this.isPvP && this.matchId) {
      this.supabaseService.getMatchDetails(this.matchId).then(match => {
        if (!match) return;
        const state = match.estado_juego || {};
        state[this.myRole].active = this.playerActive;
        state[this.myRole].bench = this.playerBench;
        state[this.myRole].energy = this.playerEnergy;
        state[this.myRole].status = null;
        if (!state.logs) state.logs = [];
        state.logs.push(`¡${this.profile.username} retiró a ${oldActive.nombre} por ${newActive.nombre}!`);
        this.supabaseService.updateMatchGameState(this.matchId!, state);
      });
    }
  }

  // La CPU selecciona su Pokémon Activo de la mano (IA Rúbrica: mejores estadísticas disponibles)
  private cpuSelectActive() {
    if (this.cpuHand.length === 0) return;
    
    // IA Rúbrica: Invocar la carta con mejores estadísticas totales disponibles (vida + ataque + defensa)
    const bestCard = [...this.cpuHand].sort((a, b) => {
      const statsA = a.vida + a.ataque + a.defensa;
      const statsB = b.vida + b.ataque + b.defensa;
      return statsB - statsA;
    })[0];
    
    this.cpuActive = bestCard;
    this.cpuHand = this.cpuHand.filter(c => c.instanceId !== bestCard.instanceId);
    
    const sumStats = bestCard.vida + bestCard.ataque + bestCard.defensa;
    this.addLog(`🤖 [IA CPU] Invocación: Invoca a ${bestCard.nombre} por poseer las mejores estadísticas totales disponibles (${sumStats} pts).`);
  }

  // Calcular daño considerando debilidades elementales (+20 daño adicional)
  calculateElementalDamage(attackerType: string, defenderType: string, baseAtk: number, defenderDef: number): { damage: number, extraLog: string } {
    const typeWeakness: { [key: string]: string[] } = {
      'Fuego': ['Agua'],
      'Planta': ['Fuego'],
      'Agua': ['Planta', 'Eléctrico']
    };

    let damage = Math.max(10, baseAtk - Math.floor(defenderDef / 2));
    let extraLog = '';

    // Si el tipo del defensor es débil contra el tipo del atacante, sumar 20 de daño adicional
    if (typeWeakness[defenderType] && typeWeakness[defenderType].includes(attackerType)) {
      damage += 20;
      extraLog = ' ¡Golpe Súper Efectivo! 💥 +20 de daño elemental.';
    }

    return { damage, extraLog };
  }

  // Comprobar si la CPU está en desventaja elemental o de estadísticas contra el jugador
  checkCpuDisadvantage(): boolean {
    if (!this.cpuActive || !this.playerActive) return false;
    
    // 1. Desventaja de HP
    if (this.cpuActive.currentHp < this.playerActive.currentHp) return true;
    
    // 2. Desventaja Elemental
    const typeWeakness: { [key: string]: string[] } = {
      'Fuego': ['Agua'],
      'Planta': ['Fuego'],
      'Agua': ['Planta', 'Eléctrico'],
      'Eléctrico': []
    };
    
    const cpuType = this.cpuActive.tipo;
    const playerType = this.playerActive.tipo;
    if (typeWeakness[cpuType] && typeWeakness[cpuType].includes(playerType)) {
      return true;
    }
    
    return false;
  }

  // Postura Defensiva del Jugador (gasta 1 de energía para mitigar 50% de daño)
  playerDefend() {
    if (this.state !== 'player_turn' || !this.playerActive) return;
    if (this.playerEnergy < 1) {
      alert('No tienes suficiente Energía para adoptar postura de defensa.');
      return;
    }
    
    this.playerEnergy--;
    this.playerShieldActive = true;
    this.playAudio('energy');
    this.addLog(`🛡️ ¡Adoptas postura defensiva con ${this.playerActive.nombre}! El próximo ataque que recibas se reducirá al 50%.`);
  }

  // Activa la habilidad especial del Pokémon activo del jugador
  usePlayerAbility() {
    if (this.state !== 'player_turn' || !this.playerActive) return;
    if (this.playerAbilityUsedThisTurn) {
      alert('Ya has activado una habilidad especial en este turno.');
      return;
    }
    if (this.playerEnergy < 1) {
      alert('Necesitas 1 de Energía para activar la habilidad.');
      return;
    }
    
    // Paralysis check: 50% fail rate
    if (this.playerStatus === 'paralyzed' && Math.random() < 0.5) {
      alert('¡Tu Pokémon está Paralizado y no puede usar habilidades!');
      this.addLog(`⚡ ¡Tu ${this.playerActive.nombre} está Paralizado y no puede usar su habilidad!`);
      if (this.isPvP && this.matchId) {
        this.supabaseService.getMatchDetails(this.matchId).then(async (match) => {
          if (!match) return;
          const state = match.estado_juego || {};
          if (!state.logs) state.logs = [];
          state.logs.push(`⚡ ¡El ${this.playerActive!.nombre} de ${this.profile.username} está paralizado y no puede usar su habilidad!`);
          await this.supabaseService.updateMatchGameState(this.matchId!, state);
        });
      }
      return;
    }

    this.playerEnergy--;
    this.playerAbilityUsedThisTurn = true;
    this.playAudio('energy');
    
    const abilityName = this.playerActive.habilidad || 'Poder Oculto';
    const activeName = this.playerActive.nombre.toLowerCase();
    
    // Logs specific to this activation
    const abilityLogs: string[] = [];
    abilityLogs.push(`✨ ¡${this.profile ? this.profile.username : 'Jugador'} activa la HABILIDAD especial '${abilityName}' de su ${this.playerActive.nombre}!`);

    // Define effects
    let dmg = 0;
    let heal = 0;
    let applyStatus: 'poisoned' | 'burned' | 'paralyzed' | null = null;
    let statusCleanse = false;
    let extraEnergy = 0;
    let shieldActive = false;

    if (activeName === 'charizard' || abilityName.toLowerCase().includes('llamarada')) {
      dmg = 25;
      applyStatus = 'burned';
      abilityLogs.push(`🔥 ¡Llamarada inflige 25 de daño y aplica QUEMADURA 🥵 permanente al oponente!`);
    } else if (activeName === 'pikachu' || abilityName.toLowerCase().includes('impactrueno')) {
      dmg = 25;
      if (Math.random() < 0.4) {
        applyStatus = 'paralyzed';
        abilityLogs.push(`⚡ ¡Impactrueno inflige 25 de daño y PARALIZA ⚡ al oponente!`);
      } else {
        abilityLogs.push(`⚡ ¡Impactrueno inflige 25 de daño! El oponente resistió la parálisis.`);
      }
    } else if (activeName === 'venusaur' || abilityName.toLowerCase().includes('drenadoras')) {
      dmg = 20;
      heal = 20;
      applyStatus = 'poisoned';
      abilityLogs.push(`🍃 ¡Drenadoras absorbe 20 HP y aplica VENENO 🤢 al oponente!`);
    } else if (activeName === 'mewtwo' || abilityName.toLowerCase().includes('onda mental')) {
      dmg = 25;
      applyStatus = 'paralyzed';
      abilityLogs.push(`🔮 ¡Onda Mental inflige 25 de daño y causa PARÁLISIS ⚡ garantizada al oponente!`);
    } else if (activeName === 'eevee' || abilityName.toLowerCase().includes('adaptabilidad')) {
      statusCleanse = true;
      extraEnergy = 1;
      abilityLogs.push(`✨ ¡Adaptabilidad limpia los estados alterados de Eevee y le otorga +1 de Energía!`);
    } else {
      // Fallback
      if (abilityName.toLowerCase().includes('dren') || abilityName.toLowerCase().includes('cur')) {
        heal = 40;
        abilityLogs.push(`💚 La habilidad cura +40 HP a tu ${this.playerActive.nombre}.`);
      } else if (abilityName.toLowerCase().includes('refug') || abilityName.toLowerCase().includes('barrer') || abilityName.toLowerCase().includes('escud')) {
        shieldActive = true;
        abilityLogs.push(`🛡️ Tu Pokémon se oculta en su refugio: Mitiga el 50% del daño en el próximo ataque.`);
      } else {
        dmg = 25;
        abilityLogs.push(`💥 La habilidad inflige +25 HP de daño directo al oponente.`);
      }
    }

    // Apply effects locally first
    if (heal > 0) {
      this.playerActive.currentHp = Math.min(this.playerActive.vida, this.playerActive.currentHp + heal);
    }
    if (shieldActive) {
      this.playerShieldActive = true;
    }
    if (statusCleanse) {
      this.playerStatus = null;
    }
    if (extraEnergy > 0) {
      this.playerEnergy += extraEnergy;
    }
    // Registrar progreso de misiones y logros
    this.supabaseService.incrementQuestOrAchievementProgress('misiones', 'usar_habilidad', 1);
    if (applyStatus === 'paralyzed') {
      this.supabaseService.incrementQuestOrAchievementProgress('logros', 'paralizador', 1);
    }
    if (applyStatus === 'burned') {
      this.supabaseService.incrementQuestOrAchievementProgress('logros', 'incendio', 1);
    }

    // Add immediate logs to local screen
    abilityLogs.forEach(l => this.addLog(l));

    // Handle offensive effects against CPU/opponent
    if (dmg > 0 || applyStatus) {
      if (!this.cpuActive) {
        this.addLog('No hay Pokémon rival activo para recibir el efecto.');
        return;
      }

      if (dmg > 0) {
        this.cpuActive.currentHp = Math.max(0, this.cpuActive.currentHp - dmg);
        this.cpuDamaged = true;
        this.cpuDamagePopup = `-${dmg}`;
        this.playAudio('damage');
        setTimeout(() => {
          this.cpuDamaged = false;
          this.cpuDamagePopup = '';
        }, 1000);
      }

      if (applyStatus) {
        this.cpuStatus = applyStatus;
      }
    }

    // PvP Online Branch
    if (this.isPvP && this.matchId) {
      const currentUser = this.supabaseService.currentUserSignal();
      this.supabaseService.getMatchDetails(this.matchId).then(async (match) => {
        if (!match) return;
        const state = match.estado_juego || {};
        if (!state.logs) state.logs = [];

        // Update player side in state
        state[this.myRole].energy = this.playerEnergy;
        state[this.myRole].active = this.playerActive;
        state[this.myRole].status = this.playerStatus;

        // Update opponent side in state
        const isFainted = this.cpuActive && this.cpuActive.currentHp <= 0;
        if (isFainted) {
          state[this.opponentRole].active = null;
          state[this.opponentRole].status = null;
          this.playAudio('faint');
          abilityLogs.push(`💀 ¡El ${this.cpuActive!.nombre} de oponente ha sido debilitado!`);
        } else {
          state[this.opponentRole].active = this.cpuActive;
          state[this.opponentRole].status = this.cpuStatus;
        }

        // Add logs
        state.logs.push(...abilityLogs);

        if (isFainted) {
          const faintedCard = this.cpuActive;
          setTimeout(async () => {
            this.ngZone.run(async () => {
              if (this.cpuActive === faintedCard) {
                this.cpuActive = null;
                this.cdr.detectChanges();
              }
              state[this.opponentRole].active = null;
              state[this.opponentRole].status = null;

              const oppState = state[this.opponentRole];
              if (oppState.hand.length === 0 && oppState.deck.length === 0) {
                state.winnerId = currentUser!.id;
                state.logs.push(`🏆 ¡${this.profile.username} ha ganado la batalla online!`);
                await this.supabaseService.updateMatchGameState(this.matchId!, state);
                await this.endGame('player');
              } else {
                await this.supabaseService.updateMatchGameState(this.matchId!, state);
              }
            });
          }, 1400);
        } else {
          await this.supabaseService.updateMatchGameState(this.matchId!, state);
        }
      });
      return;
    }

    // vs CPU Branch
    const isFainted = this.cpuActive && this.cpuActive.currentHp <= 0;
    if (isFainted) {
      this.playAudio('faint');
      this.addLog(`💀 ¡El ${this.cpuActive!.nombre} de la CPU ha sido debilitado!`);
      const faintedCard = this.cpuActive;
      setTimeout(async () => {
        this.ngZone.run(async () => {
          if (this.cpuActive === faintedCard) {
            this.cpuActive = null;
            this.cdr.detectChanges();
          }
          if (this.cpuBench.length > 0) {
            const nextActive = this.cpuBench.shift()!;
            this.cpuActive = nextActive;
            this.addLog(`🤖 [IA CPU] Promoción: Asciende a ${nextActive.nombre} de su banca a Pokémon Activo.`);
            this.cdr.detectChanges();
          } else if (this.cpuHand.length === 0 && this.cpuDeck.length === 0) {
            await this.endGame('player');
          } else {
            this.addLog('La CPU debe invocar a un nuevo Pokémon en su turno.');
            this.cpuSelectActive();
          }
        });
      }, 1400);
    }
  }

  // Iniciar turno del jugador
  startPlayerTurn() {
    this.state = 'player_turn';
    this.playerEnergy++; // Ganar 1 de energía
    this.playerAbilityUsedThisTurn = false; // Resetear habilidad por turno
    
    this.energyCharged = true;
    setTimeout(() => {
      this.ngZone.run(() => {
        this.energyCharged = false;
        this.cdr.detectChanges();
      });
    }, 1200);

    this.turnBannerText = '¡TU TURNO!';
    this.showTurnBanner = true;
    setTimeout(() => {
      this.ngZone.run(() => {
        this.showTurnBanner = false;
        this.cdr.detectChanges();
      });
    }, 1500);

    this.addLog('=== Tu Turno ===');
    
    if (this.playerDeck.length > 0) {
      const drawn = this.playerDeck.shift()!;
      this.playerHand.push(drawn);
      this.addLog(`Robas una carta: ${drawn.nombre}.`);
    } else {
      this.addLog('No te quedan cartas en el mazo.');
    }
    
    this.addLog(`Obtienes +1 de Energía. Energía disponible: ${this.playerEnergy}.`);

    if (!this.playerActive && this.playerHand.length > 0) {
      this.addLog('¡Atención! Invoca un Pokémon de tu mano para poder combatir.');
    }
    this.cdr.detectChanges();
  }

  // Finalizar turno del jugador
  endPlayerTurn() {
    if (!this.playerActive) {
      alert('Debes invocar un Pokémon Activo a la arena antes de finalizar tu turno.');
      return;
    }

    const endLogs: string[] = [];
    let isFainted = false;

    // 1. Resolver daño de estado pasivo (Veneno / Quemadura)
    if (this.playerActive && (this.playerStatus === 'poisoned' || this.playerStatus === 'burned')) {
      const dmg = 15;
      this.playerActive.currentHp = Math.max(0, this.playerActive.currentHp - dmg);
      const statusIcon = this.playerStatus === 'poisoned' ? '🤢 [VENENO]' : '🥵 [QUEMADURA]';
      endLogs.push(`${statusIcon} ¡Tu ${this.playerActive.nombre} sufre 15 HP de daño de estado al terminar tu turno!`);
      
      this.playerDamaged = true;
      this.playerDamagePopup = `-${dmg}`;
      this.playAudio('damage');
      
      setTimeout(() => {
        this.playerDamaged = false;
        this.playerDamagePopup = '';
      }, 1000);

      if (this.playerActive.currentHp <= 0) {
        isFainted = true;
      }
    }

    // 2. Limpiar parálisis
    if (this.playerStatus === 'paralyzed') {
      this.playerStatus = null;
      endLogs.push(`⚡ [PARÁLISIS] Tu ${this.playerActive.nombre} se recupera de la parálisis al finalizar el turno.`);
    }

    // Log locally
    endLogs.forEach(l => this.addLog(l));

    // PvP Online Branch
    if (this.isPvP && this.matchId) {
      // Optimistic update: cambiar el estado del UI inmediatamente
      this.state = 'cpu_turn';
      this.turnBannerText = `TURNO DE ${this.opponentUsername.toUpperCase()}`;
      this.showTurnBanner = true;
      this.addLog(`=== Turno de ${this.opponentUsername} ===`);
      this.cdr.detectChanges();

      setTimeout(() => {
        this.ngZone.run(() => {
          this.showTurnBanner = false;
          this.cdr.detectChanges();
        });
      }, 1500);

      // Sincronizar con Supabase en background
      this.supabaseService.getMatchDetails(this.matchId!).then(async (match) => {
        if (!match) return;
        const state = match.estado_juego || {};
        state.turn = this.opponentId;
        
        // Cargar energía y dar carta al rival
        if (state[this.opponentRole]) {
          state[this.opponentRole].energy = (state[this.opponentRole].energy || 0) + 1;
          if (state[this.opponentRole].deck && state[this.opponentRole].deck.length > 0) {
            const drawn = state[this.opponentRole].deck.shift();
            state[this.opponentRole].hand = state[this.opponentRole].hand || [];
            state[this.opponentRole].hand.push(drawn);
          }
        }

        // Sincronizar mi estado y logs
        state[this.myRole].energy = this.playerEnergy;
        state[this.myRole].status = this.playerStatus;

        if (isFainted) {
          state[this.myRole].active = null;
          state.logs.push(`💀 ¡El ${this.playerActive!.nombre} de ${this.profile.username} ha sido debilitado por el daño de estado!`);
        } else {
          state[this.myRole].active = this.playerActive;
        }

        if (!state.logs) state.logs = [];
        state.logs.push(...endLogs);
        state.logs.push(`=== Turno de ${this.opponentUsername} ===`);

        if (isFainted) {
          const faintedCard = this.playerActive;
          this.playAudio('faint');
          setTimeout(async () => {
            this.ngZone.run(async () => {
              if (this.playerActive === faintedCard) {
                this.playerActive = null;
                this.cdr.detectChanges();
              }
              
              const myState = state[this.myRole];
              if (myState.hand.length === 0 && myState.deck.length === 0) {
                state.winnerId = this.opponentId;
                state.logs.push(`🏆 ¡${this.opponentUsername} ha ganado la batalla online!`);
                await this.supabaseService.updateMatchGameState(this.matchId!, state);
                await this.endGame('cpu');
              } else {
                await this.supabaseService.updateMatchGameState(this.matchId!, state);
              }
            });
          }, 1400);
        } else {
          await this.supabaseService.updateMatchGameState(this.matchId!, state);
        }
      });
      return;
    }

    // vs CPU Branch
    if (isFainted) {
      this.state = 'cpu_turn';
      this.playAudio('faint');
      this.addLog(`💀 ¡Tu ${this.playerActive.nombre} ha sido debilitado por el daño de estado!`);
      const faintedCard = this.playerActive;

      setTimeout(async () => {
        this.ngZone.run(async () => {
          if (this.playerActive === faintedCard) {
            this.playerActive = null;
            this.cdr.detectChanges();
          }
          if (this.playerHand.length === 0 && this.playerDeck.length === 0) {
            await this.endGame('cpu');
          } else {
            this.addLog('Debes seleccionar un nuevo Pokémon Activo de tu mano al comenzar tu turno.');
            // Empezar el turno de la CPU
            this.state = 'cpu_turn';
            this.addLog('=== Turno de la CPU ===');
            this.runCpuAiLogic();
          }
        });
      }, 1400);
      return;
    }

    // Normal vs CPU Turn transition
    this.state = 'cpu_turn';
    this.turnBannerText = 'TURNO DEL RIVAL';
    this.showTurnBanner = true;
    setTimeout(() => {
      this.ngZone.run(() => {
        this.showTurnBanner = false;
        this.cdr.detectChanges();
      });
    }, 1500);

    this.addLog('=== Turno de la CPU ===');
    
    this.aiTimeout = setTimeout(() => {
      this.ngZone.run(() => {
        this.runCpuAiLogic();
        this.cdr.detectChanges();
      });
    }, 1500);
    this.cdr.detectChanges();
  }

  // Jugador Ataca
  async playerAttack() {
    // PvP Online Branch
    if (this.isPvP) {
      const currentUser = this.supabaseService.currentUserSignal();
      if (!currentUser || !this.matchId || !this.playerActive || !this.cpuActive) return;

      if (this.playerEnergy < 1) {
        alert('No tienes suficiente Energía para realizar un ataque.');
        return;
      }

      // 1. Comprobar Parálisis (50% de probabilidad de quedar inmóvil)
      if (this.playerStatus === 'paralyzed' && Math.random() < 0.5) {
        alert('¡Tu Pokémon está Paralizado y no se puede mover!');
        this.addLog(`⚡ ¡Tu ${this.playerActive.nombre} está Paralizado y no puede atacar!`);
        
        // Sincronizar en Supabase para registrar el log de parálisis
        this.supabaseService.getMatchDetails(this.matchId!).then(async (match) => {
          if (!match) return;
          const state = match.estado_juego || {};
          state.logs.push(`⚡ ¡El ${this.playerActive!.nombre} de ${this.profile.username} está paralizado y pierde su ataque!`);
          await this.supabaseService.updateMatchGameState(this.matchId!, state);
        });
        return;
      }

      this.playerEnergy--; // Deduct energy
      this.playerAttacking = true;
      this.playAudio('attack');

      // 2. Calcular daño considerando Quemadura (-15 ATK) y Debilidad Elemental (+20 daño)
      let baseAtk = this.playerActive.ataque;
      if (this.playerStatus === 'burned') {
        baseAtk = Math.max(10, baseAtk - 15);
      }
      const { damage, extraLog } = this.calculateElementalDamage(this.playerActive.tipo, this.cpuActive.tipo, baseAtk, this.cpuActive.defensa);

      if (extraLog) {
        this.supabaseService.incrementQuestOrAchievementProgress('logros', 'super_efectivo', 1);
      }

      setTimeout(() => {
        this.cpuActive!.currentHp = Math.max(0, this.cpuActive!.currentHp - damage);
        this.cpuDamaged = true;
        this.cpuDamagePopup = `-${damage}`;
        this.playAudio('damage');

        setTimeout(() => {
          this.cpuDamaged = false;
          this.cpuDamagePopup = '';
        }, 1000);
      }, 350);

      setTimeout(() => {
        this.playerAttacking = false;

        // Comprobar si rival fue debilitado
        const isFainted = this.cpuActive!.currentHp <= 0;
        if (isFainted) {
          this.playAudio('faint');
        }

        // Obtener estado completo, actualizar logs y guardar en Supabase
        this.supabaseService.getMatchDetails(this.matchId!).then(async (match) => {
          if (!match) return;
          const state = match.estado_juego || {};
          state[this.myRole].energy = this.playerEnergy;
          state.logs.push(`¡${this.profile.username} ataca con ${this.playerActive!.nombre} e inflige ${damage} de daño!${extraLog}`);
          
          if (isFainted) {
            state.logs.push(`💀 ¡El Pokémon activo de ${this.opponentUsername} ha sido debilitado!`);
          }

          if (isFainted) {
            const faintedCard = this.cpuActive;
            setTimeout(async () => {
              this.ngZone.run(async () => {
                if (this.cpuActive === faintedCard) {
                  this.cpuActive = null;
                  this.cdr.detectChanges();
                }
                state[this.opponentRole].active = null;

                const oppState = state[this.opponentRole];
                if (oppState.hand.length === 0 && oppState.deck.length === 0) {
                  state.winnerId = currentUser.id;
                  state.logs.push(`🏆 ¡${this.profile.username} ha ganado la batalla online!`);
                  await this.supabaseService.updateMatchGameState(this.matchId!, state);
                  await this.endGame('player');
                } else {
                  await this.supabaseService.updateMatchGameState(this.matchId!, state);
                }
              });
            }, 1400);
          } else {
            state[this.opponentRole].active = this.cpuActive;
            await this.supabaseService.updateMatchGameState(this.matchId!, state);
          }
        });
      }, 600);
      return;
    }

    // Lógica Singleplayer vs IA
    if (this.state !== 'player_turn' || !this.playerActive || !this.cpuActive) return;

    if (this.playerEnergy < 1) {
      alert('No tienes suficiente Energía para realizar un ataque.');
      return;
    }

    // 1. Comprobar Parálisis (50% de probabilidad de quedar inmóvil)
    if (this.playerStatus === 'paralyzed' && Math.random() < 0.5) {
      alert('¡Tu Pokémon está Paralizado y no se puede mover!');
      this.addLog(`⚡ ¡Tu ${this.playerActive.nombre} está Paralizado y no puede atacar!`);
      return;
    }

    this.playerEnergy--;
    this.playerAttacking = true;
    this.playAudio('attack');
    
    // 2. Calcular daño considerando Quemadura (-15 ATK) y Debilidad Elemental (+20 daño)
    let baseAtk = this.playerActive.ataque;
    if (this.playerStatus === 'burned') {
      baseAtk = Math.max(10, baseAtk - 15);
    }
    
    let { damage, extraLog } = this.calculateElementalDamage(this.playerActive.tipo, this.cpuActive.tipo, baseAtk, this.cpuActive.defensa);

    if (extraLog) {
      this.supabaseService.incrementQuestOrAchievementProgress('logros', 'super_efectivo', 1);
    }
    
    // Mitigación de escudo
    if (this.cpuShieldActive) {
      damage = Math.floor(damage / 2);
      this.cpuShieldActive = false;
      this.addLog(`🛡️ [IA CPU] ¡El ataque es mitigado al 50% por la postura de DEFENSA activa de la CPU!`);
    }
    
    this.addLog(`¡Tu ${this.playerActive.nombre} ataca a ${this.cpuActive.nombre}!${extraLog}`);

    setTimeout(() => {
      this.cpuActive!.currentHp = Math.max(0, this.cpuActive!.currentHp - damage);
      this.cpuDamaged = true;
      this.cpuDamagePopup = `-${damage}`;
      
      this.playAudio('damage');
      this.addLog(`¡${this.playerActive!.nombre} inflige ${damage} de daño a ${this.cpuActive!.nombre}!${extraLog}`);

      setTimeout(() => {
        this.cpuDamaged = false;
        this.cpuDamagePopup = '';
      }, 1000);
    }, 350);

    setTimeout(async () => {
      this.playerAttacking = false;
      
      if (this.cpuActive!.currentHp <= 0) {
        this.playAudio('faint');
        this.addLog(`💀 ¡El ${this.cpuActive!.nombre} de la CPU ha sido debilitado!`);
        
        const faintedCard = this.cpuActive;
        setTimeout(async () => {
          this.ngZone.run(async () => {
            if (this.cpuActive === faintedCard) {
              this.cpuActive = null;
              this.cdr.detectChanges();
            }
            if (this.cpuBench.length > 0) {
              const nextActive = this.cpuBench.shift()!;
              this.cpuActive = nextActive;
              this.addLog(`🤖 [IA CPU] Promoción: Asciende a ${nextActive.nombre} de su banca a Pokémon Activo.`);
              this.cdr.detectChanges();
            } else if (this.cpuHand.length === 0 && this.cpuDeck.length === 0) {
              await this.endGame('player');
            } else {
              this.addLog('La CPU debe invocar a un nuevo Pokémon en su turno.');
              // La CPU elige e invoca inmediatamente un nuevo Pokémon activo de su mano
              this.cpuSelectActive();
            }
          });
        }, 1400);
      }
    }, 600);
  }

  // =========================================================================
  // INTELIGENCIA ARTIFICIAL (CPU AI LOGIC)
  // =========================================================================
  private runCpuAiLogic() {
    if (this.state !== 'cpu_turn') return;

    this.cpuEnergy++;
    this.cpuEnergyCharged = true;
    this.cpuAbilityUsedThisTurn = false;
    setTimeout(() => {
      this.ngZone.run(() => {
        this.cpuEnergyCharged = false;
        this.cdr.detectChanges();
      });
    }, 1200);
    
    if (this.cpuDeck.length > 0) {
      const drawn = this.cpuDeck.shift()!;
      this.cpuHand.push(drawn);
      this.addLog('La CPU roba una carta.');
    }

    if (!this.cpuActive) {
      if (this.cpuHand.length > 0) {
        this.cpuSelectActive();
      } else {
        this.endGame('player');
        this.cdr.detectChanges();
        return;
      }
    }

    // Bajar cartas a la banca de la CPU
    while (this.cpuHand.length > 0 && this.cpuBench.length < 3) {
      const benchedCard = this.cpuHand.shift()!;
      this.cpuBench.push(benchedCard);
      this.addLog(`🤖 [IA CPU] Banca: Envía a ${benchedCard.nombre} a la reserva de la banca.`);
    }
    this.cdr.detectChanges();

    this.aiTimeout = setTimeout(async () => {
      if (!this.cpuActive || !this.playerActive) {
        this.endCpuTurn();
        this.cdr.detectChanges();
        return;
      }

      // 1. Comprobar Parálisis (50% de probabilidad de perder el turno)
      if (this.cpuStatus === 'paralyzed' && Math.random() < 0.5) {
        this.addLog(`⚡ ¡El ${this.cpuActive.nombre} de la CPU está Paralizado y no puede moverse en este turno!`);
        this.endCpuTurn();
        this.cdr.detectChanges();
        return;
      }

      // 2. Retirada táctica de CPU por HP bajo (< 25%) si hay banca y tiene 1 Energía
      const cpuHpPercent = (this.cpuActive.currentHp / this.cpuActive.vida) * 100;
      if (cpuHpPercent < 25 && this.cpuEnergy >= 1 && this.cpuBench.length > 0) {
        let bestBenchIdx = 0;
        let maxHp = 0;
        this.cpuBench.forEach((c, idx) => {
          if (c.currentHp > maxHp) {
            maxHp = c.currentHp;
            bestBenchIdx = idx;
          }
        });

        if (this.cpuBench[bestBenchIdx].currentHp > this.cpuActive.currentHp) {
          const oldActive = this.cpuActive;
          const newActive = this.cpuBench[bestBenchIdx];

          this.cpuEnergy--;
          this.cpuStatus = null; // Limpiar estados del retirado
          this.cpuActive = newActive;
          this.cpuBench[bestBenchIdx] = oldActive;

          this.playAudio('energy');
          this.addLog(`🔄 🤖 [IA CPU] Retirada: Retira a ${oldActive.nombre} (HP bajo: ${oldActive.currentHp}/${oldActive.vida}) por ${newActive.nombre} de su banca.`);
          this.cdr.detectChanges();
        }
      }

      // IA RÚBRICA - REGLA 2: Defender cuando tenga pocos puntos de vida (HP < 35%)
      const cpuHpPctDefend = (this.cpuActive.currentHp / this.cpuActive.vida) * 100;
      if (cpuHpPctDefend < 35 && this.cpuEnergy >= 1) {
        this.cpuEnergy--;
        this.cpuShieldActive = true;
        this.playAudio('energy');
        this.addLog(`🛡️ 🤖 [IA CPU] Defensa: ¡${this.cpuActive.nombre} tiene pocos puntos de vida (${this.cpuActive.currentHp}/${this.cpuActive.vida} HP)! Adopta postura defensiva (recibe 50% menos daño en el próximo ataque).`);
        this.endCpuTurn();
        this.cdr.detectChanges();
        return;
      }

      // IA RÚBRICA - REGLA 3: Usar habilidades cuando tenga desventaja
      const disadvantaged = this.checkCpuDisadvantage();
      if (disadvantaged && this.cpuEnergy >= 1 && !this.cpuAbilityUsedThisTurn) {
        this.cpuEnergy--;
        this.cpuAbilityUsedThisTurn = true;
        this.playAudio('energy');
        
        const abilityName = this.cpuActive.habilidad || 'Poder Oculto';
        this.addLog(`✨ 🤖 [IA CPU] Desventaja: ¡Detecta desventaja de combate! Activa la HABILIDAD especial '${abilityName}' de ${this.cpuActive.nombre}.`);
        
        const cpuName = this.cpuActive.nombre.toLowerCase();
        let dmg = 0;
        let heal = 0;
        let applyStatus: 'poisoned' | 'burned' | 'paralyzed' | null = null;
        let statusCleanse = false;
        let extraEnergy = 0;
        let shieldActive = false;

        if (cpuName === 'charizard' || abilityName.toLowerCase().includes('llamarada')) {
          dmg = 25;
          applyStatus = 'burned';
          this.addLog(`🔥 🤖 [IA CPU] ¡Charizard descarga su Llamarada: inflige 25 de daño y aplica QUEMADURA 🥵 permanente!`);
        } else if (cpuName === 'pikachu' || abilityName.toLowerCase().includes('impactrueno')) {
          dmg = 25;
          if (Math.random() < 0.4) {
            applyStatus = 'paralyzed';
            this.addLog(`⚡ 🤖 [IA CPU] ¡Pikachu lanza Impactrueno: inflige 25 de daño y causa PARÁLISIS ⚡!`);
          } else {
            this.addLog(`⚡ 🤖 [IA CPU] ¡Pikachu lanza Impactrueno: inflige 25 de daño!`);
          }
        } else if (cpuName === 'venusaur' || abilityName.toLowerCase().includes('drenadoras')) {
          dmg = 20;
          heal = 20;
          applyStatus = 'poisoned';
          this.addLog(`🍃 🤖 [IA CPU] ¡Venusaur planta Drenadoras: absorbe 20 HP y aplica VENENO 🤢!`);
        } else if (cpuName === 'mewtwo' || abilityName.toLowerCase().includes('onda mental')) {
          dmg = 25;
          applyStatus = 'paralyzed';
          this.addLog(`🔮 🤖 [IA CPU] ¡Mewtwo proyecta Onda Mental: inflige 25 de daño y garantiza PARÁLISIS ⚡!`);
        } else if (cpuName === 'eevee' || abilityName.toLowerCase().includes('adaptabilidad')) {
          statusCleanse = true;
          extraEnergy = 1;
          this.addLog(`✨ 🤖 [IA CPU] ¡Eevee activa Adaptabilidad: se limpia de estados y gana +1 energía!`);
        } else {
          // Fallback
          if (abilityName.toLowerCase().includes('dren') || abilityName.toLowerCase().includes('cur')) {
            heal = 40;
            this.addLog(`💚 🤖 [IA CPU] ¡La habilidad cura +40 HP a ${this.cpuActive.nombre}!`);
          } else if (abilityName.toLowerCase().includes('refug') || abilityName.toLowerCase().includes('barrer') || abilityName.toLowerCase().includes('escud')) {
            shieldActive = true;
            this.addLog(`🛡️ 🤖 [IA CPU] ¡La habilidad de protección reduce 50% de daño en el próximo turno!`);
          } else {
            dmg = 25;
            this.addLog(`💥 🤖 [IA CPU] ¡La habilidad inflige 25 de daño directo!`);
          }
        }

        // Aplicar efectos
        if (heal > 0) {
          this.cpuActive.currentHp = Math.min(this.cpuActive.vida, this.cpuActive.currentHp + heal);
        }
        if (shieldActive) {
          this.cpuShieldActive = true;
        }
        if (statusCleanse) {
          this.cpuStatus = null;
        }
        if (extraEnergy > 0) {
          this.cpuEnergy += extraEnergy;
        }

        if (dmg > 0 || applyStatus) {
          if (dmg > 0) {
            this.playerActive.currentHp = Math.max(0, this.playerActive.currentHp - dmg);
            this.playerDamaged = true;
            this.playerDamagePopup = `-${dmg}`;
            this.playAudio('damage');
            
            setTimeout(() => {
              this.playerDamaged = false;
              this.playerDamagePopup = '';
              this.cdr.detectChanges();
            }, 1000);
          }

          if (applyStatus) {
            this.playerStatus = applyStatus;
          }

          if (this.playerActive.currentHp <= 0) {
            this.playAudio('faint');
            this.addLog(`💀 ¡Tu ${this.playerActive!.nombre} ha sido debilitado por la habilidad especial de la CPU!`);
            
            const faintedCard = this.playerActive;
            setTimeout(async () => {
              this.ngZone.run(async () => {
                if (this.playerActive === faintedCard) {
                  this.playerActive = null;
                  this.cdr.detectChanges();
                }
                if (this.playerHand.length === 0 && this.playerDeck.length === 0) {
                  await this.endGame('cpu');
                } else {
                  this.addLog('Debes seleccionar un nuevo Pokémon Activo de tu mano al comenzar tu turno.');
                }
              });
            }, 1400);

            this.endCpuTurn();
            this.cdr.detectChanges();
            return;
          }
        }
      }

      // IA RÚBRICA - REGLA 1 y 4: Atacar con la carta de mayor ataque
      if (this.cpuEnergy >= 1) {
        this.cpuEnergy--;
        
        this.cpuAttacking = true;
        this.playAudio('attack');

        let atk = this.cpuActive.ataque;
        // Aplicar penalidad de quemado
        if (this.cpuStatus === 'burned') {
          atk = Math.max(10, atk - 15);
        }
        
        const def = this.playerActive.defensa;
        let { damage, extraLog } = this.calculateElementalDamage(this.cpuActive.tipo, this.playerActive.tipo, atk, def);

        // Aplicar mitigación si el jugador está defendiendo
        if (this.playerShieldActive) {
          damage = Math.floor(damage / 2);
          this.playerShieldActive = false;
          this.addLog(`🛡️ ¡Mitigas el golpe de la CPU al 50% debido a tu postura defensiva!`);
        }

        this.addLog(`🤖 [IA CPU] Ataque: Ataca agresivamente con ${this.cpuActive.nombre} (Poder de Ataque: ${atk} pts).${extraLog}`);

        setTimeout(() => {
          this.playerActive!.currentHp = Math.max(0, this.playerActive!.currentHp - damage);
          this.playerDamaged = true;
          this.playerDamagePopup = `-${damage}`;
          
          this.playAudio('damage');
          this.addLog(`¡${this.cpuActive!.nombre} de la CPU inflige ${damage} de daño a tu ${this.playerActive!.nombre}!${extraLog}`);

          setTimeout(() => {
            this.playerDamaged = false;
            this.playerDamagePopup = '';
            this.cdr.detectChanges();
          }, 1000);
          this.cdr.detectChanges();
        }, 350);

        setTimeout(async () => {
          this.cpuAttacking = false;

          if (this.playerActive!.currentHp <= 0) {
            this.playAudio('faint');
            this.addLog(`💀 ¡Tu ${this.playerActive!.nombre} ha sido debilitado!`);
            
            const faintedCard = this.playerActive;
            setTimeout(async () => {
              this.ngZone.run(async () => {
                if (this.playerActive === faintedCard) {
                  this.playerActive = null;
                  this.cdr.detectChanges();
                }
                if (this.playerHand.length === 0 && this.playerDeck.length === 0) {
                  await this.endGame('cpu');
                } else {
                  this.addLog('Debes seleccionar un nuevo Pokémon Activo de tu mano al comenzar tu turno.');
                }
              });
            }, 1400);
          } else {
            this.endCpuTurn();
          }
          this.cdr.detectChanges();
        }, 600);

      } else {
        this.endCpuTurn();
        this.cdr.detectChanges();
      }
    }, 1200);
  }

  private endCpuTurn() {
    const endLogs: string[] = [];
    let isFainted = false;

    // 1. Resolver daño de estado pasivo para CPU
    if (this.cpuActive && (this.cpuStatus === 'poisoned' || this.cpuStatus === 'burned')) {
      const dmg = 15;
      this.cpuActive.currentHp = Math.max(0, this.cpuActive.currentHp - dmg);
      const statusIcon = this.cpuStatus === 'poisoned' ? '🤢 [VENENO]' : '🥵 [QUEMADURA]';
      endLogs.push(`${statusIcon} ¡El ${this.cpuActive.nombre} de la CPU sufre 15 HP de daño de estado al terminar su turno!`);
      
      this.cpuDamaged = true;
      this.cpuDamagePopup = `-${dmg}`;
      this.playAudio('damage');
      
      setTimeout(() => {
        this.cpuDamaged = false;
        this.cpuDamagePopup = '';
      }, 1000);

      if (this.cpuActive.currentHp <= 0) {
        isFainted = true;
      }
    }

    // 2. Limpiar parálisis
    if (this.cpuStatus === 'paralyzed') {
      this.cpuStatus = null;
      endLogs.push(`⚡ [PARÁLISIS] El ${this.cpuActive!.nombre} de la CPU se recupera de la parálisis al finalizar el turno.`);
    }

    // Log locally
    endLogs.forEach(l => this.addLog(l));

    if (isFainted) {
      this.playAudio('faint');
      this.addLog(`💀 ¡El ${this.cpuActive!.nombre} de la CPU ha sido debilitado por el daño de estado!`);
      const faintedCard = this.cpuActive;
      
      setTimeout(async () => {
        this.ngZone.run(async () => {
          if (this.cpuActive === faintedCard) {
            this.cpuActive = null;
            this.cdr.detectChanges();
          }
          if (this.cpuHand.length === 0 && this.cpuDeck.length === 0) {
            await this.endGame('player');
          } else {
            this.cpuSelectActive();
            // Iniciar turno del jugador
            this.startPlayerTurn();
          }
        });
      }, 1400);
      return;
    }

    // Normal transition to player turn
    this.aiTimeout = setTimeout(() => {
      this.ngZone.run(() => {
        this.startPlayerTurn();
        this.cdr.detectChanges();
      });
    }, 1000);
    this.cdr.detectChanges();
  }

  // =========================================================================
  // PERSISTENCIA Y FIN DEL JUEGO
  // =========================================================================
  async endGame(gameWinner: 'player' | 'cpu') {
    if (this.aiTimeout) clearTimeout(this.aiTimeout);
    
    this.playAudio(gameWinner === 'player' ? 'victory' : 'defeat');
    
    this.state = 'loading';
    this.loadingMessage = 'Guardando resultado en el servidor de Supabase...';
    
    this.winner = gameWinner;

    const currentUser = this.supabaseService.currentUserSignal();
    if (!currentUser || !this.matchId) {
      this.state = 'game_over';
      return;
    }

    try {
      const ganadorId = gameWinner === 'player' ? currentUser.id : null;
      
      const success = await this.supabaseService.finishMatch(this.matchId, ganadorId);
      if (success) {
        this.addLog(`[Servidor] Combate finalizado. Estadísticas de victorias y derrotas actualizadas.`);
        
        // Registrar progreso de misiones y logros
        this.supabaseService.incrementQuestOrAchievementProgress('misiones', 'completar_duelo', 1);
        this.supabaseService.incrementQuestOrAchievementProgress('logros', 'primer_duelo', 1);
        if (gameWinner === 'player') {
          this.supabaseService.incrementQuestOrAchievementProgress('misiones', 'ganar_duelo', 1);
          this.supabaseService.incrementQuestOrAchievementProgress('logros', 'estratega', 1);
        }

        // Registrar en SQLite Local si es contra la computadora (vs_ia)
        if (!this.isPvP) {
          const resultado = gameWinner === 'player' ? 'victoria' : 'derrota';
          this.localDbService.finishLocalMatch(this.matchId, resultado);
        }

        const newProfile = this.supabaseService.userProfileSignal();
        if (newProfile) {
          const newLevel = newProfile.nivel || 1;
          if (newLevel > this.initialLevel) {
            this.showLevelUpSplash = true;
          }
        }
      }
    } catch (err) {
      console.error('[Battle Component] Error al reportar fin de juego:', err);
    } finally {
      this.state = 'game_over';
    }
  }

  // Permitir al jugador rendirse y abandonar la partida
  async confirmSurrender() {
    const confirmAbandon = confirm('¿Estás seguro de que quieres rendirte? Esto contará como una derrota.');
    if (!confirmAbandon) return;

    if (this.isPvP) {
      const currentUser = this.supabaseService.currentUserSignal();
      if (!currentUser || !this.matchId) return;

      this.supabaseService.getMatchDetails(this.matchId).then(async (match) => {
        if (!match) return;
        const state = match.estado_juego || {};
        state.winnerId = this.opponentId;
        if (!state.logs) state.logs = [];
        state.logs.push(`🏳️ ¡${this.profile.username} se ha rendido abandonando el combate!`);
        
        await this.supabaseService.updateMatchGameState(this.matchId!, state);
        await this.endGame('cpu');
      });
    } else {
      await this.endGame('cpu');
    }
  }

  // Bitácora helper
  addLog(message: string) {
    this.logs.push(message);
    setTimeout(() => {
      const panel = document.getElementById('battle-logs-panel');
      if (panel) {
        panel.scrollTop = panel.scrollHeight;
      }
    }, 100);
    this.cdr.detectChanges();
  }

  getHpBarColor(current: number, max: number): string {
    const pct = (current / max) * 100;
    if (pct > 50) return 'bar-green';
    if (pct > 20) return 'bar-yellow';
    return 'bar-red';
  }

  playAudio(sfxName: string) {
    switch (sfxName) {
      case 'attack':
        this.audioService.playAttack();
        break;
      case 'damage':
        this.audioService.playDamage();
        break;
      case 'victory':
        this.audioService.playVictory();
        break;
      case 'defeat':
        this.audioService.playDefeat();
        break;
      case 'energy':
        this.audioService.playEnergy();
        break;
      case 'faint':
        this.audioService.playFaint();
        break;
    }
  }

  getPlayerRankTitle(level: number): string {
    if (level === 1) return 'Entrenador Novato ⛺';
    if (level === 2) return 'Luchador de Gimnasio 🛡️';
    if (level === 3) return 'Líder de la Arena ⚔️';
    if (level === 4) return 'Campeón de la Liga 🏆';
    return 'Maestro Pokémon 🌌';
  }
}
