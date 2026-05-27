import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css'
})
export class NavbarComponent {
  showRulesModal = false;

  constructor(
    public supabaseService: SupabaseService,
    private router: Router
  ) {}

  openRulesModal() {
    this.showRulesModal = true;
  }

  closeRulesModal() {
    this.showRulesModal = false;
  }

  // Obtener perfil actual reactivamente desde la señal
  get profile() {
    return this.supabaseService.userProfileSignal();
  }

  // XP acumulada para el nivel actual (0 - 99)
  get currentXpProgress() {
    const profile = this.profile;
    if (!profile || profile.total_xp === undefined) return 0;
    return profile.total_xp % 100;
  }

  // Cerrar sesión
  async logout() {
    try {
      await this.supabaseService.signOut();
      this.router.navigate(['/login']);
    } catch (err) {
      console.error('[Navbar Component] Error al cerrar sesión:', err);
    }
  }
}
