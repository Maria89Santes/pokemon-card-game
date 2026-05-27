import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginComponent {
  email = '';
  password = '';
  loading = false;
  errorMessage = '';

  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  async onSubmit() {
    if (!this.email || !this.password) {
      this.errorMessage = 'Por favor, ingresa tu correo y contraseña.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    try {
      await this.supabaseService.signIn(this.email, this.password);
      this.router.navigate(['/dashboard']);
    } catch (err: any) {
      console.error('[Login Component] Error iniciando sesión:', err);
      // Proveer mensajes legibles según el error de Supabase
      if (err.message?.includes('Invalid login credentials')) {
        this.errorMessage = 'Credenciales inválidas. Verifica tu correo y contraseña.';
      } else {
        this.errorMessage = err.message || 'Error al iniciar sesión. Revisa tu red.';
      }
    } finally {
      this.loading = false;
    }
  }
}
