import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { RutasComponent } from './components/rutas/rutas.component';

const routes: Routes = [
  {
    path: '',
    component: RutasComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PlanificacionRutasRoutingModule {}