import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';

import { PlanificacionRutasRoutingModule } from './planificacion-rutas-routing.module';
import { RutasComponent } from './components/rutas/rutas.component';
import { PrimeNgModule } from '../../../prime-ng/prime-ng.module';

@NgModule({
  declarations: [RutasComponent],
  imports: [
    CommonModule,
    PlanificacionRutasRoutingModule,
    PrimeNgModule
  ],
  providers: [MessageService]
})
export class PlanificacionRutasModule {}
