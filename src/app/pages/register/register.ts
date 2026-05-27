import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './register.html',
  styleUrl: './register.css'
})
export class RegisterComponent {
  username = '';
  email = '';
  password = '';
  loading = false;
  successMessage = '';
  errorMessage = '';

  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  async onSubmit() {
    if (!this.username || !this.email || !this.password) {
      this.errorMessage = 'Por favor, rellena todos los campos.';
      return;
    }

    if (this.password.length < 6) {
      this.errorMessage = 'La contraseña debe tener al menos 6 caracteres.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      const response = await this.supabaseService.signUp(this.email, this.password, this.username);
      
      // Si la sesión ya se inició automáticamente al registrarse (configuración por defecto de Supabase)
      if (response?.session) {
        this.successMessage = '¡Registro completado! Redirigiendo al Dashboard...';
        setTimeout(() => this.router.navigate(['/dashboard']), 1200);
      } else {
        this.successMessage = '¡Entrenador creado con éxito! Ya puedes iniciar sesión.';
        this.username = '';
        this.email = '';
        this.password = '';
      }
    } catch (err: any) {
      console.error('[Register Component] Error registrando:', err);
      // Controlar errores habituales de duplicación de Supabase
      if (err.message?.includes('User already registered')) {
        this.errorMessage = 'Este correo electrónico ya está registrado.';
      } else {
        this.errorMessage = err.message || 'Error al completar el registro. Inténtalo de nuevo.';
      }
    } finally {
      this.loading = false;
    }
  }
}
