import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../services/supabase';

// Protege rutas para que solo ingresen usuarios autenticados (ej: /dashboard)
export const authGuard = async () => {
  const supabaseService = inject(SupabaseService);
  const router = inject(Router);

  // Esperar a que la inicialización de Supabase termine en segundo plano con timeout
  await supabaseService.waitForInitialization();

  if (supabaseService.currentUserSignal()) {
    return true;
  }

  console.warn('[Auth Guard] Intento de acceso no autorizado. Redirigiendo a /login...');
  router.navigate(['/login']);
  return false;
};

// Evita que usuarios ya autenticados ingresen a login o registro (ej: /login -> /dashboard)
export const alreadyAuthGuard = async () => {
  const supabaseService = inject(SupabaseService);
  const router = inject(Router);

  // Esperar a que la inicialización de Supabase termine en segundo plano con timeout
  await supabaseService.waitForInitialization();

  if (supabaseService.currentUserSignal()) {
    console.log('[Already Auth Guard] Usuario ya logueado. Redirigiendo a /dashboard...');
    router.navigate(['/dashboard']);
    return false;
  }

  return true;
};
