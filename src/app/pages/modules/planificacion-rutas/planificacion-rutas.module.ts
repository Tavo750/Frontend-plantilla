import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { PlanificacionRutasRoutingModule } from './planificacion-rutas-routing.module';
import { RutasComponent } from './components/rutas/rutas.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    PlanificacionRutasRoutingModule,
    RutasComponent
  ]
})
export class PlanificacionRutasModule {}