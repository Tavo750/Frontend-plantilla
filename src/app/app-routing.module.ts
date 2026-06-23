import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LayoutComponent } from './core/components/layout/layout.component';
import { AuthGuard } from './core/guards/auth.guard';

const routes: Routes = [
  { path: '', redirectTo: 'inicio', pathMatch: 'full' },

  // ========== INICIO ==========
  {
    path: 'inicio',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./pages/modules/home/home.routes').then(m => m.HOME_ROUTES)
  },

  {
    path: 'Dashboard',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./pages/modules/dashboard/dashboard.module').then(m => m.DashboardModule)
  },
  {
    path: 'Reportes',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./pages/modules/reportes/reportes.module').then(m => m.ReportesModule)
  },
  {
    path: 'RegistroMaletas',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./pages/modules/registro-maletas/registro-maletas.module').then(m => m.RegistroMaletasModule)
  },
  {
    path: 'PlanificacionRutas',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./pages/modules/planificacion-rutas/planificacion-rutas.module').then(m => m.PlanificacionRutasModule)
  },
  {
    path: 'MonitoreoMapa',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./pages/modules/monitoreo-mapa/monitoreo-mapa.module').then(m => m.MonitoreoMapaModule)
  },
  {
    path: 'Simulacion',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./pages/modules/simulacion/simulacion.module').then(m => m.SimulacionModule)
  },
  {
    path: 'GestionAeropuertos',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./pages/modules/gestion-aeropuertos/gestion-aeropuertos.module').then(m => m.GestionAeropuertosModule)
  },
  {
    path: 'GestionVuelos',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./pages/modules/gestion-vuelos/gestion-vuelos.module').then(m => m.GestionVuelosModule)
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

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
