import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MapaComponent } from './components/mapa/mapa.component';
import { OperacionDiariaComponent } from './components/operacion-diaria/operacion-diaria.component';

const routes: Routes = [
  // Operación diaria (nueva, estilo Simulación, en vivo) — visible en el menú
  { path: '', component: OperacionDiariaComponent },
  // Versión anterior del mapa — enrutada pero fuera del menú (fallback)
  { path: 'legacy', component: MapaComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MonitoreoMapaRoutingModule {}
