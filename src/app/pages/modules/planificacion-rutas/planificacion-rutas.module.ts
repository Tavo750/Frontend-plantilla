import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PlanificacionRutasRoutingModule } from './planificacion-rutas-routing.module';
import { RutasComponent } from './components/rutas/rutas.component';

@NgModule({
  declarations: [
    RutasComponent
  ],
  imports: [
    CommonModule, 
    PlanificacionRutasRoutingModule],
})
export class PlanificacionRutasModule {}
