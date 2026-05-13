import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MapaComponent } from './components/mapa/mapa.component';

const routes: Routes = [
  { path: '', component: MapaComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MonitoreoMapaRoutingModule {}
