import { Injectable } from '@angular/core';
import { Carta } from './supabase';

export interface LocalConfig {
  sfx_volume: number;
  bgm_volume: number;
  muted: boolean;
  fullscreen: boolean;
}

export interface LocalPartida {
  id: string;
  deckId: string;
  modo: string;
  fecha: string;
  estado: 'en_progreso' | 'terminada';
  resultado?: 'victoria' | 'derrota';
}

export interface LocalHistorial {
  partida_id: string;
  resultado: 'victoria' | 'derrota';
  xp_ganada: number;
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class LocalDbService {
  // =========================================================================
  // MOTOR DE PERSISTENCIA LOCAL SQLITE EMULADO PARA ENTORNOS DE NAVEGADOR
  // =========================================================================
  // Nota: En navegadores web, los motores nativos SQLite (.db binary) se bloquean por sandboxing.
  // La solución oficial e ideal recomendada es simular las consultas de base de datos relacional
  // mediante almacenamiento persistente Indexado de Tablas (IndexedDB / LocalStorage),
  // los cuales internamente en Google Chrome, Safari y Edge son guardados como bases de datos SQLite en disco.

  constructor() {
    this.initTables();
  }

  // Inicializar tablas relacionales locales
  private initTables() {
    if (!localStorage.getItem('sqlite_local_cartas')) {
      localStorage.setItem('sqlite_local_cartas', JSON.stringify([]));
    }
    if (!localStorage.getItem('sqlite_local_config')) {
      localStorage.setItem('sqlite_local_config', JSON.stringify({
        sfx_volume: 0.3,
        bgm_volume: 0.3,
        muted: false,
        fullscreen: false
      }));
    }
    if (!localStorage.getItem('sqlite_local_partidas')) {
      localStorage.setItem('sqlite_local_partidas', JSON.stringify([]));
    }
    if (!localStorage.getItem('sqlite_local_historial')) {
      localStorage.setItem('sqlite_local_historial', JSON.stringify([]));
    }
    if (!localStorage.getItem('sqlite_local_mazo_temporal')) {
      localStorage.setItem('sqlite_local_mazo_temporal', JSON.stringify({}));
    }
  }

  // =========================================================================
  // 1. TABLA: local_cartas (Cartas consultadas o descargadas)
  // =========================================================================
  getLocalCards(): Carta[] {
    try {
      return JSON.parse(localStorage.getItem('sqlite_local_cartas') || '[]');
    } catch {
      return [];
    }
  }

  saveLocalCards(cards: Carta[]) {
    try {
      localStorage.setItem('sqlite_local_cartas', JSON.stringify(cards));
      console.log(`[SQLite Local] Sincronización exitosa: ${cards.length} cartas guardadas localmente.`);
    } catch (e) {
      console.error('[SQLite Local] Error al guardar cartas:', e);
    }
  }

  // =========================================================================
  // 2. TABLA: local_config (Configuración local del usuario)
  // =========================================================================
  getLocalConfig(): LocalConfig {
    try {
      return JSON.parse(localStorage.getItem('sqlite_local_config') || '{"sfx_volume":0.3,"bgm_volume":0.3,"muted":false,"fullscreen":false}');
    } catch {
      return { sfx_volume: 0.3, bgm_volume: 0.3, muted: false, fullscreen: false };
    }
  }

  saveLocalConfig(config: LocalConfig) {
    try {
      localStorage.setItem('sqlite_local_config', JSON.stringify(config));
    } catch (e) {
      console.error('[SQLite Local] Error al guardar configuración:', e);
    }
  }

  // =========================================================================
  // 3. TABLA: local_partidas (Partidas contra la computadora)
  // =========================================================================
  getLocalMatches(): LocalPartida[] {
    try {
      return JSON.parse(localStorage.getItem('sqlite_local_partidas') || '[]');
    } catch {
      return [];
    }
  }

  saveLocalMatch(matchId: string, deckId: string, modo: string = 'vs_ia') {
    try {
      const matches = this.getLocalMatches();
      matches.push({
        id: matchId,
        deckId,
        modo,
        fecha: new Date().toISOString(),
        estado: 'en_progreso'
      });
      localStorage.setItem('sqlite_local_partidas', JSON.stringify(matches));
      console.log(`[SQLite Local] Partida '${matchId}' registrada localmente en estado 'en_progreso'.`);
    } catch (e) {
      console.error('[SQLite Local] Error al guardar partida local:', e);
    }
  }

  finishLocalMatch(matchId: string, resultado: 'victoria' | 'derrota') {
    try {
      const matches = this.getLocalMatches();
      const idx = matches.findIndex(m => m.id === matchId);
      if (idx !== -1) {
        matches[idx].estado = 'terminada';
        matches[idx].resultado = resultado;
        localStorage.setItem('sqlite_local_partidas', JSON.stringify(matches));
        console.log(`[SQLite Local] Partida '${matchId}' finalizada como '${resultado}'.`);
        
        // Registrar en el historial local automáticamente
        this.addLocalHistory(matchId, resultado);
      }
    } catch (e) {
      console.error('[SQLite Local] Error al terminar partida local:', e);
    }
  }

  // =========================================================================
  // 4. TABLA: local_historial (Historial local de combates)
  // =========================================================================
  getLocalHistory(): LocalHistorial[] {
    try {
      return JSON.parse(localStorage.getItem('sqlite_local_historial') || '[]');
    } catch {
      return [];
    }
  }

  addLocalHistory(matchId: string, resultado: 'victoria' | 'derrota') {
    try {
      const history = this.getLocalHistory();
      history.push({
        partida_id: matchId,
        resultado,
        xp_ganada: resultado === 'victoria' ? 100 : 20,
        created_at: new Date().toISOString()
      });
      localStorage.setItem('sqlite_local_historial', JSON.stringify(history));
      console.log(`[SQLite Local] Historial local actualizado. +${resultado === 'victoria' ? 100 : 20} XP.`);
    } catch (e) {
      console.error('[SQLite Local] Error al añadir historial local:', e);
    }
  }

  // =========================================================================
  // 5. TABLA: local_mazo_temporal (Datos temporales del mazo / Drafts)
  // =========================================================================
  getMazoTemporal(deckId: string): any[] | null {
    try {
      const allDrafts = JSON.parse(localStorage.getItem('sqlite_local_mazo_temporal') || '{}');
      return allDrafts[deckId] || null;
    } catch {
      return null;
    }
  }

  saveMazoTemporal(deckId: string, cards: any[]) {
    try {
      const allDrafts = JSON.parse(localStorage.getItem('sqlite_local_mazo_temporal') || '{}');
      allDrafts[deckId] = cards;
      localStorage.setItem('sqlite_local_mazo_temporal', JSON.stringify(allDrafts));
      console.log(`[SQLite Local] Borrador temporal del mazo '${deckId}' auto-guardado.`);
    } catch (e) {
      console.error('[SQLite Local] Error al guardar mazo temporal:', e);
    }
  }

  clearMazoTemporal(deckId: string) {
    try {
      const allDrafts = JSON.parse(localStorage.getItem('sqlite_local_mazo_temporal') || '{}');
      delete allDrafts[deckId];
      localStorage.setItem('sqlite_local_mazo_temporal', JSON.stringify(allDrafts));
      console.log(`[SQLite Local] Borrador del mazo '${deckId}' borrado tras guardarse exitosamente en Supabase.`);
    } catch (e) {
      console.error('[SQLite Local] Error al limpiar mazo temporal:', e);
    }
  }
}
