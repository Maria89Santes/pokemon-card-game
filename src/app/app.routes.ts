import { Routes } from '@angular/router';
import { authGuard, alreadyAuthGuard } from './guards/auth.guard';

export const routes: Routes = [
  { 
    path: 'login', 
    loadComponent: () => import('./pages/login/login').then(m => m.LoginComponent),
    canActivate: [alreadyAuthGuard] 
  },
  { 
    path: 'register', 
    loadComponent: () => import('./pages/register/register').then(m => m.RegisterComponent),
    canActivate: [alreadyAuthGuard]
  },
  { 
    path: 'dashboard', 
    loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.DashboardComponent),
    canActivate: [authGuard]
  },
  {
    path: 'lobby',
    loadComponent: () => import('./pages/lobby/lobby').then(m => m.LobbyComponent),
    canActivate: [authGuard]
  },
  {
    path: 'shop',
    loadComponent: () => import('./pages/shop/shop').then(m => m.ShopComponent),
    canActivate: [authGuard]
  },
  {
    path: 'decks',
    loadComponent: () => import('./pages/decks/decks').then(m => m.DecksComponent),
    canActivate: [authGuard]
  },
  {
    path: 'decks/build/:id',
    loadComponent: () => import('./pages/deck-builder/deck-builder').then(m => m.DeckBuilderComponent),
    canActivate: [authGuard]
  },
  {
    path: 'battle/:deckId',
    loadComponent: () => import('./pages/battle/battle').then(m => m.BattleComponent),
    canActivate: [authGuard]
  },
  {
    path: 'history',
    loadComponent: () => import('./pages/history/history').then(m => m.HistoryComponent),
    canActivate: [authGuard]
  },
  {
    path: 'help',
    loadComponent: () => import('./pages/help/help').then(m => m.HelpComponent),
    canActivate: [authGuard]
  },
  { 
    path: '', 
    redirectTo: 'dashboard', 
    pathMatch: 'full' 
  },
  { 
    path: '**', 
    redirectTo: 'dashboard' 
  }
];

