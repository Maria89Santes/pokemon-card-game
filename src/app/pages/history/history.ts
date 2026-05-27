import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase';
import { LocalDbService } from '../../services/local-db';
import { NavbarComponent } from '../../components/navbar/navbar';

interface BattleRecord {
  id: string;
  fecha: string;
  modo: 'vs_ia' | 'pvp' | string;
  resultado: 'victoria' | 'derrota' | 'pendiente';
  rival: string;
  isLocal: boolean;
}

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, RouterModule, NavbarComponent],
  templateUrl: './history.html',
  styleUrl: './history.css'
})
export class HistoryComponent implements OnInit {
  battles: BattleRecord[] = [];
  loading = true;
  currentPage = 0;
  pageSize = 15;

  constructor(
    public supabaseService: SupabaseService,
    private localDbService: LocalDbService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.loadHistory();
  }

  get profile() {
    return this.supabaseService.userProfileSignal();
  }

  get totalWins(): number {
    return this.battles.filter(b => b.resultado === 'victoria').length;
  }

  get totalLosses(): number {
    return this.battles.filter(b => b.resultado === 'derrota').length;
  }

  get winrate(): number {
    if (this.battles.length === 0) return 0;
    return Math.round((this.totalWins / this.battles.length) * 100);
  }

  get vsIaCount(): number {
    return this.battles.filter(b => b.modo === 'vs_ia').length;
  }

  get pvpCount(): number {
    return this.battles.filter(b => b.modo !== 'vs_ia').length;
  }

  get pagedBattles(): BattleRecord[] {
    const start = this.currentPage * this.pageSize;
    return this.battles.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.battles.length / this.pageSize);
  }

  nextPage() {
    if (this.currentPage < this.totalPages - 1) this.currentPage++;
  }

  prevPage() {
    if (this.currentPage > 0) this.currentPage--;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-MX', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  getModeLabel(modo: string): string {
    return modo === 'vs_ia' ? '🤖 vs IA' : '👤 PvP';
  }

  goToBattle() {
    this.router.navigate(['/decks']);
  }

  async loadHistory() {
    this.loading = true;
    const profile = this.profile;
    if (!profile) {
      this.loading = false;
      return;
    }

    let combined: BattleRecord[] = [];

    // 1. Cargar desde Supabase
    try {
      const { data } = await this.supabaseService.supabase
        .from('partidas')
        .select('*')
        .or(`jugador1_id.eq.${profile.id},jugador2_id.eq.${profile.id}`)
        .order('created_at', { ascending: false })
        .limit(100);

      if (data) {
        const mapped: BattleRecord[] = data.map((b: any) => ({
          id: b.id,
          fecha: b.created_at,
          modo: b.modo || 'vs_ia',
          resultado: this.resolveResult(b, profile.id),
          rival: b.modo === 'vs_ia' ? 'CPU 🤖' : (b.jugador1_id === profile.id ? b.jugador2_username || 'Rival' : b.jugador1_username || 'Rival'),
          isLocal: false
        }));
        combined = [...combined, ...mapped];
      }
    } catch (e) {
      console.warn('[History] Supabase no disponible, usando solo local:', e);
    }

    // 2. Mezclar con SQLite local
    try {
      const localMatches = this.localDbService.getLocalMatches();
      const localMapped: BattleRecord[] = localMatches.map((m: any) => ({
        id: m.id,
        fecha: m.fecha,
        modo: m.modo || 'vs_ia',
        resultado: m.resultado === 'victoria' ? 'victoria' : m.resultado === 'derrota' ? 'derrota' : 'pendiente',
        rival: 'CPU 🤖',
        isLocal: true
      }));

      // Evitar duplicados por id
      const remoteIds = new Set(combined.map(b => b.id));
      const uniqueLocal = localMapped.filter(l => !remoteIds.has(l.id));
      combined = [...combined, ...uniqueLocal];
    } catch (e) {
      console.warn('[History] Error leyendo SQLite local:', e);
    }

    // Ordenar por fecha desc
    combined.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    this.battles = combined;
    this.loading = false;
    this.cdr.detectChanges();
  }

  private resolveResult(battle: any, userId: string): 'victoria' | 'derrota' | 'pendiente' {
    if (!battle.ganador_id) return 'pendiente';
    return battle.ganador_id === userId ? 'victoria' : 'derrota';
  }
}
