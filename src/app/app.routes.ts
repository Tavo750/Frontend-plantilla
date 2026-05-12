import { Routes } from '@angular/router';
import { LayoutComponent } from './core/components/layout/layout.component';
import { AuthGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'inicio', pathMatch: 'full' },

  // ========== INICIO ==========
  {
    path: 'inicio',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./pages/modules/home/home.routes').then(m => m.HOME_ROUTES)
  },

  // ========== RUTAS PÚBLICAS ==========
  {
    path: 'error',
    loadChildren: () =>
      import('./pages/full-pages/error/error.routes').then(m => m.ERROR_ROUTES)
  },

  // Ruta comodín para páginas no encontradas
  {
    path: '**',
    redirectTo: 'error'
  }
];
