import { Injectable, signal, NgZone } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export interface MisionItem {
  id: string;
  titulo: string;
  desc: string;
  progreso: number;
  objetivo: number;
  recompensa: number;
  completado: boolean;
  reclamado: boolean;
}

export interface LogroItem {
  titulo: string;
  desc: string;
  progreso: number;
  objetivo: number;
  recompensa: number;
  completado: boolean;
  reclamado: boolean;
}

export interface UsuarioPerfil {
  id: string;
  username: string;
  email: string;
  avatar_url: string;
  victorias: number;
  derrotas: number;
  created_at: string;
  total_xp?: number;
  nivel?: number;
  monedas?: number;
  misiones?: MisionItem[];
  logros?: { [key: string]: LogroItem };
  fecha_misiones?: string;
  reverso_equipado?: string;
  cosmeticos?: string[];
}

export interface Carta {
  id: string;
  nombre: string;
  imagen: string;
  tipo: string;
  ataque: number;
  defensa: number;
  vida: number;
  habilidad: string;
  rareza: string;
  descripcion: string;
  created_at: string;
}

export interface Mazo {
  id: string;
  usuario_id: string;
  nombre: string;
  created_at: string;
  total_cartas?: number; // Calculado en la consulta
}

export interface MazoCartaRelacion {
  mazo_id: string;
  carta_id: string;
  cantidad: number;
  cartas?: Carta;
}

// Helper para envolver cualquier promesa en un timeout y evitar cuelgues indefinidos
async function withTimeout(promise: any, timeoutMs: number = 8000, errorMsg: string = 'Timeout superado'): Promise<any> {
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMsg));
    }, timeoutMs);
  });
  
  try {
    // Asegurar que el Thenable de Supabase se ejecute correctamente envolviéndolo en una promesa real
    const realPromise = (async () => await promise)();
    return await Promise.race([realPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  supabase: SupabaseClient;
  
  // Signals reactivas para propagar el estado de autenticación de forma instantánea
  currentUserSignal = signal<User | null>(null);
  userProfileSignal = signal<UsuarioPerfil | null>(null);
  isInitialized = signal(false);

  // Lock para evitar cargas duplicadas del perfil (debounce)
  private _profileLoading = false;
  private _lastProfileUserId: string | null = null;

  constructor(private ngZone: NgZone) {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseKey
    );

    // Escuchar eventos globales de autenticación de Supabase (Única fuente de verdad)
    this.supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[Supabase Auth] Evento: ${event}`);
      try {
        if (session?.user) {
          this.ngZone.run(() => {
            this.currentUserSignal.set(session.user);
          });
          // Evitar cargas duplicadas: si ya estamos cargando o ya tenemos el perfil de este usuario, saltar
          if (!this._profileLoading && this._lastProfileUserId !== session.user.id) {
            await this.loadUserProfile(session.user.id);
          } else if (this._lastProfileUserId === session.user.id && this.userProfileSignal()) {
            console.log('[Supabase Auth] Perfil ya cargado para este usuario, saltando recarga.');
          }
        } else {
          this.ngZone.run(() => {
            this.currentUserSignal.set(null);
            this.userProfileSignal.set(null);
          });
          this._lastProfileUserId = null;
        }
      } catch (err) {
        console.error('[Supabase Service] Error en onAuthStateChange:', err);
      } finally {
        this.ngZone.run(() => {
          this.isInitialized.set(true);
        });
      }
    });
  }

  // Permite a los guards esperar a la inicialización asíncrona con un timeout de seguridad
  async waitForInitialization(): Promise<void> {
    if (this.isInitialized()) {
      return;
    }

    return new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (this.isInitialized()) {
          clearInterval(check);
          resolve();
        }
      }, 50);

      // Límite de 2.5 segundos para evitar colgar la interfaz ante problemas de red
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 2500);
    });
  }

  // Cargar perfil del jugador calculando su XP total de su historial de forma dinámica
  async loadUserProfile(userId: string): Promise<UsuarioPerfil | null> {
    // Lock para evitar cargas simultáneas
    if (this._profileLoading) {
      console.log('[Supabase Service] Carga de perfil ya en progreso, saltando...');
      return this.userProfileSignal();
    }
    this._profileLoading = true;

    try {
      // 1. Obtener datos de la tabla pública con timeout generoso
      let { data: profile, error: profileError } = await withTimeout(
        this.supabase
          .from('usuarios')
          .select('*')
          .eq('id', userId)
          .single(),
        15000,
        'Timeout cargando perfil público'
      );

      if (profileError) {
        // Si no existe la fila del perfil (código PGRST116), la insertamos proactivamente
        if (profileError.code === 'PGRST116') {
          console.warn('[Supabase Service] Perfil público no encontrado. Creando proactivamente...');
          const currentUser = this.currentUserSignal();
          const email = currentUser?.email || '';
          const defaultUsername = email.split('@')[0] || 'Entrenador';
          
          const { data: newProfile, error: insertError } = await withTimeout(
            this.supabase
              .from('usuarios')
              .insert({
                id: userId,
                username: defaultUsername,
                email: email,
                victorias: 0,
                derrotas: 0
              })
              .select()
              .single(),
            15000,
            'Timeout creando perfil proactivo'
          );

          if (insertError) {
            console.error('[Supabase Service] Error al crear perfil proactivo:', insertError);
            throw insertError;
          }
          profile = newProfile;
        } else {
          throw profileError;
        }
      }

      // Fallback local robusto en caso de que profile siga siendo nulo
      if (!profile) {
        profile = {
          id: userId,
          username: this.currentUserSignal()?.email?.split('@')[0] || 'Entrenador',
          email: this.currentUserSignal()?.email || '',
          avatar_url: '',
          victorias: 0,
          derrotas: 0,
          created_at: new Date().toISOString()
        };
      }

      // Otorgar kit de inicio si es un jugador nuevo o tiene la colección vacía
      await this.checkAndGrantStarterKit(userId);

      // 2. Obtener historial para sumar XP acumulada con timeout de 15 segundos
      const { data: history, error: historyError } = await withTimeout(
        this.supabase
          .from('historial')
          .select('xp_ganada')
          .eq('usuario_id', userId),
        15000,
        'Timeout cargando historial del jugador'
      );

      if (historyError) throw historyError;

      const totalXp = history?.reduce((acc: any, curr: any) => acc + curr.xp_ganada, 0) || 0;
      const nivel = Math.floor(totalXp / 100) + 1; // 100 XP por nivel

      // Reset diario de misiones si la fecha de hoy cambió
      const hoy = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      if (profile && profile.fecha_misiones !== hoy) {
        console.log('[Supabase Service] Reset diario de misiones detectado. Restableciendo...');
        const resetMisiones = [
          {id: 'completar_duelo', titulo: 'Duelo del Día 🌅', desc: 'Completa una batalla vs IA.', progreso: 0, objetivo: 1, recompensa: 30, completado: false, reclamado: false},
          {id: 'ganar_duelo', titulo: '¡Victoria! 🥇', desc: 'Gana una batalla vs IA o PvP.', progreso: 0, objetivo: 1, recompensa: 50, completado: false, reclamado: false},
          {id: 'usar_habilidad', titulo: 'Alquimista de Habilidades ✨', desc: 'Usa una habilidad especial en batalla 2 veces.', progreso: 0, objetivo: 2, recompensa: 40, completado: false, reclamado: false}
        ];
        
        // Actualizar en Supabase
        this.supabase
          .from('usuarios')
          .update({
            misiones: resetMisiones,
            fecha_misiones: hoy
          })
          .eq('id', userId)
          .then(({ error }) => {
            if (error) console.error('[Supabase Service] Error al restablecer misiones:', error);
          });
          
        profile.misiones = resetMisiones;
        profile.fecha_misiones = hoy;
      }

      const fullProfile: UsuarioPerfil = {
        ...profile,
        total_xp: totalXp,
        nivel: nivel
      };

      // Actualizar la señal reactiva dentro de la zona de Angular
      this._lastProfileUserId = userId;
      this.ngZone.run(() => {
        this.userProfileSignal.set(fullProfile);
      });
      return fullProfile;
    } catch (err) {
      console.error('[Supabase Service] Error cargando perfil:', err);

      // Fallback local de salvaguarda definitiva para que la UI nunca se quede en negro si falla toda comunicación
      const email = this.currentUserSignal()?.email || '';
      const fallback: UsuarioPerfil = {
        id: userId,
        username: email.split('@')[0] || 'Entrenador',
        email: email,
        avatar_url: '',
        victorias: 0,
        derrotas: 0,
        created_at: new Date().toISOString(),
        total_xp: 0,
        nivel: 1
      };
      this.ngZone.run(() => {
        this.userProfileSignal.set(fallback);
      });
      return fallback;
    } finally {
      this._profileLoading = false;
    }
  }

  // Forzar recarga del perfil desde Supabase (útil al volver de una batalla)
  async forceReloadProfile(): Promise<UsuarioPerfil | null> {
    const user = this.currentUserSignal();
    if (!user) return null;
    // Resetear cache para forzar recarga real
    this._lastProfileUserId = null;
    this._profileLoading = false;
    return this.loadUserProfile(user.id);
  }

  // Registro: envía credenciales y pasa username en metadatos para el trigger
  async signUp(email: string, password: string, username: string) {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username
        }
      }
    });
    if (error) throw error;
    return data;
  }

  // Inicio de sesión convencional
  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return data;
  }

  // Cierre de sesión y limpieza de señales reactivas
  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
    this.ngZone.run(() => {
      this.currentUserSignal.set(null);
      this.userProfileSignal.set(null);
    });
  }

  // Obtener la colección de cartas registradas en base de datos con timeout
  async getCards(): Promise<Carta[]> {
    try {
      const { data, error } = await withTimeout(
        this.supabase
          .from('cartas')
          .select('*')
          .order('nombre', { ascending: true }),
        8000,
        'Timeout cargando catálogo de cartas'
      );

      if (error) {
        console.error('[Supabase Service] Error obteniendo cartas:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('[Supabase Service] Catch en getCards:', err);
      return [];
    }
  }

  // Obtener la colección de cartas del usuario (id_carta -> cantidad)
  async getUserCollection(userId: string): Promise<{ [cartaId: string]: number }> {
    try {
      const { data, error } = await withTimeout(
        this.supabase
          .from('usuario_cartas')
          .select('carta_id, cantidad')
          .eq('usuario_id', userId),
        8000,
        'Timeout cargando colección de usuario'
      );

      if (error) {
        console.error('[Supabase Service] Error obteniendo colección:', error);
        return {};
      }

      const map: { [cartaId: string]: number } = {};
      (data || []).forEach((row: any) => {
        map[row.carta_id] = row.cantidad;
      });
      return map;
    } catch (err) {
      console.error('[Supabase Service] Catch en getUserCollection:', err);
      return {};
    }
  }

  // Verificar y otorgar kit de inicio si la colección del usuario está vacía (otorga 4 copias de todas las cartas por defecto)
  async checkAndGrantStarterKit(userId: string): Promise<void> {
    try {
      const collection = await this.getUserCollection(userId);
      if (Object.keys(collection).length > 0) {
        return; // ya tiene cartas
      }

      console.log('[Supabase Service] Colección vacía. Otorgando todas las cartas del catálogo (4 copias de c/u)...');
      const cards = await this.getCards();
      if (cards.length === 0) return;

      const inserts = cards.map(c => ({
        usuario_id: userId,
        carta_id: c.id,
        cantidad: 4
      }));

      if (inserts.length > 0) {
        const { error } = await withTimeout(
          this.supabase
            .from('usuario_cartas')
            .insert(inserts),
          15000,
          'Timeout insertando kit de inicio completo'
        );

        if (error) {
          console.error('[Supabase Service] Error al otorgar kit de inicio completo:', error);
        } else {
          console.log('[Supabase Service] ¡Kit de inicio con todas las cartas otorgado con éxito!');
        }
      }
    } catch (err) {
      console.error('[Supabase Service] Catch en checkAndGrantStarterKit:', err);
    }
  }

  // Comprar y abrir un sobre de cartas
  async buyBoosterPack(packType: string, cost: number): Promise<Carta[] | null> {
    const profile = this.userProfileSignal();
    const currentUser = this.currentUserSignal();
    if (!profile || !currentUser) {
      console.error('[Supabase Service] No hay sesión activa para comprar.');
      return null;
    }

    const currentCoins = profile.monedas || 0;
    if (currentCoins < cost) {
      console.error('[Supabase Service] Monedas insuficientes.');
      return null;
    }

    try {
      const allCards = await this.getCards();
      if (allCards.length === 0) return null;

      const openedCards: Carta[] = [];

      for (let i = 0; i < 5; i++) {
        let isGuaranteedRare = (packType === 'legends' && i === 0);

        const weightedPool = allCards.map(card => {
          let weight = 10;

          if (packType === 'legends') {
            if (card.rareza === 'Común') weight = isGuaranteedRare ? 0 : 50;
            else if (card.rareza === 'Rara') weight = 30;
            else if (card.rareza === 'Épica') weight = 15;
            else if (card.rareza === 'Legendaria') weight = 5;
          } else {
            if (card.rareza === 'Común') weight = 70;
            else if (card.rareza === 'Rara') weight = 20;
            else if (card.rareza === 'Épica') weight = 8;
            else if (card.rareza === 'Legendaria') weight = 2;
          }

          const cTipo = card.tipo.toLowerCase();
          if (packType === 'planta' && cTipo === 'planta') weight *= 6;
          else if (packType === 'fuego' && cTipo === 'fuego') weight *= 6;
          else if (packType === 'agua' && cTipo === 'agua') weight *= 6;
          else if (packType === 'trueno' && cTipo === 'eléctrico') weight *= 6;

          return { card, weight };
        });

        const validPool = weightedPool.filter(item => item.weight > 0);
        if (validPool.length === 0) {
          openedCards.push(allCards[Math.floor(Math.random() * allCards.length)]);
          continue;
        }

        const totalWeight = validPool.reduce((acc, curr) => acc + curr.weight, 0);
        let randomVal = Math.random() * totalWeight;
        let selected: Carta | null = null;

        for (const item of validPool) {
          randomVal -= item.weight;
          if (randomVal <= 0) {
            selected = item.card;
            break;
          }
        }

        openedCards.push(selected || validPool[0].card);
      }

      const nuevasMonedas = currentCoins - cost;
      const { error: coinsError } = await this.supabase
        .from('usuarios')
        .update({ monedas: nuevasMonedas })
        .eq('id', currentUser.id);

      if (coinsError) throw coinsError;

      const collection = await this.getUserCollection(currentUser.id);
      
      const counts: { [cardId: string]: number } = {};
      openedCards.forEach(c => {
        counts[c.id] = (counts[c.id] || 0) + 1;
      });

      const upsertPayload = Object.keys(counts).map(cardId => {
        const currentQty = collection[cardId] || 0;
        return {
          usuario_id: currentUser.id,
          carta_id: cardId,
          cantidad: currentQty + counts[cardId]
        };
      });

      if (upsertPayload.length > 0) {
        const { error: upsertError } = await this.supabase
          .from('usuario_cartas')
          .upsert(upsertPayload);

        if (upsertError) throw upsertError;
      }

      await this.forceReloadProfile();
      return openedCards;
    } catch (err) {
      console.error('[Supabase Service] Error al comprar sobre:', err);
      return null;
    }
  }

  // Comprar un cosmético (reverso de cartas) gastando monedas
  async buyCosmetic(cosmeticId: string, cost: number): Promise<boolean> {
    const profile = this.userProfileSignal();
    const currentUser = this.currentUserSignal();
    if (!profile || !currentUser) {
      console.error('[Supabase Service] No hay sesión activa para comprar cosméticos.');
      return false;
    }

    const currentCoins = profile.monedas || 0;
    if (currentCoins < cost) {
      console.error('[Supabase Service] Monedas insuficientes.');
      return false;
    }

    try {
      const currentCosmetics = profile.cosmeticos ? [...profile.cosmeticos] : ['default'];
      if (currentCosmetics.includes(cosmeticId)) {
        console.warn('[Supabase Service] El cosmético ya está desbloqueado.');
        return false;
      }

      currentCosmetics.push(cosmeticId);
      const nuevasMonedas = currentCoins - cost;

      const { error } = await this.supabase
        .from('usuarios')
        .update({
          monedas: nuevasMonedas,
          cosmeticos: currentCosmetics
        })
        .eq('id', currentUser.id);

      if (error) throw error;

      await this.forceReloadProfile();
      return true;
    } catch (err) {
      console.error('[Supabase Service] Error al comprar cosmético:', err);
      return false;
    }
  }

  // Equipar un cosmético (reverso de cartas)
  async equipCosmetic(cosmeticId: string): Promise<boolean> {
    const profile = this.userProfileSignal();
    const currentUser = this.currentUserSignal();
    if (!profile || !currentUser) {
      console.error('[Supabase Service] No hay sesión activa para equipar cosméticos.');
      return false;
    }

    try {
      const currentCosmetics = profile.cosmeticos || ['default'];
      if (!currentCosmetics.includes(cosmeticId)) {
        console.error('[Supabase Service] El cosmético no ha sido adquirido.');
        return false;
      }

      const { error } = await this.supabase
        .from('usuarios')
        .update({
          reverso_equipado: cosmeticId
        })
        .eq('id', currentUser.id);

      if (error) throw error;

      await this.forceReloadProfile();
      return true;
    } catch (err) {
      console.error('[Supabase Service] Error al equipar cosmético:', err);
      return false;
    }
  }

  // =========================================================================
  // GESTIÓN DE MAZOS (DECKS)
  // =========================================================================

  // Obtener todos los mazos de un usuario con conteo de cartas integrado y con timeout
  async getDecks(userId: string): Promise<Mazo[]> {
    try {
      const { data, error } = await withTimeout(
        this.supabase
          .from('mazos')
          .select(`
            *,
            mazo_cartas (
              cantidad
            )
          `)
          .eq('usuario_id', userId)
          .order('created_at', { ascending: false }),
        8000,
        'Timeout cargando listado de mazos'
      );

      if (error) {
        console.error('[Supabase Service] Error obteniendo mazos:', error);
        return [];
      }

      return (data || []).map((mazo: any) => {
        const total_cartas = mazo.mazo_cartas?.reduce((acc: number, curr: any) => acc + curr.cantidad, 0) || 0;
        return {
          id: mazo.id,
          usuario_id: mazo.usuario_id,
          nombre: mazo.nombre,
          created_at: mazo.created_at,
          total_cartas
        };
      });
    } catch (err) {
      console.error('[Supabase Service] Catch en getDecks:', err);
      return [];
    }
  }

  // Obtener un mazo específico y todo su listado de cartas cargadas con timeout
  async getDeckWithCards(deckId: string): Promise<{ mazo: Mazo; cards: (Carta & { cantidad: number })[] } | null> {
    try {
      // 1. Obtener detalles del mazo
      const { data: mazo, error: mazoError } = await withTimeout(
        this.supabase
          .from('mazos')
          .select('*')
          .eq('id', deckId)
          .single(),
        8000,
        'Timeout obteniendo detalles del mazo'
      );

      if (mazoError) throw mazoError;

      // 2. Obtener las cartas asociadas haciendo JOIN con la tabla de cartas
      const { data: relations, error: relError } = await withTimeout(
        this.supabase
          .from('mazo_cartas')
          .select(`
            cantidad,
            cartas (*)
          `)
          .eq('mazo_id', deckId),
        8000,
        'Timeout obteniendo relación de cartas del mazo'
      );

      if (relError) throw relError;

      const cards = (relations || [])
        .filter((r: any) => r.cartas)
        .map((r: any) => ({
          ...r.cartas,
          cantidad: r.cantidad
        }));

      return { mazo, cards };
    } catch (err) {
      console.error('[Supabase Service] Error obteniendo mazo con cartas:', err);
      return null;
    }
  }

  // Crear un mazo vacío
  async createDeck(userId: string, nombre: string): Promise<Mazo | null> {
    const { data, error } = await this.supabase
      .from('mazos')
      .insert({ usuario_id: userId, nombre })
      .select()
      .single();

    if (error) {
      console.error('[Supabase Service] Error al crear mazo:', error);
      return null;
    }
    return data;
  }

  // Eliminar un mazo (eliminará en cascada las relaciones en mazo_cartas automáticamente)
  async deleteDeck(deckId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('mazos')
      .delete()
      .eq('id', deckId);

    if (error) {
      console.error('[Supabase Service] Error al eliminar mazo:', error);
      return false;
    }
    return true;
  }

  // Guardar la composición final del mazo mediante operaciones atómicas (elimina todo y reinserta)
  async saveDeckCards(deckId: string, cards: { id: string; cantidad: number }[]): Promise<boolean> {
    try {
      // 1. Eliminar relaciones antiguas para este mazo
      const { error: deleteError } = await this.supabase
        .from('mazo_cartas')
        .delete()
        .eq('mazo_id', deckId);

      if (deleteError) throw deleteError;

      // 2. Si no hay cartas, terminamos con éxito
      if (cards.length === 0) return true;

      // 3. Crear el bloque a insertar
      const rows = cards.map(c => ({
        mazo_id: deckId,
        carta_id: c.id,
        cantidad: c.cantidad
      }));

      // 4. Insertar la nueva composición en un solo batch
      const { error: insertError } = await this.supabase
        .from('mazo_cartas')
        .insert(rows);

      if (insertError) throw insertError;

      return true;
    } catch (err) {
      console.error('[Supabase Service] Error al guardar composición de mazo:', err);
      return false;
    }
  }

  // =========================================================================
  // SISTEMA DE COMBATE (BATTLES) & MULTIPLAYER LOBBY
  // =========================================================================

  // Crear una fila en partidas (estado 'en_progreso') al iniciar la batalla
  async createMatch(userId: string, modo: string = 'vs_ia'): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('partidas')
      .insert({
        jugador1_id: userId,
        jugador2_id: null, // IA / CPU
        estado: 'en_progreso',
        modo: modo
      })
      .select('id')
      .single();

    if (error) {
      console.error('[Supabase Service] Error al crear partida:', error);
      return null;
    }
    return data?.id || null;
  }

  // Actualizar la fila en partidas a 'terminada' definiendo el ganador_id
  async finishMatch(matchId: string, ganadorId: string | null): Promise<boolean> {
    const { error } = await this.supabase
      .from('partidas')
      .update({
        estado: 'terminada',
        ganador_id: ganadorId // Si jugador pierde, pasar NULL (CPU ganó)
      })
      .eq('id', matchId);

    if (error) {
      console.error('[Supabase Service] Error al finalizar partida:', error);
      return false;
    }
    
    // Forzar recarga del perfil del jugador para que actualice wins/losses y XP en sus signals reactivas de inmediato
    const currentUser = this.currentUserSignal();
    if (currentUser) {
      await this.loadUserProfile(currentUser.id);
    }
    
    return true;
  }

  // Obtener partidas multijugador activas que esperan oponente
  async getAvailableMatches(): Promise<any[]> {
    try {
      const { data, error } = await withTimeout(
        this.supabase
          .from('partidas')
          .select(`
            *,
            jugador1:usuarios!jugador1_id(username, victorias)
          `)
          .eq('estado', 'esperando')
          .neq('modo', 'vs_ia'),
        8000,
        'Timeout cargando partidas disponibles'
      );
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[Supabase Service] Error al obtener salas:', err);
      return [];
    }
  }

  // Crear una sala de espera multijugador PvP
  async createMultiplayerMatch(userId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('partidas')
      .insert({
        jugador1_id: userId,
        jugador2_id: null,
        estado: 'esperando',
        modo: 'casual'
      })
      .select('id')
      .single();

    if (error) {
      console.error('[Supabase Service] Error al crear sala multijugador:', error);
      return null;
    }
    return data?.id || null;
  }

  // Unirse a una sala multijugador PvP activa
  async joinMultiplayerMatch(matchId: string, userId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('partidas')
      .update({
        jugador2_id: userId,
        estado: 'en_progreso'
      })
      .eq('id', matchId);

    if (error) {
      console.error('[Supabase Service] Error al unirse a la sala:', error);
      return false;
    }
    return true;
  }

  // Obtener detalles de una partida específica (para PvP o vs IA)
  async getMatchDetails(matchId: string): Promise<any | null> {
    try {
      const { data, error } = await withTimeout(
        this.supabase
          .from('partidas')
          .select(`
            *,
            jugador1:usuarios!jugador1_id(username, victorias),
            jugador2:usuarios!jugador2_id(username, victorias)
          `)
          .eq('id', matchId)
          .single(),
        8000,
        'Timeout obteniendo detalles de partida'
      );
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[Supabase Service] Error obteniendo partida:', err);
      return null;
    }
  }

  // Actualizar el estado de la partida de forma sincronizada y segura (evitando condiciones de carrera)
  async updateMatchGameState(matchId: string, gameState: any): Promise<boolean> {
    try {
      // 1. Obtener el estado de juego más reciente directamente de la base de datos para no pisar cambios del rival
      const { data: latestMatch, error: fetchError } = await this.supabase
        .from('partidas')
        .select('estado_juego')
        .eq('id', matchId)
        .single();
      
      let mergedState: any = {};
      if (!fetchError && latestMatch && latestMatch.estado_juego) {
        mergedState = { ...latestMatch.estado_juego };
      }

      // 2. Mezclar sub-objetos de forma selectiva
      // Mezclar jugador1
      if (gameState.jugador1) {
        mergedState.jugador1 = {
          ...(mergedState.jugador1 || {}),
          ...gameState.jugador1
        };
      }
      // Mezclar jugador2
      if (gameState.jugador2) {
        mergedState.jugador2 = {
          ...(mergedState.jugador2 || {}),
          ...gameState.jugador2
        };
      }

      // Mezclar campos de control generales de primer nivel
      if (gameState.turn !== undefined) mergedState.turn = gameState.turn;
      if (gameState.winnerId !== undefined) mergedState.winnerId = gameState.winnerId;
      if (gameState.state !== undefined) mergedState.state = gameState.state;

      // Sincronizar y combinar logs sin duplicar eventos idénticos consecutivos
      if (gameState.logs && latestMatch?.estado_juego?.logs) {
        const unionLogs = [...latestMatch.estado_juego.logs];
        gameState.logs.forEach((log: string) => {
          if (!unionLogs.includes(log)) {
            unionLogs.push(log);
          }
        });
        mergedState.logs = unionLogs;
      } else if (gameState.logs) {
        mergedState.logs = gameState.logs;
      }

      // 3. Escribir el estado unificado e híbrido en Supabase
      const { error } = await this.supabase
        .from('partidas')
        .update({
          estado_juego: mergedState
        })
        .eq('id', matchId);

      if (error) {
        console.error('[Supabase Service] Error actualizando estado de juego:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[Supabase Service] Catch fatal en updateMatchGameState:', err);
      return false;
    }
  }

  // Cancelar/Eliminar una sala
  async cancelMatch(matchId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('partidas')
      .delete()
      .eq('id', matchId);

    if (error) {
      console.error('[Supabase Service] Error cancelando sala:', error);
      return false;
    }
    return true;
  }

  // Reclamar recompensa de monedas de una misión o logro
  async claimReward(type: 'misiones' | 'logros', itemId: string): Promise<boolean> {
    const profile = this.userProfileSignal();
    const currentUser = this.currentUserSignal();
    if (!profile || !currentUser) return false;

    try {
      let reward = 0;
      let updatedMisiones = profile.misiones ? [...profile.misiones] : [];
      let updatedLogros: { [key: string]: LogroItem } = profile.logros ? { ...profile.logros } : {};

      if (type === 'misiones') {
        const index = updatedMisiones.findIndex(m => m.id === itemId);
        if (index === -1) return false;
        const mision = updatedMisiones[index];
        if (!mision.completado || mision.reclamado) return false;
        
        reward = mision.recompensa;
        updatedMisiones[index] = { ...mision, reclamado: true };
      } else {
        const logro = updatedLogros[itemId];
        if (!logro || !logro.completado || logro.reclamado) return false;
        
        reward = logro.recompensa;
        updatedLogros[itemId] = { ...logro, reclamado: true };
      }

      const newMonedas = (profile.monedas || 0) + reward;

      // Actualizar en Supabase
      const updateData: any = {
        monedas: newMonedas
      };
      if (type === 'misiones') {
        updateData.misiones = updatedMisiones;
      } else {
        updateData.logros = updatedLogros;
      }

      const { error } = await this.supabase
        .from('usuarios')
        .update(updateData)
        .eq('id', currentUser.id);

      if (error) throw error;

      // Actualizar perfil localmente
      await this.loadUserProfile(currentUser.id);
      return true;
    } catch (err) {
      console.error('[Supabase Service] Error al reclamar recompensa:', err);
      return false;
    }
  }

  // Incrementar el progreso de una misión diaria o un logro de vida
  async incrementQuestOrAchievementProgress(type: 'misiones' | 'logros', itemId: string, increment: number): Promise<boolean> {
    const profile = this.userProfileSignal();
    const currentUser = this.currentUserSignal();
    if (!profile || !currentUser) return false;

    try {
      if (type === 'misiones') {
        let misiones = profile.misiones ? [...profile.misiones] : [
          {id: 'completar_duelo', titulo: 'Duelo del Día 🌅', desc: 'Completa una batalla vs IA.', progreso: 0, objetivo: 1, recompensa: 30, completado: false, reclamado: false},
          {id: 'ganar_duelo', titulo: '¡Victoria! 🥇', desc: 'Gana una batalla vs IA o PvP.', progreso: 0, objetivo: 1, recompensa: 50, completado: false, reclamado: false},
          {id: 'usar_habilidad', titulo: 'Alquimista de Habilidades ✨', desc: 'Usa una habilidad especial en batalla 2 veces.', progreso: 0, objetivo: 2, recompensa: 40, completado: false, reclamado: false}
        ];
        
        const index = misiones.findIndex(m => m.id === itemId);
        if (index === -1) return false;
        
        const mision = misiones[index];
        if (mision.completado) return false; // ya completado

        const nuevoProgreso = Math.min(mision.objetivo, mision.progreso + increment);
        const completado = nuevoProgreso >= mision.objetivo;

        misiones[index] = {
          ...mision,
          progreso: nuevoProgreso,
          completado: completado
        };

        const { error } = await this.supabase
          .from('usuarios')
          .update({ misiones })
          .eq('id', currentUser.id);

        if (error) throw error;
      } else {
        let logros: { [key: string]: LogroItem } = profile.logros ? { ...profile.logros } : {
          primer_duelo: {titulo: 'Primer Duelo ⚔️', desc: 'Completa tu primera batalla (vs IA o PvP).', progreso: 0, objetivo: 1, recompensa: 50, completado: false, reclamado: false},
          estratega: {titulo: 'Estratega de la Arena 🏆', desc: 'Gana 5 batallas en total.', progreso: 0, objetivo: 5, recompensa: 150, completado: false, reclamado: false},
          super_efectivo: {titulo: 'Aplastando Rivalidades 💥', desc: 'Inflige un golpe elemental súper efectivo.', progreso: 0, objetivo: 1, recompensa: 80, completado: false, reclamado: false},
          paralizador: {titulo: 'Maestro Paralizador ⚡', desc: 'Paraliza a un oponente 3 veces.', progreso: 0, objetivo: 3, recompensa: 100, completado: false, reclamado: false},
          incendio: {titulo: 'Incendio Forestal 🔥', desc: 'Quema a un oponente 3 veces.', progreso: 0, objetivo: 3, recompensa: 100, completado: false, reclamado: false}
        };

        const logro = logros[itemId];
        if (!logro || logro.completado) return false; // logro inexistente o ya completado

        const nuevoProgreso = Math.min(logro.objetivo, logro.progreso + increment);
        const completado = nuevoProgreso >= logro.objetivo;

        logros[itemId] = {
          ...logro,
          progreso: nuevoProgreso,
          completado: completado
        };

        const { error } = await this.supabase
          .from('usuarios')
          .update({ logros })
          .eq('id', currentUser.id);

        if (error) throw error;
      }

      // Recargar perfil
      await this.loadUserProfile(currentUser.id);
      return true;
    } catch (err) {
      console.error(`[Supabase Service] Error incrementando progreso de ${type}:`, err);
      return false;
    }
  }
}